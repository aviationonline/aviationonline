import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, initializeFirestore } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);

async function checkDb() {
  console.log(`Checking Firestore Database: ${firebaseConfig.firestoreDatabaseId}`);
  try {
    const snap = await getDocs(collection(db, 'modules'));
    console.log(`Found ${snap.size} modules.`);
    if (snap.size > 0) {
      console.log('Sample module:', snap.docs[0].id, snap.docs[0].data());
    }

    const qSnap = await getDocs(collection(db, 'quizzes'));
    console.log(`Found ${qSnap.size} quizzes.`);
    
    // We might get permission denied for users, but let's try
    try {
      const uSnap = await getDocs(collection(db, 'users'));
      console.log(`Found ${uSnap.size} users.`);
    } catch(e) {
      console.log("Could not fetch users (expected if unauthenticated):", e.message);
    }
    process.exit(0);
  } catch (e) {
    console.error("Error connecting to Firestore:", e);
    process.exit(1);
  }
}

checkDb();
