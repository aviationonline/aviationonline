import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

// Read config from firebase-applet-config.json
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
let serviceAccount = null;
if (serviceAccountStr) {
    if (serviceAccountStr.startsWith('{')) {
        serviceAccount = JSON.parse(serviceAccountStr);
    } else {
        serviceAccount = JSON.parse(Buffer.from(serviceAccountStr, 'base64').toString('utf8'));
    }
}

if (!getApps().length) {
    admin.initializeApp({
        projectId: config.projectId,
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();
db.settings({ databaseId: config.firestoreDatabaseId || '(default)' });

async function run() {
    const mods = await db.collection('modules').get();
    console.log("MODULES:", mods.docs.map(d => ({id: d.id, title: d.data().title, order: d.data().order})));
    
    for (const mod of mods.docs) {
        const courses = await db.collection('modules').doc(mod.id).collection('courses').get();
        console.log(`COURSES for ${mod.id}:`, courses.docs.map(d => ({id: d.id, title: d.data().title, order: d.data().order})));
    }
}
run().catch(console.error);
