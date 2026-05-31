import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

dotenv.config();

async function test() {
  console.log("--- Email Configuration Test ---");
  console.log("SMTP_HOST:", process.env.SMTP_HOST || "Not set");
  console.log("SMTP_PORT:", process.env.SMTP_PORT || "Not set");
  console.log("SMTP_USER:", process.env.SMTP_USER ? "Set" : "Not set");
  console.log("SMTP_PASS:", process.env.SMTP_PASS ? "Set" : "Not set");
  console.log("SMTP_FROM_EMAIL:", process.env.SMTP_FROM_EMAIL || "Not set");
  console.log("RESEND_API_KEY:", process.env.RESEND_API_KEY ? "Set" : "Not set");

  const to = 'haltoclop@gmail.com';

  if (process.env.SMTP_HOST) {
    console.log("\n--- Testing SMTP ---");
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        debug: true, // Enable debug output
        logger: true // Log to console
      });

      const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'contact@aviationonline.fr';
      const fromName = process.env.SMTP_FROM || 'Aviation Online';
      const from = `"${fromName}" <${fromEmail}>`;

      console.log(`Sending from: ${from}`);

      const info = await transporter.sendMail({
        from,
        to,
        subject: 'Test SMTP Direct',
        html: '<p>Test email</p>',
      });
      console.log("SMTP Success:", info.messageId);
    } catch (e: any) {
      console.error("SMTP Error:", e);
    }
  } else if (process.env.RESEND_API_KEY) {
    console.log("\n--- Testing Resend ---");
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = process.env.RESEND_FROM || 'Aviation Online <onboarding@resend.dev>';
      console.log(`Sending from: ${from}`);
      const data = await resend.emails.send({
        from,
        to,
        subject: 'Test Resend Direct',
        html: '<p>Test email</p>',
      });
      console.log("Resend Success:", data);
    } catch (e: any) {
      console.error("Resend Error:", e);
    }
  } else {
    console.log("No email provider configured.");
  }
}

test();
