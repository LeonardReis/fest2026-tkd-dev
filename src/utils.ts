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

export function getAgeCategory(birthDate: string, belt: string, currentYear: number = new Date().getFullYear()): string {
  const birthYear = new Date(birthDate).getFullYear();
  const age = currentYear - birthYear;
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
