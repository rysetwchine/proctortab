import type { Question } from '@/types';
import type { AssessmentSubmission, CourseAssessment } from '@/context/SessionContext';
import { examQuestions } from '@/data/questions';
import { resolveAssessmentQuestionBank } from '@/utils/courseExamQuestions';
import { cleanMultipleChoiceOptions, cleanTrueFalseOptions } from '@/utils/questionValidator';

function shuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  for (let i = arr.length - 1; i > 0; i -= 1) {
    h = (h * 9301 + 49297) % 233280;
    const j = Math.abs(h) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getBaseQuestionsForAssessment(assessment: CourseAssessment): Question[] {
  const count = assessment.questions ?? assessment.questionItems?.length ?? 0;
  if (assessment.questionItems?.length) {
    return resolveAssessmentQuestionBank(assessment.questionItems, count);
  }
  if (count > 0) {
    return examQuestions.slice(0, Math.min(count, examQuestions.length));
  }
  return examQuestions;
}

export function prepareExamQuestions(
  assessment: CourseAssessment,
  sessionSeed: string
): Question[] {
  let list = getBaseQuestionsForAssessment(assessment);

  // DEFENSIVE: Drop any null/undefined or otherwise malformed question entries.
  // This can happen when a question bank reference no longer resolves to a real
  // question (e.g. a deleted question still referenced by an old assessment).
  // Without this guard, a single bad entry crashes the whole exam screen.
  list = (list || []).filter(
    (q): q is Question => !!q && typeof q === 'object' && q.id !== undefined
  );

  // CRITICAL: Normalize options at runtime so the exam/quiz UI is always consistent.
  // - Multiple-choice must have 4 options (A/B/C/D)
  // - True/False must have exactly 2 options: ["True", "False"]
  // This also repairs older saved assessments that may have wrong option counts.
  list = list.map((q) => {
    if (q.type === 'multiple-choice') return cleanMultipleChoiceOptions(q);
    if (q.type === 'true-false') return cleanTrueFalseOptions(q);
    return q;
  });

  if (assessment.randomizeQuestions) {
    list = shuffle(list, `${sessionSeed}-q`);
  }

  if (assessment.randomizeChoices) {
    list = list.map((q, index) => {
      const options = shuffle(q.options || [], `${sessionSeed}-c-${q.id}-${index}`);
      return {
        ...q,
        id: index + 1,
        options,
        correctAnswer: q.correctAnswer,
      };
    });
  } else {
    list = list.map((q, index) => ({ ...q, id: index + 1 }));
  }

  return list;
}

function attemptStorageKey(courseId: string, assessmentId: string, studentId: string): string {
  return `proctortab_attempts_${courseId}_${assessmentId}_${studentId}`;
}

export function getAttemptCount(
  courseId: string,
  assessmentId: string,
  studentId: string
): number {
  try {
    const raw = localStorage.getItem(attemptStorageKey(courseId, assessmentId, studentId));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { count?: number };
    return typeof parsed.count === 'number' ? parsed.count : 0;
  } catch {
    return 0;
  }
}

export function recordAttempt(
  courseId: string,
  assessmentId: string,
  studentId: string
): number {
  const next = getAttemptCount(courseId, assessmentId, studentId) + 1;
  localStorage.setItem(
    attemptStorageKey(courseId, assessmentId, studentId),
    JSON.stringify({ count: next, lastAt: new Date().toISOString() })
  );
  return next;
}

export function canStartAttempt(
  assessment: CourseAssessment,
  courseId: string,
  studentId: string
): { allowed: boolean; used: number; max: number } {
  const max = Math.max(assessment.maxAttempts ?? 1, 1);
  const used = getAttemptCount(courseId, assessment.id, studentId);
  return { allowed: used < max, used, max };
}

export function mergeAssessmentSubmission(
  existing: AssessmentSubmission[] | undefined,
  next: AssessmentSubmission
): AssessmentSubmission[] {
  const list = [...(existing ?? [])];
  const idx = list.findIndex((s) => s.studentId === next.studentId);
  if (idx === -1) list.push(next);
  else list[idx] = { ...list[idx], ...next };
  return list;
}