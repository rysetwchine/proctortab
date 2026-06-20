import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/firebase';
import type { CourseAssessment } from '@/context/SessionContext';
import type { Question } from '@/types';

/**
 * Persist course exams/quizzes to Firestore so they survive refresh/logout/login.
 *
 * Storage layout:
 * - courses/{courseId}/exams/{examId}  (metadata)
 * - courses/{courseId}/exams/{examId}/questions/{questionId} (question items)
 *
 * Notes:
 * - We store questionItems in a subcollection to avoid Firestore document size limits.
 * - This is used for BOTH exam + quiz types (CourseAssessment).
 */

export async function saveCourseAssessmentToFirestore(
  courseId: string,
  assessment: CourseAssessment
): Promise<void> {
  const examId = String(assessment.id);
  const examRef = doc(db, 'courses', String(courseId), 'exams', examId);

  // Save metadata (merge, so existing settings/results structure remains compatible)
  await setDoc(
    examRef,
    {
      kind: 'course-assessment',
      title: assessment.title,
      assessmentType: assessment.assessmentType ?? 'exam',
      duration: assessment.duration ?? 30,
      dueDate: assessment.dueDate ?? '',
      questions: assessment.questions ?? assessment.questionItems?.length ?? 0,
      maxScore: assessment.maxScore ?? 100,
      passingScore: assessment.passingScore ?? 60,
      maxAttempts: assessment.maxAttempts ?? 1,
      randomizeQuestions: assessment.randomizeQuestions ?? false,
      randomizeChoices: assessment.randomizeChoices ?? false,
      allowQuestionNavigation: assessment.allowQuestionNavigation ?? true,
      password: assessment.password ?? '',
      useGlobalDetectors: assessment.useGlobalDetectors ?? true,
      detectors: assessment.detectors ?? null,
      questionSource: assessment.questionSource ?? null,
      sourceModuleId: assessment.sourceModuleId ?? null,
      sourceModuleTitle: assessment.sourceModuleTitle ?? null,
      generatedTopic: assessment.generatedTopic ?? null,
      generatedDifficulty: assessment.generatedDifficulty ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // Save questions (subcollection)
  const items = (assessment.questionItems || []) as Question[];
  if (!items.length) return;

  const batch = writeBatch(db);
  const qColl = collection(db, 'courses', String(courseId), 'exams', examId, 'questions');
  for (const q of items) {
    const qid = String(q.id);
    batch.set(doc(qColl, qid), {
      ...q,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function loadCourseAssessmentsFromFirestore(
  courseId: string
): Promise<CourseAssessment[]> {
  const examsRef = collection(db, 'courses', String(courseId), 'exams');
  const snapshot = await getDocs(examsRef);
  const results: CourseAssessment[] = [];

  for (const d of snapshot.docs) {
    const data: any = d.data();

    // Only load the records we saved as course assessments.
    if (data?.kind !== 'course-assessment') continue;

    const examId = d.id;

    // Load questions subcollection
    const qSnap = await getDocs(
      collection(db, 'courses', String(courseId), 'exams', examId, 'questions')
    );
    const questionItems: Question[] = qSnap.docs
      .map((qd) => qd.data() as Question)
      .filter(Boolean)
      // Ensure stable order by numeric id if possible
      .sort((a: any, b: any) => Number(a.id) - Number(b.id));

    results.push({
      id: examId,
      title: data.title || 'Untitled',
      duration: data.duration ?? 30,
      dueDate: data.dueDate ?? '',
      questions: data.questions ?? questionItems.length ?? 0,
      assessmentType: data.assessmentType ?? 'exam',
      maxScore: data.maxScore ?? 100,
      passingScore: data.passingScore ?? 60,
      maxAttempts: data.maxAttempts ?? 1,
      randomizeQuestions: data.randomizeQuestions ?? false,
      randomizeChoices: data.randomizeChoices ?? false,
      allowQuestionNavigation: data.allowQuestionNavigation ?? true,
      password: (data.password || '').trim() || undefined,
      useGlobalDetectors: data.useGlobalDetectors ?? true,
      detectors: data.detectors ?? undefined,
      questionSource: data.questionSource ?? undefined,
      sourceModuleId: data.sourceModuleId ?? undefined,
      sourceModuleTitle: data.sourceModuleTitle ?? undefined,
      generatedTopic: data.generatedTopic ?? undefined,
      generatedDifficulty: data.generatedDifficulty ?? undefined,
      questionItems: questionItems.length ? questionItems : undefined,
      submissions: data.submissions ?? [],
    });
  }

  return results;
}

/**
 * Delete a course assessment (exam/quiz) and its questions subcollection.
 */
export async function deleteCourseAssessmentFromFirestore(
  courseId: string,
  assessmentId: string
): Promise<void> {
  const examId = String(assessmentId);
  const examRef = doc(db, 'courses', String(courseId), 'exams', examId);
  const qColl = collection(db, 'courses', String(courseId), 'exams', examId, 'questions');

  // Delete questions in batches (Firestore batch limit is 500).
  const qSnap = await getDocs(qColl);
  const docs = qSnap.docs;
  let i = 0;
  while (i < docs.length) {
    const batch = writeBatch(db);
    const slice = docs.slice(i, i + 450);
    slice.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    i += slice.length;
  }

  // Finally delete the exam metadata document.
  await deleteDoc(examRef);
}
