import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function check() {
  const quizzesSnap = await getDocs(collection(db, 'quizzes'));
  for (const doc of quizzesSnap.docs) {
    const data = doc.data();
    console.log(`Quiz: ${data.title} (ID: ${doc.id})`);
    console.log(`  title_en: ${data.title_en}`);
    
    const qSnap = await getDocs(collection(db, `quizzes/${doc.id}/questions`));
    let translatedCount = 0;
    let totalCount = qSnap.docs.length;
    for (const q of qSnap.docs) {
      const qd = q.data();
      if (qd.text_en && qd.options_en && qd.options_en.length > 0 && JSON.stringify(qd.options_en) !== JSON.stringify(qd.options)) {
        translatedCount++;
      } else {
        console.log(`  - Question missing translation: ${qd.text?.substring(0, 30)}...`);
        console.log(`    text_en: ${!!qd.text_en}, options_en: ${!!qd.options_en}`);
      }
    }
    console.log(`  Questions: ${translatedCount}/${totalCount} translated`);
  }
  process.exit(0);
}

check().catch(console.error);
