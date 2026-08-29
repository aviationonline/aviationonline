import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, auth, testConnection } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, Timestamp, writeBatch, getDocs, limit, where, getDocFromServer, setDoc } from 'firebase/firestore';
import { defaultTestimonials } from '../data/testimonials';
import { Plus, Trash2, Edit2, BookOpen, ChevronDown, ChevronUp, Database, FileText, X, AlertCircle, CheckCircle2, Upload, Download, History, Mail, UserPlus, Award, Users, Search, Star, Shield, ArrowUp, ArrowDown, Globe, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../App';
import Papa from 'papaparse';
import firebaseConfig from '../../firebase-applet-config.json';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { formatRedirectUrl, isExternalUrl } from '../services/urlUtils';
import { safeJsonStringify } from '../utils/safeJson';

interface Module {
  id: string;
  title: string;
  title_en?: string;
  description: string;
  description_en?: string;
  pdfUrl?: string;
  pdfUrl_en?: string;
  order: number;
}

interface Course {
  id: string;
  moduleId: string;
  title: string;
  title_en?: string;
  content: string;
  content_en?: string;
  pdfUrl?: string;
  pdfUrl_en?: string;
  order: number;
}

interface Student {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  zipCode?: string;
  city?: string;
  country?: string;
  role: string;
  isPaid: boolean;
  createdAt: Timestamp;
}

interface Quiz {
  id: string;
  title: string;
  title_en?: string;
  description: string;
  description_en?: string;
  category?: string;
  category_en?: string;
  order: number;
}

interface Question {
  id: string;
  quizId: string;
  text: string;
  text_en?: string;
  options: string[];
  options_en?: string[];
  correctAnswer: number;
  explanation?: string;
  explanation_en?: string;
  attachmentUrl?: string;
  attachmentUrl_en?: string;
  attachmentType?: 'image' | 'pdf';
  order: number;
}

interface ConnectionLog {
  id: string;
  uid: string;
  email: string;
  loginTime: Timestamp;
  lastActive: Timestamp;
  duration: number;
  lastPath?: string;
}

interface QuizAttempt {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  quizId: string;
  quizTitle: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  completedAt: Timestamp;
}

interface Testimonial {
  id: string;
  text: string;
  text_en?: string;
  author: string;
  role: string;
  role_en?: string;
  rating: number;
  order: number;
  createdAt?: Timestamp;
}

interface Promotion {
  isActive: boolean;
  endDate: string;
  discountPercentage: number;
  promoCode: string;
}

export default function AdminDashboard() {
  const { user, profile } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [questionsByQuiz, setQuestionsByQuiz] = useState<Record<string, Question[]>>({});
  const [quizAttempts, setQuizAttempts] = useState<any[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [activeTab, setActiveTab] = useState<'content' | 'users' | 'migration' | 'logs' | 'qcm' | 'results' | 'maintenance' | 'testimonials' | 'promotion' | 'site_status'>('content');
  const [basePrice, setBasePrice] = useState<number>(79);
  const [savingPrice, setSavingPrice] = useState(false);
  const [promotion, setPromotion] = useState<Promotion>({ isActive: false, endDate: '', discountPercentage: 0, promoCode: '' });
  const [savingPromotion, setSavingPromotion] = useState(false);
  const [stripePaymentLink, setStripePaymentLink] = useState('');
  const [savingPaymentSettings, setSavingPaymentSettings] = useState(false);
  const [siteStatus, setSiteStatus] = useState<{ closedRegistrations: boolean; redirectUrl: string }>({
    closedRegistrations: false,
    redirectUrl: 'https://aviationonline.fr/login'
  });
  const [savingSiteStatus, setSavingSiteStatus] = useState(false);
  const [editingModule, setEditingModule] = useState<Partial<Module> | null>(null);
  const [editingCourse, setEditingCourse] = useState<Partial<Course> | null>(null);
  const [editingQuiz, setEditingQuiz] = useState<Partial<Quiz> | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [editingTestimonial, setEditingTestimonial] = useState<Partial<Testimonial> | null>(null);
  const [showCoursePreview, setShowCoursePreview] = useState(false);
  const [showCoursePreviewEn, setShowCoursePreviewEn] = useState(false);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const getDirectImageUrl = (url: string) => {
    if (!url) return '';
    let cleanUrl = url.trim();
    // Force HTTPS for Hostinger or other known hosts if needed
    if (cleanUrl.startsWith('http://')) {
      cleanUrl = cleanUrl.replace('http://', 'https://');
    }
    // Google Drive
    if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('docs.google.com')) {
      const fileId = cleanUrl.match(/\/d\/([^/]+)/)?.[1] || cleanUrl.match(/id=([^&]+)/)?.[1];
      if (fileId) {
        // Method 1: lh3 endpoint (usually best for high quality and reliability)
        return `https://lh3.googleusercontent.com/d/${fileId}=s0`;
      }
    }
    // Dropbox
    if (cleanUrl.includes('dropbox.com')) {
      return cleanUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('?dl=1', '');
    }
    return cleanUrl;
  };

  const [expandedQuiz, setExpandedQuiz] = useState<string | null>(null);
  const [coursesByModule, setCoursesByModule] = useState<Record<string, Course[]>>({});
  const [isSeeding, setIsSeeding] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);

  const runDiagnostic = async () => {
    setDiagnosticResult("Running diagnostic...");
    try {
      const results: string[] = [];
      results.push(`Database ID: ${firebaseConfig.firestoreDatabaseId}`);
      results.push(`User: ${user?.email} (${user?.uid})`);
      results.push(`Profile Role: ${profile?.role}`);
      
      // Test 1: Public read
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        results.push("✅ Public read (test/connection) OK");
      } catch (e: any) {
        results.push(`❌ Public read FAILED: ${e.message}`);
      }

      // Test 2: Modules read
      try {
        const snap = await getDocFromServer(doc(db, 'modules', 'mod_psv'));
        results.push(`✅ Modules read OK (Exists: ${snap.exists()})`);
      } catch (e: any) {
        results.push(`❌ Modules read FAILED: ${e.message}`);
      }

      // Test 3: Admin write
      try {
        const testRef = doc(db, 'test', 'admin_write_test');
        await setDoc(testRef, { timestamp: Timestamp.now(), by: user?.email });
        results.push("✅ Admin write OK");
      } catch (e: any) {
        results.push(`❌ Admin write FAILED: ${e.message}`);
      }

      setDiagnosticResult(results.join('\n'));
    } catch (err: any) {
      setDiagnosticResult(`Diagnostic CRASHED: ${err.message}`);
    }
  };
  const [userSearch, setUserSearch] = useState('');
  const [resultSearch, setResultSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [dbTestStatus, setDbTestStatus] = useState<{ type: 'success' | 'error' | 'loading', text: string } | null>(null);
  const [serverDebugResult, setServerDebugResult] = useState<any>(null);
  const [stripeDiagnostics, setStripeDiagnostics] = useState<any[] | null>(null);
  const [isDiagnosingStripe, setIsDiagnosingStripe] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ type: 'module' | 'course' | 'clear' | 'user' | 'seedTestimonials' | 'quiz', id?: string, moduleId?: string } | null>(null);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ email: '', firstName: '', lastName: '', password: '' });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  
  // Migration state
  const [migrationData, setMigrationData] = useState<any[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [migrationResults, setMigrationResults] = useState<any[]>([]);

  const checkAllPayments = async () => {
    setIsCheckingAll(true);
    let count = 0;
    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      
      // Step 1: Sync missing users directly from Stripe
      try {
        const syncRes = await fetch('/api/admin/sync-missing-stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminToken: idToken }),
        });
        const syncData = await syncRes.json();
        if (syncData.success && (syncData.created > 0 || syncData.updated > 0)) {
          showStatus('success', `${syncData.created} comptes créés, ${syncData.updated} mis à jour depuis Stripe.`);
          // Delay to allow UI/Firebase to fetch the new users before the second pass
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (e: any) {
        console.error("Failed to sync missing stripe users", e);
      }

      // Step 2: Ensure all current students are double-checked
      for (const student of students) {
        if (!student.isPaid) {
          const response = await fetch('/api/check-payment-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: student.uid, email: student.email }),
          });
          const data = await response.json();
          if (data.success && !data.alreadyPaid) {
            count++;
            setStudents(prev => prev.map(s => s.uid === student.uid ? { ...s, isPaid: true } : s));
          }
        }
      }
      showStatus('success', `Synchronisation terminée. ${count > 0 ? count + ' profils locaux mis à jour.' : ''}`);
    } catch (e) {
      showStatus('error', "Erreur lors de la synchronisation globale.");
    } finally {
      setIsCheckingAll(false);
    }
  };

  const runStripeDiagnostic = async () => {
    setIsDiagnosingStripe(true);
    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/admin/recent-stripe-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminToken: idToken }),
      });
      const data = await res.json();
      if (data.success) {
        setStripeDiagnostics(data.payments);
      } else {
        showStatus('error', data.error || "Erreur lors de la lecture des paiements Stripe.");
      }
    } catch(e) {
      showStatus('error', "Impossible de contacter le serveur Stripe.");
    } finally {
      setIsDiagnosingStripe(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);
    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/admin/create-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminToken: idToken, ...newUserForm })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la création');
      showStatus('success', 'Utilisateur créé avec succès !');
      setShowCreateUserModal(false);
      setNewUserForm({ email: '', firstName: '', lastName: '', password: '' });
      // Fetch users again to reflect changes? Real-time snapshot might handle it
    } catch (e: any) {
      showStatus('error', e.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleClearAll = async () => {
    setIsSeeding(true);
    try {
      for (const mod of modules) {
        // Delete courses first
        const coursesRef = collection(db, `modules/${mod.id}/courses`);
        const coursesSnap = await getDocs(coursesRef);
        for (const cDoc of coursesSnap.docs) {
          await deleteDoc(cDoc.ref);
        }
        // Delete module
        await deleteDoc(doc(db, 'modules', mod.id));
      }
      showStatus('success', 'Base de données nettoyée.');
    } catch (error: any) {
      console.error(error instanceof Error ? error.message : String(error));
      showStatus('error', 'Erreur lors du nettoyage.');
    } finally {
      setIsSeeding(false);
      setShowConfirmDelete(null);
    }
  };

  useEffect(() => {
    // Fetch modules
    const q = query(collection(db, 'modules'));
    const courseUnsubscribes: Record<string, () => void> = {};

    const unsubscribeModules = onSnapshot(q, (snapshot) => {
      const mods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Module))
        .sort((a, b) => (a.order || 999) - (b.order || 999));
      setModules(mods);
      
      // Clean up old course listeners
      const currentModuleIds = new Set(mods.map(m => m.id));
      Object.keys(courseUnsubscribes).forEach(id => {
        if (!currentModuleIds.has(id)) {
          courseUnsubscribes[id]();
          delete courseUnsubscribes[id];
        }
      });

      // Fetch courses for each module
      mods.forEach(mod => {
        if (!courseUnsubscribes[mod.id]) {
          const cq = query(collection(db, `modules/${mod.id}/courses`));
          courseUnsubscribes[mod.id] = onSnapshot(cq, (cSnapshot) => {
            setCoursesByModule(prev => ({
              ...prev,
              [mod.id]: cSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course))
                .sort((a, b) => (a.order || 999) - (b.order || 999))
            }));
          });
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'modules');
    });

    // Fetch students
    const sq = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(sq, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Student)).sort((a, b) => {
        const dateA = a.createdAt?.toMillis() || 0;
        const dateB = b.createdAt?.toMillis() || 0;
        return dateB - dateA;
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Fetch quizzes
    const qq = query(collection(db, 'quizzes'));
    const questionUnsubscribes: Record<string, () => void> = {};

    const unsubscribeQuizzes = onSnapshot(qq, (snapshot) => {
      const qzs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz))
        .sort((a, b) => (a.order || 999) - (b.order || 999));
      setQuizzes(qzs);
      
      // Clean up old question listeners
      const currentQuizIds = new Set(qzs.map(q => q.id));
      Object.keys(questionUnsubscribes).forEach(id => {
        if (!currentQuizIds.has(id)) {
          questionUnsubscribes[id]();
          delete questionUnsubscribes[id];
        }
      });

      // Fetch questions for each quiz
      qzs.forEach(quiz => {
        if (!questionUnsubscribes[quiz.id]) {
          const qsq = query(collection(db, `quizzes/${quiz.id}/questions`));
          questionUnsubscribes[quiz.id] = onSnapshot(qsq, (qsSnapshot) => {
            setQuestionsByQuiz(prev => ({
              ...prev,
              [quiz.id]: qsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question))
                .sort((a, b) => (a.order || 999) - (b.order || 999))
            }));
          });
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'quizzes');
    });

    // Fetch testimonials
    const tq = query(collection(db, 'testimonials'));
    const unsubscribeTestimonials = onSnapshot(tq, (snapshot) => {
      const tests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Testimonial));
      setTestimonials(tests.sort((a, b) => (a.order || 999) - (b.order || 999)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'testimonials');
    });

    return () => {
      unsubscribeModules();
      unsubscribeUsers();
      unsubscribeQuizzes();
      unsubscribeTestimonials();
      Object.values(courseUnsubscribes).forEach(unsub => unsub());
      Object.values(questionUnsubscribes).forEach(unsub => unsub());
    };
  }, []);

  useEffect(() => {
    const unsubPricing = onSnapshot(doc(db, 'settings', 'pricing'), (docSnap) => {
      if (docSnap.exists() && typeof docSnap.data().basePrice === 'number') {
        setBasePrice(docSnap.data().basePrice);
      }
    });

    const unsubPromotion = onSnapshot(doc(db, 'settings', 'promotion'), (docSnap) => {
      if (docSnap.exists()) {
        setPromotion(docSnap.data() as Promotion);
      } else {
        setPromotion({ isActive: false, endDate: '', discountPercentage: 0, promoCode: '' });
      }
    });

    const unsubPayment = onSnapshot(doc(db, 'settings', 'payment'), (docSnap) => {
      if (docSnap.exists()) {
        setStripePaymentLink(docSnap.data().stripePaymentLink || '');
      }
    });

    const unsubSiteStatus = onSnapshot(doc(db, 'settings', 'siteStatus'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSiteStatus({
          closedRegistrations: !!data.closedRegistrations,
          redirectUrl: data.redirectUrl || 'https://aviationonline.fr/login'
        });
      } else {
        setSiteStatus({
          closedRegistrations: false,
          redirectUrl: 'https://aviationonline.fr/login'
        });
      }
    });

    return () => {
      unsubPricing();
      unsubPromotion();
      unsubPayment();
      unsubSiteStatus();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'results') {
      const q = query(collection(db, 'quiz_attempts'), orderBy('completedAt', 'desc'), limit(100));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setQuizAttempts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'quiz_attempts');
      });
      return unsubscribe;
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'logs') {
      const q = query(collection(db, 'connection_logs'), orderBy('lastActive', 'desc'), limit(100));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ConnectionLog)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'connection_logs');
      });
      return unsubscribe;
    }
  }, [activeTab]);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingPdf(true);
    showStatus('success', 'Analyse du PDF en cours... Cela peut prendre quelques minutes.');

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        try {
          const base64String = (reader.result as string).split(',')[1];
          
          if (!process.env.GEMINI_API_KEY) {
            throw new Error("Clé API Gemini non configurée");
          }

          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              {
                inlineData: {
                  data: base64String,
                  mimeType: "application/pdf"
                }
              },
              {
                text: `Tu es un expert en aviation. Je vais te donner le texte extrait d'un PDF contenant un QCM d'aviation.
Ton but est d'extraire les questions et les réponses, et de les formater en JSON strict.
Le JSON doit avoir cette structure exacte :
{
  "questions": [
    {
      "text": "Texte de la question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0, // L'index de la bonne réponse (0 pour A, 1 pour B, etc.)
      "explanation": "Explication courte de la bonne réponse (optionnel)"
    }
  ]
}
Ne renvoie QUE le JSON, sans markdown, sans \`\`\`json, juste l'objet JSON.`
              }
            ]
          });

          const responseText = response.text || "";
          // Nettoyer la réponse au cas où il y aurait du markdown
          const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
          
          let data;
          try {
            data = JSON.parse(cleanJson);
          } catch (e) {
            throw new Error("Le format renvoyé par l'IA n'est pas un JSON valide.");
          }

          const questions = data.questions;
          if (!questions || questions.length === 0) {
            throw new Error('Aucune question trouvée dans le PDF');
          }

          // Create a new Quiz
          const quizRef = await addDoc(collection(db, 'quizzes'), {
            title: file.name.replace('.pdf', ''),
            description: `Importé depuis ${file.name}`,
            order: quizzes.length + 1
          });

          // Add all questions to the new Quiz
          const batch = writeBatch(db);
          questions.forEach((q: any, index: number) => {
            const questionRef = doc(collection(db, `quizzes/${quizRef.id}/questions`));
            batch.set(questionRef, {
              quizId: quizRef.id,
              text: q.text,
              options: q.options,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation || '',
              order: index + 1
            });
          });

          await batch.commit();
          showStatus('success', `${questions.length} questions importées avec succès !`);
        } catch (err: any) {
          console.error("PDF parse error:", err);
          showStatus('error', err.message || 'Erreur lors de l\'importation');
        } finally {
          setIsImportingPdf(false);
          // Reset input
          e.target.value = '';
        }
      };
      
      reader.onerror = () => {
        throw new Error('Erreur de lecture du fichier');
      };
    } catch (err: any) {
      console.error("PDF read error:", err);
      showStatus('error', err.message || 'Erreur lors de la lecture du fichier');
      setIsImportingPdf(false);
      e.target.value = '';
    }
  };

  const [isExportingQcm, setIsExportingQcm] = useState(false);
  const [isExportingPdfQcm, setIsExportingPdfQcm] = useState(false);

  // Helper pour générer le HTML stylisé imprimable en PDF pour un ou plusieurs QCM
  const generateQuizHtmlDocument = (quizzesData: { quiz: Quiz; questions: Question[] }[], includeAnswers: boolean = true) => {
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Aviation Online - Export QCM</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #1e293b;
      background: #ffffff;
      padding: 24px;
      line-height: 1.5;
      font-size: 13px;
    }
    
    .header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    
    .logo-title {
      font-size: 20px;
      font-weight: 800;
      color: #0369a1;
      letter-spacing: -0.5px;
    }
    
    .doc-meta {
      font-size: 11px;
      color: #64748b;
      text-align: right;
    }
    
    .quiz-section {
      margin-bottom: 40px;
      page-break-after: always;
    }
    
    .quiz-section:last-child {
      page-break-after: auto;
    }
    
    .quiz-header {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #0284c7;
      padding: 14px 18px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    
    .quiz-title {
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    
    .quiz-desc {
      font-size: 12px;
      color: #64748b;
    }
    
    .question-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 14px 16px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    
    .question-header {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 10px;
    }
    
    .question-num {
      background: #0284c7;
      color: #ffffff;
      font-weight: 700;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    
    .question-text {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      flex: 1;
    }
    
    .options-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      margin-left: 32px;
      margin-top: 8px;
    }
    
    .option-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      border: 1px solid #f1f5f9;
      background: #f8fafc;
    }
    
    .option-letter {
      font-weight: 700;
      color: #475569;
      width: 18px;
    }
    
    .option-item.is-correct {
      background: #ecfdf5;
      border-color: #a7f3d0;
      color: #065f46;
      font-weight: 600;
    }
    
    .option-item.is-correct .option-letter {
      color: #059669;
    }
    
    .explanation-box {
      margin-top: 10px;
      margin-left: 32px;
      padding: 8px 12px;
      background: #eff6ff;
      border-left: 3px solid #3b82f6;
      border-radius: 4px;
      font-size: 11.5px;
      color: #1e40af;
    }
    
    .footer {
      font-size: 10px;
      color: #94a3b8;
      text-align: center;
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
    }
    
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-title">AVIATION ONLINE</div>
      <div style="font-size: 12px; color: #475569; font-weight: 500;">Programme de Préparation Sélection Pilote de Ligne</div>
    </div>
    <div class="doc-meta">
      <div><strong>Document QCM Officiel</strong></div>
      <div>Date d'export : ${dateStr}</div>
      <div>${quizzesData.length} QCM exporté(s)</div>
    </div>
  </div>

  ${quizzesData.map(({ quiz, questions }, idx) => `
    <div class="quiz-section">
      <div class="quiz-header">
        <div class="quiz-title">Quiz #${quiz.order || idx + 1} : ${quiz.title}</div>
        ${quiz.description ? `<div class="quiz-desc">${quiz.description}</div>` : ''}
        <div style="font-size: 11px; color: #0284c7; font-weight: 600; margin-top: 4px;">Total : ${questions.length} question(s)</div>
      </div>

      ${questions.map((q, qIndex) => `
        <div class="question-card">
          <div class="question-header">
            <span class="question-num">Q${q.order || qIndex + 1}</span>
            <div class="question-text">${q.text}</div>
          </div>
          
          <div class="options-grid">
            ${(q.options || []).map((opt, optIndex) => {
              const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
              const isCorrect = includeAnswers && optIndex === q.correctAnswer;
              return `
                <div class="option-item ${isCorrect ? 'is-correct' : ''}">
                  <span class="option-letter">${letters[optIndex] || optIndex + 1}.</span>
                  <span>${opt} ${isCorrect ? '<strong>(Bonne réponse ✓)</strong>' : ''}</span>
                </div>
              `;
            }).join('')}
          </div>

          ${includeAnswers && q.explanation ? `
            <div class="explanation-box">
              <strong>💡 Explication :</strong> ${q.explanation}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `).join('')}

  <div class="footer">
    © Aviation Online - Tous droits réservés - Document de révision pour usage personnel
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;
  };

  // Exporter un QCM en PDF
  const handleExportSingleQuizPdf = async (quiz: Quiz) => {
    try {
      showStatus('info', `Génération du PDF pour "${quiz.title}"...`);
      const questionsSnap = await getDocs(collection(db, `quizzes/${quiz.id}/questions`));
      const questionsList = questionsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Question))
        .sort((a, b) => (a.order || 999) - (b.order || 999));

      const htmlContent = generateQuizHtmlDocument([{ quiz, questions: questionsList }]);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
      } else {
        showStatus('error', 'Veuillez autoriser les fenêtres pop-up dans votre navigateur pour exporter en PDF.');
      }
    } catch (err: any) {
      console.error("Export PDF error:", err);
      showStatus('error', `Erreur lors de l'exportation PDF : ${err.message}`);
    }
  };

  // Exporter TOUS les QCM en un seul document PDF
  const handleExportAllQuizzesPdf = async () => {
    if (quizzes.length === 0) {
      showStatus('error', 'Aucun QCM à exporter.');
      return;
    }

    setIsExportingPdfQcm(true);
    showStatus('info', `Récupération des données des ${quizzes.length} QCM pour le PDF...`);

    try {
      const allQuizzesData: { quiz: Quiz; questions: Question[] }[] = [];

      for (const quiz of quizzes) {
        const questionsSnap = await getDocs(collection(db, `quizzes/${quiz.id}/questions`));
        const questionsList = questionsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Question))
          .sort((a, b) => (a.order || 999) - (b.order || 999));

        allQuizzesData.push({
          quiz,
          questions: questionsList
        });
      }

      const htmlContent = generateQuizHtmlDocument(allQuizzesData);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        showStatus('success', 'Document PDF prêt ! Choisissez "Enregistrer au format PDF" dans la boîte de dialogue d\'impression.');
      } else {
        showStatus('error', 'Veuillez autoriser les fenêtres pop-up dans votre navigateur pour afficher le PDF.');
      }
    } catch (err: any) {
      console.error("Export All PDF error:", err);
      showStatus('error', 'Erreur lors de la génération du document PDF.');
    } finally {
      setIsExportingPdfQcm(false);
    }
  };

  // Exporter un QCM individuel en JSON
  const handleExportSingleQuiz = async (quiz: Quiz) => {
    try {
      showStatus('info', `Exportation du QCM "${quiz.title}"...`);
      
      // Récupérer les questions depuis Firestore
      const questionsSnap = await getDocs(collection(db, `quizzes/${quiz.id}/questions`));
      const questionsList = questionsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Question))
        .sort((a, b) => (a.order || 999) - (b.order || 999));

      const exportData = {
        id: quiz.id,
        title: quiz.title,
        title_en: quiz.title_en || '',
        description: quiz.description || '',
        description_en: quiz.description_en || '',
        category: quiz.category || '',
        order: quiz.order || 1,
        totalQuestions: questionsList.length,
        exportedAt: new Date().toISOString(),
        questions: questionsList.map(q => ({
          id: q.id,
          text: q.text,
          text_en: q.text_en || '',
          options: q.options || [],
          options_en: q.options_en || [],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          explanation_en: q.explanation_en || '',
          attachmentUrl: q.attachmentUrl || '',
          attachmentType: q.attachmentType || null,
          order: q.order || 1
        }))
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTitle = quiz.title.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_').toLowerCase();
      link.href = url;
      link.download = `qcm_${safeTitle || quiz.id}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showStatus('success', `QCM "${quiz.title}" exporté (${questionsList.length} questions).`);
    } catch (err: any) {
      console.error("Export QCM error:", err);
      showStatus('error', `Erreur lors de l'exportation : ${err.message || 'Erreur inconnue'}`);
    }
  };

  // Exporter tous les QCM individuellement (fichiers séparés)
  const handleExportAllQuizzesIndividually = async () => {
    if (quizzes.length === 0) {
      showStatus('error', 'Aucun QCM à exporter.');
      return;
    }

    setIsExportingQcm(true);
    showStatus('info', `Téléchargement des ${quizzes.length} QCM en cours...`);

    try {
      let count = 0;
      for (const quiz of quizzes) {
        await handleExportSingleQuiz(quiz);
        count++;
        // Petite pause entre chaque téléchargement de fichier pour que le navigateur ne bloque pas les téléchargements multiples
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      showStatus('success', `Les ${count} QCM ont été exportés individuellement avec succès !`);
    } catch (err: any) {
      console.error("Export all QCM error:", err);
      showStatus('error', 'Erreur lors de l\'exportation de certains QCM.');
    } finally {
      setIsExportingQcm(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setMigrationData(results.data);
        showStatus('success', `${results.data.length} utilisateurs chargés.`);
      },
      error: (err) => {
        console.error(err instanceof Error ? err.message : String(err));
        showStatus('error', "Erreur lors de la lecture du fichier.");
      }
    });
  };

  const runMigration = async () => {
    if (migrationData.length === 0) return;
    setIsMigrating(true);
    setMigrationResults([]);

    try {
      const adminToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/migrate-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: migrationData, adminToken })
      });

      if (!response.ok) throw new Error("Échec de la migration");

      const data = await response.json();
      setMigrationResults(data.results);
      showStatus('success', "Migration terminée.");
    } catch (error: any) {
      console.error(error instanceof Error ? error.message : String(error));
      showStatus('error', error.message);
    } finally {
      setIsMigrating(false);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);
  
  const showStatus = (type: 'success' | 'error' | 'info', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const translateMissingContent = async () => {
    setIsTranslating(true);
    showStatus('info', 'Traduction en cours... Cela peut prendre quelques minutes.');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let updatesCount = 0;

      const cleanJson = (str: string) => str.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

      const generateContentWithRetry = async (contents: string, retries = 8, delayMs = 6000): Promise<any> => {
        for (let i = 0; i < retries; i++) {
          try {
            const response = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents,
              config: {
                responseMimeType: "application/json",
              }
            });
            return response;
          } catch (error: any) {
            const errStr = error?.message || String(error);
            const isRateLimit = error?.status === 429 || error?.status === 'RESOURCE_EXHAUSTED' || errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
            if (isRateLimit && i < retries - 1) {
              console.warn(`Rate limit hit, retrying in ${delayMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
              delayMs *= 1.5; // Exponential backoff
            } else {
              throw new Error(errStr);
            }
          }
        }
      };

      // 1. Testimonials
      const testimonialsSnap = await getDocs(collection(db, 'testimonials'));
      for (const docSnap of testimonialsSnap.docs) {
        const data = docSnap.data();
        if (!data.text_en && data.text) {
          try {
            const response = await generateContentWithRetry(`Translate the following testimonial from French to English. Return a JSON object with "text_en" and "role_en".\n\nText: ${data.text}\nRole: ${data.role || ''}`);
            const result = JSON.parse(cleanJson(response.text || "{}"));
            await updateDoc(docSnap.ref, {
              text_en: result.text_en || '',
              role_en: result.role_en || ''
            });
            updatesCount++;
            await new Promise(resolve => setTimeout(resolve, 4000)); // 4s delay to respect 15 RPM limit
          } catch (e: any) {
            const errStr = e?.message || String(e);
            const isRateLimit = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
            if (isRateLimit) throw e;
            console.error("Failed to translate testimonial", docSnap.id, errStr);
          }
        }
      }

      // 2. Quizzes
      const quizzesSnap = await getDocs(collection(db, 'quizzes'));
      for (const docSnap of quizzesSnap.docs) {
        const data = docSnap.data();
        if (!data.title_en && data.title) {
          try {
            const response = await generateContentWithRetry(`Translate the following quiz title and description from French to English. Return a JSON object with "title_en" and "description_en".\n\nTitle: ${data.title}\nDescription: ${data.description || ''}`);
            const result = JSON.parse(cleanJson(response.text || "{}"));
            await updateDoc(docSnap.ref, {
              title_en: result.title_en || '',
              description_en: result.description_en || ''
            });
            updatesCount++;
            await new Promise(resolve => setTimeout(resolve, 4000)); // 4s delay to respect 15 RPM limit
          } catch (e: any) {
            const errStr = e?.message || String(e);
            const isRateLimit = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
            if (isRateLimit) throw e;
            console.error("Failed to translate quiz", docSnap.id, errStr);
          }
        }

        // 3. Questions for this quiz
        const questionsSnap = await getDocs(collection(db, `quizzes/${docSnap.id}/questions`));
        for (const qSnap of questionsSnap.docs) {
          const qData = qSnap.data();
          
          const isTextMissing = !qData.text_en || qData.text_en.trim() === '';

          const isOptionsMissingOrUntranslated = !qData.options_en || 
                                                 !Array.isArray(qData.options_en) || 
                                                 qData.options_en.length === 0 || 
                                                 qData.options_en.length !== (qData.options?.length || 0) ||
                                                 qData.options_en.some((opt: string) => !opt || opt.trim() === '');
          
          if (qData.text && (isTextMissing || isOptionsMissingOrUntranslated)) {
            try {
              let optionsStr = "";
              try { optionsStr = JSON.stringify(qData.options); } catch (err) { optionsStr = String(qData.options); }
              
              const response = await generateContentWithRetry(`Translate the following quiz question, its options, and explanation from French to English. You MUST translate the options array. Return a JSON object with "text_en" (string), "options_en" (array of translated strings), and "explanation_en" (string).\n\nQuestion: ${qData.text}\nOptions: ${optionsStr}\nExplanation: ${qData.explanation || ''}`);
              const result = JSON.parse(cleanJson(response.text || "{}"));
              
              // Fallback to result.options if the AI used the wrong key
              let translatedOptions = result.options_en || result.options || qData.options;
              if (!Array.isArray(translatedOptions)) {
                translatedOptions = qData.options;
              }
              
              await updateDoc(qSnap.ref, {
                text_en: result.text_en || qData.text_en || '',
                options_en: translatedOptions,
                explanation_en: result.explanation_en || qData.explanation_en || ''
              });
              updatesCount++;
              await new Promise(resolve => setTimeout(resolve, 4000)); // 4s delay to respect 15 RPM limit
            } catch (e: any) {
              const errStr = e?.message || String(e);
              const isRateLimit = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
              if (isRateLimit) throw e;
              console.error("Failed to translate question", qSnap.id, errStr);
            }
          }
        }
      }

      if (updatesCount > 0) {
        showStatus('success', `${updatesCount} éléments traduits avec succès !`);
      } else {
        showStatus('info', 'Tout est déjà traduit.');
      }
    } catch (error: any) {
      const errStr = error?.message || String(error);
      const isRateLimit = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
      if (isRateLimit) {
        console.warn("Translation stopped due to rate limit/quota.");
        showStatus('error', 'Quota de traduction dépassé. Veuillez réessayer plus tard.');
      } else {
        console.error("Translation error:", errStr);
        showStatus('error', 'Erreur lors de la traduction.');
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const seedInitialData = async () => {
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      
      // Module 1: PSV
      const mod1Id = 'mod_psv';
      const mod1Ref = doc(db, 'modules', mod1Id);
      batch.set(mod1Ref, {
        title: 'Pilotage Sans Visibilité (PSV)',
        description: 'Introduction aux principes fondamentaux du vol aux instruments, physiologie et illusions sensorielles.',
        order: 1
      });

      const courses1 = [
        {
          id: 'course_psv_intro',
          title: 'Introduction au PSV',
          content: `# Introduction au Pilotage Sans Visibilité\n\nL'oreille interne est le siège de l'équilibre. En vol IFR, nous devons faire face à des limites physiologiques.\n\n## 1. Le sens de l'équilibre\nNotre système vestibulaire présente deux défauts majeurs :\n- **Effet de seuil** : En-deçà de 0,1 kt/s², le mouvement n'est pas détecté.\n- **Absence de référence** : Le système repart toujours de zéro.\n\n## 2. Les conflits de sens\nUn conflit survient quand nos sens se contredisent. **Les instruments ont toujours raison !** Croyez vos instruments, pas vos sensations.\n\n## 3. Les champs visuels\n- **1ère vision** : Cône de 3° (lecture possible uniquement).\n- **2ème vision** : Cône de 6° (lecture analogique).\n- **Champs périphériques** : Jusqu'à 150° (mouvements et clignotements).`,
          pdfUrl: 'https://www.ecologie.gouv.fr/sites/default/files/guide_pilote_vfr_ifr.pdf',
          order: 1
        },
        {
          id: 'course_psv_adi',
          title: 'L\'horizon artificiel (ADI)',
          content: `# L'horizon artificiel ou ADI\n\nL'ADI (Attitude Director Indicator) est l'instrument principal. Il remplace l'horizon naturel.\n\n## Repères d'assiette\n- **Partie bleue** : Ciel (assiette positive).\n- **Partie marron** : Terre (assiette négative).\n- **Maquette** : Représente l'avion (point central ou triangle).\n\n## Repères d'inclinaison\nSitués en haut de l'instrument. Des graduations indiquent l'angle tous les 10°, avec des repères marqués à 45° et 60°.`,
          order: 2
        },
        {
          id: 'course_psv_instruments',
          title: 'Les instruments gyroscopiques',
          content: `# Les instruments gyroscopiques\n\n## Le Conservateur de Cap (Directional Gyro)\nIndique le cap magnétique de l'avion. Doit être recalé régulièrement avec le compas magnétique.\n\n## L'Indicateur de Virage (Turn Coordinator)\nIndique le taux de virage (ex: taux standard de 3°/sec) et la symétrie du vol (bille).`,
          order: 3
        }
      ];

      courses1.forEach((c) => {
        const { id, ...data } = c;
        const cRef = doc(db, `modules/${mod1Id}/courses`, id);
        batch.set(cRef, { ...data, moduleId: mod1Id, createdAt: Timestamp.now() });
      });

      // Module 2: Circuit Visuel
      const mod2Id = 'mod_circuit';
      const mod2Ref = doc(db, 'modules', mod2Id);
      batch.set(mod2Ref, {
        title: 'Le Circuit Visuel',
        description: 'Apprendre à balayer les instruments de manière efficace et structurée.',
        order: 2
      });

      const courses2 = [
        {
          id: 'course_cv_etoile',
          title: 'La Méthode en Étoile',
          content: `# Le Circuit Visuel en Étoile\n\nLe circuit visuel indique le parcours des yeux sur la planche de bord.\n\n## Toujours repasser par l'ADI\nL'ADI est le centre de votre attention. Vous devez effectuer des "coups d'œil" sur les instruments secondaires :\n- Altimètre\n- Badin (Anémomètre)\n- Variomètre\n- Conservateur de cap\n\n**Le circuit se fait en étoile : ADI -> Alti -> ADI -> Badin -> ADI -> Cap...**`,
          order: 1
        },
        {
          id: 'course_cv_trim',
          title: 'Trim et Puissance',
          content: `# Utilisation du Trim et de la Puissance\n\n- **Le trim "pilote" la vitesse** : On compense l'effort pour maintenir une vitesse donnée.\n- **La puissance "pilote" le plan** : On ajuste les gaz pour tenir le palier, la montée ou la descente.\n\n*Réfléchir avant d'agir est la meilleure technique !*`,
          order: 2
        },
        {
          id: 'course_cv_erreurs',
          title: 'Erreurs courantes',
          content: `# Erreurs courantes du circuit visuel\n\n## La fixation\nRester bloqué sur un seul instrument (ex: l'altimètre pendant une mise en palier).\n\n## L'omission\nOublier d'intégrer un instrument dans le circuit (ex: oublier de vérifier la bille ou le conservateur de cap).`,
          order: 3
        }
      ];

      courses2.forEach((c) => {
        const { id, ...data } = c;
        const cRef = doc(db, `modules/${mod2Id}/courses`, id);
        batch.set(cRef, { ...data, moduleId: mod2Id, createdAt: Timestamp.now() });
      });

      // Module 3: Conduite d'une approche
      const mod3Id = 'mod_approche';
      const mod3Ref = doc(db, 'modules', mod3Id);
      batch.set(mod3Ref, {
        title: "Conduite d'une approche",
        description: "Procédures et techniques pour mener à bien une approche aux instruments.",
        pdfUrl: 'https://www.ecologie.gouv.fr/sites/default/files/guide_pilote_vfr_ifr.pdf',
        order: 3
      });

      const courses3 = [
        {
          id: 'course_approche_1',
          title: 'Préparation de l\'approche',
          content: `# Préparation de l'approche\n\nUne approche se prépare bien avant d'arriver sur le point initial.\n\n## 1. Briefing\n- Trajectoire\n- Altitudes de sécurité\n- Fréquences\n- Procédure d'interruption`,
          order: 1
        },
        {
          id: 'course_approche_2',
          title: 'Interception de l\'axe',
          content: `# Interception de l'axe\n\nL'interception de l'axe d'approche finale (Localizer ou axe VOR/NDB) requiert une anticipation de la mise en virage.\n\n## Technique\n- Anticiper selon la vitesse et l'angle d'interception.\n- Ne pas "chasser" l'aiguille.`,
          order: 2
        },
        {
          id: 'course_approche_3',
          title: 'Suivi du plan de descente',
          content: `# Suivi du plan de descente\n\nLe plan de descente (Glide Path) s'intercepte généralement par en dessous.\n\n## Gestion de la vitesse\n- Sortir la configuration atterrissage avant la descente.\n- Ajuster la puissance pour maintenir la vitesse d'approche.`,
          order: 3
        }
      ];

      courses3.forEach((c) => {
        const { id, ...data } = c;
        const cRef = doc(db, `modules/${mod3Id}/courses`, id);
        batch.set(cRef, { ...data, moduleId: mod3Id, createdAt: Timestamp.now() });
      });

      // Module 4: Réalisation de la navigation IFR
      const mod4Id = 'mod_nav_ifr';
      const mod4Ref = doc(db, 'modules', mod4Id);
      batch.set(mod4Ref, {
        title: "Réalisation de la navigation IFR",
        description: "Navigation en route, utilisation des aides radio et gestion de la trajectoire.",
        pdfUrl: 'https://www.ecologie.gouv.fr/sites/default/files/guide_pilote_vfr_ifr.pdf',
        order: 4
      });

      const courses4 = [
        {
          id: 'course_nav_1',
          title: 'Suivi de trajectoire',
          content: `# Suivi de trajectoire\n\nUtilisation du VOR et de l'ADF pour maintenir une route précise.`,
          order: 1
        },
        {
          id: 'course_nav_2',
          title: 'Les attentes (Holdings)',
          content: `# Les attentes (Holdings)\n\nL'attente permet de patienter en vol au-dessus d'un repère.\n\n## Les 3 types d'entrées\n- **Directe (Secteur 3)** : Arrivée dans le secteur de 180°.\n- **Décalée (Secteur 2)** : Arrivée dans le secteur de 70° (Teardrop).\n- **Parallèle (Secteur 1)** : Arrivée dans le secteur de 110°.\n\n## Corrections de dérive\nAppliquer 3 fois la dérive dans la branche d'éloignement.`,
          order: 2
        },
        {
          id: 'course_nav_3',
          title: 'Procédures SID et STAR',
          content: `# Procédures de départ et d'arrivée\n\n## SID (Standard Instrument Departure)\nPermet de rejoindre la route en route depuis l'aérodrome.\n\n## STAR (Standard Terminal Arrival Route)\nPermet de rejoindre l'approche depuis la route en route.`,
          order: 3
        }
      ];

      courses4.forEach((c) => {
        const { id, ...data } = c;
        const cRef = doc(db, `modules/${mod4Id}/courses`, id);
        batch.set(cRef, { ...data, moduleId: mod4Id, createdAt: Timestamp.now() });
      });

      // Module 5: Moyens Radionavigation
      const mod5Id = 'mod_radionav';
      const mod5Ref = doc(db, 'modules', mod5Id);
      batch.set(mod5Ref, {
        title: "Moyens Radionavigation",
        description: "Comprendre et utiliser les instruments de radionavigation (VOR, NDB, ILS, GPS).",
        order: 5
      });

      const courses5 = [
        {
          id: 'course_radionav_vor',
          title: 'Le VOR (VHF Omnidirectional Range)',
          content: `# Le VOR\n\nLe VOR fournit une information d'azimut magnétique par rapport à la balise.\n\n## Utilisation\n- Sélectionner la fréquence.\n- Identifier la balise (Morse).\n- Afficher la radiale désirée (OBS).\n- Lire l'indication TO/FROM et la déviation (CDI).`,
          order: 1
        },
        {
          id: 'course_radionav_adf',
          title: 'Le NDB et l\'ADF',
          content: `# Le NDB et l'ADF\n\nLe NDB (Non-Directional Beacon) émet un signal reçu par l'ADF (Automatic Direction Finder).\n\n## Formule de base\n**Gisement + Cap = Relèvement Vrai (QTE) ou Magnétique (QDR)**\n\nL'aiguille pointe toujours vers la station.`,
          order: 2
        },
        {
          id: 'course_radionav_ils',
          title: 'L\'ILS (Instrument Landing System)',
          content: `# L'ILS\n\nSystème d'atterrissage aux instruments de précision.\n\n## Composants\n- **Localizer (LOC)** : Guidage horizontal (Axe de piste).\n- **Glide Path (GP)** : Guidage vertical (Plan de descente, généralement 3°).\n- **Marker Beacons** : Repères de distance (Outer, Middle, Inner).`,
          order: 3
        }
      ];

      courses5.forEach((c) => {
        const { id, ...data } = c;
        const cRef = doc(db, `modules/${mod5Id}/courses`, id);
        batch.set(cRef, { ...data, moduleId: mod5Id, createdAt: Timestamp.now() });
      });

      // Module 6: Calcul Mental
      const mod6Id = 'mod_calcul_mental';
      const mod6Ref = doc(db, 'modules', mod6Id);
      batch.set(mod6Ref, {
        title: "Calcul Mental du Pilote",
        description: "Astuces et formules de calcul mental indispensables en vol IFR.",
        order: 6
      });

      const courses6 = [
        {
          id: 'course_calcul_descente',
          title: 'Calcul du plan de descente',
          content: `# Calcul du plan de descente\n\n## Taux de descente (Varimètre)\nPour un plan standard à 3° (ou 5%) :\n**Taux de descente (ft/min) = Vitesse Sol (kt) × 5**\n*Exemple : à 120 kt, le taux est de 120 × 5 = 600 ft/min.*\n\n## Début de descente (Top of Descent)\nPour un plan à 3° :\n**Distance (NM) = Altitude à perdre (ft) / 300**\n*Exemple : Pour perdre 6000 ft, il faut commencer à descendre à 6000 / 300 = 20 NM.*`,
          order: 1
        },
        {
          id: 'course_calcul_vent',
          title: 'Calcul du vent traversier',
          content: `# Calcul du vent traversier (Crosswind)\n\nUtilisation de la méthode de l'horloge en fonction de l'angle entre le vent et la route :\n\n- **15°** : 1/4 du vent (25%)\n- **30°** : 1/2 du vent (50%)\n- **45°** : 3/4 du vent (75%)\n- **60° ou plus** : Tout le vent (100%)\n\n*Exemple : Vent de 20 kt avec un angle de 30° -> Vent traversier = 10 kt.*`,
          order: 2
        },
        {
          id: 'course_calcul_derive',
          title: 'Calcul de la dérive',
          content: `# Calcul de la dérive maximale (X)\n\n**X = Facteur de base (Fb) × Vent traversier**\n\n## Facteur de base (Fb)\n**Fb = 60 / Vitesse Propre (TAS)**\n*Exemple : à 120 kt, Fb = 60 / 120 = 0.5.*\n\nSi le vent traversier est de 20 kt, la dérive maximale est de 0.5 × 20 = 10°.`,
          order: 3
        }
      ];

      courses6.forEach((c) => {
        const { id, ...data } = c;
        const cRef = doc(db, `modules/${mod6Id}/courses`, id);
        batch.set(cRef, { ...data, moduleId: mod6Id, createdAt: Timestamp.now() });
      });

      await batch.commit();
      
      // Seed Quizzes
      const quizBatch = writeBatch(db);
      const q1Id = 'quiz_psv_basics';
      const q1Ref = doc(db, 'quizzes', q1Id);
      quizBatch.set(q1Ref, {
        title: 'Bases du PSV',
        title_en: 'PSV Basics',
        description: 'Testez vos connaissances sur les principes fondamentaux du vol aux instruments.',
        description_en: 'Test your knowledge on the fundamental principles of instrument flying.',
        order: 1
      });

      const questions1 = [
        {
          id: 'q1_1',
          text: 'Quel est le seuil de détection du mouvement par le système vestibulaire ?',
          text_en: 'What is the motion detection threshold of the vestibular system?',
          options: ['0,01 kt/s²', '0,1 kt/s²', '1,0 kt/s²', '10 kt/s²'],
          options_en: ['0.01 kt/s²', '0.1 kt/s²', '1.0 kt/s²', '10 kt/s²'],
          correctAnswer: 1,
          explanation: 'En-deçà de 0,1 kt/s², le mouvement n\'est pas détecté par l\'oreille interne.',
          explanation_en: 'Below 0.1 kt/s², motion is not detected by the inner ear.',
          order: 1
        },
        {
          id: 'q1_2',
          text: 'Quel instrument est considéré comme le centre du circuit visuel ?',
          text_en: 'Which instrument is considered the center of the visual scan?',
          options: ['L\'altimètre', 'Le conservateur de cap', 'L\'horizon artificiel (ADI)', 'Le variomètre'],
          options_en: ['Altimeter', 'Heading Indicator', 'Attitude Indicator (ADI)', 'Vertical Speed Indicator'],
          correctAnswer: 2,
          explanation: 'L\'ADI est l\'instrument principal et le centre de la méthode en étoile.',
          explanation_en: 'The ADI is the primary instrument and the center of the star-pattern scan.',
          order: 2
        },
        {
          id: 'q1_3',
          text: 'En vol IFR, si vos sensations contredisent vos instruments, que devez-vous faire ?',
          text_en: 'In IFR flight, if your sensations contradict your instruments, what should you do?',
          options: ['Suivre vos sensations', 'Faire une moyenne des deux', 'Croire vos instruments', 'Demander confirmation au contrôle'],
          options_en: ['Follow your sensations', 'Average the two', 'Trust your instruments', 'Ask ATC for confirmation'],
          correctAnswer: 2,
          explanation: 'Les instruments ont toujours raison. Les illusions sensorielles sont fréquentes en IFR.',
          explanation_en: 'Instruments are always right. Sensory illusions are common in IFR.',
          order: 3
        },
        {
          id: 'q1_4',
          text: 'Quelle est la largeur du champ visuel permettant la lecture précise ?',
          text_en: 'What is the width of the visual field that allows for precise reading?',
          options: ['3°', '10°', '30°', '150°'],
          options_en: ['3°', '10°', '30°', '150°'],
          correctAnswer: 0,
          explanation: 'La vision fovéale (lecture précise) ne couvre qu\'un cône de 3°.',
          explanation_en: 'Foveal vision (precise reading) only covers a 3° cone.',
          order: 4
        }
      ];

      questions1.forEach(q => {
        const { id, ...data } = q;
        const qsRef = doc(db, `quizzes/${q1Id}/questions`, id);
        quizBatch.set(qsRef, { ...data, quizId: q1Id });
      });

      // Quiz 2: Moyens Radio
      const q2Id = 'quiz_radio_nav';
      const q2Ref = doc(db, 'quizzes', q2Id);
      quizBatch.set(q2Ref, {
        title: 'Moyens Radio-Navigation',
        title_en: 'Radio-Navigation Aids',
        description: 'Vérifiez vos connaissances sur le VOR, l\'ADF et l\'ILS.',
        description_en: 'Check your knowledge on VOR, ADF and ILS.',
        order: 2
      });

      const questions2 = [
        {
          id: 'q2_1',
          text: 'Quelle est la plage de fréquences des balises VOR ?',
          text_en: 'What is the frequency range of VOR beacons?',
          options: ['108.00 - 117.95 MHz', '118.00 - 136.97 MHz', '190 - 1750 kHz', '329.15 - 335.00 MHz'],
          options_en: ['108.00 - 117.95 MHz', '118.00 - 136.97 MHz', '190 - 1750 kHz', '329.15 - 335.00 MHz'],
          correctAnswer: 0,
          explanation: 'Les VOR utilisent la bande VHF entre 108.00 et 117.95 MHz.',
          explanation_en: 'VORs use the VHF band between 108.00 and 117.95 MHz.',
          order: 1
        },
        {
          id: 'q2_2',
          text: 'Que signifie l\'acronyme ILS ?',
          text_en: 'What does the acronym ILS stand for?',
          options: ['Instrument Landing System', 'Internal Leveling System', 'Integrated Light System', 'International Landing Standard'],
          options_en: ['Instrument Landing System', 'Internal Leveling System', 'Integrated Light System', 'International Landing Standard'],
          correctAnswer: 0,
          explanation: 'ILS signifie Instrument Landing System (Système d\'Atterrissage aux Instruments).',
          explanation_en: 'ILS stands for Instrument Landing System.',
          order: 2
        }
      ];

      questions2.forEach(q => {
        const { id, ...data } = q;
        const qsRef = doc(db, `quizzes/${q2Id}/questions`, id);
        quizBatch.set(qsRef, { ...data, quizId: q2Id });
      });

      await quizBatch.commit();

      showStatus('success', 'Données initiales réinitialisées avec succès !');
    } catch (error: any) {
      console.error(error instanceof Error ? error.message : String(error));
      showStatus('error', 'Erreur lors du seeding des données.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSaveModule = async () => {
    if (!editingModule?.title) return;
    try {
      if (editingModule.id) {
        await updateDoc(doc(db, 'modules', editingModule.id), editingModule);
      } else {
        await addDoc(collection(db, 'modules'), {
          ...editingModule,
          order: modules.length + 1,
          description: editingModule.description || ''
        });
      }
      setEditingModule(null);
      showStatus('success', 'Module enregistré.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'modules');
    }
  };

  const handleSaveCourse = async () => {
    if (!editingCourse?.title || !editingCourse?.moduleId) return;
    try {
      const courseData = {
        ...editingCourse,
        order: editingCourse.order || (coursesByModule[editingCourse.moduleId]?.length || 0) + 1,
        createdAt: Timestamp.now()
      };
      if (editingCourse.id) {
        await updateDoc(doc(db, `modules/${editingCourse.moduleId}/courses`, editingCourse.id), courseData);
      } else {
        await addDoc(collection(db, `modules/${editingCourse.moduleId}/courses`), courseData);
      }
      setEditingCourse(null);
      showStatus('success', 'Cours enregistré.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `modules/${editingCourse.moduleId}/courses`);
    }
  };

  const handleSaveQuiz = async () => {
    if (!editingQuiz?.title) return;
    try {
      if (editingQuiz.id) {
        await updateDoc(doc(db, 'quizzes', editingQuiz.id), editingQuiz);
      } else {
        await addDoc(collection(db, 'quizzes'), {
          ...editingQuiz,
          order: quizzes.length + 1,
          description: editingQuiz.description || ''
        });
      }
      setEditingQuiz(null);
      showStatus('success', 'Quiz enregistré.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'quizzes');
    }
  };

  const handleSaveTestimonial = async () => {
    if (!editingTestimonial?.text || !editingTestimonial?.author) return;
    try {
      const data = {
        ...editingTestimonial,
        order: editingTestimonial.order || testimonials.length + 1,
        createdAt: editingTestimonial.createdAt || Timestamp.now()
      };
      if (editingTestimonial.id) {
        await updateDoc(doc(db, 'testimonials', editingTestimonial.id), data);
      } else {
        await addDoc(collection(db, 'testimonials'), data);
      }
      setEditingTestimonial(null);
      showStatus('success', 'Témoignage enregistré.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'testimonials');
    }
  };

  const handleDeleteTestimonial = async (id: string) => {
    if (!confirm('Supprimer ce témoignage ?')) return;
    try {
      await deleteDoc(doc(db, 'testimonials', id));
      showStatus('success', 'Témoignage supprimé.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'testimonials');
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    try {
      // First delete all questions in the quiz
      const qRef = collection(db, `quizzes/${quizId}/questions`);
      const qSnap = await getDocs(qRef);
      const batch = writeBatch(db);
      qSnap.docs.forEach(doc => batch.delete(doc.ref));
      
      // Then delete the quiz itself
      batch.delete(doc(db, 'quizzes', quizId));
      await batch.commit();
      
      setShowConfirmDelete(null);
      showStatus('success', 'Quiz supprimé.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `quizzes/${quizId}`);
    }
  };

  const seedTestimonials = async () => {
    setIsSeeding(true);
    setShowConfirmDelete(null);
    try {
      // First, delete all existing testimonials
      const testimonialsSnapshot = await getDocs(collection(db, 'testimonials'));
      const deleteBatch = writeBatch(db);
      testimonialsSnapshot.docs.forEach((doc) => {
        deleteBatch.delete(doc.ref);
      });
      await deleteBatch.commit();

      // Then, insert the new ones
      const batch = writeBatch(db);
      for (const t of defaultTestimonials) {
        const newDoc = doc(collection(db, 'testimonials'));
        batch.set(newDoc, { ...t, createdAt: Timestamp.now() });
      }

      await batch.commit();
      showStatus('success', 'Témoignages importés avec succès');
    } catch (error: any) {
      console.error('Error seeding testimonials:', error instanceof Error ? error.message : String(error));
      showStatus('error', 'Erreur lors de l\'importation');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSaveQuestion = async () => {
    if (!editingQuestion?.text || !editingQuestion?.quizId) return;
    try {
      const questionData = {
        ...editingQuestion,
        order: editingQuestion.order || (questionsByQuiz[editingQuestion.quizId]?.length || 0) + 1
      };
      if (editingQuestion.id) {
        await updateDoc(doc(db, `quizzes/${editingQuestion.quizId}/questions`, editingQuestion.id), questionData);
      } else {
        await addDoc(collection(db, `quizzes/${editingQuestion.quizId}/questions`), questionData);
      }
      setEditingQuestion(null);
      showStatus('success', 'Question enregistrée.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `quizzes/${editingQuestion.quizId}/questions`);
    }
  };

  const handleDeleteModule = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'modules', id));
      setShowConfirmDelete(null);
      showStatus('success', 'Module supprimé.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `modules/${id}`);
    }
  };

  const handleDeleteCourse = async (moduleId: string, courseId: string) => {
    try {
      await deleteDoc(doc(db, `modules/${moduleId}/courses`, courseId));
      setShowConfirmDelete(null);
      showStatus('success', 'Cours supprimé.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `modules/${moduleId}/courses/${courseId}`);
    }
  };

  const handleMoveCourse = async (moduleId: string, courseIndex: number, direction: 'up' | 'down') => {
    const courses = [...(coursesByModule[moduleId] || [])];
    if (!courses.length) return;

    const newIndex = direction === 'up' ? courseIndex - 1 : courseIndex + 1;
    if (newIndex < 0 || newIndex >= courses.length) return;

    // Swap in array
    const temp = courses[courseIndex];
    courses[courseIndex] = courses[newIndex];
    courses[newIndex] = temp;

    try {
      const batch = writeBatch(db);
      
      // Re-assign order based on new array index
      courses.forEach((course, index) => {
        const ref = doc(db, `modules/${moduleId}/courses`, course.id);
        batch.update(ref, { order: index + 1 });
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `modules/${moduleId}/courses`);
    }
  };

  const handleMoveModule = async (moduleIndex: number, direction: 'up' | 'down') => {
    const mods = [...modules];
    if (!mods.length) return;

    const newIndex = direction === 'up' ? moduleIndex - 1 : moduleIndex + 1;
    if (newIndex < 0 || newIndex >= mods.length) return;

    // Swap in array
    const temp = mods[moduleIndex];
    mods[moduleIndex] = mods[newIndex];
    mods[newIndex] = temp;

    try {
      const batch = writeBatch(db);
      
      // Re-assign order based on new array index
      mods.forEach((mod, index) => {
        const ref = doc(db, 'modules', mod.id);
        batch.update(ref, { order: index + 1 });
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'modules');
    }
  };

  const handleDeleteQuestion = async (quizId: string, questionId: string) => {
    try {
      await deleteDoc(doc(db, `quizzes/${quizId}/questions`, questionId));
      setShowConfirmDelete(null);
      showStatus('success', 'Question supprimée.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `quizzes/${quizId}/questions/${questionId}`);
    }
  };

  const handleMoveQuiz = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newQuizzes = [...quizzes];
      [newQuizzes[index - 1], newQuizzes[index]] = [newQuizzes[index], newQuizzes[index - 1]];
      const batch = writeBatch(db);
      newQuizzes.forEach((q, i) => {
        batch.update(doc(db, 'quizzes', q.id), { order: i + 1 });
      });
      await batch.commit();
    } else if (direction === 'down' && index < quizzes.length - 1) {
      const newQuizzes = [...quizzes];
      [newQuizzes[index + 1], newQuizzes[index]] = [newQuizzes[index], newQuizzes[index + 1]];
      const batch = writeBatch(db);
      newQuizzes.forEach((q, i) => {
        batch.update(doc(db, 'quizzes', q.id), { order: i + 1 });
      });
      await batch.commit();
    }
  };

  const handleMoveQuestion = async (quizId: string, index: number, direction: 'up' | 'down') => {
    const questions = questionsByQuiz[quizId] || [];
    if (direction === 'up' && index > 0) {
      const newQuestions = [...questions];
      [newQuestions[index - 1], newQuestions[index]] = [newQuestions[index], newQuestions[index - 1]];
      const batch = writeBatch(db);
      newQuestions.forEach((q, i) => {
        batch.update(doc(db, `quizzes/${quizId}/questions`, q.id), { order: i + 1 });
      });
      await batch.commit();
    } else if (direction === 'down' && index < questions.length - 1) {
      const newQuestions = [...questions];
      [newQuestions[index + 1], newQuestions[index]] = [newQuestions[index], newQuestions[index + 1]];
      const batch = writeBatch(db);
      newQuestions.forEach((q, i) => {
        batch.update(doc(db, `quizzes/${quizId}/questions`, q.id), { order: i + 1 });
      });
      await batch.commit();
    }
  };

  const handleSavePrice = async () => {
    if (isNaN(basePrice) || basePrice < 0) {
      showStatus('error', 'Veuillez saisir un tarif valide supérieur ou égal à 0.');
      return;
    }
    setSavingPrice(true);
    try {
      await setDoc(doc(db, 'settings', 'pricing'), {
        basePrice: Number(basePrice),
        updatedAt: Timestamp.now()
      });
      showStatus('success', `Tarif de base enregistré avec succès : ${basePrice}€`);
    } catch (error: any) {
      showStatus('error', "Erreur lors de l'enregistrement du tarif : " + (error.message || error));
    } finally {
      setSavingPrice(false);
    }
  };

  const handleSavePromotion = async () => {
    setSavingPromotion(true);
    try {
      await setDoc(doc(db, 'settings', 'promotion'), promotion);
      showStatus('success', 'Promotion enregistrée avec succès.');
    } catch (error: any) {
      showStatus('error', "Erreur lors de l'enregistrement de la promotion.");
    } finally {
      setSavingPromotion(false);
    }
  };

  const handleSavePaymentSettings = async () => {
    setSavingPaymentSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'payment'), { stripePaymentLink });
      showStatus('success', 'Lien de paiement Stripe enregistré avec succès.');
    } catch (error: any) {
      showStatus('error', "Erreur lors de l'enregistrement du lien de paiement.");
    } finally {
      setSavingPaymentSettings(false);
    }
  };

  const handleSaveSiteStatus = async (overrideStatus?: { closedRegistrations: boolean; redirectUrl: string }) => {
    setSavingSiteStatus(true);
    const rawToSave = overrideStatus || siteStatus;
    const formattedUrl = formatRedirectUrl(rawToSave.redirectUrl);
    const toSave = {
      closedRegistrations: !!rawToSave.closedRegistrations,
      redirectUrl: formattedUrl
    };
    try {
      await setDoc(doc(db, 'settings', 'siteStatus'), {
        closedRegistrations: toSave.closedRegistrations,
        redirectUrl: toSave.redirectUrl,
        updatedAt: Timestamp.now()
      });
      setSiteStatus(toSave);
      showStatus(
        'success',
        toSave.closedRegistrations 
          ? `Mode fermeture activé avec l'URL de redirection : ${toSave.redirectUrl}` 
          : 'Version normale rétablie : Les inscriptions et les paiements sont de nouveau ouverts.'
      );
    } catch (error: any) {
      showStatus('error', "Erreur lors de la mise à jour du statut : " + (error.message || error));
    } finally {
      setSavingSiteStatus(false);
    }
  };

  const togglePaidStatus = async (uid: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    const currentUser = user || auth.currentUser;
    if (!currentUser) {
      showStatus('error', "Vous devez être connecté pour modifier le statut.");
      return;
    }

    let successViaApi = false;
    try {
      const adminToken = await currentUser.getIdToken(true);
      const response = await fetch('/api/admin/activate-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: uid, 
          authHeader: `Bearer ${adminToken}`,
          isPaid: nextStatus
        })
      });
      if (response.ok) {
        successViaApi = true;
        showStatus('success', `Utilisateur ${nextStatus ? 'activé' : 'désactivé'} avec succès (via API).`);
      }
    } catch (apiError) {
      console.warn("L'API d'activation n'a pas pu être contactée, passage en mise à jour directe Firestore :", apiError);
    }

    if (!successViaApi) {
      try {
        await updateDoc(doc(db, 'users', uid), {
          isPaid: nextStatus,
          paidAt: nextStatus ? Timestamp.now() : null,
          manualActivation: true,
          activatedBy: currentUser.email || 'Admin'
        });
        showStatus('success', `Utilisateur ${nextStatus ? 'activé' : 'désactivé'} avec succès (Direct Firestore).`);
      } catch (firestoreError: any) {
        console.error("Échec de mise à jour directe Firestore :", firestoreError);
        handleFirestoreError(firestoreError, OperationType.UPDATE, `users/${uid}`);
      }
    }
  };

  const handleDeleteUser = async (uid: string) => {
    console.log("Attempting to delete user:", uid);
    setIsDeleting(true);
    
    const currentUser = user || auth.currentUser;
    if (!currentUser) {
      showStatus('error', "Vous devez être connecté pour effectuer cette action.");
      setIsDeleting(false);
      return;
    }

    let deletedViaApi = false;
    try {
      console.log("Getting admin token...");
      const adminToken = await currentUser.getIdToken(true);
      console.log("Token obtained, sending request to server...");

      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, adminToken })
      });

      if (response.ok) {
        const data = await response.json();
        deletedViaApi = true;
        if (data.warning) {
          showStatus('error', data.warning);
        } else {
          showStatus('success', 'Utilisateur supprimé avec succès.');
        }
        setShowConfirmDelete(null);
      }
    } catch (apiErr) {
      console.warn("L'API de suppression n'a pas pu être contactée (possible hébergement statique), passage en suppression directe Firestore :", apiErr);
    }

    if (!deletedViaApi) {
      try {
        console.log("Attempting client-side Firestore deletion fallback...");
        // 1. Delete Firestore profile
        await deleteDoc(doc(db, 'users', uid));
        console.log("Firestore profile deleted client-side");

        // 2. Delete connection logs
        try {
          const logsSnapshot = await getDocs(query(collection(db, 'connection_logs'), where('uid', '==', uid)));
          if (!logsSnapshot.empty) {
            const batch = writeBatch(db);
            logsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
            console.log("Connection logs deleted client-side");
          }
        } catch (logsErr) {
          console.warn("Impossible de supprimer les logs de connexion (non bloquant):", logsErr);
        }

        showStatus('success', 'Utilisateur supprimé avec succès de la base de données (Direct Firestore).');
        setShowConfirmDelete(null);
      } catch (clientErr: any) {
        console.error("Client-side direct deletion failed:", clientErr);
        showStatus('error', `Erreur lors de la suppression : ${clientErr.message || "Accès refusé"}`);
      } finally {
        setIsDeleting(false);
      }
    } else {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 mb-2">Administration</h1>
          <p className="text-zinc-500">Gérez le contenu, les utilisateurs et suivez les résultats.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-zinc-100 rounded-xl border border-zinc-200">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Session</span>
            <span className="text-sm font-bold text-zinc-900">{profile?.email}</span>
          </div>
        </div>
      </div>

      {/* ZONE DE DEBUG ADMIN */}
      <div className="mb-8 p-6 bg-zinc-900 rounded-3xl text-white shadow-xl border border-white/5">
        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-rose-400" />
            <h2 className="text-xl font-bold italic">Diagnostic & Support</h2>
          </div>
          <div className="text-[10px] font-mono text-zinc-500">
            DB: {firebaseConfig.firestoreDatabaseId || '(default)'}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs font-bold text-zinc-500 uppercase mb-2">État du compte</p>
            <div className="space-y-1 text-sm font-mono">
              <p><span className="opacity-50">Email:</span> {profile?.email}</p>
              <p><span className="opacity-50">Accès Payé:</span> {profile?.isPaid ? <span className="text-emerald-400">OUI</span> : <span className="text-rose-400">NON</span>}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button 
              onClick={async () => {
                console.log("Test DB button clicked");
                setDbTestStatus({ type: 'loading', text: 'Vérification en cours...' });
                try {
                  await testConnection();
                  setDbTestStatus({ type: 'success', text: '✅ Connexion réussie !' });
                } catch (e: any) {
                  console.error("Debug Test DB Error:", e instanceof Error ? e.message : String(e));
                  setDbTestStatus({ type: 'error', text: '❌ Erreur : ' + (e.message || 'Inconnue') });
                }
              }}
              className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2 border border-white/10"
            >
              [Test DB] - Vérifier la connexion
            </button>
            <button 
              onClick={async () => {
                console.log("Debug Serveur DB button clicked");
                setDbTestStatus({ type: 'loading', text: 'Interrogation du serveur...' });
                try {
                  const response = await fetch('/api/admin/test-db');
                  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                  const data = await response.json();
                  console.log("Server Debug Result:", data);
                  setServerDebugResult(data);
                  setDbTestStatus({ type: 'success', text: '✅ Réponse serveur reçue' });
                } catch (e: any) {
                  console.error("Erreur Serveur DB:", e instanceof Error ? e.message : String(e));
                  setDbTestStatus({ type: 'error', text: '❌ Erreur Serveur : ' + e.message });
                }
              }}
              className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2 border border-white/10"
            >
              [Debug Serveur DB]
            </button>
            {serverDebugResult && (
              <div className="p-4 bg-black/40 rounded-xl border border-white/10 overflow-auto max-h-60">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase tracking-wider opacity-50 font-bold">Résultat Diagnostic Serveur</span>
                  <button onClick={() => setServerDebugResult(null)} className="text-[10px] hover:text-white opacity-50">Fermer</button>
                </div>
                <pre className="text-[10px] font-mono whitespace-pre-wrap">
                  {safeJsonStringify(serverDebugResult, 2)}
                </pre>
              </div>
            )}
            {dbTestStatus && (
              <div className={`p-3 rounded-xl text-xs font-bold ${
                dbTestStatus.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 
                dbTestStatus.type === 'error' ? 'bg-rose-500/20 text-rose-400' : 
                'bg-blue-500/20 text-blue-400'
              }`}>
                {dbTestStatus.text}
              </div>
            )}
            <button 
              onClick={runStripeDiagnostic}
              disabled={isDiagnosingStripe}
              className="w-full px-4 py-3 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2 border border-purple-600/30"
            >
              {isDiagnosingStripe ? "Analyse Stripe..." : "[Diagnostic Stripe] - Voir récents"}
            </button>
            <button 
              onClick={async () => {
                if (!profile?.uid) return;
                try {
                  await updateDoc(doc(db, 'users', profile.uid), { isPaid: true });
                  alert("✅ Accès forcé avec succès !");
                  window.location.reload();
                } catch (e: any) {
                  alert("❌ Erreur : " + e.message);
                }
              }}
              className="w-full px-4 py-3 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2 border border-rose-600/30"
            >
              [FORCER ACTIVATION] - Débloquer mon accès
            </button>
          </div>
              <div className="flex flex-col gap-2">
            <Link 
              to="/dashboard"
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
            >
              <BookOpen className="w-4 h-4" /> Voir l'Espace Formation
            </Link>
            <p className="text-[10px] text-zinc-500 italic text-center px-4">
              Cliquez sur "Voir l'Espace Formation" pour voir ce que vos élèves voient.
            </p>
          </div>
        </div>

        {stripeDiagnostics && (
          <div className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/5 overflow-auto w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-white uppercase flex items-center gap-2">
                <History className="w-4 h-4" /> Les 15 Dernières sessions Stripe
              </h3>
              <button onClick={() => setStripeDiagnostics(null)} className="text-xs text-white/50 hover:text-white">Fermer</button>
            </div>
            {stripeDiagnostics.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 opacity-50 font-medium">Email Stripe / Nom</th>
                    <th className="py-2 opacity-50 font-medium">Mode</th>
                    <th className="py-2 opacity-50 font-medium">Date</th>
                    <th className="py-2 opacity-50 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {stripeDiagnostics.map(s => (
                    <tr key={s.id} className="border-b border-white/5">
                      <td className="py-2">
                        <div className="font-bold text-white">{s.email}</div>
                        <div className="opacity-50">{s.name}</div>
                      </td>
                      <td className="py-2 font-mono">
                        <span className={s.mode === 'Live' ? 'text-emerald-400' : 'text-orange-400'}>{s.mode}</span>
                      </td>
                      <td className="py-2 opacity-70">{s.date}</td>
                      <td className="py-2 font-bold">
                        {s.status === 'paid' ? <span className="text-emerald-400">Payé</span> : <span className="text-rose-400">{s.status}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-white/50 italic">Aucune session trouvée dans Stripe.</p>
            )}
          </div>
        )}
      </div>

      <div className="bg-zinc-100 p-1 rounded-xl mb-8 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max">
          <button 
            onClick={() => setActiveTab('content')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'content' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Contenu
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'users' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Utilisateurs
          </button>
          <button 
            onClick={() => setActiveTab('migration')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'migration' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Migration
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Logs
          </button>
          <button 
            onClick={() => setActiveTab('qcm')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'qcm' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            QCM
          </button>
          <button 
            onClick={() => setActiveTab('results')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'results' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Résultats QCM
          </button>
          <button 
            onClick={() => setActiveTab('maintenance')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'maintenance' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Maintenance
          </button>
          <button 
            onClick={() => setActiveTab('testimonials')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'testimonials' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Témoignages
          </button>
          <button 
            onClick={() => setActiveTab('promotion')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'promotion' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Tarif & Promotion
          </button>
          <button 
            onClick={() => setActiveTab('site_status')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'site_status' 
                ? 'bg-zinc-900 text-white shadow-sm' 
                : siteStatus.closedRegistrations
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${siteStatus.closedRegistrations ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
            {siteStatus.closedRegistrations ? '🔴 Inscriptions Fermées' : 'Statut Inscriptions'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`fixed top-24 right-4 z-[200] px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 border ${
            statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-medium">{statusMessage.text}</span>
        </motion.div>
      )}

      {activeTab === 'content' ? (
        <div className="space-y-8">
          {/* ... existing content code ... */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5" /> Modules de formation
            </h2>
            <div className="flex flex-wrap gap-4 w-full sm:w-auto">
              <button 
                onClick={runDiagnostic}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 text-sm font-bold rounded-lg hover:bg-emerald-100 transition-colors"
              >
                Diagnostic
              </button>
              <button 
                onClick={() => setShowConfirmDelete({ type: 'clear' })}
                disabled={isSeeding || modules.length === 0}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 text-sm font-bold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> Nettoyer
              </button>
              <button 
                onClick={seedInitialData}
                disabled={isSeeding}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-600 text-sm font-bold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                <Database className="w-4 h-4" /> {isSeeding ? 'Seeding...' : 'Seed Data'}
              </button>
              <button 
                onClick={() => setEditingModule({ title: '', description: '', order: modules.length + 1 })}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Nouveau Module
              </button>
            </div>
          </div>

          {diagnosticResult && (
            <div className="p-6 bg-zinc-900 rounded-2xl border border-zinc-800 font-mono text-xs text-emerald-400 whitespace-pre-wrap relative mb-8">
              <button 
                onClick={() => setDiagnosticResult(null)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="font-bold text-zinc-400 mb-2 uppercase tracking-widest text-[10px]">Résultat Diagnostic</div>
              {diagnosticResult}
            </div>
          )}

          <div className="grid gap-6">
            {modules.map((module, index) => (
              <div key={module.id} className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 flex items-center justify-between bg-zinc-50 border-b border-zinc-200">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setExpandedModule(expandedModule === module.id ? null : module.id)} className="p-1 hover:bg-zinc-200 rounded-lg transition-colors">
                      {expandedModule === module.id ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
                    </button>
                    <div>
                      <h3 className="font-bold text-zinc-900">{module.title}</h3>
                      <p className="text-xs text-zinc-500">Module #{module.order}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleMoveModule(index, 'up')}
                      disabled={index === 0}
                      className={`p-2 transition-colors ${index === 0 ? 'text-zinc-200 cursor-not-allowed' : 'text-zinc-400 hover:text-blue-600'}`}
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleMoveModule(index, 'down')}
                      disabled={index === modules.length - 1}
                      className={`p-2 transition-colors ${index === modules.length - 1 ? 'text-zinc-200 cursor-not-allowed' : 'text-zinc-400 hover:text-blue-600'}`}
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-zinc-200 mx-1"></div>
                    <button onClick={() => setEditingModule(module)} className="p-2 text-zinc-400 hover:text-blue-600 transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowConfirmDelete({ type: 'module', id: module.id })} className="p-2 text-zinc-400 hover:text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedModule === module.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 space-y-4">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Cours</h4>
                          <button 
                            onClick={() => setEditingCourse({ moduleId: module.id, title: '', content: '', pdfUrl: '', order: (coursesByModule[module.id]?.length || 0) + 1 })}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Ajouter un cours
                          </button>
                        </div>
                        <div className="space-y-2">
                          {coursesByModule[module.id]?.map((course, index) => (
                            <div key={course.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-zinc-700">{course.title}</span>
                                {course.pdfUrl && <FileText className="w-3.5 h-3.5 text-blue-500" />}
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => handleMoveCourse(module.id, index, 'up')}
                                  disabled={index === 0}
                                  className={`p-1.5 transition-colors ${index === 0 ? 'text-zinc-200 cursor-not-allowed' : 'text-zinc-400 hover:text-blue-600'}`}
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleMoveCourse(module.id, index, 'down')}
                                  disabled={index === (coursesByModule[module.id]?.length || 0) - 1}
                                  className={`p-1.5 transition-colors ${index === (coursesByModule[module.id]?.length || 0) - 1 ? 'text-zinc-200 cursor-not-allowed' : 'text-zinc-400 hover:text-blue-600'}`}
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <div className="w-px h-4 bg-zinc-200 mx-1"></div>
                                <button onClick={() => setEditingCourse(course)} className="p-1.5 text-zinc-400 hover:text-blue-600 transition-colors">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setShowConfirmDelete({ type: 'course', id: course.id, moduleId: module.id })} className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {(!coursesByModule[module.id] || coursesByModule[module.id].length === 0) && (
                            <p className="text-sm text-zinc-400 italic text-center py-4">Aucun cours dans ce module.</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            {modules.length === 0 && (
              <div className="text-center py-20 bg-white border border-dashed border-zinc-300 rounded-3xl">
                <Database className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                <p className="text-zinc-500">Aucun contenu disponible. Utilisez le bouton "Seed Data" pour commencer.</p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'users' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <Users className="w-5 h-5" /> Gestion des utilisateurs
            </h2>
            <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={checkAllPayments}
                  disabled={isCheckingAll}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors font-bold text-sm disabled:opacity-50 whitespace-nowrap"
                >
                  {isCheckingAll ? (
                    <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <History className="w-4 h-4" />
                  )}
                  Synchroniser Stripe
                </button>
                <button
                  onClick={() => setShowCreateUserModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors font-bold text-sm whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" /> Nouvel élève
                </button>
              </div>
              <div className="relative w-full xl:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Rechercher un utilisateur..." 
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>
            </div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-left min-w-[1000px]">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Utilisateur</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Contact</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Localisation</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Rôle</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Statut Paiement</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {students
                  .filter(s => 
                    (s.email || '').toLowerCase().includes((userSearch || '').toLowerCase()) || 
                    (s.firstName || '').toLowerCase().includes((userSearch || '').toLowerCase()) || 
                    (s.lastName || '').toLowerCase().includes((userSearch || '').toLowerCase())
                  )
                  .map(student => (
                    <tr key={student.uid} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-zinc-900">
                          {student.firstName || student.lastName ? `${student.firstName || ''} ${student.lastName || ''}` : 'Utilisateur sans nom'}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono">{student.uid.substring(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-zinc-600">{student.email}</div>
                        {student.phone && <div className="text-xs text-zinc-400">{student.phone}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-zinc-600">{student.city || '-'}, {student.country || '-'}</div>
                        <div className="text-xs text-zinc-400">{student.address || '-'} {student.zipCode || ''}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-[10px] font-bold rounded-md ${student.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {student.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => togglePaidStatus(student.uid, student.isPaid)}
                          className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${student.isPaid ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
                        >
                          {student.isPaid ? 'PAYÉ' : 'NON PAYÉ'}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={async () => {
                              try {
                                const response = await fetch('/api/check-payment-status', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ userId: student.uid, email: student.email }),
                                });
                                const data = await response.json();
                                if (data.success) {
                                  setStatusMessage({ type: 'success', text: data.message });
                                } else {
                                  // Show debug info in console for admin
                                  console.log("Check Payment Debug Info:", data.debug);
                                  setStatusMessage({ 
                                    type: 'error', 
                                    text: `${data.message}${data.debug ? ' (Infos de debug envoyées en console)' : ''}` 
                                  });
                                }
                              } catch (e) {
                                setStatusMessage({ type: 'error', text: "Erreur lors de la vérification." });
                              }
                            }}
                            className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors"
                            title="Vérifier le paiement Stripe"
                          >
                            <History className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => {
                              setResultSearch(student.email);
                              setActiveTab('results');
                            }}
                            className="p-2 text-zinc-400 hover:text-blue-600 transition-colors"
                            title="Voir les résultats"
                          >
                            <Award className="w-5 h-5" />
                          </button>
                          {student.role !== 'admin' && (
                            <button 
                              onClick={() => setShowConfirmDelete({ type: 'user', id: student.uid })}
                              className="p-2 text-zinc-400 hover:text-red-600 transition-colors"
                              title="Supprimer l'utilisateur"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'migration' ? (
        <div className="space-y-8">
          <div className="bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900">Migration d'utilisateurs</h2>
                <p className="text-zinc-500 text-sm">Importez vos anciens clients depuis un fichier CSV.</p>
              </div>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 mb-8">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Format requis</h4>
              <p className="text-sm text-zinc-600 mb-4">Le fichier CSV doit contenir les colonnes suivantes :</p>
              <div className="flex flex-wrap gap-2">
                <code className="px-2 py-1 bg-white border border-zinc-200 rounded text-blue-600 text-xs font-mono">email</code>
                <code className="px-2 py-1 bg-white border border-zinc-200 rounded text-blue-600 text-xs font-mono">firstName</code>
                <code className="px-2 py-1 bg-white border border-zinc-200 rounded text-blue-600 text-xs font-mono">lastName</code>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <label className="w-full sm:flex-1">
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                <div className="w-full px-6 py-4 bg-white border-2 border-dashed border-zinc-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer text-center">
                  <span className="text-zinc-500 font-medium">
                    {migrationData.length > 0 ? `${migrationData.length} utilisateurs chargés` : 'Sélectionner un fichier CSV'}
                  </span>
                </div>
              </label>
              {migrationData.length > 0 && (
                <button 
                  onClick={runMigration}
                  disabled={isMigrating}
                  className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isMigrating ? 'Migration en cours...' : 'Lancer la migration'}
                  {!isMigrating && <CheckCircle2 className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>

          {migrationResults.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-200 flex justify-between items-center">
                <h3 className="font-bold text-zinc-900">Résultats de la migration</h3>
                <button 
                  onClick={() => {
                    const emails = migrationResults.filter(r => r.status === 'success').map(r => r.email).join(', ');
                    navigator.clipboard.writeText(emails);
                    showStatus('success', 'Emails copiés dans le presse-papier.');
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Mail size={14} /> Copier les emails (succès)
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100">
                      <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Email</th>
                      <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Statut</th>
                      <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Détails</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {migrationResults.map((result, idx) => (
                      <tr key={idx}>
                        <td className="px-6 py-4 text-sm font-medium text-zinc-900">{result.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-[10px] font-bold rounded-md ${result.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {result.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-zinc-500">
                          {result.status === 'success' ? `UID: ${result.uid}` : result.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'qcm' ? (
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <Database className="w-5 h-5" /> Gestion des QCM
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportAllQuizzesPdf}
                disabled={isExportingPdfQcm || quizzes.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                title="Génère un document PDF imprimable avec l'ensemble de tous les QCM et leurs réponses"
              >
                {isExportingPdfQcm ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                {isExportingPdfQcm ? 'Génération...' : 'Exporter tout en PDF'}
              </button>
              <button
                onClick={handleExportAllQuizzesIndividually}
                disabled={isExportingQcm || quizzes.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                title="Télécharge chaque QCM dans un fichier JSON distinct"
              >
                {isExportingQcm ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isExportingQcm ? 'Exportation...' : 'Exporter tous les QCM (JSON)'}
              </button>
              <label className={`flex items-center justify-center gap-2 px-4 py-2 ${isImportingPdf ? 'bg-zinc-400 cursor-not-allowed' : 'bg-zinc-800 hover:bg-zinc-700 cursor-pointer'} text-white text-sm font-bold rounded-lg transition-colors`}>
                {isImportingPdf ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isImportingPdf ? 'Analyse...' : 'Importer PDF'}
                <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={isImportingPdf} />
              </label>
              <button 
                onClick={() => setEditingQuiz({ title: '', description: '', order: quizzes.length + 1 })}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Nouveau Quiz
              </button>
            </div>
          </div>

          <div className="grid gap-6">
            {quizzes.map((quiz, quizIdx) => (
              <div key={quiz.id} className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 flex items-center justify-between bg-zinc-50 border-b border-zinc-200">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setExpandedQuiz(expandedQuiz === quiz.id ? null : quiz.id)} className="p-1 hover:bg-zinc-200 rounded-lg transition-colors">
                      {expandedQuiz === quiz.id ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
                    </button>
                    <div>
                      <h3 className="font-bold text-zinc-900">{quiz.title}</h3>
                      <p className="text-xs text-zinc-500">Quiz #{quiz.order} • {questionsByQuiz[quiz.id]?.length || 0} questions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleExportSingleQuizPdf(quiz)} 
                      className="p-2 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                      title="Imprimer / Télécharger ce QCM en PDF"
                    >
                      <FileText className="w-4 h-4" />
                      <span className="hidden sm:inline">PDF</span>
                    </button>
                    <button 
                      onClick={() => handleExportSingleQuiz(quiz)} 
                      className="p-2 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                      title="Télécharger ce QCM en JSON"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden sm:inline">JSON</span>
                    </button>
                    <div className="flex flex-col mr-2">
                      <button 
                        onClick={() => handleMoveQuiz(quizIdx, 'up')} 
                        disabled={quizIdx === 0}
                        className={`p-1 ${quizIdx === 0 ? 'text-zinc-200' : 'text-zinc-400 hover:text-blue-600'} transition-colors`}
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleMoveQuiz(quizIdx, 'down')} 
                        disabled={quizIdx === quizzes.length - 1}
                        className={`p-1 ${quizIdx === quizzes.length - 1 ? 'text-zinc-200' : 'text-zinc-400 hover:text-blue-600'} transition-colors`}
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                    <button onClick={() => setEditingQuiz(quiz)} className="p-2 text-zinc-400 hover:text-blue-600 transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowConfirmDelete({ type: 'quiz', id: quiz.id })} className="p-2 text-zinc-400 hover:text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedQuiz === quiz.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 space-y-4">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Questions</h4>
                          <button 
                            onClick={() => setEditingQuestion({ quizId: quiz.id, text: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '', order: (questionsByQuiz[quiz.id]?.length || 0) + 1 })}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Ajouter une question
                          </button>
                        </div>
                        <div className="space-y-4">
                          {questionsByQuiz[quiz.id]?.map((question, idx) => (
                            <div key={question.id} className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex-1">
                                  <span className="text-xs font-bold text-zinc-400 mr-2">Q{idx + 1}</span>
                                  <span className="text-sm font-medium text-zinc-900">{question.text}</span>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                  <div className="flex flex-col mr-2">
                                    <button 
                                      onClick={() => handleMoveQuestion(quiz.id, idx, 'up')} 
                                      disabled={idx === 0}
                                      className={`p-1 ${idx === 0 ? 'text-zinc-200' : 'text-zinc-400 hover:text-blue-600'} transition-colors`}
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button 
                                      onClick={() => handleMoveQuestion(quiz.id, idx, 'down')} 
                                      disabled={idx === (questionsByQuiz[quiz.id]?.length || 0) - 1}
                                      className={`p-1 ${idx === (questionsByQuiz[quiz.id]?.length || 0) - 1 ? 'text-zinc-200' : 'text-zinc-400 hover:text-blue-600'} transition-colors`}
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <button onClick={() => setEditingQuestion(question)} className="p-1.5 text-zinc-400 hover:text-blue-600 transition-colors">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => handleDeleteQuestion(quiz.id, question.id)} className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                                {question.options.map((opt, oIdx) => (
                                  <div key={oIdx} className={`text-xs p-2 rounded-lg border ${oIdx === question.correctAnswer ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-white border-zinc-100 text-zinc-500'}`}>
                                    {opt}
                                  </div>
                                ))}
                              </div>
                              {question.explanation && (
                                <p className="text-[10px] text-zinc-400 mt-2 italic">Explication: {question.explanation}</p>
                              )}
                            </div>
                          ))}
                          {(!questionsByQuiz[quiz.id] || questionsByQuiz[quiz.id].length === 0) && (
                            <p className="text-sm text-zinc-400 italic text-center py-4">Aucune question dans ce quiz.</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            {quizzes.length === 0 && (
              <div className="text-center py-20 bg-white border border-dashed border-zinc-300 rounded-3xl">
                <Database className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                <p className="text-zinc-500">Aucun quiz disponible.</p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'results' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <Award className="w-5 h-5" /> Synthèse des résultats QCM
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Rechercher un résultat..." 
                value={resultSearch}
                onChange={(e) => setResultSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100">
                    <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Utilisateur</th>
                    <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Quiz</th>
                    <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Score</th>
                    <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {quizAttempts
                    .filter(a => 
                      (a.userName || '').toLowerCase().includes((resultSearch || '').toLowerCase()) || 
                      (a.userEmail || '').toLowerCase().includes((resultSearch || '').toLowerCase()) || 
                      (a.quizTitle || '').toLowerCase().includes((resultSearch || '').toLowerCase())
                    )
                    .map(attempt => (
                      <tr key={attempt.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-zinc-900">{attempt.userName}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{attempt.userEmail}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-zinc-600 font-medium">{attempt.quizTitle}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${attempt.percentage >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {attempt.score} / {attempt.totalQuestions}
                            </span>
                            <span className="text-xs text-zinc-400">({attempt.percentage}%)</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">
                          {attempt.completedAt?.toDate().toLocaleString('fr-FR')}
                        </td>
                      </tr>
                    ))}
                  {quizAttempts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 italic">Aucun résultat trouvé.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'testimonials' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <Award className="w-5 h-5" /> Gestion des témoignages
            </h2>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={() => setShowConfirmDelete({ type: 'seedTestimonials' })}
                disabled={isSeeding}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-600 text-sm font-bold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                <Database className="w-4 h-4" /> {isSeeding ? 'Importation...' : 'Importer tous les témoignages'}
              </button>
              <button 
                onClick={() => setEditingTestimonial({ text: '', author: '', role: '', rating: 5, order: testimonials.length + 1 })}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Nouveau Témoignage
              </button>
            </div>
          </div>

          <div className="grid gap-6">
            {testimonials.map(t => (
              <div key={t.id} className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between gap-6">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-3 h-3 ${i < t.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-200'}`} />
                      ))}
                    </div>
                    <span className="text-xs text-zinc-400 font-medium">#{t.order}</span>
                  </div>
                  <p className="text-zinc-700 italic text-sm leading-relaxed">"{t.text}"</p>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900 text-sm">{t.author}</span>
                    <span className="text-zinc-400 text-xs">•</span>
                    <span className="text-zinc-500 text-xs uppercase tracking-wider">{t.role}</span>
                  </div>
                </div>
                <div className="flex md:flex-col items-center justify-end gap-2">
                  <button 
                    onClick={() => setEditingTestimonial(t)}
                    className="p-2 text-zinc-400 hover:text-blue-600 transition-colors"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleDeleteTestimonial(t.id)}
                    className="p-2 text-zinc-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
            {testimonials.length === 0 && (
              <div className="text-center py-20 bg-white border border-dashed border-zinc-300 rounded-3xl">
                <Award className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                <p className="text-zinc-500">Aucun témoignage disponible.</p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'promotion' ? (
        <div className="space-y-8">
          {/* SECTION 1: TARIF DE BASE */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-zinc-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-100 pb-6">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                  <Star className="w-5 h-5 text-blue-600" /> Tarif de base de la formation
                </h2>
                <p className="text-sm text-zinc-500 mt-1">
                  Définissez le prix standard de la formation IFR. Ce tarif est répercuté en temps réel sur la page d'accueil, la page de paiement et le checkout Stripe.
                </p>
              </div>
              <div className="px-4 py-2 bg-blue-50 border border-blue-100 rounded-2xl text-blue-700 font-bold text-lg whitespace-nowrap">
                {basePrice} € TTC
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                  Prix de base (en €)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={basePrice}
                    onChange={(e) => setBasePrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-4 pr-12 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold text-zinc-900"
                    placeholder="79"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-zinc-400">€</span>
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  Valeur par défaut : 79€. En modifiant cette valeur, les réductions promotionnelles seront également recalculées sur cette base.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSavePrice}
                  disabled={savingPrice}
                  className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} />
                  {savingPrice ? 'Enregistrement...' : 'Enregistrer le tarif'}
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 2: PROMOTION */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-zinc-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-100 pb-6">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500" /> Promotion Spéciale & Code Promo
                </h2>
                <p className="text-sm text-zinc-500 mt-1">Configurez une offre promotionnelle temporaire appliquée automatiquement ou par code.</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isPromoActive"
                checked={promotion.isActive}
                onChange={(e) => setPromotion({ ...promotion, isActive: e.target.checked })}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isPromoActive" className="text-sm font-bold text-zinc-700 cursor-pointer">Activer la promotion</label>
            </div>

            {promotion.isActive && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Code Promo</label>
                  <input
                    type="text"
                    value={promotion.promoCode}
                    onChange={(e) => setPromotion({ ...promotion, promoCode: e.target.value.toUpperCase() })}
                    placeholder="Ex: NOEL20"
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Réduction (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={promotion.discountPercentage}
                    onChange={(e) => setPromotion({ ...promotion, discountPercentage: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Date de fin</label>
                  <input
                    type="datetime-local"
                    value={promotion.endDate}
                    onChange={(e) => setPromotion({ ...promotion, endDate: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            )}
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSavePromotion}
                disabled={savingPromotion}
                className="w-full sm:w-auto px-8 py-3.5 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                {savingPromotion ? 'Enregistrement...' : 'Enregistrer la promotion'}
              </button>
            </div>
          </div>

          {/* SECTION 3: LIEN STRIPE DIRECT */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-zinc-200 shadow-sm space-y-6">
            <div className="border-b border-zinc-100 pb-6">
              <h3 className="font-bold text-zinc-900 flex items-center gap-2 text-base">
                <Globe className="w-5 h-5 text-zinc-500" /> Configuration Hébergement Classique (Stripe Payment Link)
              </h3>
              <p className="text-sm text-zinc-500 leading-relaxed mt-1">
                Si votre site est hébergé sans serveur Node.js actif (Hébergement Partagé standard cPanel/Hostinger au lieu d'un VPS), les appels d'API ne fonctionnent pas. Indiquez ici un <strong>Lien de paiement Stripe</strong> généré depuis votre Tableau de bord Stripe. Les élèves y seront redirigés pour payer et leur statut passera en attente d'une activation manuelle de votre part dans l'onglet "Utilisateurs" (en un seul clic).
              </p>
            </div>
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 leading-relaxed">
              <strong>💡 Comment faire ?</strong><br/>
              1. Allez sur votre <a href="https://dashboard.stripe.com/payment-links" target="_blank" rel="noreferrer" className="underline font-bold">Tableau de bord Stripe (Liens de paiement)</a>.<br/>
              2. Créez un lien au tarif souhaité ({basePrice}€).<br/>
              3. Configurez la redirection après paiement vers : <code className="bg-blue-100 px-1 rounded">https://aviationonline.fr/dashboard?payment_success=true</code><br/>
              4. Copiez le lien Stripe (commençant par <code className="bg-blue-100 px-1 rounded">https://buy.stripe.com/</code>) et collez-le ci-dessous.
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Lien de paiement Stripe (Buy Link)</label>
              <input
                type="url"
                placeholder="Ex: https://buy.stripe.com/abcde123456789"
                value={stripePaymentLink}
                onChange={(e) => setStripePaymentLink(e.target.value.trim())}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
              />
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSavePaymentSettings}
                disabled={savingPaymentSettings}
                className="w-full sm:w-auto px-8 py-3.5 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-colors shadow-lg disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                {savingPaymentSettings ? 'Enregistrement...' : 'Enregistrer le lien Stripe'}
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === 'site_status' ? (
        <div className="space-y-8 max-w-5xl">
          {/* BANNER STATUS HEADER */}
          <div className={`p-6 sm:p-8 rounded-3xl border shadow-sm transition-all ${
            siteStatus.closedRegistrations
              ? 'bg-red-50/80 border-red-200'
              : 'bg-emerald-50/80 border-emerald-200'
          }`}>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 ${
                  siteStatus.closedRegistrations ? 'bg-red-600' : 'bg-emerald-600'
                }`}>
                  <AlertCircle size={28} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      siteStatus.closedRegistrations ? 'bg-red-200 text-red-800' : 'bg-emerald-200 text-emerald-800'
                    }`}>
                      {siteStatus.closedRegistrations ? '🔴 MODE FERMETURE ACTIF' : '🟢 VERSION NORMALE ACTIVE'}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 mt-1">
                    {siteStatus.closedRegistrations
                      ? 'Les nouvelles inscriptions & paiements sont bloqués'
                      : 'Les inscriptions et les paiements sont ouverts à tous'}
                  </h2>
                  <p className="text-sm text-zinc-600 mt-1">
                    {siteStatus.closedRegistrations
                      ? 'Le bandeau rouge d\'information est affiché sur la page d\'accueil avec votre lien de connexion.'
                      : 'Le site fonctionne normalement, les nouveaux visiteurs peuvent créer un compte et payer.'}
                  </p>
                </div>
              </div>

              {/* ACTION TOGGLE BUTTON */}
              <div className="w-full md:w-auto shrink-0">
                {siteStatus.closedRegistrations ? (
                  <button
                    onClick={() => handleSaveSiteStatus({ closedRegistrations: false, redirectUrl: siteStatus.redirectUrl })}
                    disabled={savingSiteStatus}
                    className="w-full md:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 size={18} />
                    {savingSiteStatus ? 'Rétablissement...' : 'Revenir à la version actuelle (Réouvrir le site)'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSaveSiteStatus({ closedRegistrations: true, redirectUrl: siteStatus.redirectUrl })}
                    disabled={savingSiteStatus}
                    className="w-full md:w-auto px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
                  >
                    <AlertCircle size={18} />
                    {savingSiteStatus ? 'Activation...' : 'Activer le mode fermeture (Bloquer & Afficher le bandeau)'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* CONFIGURATION DU LIEN PARAMETRABLE */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-zinc-200 shadow-sm space-y-6">
            <div className="border-b border-zinc-100 pb-4">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-600" />
                URL paramétrable de connexion / redirection
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                L'adresse web sur laquelle les élèves existants sont invités à cliquer dans le bandeau rouge pour se connecter à leur compte.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                URL de destination (ex: https://home.aviationonline.net ou https://aviationonline.fr/login)
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="https://home.aviationonline.net"
                  value={siteStatus.redirectUrl}
                  onChange={(e) => setSiteStatus({ ...siteStatus, redirectUrl: e.target.value })}
                  className="flex-1 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                />
                <button
                  onClick={() => handleSaveSiteStatus()}
                  disabled={savingSiteStatus}
                  className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  {savingSiteStatus ? 'Enregistrement...' : 'Enregistrer l\'URL'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>URL active :</span>
                <a
                  href={formatRedirectUrl(siteStatus.redirectUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                >
                  {formatRedirectUrl(siteStatus.redirectUrl)} <ExternalLink size={12} />
                </a>
                <span className="text-zinc-400">| Le préfixe https:// est ajouté automatiquement si vous l'omettez.</span>
              </div>
            </div>
          </div>

          {/* APERÇU EN DIRECT DU BANDEAU ROUGE */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-zinc-500" />
                Aperçu visuel du bandeau tel qu'il apparaît sur la page d'accueil
              </h3>
              <span className="text-xs text-zinc-400 font-medium">Prévisualisation en direct</span>
            </div>

            <div className="p-4 bg-zinc-900 rounded-2xl">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500"></div> Bandeau Rouge (Accueil)
              </div>
              
              {/* Le bandeau rouge réel */}
              <div className="bg-red-600 text-white p-4 rounded-xl shadow-lg border border-red-500">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
                  <div className="flex items-center gap-3 text-sm font-medium">
                    <AlertCircle className="w-5 h-5 shrink-0 text-white" />
                    <span>
                      Le site n'accepte plus de nouvelle inscription et reste accessible aux clients déjà inscrits. Si vous souhaitez vous inscrire connectez vous sur{' '}
                      <a 
                        href={formatRedirectUrl(siteStatus.redirectUrl)}
                        target={isExternalUrl(siteStatus.redirectUrl) ? '_blank' : undefined}
                        rel={isExternalUrl(siteStatus.redirectUrl) ? 'noopener noreferrer' : undefined}
                        className="underline font-bold text-white underline-offset-2 hover:text-red-100"
                      >
                        {formatRedirectUrl(siteStatus.redirectUrl)}
                      </a>
                    </span>
                  </div>
                  <a
                    href={formatRedirectUrl(siteStatus.redirectUrl)}
                    target={isExternalUrl(siteStatus.redirectUrl) ? '_blank' : undefined}
                    rel={isExternalUrl(siteStatus.redirectUrl) ? 'noopener noreferrer' : undefined}
                    className="px-4 py-2 bg-white text-red-700 text-xs font-bold rounded-lg whitespace-nowrap shadow-sm hover:bg-red-50 cursor-pointer"
                  >
                    Se connecter
                  </a>
                </div>
              </div>
            </div>

            {/* RECAPITULATIF DES ACTIONS DU MODE FERMETURE */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Page d'accueil</div>
                <div className="text-sm font-bold text-zinc-800">Bandeau rouge actif</div>
                <p className="text-xs text-zinc-500 mt-1">Avertit immédiatement les visiteurs et redirige les membres existants vers la connexion.</p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Page Connexion / Inscription</div>
                <div className="text-sm font-bold text-zinc-800">Inscriptions bloquées</div>
                <p className="text-xs text-zinc-500 mt-1">Le formulaire de création de compte est désactivé et masqué. Seule la connexion fonctionne.</p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Paiements Stripe</div>
                <div className="text-sm font-bold text-zinc-800">Paiements bloqués</div>
                <p className="text-xs text-zinc-500 mt-1">La page de paiement informe que les inscriptions sont closes et bloque les transactions.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <History className="w-5 h-5" /> Logs de connexion
            </h2>
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Rechercher un log..." 
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>
              <span className="text-xs text-zinc-400 whitespace-nowrap">Dernières 100 sessions</span>
            </div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100">
                    <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Utilisateur</th>
                    <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Connexion</th>
                    <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Dernière activité</th>
                    <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Durée</th>
                    <th className="px-6 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Page actuelle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {logs
                    .filter(l => 
                      (l.email || '').toLowerCase().includes((logSearch || '').toLowerCase()) || 
                      (l.uid || '').toLowerCase().includes((logSearch || '').toLowerCase())
                    )
                    .map(log => (
                      <tr key={log.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-zinc-900">{log.email}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{log.uid}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600">
                          {log.loginTime?.toDate().toLocaleString('fr-FR')}
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600">
                          {log.lastActive?.toDate().toLocaleString('fr-FR')}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-mono text-blue-600 font-bold">
                            {Math.floor(log.duration / 60)}m {log.duration % 60}s
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500 truncate max-w-[150px]" title={log.lastPath || '/'}>
                          {log.lastPath || '/'}
                        </td>
                      </tr>
                    ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 italic">Aucun log de connexion trouvé.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {editingModule && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-zinc-900">{editingModule.id ? 'Modifier le module' : 'Nouveau module'}</h3>
                <button onClick={() => setEditingModule(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Titre</label>
                  <input 
                    type="text" 
                    value={editingModule.title} 
                    onChange={e => setEditingModule({ ...editingModule, title: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Titre (EN)</label>
                  <input 
                    type="text" 
                    value={editingModule.title_en || ''} 
                    onChange={e => setEditingModule({ ...editingModule, title_en: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Description</label>
                  <textarea 
                    value={editingModule.description} 
                    onChange={e => setEditingModule({ ...editingModule, description: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Description (EN)</label>
                  <textarea 
                    value={editingModule.description_en || ''} 
                    onChange={e => setEditingModule({ ...editingModule, description_en: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">URL du PDF (Optionnel)</label>
                  <input 
                    type="text" 
                    value={editingModule.pdfUrl || ''} 
                    onChange={e => setEditingModule({ ...editingModule, pdfUrl: e.target.value })}
                    placeholder="https://example.com/document.pdf"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">URL du PDF (EN) (Optionnel)</label>
                  <input 
                    type="text" 
                    value={editingModule.pdfUrl_en || ''} 
                    onChange={e => setEditingModule({ ...editingModule, pdfUrl_en: e.target.value })}
                    placeholder="https://example.com/document_en.pdf"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={handleSaveModule} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Enregistrer</button>
                  <button onClick={() => setEditingModule(null)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors">Annuler</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {editingCourse && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-4xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-zinc-900">{editingCourse.id ? 'Modifier le cours' : 'Nouveau cours'}</h3>
                <button onClick={() => setEditingCourse(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Titre</label>
                    <input 
                      type="text" 
                      value={editingCourse.title} 
                      onChange={e => setEditingCourse({ ...editingCourse, title: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Titre (EN)</label>
                    <input 
                      type="text" 
                      value={editingCourse.title_en || ''} 
                      onChange={e => setEditingCourse({ ...editingCourse, title_en: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">URL du PDF (Optionnel)</label>
                    <input 
                      type="text" 
                      value={editingCourse.pdfUrl || ''} 
                      onChange={e => setEditingCourse({ ...editingCourse, pdfUrl: e.target.value })}
                      placeholder="https://example.com/document.pdf"
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">URL du PDF (EN) (Optionnel)</label>
                    <input 
                      type="text" 
                      value={editingCourse.pdfUrl_en || ''} 
                      onChange={e => setEditingCourse({ ...editingCourse, pdfUrl_en: e.target.value })}
                      placeholder="https://example.com/document_en.pdf"
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">Contenu (Markdown)</label>
                    <button 
                      onClick={() => setShowCoursePreview(!showCoursePreview)}
                      className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:underline"
                    >
                      {showCoursePreview ? 'Masquer l\'aperçu' : 'Afficher l\'aperçu'}
                    </button>
                  </div>
                  {showCoursePreview ? (
                    <div className="w-full px-6 py-8 bg-zinc-50 border border-zinc-200 rounded-xl min-h-[400px] prose prose-zinc max-w-none overflow-y-auto">
                      <div className="markdown-body">
                        <ReactMarkdown
                          components={{
                            img: ({ node, ...props }) => (
                              <img 
                                {...props} 
                                key={props.src}
                                src={getDirectImageUrl(props.src || '')} 
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  const originalSrc = props.src || '';
                                  if (originalSrc.includes('drive.google.com') || originalSrc.includes('docs.google.com')) {
                                    const fileId = originalSrc.match(/\/d\/([^/]+)/)?.[1] || originalSrc.match(/id=([^&]+)/)?.[1];
                                    if (fileId) {
                                      if (!target.src.includes('uc?export=view')) {
                                        target.src = `https://drive.google.com/uc?export=view&id=${fileId}`;
                                      } else if (!target.src.includes('thumbnail')) {
                                        target.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2500`;
                                      }
                                    }
                                  }
                                }}
                                referrerPolicy="no-referrer" 
                                className="rounded-xl border border-zinc-200 shadow-sm max-w-full h-auto mx-auto block my-8 sharp-image" 
                              />
                            )
                          }}
                        >
                          {editingCourse.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <textarea 
                      value={editingCourse.content} 
                      onChange={e => setEditingCourse({ ...editingCourse, content: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-96 font-mono text-sm"
                      placeholder="# Titre du cours\n\nContenu ici..."
                    />
                  )}
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">Contenu (EN) (Markdown)</label>
                    <button 
                      onClick={() => setShowCoursePreviewEn(!showCoursePreviewEn)}
                      className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:underline"
                    >
                      {showCoursePreviewEn ? 'Masquer l\'aperçu' : 'Afficher l\'aperçu'}
                    </button>
                  </div>
                  {showCoursePreviewEn ? (
                    <div className="w-full px-6 py-8 bg-zinc-50 border border-zinc-200 rounded-xl min-h-[400px] prose prose-zinc max-w-none overflow-y-auto">
                      <div className="markdown-body">
                        <ReactMarkdown
                          components={{
                            img: ({ node, ...props }) => (
                              <img 
                                {...props} 
                                key={props.src}
                                src={getDirectImageUrl(props.src || '')} 
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  const originalSrc = props.src || '';
                                  if (originalSrc.includes('drive.google.com') || originalSrc.includes('docs.google.com')) {
                                    const fileId = originalSrc.match(/\/d\/([^/]+)/)?.[1] || originalSrc.match(/id=([^&]+)/)?.[1];
                                    if (fileId) {
                                      if (!target.src.includes('uc?export=view')) {
                                        target.src = `https://drive.google.com/uc?export=view&id=${fileId}`;
                                      } else if (!target.src.includes('thumbnail')) {
                                        target.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2500`;
                                      }
                                    }
                                  }
                                }}
                                referrerPolicy="no-referrer" 
                                className="rounded-xl border border-zinc-200 shadow-sm max-w-full h-auto mx-auto block my-8 sharp-image" 
                              />
                            )
                          }}
                        >
                          {editingCourse.content_en || ''}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <textarea 
                      value={editingCourse.content_en || ''} 
                      onChange={e => setEditingCourse({ ...editingCourse, content_en: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-96 font-mono text-sm"
                      placeholder="# Course Title\n\nContent here..."
                    />
                  )}
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={handleSaveCourse} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Enregistrer</button>
                  <button onClick={() => setEditingCourse(null)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors">Annuler</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {editingQuestion && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-2xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-zinc-900">{editingQuestion.id ? 'Modifier la question' : 'Nouvelle question'}</h3>
                <button onClick={() => setEditingQuestion(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Question</label>
                  <textarea 
                    value={editingQuestion.text} 
                    onChange={e => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Question (EN)</label>
                  <textarea 
                    value={editingQuestion.text_en || ''} 
                    onChange={e => setEditingQuestion({ ...editingQuestion, text_en: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {editingQuestion.options?.map((opt, idx) => (
                    <div key={idx}>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Option {idx + 1}</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={opt} 
                          onChange={e => {
                            const newOptions = [...(editingQuestion.options || [])];
                            newOptions[idx] = e.target.value;
                            setEditingQuestion({ ...editingQuestion, options: newOptions });
                          }}
                          className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                        <button 
                          onClick={() => setEditingQuestion({ ...editingQuestion, correctAnswer: idx })}
                          className={`p-2 rounded-xl border transition-colors ${editingQuestion.correctAnswer === idx ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-zinc-50 border-zinc-200 text-zinc-400 hover:bg-zinc-100'}`}
                        >
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                      </div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-2 mb-1">Option {idx + 1} (EN)</label>
                      <input 
                        type="text" 
                        value={editingQuestion.options_en?.[idx] || ''} 
                        onChange={e => {
                          const newOptionsEn = [...(editingQuestion.options_en || ['', '', '', ''])];
                          newOptionsEn[idx] = e.target.value;
                          setEditingQuestion({ ...editingQuestion, options_en: newOptionsEn });
                        }}
                        className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Explication (Optionnel)</label>
                  <textarea 
                    value={editingQuestion.explanation} 
                    onChange={e => setEditingQuestion({ ...editingQuestion, explanation: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Explication (EN) (Optionnel)</label>
                  <textarea 
                    value={editingQuestion.explanation_en || ''} 
                    onChange={e => setEditingQuestion({ ...editingQuestion, explanation_en: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-20"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Type de pièce jointe</label>
                    <select 
                      value={editingQuestion.attachmentType || ''} 
                      onChange={e => setEditingQuestion({ ...editingQuestion, attachmentType: e.target.value as 'image' | 'pdf' | undefined })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Aucune</option>
                      <option value="image">Image</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">URL de la pièce jointe</label>
                    <input 
                      type="url" 
                      value={editingQuestion.attachmentUrl || ''} 
                      onChange={e => setEditingQuestion({ ...editingQuestion, attachmentUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">URL de la pièce jointe (EN)</label>
                    <input 
                      type="url" 
                      value={editingQuestion.attachmentUrl_en || ''} 
                      onChange={e => setEditingQuestion({ ...editingQuestion, attachmentUrl_en: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {editingQuestion.attachmentUrl && (editingQuestion.attachmentType === 'image' || editingQuestion.attachmentUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) || editingQuestion.attachmentUrl.includes('drive.google.com') || editingQuestion.attachmentUrl.includes('docs.google.com')) && (
                      <div className="mt-2 p-4 border border-zinc-200 rounded-xl bg-zinc-50">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Aperçu de l'image :</p>
                        <div className="relative min-h-[100px] flex items-center justify-center bg-white rounded-lg border border-zinc-100 overflow-hidden group">
                          <img 
                            key={editingQuestion.attachmentUrl}
                            src={getDirectImageUrl(editingQuestion.attachmentUrl)} 
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              const url = editingQuestion.attachmentUrl || '';
                              if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
                                const fileId = url.match(/\/d\/([^/]+)/)?.[1] || url.match(/id=([^&]+)/)?.[1];
                                if (fileId) {
                                  if (!target.src.includes('uc?export=view')) {
                                    target.src = `https://drive.google.com/uc?export=view&id=${fileId}`;
                                  } else if (!target.src.includes('thumbnail')) {
                                    target.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2500`;
                                  }
                                }
                              }
                            }}
                            alt="Aperçu" 
                            className="max-h-80 w-auto object-contain sharp-image" 
                            referrerPolicy="no-referrer"
                          />
                          <a 
                            href={getDirectImageUrl(editingQuestion.attachmentUrl)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur shadow-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white text-zinc-600 hover:text-blue-600"
                            title="Ouvrir l'image originale"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                        <p className="mt-2 text-[10px] text-zinc-400 italic">
                          Note : Si l'image ne s'affiche pas, vérifiez que l'URL est directe et publique.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={handleSaveQuestion} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Enregistrer</button>
                  <button onClick={() => setEditingQuestion(null)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors">Annuler</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {editingQuiz && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-zinc-900">{editingQuiz.id ? 'Modifier le quiz' : 'Nouveau quiz'}</h3>
                <button onClick={() => setEditingQuiz(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Titre</label>
                  <input 
                    type="text" 
                    value={editingQuiz.title} 
                    onChange={e => setEditingQuiz({ ...editingQuiz, title: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Titre (EN)</label>
                  <input 
                    type="text" 
                    value={editingQuiz.title_en || ''} 
                    onChange={e => setEditingQuiz({ ...editingQuiz, title_en: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Description</label>
                  <textarea 
                    value={editingQuiz.description} 
                    onChange={e => setEditingQuiz({ ...editingQuiz, description: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Description (EN)</label>
                  <textarea 
                    value={editingQuiz.description_en || ''} 
                    onChange={e => setEditingQuiz({ ...editingQuiz, description_en: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Catégorie</label>
                  <input 
                    type="text" 
                    value={editingQuiz.category || ''} 
                    onChange={e => setEditingQuiz({ ...editingQuiz, category: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Catégorie (EN)</label>
                  <input 
                    type="text" 
                    value={editingQuiz.category_en || ''} 
                    onChange={e => setEditingQuiz({ ...editingQuiz, category_en: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={handleSaveQuiz} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Enregistrer</button>
                  <button onClick={() => setEditingQuiz(null)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors">Annuler</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {editingTestimonial && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-zinc-900">{editingTestimonial.id ? 'Modifier le témoignage' : 'Nouveau témoignage'}</h3>
                <button onClick={() => setEditingTestimonial(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Auteur</label>
                  <input 
                    type="text" 
                    value={editingTestimonial.author} 
                    onChange={e => setEditingTestimonial({ ...editingTestimonial, author: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="ex: Maxime Laudat"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Rôle / Compagnie</label>
                  <input 
                    type="text" 
                    value={editingTestimonial.role} 
                    onChange={e => setEditingTestimonial({ ...editingTestimonial, role: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="ex: OPL Air France"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Rôle / Compagnie (EN)</label>
                  <input 
                    type="text" 
                    value={editingTestimonial.role_en || ''} 
                    onChange={e => setEditingTestimonial({ ...editingTestimonial, role_en: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="ex: First Officer Air France"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Texte du témoignage</label>
                  <textarea 
                    value={editingTestimonial.text} 
                    onChange={e => setEditingTestimonial({ ...editingTestimonial, text: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-32"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Texte du témoignage (EN)</label>
                  <textarea 
                    value={editingTestimonial.text_en || ''} 
                    onChange={e => setEditingTestimonial({ ...editingTestimonial, text_en: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-32"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Note (1-5)</label>
                    <input 
                      type="number" 
                      min="1"
                      max="5"
                      value={editingTestimonial.rating} 
                      onChange={e => setEditingTestimonial({ ...editingTestimonial, rating: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Ordre</label>
                    <input 
                      type="number" 
                      value={editingTestimonial.order} 
                      onChange={e => setEditingTestimonial({ ...editingTestimonial, order: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={handleSaveTestimonial} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Enregistrer</button>
                  <button onClick={() => setEditingTestimonial(null)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors">Annuler</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showConfirmDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center"
            >
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${showConfirmDelete.type === 'seedTestimonials' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                {showConfirmDelete.type === 'seedTestimonials' ? <Database className="w-8 h-8" /> : <Trash2 className="w-8 h-8" />}
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">
                {showConfirmDelete.type === 'seedTestimonials' ? 'Confirmer l\'importation' : 'Confirmer la suppression'}
              </h3>
              <p className="text-zinc-500 mb-8">
                {showConfirmDelete.type === 'module' 
                  ? 'Voulez-vous vraiment supprimer ce module et tous ses cours ? Cette action est irréversible.' 
                  : showConfirmDelete.type === 'course'
                  ? 'Voulez-vous vraiment supprimer ce cours ? Cette action est irréversible.'
                  : showConfirmDelete.type === 'user'
                  ? 'Voulez-vous vraiment supprimer cet utilisateur ? Cette action supprimera également son compte d\'authentification.'
                  : showConfirmDelete.type === 'seedTestimonials'
                  ? 'Voulez-vous importer tous les témoignages (59) ? Attention, cela remplacera les témoignages existants.'
                  : showConfirmDelete.type === 'quiz'
                  ? 'Voulez-vous vraiment supprimer ce quiz et toutes ses questions ? Cette action est irréversible.'
                  : 'Voulez-vous vraiment supprimer TOUS les modules et cours ? Cette action est irréversible.'}
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    console.log("Delete button clicked in modal, type:", showConfirmDelete.type);
                    if (showConfirmDelete.type === 'module') {
                      handleDeleteModule(showConfirmDelete.id!);
                    } else if (showConfirmDelete.type === 'course') {
                      handleDeleteCourse(showConfirmDelete.moduleId!, showConfirmDelete.id!);
                    } else if (showConfirmDelete.type === 'user') {
                      console.log("Calling handleDeleteUser for ID:", showConfirmDelete.id);
                      handleDeleteUser(showConfirmDelete.id!);
                    } else if (showConfirmDelete.type === 'seedTestimonials') {
                      seedTestimonials();
                    } else if (showConfirmDelete.type === 'quiz') {
                      handleDeleteQuiz(showConfirmDelete.id!);
                    } else {
                      handleClearAll();
                    }
                  }}
                  disabled={isDeleting || isSeeding}
                  className={`flex-1 py-3 font-bold text-white rounded-xl transition-colors disabled:opacity-50 ${
                    showConfirmDelete.type === 'seedTestimonials' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isDeleting || isSeeding ? 'En cours...' : 'Confirmer'}
                </button>
                <button onClick={() => setShowConfirmDelete(null)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors">Annuler</button>
              </div>
            </motion.div>
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-zinc-200 p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900">Synchronisation des Comptes</h2>
                  <p className="text-zinc-500">Gérez les comptes qui pourraient être bloqués dans le système d'authentification.</p>
                </div>
              </div>

              <div className="space-y-4 text-zinc-600">
                <p>
                  Si vous avez supprimé un utilisateur mais que son email est toujours considéré comme "déjà utilisé" lors d'une nouvelle inscription, 
                  cela signifie que le compte existe encore dans le système d'authentification Firebase (Auth) même si son profil a été effacé de la base de données.
                </p>
                
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="text-amber-600 shrink-0" size={20} />
                  <div>
                    <p className="text-sm font-medium text-amber-900">Action Requise</p>
                    <p className="text-sm text-amber-700 mt-1">
                      En raison de restrictions de sécurité sur le serveur, vous devez parfois supprimer manuellement ces comptes "orphelins" directement dans votre console Firebase.
                    </p>
                  </div>
                </div>

                <div className="pt-4">
                  <a 
                    href="https://console.firebase.google.com/project/aviationonline-947d1/authentication/users" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
                  >
                    Ouvrir la Console Firebase Auth
                    <Plus size={18} className="rotate-45" />
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                  <Database size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900">Réinitialisation des Données</h2>
                  <p className="text-zinc-500">Restaurez les cours et modules par défaut si vous les avez supprimés par erreur.</p>
                </div>
              </div>

              <div className="space-y-4 text-zinc-600">
                <p>
                  Cette action va recréer les modules de base (PSV, Radionavigation, etc.) et leurs cours associés. 
                  Elle ne supprimera pas les cours que vous avez créés vous-même, mais elle rajoutera ceux par défaut.
                </p>
                
                <div className="pt-4 flex flex-col gap-4">
                  <button 
                    onClick={seedInitialData}
                    disabled={isSeeding}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 justify-center"
                  >
                    <Database size={18} />
                    {isSeeding ? 'Restauration en cours...' : 'Réinitialiser les cours par défaut'}
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-zinc-200 p-8 mt-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                  <Globe size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900">Traduction Automatique</h2>
                  <p className="text-zinc-500">Traduisez automatiquement les données manquantes en anglais.</p>
                </div>
              </div>

              <div className="space-y-4 text-zinc-600">
                <p>
                  Cette action va parcourir tous vos témoignages, quiz et questions. Si une traduction en anglais est manquante, 
                  elle sera générée automatiquement à l'aide de l'IA.
                </p>
                
                <div className="pt-4">
                  <button 
                    onClick={translateMissingContent}
                    disabled={isTranslating}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                  >
                    <Globe size={18} />
                    {isTranslating ? 'Traduction en cours...' : 'Traduire les données manquantes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {showCreateUserModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                  <UserPlus className="w-6 h-6 text-blue-600" /> Nouvel élève
                </h3>
                <button onClick={() => setShowCreateUserModal(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Prénom</label>
                    <input 
                      type="text" 
                      required
                      value={newUserForm.firstName} 
                      onChange={e => setNewUserForm({ ...newUserForm, firstName: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Nom</label>
                    <input 
                      type="text" 
                      required
                      value={newUserForm.lastName} 
                      onChange={e => setNewUserForm({ ...newUserForm, lastName: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Email</label>
                  <input 
                    type="email" 
                    required
                    value={newUserForm.email} 
                    onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Mot de passe provisoire</label>
                  <input 
                    type="text" 
                    required
                    value={newUserForm.password} 
                    onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Vous devrez lui communiquer ces accès. Il pourra changer son mot de passe ensuite.</p>
                </div>
                
                <div className="flex gap-4 pt-4">
                  <button 
                    type="submit"
                    disabled={isCreatingUser} 
                    className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 disabled:opacity-50"
                  >
                    {isCreatingUser ? 'Création...' : 'Créer l\'accès'}
                  </button>
                  <button type="button" onClick={() => setShowCreateUserModal(false)} className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors">Annuler</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

      </AnimatePresence>
    </div>
  );
}
