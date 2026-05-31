import puppeteer from 'puppeteer';

async function run() {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      console.log('API REQUEST:', request.method(), request.url(), request.postData());
    }
  });
  page.on('response', async response => {
    if (response.url().includes('/api/')) {
      console.log('API RESPONSE:', response.status(), response.url());
      try {
        console.log('API RESPONSE BODY:', await response.text());
      } catch (e) {}
    }
  });

  console.log("Navigating to http://localhost:3000/login...");
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2', timeout: 10000 });
  
  // We can't easily simulate a full registration without Firebase Auth credentials,
  // but we can execute a fetch request in the page context to test the endpoint.
  console.log("Testing /api/send-welcome-email from page context...");
  const result = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/send-welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ident@aviationonline.fr', name: 'Test User' })
      });
      return { status: res.status, body: await res.text() };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log("Fetch result from page context:", result);

  await browser.close();
}

run().catch(console.error);
