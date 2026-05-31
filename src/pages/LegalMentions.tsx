import { motion } from 'motion/react';
import { useLanguage } from '../LanguageContext';

export default function LegalMentions() {
  const { t } = useLanguage();
  return (
    <div className="max-w-4xl mx-auto px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 md:p-12 rounded-3xl border border-zinc-200 shadow-sm"
      >
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">{t('legal.title')}</h1>
        
        <section className="space-y-6 text-zinc-600">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-3">{t('legal.section1.title')}</h2>
            <p className="mb-2" dangerouslySetInnerHTML={{ __html: t('legal.section1.p1') }} />
            <p className="font-bold text-zinc-900">Jean-Claude CHENARD</p>
            <p>{t('legal.section1.p2')}</p>
            <p>{t('legal.section1.p3')}</p>
            <p>SIRET : 791 546 419</p>
            <p>{t('legal.section1.p4')}</p>
            <p>Email : contact@aviationonline.net</p>
            <p>{t('legal.section1.p5')}</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-3">{t('legal.section2.title')}</h2>
            <p>{t('legal.section2.p1')}</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-3">{t('legal.section3.title')}</h2>
            <p>{t('legal.section3.p1')}</p>
            <p className="font-bold text-zinc-900">Google Cloud Platform</p>
            <p>Google Cloud France SARL</p>
            <p>8 Rue de Londres, 75009 Paris, France</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-3">{t('legal.section4.title')}</h2>
            <p className="leading-relaxed">
              {t('legal.section4.p1')}
            </p>
            <p className="mt-2 leading-relaxed">
              {t('legal.section4.p2')}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-3">{t('legal.section5.title')}</h2>
            <p className="leading-relaxed" dangerouslySetInnerHTML={{ __html: t('legal.section5.p1') }} />
          </div>
        </section>
      </motion.div>
    </div>
  );
}
