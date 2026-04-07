import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, AlertCircle, Trash2, Clock, RotateCcw, Play, Loader2 } from 'lucide-react';
import { doc, updateDoc, collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, getAgeCategory, getWeightCategory, getPoomsaeByBelt, getFightRules, getFightRounds } from '../../utils';
import { User } from 'firebase/auth';
import { Registration, Athlete, Academy, UserProfile, OperationType, Match } from '../../types';
import { Button, Card, cn } from '../ui';
import { BeltBadge } from '../BeltBadge';
import { BracketTree } from '../BracketTree';
import { generateBracket } from '../../utils/bracketEngine';
import { 
  saveBracketMatches, 
  advanceWinner, 
  mergeCategory, 
  resetBracket,
  updateMatchScore
} from '../../services/matchService';

// DND Kit Imports
import { 
  DndContext, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay,
  closestCorners,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import { AthleteDraggable } from '../AthleteDraggable';
import { CategoryDroppable } from '../CategoryDroppable';

export function CompetitionView({ registrations, athletes, academies, user, profile }: { registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; user: User | null; profile: UserProfile | null }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Kyorugui');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingGroup, setLoadingGroup] = useState<string | null>(null);
  const [isProcessingMatch, setIsProcessingMatch] = useState<string | null>(null);

  // Estados para o novo Modal de Fusão Múltipla
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSourceAthlete, setMergeSourceAthlete] = useState<any>(null);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);

  // DND Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const [activeAthlete, setActiveAthlete] = useState<any>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'BRACKET_ATHLETE') {
      setActiveAthlete(data.competitor);
    } else {
      setActiveAthlete(data?.athlete);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveAthlete(null);

    if (!over) return;

    // Lógica para Arraste no Chaveamento (Bracket)
    if (active.id.toString().startsWith('bracket_source')) {
      const sourceData = active.data.current;
      const targetId = over.id.toString();

      if (sourceData?.type === 'BRACKET_ATHLETE' && targetId.startsWith('bracket_target')) {
        const [_, nextMatchId, position] = targetId.split(':');
        const matchId = sourceData.matchId;
        const winnerId = sourceData.competitor.athleteId;

        // Validar se o target pertence à próxima luta correta
        const match = matches.find(m => m.id === matchId);
        if (match && match.nextMatchId === nextMatchId) {
          // Remover confirm a menos que seja empate (seguindo regra anterior)
          const scoreA = match.competitorA?.score || 0;
          const scoreB = match.competitorB?.score || 0;

          if (scoreA === scoreB) {
            if (confirm(`Luta empatada. Confirmar ${sourceData.competitor.name} como vencedor por decisão técnica?`)) {
              setIsProcessingMatch(matchId);
              try {
                await advanceWinner(matchId, winnerId);
              } finally {
                setIsProcessingMatch(null);
              }
            }
          } else {
            setIsProcessingMatch(matchId);
            try {
              await advanceWinner(matchId, winnerId);
            } finally {
              setIsProcessingMatch(null);
            }
          }
        }
      }
      return;
    }

    // Lógica original para Arraste entre Categorias
    const athlete = active.data.current?.athlete;
    const originGroup = active.data.current?.originGroup;
    const targetGroup = over.data.current?.groupKey;

    if (!athlete || !targetGroup || originGroup === targetGroup) return;

    if (!confirm(`Mover ${athlete.name} para a categoria "${targetGroup}"? Isso irá resetar as chaves envolvidas.`)) return;

    try {
      // Coletar regIds ANTES de mover para resetar os grupos corretamente
      const baseOrigin = originGroup?.replace(/\s+-\s+G\d+$/, '');
      const baseTarget = targetGroup.replace(/\s+-\s+G\d+$/, '');
      
      const getIds = (base: string) => {
        const ids: string[] = [];
        Object.entries(groupedAthletes).forEach(([k, athletes]) => {
          if (k === base || k.startsWith(`${base} - G`)) {
            athletes.forEach(a => ids.push(a.regId));
          }
        });
        return ids;
      };

      const originIds = originGroup ? getIds(baseOrigin!) : [];
      const targetIds = getIds(baseTarget);

      await updateDoc(doc(db, 'registrations', athlete.regId), {
        assignedCategory: targetGroup,
        isMatched: false // Crucial: volta ao estado "não iniciado" para mostrar botão Play
      });

      if (originGroup) await resetBracket(originGroup, originIds);
      await resetBracket(targetGroup, targetIds);

    } catch (error) {
      console.error('Erro ao mover atleta:', error);
      alert('Falha ao mover atleta entre categorias.');
    }
  };

  // Escutar todas as lutas (Matches) em tempo real
  useEffect(() => {
    const q = query(collection(db, 'matches'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(matchesData);
    });
    return () => unsubscribe();
  }, []);

  const handleResetBracket = async (groupKey: string) => {
    const baseGroupKey = groupKey.replace(/\s+-\s+G\d+$/, '');
    const regIds: string[] = [];
    
    // Coletar IDs de todos os atletas que pertencem a esta categoria ou seus subgrupos
    Object.entries(groupedAthletes).forEach(([k, athletes]) => {
      if (k === baseGroupKey || k.startsWith(`${baseGroupKey} - G`)) {
        athletes.forEach(a => {
          if (!regIds.includes(a.regId)) regIds.push(a.regId);
        });
      }
    });
    
    if (!window.confirm(`AVISO: Isso irá apagar TODAS as lutas e o pódio de toda a categoria "${baseGroupKey}". Deseja continuar?`)) return;
    try {
      await resetBracket(groupKey, regIds);
    } catch (error) {
      alert("Erro ao resetar chave");
    }
  };
  
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
      // Agrupamento em subgrupos de 4 só ocorre APÓS o play (quando isMatched for verdadeiro)
      if (selectedCategory === 'Poomsae' && groupAthletes.length > 4 && groupAthletes.some(a => a.isMatched)) {
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

  const soloAthletes = useMemo(() => {
    return Object.entries(groupedAthletes)
      .filter(([_, athletes]) => athletes.length === 1)
      .map(([key, athletes]) => ({
        key,
        athlete: athletes[0]
      }));
  }, [groupedAthletes]);

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
      setLoadingGroup(groupKey);
      
      if (selectedCategory === 'Kyorugui' && groupAthletes.length >= 2) {
        const festivalId = 'fest2026';
        const categoryId = groupKey.replace(/\s+/g, '_').toLowerCase();
        const catAthletes = groupAthletes.map(a => ({ id: a.regId, name: a.name, academy: a.academy }));
        const newMatches = generateBracket(festivalId, categoryId, groupKey, catAthletes);
        if (!newMatches || newMatches.length === 0) throw new Error('Falha ao gerar chaves');
        await saveBracketMatches(newMatches);
      }

      // Ativa o modo de pontuação/lutas para todos os atletas e TRAVA a categoria
      for (const athlete of groupAthletes) {
        await updateDoc(doc(db, 'registrations', athlete.regId), { 
          isMatched: true,
          assignedCategory: groupKey 
        });
      }
    } catch (error: any) {
      alert(`Erro ao iniciar categoria: ${error.message}`);
    } finally {
      setLoadingGroup(null);
    }
  };

  const handleUpdateScores = async (groupKey: string, athleteRegId: string, field: 'score' | 'points' | 'place', value: any) => {
    try {
      const reg = registrations.find(r => r.id === athleteRegId);
      if (!reg) return;
      let newResults = [...(reg.results || [])];
      let resIdx = newResults.findIndex(r => r.groupKey === groupKey);
      
      const updateData = { [field]: value };
      
      if (resIdx >= 0) {
        newResults[resIdx] = { ...newResults[resIdx], ...updateData };
      } else {
        newResults.push({ groupKey, place: null, ...updateData });
      }
      await updateDoc(doc(db, 'registrations', athleteRegId), { results: newResults });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Chaves de Luta</h2>
            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Gestão de atletas e categorias</p>
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
            <Trophy className="w-10 h-10 text-stone-700 mx-auto mb-6" />
            <p className="text-[10px] text-stone-600 font-black uppercase tracking-[0.2em]">Nenhum atleta confirmado</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {Object.entries(groupedAthletes).map(([key, groupAthletes]) => {
              const firstAthlete = groupAthletes[0];
              const rounds = selectedCategory === 'Kyorugui' ? getFightRounds(firstAthlete?.ageCat || '') : null;
              const poomsaeName = selectedCategory === 'Poomsae' && firstAthlete ? getPoomsaeByBelt(firstAthlete.belt, firstAthlete.isElite) : null;
              const groupMatches = matches.filter(m => m.groupKey === key);

              return (
                <CategoryDroppable key={key} id={key} athleteCount={groupAthletes.length}>
                  <Card className="p-0 border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
                    <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
                      <div>
                        <h3 className="font-black text-white uppercase tracking-tight text-sm">{key}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1.5 text-[8px] font-black text-stone-500 uppercase tracking-[0.2em]">
                            <Clock className="w-3 h-3 text-red-500" />
                            {rounds ? `${rounds.rounds}R × ${rounds.duration}` : 'Tempo Definido'}
                          </span>
                          {groupAthletes.length > 0 && (
                            <span className="px-2 py-0.5 bg-red-600 rounded text-[8px] font-black text-white uppercase">
                              {groupAthletes.length} Atletas
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {profile?.role === 'admin' && (
                        <div className="flex items-center gap-2">
                          {!matches.some(m => m.groupKey === key) && !groupAthletes.some(a => a.isMatched) ? (
                            <button 
                              disabled={loadingGroup === key || groupAthletes.length < 2}
                              onClick={() => handleDrawGroup(key, groupAthletes)}
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center transition-all bg-amber-600/10 border border-amber-600/20 text-amber-500 hover:bg-amber-600 hover:text-white hover:scale-110 shadow-lg shadow-amber-900/20",
                                (loadingGroup === key || groupAthletes.length < 2) && "opacity-50 cursor-not-allowed"
                              )}
                              title="Gerar Chave"
                            >
                              {loadingGroup === key ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                            </button>
                          ) : (
                            <button 
                              disabled={loadingGroup === key}
                              onClick={() => handleResetBracket(key)}
                              className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-transparent border border-red-500/20 text-red-500 hover:bg-red-600 hover:text-white"
                              title="Resetar Chave"
                            >
                              {loadingGroup === key ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="p-6 space-y-4">
                      {selectedCategory === 'Kyorugui' && matches.some(m => m.groupKey === key) ? (
                        <div className="pt-4 overflow-x-auto scrollbar-hide">
                          <BracketTree 
                            matches={groupMatches}
                            isAdmin={profile?.role === 'admin'}
                            onSetWinner={(matchId, winnerId) => {
                              const match = groupMatches.find(m => m.id === matchId);
                              if (!match) return;
                              
                              const scoreA = match.competitorA?.score || 0;
                              const scoreB = match.competitorB?.score || 0;
                              
                              if (scoreA === scoreB) {
                                const winnerName = match.competitorA?.athleteId === winnerId 
                                  ? match.competitorA.name 
                                  : match.competitorB?.name;
                                
                                if (confirm(`Luta empatada (${scoreA} x ${scoreB}). Confirmar ${winnerName} como vencedor por decisão técnica?`)) {
                                  setIsProcessingMatch(matchId);
                                  advanceWinner(matchId, winnerId).finally(() => setIsProcessingMatch(null));
                                }
                              } else {
                                setIsProcessingMatch(matchId);
                                advanceWinner(matchId, winnerId).finally(() => setIsProcessingMatch(null));
                              }
                            }}
                            onUpdateScore={updateMatchScore}
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {groupAthletes.map((athlete, idx) => (
                            <AthleteDraggable 
                              key={athlete.id}
                              athlete={athlete}
                              idx={idx}
                              fightRules={selectedCategory === 'Kyorugui' ? getFightRules(athlete.belt, athlete.isElite) : null}
                              isAdmin={profile?.role === 'admin'}
                              selectedCategory={selectedCategory}
                              onUpdateScores={handleUpdateScores}
                              groupKey={key}
                              groupAthletesCount={groupAthletes.length}
                            />
                          ))}
                        </div>
                      )}

                      {groupAthletes.length === 1 && (
                        <div className="mt-4 p-4 bg-amber-600/10 border border-amber-600/20 rounded-2xl flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest leading-relaxed">
                              Atleta único na chave (W.O.). Arraste para fundir com outra categoria!
                            </p>
                          </div>
                          {profile?.role === 'admin' && (
                            <Button 
                              variant="ghost" 
                              className="w-full justify-start text-[8px] h-8 bg-white/5 gap-2 uppercase font-black tracking-widest text-stone-400 group-hover:text-white"
                              onClick={() => {
                                setMergeSourceAthlete(groupAthletes[0]);
                                setSelectedTargets([]);
                                setIsMergeModalOpen(true);
                              }}
                            >
                              <Trophy className="w-3 h-3" />
                              Fusão de Categorias
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                </CategoryDroppable>
              );
            })}
          </div>
        )}

        {/* Modal de Fusão Múltipla */}
        <AnimatePresence>
          {isMergeModalOpen && mergeSourceAthlete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="w-full max-w-2xl bg-stone-900 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
              >
                <div className="p-8 border-b border-white/5">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                    <Trophy className="w-6 h-6 text-amber-500" />
                    Fusão de Categorias
                  </h3>
                  <p className="text-xs text-stone-500 font-bold uppercase tracking-widest mt-2 italic">
                    Selecione outros atletas únicos para fundir com <span className="text-amber-500">{mergeSourceAthlete.name}</span>
                  </p>
                </div>

                <div className="p-8 max-h-[400px] overflow-y-auto space-y-3 custom-scrollbar">
                  {soloAthletes.length > 1 ? (
                    soloAthletes
                      .filter(s => s.athlete.regId !== mergeSourceAthlete.regId)
                      .map(({ key, athlete }) => {
                        const isSelected = selectedTargets.includes(athlete.regId);
                        return (
                          <div 
                            key={athlete.regId}
                            onClick={() => {
                              setSelectedTargets(prev => 
                                isSelected ? prev.filter(id => id !== athlete.regId) : [...prev, athlete.regId]
                              );
                            }}
                            className={cn(
                              "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer",
                              isSelected ? "bg-amber-600/20 border-amber-500/50" : "bg-white/5 border-white/5 hover:bg-white/10"
                            )}
                          >
                            <p className="text-sm font-black text-white uppercase">{athlete.name}</p>
                            <BeltBadge belt={athlete.belt} size="sm" />
                          </div>
                        );
                      })
                  ) : (
                    <div className="text-center py-10 opacity-50">Nenhum outro atleta único disponível</div>
                  )}
                </div>

                <div className="p-8 bg-black/40 border-t border-white/5 flex items-center justify-between gap-4">
                  <Button variant="ghost" onClick={() => setIsMergeModalOpen(false)}>Cancelar</Button>
                  <Button 
                    variant="success" 
                    disabled={selectedTargets.length === 0}
                    onClick={async () => {
                      const targetGroup = soloAthletes.find(s => s.athlete.regId === mergeSourceAthlete.regId)?.key;
                      if (!targetGroup) return;
                      for (const regId of selectedTargets) {
                        const s = soloAthletes.find(x => x.athlete.regId === regId);
                        if (s) await mergeCategory(regId, s.key, targetGroup, s.athlete.name);
                      }
                      setIsMergeModalOpen(false);
                    }}
                  >
                    Confirmar Fusão
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <DragOverlay dropAnimation={null}>
          {activeAthlete ? (
            <div className="bg-amber-600 border-2 border-white/20 p-4 rounded-2xl shadow-2xl backdrop-blur-xl w-[280px] rotate-3 cursor-grabbing">
              <p className="font-black text-white uppercase text-xs">{activeAthlete.name}</p>
              <p className="text-[10px] text-white/50 font-bold uppercase mt-1 italic">{activeAthlete.academy}</p>
            </div>
          ) : null}
        </DragOverlay>
      </motion.div>
    </DndContext>
  );
}
