import fetch from 'node-fetch';

async function testPdfEndpoint() {
  try {
    const res = await fetch('https://aviationonline-production.up.railway.app/api/parse-qcm-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64: 'dummy' })
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}

testPdfEndpoint();
