const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  content = content.replace(/ident@aviationonline\.fr/g, 'contact@aviationonline.net');
  content = content.replace(/contact@aviationonline\.fr/g, 'contact@aviationonline.net');
  content = content.replace(/server@aviationonline\.fr/g, 'server@aviationonline.net');
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', filePath);
  }
}

const files = [
  'server.ts',
  'src/App.tsx',
  'src/pages/Login.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/LegalMentions.tsx',
  'firestore.rules'
];

files.forEach(f => replaceInFile(path.join(__dirname, f)));
