import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    logger: true,
    debug: true
  });

  try {
    const info = await transporter.sendMail({
      from: `"Aviation Online" <${process.env.SMTP_USER}>`,
      to: 'ident@aviationonline.fr',
      subject: 'Test Email from AI Studio',
      text: 'This is a test email to verify delivery.',
    });
    console.log('Message sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

test();
