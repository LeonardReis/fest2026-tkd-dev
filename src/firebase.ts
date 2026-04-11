import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import homologConfig from '../firebase-homolog-config.json';
import prodConfig from '../firebase-prod-config.json';

const isProd = import.meta.env.VITE_FIREBASE_ENV === 'prod' || !import.meta.env.VITE_FIREBASE_ENV;
const firebaseConfig = isProd ? prodConfig : homologConfig;

const app = initializeApp(firebaseConfig);
export const db = isProd 
  ? getFirestore(app) 
  : getFirestore(app, (homologConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);

console.log("🔥 [Firebase] Inicializado:", {
  project: firebaseConfig.projectId,
  database: isProd ? '(default)' : (homologConfig as any).firestoreDatabaseId,
  env: isProd ? 'PROD' : 'HOMOLOG'
});

// Testar conexão
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Erro de conexão com o Firebase. Verifique sua configuração.");
    }
  }
}
testConnection();
