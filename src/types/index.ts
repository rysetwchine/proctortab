export type UserRole = 'student' | 'professor';

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

export interface Question {
  id: number;
  question: string;
  options: string[];
  answer?: string;
  correctAnswer?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  type?: 'multiple-choice' | 'true-false' | 'identification';
  explanation?: string;
  topic?: string;
  source?: string;
}

export interface ExamSession {
  id: string;
  name: string;
  duration: number;
  questions: Question[];
  violations: number;
  startTime?: Date;
  joinCode?: string;
  status: 'draft' | 'active' | 'completed';
  enrolledStudents?: string[];
}

export interface Student {
  id: string;
  name: string;
  course: string;
  violations: number;
  status: 'active' | 'warning' | 'flagged';
}

export type TabSwitchStatus = 'Warning' | 'Suspicious' | 'Violation';

export interface TabLog {
  id?: string;
  studentId: string;
  studentName: string;
  course?: string;
  assessmentId: string;
  assessmentTitle: string;
  timestamp: any; // Firestore serverTimestamp
  durationSeconds: number;
  status: TabSwitchStatus;
  autoSubmitted: boolean;
}

export interface MouseBoundaryViolationLog {
  id?: string;
  userId: string;
  studentName?: string;
  assessmentType: 'exam' | 'quiz';
  examId?: string;
  quizId?: string;
  assessmentTitle?: string;
  timestamp: any; // Firestore serverTimestamp
  violationType: 'mouse_boundary_exit';
  deductedMinutes: number;
  cursorPosition: { x: number; y: number };
}
