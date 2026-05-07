import { useState } from 'react';
import { useAuth } from '../App';
import { useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Plane, CheckCircle2, Shield, CreditCard, Lock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../LanguageContext';

export default function Payment() {
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const isInIframe = window.self !== window.top;
  const isCancelled = searchParams.get('payment') === 'cancel';

  const handlePayment = async () => {
    if (!user) {
      alert(t('payment.login_required'));
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.uid, email: user?.email }),
      });

      const session = await response.json();
      if (!response.ok || session.error) {
        throw new Error(session.error || `${t('payment.server_error')} (${response.status})`);
      }

      if (session.url) {
        // If we are in an iframe (like AI Studio preview), redirecting the current window might be blocked by Stripe's CSP (frame-ancestors)
        // or just look broken. Opening in a new tab is safer for iframes.
        if (isInIframe) {
          window.open(session.url, '_blank');
          // Also show a message in case the popup was blocked
          alert(t('payment.popup_blocked'));
        } else {
          window.location.href = session.url;
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
          <div className="mb-8">
            <h2 className="text-zinc-900 font-bold text-lg mb-2">{t('payment.product')}</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-zinc-900">79€</span>
              <span className="text-zinc-400 line-through">149€</span>
            </div>
          </div>

          <ul className="space-y-4 mb-10">
            <li className="flex items-center gap-3 text-sm text-zinc-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t('payment.benefit1')}
            </li>
            <li className="flex items-center gap-3 text-sm text-zinc-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t('payment.benefit2')}
            </li>
            <li className="flex items-center gap-3 text-sm text-zinc-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t('payment.benefit3')}
            </li>
          </ul>

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
          
          <p className="text-center text-[10px] text-zinc-400 mt-4">
            {t('payment.terms')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
