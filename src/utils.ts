import { auth } from './firebase';
import { OperationType, FirestoreErrorInfo } from './types';

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// A categoria é determinada pelo ano de nascimento da pessoa em relação a 2026.
const EVENT_YEAR = 2026;

/**
 * Calcula a idade do atleta com base no ano de nascimento,
 * conforme exigido pelo ofício para preservar dados sensíveis.
 */
export function getAgeFromBirthYear(birthYear: number): number {
  return EVENT_YEAR - birthYear;
}

export function getAgeCategory(birthYear: number, belt: string): string {
  const age = getAgeFromBirthYear(birthYear);
  const isDan = belt.includes('Dan');

  if (age <= 6) return 'Fraldinha (Até 6 anos)';
  if (age >= 7 && age <= 8) return 'Mirim (7 a 8 anos)';
  if (age >= 9 && age <= 11) return 'Infantil (9 a 11 anos)';
  if (age >= 12 && age <= 14) return 'Cadete (Sub-14)';
  if (age >= 15 && age <= 17) return 'Juvenil (15 a 17 anos)';
  if (age >= 18 && age <= 21) return isDan ? 'Sub-21 / Adulto' : 'Adulto (18 a 30 anos)';
  if (age >= 22 && age <= 30) return 'Adulto (18 a 30 anos)';
  if (age >= 31 && age <= 35) return 'Master 1';
  if (age >= 36 && age <= 40) return 'Master 2';
  if (age >= 41 && age <= 45) return 'Master 3';
  if (age >= 46 && age <= 50) return 'Master 4';
  if (age >= 51 && age <= 55) return 'Master 5';
  if (age >= 56 && age <= 60) return 'Master 6';
  if (age >= 61 && age <= 65) return 'Master 7';
  if (age > 65) return 'Master 8';
  return 'Idade não permitida';
}

