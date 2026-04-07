import { Athlete } from '../types';

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'wo' | 'cancelled';

export interface MatchCompetitor {
  athleteId: string;
  name: string;
  academy: string;
  score?: number;
  isBye?: boolean;
}

export interface Match {
  id: string;
  festivalId: string;
  categoryId: string;
  groupKey: string; // Chave da categoria original (ex: "Infantil | Colorida | Masculino | Até 35kg")
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
  startTime?: string;
  endTime?: string;
  pointsForTeam?: {
    winner: number;
    loser: number;
  };
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
