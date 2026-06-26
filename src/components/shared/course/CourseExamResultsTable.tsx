import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, type Timestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import type { CourseAssessment } from '@/context/SessionContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type ExamResultRow = {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName?: string;
  score: number;
  totalItems: number;
  submittedAt: Date | null;
};

function toDate(ts: Timestamp | { toDate?: () => Date } | null | undefined): Date | null {
  if (!ts) return null;
  if (typeof (ts as Timestamp).toDate === 'function') return (ts as Timestamp).toDate();
  return null;
}

export function CourseExamResultsTable({
  courseId,
  assessments,
}: {
  courseId: string;
  assessments: CourseAssessment[];
}) {
  const [rowsByExam, setRowsByExam] = useState<Record<string, ExamResultRow[]>>({});

  const examMap = useMemo(
    () => new Map(assessments.map((a) => [a.id, a.title] as const)),
    [assessments]
  );

  useEffect(() => {
    if (!courseId || assessments.length === 0) {
      setRowsByExam({});
      return;
    }

    const unsubs: Array<() => void> = [];

    assessments.forEach((exam) => {
      const examId = exam.id;
      const colRef = collection(db, 'courses', courseId, 'exams', examId, 'results');

      const unsub = onSnapshot(
        colRef,
        (snap) => {
          const rows: ExamResultRow[] = snap.docs.map((d) => {
            const data = d.data() as {
              studentId?: string;
              studentName?: string;
              score?: number;
              totalItems?: number;
              timestamp?: Timestamp;
            };
            return {
              id: d.id,
              examId,
              examTitle: examMap.get(examId) ?? exam.title,
              studentId: String(data.studentId ?? d.id),
              studentName: data.studentName,
              score: typeof data.score === 'number' ? data.score : 0,
              totalItems: typeof data.totalItems === 'number' ? data.totalItems : 0,
              submittedAt: toDate(data.timestamp),
            };
          });
          rows.sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));
          setRowsByExam((prev) => ({ ...prev, [examId]: rows }));
        },
        (err) => {
          console.warn('Exam results listener failed', examId, err);
          setRowsByExam((prev) => ({ ...prev, [examId]: [] }));
        }
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [courseId, assessments, examMap]);

  const flatRows = useMemo(() => {
    const out: ExamResultRow[] = [];
    assessments.forEach((a) => {
      const r = rowsByExam[a.id];
      if (r?.length) out.push(...r);
    });
    return out.sort((a, b) => {
      const ta = a.submittedAt?.getTime() ?? 0;
      const tb = b.submittedAt?.getTime() ?? 0;
      return tb - ta;
    });
  }, [assessments, rowsByExam]);

  if (assessments.length === 0) return null;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Assessment submissions (Firestore)</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Live updates from{' '}
          <span className="font-mono text-xs">courses/{courseId}/exams/…/results</span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Assessment</th>
                <th className="px-3 py-2 text-left font-semibold">Student</th>
                <th className="px-3 py-2 text-left font-semibold">Score</th>
                <th className="px-3 py-2 text-left font-semibold">Items</th>
                <th className="px-3 py-2 text-left font-semibold">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {flatRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No automated submissions yet. Scores appear when students finish an assessment.
                  </td>
                </tr>
              ) : (
                flatRows.map((row) => (
                  <tr key={`${row.examId}-${row.id}`} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium">{row.examTitle}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span>{row.studentName || '—'}</span>
                        <span className="font-mono text-xs text-muted-foreground">{row.studentId}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-semibold">{row.score}</td>
                    <td className="px-3 py-2">{row.totalItems}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.submittedAt ? row.submittedAt.toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
