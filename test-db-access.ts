import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
dotenv.config();

console.log("Testing Firebase Admin...");

try {
  let app;
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    app = initializeApp({
      credential: cert(serviceAccount)
    });
  } else {
    app = getApps()[0];
  }
  
  const db = getFirestore(app);
  // Hardcoded the DB ID to ai-studio-620c26d3-35c4-4704-9376-c8dc32e862ea according to config
  db.settings({ databaseId: "ai-studio-620c26d3-35c4-4704-9376-c8dc32e862ea" });

  async function test() {
    try {
      console.log("Fetching users from auth...");
      const userList = await getAuth(app).listUsers(10);
      console.log(`Found ${userList.users.length} users in Auth.`);
      
      console.log("Fetching profiles from Firestore...");
      const snapshot = await db.collection('profiles').limit(10).get();
      console.log(`Found ${snapshot.size} profiles in Firestore.`);
      process.exit(0);
    } catch(err) {
      console.error("Test failed: ", err);
      process.exit(1);
    }
  }

  test();
} catch (e) {
  console.error("Init failed: ", e);
  process.exit(1);
}
