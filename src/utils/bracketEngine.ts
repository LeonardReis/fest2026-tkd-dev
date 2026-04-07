import { Match, MatchCompetitor } from '../types';

/**
 * Motor de Chaveamento para Torneios de Eliminação Simples.
 * Baseado em potências de 2 para garantir que as finais sempre tenham 2 competidores.
 * Esta versão corrige o erro 'INTERNAL ASSERTION FAILED' sanitizando IDs e evitando 'undefined'.
 */
export function generateBracket(
  festivalId: string,
  categoryId: string,
  groupKey: string,
  athletes: { id: string; name: string; academy: string }[]
): Match[] {
  const n = athletes.length;
  if (n === 0) return [];

  // 1. Encontrar a próxima potência de 2
  const p = Math.pow(2, Math.ceil(Math.log2(n)));
  const totalRounds = Math.ceil(Math.log2(p));
  
  // Sanitização radical para evitar caracteres especiais no Firebase Document ID
  const sanitizedCategoryId = categoryId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

  // 2. Embaralhar atletas para o sorteio imparcial
  const shuffled = [...athletes].sort(() => Math.random() - 0.5);
  
  // 3. Criar os competidores iniciais (incluindo Byes)
  const initialCompetitors: (MatchCompetitor | null)[] = new Array(p).fill(null);
  for (let i = 0; i < n; i++) {
    initialCompetitors[i] = {
      athleteId: shuffled[i].id,
      name: shuffled[i].name,
      academy: shuffled[i].academy,
      score: 0
    };
  }
  for (let i = n; i < p; i++) {
    initialCompetitors[i] = {
      athleteId: `bye_${i}`,
      name: 'SORTEIO (BYE)',
      academy: '-',
      isBye: true,
      score: 0
    };
  }

  const matches: Match[] = [];
  let matchCounter = 1;

  // 4. Gerar chaves por Round de forma estruturada
  for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
    const roundSize = Math.pow(2, totalRounds - roundNum);
    for (let i = 0; i < roundSize; i++) {
      const match: any = {
        id: `match_${sanitizedCategoryId}_r${roundNum}_${i}`,
        festivalId,
        categoryId: sanitizedCategoryId,
        groupKey,
        matchNumber: matchCounter++,
        round: roundNum,
        status: 'scheduled',
        competitorA: roundNum === 1 ? initialCompetitors[i * 2] : null,
        competitorB: roundNum === 1 ? initialCompetitors[i * 2 + 1] : null,
        winnerId: null,
        nextMatchId: roundNum < totalRounds ? `match_${sanitizedCategoryId}_r${roundNum + 1}_${Math.floor(i / 2)}` : null,
        previousMatchIdA: roundNum > 1 ? `match_${sanitizedCategoryId}_r${roundNum - 1}_${i * 2}` : null,
        previousMatchIdB: roundNum > 1 ? `match_${sanitizedCategoryId}_r${roundNum - 1}_${i * 2 + 1}` : null,
        positionInNextMatch: (i % 2 === 0) ? 'competitorA' : 'competitorB'
      };

      // Regra de Bye automática no Round 1: se um competidor é Bye, o outro avança
      if (roundNum === 1) {
        const compA = match.competitorA;
        const compB = match.competitorB;
        if (compA?.isBye || compB?.isBye) {
          match.status = 'finished';
          // O vencedor é quem NÃO é Bye
          match.winnerId = compA?.isBye ? compB?.athleteId : compA?.athleteId;
        }
      }

      matches.push(match as Match);
    }
  }

  return matches;
}
