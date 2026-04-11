import { Match, MatchCompetitor } from '../types';
import { sanitizeForId } from '../utils';

/**
 * Gera a ordem de seeding padrão para chaves de eliminatória simples.
 *
 * O algoritmo usa recursão por intercalação de metades, que é o método
 * canônico de torneios internacionais (WTF/CBTKd/ITF).
 *
 * Propriedades garantidas:
 *   - Seed 1 e Seed 2 ficam em metades opostas (só se encontram na final)
 *   - Nenhum BYE enfrenta outro BYE na primeira rodada
 *   - Todos os seeds têm posições únicas no array
 *
 * Exemplos verificados:
 *   p=2:  [1, 2]            → Luta: 1v2
 *   p=4:  [1, 3, 2, 4]     → Lutas: 1v3, 2v4
 *   p=8:  [1, 5, 3, 7, 2, 6, 4, 8] → Lutas: 1v5, 3v7, 2v6, 4v8
 *
 * @param p Tamanho da chave (potência de 2)
 * @returns Array onde seedAtSlot[i] = número do seed (1-indexed) no slot i
 */
function buildSeedOrder(p: number): number[] {
  if (p <= 1) return [1];
  if (p === 2) return [1, 2];

  const half = p / 2;
  const topHalf = buildSeedOrder(half);

  // A metade inferior recebe os seeds complementares, na ordem inversa,
  // para garantir que os seeds mais fortes fiquem em lados opostos da chave.
  const bottomHalf = topHalf.slice().reverse().map((s) => p + 1 - s);

  // Intercalar: cada par (topHalf[i], bottomHalf[i]) fica em slots consecutivos,
  // formando uma luta na primeira rodada.
  const result: number[] = [];
  for (let i = 0; i < half; i++) {
    result.push(topHalf[i]);
    result.push(bottomHalf[i]);
  }
  return result;
}

/**
 * Motor de Chaveamento para Torneios de Eliminação Simples.
 *
 * REGRA CARDINAL (WTF/CBTKd): Todo BYE deve sempre enfrentar um atleta real.
 * Nunca BYE × BYE. Esta função garante esta propriedade matematicamente.
 */
export function generateBracket(
  festivalId: string,
  categoryId: string,
  groupKey: string,
  athletes: { id: string; name: string; academy: string }[]
): Match[] {
  const n = athletes.length;
  if (n < 2) return [];

  // 1. Encontrar a próxima potência de 2 (tamanho total da chave)
  const p = Math.pow(2, Math.ceil(Math.log2(n)));
  const totalRounds = Math.ceil(Math.log2(p));

  // Sanitização padronizada para evitar caracteres especiais no Firebase Document ID
  const sanitizedCategoryId = sanitizeForId(categoryId);

  // 2. Embaralhar atletas para o sorteio imparcial
  const shuffled = [...athletes].sort(() => Math.random() - 0.5);

  // 3. Completar o pool até a potência de 2 com BYEs nas posições finais
  //    (seeds de maior número = menor prioridade = BYEs)
  type AthleteSlot = { id: string; name: string; academy: string; isBye?: boolean };
  const athletePool: AthleteSlot[] = [...shuffled];
  for (let i = n; i < p; i++) {
    athletePool.push({
      id: `bye_${i}`,
      name: 'SORTEIO (BYE)',
      academy: 'Sorteio de Chave',
      isBye: true,
    });
  }

  // 4. Aplicar o algoritmo de seeding posicional
  //    seedOrder[slotIndex] = número do seed (1-indexed) naquele slot
  //    O atleta sorteado[0] = Seed 1, sorteado[1] = Seed 2, etc.
  const seedOrder = buildSeedOrder(p);
  const initialCompetitors: MatchCompetitor[] = seedOrder.map((seedNumber, slotIndex) => {
    const athlete = athletePool[seedNumber - 1]; // seedNumber é 1-indexed
    return {
      athleteId: athlete.isBye ? `bye_${slotIndex}` : athlete.id,
      name: athlete.name,
      academy: athlete.academy,
      isBye: athlete.isBye ?? false,
      score: 0,
    };
  });

  // 5. Geração das lutas por Round
  const matches: Match[] = [];
  let matchCounter = 1;

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
        nextMatchId:
          roundNum < totalRounds
            ? `match_${sanitizedCategoryId}_r${roundNum + 1}_${Math.floor(i / 2)}`
            : null,
        previousMatchIdA:
          roundNum > 1 ? `match_${sanitizedCategoryId}_r${roundNum - 1}_${i * 2}` : null,
        previousMatchIdB:
          roundNum > 1 ? `match_${sanitizedCategoryId}_r${roundNum - 1}_${i * 2 + 1}` : null,
        positionInNextMatch: i % 2 === 0 ? 'competitorA' : 'competitorB',
      };

      // Regra de BYE automático no Round 1:
      // O algoritmo buildSeedOrder GARANTE que nunca haverá dois BYEs no mesmo match.
      // Esta verificação funciona apenas para o caso real de Atleta vs BYE.
      if (roundNum === 1) {
        const compA = match.competitorA as MatchCompetitor;
        const compB = match.competitorB as MatchCompetitor;
        if (compA?.isBye || compB?.isBye) {
          match.status = 'finished';
          match.winnerId = compA?.isBye ? compB?.athleteId : compA?.athleteId;
        }
      }

      matches.push(match as Match);
    }
  }

  return matches;
}
