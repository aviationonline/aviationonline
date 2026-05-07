import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType, testConnection } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../App';
import { BookOpen, ChevronRight, Lock, CheckCircle2, Clock, ChevronDown, ChevronUp, Download, FileText, X, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import firebaseConfig from '../../firebase-applet-config.json';
import { useLanguage } from '../LanguageContext';

interface Module {
  id: string;
  title: string;
  title_en?: string;
  description: string;
  description_en?: string;
  pdfUrl?: string;
  order: number;
}

interface Course {
  id: string;
  moduleId: string;
  title: string;
  title_en?: string;
  order: number;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSuccess, setShowSuccess] = useState(searchParams.get('payment') === 'success');
  const [modules, setModules] = useState<Module[]>([]);
  const [courses, setCourses] = useState<Record<string, Course[]>>({});
  const [loading, setLoading] = useState(true);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error', debug?: any } | null>(null);
  const [dbTestStatus, setDbTestStatus] = useState<{ type: 'success' | 'error' | 'loading', text: string } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success', debug?: any) => {
    setNotification({ message, type, debug });
    if (type === 'success') {
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleCheckPayment = async () => {
    console.log("handleCheckPayment triggered for UID:", profile?.uid);
    if (!profile?.uid) {
      showNotification(language === 'en' ? "Error: User not identified." : "Erreur : Utilisateur non identifié.", 'error');
      return;
    }
    setCheckingPayment(true);
    try {
      console.log("Sending check-payment-status request for:", { userId: profile.uid, email: profile.email });
      const response = await fetch('/api/check-payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.uid, email: profile.email }),
      });
      
      if (!response.ok) {
        let errorDetail = language === 'en' ? `Server error: ${response.status}` : `Erreur serveur: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) errorDetail = errorData.error;
        } catch (e) {
          // Fallback to text if not JSON
          try {
            const text = await response.text();
            if (text) errorDetail = text;
          } catch (textErr) {}
        }
        console.error("API Error Response:", errorDetail);
        throw new Error(errorDetail);
      }

      const data = await response.json();
      console.log("API Success Response:", data);
      
      if (data.success) {
        showNotification(language === 'en' ? data.message_en || data.message : data.message, 'success');
        setShowSuccess(true);
        // Force a page reload after a short delay to ensure profile is refreshed
        setTimeout(() => window.location.reload(), 2000);
      } else {
        showNotification(language === 'en' ? data.message_en || "No payment found." : data.message || "Aucun paiement trouvé.", 'error', data.debug);
      }
    } catch (error: any) {
      console.error("Check Payment Error:", error instanceof Error ? error.message : String(error));
      const errorMessage = error instanceof Error ? error.message : (language === 'en' ? "Unknown error" : "Erreur inconnue");
      showNotification(language === 'en' ? `Error during payment verification: ${errorMessage}` : `Erreur lors de la vérification du paiement : ${errorMessage}`, 'error');
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleAdminForceActivate = async () => {
    if (!profile?.uid) return;
    if (!confirm(t('dashboard.confirm.forceActivate'))) return;
    
    setCheckingPayment(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/activate-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: profile.uid, 
          authHeader: `Bearer ${token}` 
        }),
      });
      const data = await response.json();
      if (data.success) {
        showNotification(data.message, 'success');
        setTimeout(() => window.location.reload(), 2000);
      } else {
        showNotification(data.error || t('dashboard.error.forceActivate'), 'error');
      }
    } catch (error) {
      console.error("Admin Force Activate Error:", error instanceof Error ? error.message : String(error));
      showNotification(t('dashboard.error.forceActivate'), 'error');
    } finally {
      setCheckingPayment(false);
    }
  };

  const colors = [
    { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-blue-100', hover: 'group-hover:bg-blue-500', hoverText: 'group-hover:text-white' },
    { bg: 'bg-emerald-50', text: 'text-emerald-600', iconBg: 'bg-emerald-100', hover: 'group-hover:bg-emerald-500', hoverText: 'group-hover:text-white' },
    { bg: 'bg-indigo-50', text: 'text-indigo-600', iconBg: 'bg-indigo-100', hover: 'group-hover:bg-indigo-500', hoverText: 'group-hover:text-white' },
    { bg: 'bg-violet-50', text: 'text-violet-600', iconBg: 'bg-violet-100', hover: 'group-hover:bg-violet-500', hoverText: 'group-hover:text-white' },
    { bg: 'bg-amber-50', text: 'text-amber-600', iconBg: 'bg-amber-100', hover: 'group-hover:bg-amber-500', hoverText: 'group-hover:text-white' },
    { bg: 'bg-rose-50', text: 'text-rose-600', iconBg: 'bg-rose-100', hover: 'group-hover:bg-rose-500', hoverText: 'group-hover:text-white' },
  ];

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  useEffect(() => {
    // Automatically check payment if redirected from Stripe with success
    if (searchParams.get('payment') === 'success' && profile && !profile.isPaid) {
      console.log("Detected payment success redirect, triggering automatic check in 3 seconds...");
      const timer = setTimeout(() => {
        handleCheckPayment();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, profile]);

  useEffect(() => {
    const q = query(collection(db, 'modules'));
    const courseUnsubscribes: Record<string, () => void> = {};

    const unsubscribeModules = onSnapshot(q, (snapshot) => {
      const mods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Module))
        .sort((a, b) => (a.order || 999) - (b.order || 999));
      setModules(mods);
      
      // Clean up old course listeners that are no longer in the modules list
      const currentModuleIds = new Set(mods.map(m => m.id));
      Object.keys(courseUnsubscribes).forEach(id => {
        if (!currentModuleIds.has(id)) {
          courseUnsubscribes[id]();
          delete courseUnsubscribes[id];
        }
      });

      // Set up listeners for new modules
      mods.forEach(mod => {
        if (!courseUnsubscribes[mod.id]) {
          const cq = query(collection(db, `modules/${mod.id}/courses`));
          courseUnsubscribes[mod.id] = onSnapshot(cq, (cSnapshot) => {
            setCourses(prev => ({
              ...prev,
              [mod.id]: cSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course))
                .sort((a, b) => (a.order || 999) - (b.order || 999))
            }));
          }, (err) => handleFirestoreError(err, OperationType.LIST, `modules/${mod.id}/courses`));
        }
      });
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'modules'));

    return () => {
      unsubscribeModules();
      Object.values(courseUnsubscribes).forEach(unsub => unsub());
    };
  }, []);

  if (loading) return <div className="p-8 text-center">{t('dashboard.loading')}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 p-6 rounded-3xl shadow-2xl flex flex-col gap-4 max-w-md ${
              notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              {notification.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <X className="w-6 h-6" />}
              <p className="font-bold">{notification.message}</p>
              <button onClick={() => setNotification(null)} className="ml-auto p-1 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {notification.debug && (profile?.role === 'admin' || (profile?.email === 'ident@aviationonline.fr' || profile?.email === 'contact@aviationonline.net')) && (
              <div className="mt-2 p-3 bg-black/20 rounded-xl text-[10px] font-mono overflow-auto max-h-60">
                <div className="flex justify-between items-center mb-1 border-b border-white/20 pb-1">
                  <p className="font-bold">DEBUG INFO (Admin Only)</p>
                  <button 
                    onClick={() => {
                      const getCircularReplacer = () => {
                        const seen = new WeakSet();
                        return (key: string, value: any) => {
                          if (typeof value === "object" && value !== null) {
                            if (seen.has(value)) {
                              return "[Circular]";
                            }
                            seen.add(value);
                          }
                          return value;
                        };
                      };
                      navigator.clipboard.writeText(JSON.stringify(notification.debug, getCircularReplacer(), 2));
                      alert(t('dashboard.alert.debugCopied'));
                    }}
                    className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/20 transition-colors"
                  >
                    Copier
                  </button>
                </div>
                <p>Mode: {notification.debug.stripeMode}</p>
                <p>Checked: {notification.debug.sessionsChecked} sessions</p>
                <div className="mt-2">
                  <p className="opacity-70">Dernières sessions Stripe :</p>
                  {notification.debug.lastSessions?.map((s: any, i: number) => (
                    <div key={i} className="mt-1 border-t border-white/10 pt-1">
                      <p className={s.paid ? "text-emerald-300" : "text-white/50"}>
                        {s.paid ? "✅ PAYÉ" : "❌ NON PAYÉ"} - {s.email}
                      </p>
                      <p className="opacity-50 text-[8px]">ID: {s.id}</p>
                      <p className="opacity-50 text-[8px]">User: {s.userId}</p>
                      <p className="opacity-50 text-[8px]">Date: {s.created}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`mb-8 p-6 rounded-3xl shadow-lg flex items-center justify-between gap-4 ${
              profile?.isPaid ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-blue-600 text-white shadow-blue-200'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                {profile?.isPaid ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6 animate-pulse" />}
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {profile?.isPaid ? t('dashboard.payment.success.title') : t('dashboard.payment.pending.title')}
                </h3>
                <p className="text-white/80 text-sm">
                  {profile?.isPaid 
                    ? t('dashboard.payment.success.desc') 
                    : t('dashboard.payment.pending.desc')}
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                setShowSuccess(false);
                setSearchParams({});
              }}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="mb-8 md:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-2">{t('dashboard.title')}</h1>
          <p className="text-zinc-500 text-sm md:text-base">
            {profile?.isPaid ? t('dashboard.status.paid') : t('dashboard.status.unpaid')}
          </p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all"
        >
          <Clock className="w-4 h-4" />
          Actualiser
        </button>
      </header>

      {!profile?.isPaid && profile?.role !== 'admin' && (
        <div className="bg-blue-600 rounded-3xl p-6 md:p-8 mb-12 text-white flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-xl md:text-2xl font-bold mb-2">Débloquez votre potentiel IFR</h2>
            <p className="opacity-90 text-sm md:text-base">Accédez à l'intégralité des cours, schémas et procédures pour 79€ seulement.</p>
            <button 
              onClick={handleCheckPayment}
              disabled={checkingPayment}
              className="mt-4 text-xs font-bold underline opacity-75 hover:opacity-100 transition-opacity flex items-center gap-2 mx-auto md:mx-0"
            >
              {checkingPayment ? t('dashboard.btn.checking') : t('dashboard.btn.alreadyPaid')}
            </button>
          </div>
          <Link to="/payment" className="w-full md:w-auto text-center px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-zinc-100 transition-colors whitespace-nowrap">
            Débloquer maintenant
          </Link>
        </div>
      )}

      {(profile?.email === 'ident@aviationonline.fr' || profile?.email === 'contact@aviationonline.net') && (
        <div className="mb-8 p-6 bg-zinc-900 rounded-3xl text-white">
          <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-4">
            <Shield className="w-6 h-6 text-rose-400" />
            <h2 className="text-xl font-bold">Zone de Debug Administrateur</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1 text-sm font-mono opacity-80">
              <p><span className="text-zinc-500">UID:</span> {profile.uid}</p>
              <p><span className="text-zinc-500">Email:</span> {profile.email}</p>
              <p><span className="text-zinc-500">isPaid:</span> {String(profile.isPaid)}</p>
              <p><span className="text-zinc-500">Role:</span> {profile.role}</p>
              <p><span className="text-zinc-500">DB ID:</span> {firebaseConfig.firestoreDatabaseId || '(default)'}</p>
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={async () => {
                  console.log("Dashboard Test DB button clicked");
                  setDbTestStatus({ type: 'loading', text: 'Vérification en cours...' });
                  try {
                    await testConnection();
                    setDbTestStatus({ type: 'success', text: '✅ Connexion réussie !' });
                  } catch (e: any) {
                    console.error("Dashboard Test DB Error:", e instanceof Error ? e.message : String(e));
                    setDbTestStatus({ type: 'error', text: '❌ Erreur : ' + (e.message || 'Inconnue') });
                  }
                }}
                className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                [Test DB] - Vérifier la base
              </button>
              {dbTestStatus && (
                <div className={`p-2 rounded-lg text-[10px] font-bold ${
                  dbTestStatus.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 
                  dbTestStatus.type === 'error' ? 'bg-rose-500/20 text-rose-400' : 
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {dbTestStatus.text}
                </div>
              )}
              <button 
                onClick={() => console.log("DEBUG PROFILE:", profile)}
                className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                [Log Profile] - Voir console
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleAdminForceActivate}
                disabled={checkingPayment}
                className="w-full px-4 py-2 bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                [FORCER ACTIVATION] - Débloquer ce compte
              </button>
              <p className="text-[10px] text-zinc-500 italic">
                Utilisez ce bouton si Stripe ne confirme pas le paiement automatiquement.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {modules.map((module, idx) => {
          const color = colors[idx % colors.length];
          return (
            <motion.div 
              key={module.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow h-fit"
            >
              <button 
                onClick={() => toggleModule(module.id)}
                className="w-full text-left p-8 border-b border-zinc-100 hover:bg-zinc-50 transition-colors group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 ${color.iconBg} rounded-xl flex items-center justify-center group-hover:bg-zinc-900 transition-colors`}>
                    <BookOpen className={`w-6 h-6 ${color.text} group-hover:text-white`} />
                  </div>
                  <div className="flex items-center gap-3">
                    {!profile?.isPaid && profile?.role !== 'admin' && (
                      <span className="flex items-center gap-1 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                        <Lock className="w-3 h-3" /> Verrouillé
                      </span>
                    )}
                    {expandedModules.has(module.id) ? (
                      <ChevronUp className="w-5 h-5 text-zinc-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-zinc-400" />
                    )}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-zinc-900 mb-2 group-hover:text-zinc-900 transition-colors">{language === 'en' && module.title_en ? module.title_en : module.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{language === 'en' && module.description_en ? module.description_en : module.description}</p>
              </button>
              
              <AnimatePresence>
                {expandedModules.has(module.id) && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="bg-zinc-50 p-6 border-t border-zinc-100">
                      {module.pdfUrl && (profile?.isPaid || profile?.role === 'admin') && (
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <h5 className="text-sm font-bold text-blue-900">Support de cours PDF</h5>
                              <p className="text-xs text-blue-700 font-medium flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
                                Indispensable pour l'étude du module
                              </p>
                            </div>
                          </div>
                          <a 
                            href={module.pdfUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <Download className="w-3.5 h-3.5" /> {t('dashboard.course.pdf')}
                          </a>
                        </div>
                      )}
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Cours du module</h4>
                      <div className="space-y-3">
                        {courses[module.id]?.map((course) => (
                          <Link 
                            key={course.id}
                            to={profile?.isPaid || profile?.role === 'admin' ? `/course/${module.id}/${course.id}` : '/payment'}
                            className="flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-xl hover:border-zinc-900 hover:shadow-sm transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 ${color.bg} rounded-lg flex items-center justify-center text-xs font-bold ${color.text} group-hover:bg-zinc-900 group-hover:text-white transition-all`}>
                                {course.order}
                              </div>
                              <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">{language === 'en' && course.title_en ? course.title_en : course.title}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900 transition-colors" />
                          </Link>
                        ))}
                        {(!courses[module.id] || courses[module.id].length === 0) && (
                          <p className="text-xs text-zinc-400 italic">Aucun cours disponible pour le moment.</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
