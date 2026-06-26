import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MotionBackground } from '@/components/shared/MotionBackground';
import type { Session, CourseAssessment, CourseModule, ModuleItem } from '@/context/SessionContext';
import { 
  ArrowLeft, 
  BookOpen, 
  User, 
  Calendar, 
  FileText, 
  Video, 
  Download, 
  CheckCircle, 
  Play, 
  Clock, 
  MessageSquare,
  Award,
  TrendingUp,
  FileCheck2,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

type AssessmentStatus = 'submitted' | 'overdue' | 'upcoming' | 'open';

const STATUS_CONFIG = {
  submitted: {
    label: 'Submitted',
    icon: CheckCircle,
    color: 'text-emerald-400',
    badge: 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400',
    border: 'border-emerald-800/50',
    hoverBorder: 'hover:border-emerald-500/40',
    accentBg: 'from-emerald-500 to-teal-600',
  },
  overdue: {
    label: 'Overdue',
    icon: AlertCircle,
    color: 'text-rose-400',
    badge: 'bg-rose-500/10 border border-rose-500/30 text-rose-400',
    border: 'border-rose-800/50',
    hoverBorder: 'hover:border-rose-500/40',
    accentBg: 'from-rose-500 to-red-650',
  },
  upcoming: {
    label: 'Upcoming',
    icon: Clock,
    color: 'text-amber-400',
    badge: 'bg-amber-500/10 border border-amber-500/30 text-amber-400',
    border: 'border-amber-800/50',
    hoverBorder: 'hover:border-amber-500/40',
    accentBg: 'from-amber-500 to-orange-550',
  },
  open: {
    label: 'Open',
    icon: FileCheck2,
    color: 'text-blue-400',
    badge: 'bg-blue-500/10 border border-blue-500/30 text-blue-400',
    border: 'border-blue-800/50',
    hoverBorder: 'hover:border-blue-500/40',
    accentBg: 'from-blue-500 to-indigo-650',
  },
};

function resolveStatus(assessment: CourseAssessment, studentId: string): { status: AssessmentStatus; score: number | null } {
  const submission = (assessment.submissions ?? []).find(
    (s) => String(s.studentId) === String(studentId)
  );
  if (submission) {
    return { status: 'submitted', score: submission.score ?? null };
  }
  if (assessment.dueDate) {
    const due = new Date(assessment.dueDate);
    if (!Number.isNaN(due.getTime()) && due < new Date()) {
      return { status: 'overdue', score: null };
    }
  }
  if (assessment.dueDate) {
    const due = new Date(assessment.dueDate);
    const now = new Date();
    const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 3) return { status: 'upcoming', score: null };
  }
  return { status: 'open', score: null };
}

interface StudentCourseDetailsProps {
  course: Session;
  onBack: () => void;
  onStartExam: (ctx: { courseId: string; courseTitle: string; assessment: CourseAssessment }) => void;
}

