export type AttendanceStatus = 'present';

export interface AttendanceQrPayload {
  uid: string;
  name: string;
  studentNumber: string;
  email: string;
  course: string;
  year: string;
  generatedAt: string;
}

export interface AttendanceLog {
  id: string;
  studentId: string;
  studentNumber: string;
  name: string;
  email: string;
  course: string;
  courseName?: string;
  courseId?: string;
  year: string;
  date: string;
  time: string;
  timestamp: unknown;
  scannedByProfessor: string;
  status: AttendanceStatus;
}

export interface StudentProfileQrFields {
  name: string;
  studentNumber: string;
  email: string;
  course: string;
  year: string;
}

export interface AttendanceScannerSession {
  sessionId: string;
  courseId: string;
  courseName: string;
  active: boolean;
  createdBy: string;
  enrolledStudentIds: string[];
  createdAt?: unknown;
  stoppedAt?: unknown;
}
