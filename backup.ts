import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

export function initApp() {
    if (!getApps().length) {
        let serviceAccount = null;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
            serviceAccount = raw.startsWith('{') ? JSON.parse(raw) : JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        }
        
        let appConfig: any = { projectId: config.projectId };
        if (serviceAccount) {
            appConfig.credential = cert(serviceAccount);
        }
        admin.initializeApp(appConfig);
        const db = getFirestore();
        db.settings({ databaseId: config.firestoreDatabaseId || '(default)' });
        return db;
    }
    return getFirestore();
}

async function backup() {
    try {
        const db = initApp();
        
        const backupData: any = { modules: [], courses: [], quizzes: [], questions: [] };

        // Modules
        const modSnap = await db.collection('modules').get();
        for (const doc of modSnap.docs) {
            backupData.modules.push({ id: doc.id, ...doc.data() });
            
            // Courses
            const courseSnap = await db.collection(`modules/${doc.id}/courses`).get();
            for (const c of courseSnap.docs) {
                backupData.courses.push({ id: c.id, moduleId: doc.id, ...c.data() });
            }
        }

        // Quizzes
        const qSnap = await db.collection('quizzes').get();
        for (const doc of qSnap.docs) {
            backupData.quizzes.push({ id: doc.id, ...doc.data() });
        }
        
        // Questions
        const qstSnap = await db.collection('questions').get();
        for (const doc of qstSnap.docs) {
            backupData.questions.push({ id: doc.id, ...doc.data() });
        }

        fs.writeFileSync('backup_23_mai.json', JSON.stringify(backupData, null, 2));
        console.log("Backup completed. Saved to backup_23_mai.json");
    } catch(e) {
        console.error(e);
    }
}

backup();
