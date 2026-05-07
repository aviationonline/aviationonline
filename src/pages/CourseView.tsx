import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { getDoc, collection, query, orderBy, onSnapshot, getDocs, doc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { ChevronLeft, ChevronRight, BookOpen, Clock, CheckCircle2, FileText, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useLanguage } from '../LanguageContext';

interface Course {
  id: string;
  title: string;
  title_en?: string;
  content: string;
  content_en?: string;
  pdfUrl?: string;
  order: number;
}

interface Module {
  id: string;
  title: string;
  title_en?: string;
}

export default function CourseView() {
  const { moduleId, courseId } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [course, setCourse] = useState<Course | null>(null);
  const [module, setModule] = useState<Module | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduleId || !courseId) return;

    const fetchContent = async () => {
      setLoading(true);
      try {
        const modDoc = await getDoc(doc(db, 'modules', moduleId));
        if (modDoc.exists()) setModule({ id: modDoc.id, ...(modDoc.data() as any) } as Module);

        const courseDoc = await getDoc(doc(db, `modules/${moduleId}/courses`, courseId));
        if (courseDoc.exists()) setCourse({ id: courseDoc.id, ...(courseDoc.data() as any) } as Course);

        const q = query(collection(db, `modules/${moduleId}/courses`));
        const snapshot = await getDocs(q);
        setAllCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course))
          .sort((a, b) => (a.order || 999) - (b.order || 999)));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `modules/${moduleId}/courses/${courseId}`);
      }
      setLoading(false);
    };

    fetchContent();
  }, [moduleId, courseId]);

  if (loading) return <div className="p-8 text-center">{t('course.loading')}</div>;
  if (!course) return <div className="p-8 text-center">{t('course.not_found')}</div>;

  const currentIndex = allCourses.findIndex(c => c.id === courseId);
  const prevCourse = allCourses[currentIndex - 1];
  const nextCourse = allCourses[currentIndex + 1];

  const getEmbedUrl = (url: string) => {
    if (!url) return '';
    // Google Drive
    if (url.includes('drive.google.com')) {
      return url.replace('/view', '/preview').replace('file/d/', 'file/d/').split('?')[0] + '?authuser';
    }
    // Dropbox
    if (url.includes('dropbox.com')) {
      return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('?dl=1', '');
    }
    return url;
  };

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

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Course Header */}
      <div className="bg-zinc-100 border-b border-zinc-200 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> {t('course.back')}
          </Link>
          <div className="flex items-center gap-3 text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">
            <BookOpen className="w-4 h-4" /> {language === 'en' && module?.title_en ? module.title_en : module?.title}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 tracking-tight">{language === 'en' && course.title_en ? course.title_en : course.title}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="prose prose-zinc prose-lg max-w-none"
        >
          <div className="markdown-body mb-12">
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
              {language === 'en' && course.content_en ? course.content_en : course.content}
            </ReactMarkdown>
          </div>

          {course.pdfUrl && (
            <div className="mt-16">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900">{t('course.support')}</h3>
              </div>
              
              <div className="relative bg-zinc-900 rounded-[2rem] overflow-hidden shadow-2xl border border-zinc-200 group">
                {/* Overlay to discourage right-click/direct interaction with PDF UI if possible */}
                <div 
                  className="absolute inset-0 z-10 pointer-events-none" 
                  onContextMenu={(e) => e.preventDefault()} 
                />
                
                <div className="w-full h-[500px] md:h-[850px] bg-zinc-100">
                  <iframe 
                    src={`${getEmbedUrl(course.pdfUrl)}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} 
                    className="w-full h-full border-none"
                    title="Lecteur de formation"
                  />
                </div>
                
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
              </div>
              <p className="mt-4 text-sm text-zinc-400 italic flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {t('course.security')}
              </p>
            </div>
          )}
        </motion.div>

        {/* Navigation */}
        <div className="mt-20 pt-8 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-6">
          {prevCourse ? (
            <Link 
              to={`/course/${moduleId}/${prevCourse.id}`}
              className="w-full sm:w-auto flex items-center gap-4 p-4 rounded-2xl border border-zinc-200 hover:border-blue-500 transition-all group"
            >
              <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 group-hover:text-blue-600 transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('course.prev')}</div>
                <div className="text-sm font-bold text-zinc-900">{language === 'en' && prevCourse.title_en ? prevCourse.title_en : prevCourse.title}</div>
              </div>
            </Link>
          ) : <div />}

          {nextCourse ? (
            <Link 
              to={`/course/${moduleId}/${nextCourse.id}`}
              className="w-full sm:w-auto flex items-center gap-4 p-4 rounded-2xl border border-zinc-200 hover:border-blue-500 transition-all group text-right"
            >
              <div className="text-right">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('course.next')}</div>
                <div className="text-sm font-bold text-zinc-900">{language === 'en' && nextCourse.title_en ? nextCourse.title_en : nextCourse.title}</div>
              </div>
              <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 group-hover:text-blue-600 transition-colors">
                <ChevronRight className="w-6 h-6" />
              </div>
            </Link>
          ) : (
            <Link 
              to="/dashboard"
              className="w-full sm:w-auto flex items-center gap-4 p-4 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <div className="text-right">
                <div className="text-xs font-bold opacity-80 uppercase tracking-widest">{t('course.finished')}</div>
                <div className="text-sm font-bold">{t('course.back_dashboard')}</div>
              </div>
              <CheckCircle2 className="w-6 h-6" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
