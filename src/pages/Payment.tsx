import { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Plane, CheckCircle2, Shield, CreditCard, Lock, AlertCircle, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../LanguageContext';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface Promotion {
  isActive: boolean;
  endDate: string;
  discountPercentage: number;
  promoCode: string;
}

export default function Payment() {
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [stripePaymentLink, setStripePaymentLink] = useState('');
  const [basePrice, setBasePrice] = useState<number>(79);
  const [siteStatus, setSiteStatus] = useState<{ closedRegistrations: boolean; redirectUrl: string }>({
    closedRegistrations: false,
    redirectUrl: 'https://aviationonline.fr/login'
  });
  const isInIframe = window.self !== window.top;
  const isCancelled = searchParams.get('payment') === 'cancel';

  useEffect(() => {
    const unsubPricing = onSnapshot(doc(db, 'settings', 'pricing'), (docSnap) => {
      if (docSnap.exists() && typeof docSnap.data().basePrice === 'number') {
        setBasePrice(docSnap.data().basePrice);
      }
    });

    const unsubPromotion = onSnapshot(doc(db, 'settings', 'promotion'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Promotion;
        if (data.isActive && new Date(data.endDate) > new Date()) {
          setPromotion(data);
          setPromoCodeInput(data.promoCode);
        } else {
          setPromotion(null);
        }
      } else {
        setPromotion(null);
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
      }
    });

    return () => {
      unsubPricing();
      unsubPromotion();
      unsubPayment();
      unsubSiteStatus();
    };
  }, []);

  const isPromoValid = promotion && promoCodeInput.trim().toUpperCase() === promotion.promoCode;
  const currentPrice = isPromoValid ? Math.max(0, Math.round(basePrice * (1 - promotion.discountPercentage / 100))) : basePrice;

  const handlePayment = async () => {
    if (siteStatus.closedRegistrations) {
      alert("Les inscriptions et paiements sont actuellement clôturés sur le site.");
      return;
    }
    if (!user) {
      alert(t('payment.login_required'));
      return;
    }
    setLoading(true);
    try {
      let sessionUrl = '';
      try {
        const response = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId: user?.uid, 
            email: user?.email,
            promoCode: isPromoValid ? promotion.promoCode : undefined
          }),
        });

        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || !contentType.includes("application/json")) {
          // If response is HTML or anything but JSON, we are on classic web hosting with no Node.js backend active
          if (stripePaymentLink) {
            console.log("Hébergement classique détecté (réponse HTML du serveur), redirection vers le lien statique Stripe Payment Link :", stripePaymentLink);
            sessionUrl = stripePaymentLink;
          } else {
            throw new Error(`Le serveur d'API est indisponible (Hébergement classique) et aucun lien de paiement alternatif n'a été configuré par l'administrateur dans /admin.`);
          }
        } else {
          const session = await response.json();
          if (session.error) {
            throw new Error(session.error);
          }
          sessionUrl = session.url;
        }
      } catch (fetchError: any) {
        console.warn("L'appel API create-checkout-session a échoué, essai d'activation du fallback Stripe Payment Link :", fetchError);
        if (stripePaymentLink) {
          console.log("Redirection de secours vers le lien statique Stripe Payment Link :", stripePaymentLink);
          sessionUrl = stripePaymentLink;
        } else {
          throw fetchError;
        }
      }

      if (sessionUrl) {
        if (isInIframe) {
          window.open(sessionUrl, '_blank');
          alert(t('payment.popup_blocked'));
        } else {
          window.location.href = sessionUrl;
        }
      } else {
        throw new Error(t('payment.missing_url'));
      }
    } catch (error: any) {
      console.error("Payment Error:", error instanceof Error ? error.message : String(error));
      alert(`${t('payment.error')} ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (profile?.isPaid) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">{t('payment.already_paid')}</h1>
          <p className="text-zinc-500 mb-8">{t('payment.already_paid_desc')}</p>
          <a href="/dashboard" className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors">
            {t('payment.go_dashboard')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-20">
      <AnimatePresence>
        {isCancelled && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {t('payment.cancelled')}
          </motion.div>
        )}
        {isInIframe && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-600 text-sm flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {t('payment.iframe_warning')}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-zinc-900 mb-4">{t('payment.title')}</h1>
        <p className="text-xl text-zinc-500">{t('payment.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 mb-1">{t('payment.feature1.title')}</h3>
              <p className="text-sm text-zinc-500">{t('payment.feature1.desc')}</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 mb-1">{t('payment.feature2.title')}</h3>
              <p className="text-sm text-zinc-500">{t('payment.feature2.desc')}</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Lock className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 mb-1">{t('payment.feature3.title')}</h3>
              <p className="text-sm text-zinc-500">{t('payment.feature3.desc')}</p>
            </div>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-3xl border border-zinc-200 shadow-2xl p-8 md:p-12 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-4 py-1 rounded-bl-xl uppercase tracking-widest">
            {t('payment.offer')}
          </div>
          <div className="mb-6">
            <h2 className="text-zinc-900 font-bold text-lg mb-2">{t('payment.product')}</h2>
            {!siteStatus.closedRegistrations ? (
              <div className="flex items-center gap-3">
                <span className="text-5xl font-bold text-zinc-900">{currentPrice}€</span>
                <div className="flex flex-col justify-center">
                  {isPromoValid && promotion && (
                    <>
                      <span className="text-zinc-400 line-through text-2xl font-bold">{basePrice}€</span>
                      <span className="text-emerald-600 font-bold bg-emerald-100 px-2 py-0.5 rounded text-xs w-max mt-0.5">-{promotion.discountPercentage}%</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-zinc-600 text-sm font-medium">
                Accès réservé aux élèves déjà inscrits
              </div>
            )}
          </div>

          {!siteStatus.closedRegistrations && (
            <div className="mb-6">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Code Promo</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                  placeholder="Ex: NOEL20"
                  className="flex-1 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none uppercase text-sm"
                />
              </div>
              {isPromoValid && (
                <p className="mt-2 text-sm text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Code promo appliqué ! (-{promotion.discountPercentage}%)
                </p>
              )}
              {promoCodeInput.trim() !== '' && !isPromoValid && (
                <p className="mt-2 text-sm text-zinc-500 flex items-center gap-1">
                  Code non reconnu. S'il s'agit d'un code Stripe, veuillez l'entrer à la page suivante.
                </p>
              )}
            </div>
          )}

          <ul className="space-y-4 mb-8">
            <li className="flex items-center gap-3 text-sm text-zinc-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t('payment.benefit1')}
            </li>
            <li className="flex items-center gap-3 text-sm text-zinc-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t('payment.benefit2')}
            </li>
          </ul>

          {siteStatus.closedRegistrations ? (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-sm">
                <div className="font-bold flex items-center gap-2 mb-1.5 text-red-900">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  Inscriptions & Paiements fermés
                </div>
                <p className="text-xs text-red-700 leading-relaxed">
                  Le site n'accepte plus de nouvelle inscription et reste accessible aux clients déjà inscrits. Si vous souhaitez vous inscrire connectez vous sur{' '}
                  <a 
                    href={siteStatus.redirectUrl || '/login'}
                    target={siteStatus.redirectUrl?.startsWith('http') ? '_blank' : undefined}
                    rel={siteStatus.redirectUrl?.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="underline font-bold text-red-900 hover:text-red-950"
                  >
                    {siteStatus.redirectUrl || 'la page de connexion'}
                  </a>.
                </p>
              </div>
              <a
                href={siteStatus.redirectUrl || '/login'}
                target={siteStatus.redirectUrl?.startsWith('http') ? '_blank' : undefined}
                rel={siteStatus.redirectUrl?.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="w-full py-4 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 text-sm text-center inline-block"
              >
                Se connecter à mon compte
              </a>
            </div>
          ) : (
            <button
              onClick={handlePayment}
              disabled={loading}
              className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? t('payment.btn.loading') : (
                <>
                  <CreditCard className="w-5 h-5" /> {t('payment.btn.pay')}
                </>
              )}
            </button>
          )}
          
          <p className="text-center text-[10px] text-zinc-400 mt-4">
            {t('payment.terms')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
