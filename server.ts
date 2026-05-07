import express from "express";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { initializeApp as initializeClientApp, getApp as getClientApp, getApps as getClientApps } from 'firebase/app';
import { getFirestore as getClientFirestore, collection, doc, getDoc, getDocs, query, limit, updateDoc, setDoc, deleteDoc, writeBatch, where, Timestamp, serverTimestamp } from 'firebase/firestore';
import { getAuth as getClientAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { Resend } from "resend";
import nodemailer from "nodemailer";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));

dotenv.config();

// --- IN-MEMORY LOGGING FOR DEBUGGING ---
const debugLogs: any[] = [];
function addLog(level: string, message: string, data?: any) {
  const logEntry = { timestamp: new Date().toISOString(), level, message, data };
  debugLogs.unshift(logEntry);
  if (debugLogs.length > 100) debugLogs.pop();
  if (level === 'error') {
    console.error(message, data || '');
  } else {
    console.log(message, data || '');
  }
}
// ---------------------------------------

// Initialize Resend
let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.error("RESEND_API_KEY is missing");
      throw new Error('RESEND_API_KEY environment variable is required');
    }
    resendClient = new Resend(key);
  }
  return resendClient;
}

// Unified Email Sender (SMTP or Resend)
async function sendEmail({ to, subject, html }: { to: string | string[], subject: string, html: string }) {
  addLog('info', `Attempting to send email to ${to}`, { subject });
  
  let smtpFailed = false;
  let smtpError = null;

  // Try SMTP first if configured
  if (process.env.SMTP_HOST) {
    try {
      addLog('info', 'Using SMTP for email sending');
      
      let smtpHost = process.env.SMTP_HOST;
      let servername = process.env.SMTP_HOST;
      
      // Force IPv4 resolution for SMTP host to prevent ENETUNREACH on Railway
      if (smtpHost === 'smtp.hostinger.com') {
        smtpHost = '172.65.255.143';
        console.log(`[EMAIL] Hardcoded IPv4 for smtp.hostinger.com: ${smtpHost}`);
      } else {
        try {
          const { lookup } = await import('dns/promises');
          const lookupResult = await lookup(smtpHost, { family: 4 });
          if (lookupResult && lookupResult.address) {
            smtpHost = lookupResult.address;
            addLog('info', `Resolved SMTP host ${process.env.SMTP_HOST} to IPv4: ${smtpHost}`);
            console.log(`[EMAIL] Resolved SMTP host ${process.env.SMTP_HOST} to IPv4: ${smtpHost}`);
          }
        } catch (dnsErr) {
          addLog('warn', `Could not resolve IPv4 for ${smtpHost}, falling back to default resolution`, dnsErr);
          console.warn(`[EMAIL] Could not resolve IPv4 for ${smtpHost}:`, dnsErr);
        }
      }

      // Use environment variables for port and secure settings
      const port = parseInt(process.env.SMTP_PORT || '465');
      const secure = process.env.SMTP_SECURE === 'true' || port === 465;

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: port,
        secure: secure,
        requireTLS: port === 587,
        tls: {
          servername: servername
        },
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      } as any);
      
      const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'contact@aviationonline.net';
      const fromName = process.env.SMTP_FROM || 'Aviation Online';
      const from = `"${fromName}" <${fromEmail}>`;
      
      await transporter.sendMail({
        from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
      });
      addLog('info', `Email sent via SMTP to ${to}`);
      console.log(`[EMAIL] Successfully sent email via SMTP to ${to} (Subject: ${subject})`);
      return { success: true };
    } catch (error: any) {
      smtpFailed = true;
      smtpError = error;
      addLog('warn', `SMTP failed, will try fallback if available`, error.message || error);
      console.warn(`[EMAIL WARNING] SMTP failed to ${to}:`, error.message);
    }
  }

  // Fallback to Resend if SMTP failed or wasn't configured
  if (!process.env.SMTP_HOST || smtpFailed) {
    try {
      if (!process.env.RESEND_API_KEY) {
        if (smtpFailed) throw smtpError; // Rethrow SMTP error if no fallback
        throw new Error("No email service configured (neither SMTP nor Resend)");
      }

      addLog('info', 'Using Resend for email sending');
      const resend = getResend();
      const from = process.env.RESEND_FROM || 'Aviation Online <onboarding@resend.dev>';
      
      if (from.includes('onboarding@resend.dev') && to !== 'ident@aviationonline.fr' && to !== 'contact@aviationonline.net') {
        console.warn(`[EMAIL WARNING] Using Resend onboarding address. Emails to ${to} will likely fail unless this email is verified in your Resend account. Please verify your domain in Resend and set the RESEND_FROM environment variable.`);
      }

      const { data, error } = await resend.emails.send({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      });

      if (error) {
        throw new Error(`Resend API Error: ${error.message}`);
      }

      addLog('info', `Email sent via Resend to ${to}`);
      console.log(`[EMAIL] Successfully sent email via Resend to ${to} (Subject: ${subject})`);
      return { success: true, data };
    } catch (error: any) {
      addLog('error', `Failed to send email to ${to}`, error.message || error);
      console.error(`[EMAIL ERROR] Failed to send email to ${to} (Subject: ${subject}):`, error);
      throw error;
    }
  }
}

// Initialize Firebase Admin (for Auth/Verification)
let auth: any;
try {
  if (admin.apps.length === 0) {
    const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: firebaseConfig.projectId
      });
      console.log("Firebase Admin initialized with serviceAccountKey.json");
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: firebaseConfig.projectId
      });
      console.log("Firebase Admin initialized without explicit credentials (ADC fallback via applicationDefault())");
    }
  }
  auth = admin.auth();
} catch (e) {
  console.error("Firebase Admin init failed", e);
}

