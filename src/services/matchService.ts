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
  getDoc
} from 'firebase/firestore';
import { Match, OperationType } from '../types';
import { handleFirestoreError } from '../utils';

/**
 * Salva as chaves geradas e processa avanços automáticos (Byes)
 */
export async function saveBracketMatches(matches: Match[]) {
  try {
    for (const match of matches) {
      await setDoc(doc(db, 'matches', match.id), {
        ...match,
        createdAt: serverTimestamp(),
      });
    }
    
    for (const match of matches) {
      if (match.status === 'finished' && match.winnerId && match.nextMatchId) {
        await advanceWinner(match.id, match.winnerId);
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
export async function resetBracket(groupKey: string, regIds?: string[]) {
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
      // Se IDs foram passados, usar eles diretamente (MUITO MAIS CONFIÁVEL)
      const regPromises = regIds.map(id => updateDoc(doc(db, 'registrations', id), {
        isMatched: false,
        results: []
      }));
      await Promise.all(regPromises);
    } else {
      // Fallback: tentar pela categoria se nenhum ID foi passado
      const qRegs = query(collection(db, 'registrations'), where('assignedCategory', '==', baseGroupKey));
      const regSnap = await getDocs(qRegs);
      const regPromises = regSnap.docs.map(d => updateDoc(d.ref, { 
        isMatched: false,
        results: [] 
      }));
      await Promise.all(regPromises);
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
    await updateDoc(doc(db, 'registrations', regId), {
      assignedCategory: targetGroup,
      isMatched: false // Permitir re-geração na nova categoria
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
 * Avança o vencedor para o próximo round e gerencia o pódio se for a final ou semifinal (Bronze)
 */
export async function advanceWinner(matchId: string, winnerId: string) {
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
      console.log(`[advanceWinner] Processando match ${matchId}. Vencedor: ${safeWinnerId}`);
      
      // Atualizar a luta atual com o vencedor
      transaction.update(matchRef, {
        winnerId: safeWinnerId,
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
