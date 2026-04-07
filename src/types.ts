export type Role = 'admin' | 'master';

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  academyId?: string;
  displayName?: string;
  photoURL?: string;
  birthYear?: number;
  gender?: 'M' | 'F';
}

export interface Academy {
  id: string;
  name: string;
  coach: string;
  master: string;
  contact: string;
  createdBy: string;
  logo?: string;
}

export interface Athlete {
  id: string;
  name: string;
  birthYear: number;
  gender: 'M' | 'F';
  belt: string;
  weight: number;
  academyId: string;
  createdBy: string;
  avatar?: string;
}

export interface Registration {
  id: string;
  athleteId: string;
  academyId: string;
  categories: ('Kyorugui' | 'Poomsae' | 'Kyopa (3 tábuas)' | 'Kyopa (5 tábuas)')[];
  status: 'Pendente' | 'Confirmado' | 'Cancelado';
  paymentStatus: 'Pendente' | 'Pago' | 'Em Análise';
  receiptUrl?: string;
  createdAt: string;
  isElite?: boolean;
  assignedCategory?: string;
  isMatched?: boolean;
  disciplineStatus?: Record<string, {
    assignedCategory?: string;
    isMatched?: boolean;
  }>;
  results?: { 
    groupKey: string; 
    place: 1 | 2 | 3 | 'WO' | null;
    score?: number; // Para Poomsae/Kyopa (ex: 9.50)
    points?: number; // Para Kyorugui (ex: 24)
    bracketPosition?: number; // Posição sorteada (1 a N)
  }[];
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
export * from './types/matches';