// Initialize Firebase Client SDK for the server
// This uses the API Key and is often more reliable in this environment
let db: any;
let clientAuth: any;
async function initFirebaseClient() {
  try {
    const apps = getClientApps();
    const app = apps.length === 0 ? initializeClientApp(firebaseConfig) : apps[0];
    db = getClientFirestore(app, firebaseConfig.firestoreDatabaseId);
    clientAuth = getClientAuth(app);
    
    // Authenticate the server client
    const serverEmail = 'server@aviationonline.net';
    const serverPassword = process.env.SERVER_SECRET_PASSWORD || 'SuperSecretPassword123!';
    
    try {
      await signInWithEmailAndPassword(clientAuth, serverEmail, serverPassword);
      console.log("Server authenticated with Firebase Client SDK");
    } catch (authErr: any) {
      if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
        try {
          await createUserWithEmailAndPassword(clientAuth, serverEmail, serverPassword);
          console.log("Server user created and authenticated");
        } catch (createErr) {
          console.error("Failed to create server user:", createErr);
        }
      } else {
        console.error("Server authentication failed:", authErr);
      }
    }
    
    console.log("Firebase Client SDK initialized on server for Firestore");
  } catch (e) {
    console.error("Firebase Client SDK init failed on server", e);
  }
}

// We will call initFirebaseClient inside startServer to ensure await works properly

async function initFirebase() {
  // Legacy wrapper to keep startServer happy
  console.log("Firebase initialization wrapper called");
  await initFirebaseClient();
}

// initFirebase(); // Removed top-level call

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.error("CRITICAL: STRIPE_SECRET_KEY is missing from environment variables!");
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    console.log(`Initializing Stripe with key starting with: ${key.substring(0, 7)}...`);
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

