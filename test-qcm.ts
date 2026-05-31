import fetch from 'node-fetch';

async function testQCM() {
  const res = await fetch('http://localhost:3000/api/send-quiz-results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userEmail: 'haltoclop@gmail.com',
      userName: 'Test User',
      quizTitle: 'Test Quiz',
      score: 10,
      totalQuestions: 10,
      percentage: 100
    })
  });
  const data = await res.json();
  console.log(data);
}

testQCM().catch(console.error);
