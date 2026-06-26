export type AttendanceStatus = 'present' | 'late' | 'absent';

export interface AttendanceQrPayload {
  uid: string;
  name: string;
  studentNumber: string;
  email: string;
  course: string;
  program: string;
  year: string;
  systemIdentifier: string;
  securityToken: string;
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
  program?: string;
  year: string;
  date: string;
  time: string;
  timestamp: unknown;
  scannedByProfessor: string;
  status: AttendanceStatus;
  remarks?: string;
}

export interface StudentProfileQrFields {
  name: string;
  studentNumber: string;
  email: string;
  course: string;
  program?: string;
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
