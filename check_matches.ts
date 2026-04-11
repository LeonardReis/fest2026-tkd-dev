import { db } from './src/firebase';
import { collection, query, limit, getDocs } from 'firebase/firestore';

async function check() {
  const q = query(collection(db, 'matches'), limit(5));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    console.log(`ID: ${doc.id}, CourtId: ${doc.data().courtId}, Type: ${typeof doc.data().courtId}, Status: ${doc.data().status}`);
  });
}

check().catch(console.error);
