import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import type { Question } from '@/types';
import type { CourseAssessment } from '@/context/SessionContext';

export type CourseExamResultPayload = {
  studentId: string;
  studentName?: string;
  examId: string;
  courseId: string;
  score: number;
  totalItems: number;
  attemptCount?: number;
};

/**
 * Persists a single submission under:
 * courses/{courseId}/exams/{examId}/results/{studentId}
 */
export async function saveCourseExamResultToFirestore(payload: CourseExamResultPayload): Promise<void> {
  const { courseId, examId, studentId, ...rest } = payload;
  const ref = doc(db, 'courses', courseId, 'exams', examId, 'results', studentId);
  await setDoc(
    ref,
    {
      ...rest,
      studentId,
      examId,
      courseId,
      attemptCount: payload.attemptCount || 1,
      timestamp: serverTimestamp(),
    },
    { merge: true }
  );
}

export function computeGradedExamScore(
  answers: Record<number, string>,
  sessionQuestions: Question[],
  assessment: CourseAssessment
): { score: number; totalItems: number; correctCount: number; maxScore: number } {
  const totalItems = sessionQuestions.length;
  let correctCount = 0;
  sessionQuestions.forEach((q) => {
    const sel = answers[q.id];
    if (sel != null && sel !== '' && sel === q.correctAnswer) correctCount += 1;
  });
  const maxScore = assessment.maxScore ?? 100;
  const score =
    totalItems > 0 ? Math.round((correctCount / totalItems) * maxScore * 100) / 100 : 0;
  return { score, totalItems, correctCount, maxScore };
}
