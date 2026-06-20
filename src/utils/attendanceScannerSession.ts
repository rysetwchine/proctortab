import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import type { AttendanceScannerSession } from '@/types/attendance';

export function buildPhoneScannerUrl(
  courseId: string,
  sessionId: string,
  baseOrigin?: string
): string {
  const origin =
    baseOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const params = new URLSearchParams({
    course: courseId,
    session: sessionId,
  });
  return `${origin.replace(/\/$/, '')}/attendance/scan?${params.toString()}`;
}

export function scannerSessionRef(courseId: string, sessionId: string) {
  return doc(db, 'courses', courseId, 'scanner_sessions', sessionId);
}

export async function createScannerSession(input: {
  courseId: string;
  courseName: string;
  createdBy: string;
  enrolledStudentIds: string[];
}): Promise<string> {
  const sessionId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `session_${Date.now()}`;

  await setDoc(scannerSessionRef(input.courseId, sessionId), {
    sessionId,
    courseId: input.courseId,
    courseName: input.courseName,
    active: true,
    createdBy: input.createdBy,
    enrolledStudentIds: input.enrolledStudentIds.map(String),
    createdAt: serverTimestamp(),
  });

  return sessionId;
}

export async function stopScannerSession(
  courseId: string,
  sessionId: string
): Promise<void> {
  await updateDoc(scannerSessionRef(courseId, sessionId), {
    active: false,
    stoppedAt: serverTimestamp(),
  });
}

export function subscribeScannerSession(
  courseId: string,
  sessionId: string,
  onData: (session: AttendanceScannerSession | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    scannerSessionRef(courseId, sessionId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData({
        sessionId: String(data.sessionId ?? snap.id),
        courseId: String(data.courseId ?? courseId),
        courseName: String(data.courseName ?? ''),
        active: Boolean(data.active),
        createdBy: String(data.createdBy ?? ''),
        enrolledStudentIds: (data.enrolledStudentIds as string[] | undefined)?.map(String) ?? [],
        createdAt: data.createdAt,
        stoppedAt: data.stoppedAt,
      });
    },
    (err) => onError?.(err as Error)
  );
}
