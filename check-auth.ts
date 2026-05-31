import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
initializeApp({ projectId: firebaseConfig.projectId });

async function checkAuth() {
  try {
    const user = await getAuth().getUserByEmail('haltoclop@gmail.com');
    console.log('User found in Auth:', user.uid, user.email);
  } catch (error) {
    console.log('User not found in Auth:', error);
  }
}

checkAuth().catch(console.error);
