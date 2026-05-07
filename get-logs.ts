import fetch from 'node-fetch';

async function getLogs() {
  const res = await fetch('http://localhost:3000/api/admin/logs');
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
getLogs().catch(console.error);
