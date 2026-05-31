import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:3000/api/send-welcome-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mobilpub47@gmail.com', name: 'Test User' })
  });
  const text = await res.text();
  console.log(res.status, text);
}
test().catch(console.error);
