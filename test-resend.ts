import { Resend } from 'resend';

async function test() {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const data = await resend.emails.send({
      from: 'Aviation Online <onboarding@resend.dev>',
      to: 'ident@aviationonline.fr',
      subject: 'Test Resend',
      html: '<p>Test</p>'
    });
    console.log(data);
  } catch (e) {
    console.error(e);
  }
}

test();
