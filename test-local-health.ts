import fetch from 'node-fetch';

async function testPdfEndpoint() {
  try {
    // We'll test the local server since we are in the AI Studio environment
    const res = await fetch('http://localhost:3000/api/health');
    console.log("Health:", await res.json());
  } catch (err) {
    console.error("Error:", err);
  }
}

testPdfEndpoint();
