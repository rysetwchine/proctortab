import { useState, useEffect } from 'react';
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/hooks/useSession';
import { formatJoinCode } from '@/utils/codeGenerator';
import { BookOpen, Users, Copy, Plus, CheckCircle, GraduationCap, Sparkles } from 'lucide-react';
import { CourseDetails } from '@/components/instructor/Coursedetails';
import { CourseEnrolledStudents } from './CourseEnrolledStudents';
import { ExamInterface } from '@/components/shared/exam/ExamInterface';
import type { ExamFinishPayload } from '@/components/shared/exam/ExamInterface';
import { ScoreDisplay } from '@/components/shared/exam/ScoreDisplay';
import type { CourseAssessment } from '@/context/SessionContext';
import {
  getCurrentOwnerUid,
  getProfessorDisplayName,
  readStoredUser,
  resolveCourseInstructorName,
} from '@/utils/storedUser';
import { nextCourseAccentIndex } from '@/utils/courseSwatch';
import { toast } from 'sonner';
import { MotionBackground } from '@/components/shared/MotionBackground';
interface CoursesPanelProps {
  onNavigate?: (tab: string) => void;
}

export const CoursesPanel = ({ onNavigate }: CoursesPanelProps) => {
  const { sessions, createSession, deleteSession } = useSession();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<CourseAssessment | null>(null);
  const [examMode, setExamMode] = useState(false);
  const [professorExamSummary, setProfessorExamSummary] = useState<{
    assessment: CourseAssessment;
    payload: ExamFinishPayload;
  } | null>(null);
  const [rosterCourseId, setRosterCourseId] = useState<string | null>(null);

  // Pure React navigation for course details.
  // This prevents tab "snapping" back to Dashboard when the URL hash changes.
  // Also reset other local view states to avoid accidental fallback renders.
  const handleCourseClick = (courseId: string) => {
    setRosterCourseId(null);
    setSelectedCourse(courseId);
    setSelectedExam(null);
    setExamMode(false);
    setProfessorExamSummary(null);
  };

  const handleBack = () => {
    setSelectedCourse(null);
  };

  const stored = readStoredUser();
  const myOwnerUid = getCurrentOwnerUid();
  const isProfessor = String(stored.role || '').toLowerCase() === 'professor';

  const allCourseSessions = sessions.filter((s) => s.type === 'course');
  const courses =
    isProfessor && myOwnerUid
      ? allCourseSessions.filter((c) => !c.ownerUid || c.ownerUid === myOwnerUid)
      : allCourseSessions;

  const totalStudents = courses.reduce((sum, c) => sum + (c.enrolledStudents?.length || 0), 0);

  const rosterCourse = rosterCourseId ? courses.find((c) => c.id === rosterCourseId) : undefined;
  if (rosterCourse) {
    return (
      <CourseEnrolledStudents
        course={rosterCourse}
        onBack={() => setRosterCourseId(null)}
      />
    );
  }

  if (selectedCourse) {
    const course = courses.find(c => c.id === selectedCourse);
    if (course) {
      if (professorExamSummary) {
        return (
          <div
            className="fixed inset-0 z-[100] bg-background overflow-y-auto"
            role="dialog"
            aria-label="Assessment results"
          >
            <ScoreDisplay
              answers={professorExamSummary.payload.answers}
              sessionQuestions={professorExamSummary.payload.sessionQuestions}
              assessment={professorExamSummary.assessment}
              onReturnToDashboard={() => setProfessorExamSummary(null)}
            />
          </div>
        );
      }

      if (examMode && selectedExam) {
        return (
          <div
            className="fixed inset-0 z-[100] bg-background overflow-y-auto"
            role="dialog"
            aria-label="Assessment"
          >
            <ExamInterface
              assessment={selectedExam}
              examContext={{
                courseTitle: course.title,
                examTitle: selectedExam.title,
                assessmentId: selectedExam.id,
              }}
              onFinish={(payload) => {
                setProfessorExamSummary({ assessment: selectedExam, payload });
                setExamMode(false);
                setSelectedExam(null);
              }}
            />
          </div>
        );
      }

      return (
        <CourseDetails
          course={{
            id: course.id,
            name: course.title,
            instructor: resolveCourseInstructorName(course),
            thumbnail: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&q=80',
          }}
          onBack={handleBack}
          onStartExam={(ctx) => {
            setSelectedExam(ctx.assessment);
            setExamMode(true);
          }}
          onNavigate={onNavigate}
        />
      );
    }
  }

  const handleCreateCourse = async () => {
    if (!newCourseTitle.trim()) return;

    const instructorName = getProfessorDisplayName();
    const ownerUid = getCurrentOwnerUid();
    const courseAccentIndex = nextCourseAccentIndex(sessions.filter((s) => s.type === 'course').length);

    const created = createSession({
      title: newCourseTitle,
      type: 'course',
      status: 'active',
      enrolledStudents: [],
      description: 'New course created',
      instructorName,
      courseAccentIndex,
      ...(ownerUid ? { ownerUid } : {}),
    });

    // SAVE TO FIREBASE (so other devices can join by code)
    const joinCodeNormalized = String(created.joinCode || '')
      .replace(/[-\s]/g, '')
      .toUpperCase();
    try {
      await setDoc(
        doc(db, "courses", String(created.id)),
        {
          title: created.title,
          type: created.type,
          status: created.status,
          joinCode: created.joinCode,
          joinCodeNormalized,
          instructorName: created.instructorName || '',
          ownerUid: created.ownerUid || '',
          courseAccentIndex: typeof created.courseAccentIndex === 'number' ? created.courseAccentIndex : 0,
          enrolledStudents: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error('[CoursesPanel] Failed to save course to Firestore:', e);
      toast.error(
        'Course was created locally, but failed to sync to cloud. Other devices will not be able to join until this is fixed (check Firestore rules / authentication).'
      );
    }

    setNewCourseTitle('');
    setShowCreateForm(false);
  };

  const copyJoinCode = async (code: string) => {
    const formattedCode = formatJoinCode(code);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(formattedCode);
      } else {
        // Fallback for older browsers or restricted iframes
        const textArea = document.createElement("textarea");
        textArea.value = formattedCode;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Fallback copy failed', err);
        }
        textArea.remove();
      }
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Still show copied state to user even if it failed in preview
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  return (
    <MotionBackground>
      <div className="space-y-8 relative min-h-[calc(100vh-100px)]">

        {/* ---------- Hero ---------- */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-8 md:p-10 shadow-2xl">
          {/* Ambient gradient glow */}
          <div className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />

          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="flex items-center gap-5">
              {/* Glowing ring icon */}
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 rounded-full bg-cyan-400/40 blur-xl animate-pulse" />
                <div className="relative flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-950 ring-2 ring-cyan-400/60 shadow-[0_0_25px_rgba(34,211,238,0.45)]">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30" />
                  <GraduationCap className="relative w-8 h-8 md:w-10 md:h-10 text-cyan-300" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-widest mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isProfessor ? 'Instructor workspace' : 'Learning workspace'}</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                  Your Courses
                </h2>
                <p className="text-slate-400 mt-1 text-sm md:text-base">
                  {courses.length === 0
                    ? 'Build your first course and bring students in with a join code.'
                    : 'Manage rosters, share join codes, and launch assessments.'}
                </p>
              </div>
            </div>

            {/* Stats + action */}
            <div className="flex items-center gap-3 self-start md:self-auto">
              {courses.length > 0 && (
                <>
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3 text-center min-w-[92px]">
                    <p className="text-2xl font-bold text-white">{courses.length}</p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400 mt-0.5">
                      {courses.length === 1 ? 'Course' : 'Courses'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3 text-center min-w-[92px]">
                    <p className="text-2xl font-bold text-cyan-400">{totalStudents}</p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400 mt-0.5">Students</p>
                  </div>
                </>
              )}
              {!showCreateForm && courses.length > 0 && (
                <Button
                  onClick={() => setShowCreateForm(true)}
                  className="gap-2 h-[58px] bg-white/[0.04] hover:bg-cyan-500/10 text-white font-semibold px-5 border border-cyan-400/30 hover:border-cyan-400/60 rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4 text-cyan-400" />
                  New Course
                </Button>
              )}
            </div>
          </div>

        </div>

        {/* ---------- Create form ---------- */}
        {showCreateForm && (
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl p-6 space-y-4">
            <h3 className="text-xl font-bold text-white">Create New Course</h3>
            <Input
              placeholder="Enter course title (e.g., Data Structures 101)"
              value={newCourseTitle}
              onChange={(e) => setNewCourseTitle(e.target.value)}
              className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-cyan-500"
            />
            <div className="flex gap-2">
              <Button onClick={handleCreateCourse} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold">
                Create Course
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)} className="bg-slate-800/50 border-slate-600 text-slate-200 hover:bg-slate-700">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ---------- Course grid ---------- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {courses.map((course) => (
            <div key={course.id} className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden hover:shadow-2xl hover:border-cyan-500/30 transition-all duration-300 group">
              <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-b border-slate-700/50 p-6">
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className="absolute inset-0 rounded-lg bg-cyan-400/30 blur-md" />
                    <div className="relative bg-cyan-500/20 p-2 rounded-lg ring-1 ring-cyan-400/40">
                      <BookOpen className="w-6 h-6 text-cyan-400" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-cyan-400 transition-colors">{course.title}</h3>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-300">
                  <span className="font-medium text-slate-100">Instructor:</span>{' '}
                  <span className="text-cyan-400">{resolveCourseInstructorName(course)}</span>
                </p>
                <div className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Join Code</p>
                    <p className="text-2xl font-bold font-mono text-cyan-400 mt-1">{formatJoinCode(course.joinCode)}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => copyJoinCode(course.joinCode)}
                    className={`gap-2 transition-all ${copiedCode === course.joinCode ? 'bg-green-600 hover:bg-green-700' : 'bg-cyan-600 hover:bg-cyan-700'} text-white font-bold`}
                  >
                    {copiedCode === course.joinCode ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold text-white">{course.enrolledStudents.length}</span>
                  <span className="text-slate-400">students enrolled</span>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => setRosterCourseId(course.id)}
                    className="flex-1 bg-slate-800/50 border border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-cyan-400 font-bold"
                  >
                    View Details
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteSession(course.id)}
                    className="bg-red-600/80 hover:bg-red-700 text-white font-bold"
                  >
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleCourseClick(course.id)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                  >
                    Open Course
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {courses.length === 0 && !showCreateForm && (
            <div className="col-span-full text-center py-12">
              <div className="flex justify-center mb-8">
                <div className="relative w-44 h-44 flex items-center justify-center">
                  {/* Spinning multicolor neon ring */}
                  <div
                    className="absolute inset-0 rounded-full animate-[spin_6s_linear_infinite]"
                    style={{
                      background:
                        'conic-gradient(from 0deg, #22d3ee, #818cf8, #f472b6, #fb923c, #22d3ee)',
                      WebkitMask:
                        'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
                      mask:
                        'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
                      filter: 'blur(0.3px)',
                    }}
                  />
                  {/* Soft outer glow */}
                  <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-2xl" />
                  {/* Inner dark disc + icon */}
                  <div className="relative w-32 h-32 rounded-full bg-slate-950/80 flex items-center justify-center">
                    <BookOpen className="w-14 h-14 text-cyan-300/90" strokeWidth={1.5} />
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">No Courses Yet</h3>
              <p className="text-slate-300 mb-6 max-w-md mx-auto">
                Create your first course to get started and begin managing your assessments
              </p>
              <Button onClick={() => setShowCreateForm(true)} className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold px-6 py-2.5 shadow-lg shadow-cyan-500/20 border border-cyan-400/30 rounded-xl">
                <Plus className="w-5 h-5" />
                Create Course
              </Button>
            </div>
          )}
        </div>

      </div>
    </MotionBackground>
  );
};