import { useMemo } from 'react';
import { MotionBackground } from '@/components/shared/MotionBackground';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CourseAssessment } from '@/context/SessionContext';

// Aggregates grades across all enrolled courses.
// Grades are computed using the existing in-memory session assessments/submissions.

export function GradesAllCoursesPage() {
  const { sessions } = useSession();
  const { user } = useAuth();
  const studentId = resolveEnrollmentStudentId(user);

  const enrolledCourses = useMemo(() => {
    if (!studentId) return [];
    const sid = String(studentId);
    return sessions.filter(
      (s) => s.type === 'course' && (s.enrolledStudents ?? []).some((id) => String(id) === sid)
    );
  }, [sessions, studentId]);

  const allAssessments = useMemo(() => {
    return enrolledCourses.flatMap((c) => c.assessments ?? []).map((a: any) => ({ ...a, __course: c }));
  }, [enrolledCourses]);

  const studentRows = useMemo(() => {
    const sid = String(studentId);
    return allAssessments
      .filter((a: any) => (a.submissions ?? []).some((s: any) => String(s.studentId) === sid))
      .map((a: any) => {
        const sub = (a.submissions ?? []).find((s: any) => String(s.studentId) === sid);
        const score = sub?.score;
        return {
          assessmentId: a.id,
          assessmentTitle: a.title,
          courseTitle: a.__course?.title ?? a.__course?.name ?? 'Course',
          maxScore: a.maxScore ?? 100,
          score: score,
          submittedAt: sub?.submittedAt,
        };
      })
      .sort((x, y) => String(y.submittedAt ?? '').localeCompare(String(x.submittedAt ?? '')));
  }, [allAssessments, studentId]);

  const scoreSummary = (row: { score: any; maxScore: number }) => {
    if (row.score == null || Number.isNaN(row.score)) return '—';
    return `${row.score} / ${row.maxScore}`;
  };

  return (
    <MotionBackground>
      <div className="space-y-6 animate-in fade-in duration-200">
        <h2 className="text-xl font-bold text-slate-100">Grades</h2>
        <p className="text-xs text-slate-500">All grades across your enrolled courses.</p>

        <div className="overflow-hidden border border-slate-800/80 bg-[#070420]/40 backdrop-blur-md rounded-2xl shadow-xl w-full">
          <Table className="w-full border-collapse text-sm text-slate-300">
            <TableHeader>
              <TableRow className="bg-slate-900/60 border-b border-slate-800/80 text-slate-400">
                <TableHead className="px-4 py-3 text-left">Course</TableHead>
                <TableHead className="px-4 py-3 text-left">Assessment</TableHead>
                <TableHead className="px-4 py-3 text-left">Performance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-900/60">
              {studentRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="px-4 py-10 text-center text-slate-500">
                    No grades available.
                  </TableCell>
                </TableRow>
              ) : (
                studentRows.map((row) => (
                  <TableRow key={`${row.courseTitle}-${row.assessmentId}`} className="hover:bg-slate-900/20">
                    <TableCell className="px-4 py-4 font-medium text-slate-200">{row.courseTitle}</TableCell>
                    <TableCell className="px-4 py-4">{row.assessmentTitle}</TableCell>
                    <TableCell className="px-4 py-4 text-xs font-bold text-indigo-400">{scoreSummary(row)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Card className="border-slate-800/80 bg-[#070420]/20 p-4">
          <CardHeader className="p-0">
            <CardTitle className="text-sm text-slate-300">Note</CardTitle>
          </CardHeader>
          <CardContent className="p-0 mt-2">
            Scores are derived from the existing session assessment submissions (same data used by Course Details).
          </CardContent>
        </Card>
      </div>
    </MotionBackground>
  );
}