export function StudentCourseDetails({ course, onBack, onStartExam }: StudentCourseDetailsProps) {
  const [activeTab, setActiveTab] = useState<'modules' | 'assessments' | 'announcements'>('modules');
  const { user } = useAuth();
  const studentId = resolveEnrollmentStudentId(user);



  const resolveFileUrl = async (item: ModuleItem): Promise<string> => {
    if (item.downloadUrl && String(item.downloadUrl).startsWith('http')) return String(item.downloadUrl);
    if (item.dataUrl && String(item.dataUrl).startsWith('data:')) {
      try {
        const parts = item.dataUrl.split(',');
        const mimeMatch = parts[0].match(/data:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : (item.mimeType || 'application/pdf');
        const base64 = parts[1];
        const binaryStr = atob(base64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mime });
        return URL.createObjectURL(blob);
      } catch (e) {
        console.warn('Failed to convert dataUrl to blobUrl:', e);
        return item.dataUrl;
      }
    }
    if (item.storageUrl) {
      const storage = getStorage();
      const fileRef = ref(storage, item.storageUrl);
      return await getDownloadURL(fileRef);
    }
    throw new Error('Asset unresolvable.');
  };

  const handleDownloadMaterial = async (item: ModuleItem) => {
    toast.success(`Opening material: ${item.title}`);
    
    let resolvedUrl: string | null = null;
    try {
      resolvedUrl = await resolveFileUrl(item);
    } catch (e) {
      console.warn('URL resolution failed, checking fileContent fallback:', e);
    }

    const w = window.open('about:blank', '_blank');
    if (!w) {
      toast.error('Pop-up blocked. Please allow pop-ups to open materials.');
      return;
    }

    if (resolvedUrl) {
      try {
        w.document.open();
        w.document.write(`<html><body style="margin:0;background:#030014;"><iframe src="${resolvedUrl}" style="width:100%;height:100%;border:0;"></iframe></body></html>`);
        w.document.close();
        return;
      } catch (err) {
        console.error('Failed to write iframe to window:', err);
      }
    }

    // Fallback: if URL resolution failed or iframe load failed, but we have extracted text content
    if (item.fileContent && item.fileContent.trim().length > 0) {
      const escapeHtml = (text: string) => {
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      const styledHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${escapeHtml(item.title)}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              margin: 0;
              padding: 40px 20px;
              background: #030014;
              color: #f1f5f9;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.7;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background: rgba(7, 4, 32, 0.6);
              border: 1px solid rgba(99, 102, 241, 0.25);
              border-radius: 20px;
              padding: 40px;
              box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
              backdrop-filter: blur(12px);
              -webkit-backdrop-filter: blur(12px);
            }
            h1 {
              font-size: 26px;
              font-weight: 800;
              margin-top: 0;
              margin-bottom: 8px;
              background: linear-gradient(to right, #60a5fa, #a5b4fc);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
              padding-bottom: 20px;
            }
            .meta {
              font-size: 11px;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 30px;
            }
            .content {
              font-size: 15px;
              white-space: pre-wrap;
              color: #cbd5e1;
              text-align: justify;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${escapeHtml(item.title)}</h1>
            <div class="meta">Document Format: ${escapeHtml(item.type.toUpperCase())} | Extracted Text Reader</div>
            <div class="content">${escapeHtml(item.fileContent)}</div>
          </div>
        </body>
        </html>
      `;

      w.document.open();
      w.document.write(styledHtml);
      w.document.close();
      toast.success('Opened document text reader.');
    } else {
      w.close();
      toast.error('Failed to resolve or open material file.');
    }
  };

  const getModuleItemIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="w-4 h-4 text-rose-400" />;
      case 'video': return <Video className="w-4 h-4 text-emerald-400" />;
      default: return <FileText className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <MotionBackground>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6 lg:px-8 space-y-6 animate-in fade-in duration-300">
        
        {/* Back Button & Breadcrumb */}
        <div className="flex items-center gap-2">
          <Button 
            onClick={onBack} 
            variant="ghost" 
            size="sm" 
            className="text-slate-400 hover:text-white rounded-xl"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Courses
          </Button>
        </div>

        {/* Modern Course Banner */}
        <section className="relative overflow-hidden rounded-3xl border border-indigo-500/25 bg-gradient-to-r from-[#0d0933]/90 via-[#130d4d]/85 to-[#0b072c]/95 shadow-[0_0_50px_rgba(79,70,229,0.12)] p-6 sm:p-8 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <Badge className="bg-indigo-500/15 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 rounded-full font-bold px-3 py-1">
              Active Enrollment
            </Badge>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
              {course.title}
            </h1>
            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                Instructor: {course.instructorName || 'Professor'}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                Code: {course.joinCode || 'N/A'}
              </span>
            </div>
          </div>
        </section>

        {/* Learning Hub Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Main Content Area (Full 3 cols) */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* View Tab Selectors */}
            <div className="flex gap-2 p-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl w-fit backdrop-blur-md">
              <Button 
                variant="ghost" 
                onClick={() => setActiveTab('modules')} 
                className={`rounded-xl px-4 h-10 text-xs font-bold transition-all ${
                  activeTab === 'modules' 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BookOpen className="w-4 h-4 mr-1.5" /> Study Modules
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setActiveTab('assessments')} 
                className={`rounded-xl px-4 h-10 text-xs font-bold transition-all ${
                  activeTab === 'assessments' 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCheck2 className="w-4 h-4 mr-1.5" /> Quizzes & Exams
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setActiveTab('announcements')} 
                className={`rounded-xl px-4 h-10 text-xs font-bold transition-all ${
                  activeTab === 'announcements' 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-4 h-4 mr-1.5" /> Announcements
              </Button>
            </div>

            {/* TAB CONTENT: 1. STUDY MODULES */}
            {activeTab === 'modules' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                {(course.modules || []).length === 0 ? (
                  <div className="border border-slate-800 bg-[#070420]/25 backdrop-blur-md p-8 text-center text-slate-500 border-dashed rounded-3xl">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 text-slate-700" />
                    <p className="text-sm font-semibold">No study modules available yet.</p>
                    <p className="text-xs text-slate-650 mt-1">Study materials will be published by your instructor shortly.</p>
                  </div>
                ) : (
                  (course.modules || []).map((mod: CourseModule) => (
                    <div key={mod.id} className="border border-slate-800 bg-[#070420]/20 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl">
                      <div className="bg-slate-950/20 border-b border-slate-900/80 p-5">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-bold text-white">
                            Week {mod.week || 1}: {mod.title}
                          </h3>
                          <Badge variant="outline" className="border-slate-800 text-indigo-400 uppercase text-[9px] tracking-wider">
                            {(mod.items || []).length} Materials
                          </Badge>
                        </div>
                        {mod.description && (
                          <p className="text-slate-400 text-xs mt-1">
                            {mod.description}
                          </p>
                        )}
                      </div>
                      <div className="p-4 space-y-2.5">
                        {(mod.items || []).length === 0 ? (
                          <p className="text-xs text-slate-600 text-center py-2">No files uploaded for this module.</p>
                        ) : (
                          (mod.items || []).map((file: ModuleItem) => (
                            <div 
                              key={file.id} 
                              onClick={() => handleDownloadMaterial(file)}
                              className="group flex items-center justify-between p-3 rounded-xl bg-slate-950/30 border border-slate-900 hover:border-slate-700/80 transition-all duration-200 cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 bg-slate-900 border border-slate-850 rounded-lg shrink-0">
                                  {getModuleItemIcon(file.type)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors truncate">
                                    {file.title}
                                  </p>
                                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 font-mono">
                                    Format: {file.type} {file.size ? `· Size: ${file.size}` : ''}
                                  </p>
                                </div>
                              </div>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 w-7 p-0 text-slate-400 hover:text-white rounded-lg"
                                aria-label="Open material link"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: 2. QUIZZES & EXAMS */}
            {activeTab === 'assessments' && (
              <div className="space-y-3 animate-in fade-in duration-300">
                {(course.assessments || []).length === 0 ? (
                  <div className="border border-slate-800 bg-[#070420]/25 backdrop-blur-md p-8 text-center text-slate-500 border-dashed rounded-3xl">
                    <Award className="w-10 h-10 mx-auto mb-2 text-slate-700" />
                    <p className="text-sm font-semibold">No quizzes or exams registered.</p>
                  </div>
                ) : (
                  (course.assessments || []).map((a: CourseAssessment) => {
                    const { status, score } = resolveStatus(a, studentId);
                    const cfg = STATUS_CONFIG[status];
                    const StatusIcon = cfg.icon;

                    return (
                      <div 
                        key={a.id} 
                        className={`overflow-hidden border rounded-2xl bg-[#070420]/25 backdrop-blur-md transition-all duration-300 shadow-xl ${cfg.border} ${cfg.hoverBorder}`}
                      >
                        {/* Top Accent Strip based on status */}
                        <div className={`h-1 w-full bg-gradient-to-r ${cfg.accentBg}`} />

                        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 capitalize">
                              {a.assessmentType || 'Quiz'}
                            </span>
                            <h4 className="text-sm font-bold text-white">{a.title}</h4>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                              <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {a.duration} mins</span>
                              <span className="flex items-center gap-0.5"><Award className="w-3 h-3" /> {a.maxScore || 100} points</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs self-end sm:self-center shrink-0">
                            {status === 'submitted' ? (
                              <div className="text-right">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.badge}`}>
                                  <StatusIcon className="w-3 h-3" />
                                  Submitted
                                </span>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">Score: {score} / {a.maxScore}</p>
                              </div>
                            ) : status === 'overdue' ? (
                              <div className="flex items-center gap-3">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.badge}`}>
                                  <StatusIcon className="w-3 h-3" />
                                  Overdue
                                </span>
                                <span className="text-slate-400 font-mono text-[10px]">
                                  Passed due date
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.badge}`}>
                                  <StatusIcon className="w-3 h-3" />
                                  {cfg.label}
                                </span>
                                <span className="text-slate-400 font-mono text-[10px]">
                                  Due: {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'Open'}
                                </span>
                                <Button 
                                  size="sm"
                                  onClick={() => onStartExam({ courseId: course.id, courseTitle: course.title, assessment: a })}
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 h-8 rounded-full shadow-lg shadow-indigo-600/10"
                                >
                                  Start Exam
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB CONTENT: 3. ANNOUNCEMENTS */}
            {activeTab === 'announcements' && (
              <div className="space-y-3 animate-in fade-in duration-300">
                {(course.announcements || []).length === 0 ? (
                  <div className="border border-slate-800 bg-[#070420]/25 backdrop-blur-md p-8 text-center text-slate-500 border-dashed rounded-3xl">
                    <MessageSquare className="w-10 h-10 mx-auto mb-2 text-slate-700" />
                    <p className="text-sm font-semibold">No announcements posted for this course.</p>
                  </div>
                ) : (
                  (course.announcements || []).map((ann) => (
                    <div key={ann.id} className="border border-slate-800 bg-[#070420]/20 backdrop-blur-md rounded-2xl shadow-xl">
                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between text-xs border-b border-slate-900/60 pb-2">
                          <span className="font-bold text-indigo-400">Instructor Post</span>
                          <span className="text-slate-500 tabular-nums">{ann.date ? new Date(ann.date).toLocaleDateString() : ''}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed py-1 whitespace-pre-line">
                          {ann.text}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

          </div>



        </div>

      </div>
    </MotionBackground>
  );
}
