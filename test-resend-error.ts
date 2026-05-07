import { Resend } from 'resend';

async function test() {
  try {
    const resend = new Resend('re_123456789');
    const { data, error } = await resend.emails.send({
      from: 'Aviation Online <onboarding@resend.dev>',
      to: 'ident@aviationonline.fr',
      subject: 'Test Resend',
      html: '<p>Test</p>'
    });
    if (error) {
      throw new Error(`Resend API Error: ${error.message}`);
    }
    console.log("Success", data);
  } catch (e) {
    console.error("Caught error:", e);
  }
}

test();
