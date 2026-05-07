import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:3000/api/send-welcome-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'haltoclop@gmail.com', name: 'Test User' })
  });
  const data = await res.json();
  console.log(data);
}

test();
