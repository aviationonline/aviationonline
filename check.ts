import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function checkUser() {
    try {
        const uid = 'xozlmTcbqCTu4xnZxzi7Elblw6w1';
        const uDoc = await getDoc(doc(db, 'users', uid));
        console.log(uDoc.exists() ? uDoc.data() : "Not found");
        process.exit(0);
    } catch (e) {
        console.log(e);
        process.exit(1);
    }
}
checkUser();
