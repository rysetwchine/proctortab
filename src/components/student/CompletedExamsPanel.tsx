import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import type { CourseAssessment, Session } from '@/context/SessionContext';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

type CompletedRow = {
  key: string;
  courseId: string;
  courseTitle: string;
  assessment: CourseAssessment;
  submittedAtMs: number;
  submittedAtLabel: string;
};

function collectCompletedExams(courses: Session[], studentId: string): CompletedRow[] {
  const sid = String(studentId || '');
  if (!sid) return [];
  const rows: CompletedRow[] = [];

  for (const c of courses) {
    for (const a of c.assessments || []) {
      if (a.assessmentType === 'quiz') continue;
      const sub = (a.submissions || []).find((s) => String(s.studentId) === sid);
      if (!sub?.submittedAt) continue;
      const ms = new Date(sub.submittedAt).getTime();
      rows.push({
        key: `${c.id}-${a.id}-${sub.submittedAt}`,
        courseId: String(c.id),
        courseTitle: c.title,
        assessment: a,
        submittedAtMs: Number.isNaN(ms) ? 0 : ms,
        submittedAtLabel: Number.isNaN(ms) ? '' : new Date(ms).toLocaleString(),
      });
    }
  }

  rows.sort((x, y) => y.submittedAtMs - x.submittedAtMs);
  return rows;
}

interface CompletedExamsPanelProps {
  onNavigate?: (tab: string) => void;
}

export function CompletedExamsPanel({ onNavigate }: CompletedExamsPanelProps) {
  const { sessions } = useSession();
  const { user } = useAuth();
  const sid = resolveEnrollmentStudentId(user);

  const courses = useMemo(() => {
    const s = String(sid || '');
    if (!s) return [];
    return sessions.filter(
      (x) => x.type === 'course' && (x.enrolledStudents ?? []).some((id) => String(id) === s)
    );
  }, [sessions, sid]);

  const completed = useMemo(() => collectCompletedExams(courses, String(sid || '')), [courses, sid]);

  const openInCourseScores = (courseId: string) => {
    sessionStorage.setItem('courseDetailsInitialTab', 'scores');
    onNavigate?.('my-courses');
    window.setTimeout(() => {
      window.location.hash = `course=${courseId}`;
    }, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onNavigate?.('dashboard')}
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-3xl font-bold truncate">Completed Assessments</h2>
          </div>
          <p className="text-muted-foreground mt-1">
            Assessments you already submitted ({completed.length})
          </p>
        </div>
      </div>

      {completed.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-semibold">No completed assessments yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              When you submit an assessment, it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {completed.map((row) => {
            const sub = (row.assessment.submissions || []).find((s) => String(s.studentId) === String(sid || ''));
            const score =
              sub?.score != null && sub?.maxScore
                ? `${sub.score} / ${sub.maxScore}`
                : sub?.score != null
                  ? String(sub.score)
                  : '—';

            return (
              <Card key={row.key} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate">{row.assessment.title}</span>
                    <Badge variant="secondary" className="shrink-0">
                      Completed
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground truncate">{row.courseTitle}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Submitted</span>
                    <span className="tabular-nums">{row.submittedAtLabel || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Score</span>
                    <span className="font-semibold tabular-nums">{score}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => openInCourseScores(row.courseId)}
                  >
                    View in course
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