async function startServer() {
  console.log("Starting server process...");
  
  // Ensure Firebase is initialized before starting the server
  await initFirebase();
  
  const app = express();
  const PORT = 3000;

  // Request logger
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // Stripe Webhook
  app.post("/api/webhooks/stripe", express.raw({ type: 'application/json' }), async (req, res) => {
    console.log("Stripe Webhook received");
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      console.warn("Webhook missing signature or secret");
      return res.status(400).send('Webhook Error: Missing signature or secret');
    }

    let event;

    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`Webhook event type: ${event.type}`);

    // Handle the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId || session.client_reference_id;
      const userEmail = (session.metadata?.userEmail || session.customer_email || session.customer_details?.email || '').toLowerCase();

      console.log(`Processing checkout.session.completed for user: ${userId}, email: ${userEmail}, session: ${session.id}`);

      if (userId) {
        try {
          const updatePaidStatus = async (targetDb: any, uid: string) => {
            await updateDoc(doc(targetDb, 'users', uid), {
              isPaid: true,
              paidAt: Timestamp.now(),
              stripeSessionId: session.id
            });
            return true;
          };

          try {
            await updatePaidStatus(db, userId);
            console.log(`User ${userId} successfully marked as paid in Firestore via Webhook (ID match)`);
          } catch (err: any) {
            console.error("Webhook: Failed to update user status", err.message);
            // Fallback to default DB if named fails
            const defaultDb = getClientFirestore(getClientApp());
            await updatePaidStatus(defaultDb, userId);
            console.log(`User ${userId} successfully marked as paid in DEFAULT Firestore via Webhook`);
          }

          // Get user data for emails
          const userDoc = await getDoc(doc(db, 'users', userId));
          const userData = userDoc.data();
          
          if (userData && userData.email) {
            const appUrl = process.env.APP_URL || `https://${req.get('host')}`;
            console.log(`Sending confirmation emails to client (${userData.email}) and admin. Using appUrl: ${appUrl}`);
            
            // 1. Send confirmation email to CLIENT
            try {
              await sendEmail({
                to: userData.email,
                subject: 'Confirmation de paiement - Aviation Online',
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #2563eb;">Merci pour votre confiance !</h2>
                    <p>Votre paiement de 79€ a été validé avec succès.</p>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                      <p><strong>Accès débloqué :</strong></p>
                      <p>Vous avez maintenant un accès illimité à l'intégralité des modules de formation IFR.</p>
                      <p>Lien vers votre tableau de bord : <a href="${appUrl}/dashboard">${appUrl}/dashboard</a></p>
                    </div>
                    <p>Bons vols et bonne formation !</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #94a3b8;">Jean-Claude CHENARD - Aviation Online</p>
                  </div>
                `
              });
              console.log("Client email sent successfully");
            } catch (emailErr) {
              console.error(`Failed to send client email:`, emailErr);
            }

            // 2. Send notification email to ADMIN
            try {
              await sendEmail({
                to: 'contact@aviationonline.net',
                subject: '🔔 Nouvelle Vente : Formation IFR',
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #1e293b;">Nouvelle vente réalisée !</h2>
                    <p>Un nouvel utilisateur vient de débloquer la formation.</p>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                      <p><strong>Client :</strong> ${userData.firstName || ''} ${userData.lastName || ''} (${userData.email})</p>
                      <p><strong>Montant :</strong> 79.00 EUR</p>
                      <p><strong>ID Transaction :</strong> ${session.id}</p>
                    </div>
                  </div>
                `
              });
              console.log("Admin notification email sent successfully");
            } catch (adminEmailErr) {
              console.error(`Failed to send admin notification email:`, adminEmailErr);
            }
          } else {
            console.warn(`User data or email not found for userId: ${userId}`);
          }
        } catch (err: any) {
          console.error(`Error updating user ${userId} via Webhook:`, err.message);
        }
      } else if (userEmail) {
        // Fallback: try to find user by email if userId is missing
        try {
          const usersRef = collection(db, 'users');
          const snapshot = await getDocs(query(usersRef, where('email', '==', userEmail.toLowerCase()), limit(1)));
          
          if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            await updateDoc(userDoc.ref, {
              isPaid: true,
              paidAt: Timestamp.now(),
              stripeSessionId: session.id
            });
            console.log(`User ${userDoc.id} successfully marked as paid in Firestore via Webhook (Email match: ${userEmail})`);
          } else {
            console.log(`No user found with email ${userEmail}. Creating new user from webhook...`);
            try {
              const tempPassword = Math.random().toString(36).slice(-8) + "Az1!"; // Ensure password complexity
              const displayName = session.customer_details?.name || 'Pilote';
              const firstName = displayName.split(' ')[0] || '';
              const lastName = displayName.split(' ').slice(1).join(' ') || '';

              let userRecord;
              try {
                userRecord = await auth.getUserByEmail(userEmail);
                console.log(`User already exists in Auth, updating password: ${userRecord.uid}`);
                await auth.updateUser(userRecord.uid, { password: tempPassword });
              } catch (e: any) {
                if (e.code === 'auth/user-not-found') {
                  userRecord = await auth.createUser({
                    email: userEmail,
                    emailVerified: true,
                    password: tempPassword,
                    displayName: displayName,
                  });
                } else {
                  throw e;
                }
              }

              // Create Firestore Profile
              await setDoc(doc(db, 'users', userRecord.uid), {
                uid: userRecord.uid,
                email: userEmail,
                firstName: firstName,
                lastName: lastName,
                role: 'student',
                isPaid: true,
                paidAt: Timestamp.now(),
                stripeSessionId: session.id,
                createdAt: Timestamp.now(),
              });

              console.log(`New user ${userRecord.uid} successfully created and marked as paid via Webhook`);

              // Send welcome email with password
              const appUrl = process.env.APP_URL || `https://${req.get('host')}`;
              await sendEmail({
                to: userEmail,
                subject: 'Vos accès & Confirmation de paiement - Aviation Online',
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #2563eb;">Bienvenue sur Aviation Online !</h2>
                    <p>Votre paiement de 79€ a été validé avec succès. Votre compte a été créé automatiquement.</p>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                      <p><strong>Vos identifiants de connexion :</strong></p>
                      <p>Email : ${userEmail}</p>
                      <p>Mot de passe provisoire : <strong>${tempPassword}</strong></p>
                      <p>Lien de connexion : <a href="${appUrl}/login">${appUrl}/login</a></p>
                    </div>
                    <p>Nous vous conseillons de modifier votre mot de passe une fois connecté (dans votre profil).</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #94a3b8;">Jean-Claude CHENARD - Aviation Online</p>
                  </div>
                `
              });
              
              // Notify admin
              await sendEmail({
                to: 'contact@aviationonline.net',
                subject: '🔔 Nouveau Client & Création de compte',
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #1e293b;">Nouveau client créé !</h2>
                    <p>Un client vient d'acheter via un lien externe, son compte a été généré.</p>
                    <p>Client : ${displayName} (${userEmail})</p>
                  </div>
                `
              });

            } catch (createErr: any) {
              console.error(`Failed to automatically create user for email ${userEmail}:`, createErr.message || createErr);
            }
          }
        } catch (err: any) {
          console.error(`Error searching/updating user by email ${userEmail} via Webhook:`, err.message);
        }
      }
    }

    res.json({ received: true });
  });

  app.use(express.json({ limit: '50mb' }));

  console.log("Environment:", process.env.NODE_ENV);
  console.log("CWD:", process.cwd());
  console.log("Dist exists:", fs.existsSync(path.join(process.cwd(), 'dist')));

  // API routes
  app.get("/api/health", (req, res) => {
    console.log("Health check requested");
    res.json({ 
      status: "ok", 
      version: "1.0.9",
      env: process.env.NODE_ENV,
      cwd: process.cwd(),
      distExists: fs.existsSync(path.join(process.cwd(), 'dist')),
      geminiKey: !!process.env.GEMINI_API_KEY,
      resendKey: !!process.env.RESEND_API_KEY,
      smtpHost: !!process.env.SMTP_HOST
    });
  });

  app.get("/api/debug-logs", (req, res) => {
    res.json(debugLogs);
  });

  // Migration API
  app.post("/api/admin/migrate-users", async (req, res) => {
    const { users, adminToken } = req.body;

    try {
      // Verify admin token
      const decodedToken = await auth.verifyIdToken(adminToken);
      if (decodedToken.email !== 'ident@aviationonline.fr' && decodedToken.email !== 'contact@aviationonline.net') {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const results = [];
      for (const userData of users) {
        try {
          // 1. Create Auth User
          const userRecord = await auth.createUser({
            email: userData.email,
            emailVerified: true,
            password: Math.random().toString(36).slice(-12), // Random password
            displayName: `${userData.firstName} ${userData.lastName}`,
          });

          // 2. Create Firestore Profile
          await setDoc(doc(db, 'users', userRecord.uid), {
            uid: userRecord.uid,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            address: userData.address || '',
            zipCode: userData.zipCode || '',
            city: userData.city || '',
            country: userData.country || 'France',
            role: 'student',
            isPaid: true, // Migrated users are usually already paid
            createdAt: serverTimestamp(),
          });

          // 3. Send Welcome Email
          const tempPassword = userData.password || 'Bienvenue2026!'; // Use provided or default
          try {
            await sendEmail({
              to: userData.email,
              subject: 'Bienvenue sur Aviation Online - Vos accès',
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                  <h2 style="color: #2563eb;">Bienvenue ${userData.firstName} !</h2>
                  <p>Votre compte a été migré avec succès sur notre nouvelle plateforme de formation IFR.</p>
                  <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <p><strong>Vos identifiants de connexion :</strong></p>
                    <p>Email : ${userData.email}</p>
                    <p>Lien de connexion : <a href="${process.env.APP_URL}/login">${process.env.APP_URL}/login</a></p>
                  </div>
                  <p>Vous pouvez réinitialiser votre mot de passe à tout moment via la page de connexion.</p>
                  <p>Bons vols !</p>
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #94a3b8;">Jean-Claude CHENARD - Aviation Online</p>
                </div>
              `
            });
          } catch (emailErr) {
            console.error(`Failed to send email to ${userData.email}:`, emailErr);
          }

          results.push({ email: userData.email, status: 'success', uid: userRecord.uid });
        } catch (e: any) {
          results.push({ email: userData.email, status: 'error', error: e.message });
        }
      }

      res.json({ results });
    } catch (error: any) {
      console.error("Migration Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test Database Connectivity
  app.post("/api/admin/activate-user", async (req, res) => {
    const { userId, authHeader, isPaid } = req.body;
    
    try {
      if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
      
      const token = authHeader.split(' ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      
      // Only allow specific admin email
      if (decodedToken.email !== 'ident@aviationonline.fr' && decodedToken.email !== 'contact@aviationonline.net') {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (!userId) return res.status(400).json({ error: "UserId required" });

      const updatePaidStatus = async (targetDb: any, uid: string) => {
        await updateDoc(doc(targetDb, 'users', uid), {
          isPaid: isPaid,
          paidAt: isPaid ? Timestamp.now() : null,
          manualActivation: true,
          activatedBy: decodedToken.email
        });
      };

      try {
        await updatePaidStatus(db, userId);
      } catch (err: any) {
        throw err;
      }

      // If we are activating the user, send the confirmation email
      if (isPaid) {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          const userData = userDoc.data();
          
          if (userData && userData.email) {
            const appUrl = process.env.APP_URL || `https://${req.get('host')}`;
            
            // Send confirmation email to CLIENT
            await sendEmail({
              to: userData.email,
              subject: 'Confirmation de paiement - Aviation Online',
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                  <h2 style="color: #2563eb;">Merci pour votre confiance !</h2>
                  <p>Votre accès a été validé avec succès (Activation manuelle).</p>
                  <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <p><strong>Accès débloqué :</strong></p>
                    <p>Vous avez maintenant un accès illimité à l'intégralité des modules de formation IFR.</p>
                    <p>Lien vers votre tableau de bord : <a href="${appUrl}/dashboard">${appUrl}/dashboard</a></p>
                  </div>
                  <p>Bons vols et bonne formation !</p>
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #94a3b8;">Jean-Claude CHENARD - Aviation Online</p>
                </div>
              `
            });
            
            // Send notification email to ADMIN
            await sendEmail({
              to: 'contact@aviationonline.net',
              subject: '🔔 Activation Manuelle : Formation IFR',
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                  <h2 style="color: #16a34a;">Activation manuelle confirmée !</h2>
                  <p>Un client vient d'être activé manuellement.</p>
                  <ul>
                    <li><strong>Client :</strong> ${userData.name || 'N/A'}</li>
                    <li><strong>Email :</strong> ${userData.email}</li>
                    <li><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</li>
                  </ul>
                </div>
              `
            });
          }
        } catch (emailErr) {
          console.error("Failed to send manual activation emails:", emailErr);
        }
      }

      res.json({ success: true, message: `Utilisateur ${userId} ${isPaid ? 'activé' : 'désactivé'} manuellement.` });
    } catch (error: any) {
      console.error("Admin Activation Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/test-db", async (req, res) => {
    const results: any = {};
    const dbId = firebaseConfig.firestoreDatabaseId;
    const clientApp = getClientApp();
    
    results.adminInfo = {
      projectId: admin.app().options.projectId,
      appsCount: admin.apps.length,
      envProjectId: process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
      configProjectId: firebaseConfig.projectId,
      env: {
        PROJECT_ID: process.env.PROJECT_ID,
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
        FIREBASE_CONFIG: process.env.FIREBASE_CONFIG ? "PRESENT" : "MISSING"
      }
    };
    
    try {
      console.log(`Testing named DB connectivity (${dbId})...`);
      const testDb = dbId && dbId !== '(default)' ? getClientFirestore(clientApp, dbId) : getClientFirestore(clientApp);
      const snapshot = await getDocs(query(collection(testDb, '_health_check_'), limit(1)));
      results.namedDb = { success: true, count: snapshot.size, databaseId: dbId };
    } catch (err: any) {
      console.error(`Named DB Test Error (${dbId}):`, err.message);
      results.namedDb = { 
        success: false, 
        error: err.message, 
        code: err.code,
        stack: err.stack?.split('\n').slice(0, 3).join('\n')
      };
    }

    try {
      console.log("Testing default DB connectivity...");
      const defaultDb = getClientFirestore(clientApp);
      const snapshot = await getDocs(query(collection(defaultDb, '_health_check_'), limit(1)));
      results.defaultDb = { success: true, count: snapshot.size };
    } catch (err: any) {
      console.error("Default DB Test Error:", err.message);
      results.defaultDb = { 
        success: false, 
        error: err.message, 
        code: err.code,
        stack: err.stack?.split('\n').slice(0, 3).join('\n')
      };
    }

    res.json(results);
  });

  // Test Auth Connectivity
  app.get("/api/admin/test-auth", async (req, res) => {
    try {
      console.log("Testing Auth connectivity...");
      const listUsers = await auth.listUsers(1);
      res.json({ success: true, userCount: listUsers.users.length });
    } catch (err: any) {
      console.error("Auth Test Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete User API
  app.post("/api/admin/delete-user", async (req, res) => {
    const { uid, adminToken } = req.body;

    try {
      if (!adminToken) {
        return res.status(401).json({ error: "No admin token provided" });
      }

      // Verify admin token
      let decodedToken;
      try {
        decodedToken = await auth.verifyIdToken(adminToken);
        console.log(`Admin token verified for: ${decodedToken.email}`);
      } catch (tokenErr: any) {
        console.error("Token verification failed:", tokenErr.message);
        return res.status(401).json({ error: "Invalid admin token: " + tokenErr.message });
      }
      
      if (decodedToken.email !== 'ident@aviationonline.fr' && decodedToken.email !== 'contact@aviationonline.net') {
        return res.status(403).json({ error: "Unauthorized: You are not the master admin" });
      }

      console.log(`Deleting user ${uid} requested by admin ${decodedToken.email}`);

      // 1. Delete from Firebase Auth
      let authDeleted = false;
      let authDeleteWarning = "";
      try {
        await auth.deleteUser(uid);
        console.log(`User ${uid} deleted from Auth successfully`);
        authDeleted = true;
      } catch (authErr: any) {
        if (authErr.message && authErr.message.includes('Identity Toolkit API has not been used')) {
          console.warn(`Auth deletion skipped for ${uid} due to AI Studio environment restrictions.`);
          authDeleteWarning = "L'utilisateur a été supprimé de la base de données, mais vous devez le supprimer manuellement de l'onglet 'Authentication' dans la console Firebase (restriction de l'environnement de test).";
        } else {
          console.error(`Auth deletion failed for ${uid}:`, authErr.message);
          authDeleteWarning = "Impossible de supprimer le compte d'authentification. Veuillez le supprimer manuellement dans la console Firebase.";
        }
        // We continue even if auth deletion fails (user might not exist in Auth but exists in Firestore)
      }

      // 2. Delete from Firestore
      try {
        console.log(`Deleting Firestore profile for ${uid} in database ${firebaseConfig.firestoreDatabaseId}...`);
        await deleteDoc(doc(db, 'users', uid));
        console.log(`Firestore profile for ${uid} deleted successfully`);
      } catch (dbErr: any) {
        console.error(`Firestore deletion failed for ${uid}:`, dbErr.message);
        // If the error is "not found", we can consider it a success (user already gone)
        if (!dbErr.message.toLowerCase().includes("not found") && !dbErr.message.toLowerCase().includes("not_found")) {
          return res.status(500).json({ error: "Firestore error: " + dbErr.message });
        }
      }

      // 3. Delete connection logs
      try {
        console.log(`Deleting connection logs for ${uid}...`);
        const logsSnapshot = await getDocs(query(collection(db, 'connection_logs'), where('uid', '==', uid)));
        console.log(`Found ${logsSnapshot.size} connection logs`);
        
        if (logsSnapshot.size > 0) {
          const batch = writeBatch(db);
          logsSnapshot.docs.forEach((d: any) => batch.delete(d.ref));
          await batch.commit();
          console.log(`Connection logs for ${uid} deleted successfully`);
        }
      } catch (logsErr: any) {
        console.error(`Logs deletion failed for ${uid}:`, logsErr.message);
        // Not a fatal error for the user deletion process
      }

      // 4. Delete quiz attempts
      try {
        console.log(`Deleting quiz attempts for ${uid}...`);
        const attemptsSnapshot = await getDocs(query(collection(db, 'quiz_attempts'), where('userId', '==', uid)));
        console.log(`Found ${attemptsSnapshot.size} quiz attempts`);
        
        if (attemptsSnapshot.size > 0) {
          const batch = writeBatch(db);
          attemptsSnapshot.docs.forEach((d: any) => batch.delete(d.ref));
          await batch.commit();
          console.log(`Quiz attempts for ${uid} deleted successfully`);
        }
      } catch (attemptsErr: any) {
        console.error(`Quiz attempts deletion failed for ${uid}:`, attemptsErr.message);
      }

      res.json({ 
        success: true,
        authDeleted,
        warning: authDeleteWarning || undefined
      });
    } catch (error: any) {
      console.error("Delete User Global Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  app.post("/api/check-payment-status", async (req, res) => {
    const { userId, email } = req.body;
    if (!userId) return res.status(400).json({ error: "UserId required" });

    try {
      console.log(`Manual payment check requested for user: ${userId}, email: ${email}`);
      
      const dbId = firebaseConfig.firestoreDatabaseId;
      if (!db) {
        console.error("Manual payment check: Firestore not initialized");
        return res.status(500).json({ error: "Service de base de données non disponible. Veuillez réessayer plus tard." });
      }

      let targetDb = db;
      let userDoc;
      
      const checkDoc = async (database: any, id: string) => {
        try {
          return await getDoc(doc(database, 'users', id));
        } catch (err: any) {
          console.error(`Error fetching user doc from database:`, err.message);
          throw err;
        }
      };

      try {
        userDoc = await checkDoc(targetDb, userId);
      } catch (err: any) {
        console.error(`Check Payment Status: Initial fetch failed for user ${userId}. Code: ${err.code}, Message: ${err.message}`);
        
        return res.status(500).json({ 
          error: `Erreur lors de l'accès à la base de données: ${err.message}`,
          code: err.code,
          details: err.message,
          projectId: firebaseConfig.projectId,
          databaseId: dbId
        });
      }

      if (userDoc && userDoc.exists && userDoc.data()?.isPaid) {
        console.log(`User ${userId} already marked as paid in DB`);
        return res.json({ success: true, alreadyPaid: true, message: "Votre accès est déjà actif." });
      }

      console.log("Getting Stripe instance for payment check...");
      const stripe = getStripe();
      const isTestMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');
      
      console.log(`Listing recent Stripe sessions (Mode: ${isTestMode ? 'TEST' : 'LIVE'})...`);
      const sessions = await stripe.checkout.sessions.list({
        limit: 100,
        expand: ['data.customer']
      });

      console.log(`Successfully retrieved ${sessions.data.length} recent sessions from Stripe`);

      // Find a paid session for this user
      const userSession = sessions.data.find(s => {
        const sUserId = s.metadata?.userId || s.client_reference_id;
        const sEmail = (s.customer_details?.email || s.customer_email || s.metadata?.userEmail || '').toLowerCase();
        const targetEmail = (email || '').toLowerCase();
        
        const matchesId = sUserId === userId;
        const matchesEmail = sEmail === targetEmail && targetEmail !== '';
        const isPaid = s.payment_status === 'paid';
        
        if (isPaid && (matchesId || matchesEmail)) {
          console.log(`Match found! Session: ${s.id}, matchesId: ${matchesId}, matchesEmail: ${matchesEmail}, email: ${sEmail}`);
          return true;
        }
        return false;
      });

      if (userSession) {
        console.log(`Found paid session ${userSession.id} for user ${userId} (or email ${email}) during manual check`);
        await updateDoc(doc(targetDb, 'users', userId), {
          isPaid: true,
          paidAt: Timestamp.now(),
          stripeSessionId: userSession.id
        });
        
        console.log(`User ${userId} successfully activated via manual check`);
        
        // Send confirmation emails since we just activated the user
        const appUrl = process.env.APP_URL || `https://${req.get('host')}`;
        const userData = userDoc?.data() || { email, firstName: '', lastName: '' };
        
        try {
          await sendEmail({
            to: email,
            subject: 'Confirmation de paiement - Aviation Online',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #2563eb;">Merci pour votre confiance !</h2>
                <p>Votre paiement de 79€ a été validé avec succès.</p>
                <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                  <p><strong>Accès débloqué :</strong></p>
                  <p>Vous avez maintenant un accès illimité à l'intégralité des modules de formation IFR.</p>
                  <p>Lien vers votre tableau de bord : <a href="${appUrl}/dashboard">${appUrl}/dashboard</a></p>
                </div>
                <p>Bons vols et bonne formation !</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #94a3b8;">Jean-Claude CHENARD - Aviation Online</p>
              </div>
            `
          });
          console.log("Client payment email sent successfully from manual check");
        } catch (emailErr) {
          console.error(`Failed to send client payment email:`, emailErr);
        }

        try {
          await sendEmail({
            to: 'contact@aviationonline.net',
            subject: '🔔 Nouvelle Vente : Formation IFR',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #1e293b;">Nouvelle vente réalisée !</h2>
                <p>Un nouvel utilisateur vient de débloquer la formation (vérification manuelle).</p>
                <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                  <p><strong>Client :</strong> ${userData.firstName || ''} ${userData.lastName || ''} (${email})</p>
                  <p><strong>Montant :</strong> 79.00 EUR</p>
                  <p><strong>ID Transaction :</strong> ${userSession.id}</p>
                </div>
              </div>
            `
          });
          console.log("Admin payment notification email sent successfully from manual check");
        } catch (adminEmailErr) {
          console.error(`Failed to send admin payment notification email:`, adminEmailErr);
        }

        return res.json({ success: true, message: "Paiement confirmé ! Votre accès est maintenant activé." });
      }

      // If still not found, maybe check by email in DB one last time
      if (email) {
        const emailMatchSnapshot = await getDocs(query(collection(targetDb, 'users'), where('email', '==', email.toLowerCase()), limit(1)));
        if (!emailMatchSnapshot.empty && emailMatchSnapshot.docs[0].data().isPaid) {
          const matchedUser = emailMatchSnapshot.docs[0];
          console.log(`Found another user document with same email ${email} that is already paid. UID: ${matchedUser.id}`);
          // If the current userId is different, we might want to link them or just inform
          if (matchedUser.id !== userId) {
            return res.json({ 
              success: false, 
              message: `Un compte avec l'email ${email} est déjà activé, mais il semble lié à un autre identifiant (${matchedUser.id}). Veuillez vous connecter avec le bon compte.`
            });
          }
        }
      }

      console.log(`No paid session found for user: ${userId}, email: ${email}`);
      res.json({ 
        success: false, 
        debug: { 
          userId, 
          email, 
          stripeMode: isTestMode ? 'TEST' : 'LIVE',
          sessionsChecked: sessions.data.length,
          lastSessions: sessions.data.slice(0, 15).map(s => ({
            id: s.id,
            email: s.customer_details?.email || s.customer_email || 'no-email',
            paid: s.payment_status === 'paid',
            userId: s.metadata?.userId || s.client_reference_id || 'no-id',
            created: new Date(s.created * 1000).toISOString()
          }))
        },
        message: `Aucun paiement validé n'a été trouvé pour l'utilisateur ${userId} (${email}). Si vous venez de payer, veuillez patienter quelques instants (jusqu'à 2 minutes) et réessayer. Si le problème persiste, contactez le support.` 
      });
    } catch (error: any) {
      const dbId = firebaseConfig.firestoreDatabaseId;
      console.error(`Check Payment Status Error (Database ID: ${dbId}):`, error);
      
      // If we get a NOT_FOUND error, it's likely the database ID is wrong
      if (error.message.includes("NOT_FOUND") || error.code === 5) {
        console.error("CRITICAL: Firestore database not found. Please check firestoreDatabaseId in firebase-applet-config.json");
      }
      
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/test-email", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      
      await sendEmail({
        to: email,
        subject: 'Test de configuration Email - Aviation Online',
        html: '<p>Si vous recevez cet email, votre configuration SMTP ou Resend fonctionne correctement !</p>'
      });
      
      res.json({ success: true, message: "Email envoyé avec succès" });
    } catch (error: any) {
      console.error("Test email error:", error);
      res.status(500).json({ 
        error: error.message || "Erreur inconnue",
        details: error.response || error.code || "Aucun détail supplémentaire"
      });
    }
  });

  app.post("/api/send-welcome-email", async (req, res) => {
    const { email, name } = req.body;

    try {
      // Send welcome email to the CLIENT
      try {
        await sendEmail({
          to: email,
          subject: 'Bienvenue sur Aviation Online !',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #2563eb;">Bienvenue ${name} !</h2>
              <p>Nous sommes ravis de vous compter parmi nos élèves pilotes.</p>
              <p>Vous avez maintenant accès à votre espace de formation. Si vous n'avez pas encore débloqué l'intégralité du contenu, vous pouvez le faire depuis votre tableau de bord.</p>
              <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <p><strong>Vos prochaines étapes :</strong></p>
                <ul>
                  <li>Explorez les modules de formation</li>
                  <li>Consultez les schémas pédagogiques</li>
                  <li>Testez vos connaissances avec les QCM</li>
                </ul>
              </div>
              <p>Bons vols !</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #94a3b8;">Jean-Claude CHENARD - Aviation Online</p>
            </div>
          `
        });
      } catch (clientErr) {
        console.error("Failed to send welcome email to client:", clientErr);
      }

      // Send notification email to ADMIN
      try {
        await sendEmail({
          to: 'contact@aviationonline.net',
          subject: '🔔 Nouvel inscrit : Formation IFR',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #2563eb;">Nouvelle inscription !</h2>
              <p>Un nouvel utilisateur vient de s'inscrire sur la plateforme.</p>
              <ul>
                <li><strong>Nom :</strong> ${name || 'N/A'}</li>
                <li><strong>Email :</strong> ${email}</li>
                <li><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</li>
              </ul>
              <p>Cet utilisateur n'a pas encore payé son accès.</p>
            </div>
          `
        });
      } catch (adminErr) {
        console.error("Failed to send admin notification for new user:", adminErr);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Welcome Email Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/send-quiz-results", async (req, res) => {
    const { userEmail, userName, quizTitle, score, totalQuestions, percentage } = req.body;
    console.log(`Received request to send QCM results for ${userEmail} (${userName}) - Quiz: ${quizTitle}`);

    try {
      // Send both emails in parallel so one failure doesn't block the other
      const results = await Promise.allSettled([
        // Send to student
        sendEmail({
          to: userEmail,
          subject: `Résultats QCM : ${quizTitle}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; rounded: 10px;">
              <h2 style="color: #2563eb;">Bravo ${userName} !</h2>
              <p>Vous venez de terminer le quiz : <strong>${quizTitle}</strong></p>
              <div style="background: #f8fafc; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
                <div style="font-size: 48px; font-weight: bold; color: #1e293b;">${score} / ${totalQuestions}</div>
                <div style="font-size: 18px; color: #2563eb; font-weight: bold;">${percentage}% de réussite</div>
              </div>
              <p>Continuez vos efforts pour réussir votre formation IFR !</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #94a3b8;">Ceci est un message automatique de Aviation Online.</p>
            </div>
          `
        }),
        // Send to admin
        sendEmail({
          to: 'contact@aviationonline.net',
          subject: `Nouveau résultat QCM : ${userName}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; rounded: 10px;">
              <h2 style="color: #1e293b;">Nouveau résultat QCM</h2>
              <p>L'étudiant <strong>${userName}</strong> (${userEmail}) a terminé un quiz.</p>
              <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <p><strong>Quiz :</strong> ${quizTitle}</p>
                <p><strong>Score :</strong> ${score} / ${totalQuestions} (${percentage}%)</p>
              </div>
            </div>
          `
        })
      ]);

      // Log any failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Email ${index === 0 ? 'to student' : 'to admin'} failed:`, result.reason);
        }
      });

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("Email Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/create-student", async (req, res) => {
    const { adminToken, email, firstName, lastName, password } = req.body;
    try {
      if (!adminToken) return res.status(401).json({ error: "Unauthorized" });
      const decodedToken = await auth.verifyIdToken(adminToken);
      if (decodedToken.email !== 'ident@aviationonline.fr' && decodedToken.email !== 'contact@aviationonline.net') {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis" });

      let userRecord;
      try {
        userRecord = await auth.createUser({
          email: email,
          emailVerified: true,
          password: password,
          displayName: `${firstName} ${lastName}`.trim(),
        });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') {
          userRecord = await auth.getUserByEmail(email);
          await auth.updateUser(userRecord.uid, { password: password, displayName: `${firstName} ${lastName}`.trim() });
        } else {
          throw e; // fail loudly for other errors
        }
      }

      await setDoc(doc(db, 'users', userRecord.uid), {
        uid: userRecord.uid,
        email: email.toLowerCase(),
        firstName: firstName || '',
        lastName: lastName || '',
        role: 'student',
        isPaid: true,
        paidAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      });

      res.json({ success: true, message: "Utilisateur créé avec succès" });
    } catch (e: any) {
      console.error("Create student error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/sync-missing-stripe", async (req, res) => {
    const { adminToken } = req.body;
    try {
      if (!adminToken) return res.status(401).json({ error: "Unauthorized" });
      const decodedToken = await auth.verifyIdToken(adminToken);
      if (decodedToken.email !== 'ident@aviationonline.fr' && decodedToken.email !== 'contact@aviationonline.net') {
        return res.status(403).json({ error: "Forbidden" });
      }

      console.log("Admin syncing all missing Stripe sessions...");
      const stripe = getStripe();
      const sessions = await stripe.checkout.sessions.list({
        limit: 100,
        expand: ['data.customer']
      });

      const paidSessions = sessions.data.filter(s => s.payment_status === 'paid');
      let createdCount = 0;
      let updatedCount = 0;

      for (const session of paidSessions) {
        const userEmail = (session.customer_details?.email || session.customer_email || session.metadata?.userEmail || '').toLowerCase();
        if (!userEmail) continue;

        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(query(usersRef, where('email', '==', userEmail), limit(1)));

        if (snapshot.empty) {
          // CREATE missing user
          try {
            console.log(`Missing user found for paid session! Email: ${userEmail}`);
            const tempPassword = Math.random().toString(36).slice(-8) + "Az1!";
            const displayName = session.customer_details?.name || 'Pilote';
            const firstName = displayName.split(' ')[0] || '';
            const lastName = displayName.split(' ').slice(1).join(' ') || '';

            let userRecord;
            try {
              userRecord = await auth.getUserByEmail(userEmail);
              await auth.updateUser(userRecord.uid, { password: tempPassword, displayName: displayName });
            } catch (e: any) {
              if (e.code === 'auth/user-not-found') {
                userRecord = await auth.createUser({
                  email: userEmail,
                  emailVerified: true,
                  password: tempPassword,
                  displayName: displayName,
                });
              } else {
                throw e;
              }
            }

            await setDoc(doc(db, 'users', userRecord.uid), {
              uid: userRecord.uid,
              email: userEmail,
              firstName: firstName,
              lastName: lastName,
              role: 'student',
              isPaid: true,
              paidAt: Timestamp.now(),
              stripeSessionId: session.id,
              createdAt: Timestamp.now(),
            });

            const appUrl = process.env.APP_URL || `https://${req.get('host')}`;
            await sendEmail({
              to: userEmail,
              subject: 'Vos accès - Aviation Online',
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                  <h2 style="color: #2563eb;">Bienvenue sur Aviation Online !</h2>
                  <p>Votre paiement a été retrouvé avec succès. Votre compte vient d'être généré.</p>
                  <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <p><strong>Vos identifiants de connexion :</strong></p>
                    <p>Email : ${userEmail}</p>
                    <p>Mot de passe provisoire : <strong>${tempPassword}</strong></p>
                    <p>Lien de connexion : <a href="${appUrl}/login">${appUrl}/login</a></p>
                  </div>
                  <p>Nous vous conseillons de modifier votre mot de passe une fois connecté.</p>
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #94a3b8;">Jean-Claude CHENARD - Aviation Online</p>
                </div>
              `
            }).catch(e => console.error("Could not send email to synced user", e));

            createdCount++;
          } catch (e: any) {
            console.error(`Failed to create missing user ${userEmail}:`, e.message);
          }
        } else {
          // User exists, just ensure they are marked paid
          const userDoc = snapshot.docs[0];
          if (!userDoc.data().isPaid) {
            await updateDoc(userDoc.ref, {
              isPaid: true,
              paidAt: Timestamp.now(),
              stripeSessionId: session.id
            });
            updatedCount++;
          }
        }
      }

      res.json({ success: true, created: createdCount, updated: updatedCount });
    } catch (e: any) {
      console.error("Sync missing Stripe error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/recent-stripe-payments", async (req, res) => {
    const { adminToken } = req.body;
    try {
      if (!adminToken) return res.status(401).json({ error: "Unauthorized" });
      const decodedToken = await auth.verifyIdToken(adminToken);
      if (decodedToken.email !== 'ident@aviationonline.fr' && decodedToken.email !== 'contact@aviationonline.net') {
        return res.status(403).json({ error: "Forbidden" });
      }

      const stripe = getStripe();
      // Fetch the last 15 checkout sessions
      const sessions = await stripe.checkout.sessions.list({
        limit: 15,
        expand: ['data.customer']
      });

      const recentPayments = sessions.data.map(s => ({
        id: s.id,
        email: (s.customer_details?.email || s.customer_email || s.metadata?.userEmail || 'Inconnu').toLowerCase(),
        name: s.customer_details?.name || 'Inconnu',
        amount: (s.amount_total || 0) / 100,
        status: s.payment_status,
        date: new Date(s.created * 1000).toLocaleString('fr-FR'),
        mode: s.livemode ? 'Live' : 'Test'
      }));

      res.json({ success: true, payments: recentPayments });
    } catch (e: any) {
      console.error("Diagnostic Stripe error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const stripe = getStripe();
      const { userId, email } = req.body;

      if (!userId || !email) {
        return res.status(400).json({ error: "UserId and email are required" });
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.get('host');
      // Ensure we use https for non-localhost environments if not explicitly set
      let appUrl = process.env.APP_URL;
      if (!appUrl) {
        appUrl = `${protocol}://${host}`;
        if (!host.includes('localhost') && protocol === 'http') {
          appUrl = `https://${host}`;
        }
      }
      
      console.log("Creating checkout session with appUrl:", appUrl);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        client_reference_id: userId, // Added for better tracking
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: "Formation IFR Complète - Aviation Online",
                description: "Accès illimité à tous les modules de formation IR.",
              },
              unit_amount: 7900, // 79.00 EUR
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${appUrl}/dashboard?payment=success`,
        cancel_url: `${appUrl}/payment?payment=cancel`,
        customer_email: email,
        metadata: {
          userId: userId,
          userEmail: email
        },
      });

      res.json({ id: session.id, url: session.url });
    } catch (error: any) {
      console.error("Stripe Checkout Error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de la création de la session Stripe" });
    }
  });

  // Diagnostic API for Firebase connection
  app.get("/api/admin/diagnostic", async (req, res) => {
    console.log("Diagnostic request received");
    const results: any = {
      adminInfo: {
        projectId: admin.app().options.projectId,
        appsCount: admin.apps.length,
        envProjectId: process.env.PROJECT_ID,
        configProjectId: firebaseConfig.projectId,
        env: {
          PROJECT_ID: process.env.PROJECT_ID,
          GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
          FIREBASE_CONFIG: process.env.FIREBASE_CONFIG ? "SET" : "MISSING"
        }
      },
      namedDb: {},
      defaultDb: {}
    };

    const dbId = firebaseConfig.firestoreDatabaseId;
    const clientApp = getClientApp();
    
    try {
      console.log(`Testing named DB connectivity (${dbId})...`);
      const testDb = dbId && dbId !== '(default)' ? getClientFirestore(clientApp, dbId) : getClientFirestore(clientApp);
      const snapshot = await getDocs(query(collection(testDb, '_health_check_'), limit(1)));
      results.namedDb = { success: true, count: snapshot.size, databaseId: dbId };
    } catch (err: any) {
      console.error(`Named DB Test Error (${dbId}):`, err.message);
      results.namedDb = { 
        success: false, 
        error: err.message, 
        code: err.code,
        stack: err.stack?.split('\n').slice(0, 3).join('\n')
      };
    }

    try {
      console.log("Testing default DB connectivity...");
      const defaultDb = getClientFirestore(clientApp);
      const snapshot = await getDocs(query(collection(defaultDb, '_health_check_'), limit(1)));
      results.defaultDb = { success: true, count: snapshot.size };
    } catch (err: any) {
      console.error("Default DB Test Error:", err.message);
      results.defaultDb = { 
        success: false, 
        error: err.message, 
        code: err.code,
        stack: err.stack?.split('\n').slice(0, 3).join('\n')
      };
    }

    res.json(results);
  });

  // Debug Logs API
  app.get("/api/admin/logs", (req, res) => {
    res.json(debugLogs);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in DEVELOPMENT mode (Vite)");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in PRODUCTION mode (Static)");
    const distPath = path.join(process.cwd(), 'dist');
    console.log("Serving static files from:", distPath);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
