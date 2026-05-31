import fetch from 'node-fetch';

async function testHealth() {
  try {
    const res = await fetch('http://localhost:3000/api/health');
    console.log("Health:", await res.json());
  } catch (err) {
    console.error("Error:", err);
  }
}

testHealth();
