import { motion } from 'motion/react';
import { useLanguage } from '../LanguageContext';

export default function TermsOfService() {
  const { t } = useLanguage();
  return (
    <div className="max-w-4xl mx-auto px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 md:p-12 rounded-3xl border border-zinc-200 shadow-sm"
      >
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">{t('terms.title')}</h1>
        
        <section className="space-y-8 text-zinc-600">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-4">{t('terms.section1.title')}</h2>
            <p className="leading-relaxed">
              {t('terms.section1.content')}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-4">{t('terms.section2.title')}</h2>
            <p className="leading-relaxed" dangerouslySetInnerHTML={{ __html: t('terms.section2.content') }} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-4">{t('terms.section3.title')}</h2>
            <p className="leading-relaxed">
              {t('terms.section3.content1')}
            </p>
            <p className="mt-2 leading-relaxed italic">
              {t('terms.section3.content2')}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-4">{t('terms.section4.title')}</h2>
            <p className="leading-relaxed">
              {t('terms.section4.content')}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-4">{t('terms.section5.title')}</h2>
            <p className="leading-relaxed">
              {t('terms.section5.content')}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-4">{t('terms.section6.title')}</h2>
            <p className="leading-relaxed">
              {t('terms.section6.content')}
            </p>
          </div>
        </section>
      </motion.div>
    </div>
  );
}
