import { db } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface ExamScoreResult {
  studentId: string;
  studentName: string;
  score: number;
  totalItems: number;
  completedAt?: string;
}

/**
 * Calculate percentage from score and total items
 */
export function calculatePercentage(score: number, totalItems: number): number {
  if (totalItems === 0) return 0;
  return Math.round((score / totalItems) * 100);
}

/**
 * Save exam result to Firestore at: courses/{courseId}/exams/{examId}/results/{studentId}
 */
export async function saveExamResultToFirestore(
  courseId: string,
  examId: string,
  result: ExamScoreResult
): Promise<void> {
  try {
    const percentage = calculatePercentage(result.score, result.totalItems);
    const resultsDocPath = `courses/${courseId}/exams/${examId}/results/${result.studentId}`;
    
    await setDoc(doc(db, resultsDocPath), {
      studentId: result.studentId,
      studentName: result.studentName,
      score: result.score,
      totalItems: result.totalItems,
      percentage,
      completedAt: result.completedAt || new Date().toISOString(),
      status: 'completed',
      savedAt: serverTimestamp(),
    }, { merge: true });

    console.log(`Exam result saved for ${result.studentName} in course ${courseId}`);
  } catch (error) {
    console.error('Failed to save exam result to Firestore:', error);
    throw error;
  }
}

/**
 * Batch save multiple exam results
 */
export async function saveMultipleExamResults(
  courseId: string,
  examId: string,
  results: ExamScoreResult[]
): Promise<void> {
  try {
    const promises = results.map((result) =>
      saveExamResultToFirestore(courseId, examId, result)
    );
    await Promise.all(promises);
  } catch (error) {
    console.error('Failed to save multiple exam results:', error);
    throw error;
  }
}
