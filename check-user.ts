import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

async function checkUser() {
  await signInWithEmailAndPassword(auth, 'server@aviationonline.fr', 'SuperSecretPassword123!');
  const q = query(collection(db, 'users'));
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    console.log('User found:', doc.id, doc.data().email, doc.data().createdAt);
  });
  process.exit(0);
}

checkUser().catch(console.error);
