import fs from 'fs';
import path from 'path';

function replaceAuthChecks() {
  // 1. Fix server.ts
  let serverTs = fs.readFileSync('server.ts', 'utf8');
  serverTs = serverTs.replace(/decodedToken\.email !== 'contact@aviationonline\.net'/g, "decodedToken.email !== 'ident@aviationonline.fr' && decodedToken.email !== 'contact@aviationonline.net'");
  serverTs = serverTs.replace(/to !== 'contact@aviationonline\.net'/g, "to !== 'ident@aviationonline.fr' && to !== 'contact@aviationonline.net'");
  fs.writeFileSync('server.ts', serverTs, 'utf8');

  // 2. Fix src/App.tsx
  let appTsx = fs.readFileSync('src/App.tsx', 'utf8');
  appTsx = appTsx.replace(/auth\.currentUser\?\.email === 'contact@aviationonline\.net'/g, "(auth.currentUser?.email === 'ident@aviationonline.fr' || auth.currentUser?.email === 'contact@aviationonline.net')");
  appTsx = appTsx.replace(/user\.email === 'contact@aviationonline\.net'/g, "(user.email === 'ident@aviationonline.fr' || user.email === 'contact@aviationonline.net')");
  fs.writeFileSync('src/App.tsx', appTsx, 'utf8');

  // 3. Fix src/pages/Login.tsx
  let loginTsx = fs.readFileSync('src/pages/Login.tsx', 'utf8');
  loginTsx = loginTsx.replace(/email === 'contact@aviationonline\.net'/g, "(email === 'ident@aviationonline.fr' || email === 'contact@aviationonline.net')");
  fs.writeFileSync('src/pages/Login.tsx', loginTsx, 'utf8');

  // 4. Fix src/pages/Dashboard.tsx
  let dashboardTsx = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');
  dashboardTsx = dashboardTsx.replace(/profile\?\.email === 'contact@aviationonline\.net'/g, "(profile?.email === 'ident@aviationonline.fr' || profile?.email === 'contact@aviationonline.net')");
  fs.writeFileSync('src/pages/Dashboard.tsx', dashboardTsx, 'utf8');

  // 5. Fix firestore.rules
  let rules = fs.readFileSync('firestore.rules', 'utf8');
  rules = rules.replace(/request\.auth\.token\.email == "contact@aviationonline\.net"/g, '(request.auth.token.email == "ident@aviationonline.fr" || request.auth.token.email == "contact@aviationonline.net")');
  fs.writeFileSync('firestore.rules', rules, 'utf8');

  console.log("Auth checks updated to allow both emails.");
}

replaceAuthChecks();
