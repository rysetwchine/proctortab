import {
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from '@/firebase';
import type { AttendanceLog, AttendanceQrPayload, AttendanceStatus } from '@/types/attendance';
import { parseAttendanceQr } from '@/utils/attendanceQr';

export type AttendanceScanResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

export function getTodayDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatAttendanceTime(date = new Date()): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function attendanceCollectionRef(courseId: string) {
  return collection(db, 'courses', courseId, 'attendance_logs');
}

// Global collection used by the student calendar (attendance tab).
export function globalAttendanceCollectionRef() {
  return collection(db, 'attendance_logs');
}

export function subscribeAttendanceLogs(
  courseId: string,
  onData: (logs: AttendanceLog[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(attendanceCollectionRef(courseId), orderBy('timestamp', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const logs: AttendanceLog[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          studentId: String(data.studentId ?? ''),
          studentNumber: String(data.studentNumber ?? ''),
          name: String(data.name ?? ''),
          email: String(data.email ?? ''),
          course: String(data.course ?? ''),
          program: String(data.program ?? ''),
          year: String(data.year ?? ''),
          date: String(data.date ?? ''),
          time: String(data.time ?? ''),
          timestamp: data.timestamp,
          scannedByProfessor: String(data.scannedByProfessor ?? ''),
          status: (data.status as AttendanceStatus) || 'present',
        };
      });
      onData(logs);
    },
    (err) => onError?.(err as Error)
  );
}

export function hasAttendanceToday(
  logs: AttendanceLog[],
  studentId: string,
  date: string
): boolean {
  return logs.some((log) => log.studentId === studentId && log.date === date);
}

export function isStudentEnrolled(
  enrolledStudentIds: string[],
  studentId: string
): boolean {
  if (enrolledStudentIds.length === 0) return true;
  return enrolledStudentIds.some((id) => String(id) === String(studentId));
}

export function processStudentAttendanceScan(
  decodedText: string,
  options: {
    courseName: string;
    enrolledStudentIds: string[];
    scannedByProfessor: string;
    existingLogs: AttendanceLog[];
    today?: string;
  }
): { payload: AttendanceQrPayload } | AttendanceScanResult {
  const payload = parseAttendanceQr(decodedText.trim());
  if (!payload) {
    return { ok: false, message: 'Invalid student QR code.' };
  }

  if (!isStudentEnrolled(options.enrolledStudentIds, payload.uid)) {
    return { ok: false, message: `${payload.name} is not enrolled in ${options.courseName}.` };
  }

  const today = options.today ?? getTodayDateString();
  if (hasAttendanceToday(options.existingLogs, payload.uid, today)) {
    return { ok: false, message: `${payload.name} is already marked present today.` };
  }

  return { payload };
}

export async function recordAttendance(
  courseId: string,
  payload: AttendanceQrPayload,
  scannedByProfessor: string,
  courseName?: string,
  status: AttendanceStatus = 'present',
  remarks: string = ''
): Promise<void> {
  const now = new Date();
  const date = getTodayDateString(now);
  const time = formatAttendanceTime(now);

  const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const row = {
    studentId: payload.uid,
    studentNumber: payload.studentNumber,
    name: payload.name,
    email: payload.email,
    course: payload.course,
    courseName: courseName || payload.course,
    courseId,
    program: payload.program || '',
    year: payload.year,
    date,
    time,
    timestamp: serverTimestamp(),
    scannedByProfessor,
    status,
    remarks,
  };

  // 1) Course-scoped logs (used by professor course attendance tab)
  await setDoc(doc(db, 'courses', courseId, 'attendance_logs', logId), row);

  // 2) Global logs (used by student calendar attendance tab; persists across refresh/logout)
  await setDoc(doc(db, 'attendance_logs', logId), row);
}

export function subscribeGlobalAttendanceLogs(
  onData: (logs: AttendanceLog[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(globalAttendanceCollectionRef(), orderBy('timestamp', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const logs: AttendanceLog[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          studentId: String(data.studentId ?? ''),
          studentNumber: String(data.studentNumber ?? ''),
          name: String(data.name ?? ''),
          email: String(data.email ?? ''),
          course: String(data.course ?? ''),
          courseName: String(data.courseName ?? data.course ?? ''),
          courseId: String(data.courseId ?? ''),
          program: String(data.program ?? ''),
          year: String(data.year ?? ''),
          date: String(data.date ?? ''),
          time: String(data.time ?? ''),
          timestamp: data.timestamp,
          scannedByProfessor: String(data.scannedByProfessor ?? ''),
          status: (data.status as AttendanceStatus) || 'present',
          remarks: String(data.remarks ?? ''),
        };
      });
      onData(logs);
    },
    (err) => onError?.(err as Error)
  );
}

export async function updateAttendanceRecord(
  courseId: string,
  logId: string,
  patch: Partial<AttendanceLog>
): Promise<void> {
  const courseLogRef = doc(db, 'courses', courseId, 'attendance_logs', logId);
  await updateDoc(courseLogRef, patch);

  const globalLogRef = doc(db, 'attendance_logs', logId);
  await updateDoc(globalLogRef, patch);
}

export async function deleteAttendanceRecord(
  courseId: string,
  logId: string
): Promise<void> {
  const courseLogRef = doc(db, 'courses', courseId, 'attendance_logs', logId);
  await deleteDoc(courseLogRef);

  const globalLogRef = doc(db, 'attendance_logs', logId);
  await deleteDoc(globalLogRef);
}
