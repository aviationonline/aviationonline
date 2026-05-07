import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  getDocFromServer, 
  Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Using initializeFirestore with experimentalForceLongPolling to avoid "INTERNAL ASSERTION FAILED"
// This is a known fix for Firestore SDK issues in certain iframe/Vite environments.
let dbInstance;
try {
  const dbId = firebaseConfig.firestoreDatabaseId;
  const firestoreSettings = {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true
  };
  
  if (dbId && dbId !== '(default)') {
    console.log("Initializing Firestore with named database and long polling:", dbId);
    dbInstance = initializeFirestore(app, firestoreSettings, dbId);
  } else {
    console.log("Initializing Firestore with default database and long polling");
    dbInstance = initializeFirestore(app, firestoreSettings);
  }
} catch (e) {
  console.error("Critical Firestore initialization error, attempting fallback:", e);
  // Fallback to basic initialization with memory cache if initializeFirestore fails
  try {
    dbInstance = initializeFirestore(app, { 
      localCache: memoryLocalCache(),
      experimentalForceLongPolling: true 
    });
  } catch (fallbackError) {
    console.error("Total Firestore failure, using getFirestore as last resort");
    dbInstance = getFirestore(app);
  }
}

export const db = dbInstance;
if (typeof window !== 'undefined') {
  (window as any).db = dbInstance;
  (window as any).firebaseConfig = firebaseConfig;
}
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  updateProfile
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (key: string, value: any) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    };
  };

  const safeErrInfo = JSON.stringify(errInfo, getCircularReplacer());
  console.error('Firestore Error: ', safeErrInfo);
  throw new Error(safeErrInfo);
}

export async function testConnection() {
  try {
    console.log("Testing Firestore connection to 'test/connection' on current DB...");
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Firestore connection timed out (10s)")), 10000)
    );
    
    const testDocPromise = getDocFromServer(doc(db, 'test', 'connection'));
    
    const testDoc = await Promise.race([testDocPromise, timeoutPromise]) as any;
    console.log("Firestore connection test completed:", testDoc.exists() ? "Document exists" : "Document does not exist (but access is OK)");
    return true;
  } catch (error: any) {
    console.error("Firestore connection test failed on current DB:", error.message);
    
    if (error.message.includes("PERMISSION_DENIED") || error.code === 'permission-denied') {
      console.warn("Permission denied on named database. This usually means rules were not deployed to the correct DB ID.");
    }
    
    throw error;
  }
}
