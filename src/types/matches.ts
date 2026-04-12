import { Athlete } from '../types';

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'wo' | 'cancelled';

export interface MatchCompetitor {
  athleteId: string;
  name: string;
  academy: string;
  score?: number;
  isBye?: boolean;
}

export interface PoomsaeJudgeScore {
  // Técnica: base 4.0 com deduções
  tecnica: number;           // 0.0 a 4.0
  // Apresentação: 3 critérios, cada um de 0.5 a 2.0
  velocidade: number;        // Velocidade e Potência
  ritmo: number;             // Controle de Força, Velocidade e Ritmo
  expressao: number;         // Expressão de Energia
  // Total calculado pelo árbitro
  totalApresentacao: number; // velocidade + ritmo + expressao
  total: number;             // tecnica + totalApresentacao
}

export interface Match {

  id: string;
  festivalId: string;
  categoryId: string;
  groupKey: string; // Chave da categoria original (ex: "Infantil | Colorida | Masculino | Até 35kg")
  modality: 'Kyorugui' | 'Poomsae' | 'Kyopa';
  matchNumber: number;
  round: number; // 1: Quartas, 2: Semi, 3: Final, etc.
  status: MatchStatus;
  competitorA?: MatchCompetitor;
  competitorB?: MatchCompetitor;
  winnerId?: string | null;
  nextMatchId?: string | null;
  positionInNextMatch?: 'competitorA' | 'competitorB';
  previousMatchIdA?: string | null;
  previousMatchIdB?: string | null;
  isMarriedMatch?: boolean;
  court?: string;
  courtId?: 1 | 2 | 3;
  matchSequence?: number;
  modalitySequence?: number;
  calledAt?: string;
  poomsaeScores?: Record<string, PoomsaeJudgeScore>; // { judge_1: { tecnica: 3.8, velocidade: 1.8, ... } }
  finalScore?: number;                    // nota final calculada (média WT com descarte)
  finalTecnica?: number;                  // média de técnica calculada
  finalApresentacao?: number;             // média de apresentação calculada
  judgeSessionId?: string;               // conexão com a courtSession
  startTime?: string;
  endTime?: string;
  pointsForTeam?: {
    winner: number;
    loser: number;
  };
  winnerReason?: 'points' | 'superiority' | 'punches' | 'referee' | 'wo';
  kyopaResult?: {
    attempted: number;
    broken: number;
  };
  // Placar por rounds (Kyorugui)
  roundScores?: {
    r1: { a: number; b: number; gamA: number; gamB: number };
    r2: { a: number; b: number; gamA: number; gamB: number };
    r3: { a: number; b: number; gamA: number; gamB: number };
  };
  currentRound?: 1 | 2 | 3;
  roundWinners?: Array<'a' | 'b' | null>; // Quem venceu cada round
  winnerRounds?: { a: number; b: number }; // Contagem de rounds vencidos (ex: {a: 2, b: 1})
  rankingProcessed?: boolean;
  totalScoreA?: number;
  totalScoreB?: number;
}

export type CourtSessionType = 'kyorugui' | 'poomsae' | 'kyopa';

export interface CourtSession {
  id: string; // Session ID (usado na URL e signInAnonymously params não existem, então usamos a URL)
  type: CourtSessionType;
  courtId: 1 | 2 | 3;
  active: boolean;
  judgeCount?: number; // Para Poomsae
  expiresAt: string; // ISO String
  createdBy: string;
  label: string;
  refereeName?: string;
}

export type AuditLogType = 'CATEGORY_MERGE' | 'SCORE_CHANGE' | 'MANUAL_DRAW' | 'MATCH_CANCEL';

export interface AuditLog {
  id: string;
  type: AuditLogType;
  timestamp: string;
  adminId: string;
  adminEmail: string;
  details: {
    athleteId?: string;
    athleteName?: string;
    fromValue?: any;
    toValue?: any;
    reason?: string;
    matchId?: string;
  };
}
