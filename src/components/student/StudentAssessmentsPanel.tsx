import { useMemo } from 'react';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import type { Session, CourseAssessment } from '@/context/SessionContext';
import {
  FileCheck2,
  Clock,
  Calendar,
  Trophy,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  ChevronRight,
} from 'lucide-react';

interface StudentAssessmentsPanelProps {
  onNavigate?: (tab: string) => void;
  onStartCourseExam?: (ctx: { courseId: string; courseTitle: string; assessment: CourseAssessment }) => void;
}

type AssessmentStatus = 'submitted' | 'overdue' | 'upcoming' | 'open';

type FlatAssessment = {
  key: string;
  courseId: string;
  courseTitle: string;
  courseAccentIndex: number;
  assessment: CourseAssessment;
  status: AssessmentStatus;
  studentScore: number | null;
  maxScore: number;
};

const ACCENT_COLORS = [
  { bg: 'from-blue-600 to-blue-800', badge: 'bg-blue-100 text-blue-800' },
  { bg: 'from-violet-600 to-violet-800', badge: 'bg-violet-100 text-violet-800' },
  { bg: 'from-emerald-600 to-emerald-800', badge: 'bg-emerald-100 text-emerald-800' },
  { bg: 'from-rose-600 to-rose-800', badge: 'bg-rose-100 text-rose-800' },
  { bg: 'from-amber-600 to-amber-800', badge: 'bg-amber-100 text-amber-800' },
  { bg: 'from-cyan-600 to-cyan-800', badge: 'bg-cyan-100 text-cyan-800' },
];

function getAccent(idx: number) {
  return ACCENT_COLORS[idx % ACCENT_COLORS.length];
}

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

function enrolledCourses(sessions: Session[], studentId: string): Session[] {
  if (!studentId) return [];
  const sid = String(studentId);
  return sessions.filter(
    (s) => s.type === 'course' && (s.enrolledStudents ?? []).some((id) => String(id) === sid)
  );
}

const STATUS_CONFIG: Record<AssessmentStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  submitted: { label: 'Submitted', icon: CheckCircle2, color: 'text-emerald-600' },
  overdue:   { label: 'Overdue',   icon: AlertCircle,  color: 'text-rose-600'    },
  upcoming:  { label: 'Upcoming',  icon: Clock,        color: 'text-amber-600'   },
  open:      { label: 'Open',      icon: FileCheck2,   color: 'text-blue-600'    },
};

const STATUS_ORDER: Record<AssessmentStatus, number> = {
  open: 0, overdue: 1, upcoming: 2, submitted: 3,
};

