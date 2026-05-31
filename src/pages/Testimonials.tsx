import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Quote, Star, ChevronLeft, Award, Users, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { defaultTestimonials } from '../data/testimonials';
import { useLanguage } from '../LanguageContext';

interface Testimonial {
  id: string;
  text: string;
  text_en?: string;
  author: string;
  role: string;
  role_en?: string;
  rating: number;
  order: number;
}

export default function Testimonials() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const { t, language } = useLanguage();

  useEffect(() => {
    window.scrollTo(0, 0);
    const q = query(collection(db, 'testimonials'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Testimonial));
      const sortedTests = tests.sort((a, b) => (a.order || 999) - (b.order || 999));
      setTestimonials(sortedTests);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'testimonials'));

    return () => unsubscribe();
  }, []);

  const displayTestimonials = testimonials.length > 0 ? testimonials : defaultTestimonials;

  return (
    <div className="min-h-screen bg-zinc-50 py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-blue-600 transition-colors mb-12 group">
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          {t('testimonials.back')}
        </Link>

        <header className="mb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl font-bold text-zinc-900 mb-6 tracking-tight">
              {t('testimonials.title')} <span className="text-blue-600 italic">{t('testimonials.subtitle')}</span>
            </h1>
            <p className="text-xl text-zinc-600 max-w-3xl mx-auto leading-relaxed">
              {t('testimonials.desc')}
            </p>
          </motion.div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {displayTestimonials.map((testimonial, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm hover:shadow-xl transition-all group relative"
            >
              <Quote className="w-12 h-12 text-blue-600/5 absolute top-6 left-6 group-hover:text-blue-600/10 transition-colors" />
              
              <div className="flex gap-1 mb-6">
                {[...Array(testimonial.rating || 5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>

              <p className="text-zinc-700 italic mb-8 relative z-10 leading-relaxed text-lg">
                "{language === 'en' && testimonial.text_en ? testimonial.text_en : testimonial.text}"
              </p>

              <div className="flex items-center gap-4 mt-auto">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                  {testimonial.author ? testimonial.author[0] : '?'}
                </div>
                <div>
                  <div className="font-bold text-zinc-900">{testimonial.author}</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">{language === 'en' && testimonial.role_en ? testimonial.role_en : testimonial.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <section className="mt-32 bg-zinc-900 rounded-[3rem] p-12 md:p-20 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-600/10 blur-3xl" />
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-bold mb-8 tracking-tight">
                {t('testimonials.cta.title')} <span className="text-blue-500">{t('testimonials.cta.title_highlight')}</span>
              </h2>
              <p className="text-zinc-400 text-lg mb-10 leading-relaxed">
                {t('testimonials.cta.desc')}
              </p>
              <div className="space-y-4">
                {[
                  t('testimonials.cta.bullet1'),
                  t('testimonials.cta.bullet2'),
                  t('testimonials.cta.bullet3'),
                  t('testimonials.cta.bullet4')
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-500" />
                    <span className="text-zinc-300 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white/5 backdrop-blur-sm p-8 rounded-3xl border border-white/10">
                  <Users className="w-10 h-10 text-blue-500 mb-4" />
                  <div className="text-3xl font-bold mb-1">{t('testimonials.cta.stat1.value')}</div>
                  <div className="text-zinc-500 text-sm uppercase tracking-wider">{t('testimonials.cta.stat1.label')}</div>
                </div>
                <div className="bg-white/5 backdrop-blur-sm p-8 rounded-3xl border border-white/10">
                  <Award className="w-10 h-10 text-emerald-500 mb-4" />
                  <div className="text-3xl font-bold mb-1">{t('testimonials.cta.stat2.value')}</div>
                  <div className="text-zinc-500 text-sm uppercase tracking-wider">{t('testimonials.cta.stat2.label')}</div>
                </div>
              </div>
              <Link to="/login" className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-center transition-all transform hover:scale-[1.02] shadow-xl shadow-blue-600/20">
                {t('testimonials.cta.btn')}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
