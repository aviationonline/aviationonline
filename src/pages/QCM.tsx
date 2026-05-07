import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, getDocs, addDoc, Timestamp, where } from 'firebase/firestore';
import { useAuth } from '../App';
import { Plane, CheckCircle2, XCircle, ChevronRight, ChevronLeft, RotateCcw, Award, BookOpen, HelpCircle, Clock, History, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../LanguageContext';

interface Quiz {
  id: string;
  title: string;
  title_en?: string;
  description: string;
  description_en?: string;
  category: string;
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
  attachmentType?: 'image' | 'pdf';
  order: number;
}

interface QuizAttempt {
  id: string;
  quizTitle: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  completedAt: any;
}

export default function QCM() {
  const { profile, user } = useAuth();
  const { t, language } = useLanguage();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'quizzes' | 'history'>('quizzes');
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);

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

  useEffect(() => {
    const q = query(collection(db, 'quizzes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setQuizzes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz))
        .sort((a, b) => (a.order || 999) - (b.order || 999)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'quizzes'));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    
    const q = query(
      collection(db, 'quiz_attempts'), 
      where('userId', '==', profile.uid)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedAttempts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizAttempt));
      fetchedAttempts.sort((a, b) => (b.completedAt?.toMillis() || 0) - (a.completedAt?.toMillis() || 0));
      setAttempts(fetchedAttempts);
    }, (error) => {
      console.error("Error fetching attempts:", error instanceof Error ? error.message : String(error));
    });
    
    return () => unsubscribe();
  }, [profile?.uid]);

  const startQuiz = async (quiz: Quiz) => {
    setLoading(true);
    try {
      const q = query(collection(db, `quizzes/${quiz.id}/questions`));
      const snapshot = await getDocs(q);
      const fetchedQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question))
        .sort((a, b) => (a.order || 999) - (b.order || 999));
      
      if (fetchedQuestions.length > 0) {
        setQuestions(fetchedQuestions);
        setSelectedQuiz(quiz);
        setCurrentQuestionIndex(0);
        setScore(0);
        setShowResults(false);
        setIsAnswered(false);
        setSelectedOption(null);
      } else {
        alert(t('qcm.alert.noQuestions'));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `quizzes/${quiz.id}/questions`);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
  };

  const submitAnswer = () => {
    if (selectedOption === null || isAnswered) return;
    
    setIsAnswered(true);
    if (selectedOption === questions[currentQuestionIndex].correctAnswer) {
      setScore(prev => prev + 1);
    }
  };

  const nextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setIsAnswered(false);
      setSelectedOption(null);
    } else {
      const finalScore = score;
      const total = questions.length;
      const percentage = Math.round((finalScore / total) * 100);
      
      setShowResults(true);

      // Save attempt to Firestore
      try {
        const userEmail = profile?.email || user?.email || 'no-email';
        const userName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || user?.displayName || 'Utilisateur inconnu';
        const quizId = selectedQuiz?.id || 'unknown';
        const quizTitle = selectedQuiz?.title || 'Quiz inconnu';

        await addDoc(collection(db, 'quiz_attempts'), {
          userId: profile?.uid || user?.uid || 'unknown',
          userName: userName,
          userEmail: userEmail,
          quizId: quizId,
          quizTitle: quizTitle,
          score: finalScore,
          totalQuestions: total,
          percentage,
          completedAt: Timestamp.now()
        });

        // Send email results via API
        await fetch('/api/send-quiz-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userEmail: userEmail,
            userName: userName,
            quizTitle: quizTitle,
            score: finalScore,
            totalQuestions: total,
            percentage
          })
        });
      } catch (err) {
        console.error("Error saving quiz results or sending email:", err instanceof Error ? err.message : String(err));
      }
    }
  };

  const resetQuiz = () => {
    setSelectedQuiz(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setScore(0);
    setShowResults(false);
    setIsAnswered(false);
    setSelectedOption(null);
  };

  const colors = [
    { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', hover: 'hover:border-blue-300', button: 'bg-blue-600 hover:bg-blue-700', shadow: 'hover:shadow-blue-100' },
    { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', hover: 'hover:border-emerald-300', button: 'bg-emerald-600 hover:bg-emerald-700', shadow: 'hover:shadow-emerald-100' },
    { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', hover: 'hover:border-purple-300', button: 'bg-purple-600 hover:bg-purple-700', shadow: 'hover:shadow-purple-100' },
    { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', hover: 'hover:border-amber-300', button: 'bg-amber-600 hover:bg-amber-700', shadow: 'hover:shadow-amber-100' },
    { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200', hover: 'hover:border-rose-300', button: 'bg-rose-600 hover:bg-rose-700', shadow: 'hover:shadow-rose-100' },
    { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', hover: 'hover:border-indigo-300', button: 'bg-indigo-600 hover:bg-indigo-700', shadow: 'hover:shadow-indigo-100' },
  ];

  if (loading) return <div className="p-8 text-center">Chargement...</div>;

  if (!selectedQuiz) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 text-white rounded-3xl mb-4 shadow-lg shadow-blue-200">
            <Plane className="w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold text-zinc-900 mb-4 tracking-tight uppercase">AVIATION ONLINE</h1>
          <p className="text-zinc-500 max-w-2xl mx-auto font-medium">
            {t('qcm.title')}
          </p>
        </header>

        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-zinc-100 p-1 rounded-2xl">
            <button
              onClick={() => setActiveTab('quizzes')}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'quizzes' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              {t('qcm.available')}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'history' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <History className="w-4 h-4" />
              {t('qcm.history')}
            </button>
          </div>
        </div>

        {activeTab === 'quizzes' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {quizzes.map((quiz, idx) => {
              const color = colors[idx % colors.length];
              return (
              <motion.div 
                key={quiz.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`bg-white rounded-3xl border ${color.border} p-8 shadow-sm hover:shadow-xl ${color.shadow} ${color.hover} transition-all group flex flex-col h-full`}
              >
                <div className="mb-6">
                  <span className={`px-3 py-1 ${color.bg} ${color.text} text-[10px] font-bold rounded-full uppercase tracking-widest`}>
                    {language === 'en' && quiz.category_en ? quiz.category_en : (quiz.category || 'Général')}
                  </span>
                </div>
                <h3 className={`text-xl font-bold text-zinc-900 mb-3 group-hover:${color.text} transition-colors`}>{language === 'en' && quiz.title_en ? quiz.title_en : quiz.title}</h3>
                <p className="text-sm text-zinc-500 mb-8 flex-grow leading-relaxed">{language === 'en' && quiz.description_en ? quiz.description_en : quiz.description}</p>
                <button 
                  onClick={() => startQuiz(quiz)}
                  className={`w-full py-4 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 ${color.button}`}
                >
                  {t('qcm.start')} <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )})}
            {quizzes.length === 0 && (
              <div className="col-span-full text-center py-20 bg-white border border-dashed border-zinc-300 rounded-3xl">
                <HelpCircle className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                <p className="text-zinc-500">{t('qcm.empty')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden">
            {attempts.length === 0 ? (
              <div className="text-center py-20">
                <History className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                <p className="text-zinc-500">{t('qcm.history.empty')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('qcm.history.date')}</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('qcm.history.quiz')}</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('qcm.history.score')}</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('qcm.history.result')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {attempts.map((attempt) => (
                      <tr key={attempt.id} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-zinc-600">
                            <Clock className="w-4 h-4 text-zinc-400" />
                            {attempt.completedAt?.toDate().toLocaleString('fr-FR')}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-zinc-900">{attempt.quizTitle}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600">
                          {attempt.score} / {attempt.totalQuestions}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                            attempt.percentage >= 75 ? 'bg-emerald-100 text-emerald-800' : 
                            attempt.percentage >= 50 ? 'bg-amber-100 text-amber-800' : 
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {attempt.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (showResults) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className="max-w-3xl mx-auto px-4 py-20">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-[40px] p-12 shadow-2xl border border-zinc-100 text-center"
        >
          <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-8">
            <Award className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-bold text-zinc-900 mb-2">{t('qcm.results.title')}</h2>
          <p className="text-zinc-500 mb-8">{language === 'en' && selectedQuiz.title_en ? selectedQuiz.title_en : selectedQuiz.title}</p>
          
          <div className="mb-12">
            <div className="text-6xl font-black text-zinc-900 mb-2">{score} / {questions.length}</div>
            <div className="text-lg font-bold text-blue-600">{percentage}% {t('qcm.results.success')}</div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-12">
            <div className="p-6 bg-zinc-50 rounded-3xl">
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{t('qcm.results.correct')}</div>
              <div className="text-2xl font-bold text-emerald-600">{score}</div>
            </div>
            <div className="p-6 bg-zinc-50 rounded-3xl">
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{t('qcm.results.errors')}</div>
              <div className="text-2xl font-bold text-rose-600">{questions.length - score}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => startQuiz(selectedQuiz)}
              className="flex-1 py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> {t('qcm.results.restart')}
            </button>
            <button 
              onClick={resetQuiz}
              className="flex-1 py-4 bg-zinc-100 text-zinc-600 font-bold rounded-2xl hover:bg-zinc-200 transition-colors"
            >
              {t('qcm.results.back')}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
          <Plane className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900 tracking-tight uppercase">AVIATION ONLINE</h1>
          <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">{language === 'en' && selectedQuiz.title_en ? selectedQuiz.title_en : selectedQuiz.title}</p>
        </div>
      </div>

      <div className="mb-8 flex items-center justify-between">
        <button onClick={resetQuiz} className="text-sm font-bold text-zinc-400 hover:text-zinc-900 flex items-center gap-1 transition-colors">
          <ChevronLeft className="w-4 h-4" /> {t('qcm.question.quit')}
        </button>
        <div className="px-4 py-2 bg-zinc-100 rounded-full text-xs font-bold text-zinc-600">
          Question {currentQuestionIndex + 1} {t('qcm.question.of')} {questions.length}
        </div>
      </div>

      <div className="w-full bg-zinc-200 h-2 rounded-full mb-12 overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
          className="h-full bg-blue-600"
        />
      </div>

      <motion.div 
        key={currentQuestion.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white rounded-[40px] p-8 md:p-12 shadow-xl border border-zinc-100"
      >
        <h2 className="text-2xl font-bold text-zinc-900 mb-8 leading-tight">
          {language === 'en' && currentQuestion.text_en ? currentQuestion.text_en : currentQuestion.text}
        </h2>

        {(currentQuestion.attachmentUrl && (currentQuestion.attachmentType === 'image' || currentQuestion.attachmentUrl.match(/\.(jpeg|jpg|gif|png|webp|svg|avif)$/i) || currentQuestion.attachmentUrl.includes('drive.google.com') || currentQuestion.attachmentUrl.includes('docs.google.com') || currentQuestion.attachmentUrl.includes('hostinger'))) && (
          <div className="mb-8 group relative">
            <div className="rounded-2xl overflow-hidden border border-zinc-200 bg-white min-h-[100px] flex items-center justify-center shadow-sm">
              <img 
                key={currentQuestion.attachmentUrl}
                src={getDirectImageUrl(currentQuestion.attachmentUrl)} 
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  const url = currentQuestion.attachmentUrl || '';
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
                alt="Illustration de la question" 
                className="max-w-full h-auto max-h-[700px] object-contain sharp-image" 
                referrerPolicy="no-referrer"
              />
            </div>
            <a 
              href={getDirectImageUrl(currentQuestion.attachmentUrl)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur shadow-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white text-zinc-600 hover:text-blue-600"
              title="Ouvrir l'image en plein écran"
            >
              <ExternalLink size={18} />
            </a>
          </div>
        )}

        {currentQuestion.attachmentUrl && currentQuestion.attachmentType === 'pdf' && (
          <div className="mb-8">
            <a 
              href={currentQuestion.attachmentUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-colors"
            >
              <BookOpen className="w-5 h-5" />
              {language === 'en' ? 'Open associated PDF document' : 'Ouvrir le document PDF associé'}
            </a>
          </div>
        )}

        <div className="space-y-4 mb-12">
          {(language === 'en' && currentQuestion.options_en && currentQuestion.options_en.length > 0 ? currentQuestion.options_en : currentQuestion.options)
            .map((option, idx) => ({ text: option, originalIndex: idx }))
            .filter(opt => opt.text && opt.text.trim() !== '')
            .map((opt) => {
            let statusClass = "border-zinc-200 hover:border-zinc-900";
            if (isAnswered) {
              if (opt.originalIndex === currentQuestion.correctAnswer) {
                statusClass = "border-emerald-500 bg-emerald-50 text-emerald-900";
              } else if (opt.originalIndex === selectedOption) {
                statusClass = "border-rose-500 bg-rose-50 text-rose-900";
              } else {
                statusClass = "border-zinc-100 opacity-50";
              }
            } else if (selectedOption === opt.originalIndex) {
              statusClass = "border-blue-600 bg-blue-50 text-blue-900 shadow-md";
            }

            return (
              <button
                key={opt.originalIndex}
                onClick={() => handleOptionSelect(opt.originalIndex)}
                disabled={isAnswered}
                className={`w-full p-6 text-left rounded-2xl border-2 transition-all flex items-center justify-between group ${statusClass}`}
              >
                <span className="font-medium">{opt.text}</span>
                {isAnswered && opt.originalIndex === currentQuestion.correctAnswer && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                {isAnswered && opt.originalIndex === selectedOption && opt.originalIndex !== currentQuestion.correctAnswer && <XCircle className="w-5 h-5 text-rose-600" />}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          {!isAnswered ? (
            <button 
              onClick={submitAnswer}
              disabled={selectedOption === null}
              className="px-10 py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('qcm.question.validate')}
            </button>
          ) : (
            <button 
              onClick={nextQuestion}
              className="px-10 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              {currentQuestionIndex < questions.length - 1 ? t('qcm.question.next') : t('qcm.question.see_results')} <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
