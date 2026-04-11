import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Trophy, AlertCircle, Trash2, Clock, RotateCcw, Play, Loader2, Mic, Radio, CheckCircle2, PlaySquare, Medal, Copy } from 'lucide-react';
import { doc, updateDoc, collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  getAgeCategory, 
  handleFirestoreError, 
  getWeightCategory, 
  getPoomsaeByBelt, 
  getFightRules, 
  getFightRounds,
  sanitizeForId
} from '../../utils';
import { User } from 'firebase/auth';
import { Registration, Athlete, Academy, UserProfile, OperationType, Match } from '../../types';
import { Button, Card, cn } from '../ui';
import { BeltBadge } from '../BeltBadge';
import { BracketTree } from '../BracketTree';
import { generateBracket } from '../../utils/bracketEngine';
import { 
  saveBracketMatches, 
  mergeCategory,
  advanceWinner,
  resetBracket,
  updateMatchScore,
  finalizeModalityCategory
} from '../../services/matchService';
import { 
  callMatchInQueue, 
  assignMatchesToCourt, 
  assignCourtQueues, 
  batchCallMatches, 
  batchResetCourtMatches, 
  processCourtRanking,
  batchGenerateModuleMatches 
} from '../../services/courtService';
import { CourtQueueModal } from './CourtQueueModal';
import { WinnerReasonModal } from '../WinnerReasonModal';

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
  const [searchTerm, setSearchTerm] = useState('');

  // Estados para o novo Modal de Fusão Múltipla
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSourceAthlete, setMergeSourceAthlete] = useState<any>(null);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  
  // Estado para o modal de Filas
  const [isCourtQueueModalOpen, setIsCourtQueueModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isBatchLoading, setIsBatchLoading] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/?join=arena`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };
  const [tieBreakMatch, setTieBreakMatch] = useState<{ id: string; winnerId: string; winnerName: string } | null>(null);

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
    const sourceData = active.data.current;
    const targetId = over.id.toString();
    const targetGroup = over.data.current?.groupKey;

    // 1. Resolver o Atleta e Grupo de Origem (Unificado)
    let athlete: any = sourceData?.athlete;
    let originGroup: string = sourceData?.originGroup;

    if (sourceData?.type === 'BRACKET_ATHLETE') {
      const regId = sourceData.competitor?.athleteId;
      // Busca o atleta completo nas categorias calculadas
      for (const groupKey in groupedAthletes) {
        const found = groupedAthletes[groupKey].find((a: any) => a.regId === regId);
        if (found) {
          athlete = found;
          originGroup = originGroup || found.assignedCategory;
          break;
        }
      }
    }

    if (!athlete) return;

    // 2. Lógica para Chaveamento (Bracket) - Destino é outro slot de luta
    if (targetId.startsWith('bracket_target')) {
      if (sourceData?.type === 'BRACKET_ATHLETE') {
        const targetParts = targetId.split(':');
        const matchId = targetParts[1];
        const winnerId = athlete.regId;

        // Não permite arrastar para a mesma luta
        if (sourceData.matchId === matchId) return;

        const match = matches.find(m => m.id === matchId);
        if (match) {
          const scoreA = match.competitorA?.score || 0;
          const scoreB = match.competitorB?.score || 0;
          
          if (scoreA === scoreB) {
            setTieBreakMatch({ 
              id: matchId, 
              winnerId, 
              winnerName: sourceData.competitor.name 
            });
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

    // 3. Lógica para Mudança de Categoria / Fusão (Destino é uma Categoria)
    if (targetGroup && originGroup !== targetGroup) {
      // BLOQUEIO DE GÊNERO: Verificar se o gênero do atleta destino é compatível
      const targetAthletes = groupedAthletes[targetGroup] || [];
      if (targetAthletes.length > 0) {
        const targetGender = targetAthletes[0].gender;
        if (athlete.gender !== targetGender) {
          alert(`Operação Bloqueada: Não é permitido fundir atletas de gêneros diferentes (${athlete.gender === 'M' ? 'Masculino' : 'Feminino'} -> ${targetGender === 'M' ? 'Masculino' : 'Feminino'}).`);
          return;
        }
      }

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
          [`disciplineStatus.${targetGroup.includes('tábuas') ? (targetGroup.split(' - ')[0]) : selectedCategory}.assignedCategory`]: targetGroup,
          [`disciplineStatus.${targetGroup.includes('tábuas') ? (targetGroup.split(' - ')[0]) : selectedCategory}.isMatched`]: false
        });

        if (originGroup) await resetBracket(originGroup, originIds, selectedCategory === 'Kyopa' ? originGroup.split(' - ')[0] : selectedCategory);
        await resetBracket(targetGroup, targetIds, selectedCategory === 'Kyopa' ? targetGroup.split(' - ')[0] : selectedCategory);

      } catch (error) {
        console.error('Erro ao mover atleta:', error);
        alert('Falha ao mover atleta entre categorias.');
      }
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
      const discipline = selectedCategory === 'Kyopa' ? groupKey.split(' - ')[0] : selectedCategory;
      await resetBracket(groupKey, regIds, discipline);
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
        // 1. Calcular a Categoria Natural (onde o atleta "deveria" estar)
        let naturalKey = '';
        if (isKyopaTab) {
          naturalKey = `${catItem} - ${genderStr}`;
        } else if (selectedCategory === 'Kyorugui') {
          naturalKey = `${ageCat} | ${beltType} | ${genderStr} | ${weightCat}`;
        } else {
          naturalKey = `${ageCat} | ${beltType} | ${genderStr}`;
        }

        // 2. Determinar a Categoria Atual e se é Manual
        const discStatus = reg.disciplineStatus?.[catItem];
        let groupKey = naturalKey;
        let isManuallyAssigned = false;

        if (discStatus?.assignedCategory) {
          groupKey = discStatus.assignedCategory;
          isManuallyAssigned = true;
        } else if (reg.assignedCategory) {
          // Fallback para dados legados: Só considerar manual se for DIFERENTE da natural
          const isLegacyMatch = (
            (isKyopaTab && reg.assignedCategory.includes('tábuas')) ||
            (selectedCategory === 'Kyorugui' && reg.assignedCategory.includes('|')) ||
            (selectedCategory === 'Poomsae' && reg.assignedCategory.includes('|') && !reg.assignedCategory.includes('kg'))
          );

          if (isLegacyMatch && reg.assignedCategory !== naturalKey) {
            groupKey = reg.assignedCategory;
            isManuallyAssigned = true;
          }
        }
        
        if (!initialGroups[groupKey]) initialGroups[groupKey] = [];
        if (!initialGroups[groupKey].find(a => a.id === athlete.id)) {
          const result = reg.results?.find(r => r.groupKey === groupKey);
          
          // IsMatched também deve ser por disciplina
          const isMatched = discStatus?.isMatched ?? (
            // Fallback para isMatched legado
            (reg.isMatched && groupKey === reg.assignedCategory) ? true : false
          );

          initialGroups[groupKey].push({
            ...athlete,
            regId: reg.id,
            ageCat,
            isLocked: reg.status === 'Confirmado',
            isElite: reg.isElite,
            isMatched: isMatched,
            isManuallyAssigned: isManuallyAssigned,
            assignedCategory: groupKey,
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
      if ((selectedCategory === 'Poomsae' || selectedCategory === 'Kyopa') && groupAthletes.length > 4) {
        const total = groupAthletes.length;
        const numGroups = Math.ceil(total / 4);
        const baseSize = Math.floor(total / numGroups);
        let remainder = total % numGroups;
        
        let currentIndex = 0;
        for (let i = 0; i < numGroups; i++) {
          const groupSize = baseSize + (remainder > 0 ? 1 : 0);
          remainder--;
          
          const chunk = groupAthletes.slice(currentIndex, currentIndex + groupSize);
          currentIndex += groupSize;
          
          finalGroups[`${key} - G${i + 1}`] = chunk;
        }
      } else {
        finalGroups[key] = groupAthletes;
      }
    });

    // Se for admin, retornar todos os grupos (ordenados para o cronograma)
    // Se for usuário, retornar apenas grupos da sua academia
    const allGroupsSorted = Object.entries(finalGroups).sort(([keyA], [keyB]) => {
      const getSortWeight = (key: string, cat: string) => {
        const k = key.toLowerCase();
        
        if (cat === 'Kyopa') {
          // Kyopa não é por idade, ordenar por gênero e tábuas
          const boards = k.includes('5 tábuas') ? 2 : 1;
          const gender = k.includes('masculino') ? 1 : 2;
          return boards * 10 + gender;
        }

        // Pesos base baseados na ordem de idade
        let ageWeight = 0;
        if (k.includes('fraldinha')) ageWeight = 1;
        else if (k.includes('mirim')) ageWeight = 2;
        else if (k.includes('infantil')) ageWeight = 3;
        else if (k.includes('cadete')) ageWeight = 4;
        else if (k.includes('juvenil')) ageWeight = 5;
        else if (k.includes('adulto')) ageWeight = 6;
        else if (k.includes('master')) ageWeight = 7;

        if (cat === 'Kyorugui') {
          // Turno Manhã (Kyorugui): Juvenil(5), Adulto(6), Master(7)
          // Turno Tarde (Kyorugui): Cadete(4), Infantil(3), Mirim(2), Fraldinha(1)
          if (ageWeight >= 5) return ageWeight - 10; // Prioritários ficam negativos
          return ageWeight;
        }

        if (cat === 'Poomsae') {
          // Turno Manhã (Poomsae): Fraldinha(1), Mirim(2), Cadete(4)
          // Turno Tarde (Poomsae): Juvenil(5), Adulto(6), Master(7)
          if (ageWeight <= 4) return ageWeight - 10;
          return ageWeight;
        }

        return ageWeight;
      };

      return getSortWeight(keyA, selectedCategory) - getSortWeight(keyB, selectedCategory);
    });

    const sortedObject: Record<string, any[]> = Object.fromEntries(allGroupsSorted);

    // Filtrar por Busca
    let result = sortedObject;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = Object.fromEntries(
        Object.entries(sortedObject).filter(([key, athletes]) => 
          key.toLowerCase().includes(term) || athletes.some(a => a.name.toLowerCase().includes(term))
        )
      );
    }

    if (profile?.role !== 'admin') {
      const filteredGroups: Record<string, any[]> = {};
      Object.entries(result).forEach(([key, groupAthletes]) => {
        if (groupAthletes.some(a => a.academyId === profile?.academyId)) {
          filteredGroups[key] = groupAthletes;
        }
      });
      return filteredGroups;
    }
    
    return result;
  }, [registrations, athletes, academies, selectedCategory, profile, searchTerm]);

  const stats = useMemo(() => {
    const total = matches.length;
    const finished = matches.filter(m => m.status === 'finished').length;
    const wo = matches.filter(m => m.winnerReason === 'wo').length;
    return {
      total,
      finished,
      wo,
      percent: total > 0 ? Math.round((finished / total) * 100) : 0
    };
  }, [matches]);

  const soloAthletes = useMemo(() => {
    return Object.entries(groupedAthletes)
      .filter(([_, athletes]) => athletes.length === 1)
      .map(([key, athletes]) => ({
        key,
        athlete: athletes[0]
      }));
  }, [groupedAthletes]);

  const handleResetMatch = async (regId: string, discipline: string) => {
    try {
      await updateDoc(doc(db, 'registrations', regId), {
        [`disciplineStatus.${discipline}.assignedCategory`]: null,
        [`disciplineStatus.${discipline}.isMatched`]: false
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  const handleDrawGroup = async (groupKey: string, groupAthletes: any[]) => {
    try {
      setLoadingGroup(groupKey);
      
      const festivalId = 'fest2026';
      const catAthletes = groupAthletes.map(a => ({ id: a.regId, name: a.name, academy: a.academy }));
      if (selectedCategory === 'Kyorugui' && groupAthletes.length >= 2) {
        const categoryId = sanitizeForId(groupKey);
        const newMatches = generateBracket(festivalId, categoryId, groupKey, catAthletes);
        if (!newMatches || newMatches.length === 0) throw new Error('Falha ao gerar chaves');
        await saveBracketMatches(newMatches);
        await assignMatchesToCourt(newMatches.map(m => m.id), 'Kyorugui');
      } else if ((selectedCategory === 'Poomsae' || selectedCategory === 'Kyopa') && groupAthletes.length > 0) {
        const prefix = selectedCategory === 'Poomsae' ? 'poomsae_' : 'kyopa_';
        const categoryId = prefix + sanitizeForId(groupKey);
        const shuffled = [...catAthletes].sort(() => Math.random() - 0.5);
        const newMatches: any[] = shuffled.map((a, idx) => ({
          id: `match_${categoryId}_${idx + 1}`,
          festivalId,
          categoryId,
          groupKey,
          matchNumber: idx + 1,
          round: 1,
          status: 'scheduled',
          competitorA: {
            athleteId: a.id,
            name: a.name,
            academy: a.academy,
            score: 0
          }
        }));
        await saveBracketMatches(newMatches);
        await assignMatchesToCourt(newMatches.map(m => m.id), selectedCategory as any);
      }

      // Ativa o modo de pontuação/lutas para todos os atletas e TRAVA a categoria
      for (const athlete of groupAthletes) {
        // Para Kyopa, a disciplina pode ser "Kyopa (3 tábuas)" ou "Kyopa (5 tábuas)"
        const discipline = selectedCategory === 'Kyopa' 
          ? groupKey.split(' - ')[0] 
          : selectedCategory;

        await updateDoc(doc(db, 'registrations', athlete.regId), { 
          [`disciplineStatus.${discipline}`]: {
            isMatched: true,
            assignedCategory: groupKey
          }
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

  const handleBatchGenerate = async (modality: 'Kyorugui' | 'Poomsae' | 'Kyopa') => {
    if (!confirm(`Deseja gerar TODAS as chaves pendentes de ${modality}? Isso distribuirá automaticamente os combates nas quadras.`)) return;
    
    setIsBatchLoading(true);
    try {
      // Filtrar apenas atletas da modalidade correta para economizar processamento
      //groupedAthletes já está filtrado pela selectedCategory, mas por segurança vamos usar a fonte de dados se necessário
      // No entanto, groupedAthletes reflete o estado atual da aba, o que é perfeito.
      
      const result = await batchGenerateModuleMatches(modality, groupedAthletes);
      
      if (result.categoriesProcessed > 0) {
        alert(`Sucesso! ${result.categoriesProcessed} categorias processadas. ${result.matchesCreated} novas lutas criadas.\nTempo estimado: ${result.estimatedMinutes} minutos.`);
      } else {
        alert("Nenhuma categoria pendente encontrada para este módulo.");
      }
    } catch (error: any) {
      alert(`Erro no processamento em lote: ${error.message}`);
    } finally {
      setIsBatchLoading(false);
    }
  };

  const currentModalityStats = useMemo(() => {
    const totalAthletes = Object.values(groupedAthletes).flat().length;
    const totalCategories = Object.keys(groupedAthletes).length;
    const pendingCategories = Object.entries(groupedAthletes).filter(([_, athletes]) => 
      athletes.length >= 2 && !athletes.some(a => a.isMatched)
    ).length;
    
    // Cálculo de tempo previsto (baseado na solicitação do usuário)
    let timePerUnit = 7; // Kyorugui: 7 min/match
    if (selectedCategory === 'Poomsae') timePerUnit = 5; // Poomsae: 5 min/atleta
    if (selectedCategory === 'Kyopa') timePerUnit = 3; // Kyopa: 3 min/atleta
    
    const scheduledMatches = matches.filter(m => m.status === 'scheduled' && Object.keys(groupedAthletes).includes(m.groupKey));
    
    let estimatedTimeMinutes = 0;
    if (selectedCategory === 'Kyorugui') {
      estimatedTimeMinutes = scheduledMatches.length * 7;
    } else {
      const activeAthletes = Object.values(groupedAthletes).flat().filter(a => a.isMatched && !a.place);
      estimatedTimeMinutes = activeAthletes.length * (selectedCategory === 'Poomsae' ? 5 : 3);
    }

    return {
      totalAthletes,
      totalCategories,
      pendingCategories,
      estimatedTimeMinutes
    };
  }, [groupedAthletes, selectedCategory, matches]);

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
            <h2 className="text-2xl md:text-3xl font-black text-white italic uppercase tracking-tighter flex flex-col sm:flex-row sm:items-center gap-4">
              Chaves de {selectedCategory === 'Kyorugui' ? 'Luta' : selectedCategory}
              <div className="flex flex-wrap items-center gap-2">
                <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] md:text-[10px] text-stone-400 flex items-center gap-1.5 whitespace-nowrap">
                  <Trophy className="w-3 h-3" />
                  {stats.total > 0 ? `${stats.finished}/${stats.total} Lutas` : 'Aguardando Chaves'}
                </div>
                {stats.wo > 0 ? (
                  <div className="px-3 py-1 bg-red-600/20 border border-red-500/30 rounded-full text-[9px] md:text-[10px] text-red-500 flex items-center gap-1.5 animate-pulse whitespace-nowrap">
                    <AlertCircle className="w-3 h-3" />
                    {stats.wo} W.O.s
                  </div>
                ) : (
                  <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] md:text-[10px] text-stone-500 flex items-center gap-1.5 opacity-50 whitespace-nowrap">
                    <AlertCircle className="w-3 h-3" />
                    0 W.O.s
                  </div>
                )}
                <div className={cn(
                  "px-3 py-1 border rounded-full text-[9px] md:text-[10px] flex items-center gap-1.5 shadow-lg transition-all whitespace-nowrap",
                  soloAthletes.length > 0 
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-500 animate-bounce-subtle" 
                    : "bg-white/5 border-white/10 text-stone-500 opacity-50"
                )}>
                  <Shield className="w-3 h-3" />
                  {soloAthletes.length} Solo
                </div>
              </div>
            </h2>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">Gestão de atletas e categorias</p>
              <div className="h-4 w-[1px] bg-white/10" />
              <div className="relative group/search">
                <input 
                  type="text"
                  inputMode={searchTerm.match(/^\d+/) ? "decimal" : "text"}
                  placeholder="BUSCAR ATLETA OU CHAVE..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent border-b border-white/10 focus:border-red-500 outline-none text-[10px] font-black text-red-500 placeholder:text-stone-700 w-32 sm:w-48 transition-all focus:w-48 sm:focus:w-64 uppercase tracking-widest py-1"
                />
              </div>
            </div>
          </div>
          <div className="flex w-full md:w-auto bg-white/5 p-1 rounded-2xl border border-white/5 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1 min-w-max">
              {profile?.role === 'admin' && (
                <>
                  <Button 
                    variant="ghost" 
                    onClick={handleCopyLink}
                    className={cn(
                      "mr-2 text-[9px] font-black uppercase tracking-widest transition-all h-9 px-3 gap-2",
                      copiedLink ? "bg-emerald-600 text-white border-emerald-500" : "text-emerald-500 border-emerald-500/30 hover:bg-emerald-500 hover:text-white"
                    )}
                  >
                    {copiedLink ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedLink ? "Link Copiado!" : "Compartilhar Portal"}
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={() => setIsCourtQueueModalOpen(true)}
                    className="mr-2 text-[9px] font-black uppercase tracking-widest text-amber-500 border-amber-500/30 hover:bg-amber-500 hover:text-white transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] h-9 px-3"
                  >
                    ⚡ Filas de Quadra
                  </Button>
                </>
              )}
              {['Kyorugui', 'Poomsae', 'Kyopa'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-4 md:px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                    selectedCategory === cat 
                      ? "bg-red-600 text-white shadow-lg" 
                      : "text-stone-500 hover:text-white"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Painel de Controle de Massa (Admin Only) */}
        {profile?.role === 'admin' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-white/[0.03] border border-white/5 rounded-[2rem] shadow-2xl relative overflow-hidden group/actions"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
            
            <div className="md:col-span-1 space-y-1">
              <h4 className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">Painel de Comando</h4>
              <p className="text-xl font-black text-white italic uppercase tracking-tighter">Ações Globais</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest">{currentModalityStats.pendingCategories} Categorias Pendentes</span>
              </div>
            </div>

            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <Button 
                disabled={isBatchLoading || currentModalityStats.pendingCategories === 0}
                onClick={() => handleBatchGenerate(selectedCategory as any)}
                className="bg-red-600 hover:bg-red-700 text-white border-none h-12 px-6 rounded-2xl shadow-[0_10px_20px_rgba(220,38,38,0.2)] group/btn"
              >
                {isBatchLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <PlaySquare className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <p className="text-[10px] font-black uppercase tracking-tighter leading-none">Abrir Todas as Chaves</p>
                      <p className="text-[8px] font-bold opacity-60 uppercase tracking-widest mt-0.5">Módulo {selectedCategory}</p>
                    </div>
                  </>
                )}
              </Button>

              <div className="flex items-center gap-4 ml-2 px-6 py-2 bg-black/20 rounded-2xl border border-white/5">
                <div className="text-center">
                  <p className="text-[8px] font-bold text-stone-500 uppercase tracking-widest">Tempo Estimado</p>
                  <p className="text-lg font-black text-white">~{Math.ceil(currentModalityStats.estimatedTimeMinutes / 60)}h {currentModalityStats.estimatedTimeMinutes % 60}min</p>
                </div>
                <div className="w-[1px] h-8 bg-white/10" />
                <div className="text-center">
                  <p className="text-[8px] font-bold text-stone-500 uppercase tracking-widest">Carga Total</p>
                  <p className="text-lg font-black text-amber-500">{currentModalityStats.totalAthletes}</p>
                </div>
              </div>
            </div>

            <div className="md:col-span-1 flex flex-col justify-center items-end text-right">
              <div className="flex flex-col items-end gap-1">
                <span className="text-[9px] font-black text-stone-600 uppercase tracking-[0.2em] mb-1">Taxas de Operação</span>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-white/5 rounded-lg text-[8px] font-bold text-stone-400">KYOR: 7m/luta</span>
                  <span className="px-2 py-1 bg-white/5 rounded-lg text-[8px] font-bold text-stone-400">POOM: 5m/atl</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {Object.keys(groupedAthletes).length === 0 ? (
          <Card className="py-32 text-center border-white/5 bg-white/[0.02]">
            <Trophy className="w-10 h-10 text-stone-700 mx-auto mb-6" />
            <p className="text-[10px] text-stone-600 font-black uppercase tracking-[0.2em]">Nenhum atleta confirmado</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-8">
            {Object.entries(groupedAthletes).map(([key, groupAthletes]) => {
              const firstAthlete = groupAthletes[0];
              const rounds = selectedCategory === 'Kyorugui' ? getFightRounds(firstAthlete?.ageCat || '') : null;
              const groupMatches = matches.filter(m => m.groupKey === key);
              const podiumAthletes = groupAthletes.filter(a => !a.isBye && !a.name?.toUpperCase().includes('SORTEIO'));
              const isCategoryFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished');

              return (
                <CategoryDroppable key={key} id={key} athleteCount={groupAthletes.length}>
                  <Card className={cn(
                    "p-0 border-white/5 transition-all duration-700 overflow-hidden",
                    isCategoryFinished 
                      ? "bg-emerald-500/[0.05] ring-1 ring-emerald-500/30 border-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.08)] backdrop-blur-sm" 
                      : "bg-gradient-to-br from-white/[0.03] to-transparent"
                  )}>
                    {/* Cabeçalho do Card */}
                    <div className="px-4 md:px-6 py-4 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
                      <div>
                        <h3 className="font-black text-white uppercase tracking-tight text-sm">{key}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1.5 text-[8px] font-black text-stone-500 uppercase tracking-[0.2em]">
                            <Clock className="w-3 h-3 text-red-500" />
                            {rounds ? `${rounds.rounds}R × ${rounds.duration}` : 'Tempo Definido'}
                          </span>
                           {groupAthletes.length > 0 && (
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[8px] font-black text-white uppercase shadow-lg",
                              (selectedCategory === 'Poomsae' || selectedCategory === 'Kyopa') ? "bg-blue-600 shadow-blue-900/20" : "bg-red-600 shadow-red-900/20"
                            )}>
                              {groupAthletes.length} Atletas
                            </span>
                          )}
                          {groupMatches.length > 0 && groupMatches[0].courtId && (
                            <span className="px-2 py-0.5 bg-amber-500 rounded text-[8px] font-black text-black uppercase">
                              Q{groupMatches[0].courtId} - {groupMatches[0].matchSequence}..{groupMatches[groupMatches.length-1].matchSequence}
                            </span>
                          )}
                          {isCategoryFinished && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[8px] font-black text-emerald-500 uppercase animate-in zoom-in-95 duration-500">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Concluída
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
                            <div className="flex items-center gap-3">
                              {/* Seletor de Quadra Rápido (Admin Only) */}
                              {groupMatches.length > 0 && !isCategoryFinished && (
                                <div className="flex items-center bg-black/40 rounded-full p-1 border border-white/10 shadow-inner">
                                  {[1, 2, 3].map((q) => (
                                    <button
                                      key={q}
                                      onClick={async () => {
                                        const matchIds = groupMatches.map(m => m.id);
                                        setLoadingGroup(key);
                                        try {
                                          const assignments = matchIds.map((id, idx) => ({
                                            matchId: id,
                                            courtId: q as 1|2|3,
                                            sequence: q * 100 + (idx + 1)
                                          }));
                                          await assignCourtQueues(assignments);
                                        } finally {
                                          setLoadingGroup(null);
                                        }
                                      }}
                                      className={cn(
                                        "w-7 h-7 rounded-full text-[9px] font-black transition-all",
                                        groupMatches[0].courtId === q 
                                          ? "bg-amber-500 text-black shadow-lg shadow-amber-900/40" 
                                          : "text-stone-500 hover:text-white"
                                      )}
                                    >
                                      Q{q}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <button 
                                disabled={loadingGroup === key}
                                onClick={() => handleResetBracket(key)}
                                className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-transparent border border-red-500/20 text-red-500 hover:bg-red-600 hover:text-white"
                                title="Resetar Chave"
                              >
                                {loadingGroup === key ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                              </button>

                              {/* Botão de Finalizar Categoria e Gerar Pódio — Poomsae, Kyopa e Kyorugui */}
                              {groupMatches.length > 0 &&
                               !groupMatches.some(m => m.status !== 'finished') &&
                               !groupAthletes.some(a => a.place) && (
                                <button 
                                  onClick={async () => {
                                    if (confirm(`Deseja calcular o ranking e gerar o pódio para "${key}"?`)) {
                                      setLoadingGroup(key);
                                      try {
                                        if (selectedCategory === 'Kyorugui') {
                                          const result = await processCourtRanking(groupMatches[0].courtId, key, 'kyorugui');
                                          if (!result.success) throw new Error('Falha no processamento do ranking de Kyorugui');
                                        } else {
                                          await finalizeModalityCategory(key, selectedCategory as any);
                                        }
                                        alert('Pódio gerado com sucesso! Verifique a aba de Resultados.');
                                      } catch (e) {
                                        alert('Erro ao finalizar: ' + (e as any).message);
                                      } finally {
                                        setLoadingGroup(null);
                                      }
                                    }
                                  }}
                                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-emerald-600/10 border border-emerald-600/20 text-emerald-500 hover:bg-emerald-600 hover:text-white"
                                  title="Finalizar Categoria e Gerar Pódio"
                                >
                                  {loadingGroup === key ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="p-6 space-y-4">
                      {/* Pódio Oficial - Visualização de Resultados */}
                      {isCategoryFinished && podiumAthletes.some(a => a.place) && (
                        <div className="mb-10 p-8 bg-gradient-to-b from-white/[0.04] to-transparent border border-white/5 rounded-[32px] overflow-hidden relative group/podium shadow-2xl">
                          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-40 shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
                          
                          <div className="flex flex-col items-center mb-10">
                            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-3">
                              <Trophy className="w-3 h-3 text-emerald-500" />
                              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Resultado de Honra</span>
                            </div>
                            <h4 className="text-2xl font-black text-white uppercase tracking-tighter">Pódio Oficial</h4>
                            <div className="h-1 w-12 bg-emerald-500/30 rounded-full mt-2" />
                          </div>

                          <div className="flex flex-col md:flex-row items-end justify-center gap-4 min-h-[220px]">
                            {/* 2º LUGAR */}
                            {podiumAthletes.find(a => Number(a.place) === 2) && (
                              <div className="w-full md:w-36 flex flex-col items-center animate-in slide-in-from-bottom-6 duration-700 delay-200">
                                <div className="p-4 bg-slate-300 rounded-2xl mb-2 shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/50 text-black transform hover:scale-105 transition-transform duration-500">
                                  <Medal className="w-7 h-7" />
                                </div>
                                <div className="h-24 w-full bg-slate-400/10 border-x border-t border-white/10 rounded-t-2xl flex flex-col items-center p-3">
                                  <span className="text-[10px] font-black text-slate-300 mb-2 uppercase tracking-widest">2º LUGAR</span>
                                  <p className="text-[11px] font-bold text-white uppercase text-center line-clamp-2 leading-snug">
                                    {podiumAthletes.find(a => Number(a.place) === 2)?.name}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* 1º LUGAR */}
                            {podiumAthletes.find(a => Number(a.place) === 1) && (
                              <div className="w-full md:w-48 flex flex-col items-center z-10 animate-in slide-in-from-bottom-12 duration-1000">
                                <div className="p-6 bg-gradient-to-br from-amber-300 to-amber-600 rounded-3xl mb-3 shadow-[0_0_40px_rgba(245,158,11,0.4)] border-2 border-amber-200 text-black transform scale-110 shadow-amber-500/20">
                                  <Trophy className="w-10 h-10" />
                                </div>
                                <div className="h-40 w-full bg-amber-500/10 border-x border-t border-amber-500/40 rounded-t-[32px] flex flex-col items-center p-4 relative overflow-hidden backdrop-blur-md">
                                  <div className="absolute inset-0 bg-gradient-to-t from-amber-500/10 to-transparent opacity-50" />
                                  <span className="text-sm font-black text-amber-500 mb-3 tracking-[0.3em] uppercase">Campeão</span>
                                  <p className="text-[13px] font-black text-white uppercase text-center line-clamp-2 leading-tight">
                                    {podiumAthletes.find(a => Number(a.place) === 1)?.name}
                                  </p>
                                  <p className="text-[8px] font-bold text-amber-500/70 uppercase mt-3 tracking-widest">
                                    {podiumAthletes.find(a => Number(a.place) === 1)?.academy}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* 3º LUGAR */}
                            {podiumAthletes.find(a => Number(a.place) === 3) && (
                              <div className="w-full md:w-36 flex flex-col items-center animate-in slide-in-from-bottom-6 duration-700 delay-500">
                                <div className="p-4 bg-orange-700 rounded-2xl mb-2 shadow-[0_0_20px_rgba(194,65,12,0.1)] border border-orange-500/30 text-white transform hover:scale-105 transition-transform duration-500">
                                  <Medal className="w-7 h-7" />
                                </div>
                                <div className="h-20 w-full bg-orange-700/10 border-x border-t border-white/10 rounded-t-2xl flex flex-col items-center p-3">
                                  <span className="text-[10px] font-black text-orange-600 mb-2 uppercase tracking-widest">3º LUGAR</span>
                                  <p className="text-[11px] font-bold text-white uppercase text-center line-clamp-2 leading-snug">
                                    {podiumAthletes.find(a => Number(a.place) === 3)?.name}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Painel de Controle de Fila Unificado - Estado da Arte */}
                      {profile?.role === 'admin' && groupMatches.length > 0 && (
                        <div className="mb-6 bg-black/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                          <div className="bg-gradient-to-r from-red-600/20 to-transparent p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.4)]">
                                <Radio className="w-5 h-5 text-white animate-pulse" />
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Controle de Fila</p>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-white font-black uppercase text-xs tracking-tight">Painel de Comando Live</h4>
                                  {groupMatches[0].courtId && (
                                     <span className="px-1.5 py-0.5 bg-amber-500 rounded text-[8px] font-black text-black">Q{groupMatches[0].courtId}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {/* Ações em Lote */}
                              {profile?.role === 'admin' && (
                                  <Button 
                                    onClick={async () => {
                                      if (!groupMatches.length) return;
                                      setIsProcessingMatch('batch');
                                      try {
                                        const needsCourt = groupMatches.filter(m => !m.courtId && m.status === 'scheduled').map(m => m.id);
                                        if (needsCourt.length > 0) {
                                          await assignMatchesToCourt(needsCourt, selectedCategory as any);
                                        }
                                        const toCall = groupMatches.filter(m => m.status === 'scheduled').map(m => m.id);
                                        if (toCall.length > 0) await batchCallMatches(toCall);
                                      } finally {
                                        setIsProcessingMatch(null);
                                      }
                                    }}
                                    disabled={isProcessingMatch !== null || !groupMatches.some(m => m.status === 'scheduled') || isCategoryFinished}
                                    variant="ghost"
                                    className="h-10 px-4 text-[9px] font-black uppercase tracking-widest gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-30"
                                  >
                                  <PlaySquare className="w-3.5 h-3.5" />
                                  Chamar Todas
                                </Button>
                              )}

                              {profile?.role === 'admin' && groupMatches.some(m => (m.status === 'scheduled' || m.status === 'live') && m.courtId) && (
                                <Button 
                                  onClick={async () => {
                                    if (!confirm("Isso removerá toda a fila desta categoria da quadra. Os atletas voltarão ao estado pendente. Deseja continuar?")) return;
                                    setIsProcessingMatch('batch');
                                    try {
                                      const toReset = groupMatches.filter(m => (m.status === 'scheduled' || m.status === 'live') && m.courtId).map(m => m.id);
                                      await batchResetCourtMatches(toReset);
                                    } finally {
                                      setIsProcessingMatch(null);
                                    }
                                  }}
                                  disabled={isProcessingMatch !== null || isCategoryFinished}
                                  variant="ghost"
                                  className="h-10 px-4 text-[9px] font-black uppercase tracking-widest gap-2 bg-stone-500/10 border border-white/5 text-stone-400 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Limpar Fila
                                </Button>
                              )}

                              {/* Chamada Individual (Next) */}
                              {groupMatches.some(m => m.status === 'scheduled') && (
                                <Button 
                                  onClick={async () => {
                                    const next = [...groupMatches]
                                      .sort((a,b) => {
                                        if (a.round !== b.round) return (a.round || 1) - (b.round || 1);
                                        return (a.matchNumber || 0) - (b.matchNumber || 0);
                                      })
                                      .find(m => m.status === 'scheduled');
                                      
                                    if (next) {
                                      setIsProcessingMatch(next.id);
                                      try {
                                        if (!next.courtId) {
                                          await assignMatchesToCourt([next.id], selectedCategory as any);
                                        }
                                        await callMatchInQueue(next.id);
                                      } finally {
                                        setIsProcessingMatch(null);
                                      }
                                    }
                                  }}
                                  disabled={isProcessingMatch !== null || groupMatches.some(m => m.status === 'live') || isCategoryFinished}
                                  variant="danger"
                                  className="h-10 px-6 text-[10px] font-black uppercase tracking-widest gap-2 shadow-[0_0_20px_rgba(220,38,38,0.3)] disabled:opacity-30"
                                >
                                  {isProcessingMatch ? <Loader2 className="w-3 h-3 animate-spin"/> : <Mic className="w-3 h-3" />}
                                  {selectedCategory === 'Kyorugui' ? 'Chamar Próxima' : 'Chamar Próximo'}
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          <div className="p-4 bg-white/[0.02] flex items-center gap-6">
                            {groupMatches.find(m => m.status === 'live') ? (
                              <div className="flex-1 flex items-center gap-4 animate-in zoom-in-95 duration-500">
                                <div className="px-3 py-1 bg-emerald-500 text-white text-[9px] font-black rounded-lg uppercase tracking-tighter">EM QUADRA</div>
                                <div className="flex flex-col">
                                  <p className="text-white font-black uppercase tracking-tight text-sm">
                                    {groupMatches.find(m => m.status === 'live')?.competitorA?.name}
                                    <span className="text-stone-600 italic px-2">VS</span>
                                    {groupMatches.find(m => m.status === 'live')?.competitorB?.name || '---'}
                                  </p>
                                  <div className="flex items-center gap-3 mt-0.5">
                                    <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest">{groupMatches.find(m => m.status === 'live')?.competitorA?.academy || ''}</span>
                                    <div className="w-1 h-1 rounded-full bg-stone-700" />
                                    <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest">{groupMatches.find(m => m.status === 'live')?.competitorB?.academy || ''}</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex-1 text-stone-600 text-[10px] font-bold uppercase italic">Aguardando chamada...</div>
                            )}
                            
                            <div className="flex items-center gap-2 border-l border-white/5 pl-6">
                              <span className="text-[9px] font-black text-stone-500 uppercase">Progresso</span>
                              <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-red-600 transition-all duration-1000" 
                                  style={{ width: `${(groupMatches.filter(m => m.status === 'finished').length / groupMatches.length) * 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-black text-white">
                                {groupMatches.filter(m => m.status === 'finished').length}/{groupMatches.length}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedCategory === 'Kyorugui' && groupMatches.length > 0 ? (
                        <div className="pt-4 overflow-x-auto scrollbar-hide">
                          <BracketTree 
                            matches={groupMatches}
                            isAdmin={profile?.role === 'admin'}
                            onSetWinner={(matchId, winnerId, reason) => {
                              const match = groupMatches.find(m => m.id === matchId);
                              if (!match) return;
                              
                              const scoreA = match.competitorA?.score || 0;
                              const scoreB = match.competitorB?.score || 0;
                              
                              const winReason = reason || (scoreA === scoreB ? 'points' : 'points');

                              if (scoreA === scoreB && winReason === 'points') {
                                const winnerName = match.competitorA?.athleteId === winnerId 
                                  ? match.competitorA.name 
                                  : match.competitorB?.name;
                                
                                setTieBreakMatch({ id: matchId, winnerId, winnerName: winnerName || 'Atleta' });
                              } else {
                                setIsProcessingMatch(matchId);
                                advanceWinner(matchId, winnerId, winReason).finally(() => setIsProcessingMatch(null));
                              }
                            }}
                            onUpdateScore={updateMatchScore}
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {groupAthletes.map((athlete, idx) => {
                            const match = groupMatches.find(m => m.competitorA?.athleteId === athlete.regId);
                            const isFinished = match?.status === 'finished';
                            const isLive = match?.status === 'live';

                            return (
                              <div key={athlete.id} className="relative group/athlete">
                                <div className={cn(
                                  "transition-all",
                                  isLive ? "bg-emerald-500/5 ring-1 ring-emerald-500/20 rounded-xl" : ""
                                )}>
                                  <div className="relative">
                                    <AthleteDraggable 
                                      athlete={athlete}
                                      idx={idx}
                                      fightRules={selectedCategory === 'Kyorugui' ? getFightRules(athlete.belt, athlete.isElite) : null}
                                      isAdmin={profile?.role === 'admin'}
                                      selectedCategory={selectedCategory}
                                      onUpdateScores={handleUpdateScores}
                                      groupKey={key}
                                      groupAthletesCount={groupAthletes.length}
                                      match={match}
                                    />
                                    
                                    {/* Botão de Reset se estiver em categoria movida */}
                                    {profile?.role === 'admin' && athlete.isManuallyAssigned && !athlete.isMatched && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (confirm(`Remover atribuição personalizada de ${athlete.name}? Ele voltará para sua chave original.`)) {
                                            handleResetMatch(athlete.regId, selectedCategory === 'Kyopa' ? key.split(' - ')[0] : selectedCategory);
                                          }
                                        }}
                                        className="absolute -left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-amber-600 border border-amber-400/50 flex items-center justify-center text-white hover:bg-amber-500 hover:scale-110 transition-all z-20 shadow-lg shadow-amber-900/40"
                                        title="Resetar para Categoria Original"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
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
                  {Object.keys(groupedAthletes)
                    .filter(k => {
                      const groupAthletes = groupedAthletes[k];
                      // Trava de Gênero Automática no Modal
                      const soloAthlete = mergeSourceAthlete;
                      const targetGender = groupAthletes[0]?.gender;
                      
                      // Se temos um atleta solo sendo fundido, validar gênero
                      if (soloAthlete && targetGender && soloAthlete.gender !== targetGender) return false;
                      
                      return k !== Object.keys(groupedAthletes).find(gk => groupedAthletes[gk].length === 1 && groupedAthletes[gk][0].regId === mergeSourceAthlete.regId);
                    })
                    .map((k) => (
                      <button
                        key={k}
                        onClick={() => {
                          const targetRegId = groupedAthletes[k][0].regId;
                          setSelectedTargets(prev => 
                            prev.includes(targetRegId) ? prev.filter(id => id !== targetRegId) : [...prev, targetRegId]
                          );
                        }}
                        className={cn(
                          "w-full text-left p-4 rounded-xl border transition-all group",
                          selectedTargets.includes(groupedAthletes[k][0].regId) ? "bg-amber-600/20 border-amber-500/50" : "bg-white/5 border-white/5 hover:bg-amber-500/10 hover:border-amber-500/30"
                        )}
                      >
                        <p className="font-black text-white text-sm uppercase">{k}</p>
                        <p className="text-[10px] text-stone-500 uppercase font-bold mt-1 group-hover:text-amber-500">{groupedAthletes[k].length} Atletas Inscritos</p>
                      </button>
                    ))}
                </div>

                <div className="p-8 bg-black/40 border-t border-white/5 flex items-center justify-between gap-4">
                  <Button variant="ghost" onClick={() => setIsMergeModalOpen(false)}>Cancelar</Button>
                  <Button 
                    variant="success" 
                    disabled={selectedTargets.length === 0}
                    onClick={async () => {
                      const targetGroup = Object.keys(groupedAthletes).find(gk => groupedAthletes[gk].length === 1 && groupedAthletes[gk][0].regId === mergeSourceAthlete.regId);
                      if (!targetGroup) return;
                      for (const regId of selectedTargets) {
                        const s = Object.values(groupedAthletes).flat().find(a => a.regId === regId);
                        if (s) await mergeCategory(regId, s.assignedCategory, targetGroup, s.name);
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

        <WinnerReasonModal 
          isOpen={!!tieBreakMatch}
          winnerName={tieBreakMatch?.winnerName || ''}
          onClose={() => setTieBreakMatch(null)}
          onSelect={async (reason) => {
            if (!tieBreakMatch) return;
            setIsProcessingMatch(tieBreakMatch.id);
            try {
              await advanceWinner(tieBreakMatch.id, tieBreakMatch.winnerId, reason);
            } finally {
              setIsProcessingMatch(null);
              setTieBreakMatch(null);
            }
          }}
        />

        <DragOverlay dropAnimation={null}>
          {activeAthlete ? (
            <div className="bg-amber-600 border-2 border-white/20 p-4 rounded-2xl shadow-2xl backdrop-blur-xl w-[280px] rotate-3 cursor-grabbing">
              <p className="font-black text-white uppercase text-xs">{activeAthlete.name}</p>
              <p className="text-[10px] text-white/50 font-bold uppercase mt-1 italic">{activeAthlete.academy}</p>
            </div>
          ) : null}
        </DragOverlay>
        {isCourtQueueModalOpen && (
          <CourtQueueModal matches={matches} onClose={() => setIsCourtQueueModalOpen(false)} />
        )}
      </motion.div>
    </DndContext>
  );
}
