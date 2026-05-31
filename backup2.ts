import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function backup() {
    try {
        const backupData: any = { modules: [], courses: [], quizzes: [], questions: [], testimonials: [] };

        const modulesSnap = await getDocs(collection(db, 'modules'));
        for (const mod of modulesSnap.docs) {
            backupData.modules.push({ id: mod.id, ...mod.data() });
            
            const courseSnap = await getDocs(collection(db, `modules/${mod.id}/courses`));
            for (const c of courseSnap.docs) {
                backupData.courses.push({ id: c.id, moduleId: mod.id, ...c.data() });
            }
        }

        const qSnap = await getDocs(collection(db, 'quizzes'));
        for (const doc of qSnap.docs) {
            backupData.quizzes.push({ id: doc.id, ...doc.data() });
        }
        
        const testSnap = await getDocs(collection(db, 'testimonials'));
        for (const doc of testSnap.docs) {
            backupData.testimonials.push({ id: doc.id, ...doc.data() });
        }

        fs.writeFileSync('backup_23_mai_safe.json', JSON.stringify(backupData, null, 2));
        console.log("Backup complete! Courses:", backupData.courses.length);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}

backup();
