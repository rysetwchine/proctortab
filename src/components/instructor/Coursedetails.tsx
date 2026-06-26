import React, { useState, useMemo, useEffect, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  FileText,
  Play,
  Layers,
  MessageSquare,
  Plus,
  FolderOpen,
  Upload,
  Trash2,
  QrCode,
  Sparkles,
  TrendingUp,
  Rocket,
  BookOpen,
} from 'lucide-react';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { CourseAttendanceTab } from '@/components/instructor/CourseAttendanceTab';
import { CreateCourseAssessmentDialog } from '@/components/instructor/CreateCourseAssessmentDialog';
import { EditAssessmentAdvancedDialog } from '@/components/instructor/EditAssessmentAdvancedDialog';
import { AssessmentStartDialog } from '@/components/student/AssessmentStartDialog';
import { toast } from 'sonner';
import { recordAttempt } from '@/utils/examSession';
import { isExamWithinDueWindow } from '@/utils/examDetectorPolicy';
import { syncExamDocumentToFirestore } from '@/utils/examSettingsFirestore';
import { saveCourseAssessmentToFirestore } from '@/utils/courseExamFirestore';
import {
  uploadModuleFile,
  saveModuleToFirestore,
  deleteAllModulesFromFirestore,
  deleteModuleFromFirestore,
  clearModuleContentCache,
  loadModulesFromFirestore,
} from '@/utils/moduleStorageService';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from '@/hooks/useSession';
import type {
  CourseAssessment,
  CourseAssessmentInput,
  CourseExamLaunch,
  AssessmentSubmission,
  CourseModule,
  ModuleItem,
} from '@/context/SessionContext';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { resolveCourseInstructorName } from '@/utils/storedUser';
import { isStudentEnrolledLocally } from '@/utils/studentEnrollments';
import { cn } from '@/lib/utils';
import { db } from '@/firebase';

const MAX_FILE_BYTES = 1_200_000;

// ─── Utility ────────────────────────────────────────────────────────────────
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

