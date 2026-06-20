import { db } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { TabSwitchStatus } from '@/types';

export interface TabSwitchLogParams {
  studentId: string;
  studentName: string;
  /** Course title (used by professor dashboard filtering). */
  course?: string;
  assessmentId: string;
  assessmentTitle: string;
  durationSeconds: number;
  status: TabSwitchStatus;
  autoSubmitted: boolean;
}

/**
 * Logs a tab switch event to Firestore with duration-based classification
 */
export const logTabSwitch = async (params: TabSwitchLogParams) => {
  try {
    await addDoc(collection(db, 'tab_logs'), {
      studentId: params.studentId,
      studentName: params.studentName,
      course: params.course || '',
      assessmentId: params.assessmentId,
      assessmentTitle: params.assessmentTitle,
      timestamp: serverTimestamp(),
      durationSeconds: params.durationSeconds,
      status: params.status,
      autoSubmitted: params.autoSubmitted,
    });
  } catch (error) {
    console.error('Failed to log tab switch:', error);
  }
};

/**
 * Determines status based on duration in seconds
 * - ≤1 second: Warning
 * - >1 second to ≤3 seconds: Suspicious
 * - >3 seconds: Violation
 */
export const getTabSwitchStatus = (durationSeconds: number): TabSwitchStatus => {
  if (durationSeconds <= 1) {
    return 'Warning';
  } else if (durationSeconds <= 3) {
    return 'Suspicious';
  } else {
    return 'Violation';
  }
};
