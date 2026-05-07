import dotenv from "dotenv";
import { Resend } from "resend";
import nodemailer from "nodemailer";

dotenv.config();

let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY environment variable is required');
    resendClient = new Resend(key);
  }
  return resendClient;
}

async function sendEmail({ to, subject, html }: { to: string | string[], subject: string, html: string }) {
  try {
    if (process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      
      const from = process.env.SMTP_FROM || '"Aviation Online" <contact@aviationonline.fr>';
      
      await transporter.sendMail({
        from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
      });
      console.log(`Email sent via SMTP to ${to}`);
      return { success: true };
    } else {
      const resend = getResend();
      const from = process.env.RESEND_FROM || 'Aviation Online <onboarding@resend.dev>';
      await resend.emails.send({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      });
      console.log(`Email sent via Resend to ${to}`);
      return { success: true };
    }
  } catch (error: any) {
    console.error("Failed to send email to", to, ":", error);
    throw error;
  }
}

async function runTests() {
  const userEmail = 'agenim@gmail.com';
  const adminEmail = 'ident@aviationonline.fr';
  const userName = 'Test User';
  const appUrl = process.env.APP_URL || 'https://aviationonline.fr';

  console.log("--- TEST 1: INSCRIPTION ---");
  await sendEmail({
    to: userEmail,
    subject: 'Bienvenue sur Aviation Online !',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #2563eb;">Bienvenue ${userName} !</h2>
        <p>Nous sommes ravis de vous compter parmi nos élèves pilotes.</p>
        <p>Ceci est un test d'inscription.</p>
      </div>
    `
  });
  await sendEmail({
    to: adminEmail,
    subject: '🔔 Nouvel inscrit : Formation IFR',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #2563eb;">Nouvelle inscription !</h2>
        <p>Un nouvel utilisateur vient de s'inscrire sur la plateforme.</p>
        <ul>
          <li><strong>Nom :</strong> ${userName}</li>
          <li><strong>Email :</strong> ${userEmail}</li>
        </ul>
      </div>
    `
  });

  console.log("--- TEST 2: PAIEMENT ---");
  await sendEmail({
    to: userEmail,
    subject: 'Confirmation de paiement - Aviation Online',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #2563eb;">Merci pour votre confiance !</h2>
        <p>Votre paiement de 79€ a été validé avec succès.</p>
        <p>Lien vers votre tableau de bord : <a href="${appUrl}/dashboard">${appUrl}/dashboard</a></p>
      </div>
    `
  });
  await sendEmail({
    to: adminEmail,
    subject: '🔔 Nouvelle Vente : Formation IFR',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #1e293b;">Nouvelle vente réalisée !</h2>
        <p>Un nouvel utilisateur vient de débloquer la formation.</p>
        <p><strong>Client :</strong> ${userName} (${userEmail})</p>
      </div>
    `
  });

  console.log("--- TEST 3: RESULTATS QCM ---");
  await sendEmail({
    to: userEmail,
    subject: `Résultats QCM : Test Quiz`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; rounded: 10px;">
        <h2 style="color: #2563eb;">Bravo ${userName} !</h2>
        <p>Vous venez de terminer le quiz : <strong>Test Quiz</strong></p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <div style="font-size: 48px; font-weight: bold; color: #1e293b;">18 / 20</div>
          <div style="font-size: 18px; color: #2563eb; font-weight: bold;">90% de réussite</div>
        </div>
      </div>
    `
  });
  await sendEmail({
    to: adminEmail,
    subject: `Nouveau résultat QCM : ${userName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; rounded: 10px;">
        <h2 style="color: #1e293b;">Nouveau résultat QCM</h2>
        <p>L'étudiant <strong>${userName}</strong> (${userEmail}) a terminé un quiz.</p>
        <p><strong>Score :</strong> 18 / 20 (90%)</p>
      </div>
    `
  });

  console.log("--- TESTS TERMINES ---");
}

runTests().catch(console.error);
