import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Trophy, AlertCircle, Trash2, Clock } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, getAgeCategory, getWeightCategory, getPoomsaeByBelt, getFightRules, getFightRounds } from '../../utils';
import { User } from 'firebase/auth';
import { Registration, Athlete, Academy, UserProfile, OperationType } from '../../types';
import { Button, Card, cn } from '../ui';
import { BeltBadge } from '../BeltBadge';

export function CompetitionView({ registrations, athletes, academies, user, profile }: { registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; user: User | null; profile: UserProfile | null }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Kyorugui');
  
  const groupedAthletes = useMemo(() => {
    const initialGroups: Record<string, any[]> = {};
    
    registrations.filter(r => r.status === 'Confirmado').forEach(reg => {
      const athlete = athletes.find(a => a.id === reg.athleteId);
      if (!athlete) return;
      
      const isKyopaTab = selectedCategory === 'Kyopa';
      const categoriesInTab = reg.categories.filter(c => 
        isKyopaTab ? c.includes('Kyopa') : c === selectedCategory
      );

      if (categoriesInTab.length === 0) return;
      
      const ageCat = getAgeCategory(athlete.birthYear, athlete.belt);
      const weightCat = getWeightCategory(ageCat, athlete.gender, athlete.weight, athlete.belt);
      const b = athlete.belt.toLowerCase();
      const beltType = (b.includes('dan') || reg.isElite)
        ? 'Preta' 
        : (b.includes('branca') || b.includes('10º gub'))
          ? 'Branca' 
          : (b.includes('azul escuro') || b.includes('vermelha') || b.includes('3º gub') || b.includes('2º gub') || b.includes('1º gub'))
            ? 'Graduada'
            : 'Colorida';
      const genderStr = athlete.gender === 'M' ? 'Masculino' : 'Feminino';
      
      categoriesInTab.forEach(catItem => {
        let groupKey = '';
        if (reg.assignedCategory) {
          groupKey = reg.assignedCategory;
        } else if (isKyopaTab) {
          groupKey = `${catItem} - ${genderStr}`;
        } else if (selectedCategory === 'Kyorugui') {
          groupKey = `${ageCat} | ${beltType} | ${genderStr} | ${weightCat}`;
        } else {
          groupKey = `${ageCat} | ${beltType} | ${genderStr}`;
        }
        
        if (!initialGroups[groupKey]) initialGroups[groupKey] = [];
        if (!initialGroups[groupKey].find(a => a.id === athlete.id)) {
          const result = reg.results?.find(r => r.groupKey === groupKey);
          initialGroups[groupKey].push({
            ...athlete,
            regId: reg.id,
            ageCat,
            isLocked: reg.status === 'Confirmado',
            isElite: reg.isElite,
            isMatched: reg.isMatched,
            assignedCategory: reg.assignedCategory,
            academy: academies.find(a => a.id === athlete.academyId)?.name || 'Desconhecida',
            place: result?.place,
            score: result?.score,
            points: result?.points,
            bracketPosition: result?.bracketPosition
          });
        }
      });
    });

    const finalGroups: Record<string, any[]> = {};
    Object.entries(initialGroups).forEach(([key, groupAthletes]) => {
      if (selectedCategory === 'Poomsae' && groupAthletes.length > 4) {
        // Subdivide em grupos de 4
        for (let i = 0; i < groupAthletes.length; i += 4) {
          const chunk = groupAthletes.slice(i, i + 4);
          const groupNum = Math.floor(i / 4) + 1;
          finalGroups[`${key} - G${groupNum}`] = chunk;
        }
      } else {
        finalGroups[key] = groupAthletes;
      }
    });

    if (profile?.role !== 'admin') {
      const filteredGroups: Record<string, any[]> = {};
      Object.entries(finalGroups).forEach(([key, groupAthletes]) => {
        if (groupAthletes.some(a => a.academyId === profile?.academyId)) {
          filteredGroups[key] = groupAthletes;
        }
      });
      return filteredGroups;
    }
    
    return finalGroups;
  }, [registrations, athletes, academies, selectedCategory, profile]);

  const handleManualMatch = async (regId: string, targetCategory: string) => {
    try {
      await updateDoc(doc(db, 'registrations', regId), {
        assignedCategory: targetCategory,
        isMatched: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  const handleResetMatch = async (regId: string) => {
    try {
      await updateDoc(doc(db, 'registrations', regId), {
        assignedCategory: null,
        isMatched: false
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  const handleDrawGroup = async (groupKey: string, groupAthletes: any[]) => {
    try {
      const confirmedRegs = registrations.filter(r => 
        r.status === 'Confirmado' && 
        groupAthletes.some(a => a.regId === r.id)
      );
      
      const shuffled = [...confirmedRegs].sort(() => Math.random() - 0.5);
      
      for (let i = 0; i < shuffled.length; i++) {
        const reg = shuffled[i];
        let newResults = [...(reg.results || [])];
        let resIdx = newResults.findIndex(r => r.groupKey === groupKey);
        
        const bracketPosition = i + 1;
        
        if (resIdx >= 0) {
          newResults[resIdx] = { ...newResults[resIdx], bracketPosition };
        } else {
          newResults.push({ groupKey, place: null, bracketPosition });
        }
        
        await updateDoc(doc(db, 'registrations', reg.id), { results: newResults });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  const handleResetDraw = async (groupKey: string, groupAthletes: any[]) => {
    try {
      const confirmedRegs = registrations.filter(r => 
        r.status === 'Confirmado' && 
        groupAthletes.some(a => a.regId === r.id)
      );
      
      for (const reg of confirmedRegs) {
        let newResults = (reg.results || []).map(r => {
          if (r.groupKey === groupKey) {
            const { bracketPosition, ...rest } = r;
            return rest;
          }
          return r;
        });
        await updateDoc(doc(db, 'registrations', reg.id), { results: newResults });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  const handleUpdateScores = async (groupKey: string, athleteRegId: string, field: 'score' | 'points' | 'place', value: any) => {
    try {
      const reg = registrations.find(r => r.id === athleteRegId);
      if (!reg) return;

      let newResults = [...(reg.results || [])];
      let resIdx = newResults.findIndex(r => r.groupKey === groupKey);
      
      if (resIdx >= 0) {
        newResults[resIdx] = { ...newResults[resIdx], [field]: value };
      } else {
        newResults.push({ groupKey, place: null, [field]: value });
      }

      if ((field === 'score' || field === 'points') && profile?.role === 'admin') {
        const currentGroup = groupedAthletes[groupKey];
        if (currentGroup) {
          const updatedAthletes = currentGroup.map(a => {
            if (a.regId === athleteRegId) return { ...a, [field]: value };
            return a;
          });

          // Ordenar decrescente
          const sorted = [...updatedAthletes].sort((a, b) => {
            const valA = (field === 'score' ? a.score : a.points) || 0;
            const valB = (field === 'score' ? b.score : b.points) || 0;
            return (Number(valB) || 0) - (Number(valA) || 0);
          });

          // Atribuir lugares automaticamente onde não houver empate
          for (let i = 0; i < sorted.length; i++) {
            const currentVal = (field === 'score' ? sorted[i].score : sorted[i].points) || 0;
            const prevVal = i > 0 ? (field === 'score' ? sorted[i-1].score : sorted[i-1].points) || 0 : null;
            const nextVal = i < sorted.length - 1 ? (field === 'score' ? sorted[i+1].score : sorted[i+1].points) || 0 : null;
            
            // Empate apenas se ambos tiverem pontuação > 0
            const isTied = currentVal > 0 && (currentVal === prevVal || currentVal === nextVal);
            
            let place: any = null;
            
            // Só classifica se tiver pontuação > 0 OU se for atleta Único (W.O.)
            if (currentVal > 0 || sorted.length === 1) {
              if (i === 0) place = 1;
              else if (i === 1) place = 2;
              else if (i === 2) place = 3;
            }
            
            // Se houver empate técnico, mantém a escolha manual do admin (se existir)
            if (isTied) {
              const currentAthleteInLoop = updatedAthletes.find(a => a.regId === sorted[i].regId);
              place = currentAthleteInLoop?.place || null;
            }

            const targetReg = registrations.find(r => r.id === sorted[i].regId);
            if (targetReg) {
              let targetResults = [...(targetReg.results || [])];
              let tIdx = targetResults.findIndex(r => r.groupKey === groupKey);
              const athleteVal = (field === 'score' ? sorted[i].score : sorted[i].points);
              
              const resultData = { groupKey, place, [field]: athleteVal };
              if (tIdx >= 0) {
                targetResults[tIdx] = { ...targetResults[tIdx], ...resultData };
              } else {
                targetResults.push(resultData as any);
              }
              await updateDoc(doc(db, 'registrations', sorted[i].regId), { results: targetResults });
            }
          }
          return;
        }
      }

      await updateDoc(doc(db, 'registrations', athleteRegId), { results: newResults });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Chaves de Luta</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Visualização por categorias confirmadas</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 overflow-x-auto">
          {['Kyorugui', 'Poomsae', 'Kyopa'].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                selectedCategory === cat 
                  ? "bg-red-600 text-white shadow-lg" 
                  : "text-stone-500 hover:text-white"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {Object.keys(groupedAthletes).length === 0 ? (
        <Card className="py-32 text-center border-white/5 bg-white/[0.02]">
          <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/5 group">
            <Trophy className="w-10 h-10 text-stone-700 group-hover:text-red-600 group-hover:scale-110 transition-all" />
          </div>
          <p className="text-[10px] text-stone-600 font-black uppercase tracking-[0.2em]">Nenhum atleta confirmado nesta categoria</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {Object.entries(groupedAthletes).map(([key, groupAthletes]) => {
            // Extrair dados de rounds e regras para o grupo (baseado no 1º atleta)
            const firstAthlete = groupAthletes[0];
            const rounds = selectedCategory === 'Kyorugui' ? getFightRounds(firstAthlete?.ageCat || '') : null;
            const poomsaeName = selectedCategory === 'Poomsae' && firstAthlete ? getPoomsaeByBelt(firstAthlete.belt, firstAthlete.isElite) : null;

            return (
              <Card key={key} className="p-0 border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
                {/* Header da chave */}
                <div className="bg-white/5 px-6 py-4 border-b border-white/5 flex justify-between items-center">
                  <div>
                    <div className="flex justify-between items-start gap-3">
                      <span className="text-[10px] font-black text-red-500 uppercase tracking-widest leading-tight">{key}</span>
                      <span className="shrink-0 px-2 py-0.5 bg-red-600 rounded text-[9px] font-black text-white uppercase">{groupAthletes.length} Atletas</span>
                    </div>
                    {/* Tempo de luta (Kyorugui) */}
                    {rounds && (
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="w-3 h-3 text-stone-500" />
                        <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">
                          {rounds.rounds} rounds × {rounds.duration} • intervalo {rounds.interval}
                        </span>
                      </div>
                    )}
                    {/* Poomsae por faixa */}
                    {poomsaeName && (
                      <div className="mt-2 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg inline-flex">
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">📋 {poomsaeName}</span>
                      </div>
                    )}
                  </div>
                  
                  {profile?.role === 'admin' && selectedCategory === 'Kyorugui' && groupAthletes.length > 1 && (
                    <div className="flex gap-2">
                      {!groupAthletes[0].bracketPosition ? (
                        <Button 
                          className="bg-amber-600 hover:bg-amber-700 text-[9px] h-7 px-3"
                          onClick={() => handleDrawGroup(key, groupAthletes)}
                        >
                          Realizar Sorteio
                        </Button>
                      ) : (
                        <Button 
                          variant="ghost"
                          className="text-stone-500 hover:text-white text-[9px] h-7 px-3"
                          onClick={() => handleResetDraw(key, groupAthletes)}
                        >
                          Refazer Sorteio
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-6 space-y-4">
                  {/* Visualização de Chaveamento para Kyorugui Sorteado */}
                  {selectedCategory === 'Kyorugui' && groupAthletes[0]?.bracketPosition ? (
                    <div className="space-y-6">
                      {/* Agrupar em pares */}
                      {(() => {
                        const sorted = [...groupAthletes].sort((a, b) => (a.bracketPosition || 0) - (b.bracketPosition || 0));
                        const matches = [];
                        for (let i = 0; i < sorted.length; i += 2) {
                          matches.push([sorted[i], sorted[i+1]]);
                        }
                        
                        return matches.map((match, mIdx) => (
                          <div key={mIdx} className="relative">
                            <div className="absolute -left-3 top-0 bottom-0 w-px bg-white/10" />
                            <p className="text-[8px] font-black text-stone-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                              {sorted.length > 2 ? `Confronto ${mIdx + 1}` : 'Grande Final'}
                            </p>
                            <div className="space-y-3">
                              {match.map((matchAthlete, aIdx) => matchAthlete && (
                                <div key={matchAthlete.id || `bye-${aIdx}`} className="flex justify-between items-center p-3 bg-white/[0.02] border border-white/5 rounded-xl group/match">
                                  <div className="flex items-center gap-4">
                                    <div className={cn(
                                      "w-6 h-6 rounded flex items-center justify-center text-[10px] font-black text-white",
                                      aIdx === 0 ? "bg-blue-600" : "bg-red-600"
                                    )}>
                                      {aIdx === 0 ? 'A' : 'B'}
                                    </div>
                                    <div>
                                      <p className="font-black text-white uppercase tracking-tight text-xs">{matchAthlete.name}</p>
                                      <p className="text-[8px] text-stone-500 font-bold uppercase tracking-widest mt-0.5">{matchAthlete.academy}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {profile?.role === 'admin' && (
                                      <input 
                                        type="number"
                                        placeholder="Pts"
                                        className="w-12 bg-black/40 border border-white/10 rounded-lg text-[10px] font-black text-center text-white p-1 outline-none focus:border-red-500/50"
                                        value={matchAthlete.points || ''}
                                        onChange={(e) => handleUpdateScores(key, matchAthlete.regId, 'points', parseInt(e.target.value))}
                                      />
                                    )}
                                    <select 
                                      className={cn(
                                        "bg-black/40 border border-white/10 rounded-lg text-[10px] font-black uppercase px-2 py-1 outline-none",
                                        matchAthlete.place ? "text-amber-500 border-amber-500/50" : "text-stone-500"
                                      )}
                                      value={matchAthlete.place || ''}
                                      onChange={(e) => handleUpdateScores(key, matchAthlete.regId, 'place', parseInt(e.target.value) || null)}
                                      disabled={profile?.role !== 'admin'}
                                    >
                                      <option value="">Pos...</option>
                                      <option value="1">1º</option>
                                      <option value="2">2º</option>
                                      <option value="3">3º</option>
                                    </select>
                                  </div>
                                </div>
                              ))}
                              {!match[1] && (
                                <div className="p-3 border border-dashed border-white/5 rounded-xl text-center">
                                  <p className="text-[8px] font-black text-stone-600 uppercase tracking-widest">Avança por Bye (Sorteio)</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  ) : (
                    groupAthletes.map((athlete, idx) => {
                      const fightRules = selectedCategory === 'Kyorugui' ? getFightRules(athlete.belt, athlete.isElite) : null;

                      return (
                        <div key={athlete.id} className="flex justify-between items-center group/item">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-lg bg-stone-900 border border-white/5 flex items-center justify-center text-[10px] font-black text-white">
                              {idx + 1}
                            </div>
                            <div>
                              <p className="font-black text-white uppercase tracking-tight text-sm">{athlete.name}</p>
                              <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mt-0.5 italic">{athlete.academy}</p>
                              {/* Regras de contato */}
                              {fightRules && (
                                <span className={cn("text-[8px] font-black uppercase tracking-widest", fightRules.color)}>
                                  ⚡ {fightRules.label}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <BeltBadge belt={athlete.belt} size="sm" />
                              <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mt-1.5">{athlete.weight}kg</p>
                            </div>
                            {profile?.role === 'admin' && (
                              <div className="flex flex-col items-end gap-2">
                                <div className="flex items-center gap-2">
                                  {selectedCategory === 'Kyorugui' ? (
                                    <input 
                                      type="number"
                                      placeholder="Pts"
                                      className="w-16 bg-black/40 border border-white/10 rounded-lg text-xs font-black text-center text-white p-1 outline-none focus:border-red-500/50"
                                      value={athlete.points || ''}
                                      onChange={(e) => handleUpdateScores(key, athlete.regId, 'points', parseInt(e.target.value))}
                                    />
                                  ) : (
                                    <input 
                                      type="number"
                                      step="0.01"
                                      placeholder="Nota"
                                      className="w-16 bg-black/40 border border-white/10 rounded-lg text-xs font-black text-center text-white p-1 outline-none focus:border-red-500/50"
                                      value={athlete.score || ''}
                                      onChange={(e) => handleUpdateScores(key, athlete.regId, 'score', parseFloat(e.target.value))}
                                    />
                                  )}
                                  
                                  <select 
                                    className={cn(
                                      "bg-black/40 border border-white/10 rounded-lg text-[10px] font-black uppercase px-2 py-1 outline-none focus:border-red-500/50 transition-all",
                                      (athlete.points === 0 && athlete.score === 0) ? "opacity-30 cursor-not-allowed" : "text-stone-300 border-amber-500/50"
                                    )}
                                    value={athlete.place || ''}
                                    onChange={(e) => handleUpdateScores(key, athlete.regId, 'place', e.target.value === 'WO' ? 'WO' : (parseInt(e.target.value) || null))}
                                    disabled={!(
                                      // Habilitar se houver empate técnico
                                      groupAthletes.some(other => 
                                        other.id !== athlete.id && 
                                        ((selectedCategory === 'Kyorugui' && athlete.points > 0 && athlete.points === other.points) ||
                                         (selectedCategory !== 'Kyorugui' && athlete.score > 0 && athlete.score === other.score))
                                      ) || 
                                      athlete.place === 'WO' ||
                                      !athlete.place
                                    )}
                                  >
                                    <option value="">{groupAthletes.some(other => other.id !== athlete.id && (athlete.points > 0 && athlete.points === other.points)) ? 'Decisão...' : 'Pos...'}</option>
                                    <option value="1">1º (Ouro)</option>
                                    <option value="2">2º (Prata)</option>
                                    <option value="3">3º (Bronze)</option>
                                    <option value="WO">W.O.</option>
                                  </select>
                                </div>
                                
                                {athlete.assignedCategory && (
                                  <Button 
                                    variant="ghost" 
                                    className="p-1 px-2 bg-red-600/10 hover:bg-red-600/30 text-red-500 rounded-lg text-[9px] font-bold uppercase tracking-widest gap-1"
                                    onClick={() => handleResetMatch(athlete.regId)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Remover da Chave
                                  </Button>
                                )}
                              </div>
                            )}
                            {profile?.role !== 'admin' && athlete.place && (
                              <div className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-lg",
                                athlete.place === 1 ? "bg-amber-500 text-white" :
                                athlete.place === 2 ? "bg-slate-300 text-stone-900" :
                                athlete.place === 3 ? "bg-amber-700 text-white" : "bg-stone-800 text-stone-400"
                              )}>
                                {athlete.place}º Lugar
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {groupAthletes.length === 1 && (
                  <div className="m-6 mt-0 p-4 bg-amber-600/10 border border-amber-600/20 rounded-2xl flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest leading-relaxed">
                        Atleta único na chave (W.O.).
                      </p>
                    </div>
                    {profile?.role === 'admin' && selectedCategory !== 'Kyopa' && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-amber-600/20">
                        <p className="w-full text-[8px] text-amber-600/60 font-black uppercase tracking-widest mb-1">Mover para:</p>
                        {Object.keys(groupedAthletes).filter(k => k !== key).slice(0, 3).map(targetKey => (
                          <button
                            key={targetKey}
                            onClick={() => handleManualMatch(groupAthletes[0].regId, targetKey)}
                            className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/40 rounded-lg text-[8px] font-black text-amber-600 transition-all border border-amber-600/20 truncate max-w-[150px]"
                          >
                            {targetKey.split('|').pop()}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            const target = prompt('Digite o nome da categoria exata ou chave:', key);
                            if (target) handleManualMatch(groupAthletes[0].regId, target);
                          }}
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] font-black text-stone-400 border border-white/5"
                        >
                          Outra...
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