// Reusable Particle Background Layout
export const MotionBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particlesArray: any[] = [];
    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    class Particle {
      x: number; y: number; size: number; speedX: number; speedY: number;
      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.size = Math.random() * 2 + 1;
        this.speedX = (Math.random() - 0.5) * 0.6;
        this.speedY = (Math.random() - 0.5) * 0.6;
      }
      update() {
        this.x += this.speedX; this.y += this.speedY;
        if (this.x > canvas!.width || this.x < 0) this.speedX = -this.speedX;
        if (this.y > canvas!.height || this.y < 0) this.speedY = -this.speedY;
      }
      draw() {
        ctx!.fillStyle = 'rgba(56, 189, 248, 0.7)';
        ctx!.beginPath();
        ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    const init = () => {
      particlesArray = [];
      const count = (canvas.width * canvas.height) / 12000;
      for (let i = 0; i < count; i++) particlesArray.push(new Particle());
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesArray.forEach(p => { p.update(); p.draw(); });

      for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a; b < particlesArray.length; b++) {
          const dx = particlesArray[a].x - particlesArray[b].x;
          const dy = particlesArray[a].y - particlesArray[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - dist / 120) * 0.4})`;
            ctx.beginPath(); ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
            ctx.lineTo(particlesArray[b].x, particlesArray[b].y); ctx.stroke();
          }
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    init(); animate();
    return () => { window.removeEventListener('resize', resizeCanvas); cancelAnimationFrame(animationFrameId); };
  }, []);

  return (
    <div className="min-h-screen relative overflow-x-hidden text-slate-200">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-0 pointer-events-none w-full h-full bg-[#020208]"
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', display: 'block' }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

function readRole(): string {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return String(u?.role || '').toLowerCase();
  } catch { return ''; }
}

type CourseTab = 'modules' | 'exams' | 'announcements' | 'attendance' | 'assignments';

interface CourseDetailsProps {
  course: {
    id: string;
    name: string;
    instructor: string;
    thumbnail: string;
  };
  onBack: () => void;
  onStartExam: (ctx: CourseExamLaunch) => void;
  onNavigate?: (tab: string) => void;
}

export const CourseDetails = ({ course, onBack, onStartExam }: CourseDetailsProps) => {
  const [activeTab, setActiveTab] = useState<CourseTab>('modules');
  // const { settings } = useSettings();
  const { user } = useAuth();
  const {
    sessions,
    addModule,
    addModuleItem,
    removeCourseModule,
    clearCourseModules,
    addAssessment,
    updateAssessment,
    removeAssessment,
    addCourseAssignment,
    setCourseAnnouncements,
  } = useSession();

  const isProfessor = (user?.role || readRole()) === 'professor';
  const studentId = resolveEnrollmentStudentId(user);
  const initialTabAppliedRef = useRef(false);

  useEffect(() => { initialTabAppliedRef.current = false; }, [course.id]);

  useEffect(() => {
    if (initialTabAppliedRef.current) return;
    const initial = sessionStorage.getItem('courseDetailsInitialTab');
    if (initial === 'announcements' || initial === 'exams') {
      sessionStorage.removeItem('courseDetailsInitialTab');
      setActiveTab(initial as CourseTab);
      initialTabAppliedRef.current = true;
      return;
    }
    setActiveTab('modules');
    initialTabAppliedRef.current = true;
  }, [course.id]);

  const [showAddModule, setShowAddModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleFiles, setNewModuleFiles] = useState<File[]>([]);
  const addModuleFileInputRef = useRef<HTMLInputElement | null>(null);
  const newWeekUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [showCreateAssessment, setShowCreateAssessment] = useState(false);

  const [announcementText, setAnnouncementText] = useState('');
  const [assignTitle, setAssignTitle] = useState('Activity 1');
  const [assignDescription, setAssignDescription] = useState('');
  const [assignDue, setAssignDue] = useState('');
  const [assignFile, setAssignFile] = useState<File | null>(null);
  const [assignLinkedModuleItemId, setAssignLinkedModuleItemId] = useState('none');

  const [gradebook, setGradebook] = useState<CourseAssessment | null>(null);
  const [gradeRows, setGradeRows] = useState<AssessmentSubmission[]>([]);
  const [studentGradeView, setStudentGradeView] = useState<CourseAssessment | null>(null);
  const [takeExamModal, setTakeExamModal] = useState<CourseAssessment | null>(null);
  const [editAdvancedAssessment, setEditAdvancedAssessment] = useState<CourseAssessment | null>(null);

  const fullCourse = sessions.find((s) => String(s.id) === String(course.id));
  const modules = fullCourse?.modules || [];
  const assessments = fullCourse?.assessments || [];

  const weekModules = useMemo(() => {
    return modules.filter((m) => !(m.week === 0 && m.title === 'Learning Modules'));
  }, [modules]);

  const [transparentModules, setTransparentModules] = useState<CourseModule[] | null>(null);

  useEffect(() => {
    if (!showCreateAssessment) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadModulesFromFirestore(String(course.id));
        if (!cancelled) setTransparentModules(loaded);
      } catch (e) {
        if (!cancelled) setTransparentModules(null);
      }
    })();
    return () => { cancelled = true; };
  }, [showCreateAssessment, course.id]);

  // ─── Helper functions ──────────────────────────────────────────────────────

  const openExamStart = (assessment: CourseAssessment) => {
    setTakeExamModal(assessment);
  };

  const openGradebook = (assessment: CourseAssessment) => {
    setGradebook(assessment);
    setGradeRows(assessment.submissions || []);
  };

  const detectorSummary = (a: CourseAssessment): string => {
    const d = a.detectors || {};
    const active = Object.entries(d).filter(([, v]) => v).map(([k]) => k);
    return active.length > 0
      ? `Detectors active: ${active.join(', ')}`
      : 'No integrity detectors active.';
  };

  const studentScoreCell = (a: CourseAssessment): string => {
    const sub = (a.submissions || []).find(
      (s) => String(s.studentId) === String(studentId)
    );
    if (!sub) return '—';
    if (sub.score != null && !Number.isNaN(sub.score as any))
      return `${sub.score} / ${a.maxScore ?? 100}`;
    return 'Submitted';
  };

  const filteredAssessmentsForStudentScores = useMemo(
    () => assessments.filter((a) =>
      (a.submissions || []).some((s) => String(s.studentId) === String(studentId))
    ),
    [assessments, studentId]
  );

  const handleStudentStartAssessment = (assessment: CourseAssessment) => {
    recordAttempt(course.id, assessment.id, studentId);
    onStartExam({
      courseId: course.id,
      courseTitle: course.name,
      assessment,
    });
  };

  const handleCreateAssessment = (input: CourseAssessmentInput) => {
    const newId = addAssessment(course.id, input);
    if (newId) {
      void syncExamDocumentToFirestore(course.id, newId, {
        title: input.title.trim(),
        useGlobalDetectors: input.useGlobalDetectors ?? true,
        detectors: input.detectors ?? {
          tabSwitch: false,
          copyPaste: false,
          fullscreen: false,
          screenshot: false,
          alarm: false,
        },
        allowQuestionNavigation: input.allowQuestionNavigation,
      }).catch(() => {});
    }
    setShowCreateAssessment(false);
    toast.success('Assessment created.');
  };

  const handleMultiFileUploadNewWeek = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !isProfessor) return;
    const nextSequentialIndex = weekModules.length + 1;
    const moduleId = addModule(course.id, {
      title: `Module Lesson Block ${nextSequentialIndex}`,
      week: nextSequentialIndex,
      items: [],
    });
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) { toast.error(`${file.name} exceeds size limit.`); continue; }
      try {
        const item = await uploadModuleFile(course.id, moduleId, file, file.name);
        addModuleItem(course.id, moduleId, item);
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    toast.success('Files linked.');
    e.target.value = '';
  };

  const handleAddModuleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    setNewModuleFiles(Array.from(e.target.files || []));
  };

  const isStudentEnrolled = useMemo(() => {
    const roster = (fullCourse?.enrolledStudents ?? []).map(String);
    return (
      roster.includes(String(studentId)) ||
      isStudentEnrolledLocally(String(studentId), String(course.id))
    );
  }, [fullCourse?.enrolledStudents, studentId, course.id]);

  const courseAssignments = fullCourse?.courseAssignments || [];
  const announcements = fullCourse?.announcements || [];
  const instructorDisplay = useMemo(
    () => fullCourse ? resolveCourseInstructorName(fullCourse) : course.instructor?.trim() || '—',
    [fullCourse, course.instructor]
  );
  const instructorInitial = useMemo(() => {
    const m = /^[A-Za-z0-9]/.exec(instructorDisplay.trim());
    return m ? m[0].toUpperCase() : '?';
  }, [instructorDisplay]);

  const handleSendAnnouncement = () => {
    if (!announcementText.trim() || !isProfessor) return;
    const next = [...announcements, { id: Date.now(), text: announcementText.trim(), date: new Date().toISOString() }];
    setCourseAnnouncements(String(course.id), next);
    setAnnouncementText('');
  };

  const handleAddModule = async () => {
    if (!newModuleTitle.trim()) return;
    const nextSequentialIndex = weekModules.length + 1;
    const moduleId = addModule(course.id, {
      title: newModuleTitle.trim(),
      week: nextSequentialIndex,
      items: [],
    });
    if (newModuleFiles.length > 0 && moduleId) {
      try {
        for (let i = 0; i < newModuleFiles.length; i++) {
          const file = newModuleFiles[i];
          if (file.size > MAX_FILE_BYTES) continue;
          const moduleItem = await uploadModuleFile(course.id, moduleId, file, file.name);
          addModuleItem(course.id, moduleId, moduleItem);
        }
        toast.success(`✓ Lesson assets deployed.`);
      } catch (error) {
        toast.error(`Resource parsing anomaly.`);
      }
    }
    setNewModuleTitle('');
    setNewModuleFiles([]);
    setShowAddModule(false);
  };

  const handleDeleteAllModules = async () => {
    if (!isProfessor || !window.confirm('Wipe out course history permanently?')) return;
    try {
      await deleteAllModulesFromFirestore(course.id);
      clearCourseModules(course.id);
      toast.success('Database matrix updated.');
    } catch (error) { toast.error('Process bound violation.'); }
  };

  const handleDeleteSingleModule = async (module: CourseModule) => {
    if (!isProfessor || !window.confirm('Delete module block?')) return;
    try {
      await deleteModuleFromFirestore(String(course.id), String(module.id));
      clearModuleContentCache();
      removeCourseModule(course.id, module.id);
      toast.success('Module purged.');
    } catch (error) { toast.error('Pipeline interrupt.'); }
  };

  const handleAddAssignment = async () => {
    if (!assignTitle.trim() || !isProfessor) return;
    let dataUrl: string | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    if (assignFile) {
      dataUrl = await fileToDataUrl(assignFile);
      fileName = assignFile.name;
      mimeType = assignFile.type || 'application/octet-stream';
    }
    addCourseAssignment(course.id, {
      title: assignTitle.trim(),
      description: assignDescription.trim(),
      dueDate: assignDue,
      fileName, mimeType, dataUrl,
    });
    setAssignTitle('Activity 1');
    setAssignDescription('');
    setAssignDue('');
    setAssignFile(null);
    setAssignLinkedModuleItemId('none');
    toast.success('Practical assessment published.');
  };

  const scoreSummary = (a: CourseAssessment) => {
    const subs = a.submissions || [];
    const graded = subs.filter((s) => s.score != null && !Number.isNaN(s.score));
    if (graded.length === 0) return `— / ${a.maxScore ?? 100}`;
    return `${Math.round((graded.reduce((acc, s) => acc + (s.score as number), 0) / graded.length) * 10) / 10} avg / ${a.maxScore ?? 100}`;
  };

  const navTabs = [
    { id: 'modules' as const, label: 'Content', icon: FileText },
    { id: 'exams' as const, label: 'Assessments', icon: Play },
    { id: 'announcements' as const, label: 'Broadcasts', icon: MessageSquare },
  ];

  return (
    <MotionBackground>
      {/* Top Navbar Header */}
      <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between border-b border-slate-800/80 pb-4">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-slate-400 hover:text-white hover:bg-slate-900/60 transition-all gap-2 px-3 py-1.5 rounded-xl border border-transparent hover:border-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back to Course Dashboard</span>
        </Button>
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950/80 border border-slate-800/80 text-xs font-medium text-slate-300 backdrop-blur-md shadow-md">
          <span className="text-slate-500">System Status:</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
            Online
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 pb-24">

        {/* Workspace Sidebar Controls Menu */}
        <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-[#070420]/70 backdrop-blur-xl p-5 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 overflow-hidden rounded-xl border border-slate-700/60 shadow-[0_0_15px_rgba(99,102,241,0.2)] bg-slate-950 flex-shrink-0">
                <img src={course.thumbnail} alt={course.name} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-widest text-indigo-400 font-bold">{course.id}</p>
                <h1 className="text-base font-bold tracking-tight text-white leading-tight mt-0.5" title={course.name}>{course.name}</h1>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300 shadow-sm">
                {instructorInitial}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Instructor</p>
                <p className="text-xs font-semibold text-slate-300 truncate">{instructorDisplay}</p>
              </div>
            </div>
          </div>

          <nav className="rounded-2xl border border-slate-800/80 bg-[#070420]/50 backdrop-blur-xl p-2.5 flex flex-col gap-1 shadow-md">
            {navTabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium text-sm tracking-wide transition-all border group",
                    isActive
                      ? "bg-gradient-to-r from-indigo-500/10 to-purple-500/5 border-indigo-500/30 text-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.1)]"
                      : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 hover:border-slate-900"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <TabIcon className={cn("w-4 h-4", isActive ? "text-indigo-400 drop-shadow-[0_0_6px_#6366f1]" : "text-slate-500")} />
                    <span>{tab.label}</span>
                  </div>
                </button>
              );
            })}


          </nav>
        </aside>

        {/* MAIN MODULE LIST CONTENT AREA */}
        <main className="flex-1 min-w-0">
          {activeTab === 'modules' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <div>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Course</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Manage chronological topics, lectures, and resource assets synchronized with student dashboards.</p>
                </div>
                {isProfessor && weekModules.length > 0 && (
                  <Button onClick={() => setShowAddModule(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.2)] gap-2 h-9 text-xs px-4 border border-indigo-500/30">
                    <Plus className="w-3.5 h-3.5" /> Add Module
                  </Button>
                )}
              </div>

              {weekModules.length > 0 ? (
                <div className="space-y-4">
                  {weekModules.map((module, mIdx) => (
                    <div key={module.id} className="border border-slate-800/80 bg-[#070420]/30 backdrop-blur-md overflow-hidden rounded-2xl shadow-xl w-full">
                      <div className="bg-slate-950/40 border-b border-slate-800/60 py-4 flex flex-row items-center justify-between gap-4 px-6">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono tracking-wider text-indigo-400 uppercase font-bold">Lesson {mIdx + 1}</span>
                          <span className="text-base font-bold tracking-wide text-slate-200 uppercase">{module.title}</span>
                        </div>
                        {isProfessor && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg border border-transparent hover:border-rose-900/30" onClick={() => void handleDeleteSingleModule(module)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="p-5 space-y-2 bg-[#040114]/10">
                        {module.items && module.items.length > 0 ? (
                          module.items.map((item, idx) => (
                            <ModuleItemRow key={item.id || `${module.id}-${idx}`} item={item} isProfessor={isProfessor} courseId={String(course.id)} moduleId={String(module.id)} showPdfViewerButton={true} />
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border border-dashed border-slate-800/60 bg-[#070420]/10 text-center">
                            <FolderOpen className="h-5 w-5 text-slate-600" />
                            <p className="text-xs text-slate-500 italic">No resource logs linked to this lesson node frame yet.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col items-center justify-center border border-slate-800/60 rounded-2xl bg-[#040214]/40 backdrop-blur-md p-16 text-center shadow-lg w-full min-h-[350px]">
                    <div className="relative mb-6 flex items-center justify-center text-indigo-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                      <svg className="w-20 h-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2 tracking-wide">No modules created yet</h3>
                    <p className="text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
                      You don't have any modules for this course yet. Create your first one to get started.
                    </p>
                    {isProfessor && (
                      <Button onClick={() => setShowAddModule(true)} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.35)] gap-2 px-8 py-5 text-sm transition-transform active:scale-95">
                        Create Module
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="border border-slate-900 bg-[#070420]/30 rounded-2xl p-5 shadow-md flex flex-col gap-3 backdrop-blur-md">
                      <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 w-fit">
                        <BookOpen className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">Organize <span className="text-indigo-400">Your Content</span></h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">Create modules to organize your lessons and resources.</p>
                      </div>
                    </div>
                    <div className="border border-slate-900 bg-[#070420]/30 rounded-2xl p-5 shadow-md flex flex-col gap-3 backdrop-blur-md">
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 w-fit">
                        <TrendingUp className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">Track Student Progress</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">Monitor assessments and grades to see how students are doing.</p>
                      </div>
                    </div>
                    <div className="border border-slate-900 bg-[#070420]/30 rounded-2xl p-5 shadow-md flex flex-col gap-3 backdrop-blur-md">
                      <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 w-fit">
                        <Rocket className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">Enhance the Course</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">Update and expand modules as the course develops.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ASSESSMENT WORKSPACES GATEWAYS - STUDENT VIEW */}
          {!isProfessor && activeTab === 'exams' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <h2 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">Assigned Assessment Inventories</h2>
              {assessments.length > 0 ? (
                assessments.map((assessment) => {
                  const sub = (assessment.submissions || []).find((s) => String(s.studentId) === String(studentId));
                  const hasScore = sub?.score != null && !Number.isNaN(sub.score as any);
                  return (
                    <div key={assessment.id} className="overflow-hidden border border-slate-800/85 bg-[#070420]/45 backdrop-blur-md rounded-2xl shadow-xl flex flex-col sm:flex-row items-stretch w-full">
                      <div className="flex-1 p-5 space-y-4">
                        <div>
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">Assessment Node</span>
                          <h3 className="text-lg font-bold text-slate-100 mt-2">{assessment.title}</h3>
                        </div>
                        <p className="text-xs text-slate-400">{detectorSummary(assessment)}</p>
                        <Button type="button" disabled={!isStudentEnrolled || !isExamWithinDueWindow(assessment)} onClick={() => openExamStart(assessment)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                          Start Verification Session
                        </Button>
                      </div>
                      <div className="w-full sm:w-36 border-t sm:border-t-0 sm:border-l border-slate-800/80 p-5 flex flex-col items-center justify-center text-center bg-slate-900/20">
                        <p className="text-[10px] font-bold uppercase text-slate-500">Score Status</p>
                        <p className="text-xl font-bold text-indigo-400 mt-1">{hasScore ? `${sub!.score} / ${assessment.maxScore ?? 100}` : sub ? 'Submitted' : '—'}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="border border-slate-800 bg-[#070420]/20 p-8 text-center text-slate-500 rounded-2xl text-sm w-full">No assignments active.</div>
              )}
            </div>
          )}

          {/* PROFESSOR DIRECTIVES WORKSPACE */}
          {isProfessor && activeTab === 'assignments' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <h2 className="text-xl font-bold">Activity Blueprint Provisioning</h2>
              <div className="border border-slate-800 bg-[#070420]/45 backdrop-blur-md rounded-2xl shadow-xl w-full p-6 space-y-4">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs">Activity Index Title</Label>
                    <Select value={assignTitle} onValueChange={setAssignTitle}>
                      <SelectTrigger className="bg-slate-950 border-slate-800 rounded-xl h-10 text-slate-200"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-950 border-slate-800 text-slate-300 rounded-xl">
                        {Array.from({ length: 10 }, (_, i) => `Activity ${i + 1}`).map((lbl) => <SelectItem key={lbl} value={lbl}>{lbl}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs">Task Outline Details</Label>
                    <Textarea value={assignDescription} onChange={(e) => setAssignDescription(e.target.value)} rows={3} className="bg-slate-950 border-slate-800 text-slate-200 rounded-xl" placeholder="Instructions..." />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1"><Label className="text-slate-400 text-xs">Closing Bounds (Due Date)</Label><Input type="datetime-local" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} className="bg-slate-950 border-slate-800 text-slate-200 rounded-xl h-10" /></div>
                    <div className="space-y-1"><Label className="text-slate-400 text-xs">Attach Template Asset File</Label><Input type="file" className="bg-slate-950 border-slate-800 rounded-xl text-xs h-10 pt-2 text-slate-400" onChange={(e) => setAssignFile(e.target.files?.[0] || null)} /></div>
                  </div>
                  <Button type="button" onClick={() => void handleAddAssignment()} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl w-full h-11">Deploy Activity Vector</Button>
                </div>
              </div>
            </div>
          )}

          {/* EXAM CONTROL BOARD NODES */}
          {isProfessor && activeTab === 'exams' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 gap-4 flex-wrap">
                <div>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Evaluation Control Board</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Generate customized verification layers with integrity policies.</p>
                </div>
                <Button type="button" className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl h-10" onClick={() => setShowCreateAssessment(true)}>
                  Create Assessment Exam
                </Button>
              </div>
              {assessments.length > 0 ? (
                <div className="space-y-4 w-full">
                  {assessments.map((a) => (
                    <div key={a.id} className="border border-slate-800 bg-[#070420]/45 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl w-full">
                      <div className="bg-slate-900/60 border-b border-slate-800/60 py-4 px-5 flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono font-bold text-indigo-400 uppercase">Exam Cluster</span>
                          <h3 className="text-base font-semibold text-slate-100 mt-2">{a.title}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-xl bg-indigo-950/20 hover:bg-indigo-950/45 text-indigo-300 border border-indigo-500/25 text-xs px-3"
                            onClick={() => setEditAdvancedAssessment(a)}
                          >
                            Reopen & Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 rounded-xl bg-rose-950/20 hover:bg-rose-950/45 text-rose-300 border border-rose-500/25 text-xs px-3"
                            onClick={() => {
                              removeAssessment(course.id, a.id);
                              toast.success('Exam entry deleted.');
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="border border-slate-800/80 bg-[#070420]/20 p-10 text-center text-slate-500 rounded-2xl w-full">No assessment parameters active.</div>}
            </div>
          )}

          {/* ANNOUNCEMENTS BROADCASTING SEQUENCE */}
          {activeTab === 'announcements' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">System Broadcasting Grid</h2>
              {isProfessor && (
                <div className="border border-slate-800 bg-[#070420]/35 backdrop-blur-md rounded-2xl p-4 space-y-3 w-full">
                  <Textarea placeholder="Formulate message sequence across recipients..." value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} rows={3} className="bg-slate-950 border-slate-800 text-slate-200 rounded-xl" />
                  <Button type="button" onClick={handleSendAnnouncement} className="bg-indigo-600 text-white rounded-xl h-9 text-xs px-4">Transmit Broadcasting Message</Button>
                </div>
              )}
              {announcements.length > 0 ? (
                <div className="space-y-3">
                  {announcements.map((ann) => (
                    <div key={ann.id} className="border border-slate-800 bg-[#070420]/35 backdrop-blur-md rounded-2xl p-4 shadow-md">
                      <p className="text-sm text-slate-300">{ann.text}</p>
                      <p className="text-[10px] text-slate-500 mt-2">{new Date(ann.date).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic pl-1">No announcements broadcast yet.</p>
              )}
            </div>
          )}

        </main>

      </div>

      {/* CREATE MODULE ROCKET DIALOG CONSOLE */}
      {showAddModule && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg border border-indigo-500/30 bg-gradient-to-b from-[#0a052e] via-[#040217] to-[#02010c] text-slate-100 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.25)] overflow-visible animate-in zoom-in-95 duration-200 relative p-2">
            <div className="absolute top-[-52px] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
              <div className="relative flex items-center justify-center h-20 w-20">
                <div className="absolute h-24 w-24 rounded-full border border-cyan-500/20 animate-spin opacity-40" />
                <div className="absolute h-16 w-16 rounded-full bg-gradient-to-t from-indigo-600 to-cyan-400 blur-xl opacity-70 animate-pulse shadow-[0_0_30px_#06b6d4]" />
                <Rocket className="w-9 h-9 text-white relative z-10 drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] transform -rotate-45" />
              </div>
            </div>
            <CardHeader className="pt-16 pb-2 text-center border-0 bg-transparent">
              <CardTitle className="text-2xl font-extrabold tracking-wide text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]">
                Add a Lesson Module
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 px-6 pb-6 pt-2">
              <div className="border border-indigo-500/20 bg-[#030019]/60 rounded-2xl p-5 space-y-4 shadow-inner">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-indigo-300/90">Lesson Title</Label>
                  <Input
                    placeholder="e.g. Introduction to Cybersecurity"
                    value={newModuleTitle}
                    className="bg-[#040114]/90 border border-slate-800 text-slate-200 h-11 rounded-xl px-4 focus-visible:ring-indigo-500/40 text-sm placeholder:text-slate-600 transition-all"
                    onChange={(e) => setNewModuleTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2 pt-1">
                  <Label className="text-xs font-bold uppercase tracking-wider text-indigo-300/90">Optional: Attach Files or Resources</Label>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => addModuleFileInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') addModuleFileInputRef.current?.click(); }}
                    className="border border-dashed border-indigo-500/30 rounded-xl p-6 text-center bg-[#02000c]/80 hover:bg-[#04011c] hover:border-cyan-500/40 transition-all cursor-pointer group shadow-inner"
                  >
                    <input ref={addModuleFileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" onChange={handleAddModuleFileSelect} className="hidden" />
                    <Upload className="w-5 h-5 text-indigo-400 group-hover:text-cyan-400 transition-colors mx-auto mb-2 drop-shadow-[0_0_4px_rgba(99,102,241,0.4)]" />
                    <p className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">Upload documents</p>
                    {newModuleFiles.length > 0 && (
                      <p className="text-xs text-emerald-400 font-bold mt-2 bg-emerald-950/20 border border-emerald-500/20 py-1 rounded-lg px-2 w-fit mx-auto">{newModuleFiles.length} file(s) attached</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-900/60 mt-2">
                <Button
                  type="button"
                  onClick={() => void handleAddModule()}
                  className="flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl h-11 text-xs tracking-wider uppercase shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all"
                >
                  Create Module
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-slate-400 hover:text-white hover:bg-slate-900/40 text-xs font-semibold px-4 tracking-wider h-11"
                  onClick={() => { setShowAddModule(false); setNewModuleTitle(''); setNewModuleFiles([]); }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CORE FRAMEWORK INTERACTION OVERLAYS */}
      <CreateCourseAssessmentDialog open={showCreateAssessment} onOpenChange={setShowCreateAssessment} courseId={String(course.id)} modules={modules} onCreate={handleCreateAssessment} />
      <EditAssessmentAdvancedDialog
        open={Boolean(editAdvancedAssessment)}
        assessment={editAdvancedAssessment}
        onOpenChange={(open) => {
          if (!open) setEditAdvancedAssessment(null);
        }}
        onSave={(patch) => {
          if (!editAdvancedAssessment) return;
          
          const updated = {
            ...editAdvancedAssessment,
            ...patch,
            activeExamDetectors: undefined,
          };
          
          updateAssessment(course.id, editAdvancedAssessment.id, updated);

          void saveCourseAssessmentToFirestore(course.id, updated).catch((e) => {
            console.error("Failed to save edited assessment:", e);
          });
        }}
      />
      <AssessmentStartDialog open={Boolean(takeExamModal)} assessment={takeExamModal} courseId={course.id} studentId={studentId} isEnrolledInCourse={isProfessor || isStudentEnrolled} isWithinDueWindow={takeExamModal ? isExamWithinDueWindow(takeExamModal) : true} onOpenChange={(open) => { if (!open) setTakeExamModal(null); }} onStart={handleStudentStartAssessment} />
    </MotionBackground>
  );
};

function ModuleItemRow({
  item,
  isProfessor,
  courseId,
  moduleId,
  showPdfViewerButton = false,
}: {
  item: ModuleItem;
  isProfessor: boolean;
  courseId: string;
  moduleId: string;
  showPdfViewerButton?: boolean;
}) {
  const [inlinePdfOpen, setInlinePdfOpen] = useState(false);

  const resolvePdfUrl = async (): Promise<string> => {
    if (item.downloadUrl && String(item.downloadUrl).startsWith('http')) return String(item.downloadUrl);
    if (item.dataUrl && String(item.dataUrl).startsWith('data:application/pdf')) return String(item.dataUrl);
    if (item.storageUrl) {
      const storage = getStorage();
      const fileRef = ref(storage, item.storageUrl);
      return await getDownloadURL(fileRef);
    }
    throw new Error('Asset unresolvable.');
  };

  const openPdfFullscreen = async () => {
    let resolvedUrl: string | null = null;
    try {
      resolvedUrl = await resolvePdfUrl();
    } catch (e) {
      console.warn('PDF URL resolution failed, checking fileContent fallback:', e);
    }

    const w = window.open('about:blank', '_blank');
    if (!w) { setInlinePdfOpen(true); return; }

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
      toast.error('Failed to resolve or open PDF document.');
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 p-3.5 hover:bg-indigo-950/20 rounded-xl border border-slate-800/50 bg-[#05021a]/60 transition-all shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 shrink-0">
          <FileText className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.4)]" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-200 text-sm truncate">{item.title}</p>
          {/* FIX: was `${ }` inside a regular string — changed to proper template literal */}
          <p className="text-[11px] text-slate-500 truncate mt-0.5">
            {`PDF Document • ${(item.fileSize / 1024).toFixed(1)} KB`}
          </p>
        </div>
      </div>
      {showPdfViewerButton && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-slate-800 bg-slate-950/40 text-cyan-400 hover:text-white hover:bg-slate-900 rounded-xl h-8 text-xs font-medium px-4 shadow-sm"
          onClick={() => void openPdfFullscreen()}
        >
          Open Document
        </Button>
      )}
    </div>
  );
}