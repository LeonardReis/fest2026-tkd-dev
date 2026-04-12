import { 
  db 
} from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  runTransaction
} from 'firebase/firestore';
import { OperationType, CourtSession, Match } from '../types';
import { PoomsaeJudgeScore } from '../types/matches';
import { sanitizeForId, handleFirestoreError } from '../utils';
import { generateBracket } from '../utils/bracketEngine';

export type WaitingDevice = {
  id: string;
  name: string;
  pin?: string;
  courtId?: number;
  lastSeen: any;
  status: 'waiting' | 'assigned' | 'active';
};

export interface PodiumWinner {
  place: 1 | 2 | 3;
  athleteName: string;
  academy: string;
  score?: number;
}

export type PodiumData = Record<string, PodiumWinner[]>;

// PIN de acesso global para a Arena (estático para simplicidade operacional no evento)
export const ARENA_ACCESS_PIN = "202611"; 


export async function generateCourtSession(courtId: 1 | 2 | 3, type: 'kyorugui' | 'poomsae', judgeCount: number = 3, createdBy: string) {
  try {
    const sessionRef = doc(collection(db, 'court_sessions'));
    
    // Set expiration to 48h from now for stability
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + 48);
    
    const session: CourtSession = {
      id: sessionRef.id,
      courtId,
      type,
      ...(type === 'poomsae' ? { judgeCount } : {}),
      active: true,
      expiresAt: expiration.toISOString(),
      label: `Quadra ${courtId} - ${type === 'poomsae' ? 'Poomsae' : 'Kyorugui'}`,
      createdBy
    };

    await setDoc(sessionRef, session);
    return session;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'court_sessions');
    throw error;
  }
}

