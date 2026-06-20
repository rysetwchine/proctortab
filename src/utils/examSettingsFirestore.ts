import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import type { ExamDetectorsFirestore } from '@/context/SessionContext';

export type ExamSettingsFirestorePayload = {
  title: string;
  useGlobalDetectors: boolean;
  detectors: ExamDetectorsFirestore;
  allowQuestionNavigation?: boolean;
};

/**
 * Persists exam-level settings for rules / monitoring under:
 * courses/{courseId}/exams/{examId}
 */
export async function syncExamDocumentToFirestore(
  courseId: string,
  examId: string,
  payload: ExamSettingsFirestorePayload
): Promise<void> {
  const ref = doc(db, 'courses', courseId, 'exams', examId);
  await setDoc(
    ref,
    {
      title: payload.title,
      useGlobalDetectors: payload.useGlobalDetectors,
      detectors: payload.detectors,
      allowQuestionNavigation: payload.allowQuestionNavigation ?? true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