export function getWeightCategory(ageCategory: string, gender: 'M' | 'F', weight: number, belt: string): string {
  const isDan = belt.includes('Dan');

  if (ageCategory === 'Fraldinha (Até 6 anos)') {
    return 'Sem peso (Festival)';
  }

  if (ageCategory === 'Mirim (7 a 8 anos)') {
    if (weight <= 22) return 'Até 22kg';
    if (weight <= 27) return 'Até 27kg';
    if (weight <= 32) return 'Até 32kg';
    if (weight <= 37) return 'Até 37kg';
    return 'Acima de 37kg';
  }
  
  if (ageCategory === 'Infantil (9 a 11 anos)') {
    if (weight <= 30) return 'Até 30kg';
    if (weight <= 35) return 'Até 35kg';
    if (weight <= 40) return 'Até 40kg';
    if (weight <= 45) return 'Até 45kg';
    return 'Acima de 45kg';
  }
  
  if (ageCategory === 'Cadete (Sub-14)') {
    if (isDan) {
      if (gender === 'M') {
        if (weight <= 33) return 'Até 33kg';
        if (weight <= 37) return 'Até 37kg';
        if (weight <= 41) return 'Até 41kg';
        if (weight <= 45) return 'Até 45kg';
        if (weight <= 49) return 'Até 49kg';
        if (weight <= 53) return 'Até 53kg';
        if (weight <= 57) return 'Até 57kg';
        if (weight <= 61) return 'Até 61kg';
        if (weight <= 65) return 'Até 65kg';
        return 'Acima de 65kg';
      } else {
        if (weight <= 29) return 'Até 29kg';
        if (weight <= 33) return 'Até 33kg';
        if (weight <= 37) return 'Até 37kg';
        if (weight <= 41) return 'Até 41kg';
        if (weight <= 44) return 'Até 44kg';
        if (weight <= 47) return 'Até 47kg';
        if (weight <= 51) return 'Até 51kg';
        if (weight <= 55) return 'Até 55kg';
        if (weight <= 59) return 'Até 59kg';
        return 'Acima de 59kg';
      }
    } else {
      if (gender === 'M') {
        if (weight <= 37) return 'Até 37kg';
        if (weight <= 45) return 'Até 45kg';
        if (weight <= 53) return 'Até 53kg';
        if (weight <= 61) return 'Até 61kg';
        return 'Acima de 61kg';
      } else {
        if (weight <= 37) return 'Até 37kg';
        if (weight <= 44) return 'Até 44kg';
        if (weight <= 51) return 'Até 51kg';
        if (weight <= 59) return 'Até 59kg';
        return 'Acima de 59kg';
      }
    }
  }
  
  if (ageCategory === 'Juvenil (15 a 17 anos)') {
    if (isDan) {
      if (gender === 'M') {
        if (weight <= 45) return 'Até 45kg';
        if (weight <= 48) return 'Até 48kg';
        if (weight <= 51) return 'Até 51kg';
        if (weight <= 55) return 'Até 55kg';
        if (weight <= 59) return 'Até 59kg';
        if (weight <= 63) return 'Até 63kg';
        if (weight <= 68) return 'Até 68kg';
        if (weight <= 73) return 'Até 73kg';
        if (weight <= 78) return 'Até 78kg';
        return 'Acima de 78kg';
      } else {
        if (weight <= 42) return 'Até 42kg';
        if (weight <= 44) return 'Até 44kg';
        if (weight <= 46) return 'Até 46kg';
        if (weight <= 49) return 'Até 49kg';
        if (weight <= 52) return 'Até 52kg';
        if (weight <= 55) return 'Até 55kg';
        if (weight <= 59) return 'Até 59kg';
        if (weight <= 63) return 'Até 63kg';
        if (weight <= 68) return 'Até 68kg';
        return 'Acima de 68kg';
      }
    } else {
      if (gender === 'M') {
        if (weight <= 48) return 'Até 48kg';
        if (weight <= 55) return 'Até 55kg';
        if (weight <= 63) return 'Até 63kg';
        if (weight <= 73) return 'Até 73kg';
        return 'Acima de 73kg';
      } else {
        if (weight <= 44) return 'Até 44kg';
        if (weight <= 49) return 'Até 49kg';
        if (weight <= 55) return 'Até 55kg';
        if (weight <= 63) return 'Até 63kg';
        return 'Acima de 63kg';
      }
    }
  }
  
  if (ageCategory === 'Adulto (18 a 30 anos)' || ageCategory === 'Sub-21 / Adulto' || ageCategory === 'Master 1' || ageCategory === 'Master 2' || ageCategory === 'Master 3' || ageCategory === 'Master 4') {
    if (isDan) {
      if (gender === 'M') {
        if (weight <= 54) return 'Até 54kg';
        if (weight <= 58) return 'Até 58kg';
        if (weight <= 63) return 'Até 63kg';
        if (weight <= 68) return 'Até 68kg';
        if (weight <= 74) return 'Até 74kg';
        if (weight <= 80) return 'Até 80kg';
        if (weight <= 87) return 'Até 87kg';
        return 'Acima de 87kg';
      } else {
        if (weight <= 46) return 'Até 46kg';
        if (weight <= 49) return 'Até 49kg';
        if (weight <= 53) return 'Até 53kg';
        if (weight <= 57) return 'Até 57kg';
        if (weight <= 62) return 'Até 62kg';
        if (weight <= 67) return 'Até 67kg';
        if (weight <= 73) return 'Até 73kg';
        return 'Acima de 73kg';
      }
    } else {
      if (gender === 'M') {
        if (weight <= 58) return 'Até 58kg';
        if (weight <= 68) return 'Até 68kg';
        if (weight <= 80) return 'Até 80kg';
        return 'Acima de 80kg';
      } else {
        if (weight <= 49) return 'Até 49kg';
        if (weight <= 57) return 'Até 57kg';
        if (weight <= 67) return 'Até 67kg';
        return 'Acima de 67kg';
      }
    }
  }

  if (ageCategory === 'Master 5' || ageCategory === 'Master 6' || ageCategory === 'Master 7' || ageCategory === 'Master 8') {
    if (gender === 'M') {
      if (weight <= 58) return 'Até 58kg';
      if (weight <= 68) return 'Até 68kg';
      if (weight <= 80) return 'Até 80kg';
      return 'Acima de 80kg';
    } else {
      if (weight <= 49) return 'Até 49kg';
      if (weight <= 57) return 'Até 57kg';
      if (weight <= 67) return 'Até 67kg';
      return 'Acima de 67kg';
    }
  }
  
  return 'Categoria não definida';
}

// ─── Preços ──────────────────────────────────────────────────────────────────
export interface PriceConfig {
  kyoruguiPoomsae: number;
  kyopa3: number;
  kyopa5: number;
}

export const DEFAULT_PRICE_CONFIG: PriceConfig = {
  kyoruguiPoomsae: 90,
  kyopa3: 25,
  kyopa5: 35,
};

/**
 * Calcula o valor total de uma inscrição com base nas categorias e na tabela
 * de preços configurável. Centralizado aqui para evitar duplicação entre
 * RegistrationsView e AdminView.
 */
export function calculatePrice(categories: string[], config: PriceConfig = DEFAULT_PRICE_CONFIG): number {
  let total = 0;
  if (categories.includes('Kyorugui') || categories.includes('Poomsae')) {
    total += config.kyoruguiPoomsae;
  }
  if (categories.includes('Kyopa (3 tábuas)')) {
    total += config.kyopa3;
  }
  if (categories.includes('Kyopa (5 tábuas)')) {
    total += config.kyopa5;
  }
  return total;
}

// ─── PIX Helpers ─────────────────────────────────────────────────────────────
export const formatWhatsAppNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 11 ? `55${cleaned}` : cleaned;
};

const crc16 = (str: string): string => {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};

