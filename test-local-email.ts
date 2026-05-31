import fetch from 'node-fetch';

async function test() {
  try {
    console.log("Sending request to http://localhost:3000/api/send-quiz-results");
    const res = await fetch('http://localhost:3000/api/send-quiz-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail: 'contact@aviationonline.net',
        userName: 'Test User',
        quizTitle: 'Test Quiz',
        score: 5,
        totalQuestions: 10,
        percentage: 50
      })
    });
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
