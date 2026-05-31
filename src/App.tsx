import PreparationIREASA from './pages/PreparationIREASA';
import FormationIFR from './pages/FormationIFR';
import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db, googleProvider, OperationType, handleFirestoreError } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, query, orderBy, onSnapshot, getDocFromServer } from 'firebase/firestore';
import { LogIn, LogOut, BookOpen, Shield, CreditCard, Menu, X, ChevronRight, Plane, Radio, Map, FileText, Settings, Users, AlertCircle, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import CourseView from './pages/CourseView';
import Payment from './pages/Payment';
import LegalMentions from './pages/LegalMentions';
import TermsOfService from './pages/TermsOfService';
import QCM from './pages/QCM';
import Testimonials from './pages/Testimonials';
import { LanguageProvider, useLanguage } from './LanguageContext';

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

export interface UserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address: string;
  zipCode: string;
  city: string;
  country: string;
  role: 'student' | 'admin';
  isPaid: boolean;
  createdAt: Timestamp;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    // Safety timeout to prevent getting stuck on loading screen
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.warn("Auth loading timed out, forcing display");
        if ((auth.currentUser?.email === 'ident@aviationonline.fr' || auth.currentUser?.email === 'contact@aviationonline.net')) {
          console.log("Forcing virtual admin profile due to timeout");
          setProfile({
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            firstName: 'Admin',
            lastName: 'Master',
            address: '',
            zipCode: '',
            city: '',
            country: 'France',
            role: 'admin',
            isPaid: true,
            createdAt: Timestamp.now()
          });
        }
        setLoading(false);
      }
    }, 5000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setError(null);
      if (user) {
        console.log("Logged in as:", user.email, "UID:", user.uid, "Email Verified:", user.emailVerified);
      } else {
        console.log("No user logged in");
      }
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        // Listen to user profile in real-time
        unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), async (userDoc) => {
          try {
            console.log("Profile snapshot received for", user.email, ". Exists:", userDoc.exists());
            if (userDoc.exists()) {
              const data = userDoc.data();
              console.log("Profile data:", data);
              const currentProfile = {
                ...data,
                isPaid: !!data.isPaid // Ensure it's a boolean
              } as UserProfile;
              const isAdminEmail = (user.email === 'ident@aviationonline.fr' || user.email === 'contact@aviationonline.net');
              
              if (isAdminEmail && (currentProfile.role !== 'admin' || !currentProfile.isPaid)) {
                console.log("Forcing admin role for", user.email);
                const updatedProfile = { 
                  ...currentProfile, 
                  role: 'admin' as const, 
                  isPaid: true,
                  firstName: currentProfile.firstName || 'Admin',
                  lastName: currentProfile.lastName || 'Aviation',
                  address: currentProfile.address || 'N/A',
                  zipCode: currentProfile.zipCode || '00000',
                  city: currentProfile.city || 'N/A',
                  country: currentProfile.country || 'France'
                };
                await setDoc(doc(db, 'users', user.uid), updatedProfile);
                setProfile(updatedProfile);
              } else {
                setProfile(currentProfile);
              }
            } else {
              // Profile does not exist (maybe deleted by admin)
              console.log("Profile does not exist for", user.email, "- logging out");
              
              // Only create a new profile automatically if it's the master admin
              const isAdminEmail = (user.email === 'ident@aviationonline.fr' || user.email === 'contact@aviationonline.net');
              if (isAdminEmail) {
                const [firstName, ...lastNameParts] = (user.displayName || 'Utilisateur').split(' ');
                const lastName = lastNameParts.join(' ') || 'Inconnu';
                
                const newProfile: UserProfile = {
                  uid: user.uid,
                  email: user.email || '',
                  firstName,
                  lastName,
                  address: '',
                  zipCode: '',
                  city: '',
                  country: '',
                  role: 'admin',
                  isPaid: true,
                  createdAt: Timestamp.now(),
                };

                try {
                  await setDoc(doc(db, 'users', user.uid), newProfile);
                  console.log("Admin profile created successfully");
                  setProfile(newProfile);
                } catch (setErr: any) {
                  console.error("Failed to create admin profile:", setErr instanceof Error ? setErr.message : String(setErr));
                  setProfile(newProfile); // Grant access in state anyway
                }
              } else {
                // For regular users, if their profile is gone, they must be logged out
                // BUT wait! If they just signed up, the profile might not be created yet.
                const creationTime = new Date(user.metadata.creationTime || '').getTime();
                const now = Date.now();
                const isNewUser = (now - creationTime) < 10000; // 10 seconds

                if (isNewUser) {
                  console.log("New user detected via Google Auth, creating profile...");
                  const [firstName, ...lastNameParts] = (user.displayName || 'Pilote').split(' ');
                  const lastName = lastNameParts.join(' ') || '';
                  const newProfile: UserProfile = {
                    uid: user.uid,
                    email: user.email || '',
                    firstName,
                    lastName,
                    address: '',
                    zipCode: '',
                    city: '',
                    country: '',
                    role: 'student',
                    isPaid: false,
                    createdAt: Timestamp.now(),
                  };
                  
                  try {
                    await setDoc(doc(db, 'users', user.uid), newProfile);
                    setProfile(newProfile);
                  } catch (e) {
                    console.error("Failed to auto-create Google Auth profile:", e);
                    setError(t('auth.error.sync'));
                  }
                  
                  setLoading(false);
                  clearTimeout(timeoutId);
                  return;
                } else {
                  console.log("Existing user without profile, logging out");
                  setProfile(null);
                  await auth.signOut();
                  setError(t('auth.error.deleted'));
                }
              }
            }
          } catch (err: any) {
            console.error("Profile sync error:", err instanceof Error ? err.message : String(err));
            setError(err.message || t('auth.error.sync'));
          } finally {
            // Only set loading to false if we have a profile or an error, 
            // or if we're not waiting for a new user's profile to be created
            const creationTime = new Date(user.metadata.creationTime || '').getTime();
            const isNewUser = (Date.now() - creationTime) < 10000;
            if (userDoc.exists() || !isNewUser || error) {
              setLoading(false);
              clearTimeout(timeoutId);
            }
          }
        }, (err) => {
          console.error("Profile snapshot error:", err instanceof Error ? err.message : String(err));
          const isAdminEmail = (user.email === 'ident@aviationonline.fr' || user.email === 'contact@aviationonline.net');
          if (isAdminEmail) {
            console.log("Admin profile read failed, but attempting to proceed as admin");
            setProfile({
              uid: user.uid,
              email: user.email || '',
              firstName: 'Admin',
              lastName: 'Aviation',
              address: '',
              zipCode: '',
              city: '',
              country: '',
              role: 'admin',
              isPaid: true,
              createdAt: Timestamp.now(),
            });
            setLoading(false);
            clearTimeout(timeoutId);
          } else {
            setError(t('auth.error.read'));
            setLoading(false);
            clearTimeout(timeoutId);
          }
        });
      } else {
        setProfile(null);
        setLoading(false);
        clearTimeout(timeoutId);
      }
    }, (err) => {
      console.error("Auth state change error:", err instanceof Error ? err.message : String(err));
      setError(t('auth.error.auth'));
      setLoading(false);
      clearTimeout(timeoutId);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!user || !profile) return;

    const logId = `${user.uid}_${Date.now()}`;
    const logRef = doc(db, 'connection_logs', logId);
    const loginTime = Timestamp.now();

    const startLogging = async () => {
      try {
        await setDoc(logRef, {
          uid: user.uid,
          email: user.email,
          loginTime,
          lastActive: loginTime,
          duration: 0
        });
      } catch (e) {
        // Silent fail for logs to not block user
        console.warn("Logging failed", e);
      }
    };

    startLogging();

    const interval = setInterval(async () => {
      try {
        const now = Timestamp.now();
        const durationSeconds = Math.floor((now.toMillis() - loginTime.toMillis()) / 1000);
        await setDoc(logRef, {
          lastActive: now,
          duration: durationSeconds,
          lastPath: window.location.pathname
        }, { merge: true });
      } catch (e) {
        console.warn("Log update failed", e);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [user, profile]);

  const signIn = async () => {
    try {
      setError(null);
      if (window !== window.top) {
        alert(language === 'fr' 
          ? "La connexion Google peut être bloquée dans cet aperçu. Si cela échoue, ouvrez l'application dans un nouvel onglet ou utilisez votre email." 
          : "Google login might be blocked in this preview. If it fails, open the app in a new tab or use your email.");
      }
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Sign in error:", err instanceof Error ? err.message : String(err));
      setError(err?.message?.includes('Cross-Origin') || err?.message?.includes('popup')
        ? (language === 'fr' ? "Veuillez ouvrir l'application dans un nouvel onglet pour utiliser la connexion Google." : "Please open the app in a new tab to use Google Sign-In.")
        : t('auth.error.google'));
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      console.error("Logout error:", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const ProtectedRoute = ({ children, requirePaid = false, requireAdmin = false }: { children: React.ReactNode, requirePaid?: boolean, requireAdmin?: boolean }) => {
  const { user, profile, loading, error } = useAuth();
  const { t } = useLanguage();
  
  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-4 text-center bg-zinc-50">
        <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-rose-600" />
        </div>
        <h1 className="text-xl font-bold text-zinc-900 mb-2">{t('app.error.title')}</h1>
        <p className="text-zinc-600 max-w-md mb-8">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
        >
          {t('app.error.retry')}
        </button>
      </div>
    );
  }

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-zinc-50">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-zinc-500 font-medium">{t('app.loading')}</p>
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  if (requireAdmin && profile?.role !== 'admin') return <Navigate to="/dashboard" />;
  if (requirePaid && !profile?.isPaid && profile?.role !== 'admin') return <Navigate to="/payment" />;
  return <>{children}</>;
};

const Navbar = () => {
  const { user, profile, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showEnTooltip, setShowEnTooltip] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-50 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100 group-hover:scale-105 transition-transform duration-300">
                <Plane className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-zinc-900 leading-none">AVIATION ONLINE</span>
                <span className="text-[10px] font-bold text-blue-600 tracking-[0.2em] mt-1 uppercase"></span>
              </div>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <div className="flex items-center gap-6">
              {[
                { path: '/', label: t('nav.home') },
                { path: '/testimonials', label: t('nav.testimonials') },
                { path: '/formation-ifr-en-ligne', label: 'Formation IFR' },
                { path: '/preparation-ir-easa', label: 'IR EASA' },
                { path: '/dashboard', label: t('nav.courses'), protected: true },
              ].map((link) => (
                (!link.protected || user) && (
                  <Link 
                    key={link.path}
                    to={link.path} 
                    className={`text-sm font-semibold transition-colors relative py-1 ${
                      location.pathname === link.path ? 'text-blue-600' : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    {link.label}
                    {location.pathname === link.path && (
                      <motion.div layoutId="nav-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                    )}
                  </Link>
                )
              ))}
            </div>

            {user && (
              <div className="flex items-center gap-6 border-l border-zinc-200 pl-6">
                {(profile?.isPaid || profile?.role === 'admin') && (
                  <Link to="/qcm" className={`text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                    location.pathname === '/qcm' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100'
                  }`}>
                    <Radio className="w-4 h-4" /> {t('nav.qcm')}
                  </Link>
                )}
                {profile?.role === 'admin' && (
                  <Link to="/admin" className={`text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                    location.pathname === '/admin' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                  }`}>
                    <Shield className="w-4 h-4" /> {t('nav.admin')}
                  </Link>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 border-l border-zinc-200 pl-4 ml-2">
              <button 
                onClick={() => setLanguage('fr')} 
                className={`text-[10px] font-black px-2.5 py-1.5 rounded-lg transition-all ${language === 'fr' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-100'}`}
              >
                FR
              </button>
              <div className="relative flex items-center">
                <button 
                  onClick={() => {
                    setShowEnTooltip(true);
                    setTimeout(() => setShowEnTooltip(false), 3000);
                  }} 
                  className={`text-[10px] font-black px-2.5 py-1.5 rounded-lg transition-all ${language === 'en' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-100'}`}
                >
                  EN
                </button>
                <AnimatePresence>
                  {showEnTooltip && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 5 }}
                      className="absolute top-full right-0 mt-3 px-4 py-2 bg-zinc-900 text-white text-[10px] font-bold rounded-xl shadow-xl whitespace-nowrap z-50 border border-white/10"
                    >
                      version en anglais prochainement
                      <div className="absolute -top-1 right-4 border-4 border-transparent border-b-zinc-900"></div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {user ? (
              <button onClick={logout} className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all" title={t('nav.logout')}>
                <LogOut className="w-5 h-5" />
              </button>
            ) : (
              <Link to="/login" className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-100 active:scale-95">
                {t('nav.login')}
              </Link>
            )}
          </div>

          <div className="md:hidden flex items-center gap-4">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setLanguage('fr')} 
                className={`text-xs font-bold px-2 py-1 rounded ${language === 'fr' ? 'bg-blue-100 text-blue-700' : 'text-zinc-500'}`}
              >
                FR
              </button>
              <div className="relative flex items-center">
                <button 
                  onClick={() => {
                    setShowEnTooltip(true);
                    setTimeout(() => setShowEnTooltip(false), 3000);
                  }} 
                  className={`text-xs font-bold px-2 py-1 rounded ${language === 'en' ? 'bg-blue-100 text-blue-700' : 'text-zinc-500'}`}
                >
                  EN
                </button>
                <AnimatePresence>
                  {showEnTooltip && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="absolute top-full right-0 mt-2 px-3 py-2 bg-zinc-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50"
                    >
                      prochainement version en anglais sera disponible
                      <div className="absolute -top-1 right-3 border-4 border-transparent border-b-zinc-800"></div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <button onClick={() => setIsOpen(!isOpen)} className="text-zinc-600">
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="md:hidden bg-white border-b border-zinc-200 px-4 pt-2 pb-6 flex flex-col gap-4"
          >
            <Link to="/" onClick={() => setIsOpen(false)} className="text-zinc-600 text-lg font-medium">{t('nav.home')}</Link>
            <Link to="/testimonials" onClick={() => setIsOpen(false)} className="text-zinc-600 text-lg font-medium">{t('nav.testimonials')}</Link>
            {user && (
              <>
                <Link to="/dashboard" onClick={() => setIsOpen(false)} className="text-zinc-600 text-lg font-medium">{t('nav.courses')}</Link>
                {(profile?.isPaid || profile?.role === 'admin') && (
                  <Link to="/qcm" onClick={() => setIsOpen(false)} className="text-blue-600 text-lg font-bold flex items-center gap-2 bg-blue-50 p-3 rounded-xl">
                    <Radio className="w-5 h-5" /> {t('nav.qcm')}
                  </Link>
                )}
                {profile?.role === 'admin' && (
                  <Link to="/admin" onClick={() => setIsOpen(false)} className="text-zinc-600 text-lg font-medium">{t('nav.admin')}</Link>
                )}
              </>
            )}
            {user ? (
              <button onClick={() => { logout(); setIsOpen(false); }} className="text-left text-zinc-600 text-lg font-medium">{t('nav.logout')}</button>
            ) : (
              <Link to="/login" onClick={() => setIsOpen(false)} className="text-blue-600 text-lg font-medium">{t('nav.login')}</Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const Footer = () => {
  const [modules, setModules] = useState<any[]>([]);
  const { t, language } = useLanguage();

  useEffect(() => {
    const q = query(collection(db, 'modules'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setModules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.warn("Footer modules fetch failed", err));
    return () => unsubscribe();
  }, []);

  return (
    <footer className="bg-zinc-900 text-zinc-400 py-12 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <div className="flex items-center gap-2 text-white mb-4">
              <Plane className="w-6 h-6" />
              <span className="text-lg font-bold tracking-tight">AVIATION ONLINE</span>
            </div>
            <p className="text-sm leading-relaxed">
              {t('footer.desc')}
            </p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">{t('footer.modules')}</h4>
            <ul className="text-sm space-y-2">
              {modules.length > 0 ? (
                modules.slice(0, 5).map(m => (
                  <li key={m.id}>{language === 'en' && m.title_en ? m.title_en : m.title}</li>
                ))
              ) : (
                <>
                  <li>Pilotage Sans Visibilité (PSV)</li>
                  <li>Moyens Radio</li>
                  <li>Attentes & Procédures</li>
                  <li>Réglementation IFR</li>
                </>
              )}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">{t('footer.contact')}</h4>
            <a href="mailto:contact@aviationonline.net" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-white transition-colors">contact@aviationonline.net</a>
            <p className="text-sm mt-2">Expertise aéronautique et pédagogie IFR.</p>
          </div>
        </div>
        <div className="border-t border-zinc-800 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <div>{t('footer.rights')}</div>
          <div className="flex gap-6">
            <Link to="/legal" className="hover:text-white transition-colors">{t('footer.legal')}</Link>
            <Link to="/terms" className="hover:text-white transition-colors">{t('footer.terms')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const safeError = error instanceof Error ? error.message : String(error);
    // Avoid logging heavy objects directly to prevent potential circular reference issues with library loggers
    console.error("Uncaught error:", safeError);
    // Check if errorInfo has something we can safely log
    if (errorInfo && errorInfo.componentStack) {
      console.error("Component Stack:", errorInfo.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      const lang = localStorage.getItem('language') || 'fr';
      const isEn = lang === 'en';
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center bg-zinc-50">
          <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-rose-600" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">
            {isEn ? 'Oops! Something went wrong.' : 'Oups ! Quelque chose s\'est mal passé.'}
          </h1>
          <p className="text-zinc-600 max-w-md mb-8">
            {this.state.error?.message || (isEn ? 'An unexpected error occurred.' : 'Une erreur inattendue est survenue.')}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            {isEn ? 'Reload page' : 'Recharger la page'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const GoogleAnalytics = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('config', 'G-GW0RK7V854', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);

  return null;
};

export default function App() {
  // Simple connection test
  useEffect(() => {
    const testConnection = async () => {
      try {
        console.log("Testing Firestore connection to 'test/connection'...");
        const testDoc = await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection test result:", testDoc.exists() ? "Document exists" : "Document does not exist (but access is OK)");
      } catch (err: any) {
        console.error("Firestore connection test FAILED:", err.message);
        if (err.message.includes("PERMISSION_DENIED") || err.code === 'permission-denied') {
          console.error("CRITICAL: Permission denied on 'test/connection'. Rules might not be deployed correctly to this DB ID.");
        }
      }
    };
    testConnection();
  }, []);

  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <Router>
            <GoogleAnalytics />
            <div className="min-h-screen bg-zinc-100 font-sans">
              <Navbar />
              <main>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/qcm" element={<ProtectedRoute requirePaid><QCM /></ProtectedRoute>} />
                  <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
                  <Route path="/course/:moduleId/:courseId" element={<ProtectedRoute requirePaid><CourseView /></ProtectedRoute>} />
                  <Route path="/payment" element={<ProtectedRoute><Payment /></ProtectedRoute>} />
                  <Route path="/legal" element={<LegalMentions />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/testimonials" element={<Testimonials />} />
                  <Route path="/formation-ifr-en-ligne" element={<FormationIFR />} />
                  <Route path="/preparation-ir-easa" element={<PreparationIREASA />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </Router>
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