export const StudentAssessmentsPanel = ({ onNavigate, onStartCourseExam }: StudentAssessmentsPanelProps) => {
  const { sessions } = useSession();
  const { user } = useAuth();
  const studentId = resolveEnrollmentStudentId(user);

  const flatAssessments = useMemo<FlatAssessment[]>(() => {
    const courses = enrolledCourses(sessions, studentId);
    const rows: FlatAssessment[] = [];
    for (const course of courses) {
      for (const assessment of course.assessments ?? []) {
        const { status, score } = resolveStatus(assessment, studentId);
        rows.push({
          key: `${course.id}-${assessment.id}`,
          courseId: String(course.id),
          courseTitle: course.title,
          courseAccentIndex: course.courseAccentIndex ?? 0,
          assessment,
          status,
          studentScore: score,
          maxScore: assessment.maxScore ?? 100,
        });
      }
    }
    rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    return rows;
  }, [sessions, studentId]);

  // Group by course for summary pills
  const courseSummary = useMemo(() => {
    const map = new Map<string, { title: string; total: number; submitted: number; accentIdx: number }>();
    for (const row of flatAssessments) {
      const existing = map.get(row.courseId) ?? { title: row.courseTitle, total: 0, submitted: 0, accentIdx: row.courseAccentIndex };
      existing.total += 1;
      if (row.status === 'submitted') existing.submitted += 1;
      map.set(row.courseId, existing);
    }
    return Array.from(map.values());
  }, [flatAssessments]);

  const openCount = flatAssessments.filter((r) => r.status === 'open').length;
  const overdueCount = flatAssessments.filter((r) => r.status === 'overdue').length;
  const submittedCount = flatAssessments.filter((r) => r.status === 'submitted').length;

  const handleStart = (row: FlatAssessment) => {
    if (onStartCourseExam) {
      onStartCourseExam({ courseId: row.courseId, courseTitle: row.courseTitle, assessment: row.assessment });
    } else {
      // fallback: navigate to my-courses and let the user start from there
      sessionStorage.setItem('courseDetailsInitialTab', 'assessments');
      onNavigate?.('my-courses');
      window.setTimeout(() => { window.location.hash = `course=${row.courseId}`; }, 0);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow">
          <FileCheck2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Assessments</h1>
          <p className="text-xs text-muted-foreground">All quizzes and exams across your courses</p>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Open', count: openCount, color: 'bg-blue-50 border-blue-200 text-blue-700', dot: 'bg-blue-500' },
          { label: 'Overdue', count: overdueCount, color: 'bg-rose-50 border-rose-200 text-rose-700', dot: 'bg-rose-500' },
          { label: 'Submitted', count: submittedCount, color: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' },
        ].map(({ label, count, color, dot }) => (
          <div key={label} className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${color}`}>
            <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${dot}`} />
            <span className="text-2xl font-bold tabular-nums">{count}</span>
            <span className="text-xs font-medium">{label}</span>
          </div>
        ))}
      </div>

      {/* Course Pills */}
      {courseSummary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {courseSummary.map((c) => {
            const accent = getAccent(c.accentIdx);
            return (
              <span key={c.title} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${accent.badge}`}>
                <BookOpen className="h-3 w-3" />
                {c.title} — {c.submitted}/{c.total} done
              </span>
            );
          })}
        </div>
      )}

      {/* Assessment Cards */}
      {flatAssessments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <FileCheck2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No assessments yet</p>
          <p className="text-xs text-muted-foreground/70">
            Assessments will appear here once your instructors create them.
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('my-courses')}
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Browse my courses <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {flatAssessments.map((row) => {
            const accent = getAccent(row.courseAccentIndex);
            const cfg = STATUS_CONFIG[row.status];
            const StatusIcon = cfg.icon;
            const canStart = row.status === 'open' || row.status === 'upcoming';

            return (
              <div
                key={row.key}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Color top bar */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${accent.bg}`} />

                <div className="flex items-center gap-4 px-4 py-3.5">
                  {/* Left: info */}
                  <div className="flex flex-1 flex-col gap-1 min-w-0">
                    {/* Course badge */}
                    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${accent.badge}`}>
                      <BookOpen className="h-2.5 w-2.5" />
                      {row.courseTitle}
                    </span>

                    {/* Title */}
                    <p className="truncate text-sm font-bold text-foreground">{row.assessment.title}</p>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {row.assessment.duration ?? 30} min
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        {row.assessment.questions ?? row.assessment.questionItems?.length ?? 0} questions · Max {row.maxScore} pts
                      </span>
                      {row.assessment.dueDate && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Due {new Date(row.assessment.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: status + action */}
                  <div className="flex flex-shrink-0 flex-col items-end gap-2">
                    {/* Status */}
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${cfg.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </span>

                    {/* Score if submitted */}
                    {row.status === 'submitted' && row.studentScore !== null && (
                      <span className="text-xs font-bold text-foreground tabular-nums">
                        {row.studentScore} / {row.maxScore}
                      </span>
                    )}

                    {/* Action button */}
                    {canStart ? (
                      <button
                        type="button"
                        onClick={() => handleStart(row)}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700 active:scale-95 transition-all"
                      >
                        Start <ChevronRight className="h-3 w-3" />
                      </button>
                    ) : row.status === 'submitted' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                        <AlertCircle className="h-3 w-3" /> Missed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