export async function revokeCourtSession(sessionId: string) {
  try {
    await updateDoc(doc(db, 'court_sessions', sessionId), {
      active: false,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'court_sessions');
    throw error;
  }
}

export async function revokeAllSessions(sessionIds: string[]) {
  try {
    const batch = writeBatch(db);
    sessionIds.forEach(id => {
      batch.update(doc(db, 'court_sessions', id), {
        active: false,
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'court_sessions');
    throw error;
  }
}

export async function validateCourtSession(sessionId: string): Promise<CourtSession | null> {
  const identifier = sessionId?.slice(0, 6) + '...';
  console.log(`[CourtService] Validando sessão: ${identifier}`);
  
  // IDs Fixos são auto-curáveis para máxima estabilidade
  const isFixed = sessionId.startsWith('arena_court_');
  
  try {
    const snap = await getDoc(doc(db, 'court_sessions', sessionId));
    if (!snap.exists()) {
      if (isFixed) {
        console.warn(`[CourtService] 🔧 ID Fixo ${sessionId} não encontrado. Provisionando agora...`);
        const courtId = parseInt(sessionId.split('_').pop() || '1') as 1|2|3;
        return await provisionFixedSession(courtId);
      }
      console.warn(`[CourtService] ❌ Sessão ${identifier} NÃO ENCONTRADA no projeto.`);
      return null;
    }
    
    const session = snap.data() as CourtSession;
    if (!session.active) {
      if (isFixed) {
        console.warn(`[CourtService] 🔧 Reativando ID Fixo ${sessionId} automaticamente.`);
        await updateDoc(doc(db, 'court_sessions', sessionId), { active: true, updatedAt: serverTimestamp() });
        return { ...session, active: true, id: snap.id };
      }
      console.warn(`[CourtService] ⚠️ Sessão ${identifier} está INATIVA.`);
      return null;
    }
    
    console.log(`[CourtService] ✅ Sessão ${identifier} validada com sucesso.`);
    return { ...session, id: snap.id };
  } catch (error) {
    console.error(`[CourtService] 🚨 Erro crítico validando sessão ${identifier}:`, error);
    return null;
  }
}

async function provisionFixedSession(courtId: 1|2|3): Promise<CourtSession> {
  const sessionId = `arena_court_${courtId}`;
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + 720); // 30 dias para IDs fixos
  
  const session: CourtSession = {
    id: sessionId,
    courtId,
    type: courtId === 1 ? 'poomsae' : 'kyorugui',
    active: true,
    expiresAt: expiration.toISOString(),
    label: `Quadra ${courtId} - ${courtId === 1 ? 'POOMSAE / KYOPA' : 'KYORUGUI / FESTIVAL'}`,
    createdBy: 'system'
  };

  await setDoc(doc(db, 'court_sessions', sessionId), session);
  return session;
}

/**
 * Pulso silencioso para manter a sessão da quadra ativa e monitorada.
 */
export async function pingCourtSession(sessionId: string) {
  try {
    const sessionRef = doc(db, 'court_sessions', sessionId);
    await updateDoc(sessionRef, {
      lastActive: serverTimestamp()
    });
  } catch (error) {
    // Falha silenciosa para não interromper a UI
    console.warn('[CourtService] Falha no ping da sessão:', sessionId);
  }
}

/**
 * Garante que todas as sessões fixas existam no banco.
 * Útil para chamar no init do admin dashboard.
 */
export async function ensureFixedSessions(): Promise<void> {
  console.log("[CourtService] Sincronizando Infraestrutura de Arena Estática...");
  for (const courtId of [1, 2, 3]) {
    await provisionFixedSession(courtId as 1|2|3);
  }
}

export async function callMatch(matchId: string) {
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'live',
      calledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}

export async function postponeMatch(matchId: string) {
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'scheduled',
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}

export async function callMatchInQueue(matchId: string) {
  // Alias for readability in queue context
  return callMatch(matchId);
}

/**
 * Chama múltiplas lutas para o status 'live' atomicamente (Ação Atômica)
 */
export async function batchCallMatches(matchIds: string[]) {
  try {
    const batch = writeBatch(db);
    matchIds.forEach((id, index) => {
      batch.update(doc(db, 'matches', id), {
        status: index === 0 ? 'live' : 'scheduled',
        calledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}

/**
 * Remove múltiplas lutas da fila da quadra (Ação Atômica)
 */
export async function batchResetCourtMatches(matchIds: string[]) {
  try {
    const batch = writeBatch(db);
    matchIds.forEach(id => {
      batch.update(doc(db, 'matches', id), {
        courtId: null,
        matchSequence: null,
        status: 'scheduled', // Opcional: garantir que voltem ao agendado se estivessem live
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}


export async function finishMatch(matchId: string, woPlayer?: 'A' | 'B', scoreA?: number, scoreB?: number) {
  try {
    const updates: any = {
      status: 'finished',
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    if (woPlayer) {
      updates.woPlayer = woPlayer;
      updates.winner = woPlayer === 'A' ? 'competitorB' : 'competitorA'; // WO: adversário vence
    }
    if (scoreA !== undefined && scoreB !== undefined) {
      updates.finalScoreA = scoreA;
      updates.finalScoreB = scoreB;
      if (scoreA > scoreB) updates.winner = 'competitorA';
      else if (scoreB > scoreA) updates.winner = 'competitorB';
      // Empate pode ser tratado pela regra da categoria
    }
    await updateDoc(doc(db, 'matches', matchId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}

// =================================================================
// Cálculo WT (World Taekwondo) para Poomsae
// =================================================================

/**
 * Média com descarte WT: se >= 5 árbitros, descarta o maior e o menor.
 */
function wtAverage(values: number[], judgeCount: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const effective = (judgeCount >= 5 && sorted.length >= 5) ? sorted.slice(1, -1) : sorted;
  const sum = effective.reduce((acc, v) => acc + v, 0);
  return +(sum / effective.length).toFixed(3);
}

/**
 * Calcula a nota final WT a partir das notas individuais de cada juiz.
 * Aplica descarte separado em Técnica e em cada critério de Apresentação.
 */
export function calculateWTPoomsaeScore(
  scores: Record<string, PoomsaeJudgeScore>,
  judgeCount: number
): { finalScore: number; finalTecnica: number; finalApresentacao: number } {
  const values = Object.values(scores);
  if (values.length === 0) return { finalScore: 0, finalTecnica: 0, finalApresentacao: 0 };

  const finalTecnica = wtAverage(values.map(v => v.tecnica), judgeCount);
  const finalVelocidade = wtAverage(values.map(v => v.velocidade), judgeCount);
  const finalRitmo = wtAverage(values.map(v => v.ritmo), judgeCount);
  const finalExpressao = wtAverage(values.map(v => v.expressao), judgeCount);
  const finalApresentacao = +(finalVelocidade + finalRitmo + finalExpressao).toFixed(3);
  const finalScore = +(finalTecnica + finalApresentacao).toFixed(2);

  return { finalScore, finalTecnica, finalApresentacao };
}

export async function submitPoomsaeScore(
  matchId: string,
  judgeIndex: number,
  judgeScore: PoomsaeJudgeScore,
  expectedJudgeCount: number
) {
  try {
    const matchRef = doc(db, 'matches', matchId);
    
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(matchRef);
      if (!snap.exists()) throw new Error('Match not found');

      const match = snap.data() as Match;
      const scores: Record<string, PoomsaeJudgeScore> = (match.poomsaeScores as any) || {};
      
      // Adiciona a nova nota
      scores[`judge_${judgeIndex}`] = judgeScore;

      const updates: any = {
        poomsaeScores: scores,
        updatedAt: serverTimestamp()
      };

      // Se todos os árbitros já enviaram → calcular nota final WT
      if (Object.keys(scores).length >= expectedJudgeCount) {
        const { finalScore, finalTecnica, finalApresentacao } = calculateWTPoomsaeScore(scores, expectedJudgeCount);
        updates.finalScore = finalScore;
        updates.finalTecnica = finalTecnica;
        updates.finalApresentacao = finalApresentacao;
      }

      transaction.update(matchRef, updates);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}

export async function updateMatchRoundScore(
  matchId: string, 
  currentRound: 1 | 2 | 3, 
  roundScores: Match['roundScores']
) {
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      currentRound,
      roundScores,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}




// Distribuição dinâmica de filas
export async function getNextSequenceForCourt(courtId: 1|2|3): Promise<number> {
  try {
    const q = query(
      collection(db, 'matches'),
      where('courtId', '==', courtId),
      orderBy('matchSequence', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return courtId * 100 + 1; // 101, 201, 301
    }
    return (snap.docs[0].data().matchSequence || (courtId * 100)) + 1;
  } catch (error: any) {
    console.error("Erro ao buscar próxima sequência para a quadra:", error);
    return 1;
  }
}

export async function getNextSequenceForModality(modality: string): Promise<number> {
  try {
    const q = query(
      collection(db, 'matches'),
      where('modality', '==', modality),
      orderBy('modalitySequence', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return 1;
    return (snap.docs[0].data().modalitySequence || 0) + 1;
  } catch (error: any) {
    console.error("Erro ao buscar próxima sequência para a modalidade:", error);
    return 1;
  }
}

export async function assignMatchesToCourt(matchIds: string[], modality: 'Poomsae' | 'Kyorugui' | 'Kyopa') {
  try {
    let courtId: 1 | 2 | 3;
    
    if (modality === 'Poomsae' || modality === 'Kyopa') {
      courtId = 1;
    } else {
      // Kyorugui alternado APENAS entre quadras 2 e 3
      const q = query(
        collection(db, 'matches'),
        where('courtId', 'in', [2, 3]),
        orderBy('matchSequence', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      const lastCourt = snap.empty ? 3 : (snap.docs[0].data().courtId as number);
      // Se a última foi 2, vai pra 3. Caso contrário vai pra 2.
      courtId = (lastCourt === 2) ? 3 : 2;
    }

    const startSeq = await getNextSequenceForCourt(courtId);
    const batch = writeBatch(db);
    
    // 3. Verificar se a quadra está livre para autochamada
    const qLive = query(
      collection(db, 'matches'),
      where('courtId', '==', courtId),
      where('status', '==', 'live'),
      limit(1)
    );
    const liveSnap = await getDocs(qLive);
    const isCourtFree = liveSnap.empty;

    matchIds.forEach((id, idx) => {
      const updates: any = {
        courtId,
        matchSequence: startSeq + idx,
        updatedAt: serverTimestamp()
      };

      // Autochamada se for a primeira e a quadra estiver livre
      if (idx === 0 && isCourtFree) {
        updates.status = 'live';
        updates.calledAt = serverTimestamp();
      }

      batch.update(doc(db, 'matches', id), updates);
    });
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}

export async function assignCourtQueues(assignments: { matchId: string; courtId: 1|2|3; sequence: number }[]) {
  try {
    const batch = writeBatch(db);
    
    for (const a of assignments) {
      const ref = doc(db, 'matches', a.matchId);
      batch.update(ref, {
        courtId: a.courtId,
        matchSequence: a.sequence,
        updatedAt: serverTimestamp()
      });
    }
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}

// =================================================================
// Device Hub Service
// =================================================================

export async function registerWaitingDevice(name: string): Promise<string> {
  try {
    const deviceRef = doc(collection(db, 'waiting_devices'));
    const pin = Math.floor(100000 + Math.random() * 900000).toString(); // PIN de 6 dígitos
    
    await setDoc(deviceRef, {
      id: deviceRef.id,
      name,
      pin,
      status: 'waiting',
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp()
    });
    
    return deviceRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'waiting_devices');
    throw error;
  }
}

export async function assignDeviceToCourt(deviceId: string, courtId: 1 | 2 | 3, sessionId: string, refereeName?: string, judgeIndex?: number) {
  // Split into separate updates to isolate errors and make logging clearer
  try {
    const deviceUpdate: any = {
      courtId,
      sessionId,
      refereeName: refereeName || 'Árbitro',
      status: 'assigned',
      updatedAt: serverTimestamp()
    };

    if (judgeIndex !== undefined) {
      deviceUpdate.judgeIndex = judgeIndex;
    }

    // 1. Atualiza o dispositivo (Sempre obrigatório)
    try {
      await updateDoc(doc(db, 'waiting_devices', deviceId), deviceUpdate);
    } catch (error) {
      console.error("Erro Crítico: Falha ao atualizar waiting_devices", error);
      handleFirestoreError(error, OperationType.UPDATE, 'waiting_devices');
      throw error;
    }

    // 2. Atualiza a Sessão da Quadra (Opcional/Secundário)
    // Apenas se for o árbitro principal (index 0 ou não definido)
    if (!judgeIndex || judgeIndex === 0) {
      try {
        const sessionRef = doc(db, 'court_sessions', sessionId);
        const sessionSnap = await getDoc(sessionRef); // Verifica existência primeiro
        
        if (sessionSnap.exists()) {
          await updateDoc(sessionRef, {
            refereeName: refereeName || 'Mesário',
            updatedAt: serverTimestamp()
          });
        } else {
          console.warn(`Aviso: Sessão ${sessionId} não existe no banco. Pulando atualização de nome.`);
        }
      } catch (error) {
        // Registra o log mas não trava o processo principal de atribuição do tablet
        console.warn("Aviso Suave: Falha ao atualizar info em court_sessions. O tablet ainda está pareado.", error);
      }
    }

  } catch (error) {
    // Erro de nível superior já tratado ou relançado
    throw error;
  }
}

export async function updateDeviceHeartbeat(deviceId: string) {
  try {
    await updateDoc(doc(db, 'waiting_devices', deviceId), {
      lastSeen: serverTimestamp()
    });
  } catch (error) {
    // Silently fail for heartbeat to avoid UI noise
  }
}

export async function assignDeviceToPost(deviceId: string, judgeIndex: number) {
  try {
    await updateDoc(doc(db, 'waiting_devices', deviceId), {
      judgeIndex,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Erro ao atribuir posto ao dispositivo:", error);
  }
}

/**
 * Processa o ranking final de todas as categorias concluídas em uma quadra.
 * targetGroupKey: opcional - se fornecido, foca apenas nesta categoria para evitar race conditions.
 * modalityOverride: opcional - se fornecido, usa esta modalidade em vez de tentar deduzir pela quadra.
 * force: opcional - se verdadeiro, processa o ranking mesmo que existam partidas pendentes na categoria.
 */
export async function processCourtRanking(
  courtId: number, 
  targetGroupKey?: string, 
  modalityOverride?: 'kyorugui' | 'poomsae' | 'kyopa',
  force: boolean = false
): Promise<{ success: boolean; winners: PodiumData }> {
  try {
    console.log(`[Ranking] Iniciando processamento para Quadra ${courtId}${targetGroupKey ? ` - Grupo: ${targetGroupKey}` : ''}${force ? ' (MODO FORÇADO)' : ''}`);
    const batch = writeBatch(db);
    const winnersByGroup: PodiumData = {};

    // 1. Buscar partidas desta quadra
    let q;
    if (targetGroupKey) {
      if (force) {
        // Modo forçado ignora filtro de 'finished' no nível do banco
        q = query(collection(db, 'matches'), where('courtId', '==', courtId), where('groupKey', '==', targetGroupKey));
      } else {
        q = query(collection(db, 'matches'), where('courtId', '==', courtId), where('groupKey', '==', targetGroupKey), where('status', '==', 'finished'));
      }
    } else {
      q = query(collection(db, 'matches'), where('courtId', '==', courtId), where('status', '==', 'finished'));
    }

    const snap = await getDocs(q);
    const allFound = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as Match));
    
    console.log(`[Ranking] Total de lutas encontradas no banco: ${allFound.length}`);

    const matches = allFound.filter(m => (
      (targetGroupKey && !force ? m.status === 'finished' : true) &&
      (targetGroupKey ? true : !m.rankingProcessed) &&
      !(m.competitorA?.isBye) &&
      !(m.competitorB?.isBye)
    ));

    if (matches.length === 0) {
      console.log("[Ranking] Nenhuma luta nova qualificada para processamento.");
      return { success: true, winners: {} };
    }

    // 2. Agrupar por categoria (groupKey)
    const groups: Record<string, Match[]> = {};
    matches.forEach(m => {
      if (!groups[m.groupKey]) groups[m.groupKey] = [];
      groups[m.groupKey].push(m);
    });

    let processedCount = 0;

    for (const groupKey in groups) {
      const catMatches = groups[groupKey];
      // Inferência robusta de modalidade
      const inferred = groupKey.includes('|') ? 'Kyorugui' : (groupKey.includes('tábuas') ? 'Kyopa' : (courtId === 1 ? 'Poomsae' : 'Kyorugui'));
      const rawMod = (modalityOverride || inferred).toLowerCase();
      const modality = (rawMod === 'kyopa' ? 'Kyopa' : (rawMod === 'poomsae' ? 'Poomsae' : 'Kyorugui')) as 'Kyorugui' | 'Poomsae' | 'Kyopa';
      const isPoomsaeLike = modality === 'Poomsae' || modality === 'Kyopa';

      console.log(`[Ranking] Processando grupo: ${groupKey} (${modality})`);
      const podium: PodiumWinner[] = [];

      if (isPoomsaeLike) {
        // Ordenação Poomsae/Kyopa com Tie-Break
        const sorted = [...catMatches].sort((a, b) => {
          if ((b.finalScore || 0) !== (a.finalScore || 0)) return (b.finalScore || 0) - (a.finalScore || 0);
          if (modality === 'Poomsae') {
            if ((b.finalApresentacao || 0) !== (a.finalApresentacao || 0)) return (b.finalApresentacao || 0) - (a.finalApresentacao || 0);
            return (b.finalTecnica || 0) - (a.finalTecnica || 0);
          }
          return 0;
        });
        for (let i = 0; i < Math.min(4, sorted.length); i++) { // Top 4 para cobrir até bronze (ou 1pt extra se necessário)
          const match = sorted[i];
          const athlete = match.competitorA;
          const place = (i + 1) as 1 | 2 | 3;
          if (athlete) {
            let points = 0;
            if (place === 1) points = 10;
            else if (place === 2) points = 7;
            else if (place === 3) points = 5;

            console.log(`[Ranking] ${place}º lugar: ${athlete.name} (${match.finalScore} pts)`);
            await updateRegistrationResult(batch, athlete.athleteId, {
              groupKey,
              place,
              score: match.finalScore,
              points: points, // Medal points
              matchPoints: 0, // Resetar pontos de vitórias individuais para foco apenas em medalhas
              modality
            });
            podium.push({ place, athleteName: athlete.name, academy: athlete.academy, score: match.finalScore });
          }
          batch.update(doc(db, 'matches', match.id), { rankingProcessed: true });
        }
      } else {
        // Kyorugui: Achar a FINAL (luta sem nextMatchId)
        const finalMatch = catMatches.find(m => !m.nextMatchId);
        
        if (finalMatch && finalMatch.winnerId) {
          const winnerId = finalMatch.winnerId;
          const isWinnerA = String(winnerId) === String(finalMatch.competitorA?.athleteId);
          const winner = isWinnerA ? finalMatch.competitorA : finalMatch.competitorB;
          const loser = isWinnerA ? finalMatch.competitorB : finalMatch.competitorA;

          if (winner) {
            console.log(`[Ranking] 1º lugar (Ouro): ${winner.name}`);
            await updateRegistrationResult(batch, winner.athleteId, {
              groupKey,
              place: 1,
              points: 10,
              matchPoints: 0, // Resetar conforme regra WT focada em medalhas
              modality
            });
            podium.push({ place: 1, athleteName: winner.name, academy: winner.academy });
          }
          if (loser) {
            console.log(`[Ranking] 2º lugar (Prata): ${loser.name}`);
            await updateRegistrationResult(batch, loser.athleteId, {
              groupKey,
              place: 2,
              points: 7,
              matchPoints: 0, // Resetar conforme regra WT focada em medalhas
              modality
            });
            podium.push({ place: 2, athleteName: loser.name, academy: loser.academy });
          }

          // 3º lugar: Perdedores das Semifinais
          const semiMatches = catMatches.filter(m => m.nextMatchId === finalMatch.id);
          for (const semi of semiMatches) {
            const semiWinnerId = semi.winnerId;
            const semiLoserId = semiWinnerId === semi.competitorA?.athleteId ? semi.competitorB?.athleteId : semi.competitorA?.athleteId;
            const semiLoser = semi.competitorA?.athleteId === semiLoserId ? semi.competitorA : semi.competitorB;
            
            if (semiLoserId && semiLoser && !semiLoser.isBye) {
              console.log(`[Ranking] 3º lugar (Bronze): ${semiLoser.name}`);
              await updateRegistrationResult(batch, semiLoserId, {
                groupKey,
                place: 3,
                points: 5,
                matchPoints: 0, // Resetar para Bronze duplo (WT)
                modality
              });
              podium.push({ place: 3, athleteName: semiLoser.name, academy: semiLoser.academy });
            }
            batch.update(doc(db, 'matches', semi.id), { rankingProcessed: true });
          }
          batch.update(doc(db, 'matches', finalMatch.id), { rankingProcessed: true });
        } else if (finalMatch) {
          console.warn(`[Ranking] Final ${finalMatch.id} ainda não tem vencedor definido.`);
        }
      }

      if (podium.length > 0) {
        winnersByGroup[groupKey] = podium;
        processedCount++;
      }
    }

    if (processedCount > 0) {
      await batch.commit();
      console.log(`[Ranking] Processamento concluído com sucesso. ${processedCount} categorias atualizadas.`);
    }
    return { success: true, winners: winnersByGroup };
  } catch (error) {
    console.error("Erro CRÍTICO no processCourtRanking:", error);
    return { success: false, winners: {} };
  }
}

/**
 * Função principal para gerar todas as chaves de um módulo e distribuir nas quadras.
 */
/**
 * Função principal para gerar todas as chaves de um módulo e distribuir nas quadras.
 * Otimizada com sequenciamento intercalado para melhor fluxo da arena.
 */
export async function batchGenerateModuleMatches(
  modality: 'Kyorugui' | 'Poomsae' | 'Kyopa',
  groupedAthletes: Record<string, any[]>,
  festivalId: string = 'fest2026'
): Promise<{ categoriesProcessed: number; matchesCreated: number; estimatedMinutes: number }> {
  try {
    const pendingCategories = Object.entries(groupedAthletes).filter(([groupKey, athletes]) => {
      // Pular categorias com menos de 2 atletas (solo) ou que já foram processadas
      return athletes.length >= 2 && !athletes.some(a => a.isMatched);
    });

    if (pendingCategories.length === 0) {
      return { categoriesProcessed: 0, matchesCreated: 0, estimatedMinutes: 0 };
    }

    // 1. Determinar sequências iniciais por quadra
    const courtSequences: Record<number, number> = {
      1: await getNextSequenceForCourt(1),
      2: await getNextSequenceForCourt(2),
      3: await getNextSequenceForCourt(3),
    };

    let modalitySeq = await getNextSequenceForModality(modality);

    // 2. Determinar a última quadra de Kyorugui para alternar (entre 2 e 3)
    const kMatchQ = query(collection(db, 'matches'), where('courtId', 'in', [2, 3]), orderBy('matchSequence', 'desc'), limit(1));
    const kSnap = await getDocs(kMatchQ);
    let lastKyoruguiCourt = kSnap.empty ? 3 : (kSnap.docs[0].data().courtId as number);

    const categoriesMatches: { targetCourtId: 1|2|3, matches: Match[], athletes: any[], groupKey: string }[] = [];

    // 3. Gerar todas as lutas primeiro (sem salvar)
    for (const [groupKey, athletes] of pendingCategories) {
      const catAthletes = athletes.map(a => ({ id: a.regId, name: a.name, academy: a.academy }));
      const categoryId = sanitizeForId(groupKey);
      let newMatches: Match[] = [];
      let targetCourtId: 1 | 2 | 3 = 1;

      if (modality === 'Kyorugui') {
        newMatches = generateBracket(festivalId, categoryId, groupKey, catAthletes);
        newMatches.sort((a, b) => {
          if (a.round !== b.round) return a.round - b.round;
          return a.matchNumber - b.matchNumber;
        });
        targetCourtId = (lastKyoruguiCourt === 2 ? 3 : 2) as 1|2|3;
        lastKyoruguiCourt = targetCourtId;
      } else {
        const prefix = modality === 'Poomsae' ? 'poomsae_' : 'kyopa_';
        const fullCatId = prefix + categoryId;
        const shuffled = [...catAthletes].sort(() => Math.random() - 0.5);
        
        newMatches = shuffled.map((a, idx) => ({
          id: `match_${fullCatId}_${idx + 1}`,
          festivalId,
          categoryId: fullCatId,
          groupKey,
          matchNumber: idx + 1,
          round: 1,
          status: 'scheduled',
          competitorA: { athleteId: a.id, name: a.name, academy: a.academy, score: 0 }
        })) as any[];
        targetCourtId = 1;
      }
      
      // Adicionar metadados de modalidade antes do push
      newMatches = newMatches.map(m => ({ ...m, modality }));
      
      categoriesMatches.push({ targetCourtId, matches: newMatches, athletes, groupKey });
    }

    // 4. Salvar no Firestore com intercalamento (Round Robin de Categorias)
    let batch = writeBatch(db);
    let operationCount = 0;
    let totalMatchesCreated = 0;
    
    // Intercalar: Pega a luta de índice I de todas as categorias, depois índice I+1...
    // Isso garante que a arena não "trave" em uma única categoria por muito tempo.
    const maxMatchesInCategory = Math.max(...categoriesMatches.map(c => c.matches.length));
    
    for (let i = 0; i < maxMatchesInCategory; i++) {
        for (const catData of categoriesMatches) {
            const match = catData.matches[i];
            if (!match) continue;

            if (operationCount > 400) {
                await batch.commit();
                batch = writeBatch(db);
                operationCount = 0;
            }

            const sequence = courtSequences[catData.targetCourtId]++;
            const globalSeq = modalitySeq++;
            
            batch.set(doc(db, 'matches', match.id), {
                ...match,
                courtId: catData.targetCourtId,
                matchSequence: sequence,
                modalitySequence: globalSeq,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            operationCount++;
            totalMatchesCreated++;
        }
    }

    // 5. Atualizar registros dos atletas
    for (const catData of categoriesMatches) {
        for (const athlete of catData.athletes) {
            if (operationCount > 400) {
                await batch.commit();
                batch = writeBatch(db);
                operationCount = 0;
            }

            const discipline = modality === 'Kyopa' ? catData.groupKey.split(' - ')[0] : modality;
            batch.update(doc(db, 'registrations', athlete.regId), {
                [`disciplineStatus.${discipline}`]: {
                    isMatched: true,
                    assignedCategory: catData.groupKey
                },
                updatedAt: serverTimestamp()
            });
            operationCount++;
        }
    }

    await batch.commit();

    return { 
      categoriesProcessed: categoriesMatches.length, 
      matchesCreated: totalMatchesCreated,
      estimatedMinutes: totalMatchesCreated * (modality === 'Kyorugui' ? 7 : modality === 'Poomsae' ? 5 : 3)
    };
  } catch (error) {
    console.error("Erro no batchGenerateModuleMatches:", error);
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}

/**
 * Reseta o estado da arena apenas para uma modalidade específica.
 * Proporciona segurança para corrigir erros sem afetar outros módulos.
 */
export async function resetModalityArena(modality: 'Kyorugui' | 'Poomsae' | 'Kyopa') {
    try {
        const matchesQ = query(collection(db, 'matches'));
        const matSnap = await getDocs(matchesQ);
        const matches = matSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any));
        
        // Filtrar apenas lutas da modalidade alvo
        const targetMatches = matches.filter(m => {
            if (modality === 'Kyopa') return m.groupKey?.includes('tábuas');
            if (modality === 'Poomsae') return (m.groupKey?.includes('Poomsae') || m.groupKey?.includes('Festival')) && !m.groupKey?.includes('|');
            return m.groupKey?.includes('|'); // Kyorugui usa o pipe no groupKey
        });

        let batch = writeBatch(db);
        let count = 0;

        // 1. Deletar as lutas encontradas
        for (const match of targetMatches) {
            batch.delete(match.ref);
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
            }
        }

        // 2. Resetar atletas vinculados a esta modalidade
        const regQ = query(collection(db, 'registrations'));
        const regSnap = await getDocs(regQ);
        
        for (const docSnap of regSnap.docs) {
            const data = docSnap.data();
            const disciplineStatus = { ...data.disciplineStatus };
            let changed = false;

            Object.keys(disciplineStatus).forEach(key => {
                const isMatch = (modality === 'Kyopa' && key.includes('Kyopa')) ||
                                (modality === 'Poomsae' && (key === 'Poomsae' || key === 'Festival')) ||
                                (modality === 'Kyorugui' && key === 'Kyorugui');
                
                if (isMatch && disciplineStatus[key]?.isMatched) {
                    disciplineStatus[key].isMatched = false;
                    changed = true;
                }
            });

            if (changed) {
                const results = (data.results || []).filter((r: any) => r.modality?.toLowerCase() !== modality.toLowerCase());
                batch.update(docSnap.ref, {
                    disciplineStatus,
                    results,
                    updatedAt: serverTimestamp()
                });
                count++;
                if (count >= 400) {
                    await batch.commit();
                    batch = writeBatch(db);
                    count = 0;
                }
            }
        }

        if (count > 0) await batch.commit();
        return { matchesDeleted: targetMatches.length, athletesReset: '?' };
    } catch (error) {
        console.error("Erro no resetModalityArena:", error);
        handleFirestoreError(error, OperationType.DELETE, 'matches');
        throw error;
    }
}

/**
 * Reseta COMPLETAMENTE o estado da arena para um festival.
 * Deleta todas as partidas e reseta todos os atletas para 'isMatched: false'.
 */
export async function resetAllFestivalArena(festivalId: string = 'fest2026') {
  try {
    const matchesQ = query(collection(db, 'matches'));
    const matSnap = await getDocs(matchesQ);
    
    let batch = writeBatch(db);
    let count = 0;
    
    for (const docSnap of matSnap.docs) {
      batch.delete(docSnap.ref);
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    
    const regQ = query(collection(db, 'registrations'));
    const regSnap = await getDocs(regQ);
    
    for (const docSnap of regSnap.docs) {
      const data = docSnap.data();
      const disciplineStatus = { ...data.disciplineStatus };
      
      Object.keys(disciplineStatus).forEach(key => {
        if (disciplineStatus[key]) {
          disciplineStatus[key].isMatched = false;
        }
      });

      batch.update(docSnap.ref, {
        isMatched: false,
        disciplineStatus,
        results: [], 
        updatedAt: serverTimestamp()
      });
      
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    return { 
      matchesDeleted: matSnap.size, 
      athletesReset: regSnap.size 
    };

  } catch (error) {
    console.error("Erro no resetAllFestivalArena:", error);
    handleFirestoreError(error, OperationType.DELETE, 'matches');
    throw error;
  }
}


/**
 * Função auxiliar para atualizar o array results de uma Registration
 */
async function updateRegistrationResult(batch: any, regId: string, result: any) {
  try {
    // Acesso direto ao documento pela ID (que no sistema de chaves é a regId)
    const regRef = doc(db, 'registrations', regId);
    const snap = await getDoc(regRef);
    
    if (snap.exists()) {
      const reg = snap.data();
      const currentResults = reg.results || [];
      // Limpar campos undefined para não quebrar o Firestore
      const cleanResult = Object.fromEntries(Object.entries(result).filter(([_, v]) => v !== undefined));

      // Atualizar ou adicionar resultado (mesclando campos se já houver)
      const resIdx = currentResults.findIndex((r: any) => r.groupKey === result.groupKey);
      
      const newEntry = {
        ...cleanResult,
        processedAt: new Date().toISOString()
      };

      if (resIdx >= 0) {
        const existing = currentResults[resIdx];
        
        // Se veio 'points' (vindo do processCourtRanking), tratamos como MedalPoints (substitui o anterior)
        // Se veio 'matchPoints' (vindo do finishAndCycleMatch), incrementamos
        
        let medalPoints = Number(existing.medalPoints || 0);
        const newMedalPoints = cleanResult.points !== undefined ? Number(cleanResult.points) : undefined;
        if (newMedalPoints !== undefined) {
          medalPoints = newMedalPoints;
        }

        let matchPoints = Number(existing.matchPoints || 0);
        const addedMatchPoints = cleanResult.matchPoints !== undefined ? Number(cleanResult.matchPoints) : 0;
        matchPoints += addedMatchPoints;

        // Limpar os campos temporários do newEntry para salvar no formato final
        const { matchPoints: _m, points: _p, ...finalEntry } = newEntry as any;

        currentResults[resIdx] = { 
          ...existing, 
          ...finalEntry,
          medalPoints,
          matchPoints,
          points: medalPoints + matchPoints 
        };
      } else {
        const medalPoints = cleanResult.points !== undefined ? Number(cleanResult.points) : 0;
        const matchPoints = cleanResult.matchPoints !== undefined ? Number(cleanResult.matchPoints) : 0;
        
        const { matchPoints: _m, points: _p, ...finalEntry } = newEntry as any;

        currentResults.push({
          ...finalEntry,
          medalPoints,
          matchPoints,
          points: medalPoints + matchPoints
        });
      }

      if (batch && typeof batch.update === 'function') {
        batch.update(regRef, {
          results: currentResults,
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(regRef, {
          results: currentResults,
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (e) {
    console.error(`Erro ao atualizar registro ${regId}:`, e);
  }
}

/**
 * Finaliza a luta atual e
 */
export async function finishAndCycleMatch(
  matchId: string,
  options: {
    courtId: 1 | 2 | 3;
    isLastOfGroup?: boolean;
    nextMatchId?: string | null; // ID da próxima luta na FILA da quadra
    groupKey?: string;
    winnerId?: string | null;
    scoreA?: number;
    scoreB?: number;
    roundScores?: Match['roundScores'];
    roundWinners?: Match['roundWinners'];
    winnerRounds?: Match['winnerRounds'];
  }
) {
  try {
    // ================================================================
    // FASE 1: Transação atômica — apenas coleção `matches`
    // (registrations é atualizado depois, fora da transação)
    // ================================================================
    await runTransaction(db, async (transaction) => {

      // --- LEITURAS (todas antes de qualquer escrita) ---
      const matchRef = doc(db, 'matches', matchId);
      const matchSnap = await transaction.get(matchRef);
      if (!matchSnap.exists()) throw new Error('Luta não encontrada');
      const matchData = matchSnap.data() as Match;

      const winnerId = options.winnerId || null;

      // --- ESCRITAS ---

      // 2.1 — Finalizar a luta atual
      const updateData: any = {
        status: 'finished',
        winnerId: winnerId,
        finishedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (options.winnerRounds) {
        // Score principal = rounds vencidos (exibido no card do bracket)
        updateData['competitorA.score'] = options.winnerRounds.a;
        updateData['competitorB.score'] = options.winnerRounds.b;
        updateData.winnerRounds = options.winnerRounds;
      } else {
        if (options.scoreA !== undefined) updateData['competitorA.score'] = options.scoreA;
        if (options.scoreB !== undefined) updateData['competitorB.score'] = options.scoreB;
      }

      if (options.roundScores)  updateData.roundScores  = options.roundScores;
      if (options.roundWinners) updateData.roundWinners = options.roundWinners;

      transaction.update(matchRef, updateData);

      // 2.2 — Avançar vencedor na CHAVE (bracket)
      if (matchData.nextMatchId && winnerId) {
        const nextBracketMatchRef = doc(db, 'matches', matchData.nextMatchId);
        const winnerCompetitor = matchData.competitorA?.athleteId === winnerId
          ? matchData.competitorA
          : matchData.competitorB;

        if (winnerCompetitor && matchData.positionInNextMatch) {
          transaction.update(nextBracketMatchRef, {
            // Reseta o score do vencedor para 0 na nova luta
            [matchData.positionInNextMatch]: { ...winnerCompetitor, score: 0 },
            updatedAt: serverTimestamp()
          });
        }
      }

      // 2.3 — Ativar a próxima luta da FILA da quadra
      if (options.nextMatchId && !options.isLastOfGroup) {
        const nextQueueMatchRef = doc(db, 'matches', options.nextMatchId);
        transaction.update(nextQueueMatchRef, {
          status: 'live',
          calledAt: new Date().toISOString(),
          updatedAt: serverTimestamp()
        });
      }
    });

    // ================================================================
    // FASE 2: Atualização de `registrations` (pós-commit, fora da transação)
    // Regra: "affectedKeys().hasOnly(['results', 'updatedAt'])" — permitido por usuário autenticado
    // ================================================================
    const winnerId = options.winnerId || null;
    const groupKey  = options.groupKey  || null;

    if (winnerId && groupKey) {
      try {
        const winnerRegRef  = doc(db, 'registrations', winnerId);
        const winnerRegSnap = await getDoc(winnerRegRef);
        if (winnerRegSnap.exists()) {
          const regData = winnerRegSnap.data();
          const results = [...(regData.results || [])];
          const idx = results.findIndex((r: any) => r.groupKey === groupKey);

          // Inferir modalidade se não fornecida explicitamente
          const inferredModality = 
            groupKey.includes('tábuas') ? 'Kyopa' : 
            (groupKey.includes('|') ? 'Kyorugui' : 'Poomsae');

          // Removida atribuição de matchPoints (+3) para simplificar e unificar ranking conforme WT
          // Agora apenas as medalhas (10, 7, 5) contam no ranking final processado em processCourtRanking
          const resultEntry = {
            groupKey,
            modality: inferredModality,
            updatedAt: new Date().toISOString()
          };
          
          await updateRegistrationResult(null, winnerId, resultEntry);
        }
      } catch (regError: any) {
        // Não bloqueia o fluxo — apenas loga o aviso
        console.warn('[finishAndCycleMatch] Erro ao atualizar registro do vencedor:', regError.message);
      }
    } else if (winnerId && !groupKey) {
      console.warn('[finishAndCycleMatch] groupKey não fornecido — pontos do vencedor não registrados.');
    }


    // ================================================================
    // FASE 3: Ranking Final (se for a última luta do grupo)
    // ================================================================
    let podiumWinners: PodiumData | null = null;
    if (options.isLastOfGroup) {
      // Delay aumentado levemente para garantir consistência eventual do Firestore 
      // (essencial se as leituras do processCourtRanking forem fora da transação)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Inferir modalidade explicitamente para passar ao ranking
      const modality = (options.groupKey || '').includes('|') ? 'kyorugui' : 
                       (options.groupKey || '').includes('tábuas') ? 'kyopa' : 'poomsae';

      const rankingResult = await processCourtRanking(options.courtId, options.groupKey, modality as any);
      if (rankingResult.success) {
        podiumWinners = rankingResult.winners;
      }
    }

    return { success: true, podiumWinners };
  } catch (error: any) {
    console.error('[finishAndCycleMatch] ERRO CRÍTICO:', error.code, error.message);
    throw error;
  }
}

