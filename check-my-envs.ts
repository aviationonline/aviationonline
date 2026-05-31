import dotenv from 'dotenv';
dotenv.config();

console.log("Checking Environment Variables...");
const vars = [
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'GEMINI_API_KEY'
];

vars.forEach(v => {
  console.log(`${v}: ${process.env[v] ? (process.env[v].substring(0, 5) + '...') : 'MISSING/EMPTY'}`);
});
