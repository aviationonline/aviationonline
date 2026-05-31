import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function checkQuizzes() {
  try {
    const snapshot = await getDocs(collection(db, 'quizzes'));
    console.log(`Found ${snapshot.size} quizzes.`);
    snapshot.forEach(doc => {
      console.log(doc.id, '=>', doc.data());
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

checkQuizzes();
