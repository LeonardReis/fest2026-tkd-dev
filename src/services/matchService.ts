import { 
  db, 
  auth 
} from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  runTransaction, 
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { Match, OperationType } from '../types';
import { handleFirestoreError } from '../utils';

/**
 * Salva as chaves geradas e processa avanços automáticos (Byes)
 */
export async function saveBracketMatches(matches: Match[]) {
  try {
    const batch = writeBatch(db);
    for (const match of matches) {
      const matchRef = doc(db, 'matches', match.id);
      batch.set(matchRef, {
        ...match,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
    
    // Processar avanços de BYE após garantir que todas as lutas existem
    for (const match of matches) {
      if (match.status === 'finished' && match.winnerId && match.nextMatchId) {
        await advanceWinner(match.id, match.winnerId, match.winnerReason || 'points');
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'matches');
    throw error;
  }
}

/**
 * Reseta o chaveamento de uma categoria específica
 */
export async function resetBracket(groupKey: string, regIds?: string[], disciplineStr?: string) {
  try {
    // Detectar se é um subgrupo (ex: "Categoria - G1") e pegar a base
    const baseGroupKey = groupKey.replace(/\s+-\s+G\d+$/, '');
    
    // 1. Deletar lutas (podem estar na key do subgrupo ou na base)
    const qMatches = query(collection(db, 'matches'), where('groupKey', 'in', [groupKey, baseGroupKey]));
    const snapshot = await getDocs(qMatches);
    const promises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(promises);

    // 2. Resetar status de inscritos
    if (regIds && regIds.length > 0) {
      for (const id of regIds) {
        await runTransaction(db, async (transaction) => {
          const regRef = doc(db, 'registrations', id);
          const regSnap = await transaction.get(regRef);
          if (!regSnap.exists()) return;
          
          const regData = regSnap.data();
          const results = (regData.results || []).filter((r: any) => r.groupKey !== groupKey && r.groupKey !== baseGroupKey);
          
          // Usar a disciplina passada ou inferir pelo groupKey
          let discipline = disciplineStr;
          if (!discipline) {
            discipline = 'Kyorugui'; // default
            if (groupKey.includes('tábuas')) {
               discipline = groupKey.split(' - ')[0];
            } else if (groupKey.includes('Poomsae') || groupKey.includes('Festival')) {
               discipline = 'Poomsae';
            }
          }

          transaction.update(regRef, {
            results,
            isMatched: false,
            [`disciplineStatus.${discipline}.isMatched`]: false
          });
        });
      }
    }

  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'matches');
    throw error;
  }
}

/**
 * Mescla ou move atletas entre categorias
 */
export async function mergeCategory(regId: string, _originGroup: string, targetGroup: string, _name: string) {
  try {
    const discipline = targetGroup.includes('tábuas') ? (targetGroup.split(' - ')[0]) : (targetGroup.includes('|') ? 'Kyorugui' : 'Poomsae');
    await updateDoc(doc(db, 'registrations', regId), {
      [`disciplineStatus.${discipline}.assignedCategory`]: targetGroup,
      [`disciplineStatus.${discipline}.isMatched`]: false
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    throw error;
  }
}

/**
 * Atualiza o placar de uma luta específica
 */
export async function updateMatchScore(matchId: string, position: 'A' | 'B', score: number) {
  try {
    const matchRef = doc(db, 'matches', matchId);
    const field = position === 'A' ? 'competitorA.score' : 'competitorB.score';
    await updateDoc(matchRef, {
      [field]: score,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}

/**
 * Finaliza uma categoria de Poomsae ou Kyopa, calculando o ranking final e gerando pódio.
 */
export async function finalizeModalityCategory(groupKey: string, modality: 'Poomsae' | 'Kyopa') {
  try {
    const q = query(collection(db, 'matches'), where('groupKey', '==', groupKey));
    const snap = await getDocs(q);
    const matches = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));

    if (matches.length === 0) return;

    // 1. Extrair competidores e seus resultados
    let competitors: any[] = [];
    
    if (modality === 'Poomsae') {
      competitors = matches.map(m => ({
        regId: m.competitorA?.athleteId,
        score: m.finalScore || 0,
        presentation: m.finalApresentacao || 0,
        technical: m.finalTecnica || 0
      }));

      // Ordenação Poomsae (WT): Total -> Apresentação -> Técnica
      competitors.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.presentation !== a.presentation) return b.presentation - a.presentation;
        return b.technical - a.technical;
      });
    } else {
      // Kyopa
      competitors = matches.map(m => ({
        regId: m.competitorA?.athleteId,
        broken: m.kyopaResult?.broken || 0,
        attempted: m.kyopaResult?.attempted || 1,
        score: m.finalScore || 0
      }));

      // Ordenação Kyopa: Maior score (que já contém a eficiência embutida pelo scoreboard)
      competitors.sort((a, b) => b.score - a.score);
    }

    // 2. Atribuir lugares e pontos
    const batch = writeBatch(db);
    
    for (let i = 0; i < competitors.length; i++) {
        const comp = competitors[i];
        if (!comp.regId) continue;

        const place = i + 1;
        let points = 0;
        if (place === 1) points = 10;
        else if (place === 2) points = 7;
        else if (place === 3) points = 5;
        else points = 1;

        const regRef = doc(db, 'registrations', comp.regId);
        const regSnap = await getDoc(regRef);
        if (!regSnap.exists()) continue;

        const regData = regSnap.data();
        let results = [...(regData.results || [])];
        const resIdx = results.findIndex(r => r.groupKey === groupKey);

        const resultData = {
          groupKey,
          place,
          points,
          score: comp.score,
          modality: modality,
          finishedAt: new Date().toISOString()
        };

        if (resIdx >= 0) {
          results[resIdx] = { ...results[resIdx], ...resultData };
        } else {
          results.push(resultData);
        }

        batch.update(regRef, { 
          results,
          updatedAt: new Date().toISOString()
        });
    }

    // 3. Marcar partidas como processadas para evitar duplicidade no ranking mesário
    const matchQ = query(collection(db, 'matches'), where('groupKey', '==', groupKey));
    const matchSnap = await getDocs(matchQ);
    matchSnap.docs.forEach(d => {
      batch.update(d.ref, { rankingProcessed: true });
    });

    await batch.commit();
    console.log(`[finalizeModalityCategory] Categoria ${groupKey} finalizada com sucesso.`);
  } catch (error) {
    console.error("Erro ao finalizar categoria:", error);
    throw error;
  }
}

/**
 * Avança o vencedor para o próximo round e gerencia o pódio se for a final ou semifinal (Bronze)
 */
export async function advanceWinner(matchId: string, winnerId: string, reason: Match['winnerReason'] = 'points') {
  try {
    await runTransaction(db, async (transaction) => {
      // 1. LEITURAS (GETS) NO INÍCIO (Obrigatório)
      const matchRef = doc(db, 'matches', matchId);
      const matchSnap = await transaction.get(matchRef);
      if (!matchSnap.exists()) throw new Error('Luta não encontrada');
      
      const matchData = matchSnap.data() as Match;
      
      // Sanitização de IDs para evitar 'undefined' (que quebra o Firestore)
      const safeWinnerId = winnerId || null;
      const loserIdRaw = matchData.competitorA?.athleteId === safeWinnerId 
          ? matchData.competitorB?.athleteId 
          : matchData.competitorA?.athleteId;
      const safeLoserId = loserIdRaw || null;

      // Buscar próxima fase se houver
      let nextMatchSnap = null;
      if (matchData.nextMatchId) {
        nextMatchSnap = await transaction.get(doc(db, 'matches', matchData.nextMatchId));
      }

      // Buscar inscrições dos atletas envolvidos (IDs aqui são IDs de Registro vindos da bracketEngine)
      const winnerRegSnap = safeWinnerId ? await transaction.get(doc(db, 'registrations', safeWinnerId)) : null;
      const loserRegSnap = safeLoserId ? await transaction.get(doc(db, 'registrations', safeLoserId)) : null;

      // 2. ESCRITAS (WRITES) NO FINAL
      console.log(`[advanceWinner] Processando match ${matchId}. Vencedor: ${safeWinnerId} (${reason})`);
      
      // Atualizar a luta atual com o vencedor
      transaction.update(matchRef, {
        winnerId: safeWinnerId,
        winnerReason: reason,
        status: 'finished',
        updatedAt: serverTimestamp()
      });

      // Lógica de Avanço para a próxima luta
      if (matchData.nextMatchId) {
        const nextMatchRef = doc(db, 'matches', matchData.nextMatchId);
        const winnerCompetitor = matchData.competitorA?.athleteId === safeWinnerId ? matchData.competitorA : matchData.competitorB;
        
        if (winnerCompetitor && matchData.positionInNextMatch) {
          console.log(`[advanceWinner] Avançando ${winnerCompetitor.name} para ${matchData.nextMatchId} (${matchData.positionInNextMatch})`);
          transaction.update(nextMatchRef, {
            [matchData.positionInNextMatch]: { ...winnerCompetitor, score: 0 },
            updatedAt: serverTimestamp()
          });
        }

        // Atribuir 3º LUGAR se esta for uma semifinal (a próxima luta é a final)
        if (nextMatchSnap?.exists()) {
          const nextMatchData = nextMatchSnap.data() as Match;
          if (!nextMatchData.nextMatchId && loserRegSnap?.exists()) {
            console.log(`[advanceWinner] Atribuindo 3º Lugar para ${safeLoserId}`);
            let results = [...(loserRegSnap.data().results || [])];
            const idx = results.findIndex(r => r.groupKey === matchData.groupKey);
            const entry = { groupKey: matchData.groupKey, place: 3, points: 5, updatedAt: new Date().toISOString() };
            if (idx >= 0) results[idx] = entry; else results.push(entry);
            transaction.update(loserRegSnap.ref, { results });
          }
        }
      } else {
        // --- É A GRANDE FINAL! ---
        if (winnerRegSnap?.exists()) {
          console.log(`[advanceWinner] Campeão: ${safeWinnerId}`);
          let results = [...(winnerRegSnap.data().results || [])];
          const idx = results.findIndex(r => r.groupKey === matchData.groupKey);
          const entry = { groupKey: matchData.groupKey, place: 1, points: 10, updatedAt: new Date().toISOString() };
          if (idx >= 0) results[idx] = entry; else results.push(entry);
          transaction.update(winnerRegSnap.ref, { results });
        }

        if (loserRegSnap?.exists()) {
          console.log(`[advanceWinner] Vice-Campeão: ${safeLoserId}`);
          let results = [...(loserRegSnap.data().results || [])];
          const idx = results.findIndex(r => r.groupKey === matchData.groupKey);
          const entry = { groupKey: matchData.groupKey, place: 2, points: 7, updatedAt: new Date().toISOString() };
          if (idx >= 0) results[idx] = entry; else results.push(entry);
          transaction.update(loserRegSnap.ref, { results });
        }
      }

      // 3. Auditoria
      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(auditRef, {
        type: 'MATCH_FINISHED',
        timestamp: new Date().toISOString(),
        adminId: auth.currentUser?.uid || 'admin',
        adminEmail: auth.currentUser?.email || '',
        details: { 
          matchId, 
          winnerId: safeWinnerId, 
          loserId: safeLoserId, 
          winnerReason: reason,
          groupKey: matchData.groupKey,
          round: matchData.round,
          isFinal: !matchData.nextMatchId
        }
      });
    });
  } catch (error) {
    console.error('Erro crítico na transação advanceWinner:', error);
    handleFirestoreError(error, OperationType.UPDATE, 'matches');
    throw error;
  }
}
