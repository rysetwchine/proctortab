import { db } from "@/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import type { CursorPosition } from "@/hooks/useMouseBoundaryDetector";

export type AssessmentType = "exam" | "quiz";

export interface MouseBoundaryExitLogParams {
  userId: string;
  studentName?: string;
  assessmentType: AssessmentType;
  /** Exam id (when assessmentType === 'exam') */
  examId?: string;
  /** Quiz id (when assessmentType === 'quiz') */
  quizId?: string;
  assessmentTitle?: string;
  deductedMinutes: number;
  cursorPosition: CursorPosition;
  confidenceScore?: number; // 0-100 confidence level
  patternType?: 'accidental' | 'suspicious' | 'intentional';
}

export async function logMouseBoundaryExit(params: MouseBoundaryExitLogParams) {
  try {
    await addDoc(collection(db, "assessment_violations"), {
      userId: params.userId,
      ...(params.studentName ? { studentName: params.studentName } : {}),
      ...(params.examId ? { examId: params.examId } : {}),
      ...(params.quizId ? { quizId: params.quizId } : {}),
      ...(params.assessmentTitle ? { assessmentTitle: params.assessmentTitle } : {}),
      assessmentType: params.assessmentType,
      violationType: "mouse_boundary_exit",
      deductedMinutes: params.deductedMinutes,
      cursorPosition: params.cursorPosition,
      confidenceScore: params.confidenceScore ?? 100,
      patternType: params.patternType ?? 'intentional',
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to log mouse boundary exit:", error);
  }
}