export const generatePix = (amount: number, description: string = "Inscrição Fest 2026", txId: string = "***"): string => {
  const basePix = "00020126580014BR.GOV.BCB.PIX0136f54e22ce-2771-4a78-a5c3-3dde26d19329520400005303986";
  const amountStr = amount.toFixed(2);
  const tag54 = `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;
  const country = "5802BR";
  const merchant = "5913Leonardo Reis6009SAO PAULO";
  
  const tag62_05 = `05${txId.length.toString().padStart(2, '0')}${txId}`;
  const cleanDescription = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 25);
  const tag62_02 = `02${cleanDescription.length.toString().padStart(2, '0')}${cleanDescription}`;
  const tag62Value = tag62_02 + tag62_05;
  const tag62 = `62${tag62Value.length.toString().padStart(2, '0')}${tag62Value}`;
  
  const payload = basePix + tag54 + country + merchant + tag62 + "6304";
  return payload + crc16(payload);
};

// ─── Regras Técnicas do Evento ────────────────────────────────────────────────

/**
 * Retorna as formas (Poomsae) que o atleta deve executar com base na faixa.
 * Fonte: Documento oficial Festival Colombo 2026, seção 5.3.
 */
export function getPoomsaeByBelt(belt: string): string {
  const b = belt.toLowerCase();
  if (b.includes('branca') || b.includes('white')) return 'Saju Jireugi ou AP Tchagui';
  if (b.includes('amarela') || b.includes('yellow')) return 'Taegeuk 1, 2 ou 3';
  if (b.includes('verde') || b.includes('green')) return 'Taegeuk 1, 2 ou 3';
  if (b.includes('azul clara') || b.includes('light blue')) return 'Taegeuk 4, 5 ou 6';
  if (b.includes('azul') || b.includes('blue')) return 'Taegeuk 4, 5 ou 6';
  if (b.includes('roxa') || b.includes('purple')) return 'Taegeuk 4, 5 ou 6';
  if (b.includes('vermelha') || b.includes('red') || b.includes('ponta preta') || b.includes('rec')) return 'Taegeuk 6, 7 ou 8';
  if (b.includes('dan') || b.includes('preta') || b.includes('black')) return 'Koryo ou superior';
  return 'Consultar técnico';
}

/**
 * Retorna as regras de contato permitidas para a faixa na Kyorugui.
 * Fonte: Documento oficial Festival Colombo 2026, seção 5.2.
 */
export function getFightRules(belt: string): { label: string; color: string; detail: string } {
  const b = belt.toLowerCase();
  if (b.includes('branca') || b.includes('white')) {
    return { label: 'Sem Contato', color: 'text-stone-400', detail: 'Regras especiais para faixa branca' };
  }
  if (b.includes('amarela') || b.includes('yellow') || b.includes('verde') || b.includes('green') || b.includes('azul clara') || b.includes('light blue')) {
    return { label: 'Tronco', color: 'text-blue-400', detail: 'Somente golpes no tronco' };
  }
  if (b.includes('azul') || b.includes('roxa') || b.includes('vermelha') || b.includes('red') || b.includes('ponta preta') || b.includes('rec')) {
    return { label: 'Tronco (s/ cabeça)', color: 'text-amber-400', detail: 'Tronco sem contato na cabeça' };
  }
  if (b.includes('dan') || b.includes('preta') || b.includes('black')) {
    return { label: 'Tronco + Cabeça', color: 'text-red-400', detail: 'Protetor bucal e genital interno obrigatórios' };
  }
  return { label: 'Consultar', color: 'text-stone-500', detail: '' };
}

/**
 * Retorna duração dos rounds por categoria de idade na Kyorugui.
 * Fonte: Documento oficial Festival Colombo 2026, seção 6.3.
 */
export function getFightRounds(ageCategory: string): { rounds: number; duration: string; interval: string } {
  if (ageCategory.includes('Fraldinha') || ageCategory.includes('Mirim')) {
    return { rounds: 2, duration: '45s', interval: '15s' };
  }
  if (ageCategory.includes('Dan') || ageCategory.toLowerCase().includes('preta')) {
    return { rounds: 3, duration: '1min 30s', interval: '45s' };
  }
  return { rounds: 3, duration: '1min', interval: '20s' };
}

/**
 * Cronograma oficial do Festival de Taekwondo Colombo 2026.
 * Fonte: Documento oficial, seção 4.
 */
export const SCHEDULE: { time: string; activity: string; location: string; type: 'ceremony' | 'fight' | 'poomsae' | 'break' }[] = [
  { time: '08:00–08:45', activity: 'Abertura Oficial e Premiação de Equipes', location: 'Geral', type: 'ceremony' },
  { time: '08:45–09:00', activity: 'Reunião com Técnicos', location: 'Geral', type: 'ceremony' },
  { time: '09:00–12:00', activity: 'Poomsae — Fraldinha, Mirim e Cadete', location: 'Quadra 1', type: 'poomsae' },
  { time: '09:00–12:00', activity: 'Luta — Juvenil, Adulto e Master', location: 'Quadras 2 e 3',  type: 'fight' },
  { time: '12:00–13:30', activity: 'Intervalo para Almoço', location: '', type: 'break' },
  { time: '13:30–18:00', activity: 'Poomsae — Juvenil, Adulto e Master', location: 'Quadra 1', type: 'poomsae' },
  { time: '13:30–18:30', activity: 'Luta — Cadete, Fraldinha e Mirim', location: 'Quadras 2 e 3', type: 'fight' },
  { time: '19:30', activity: 'Previsão de Encerramento', location: 'Geral', type: 'ceremony' },
];

