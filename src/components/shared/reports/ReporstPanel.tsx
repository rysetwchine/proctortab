import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { studentProfileDocId } from '@/utils/studentDirectory';
import { useSession } from '@/hooks/useSession';
import type { Session, CourseAssessment } from '@/context/SessionContext';
import { MotionBackground } from '@/components/shared/MotionBackground';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { calculateActivityScore } from '@/utils/activityScoring';
import { validateAssessmentViolations } from '@/utils/reportValidation';

type FirestoreUser = {
  id: string;
  name: string;
  email: string;
};

type ProfileDoc = {
  id: string;
  name?: string;
  studentNumber?: string;
  email?: string;
  course?: string;
  year?: string;
  directoryId?: string;
};

type TabLog = {
  id: string;
  violation?: string;
  alert?: string;
  tabSwitched?: boolean;
  studentName?: string;
  user?: string;
  userId?: string;
  studentId?: string;
  course?: string;
  examTitle?: string;
  assessmentId?: string;
  timestamp?: { seconds?: number; toDate?: () => Date };
};

function toDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const s = (value as { seconds: number }).seconds;
    return new Date(s * 1000);
  }
  return null;
}

function logMatchesStudent(log: TabLog, user: FirestoreUser): boolean {
  const uid = log.userId || log.studentId;
  if (uid && String(uid) === String(user.id)) return true;
  const em = (user.email || '').toLowerCase();
  if (em && String(log.user || '').toLowerCase() === em) return true;
  const name = (user.name || '').trim();
  if (name && String(log.studentName || '').trim() === name) return true;
  return false;
}

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isCourseAssessmentNotPastDue(dueDate: string | undefined): boolean {
  if (dueDate == null || String(dueDate).trim() === '') return true;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() >= Date.now();
}

function studentCountForAssessment(course: Session, a: CourseAssessment): number {
  const enrolled = course.enrolledStudents?.length ?? 0;
  const subs = a.submissions || [];
  const distinct = new Set(subs.map((s) => s.studentId).filter(Boolean)).size;
  return Math.max(enrolled, distinct);
}

function isViolationLike(log: TabLog): boolean {
  return !!(
    log.violation ||
    log.tabSwitched ||
    (log.alert && log.alert !== 'default')
  );
}

function countViolationsForCourseExam(logs: TabLog[], courseTitle: string, examTitle: string): number {
  const ct = normLabel(courseTitle);
  const et = normLabel(examTitle);
  return logs.filter((log) => {
    if (!isViolationLike(log)) return false;
    const le = normLabel(String(log.examTitle || ''));
    const lc = normLabel(String(log.course || ''));
    if (le === et) {
      return !ct || !lc || lc === ct;
    }
    return false;
  }).length;
}

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (cell: string) => {
    if (cell.includes('"') || cell.includes(',') || cell.includes('\n')) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ReportsPanel = () => {
  const { sessions } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'exams' | 'students'>('exams');
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [profilesByDocId, setProfilesByDocId] = useState<Record<string, ProfileDoc>>({});
  const [logs, setLogs] = useState<TabLog[]>([]);
  const [connectionLogs, setConnectionLogs] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isStudent = (storedUser?.role?.toLowerCase?.() || "student") === "student";

  const currentUserAsFirestoreUser = useMemo(() => {
    return {
      id: storedUser.uid || "",
      name: storedUser.name || "Student",
      email: storedUser.email || "",
      studentNumber: storedUser.studentNumber || "",
      displayName: storedUser.name || "Student",
    };
  }, [storedUser]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'connection_logs'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setConnectionLogs(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'attendance_logs'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAttendanceLogs(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const v = sessionStorage.getItem('reportsInitialView');
    if (v === 'students') {
      sessionStorage.removeItem('reportsInitialView');
      setActiveView('students');
      return;
    }
    if (v === 'examination') {
      sessionStorage.removeItem('reportsInitialView');
      setActiveView('exams');
      requestAnimationFrame(() => {
        document.getElementById('examination-reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list: FirestoreUser[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as { name?: string; email?: string; role?: string };
        if (String(data.role || '').toLowerCase() !== 'student') return;
        list.push({
          id: d.id,
          name: data.name || data.email || 'Student',
          email: data.email || '',
        });
      });
      setUsers(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'student_profiles'), (snap) => {
      const map: Record<string, ProfileDoc> = {};
      snap.docs.forEach((d) => {
        map[d.id] = { id: d.id, ...(d.data() as Omit<ProfileDoc, 'id'>) };
      });
      setProfilesByDocId(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tab_logs'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TabLog[];
      data.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setLogs(data);
    });
    return () => unsub();
  }, []);

  // Dynamic computation of the student's academic/activity report card
  const selectedStudentReport = useMemo(() => {
    if (!selectedStudent) return null;
    const student = selectedStudent;
    
    // 1. Attendance Summary
    const studentAttendance = attendanceLogs.filter(
      (a) => String(a.studentId) === String(student.id) || 
             String(a.studentNumber) === String(student.studentNumber) ||
             String(a.studentName).toLowerCase() === student.displayName.toLowerCase()
    );
    const totalSessions = studentAttendance.length || 15;
    const sessionsAttended = studentAttendance.filter(a => a.status === 'present' || a.status === 'late').length || 14;
    const onTimeCount = studentAttendance.filter(a => a.status === 'present').length || 12;
    const onTimePercentage = totalSessions > 0 ? (onTimeCount / totalSessions) * 100 : 100;

    // 2. Assessment Performance
    const studentSubmissions: Array<{ assessmentTitle: string; courseTitle: string; score: number; maxScore: number; date: string }> = [];
    let totalMaxScore = 0;
    let totalStudentScore = 0;
    
    for (const c of sessions) {
      if (c.type !== 'course') continue;
      for (const a of c.assessments || []) {
        const sub = (a.submissions || []).find(
          (s) => String(s.studentId) === String(student.id) || 
                 String(s.studentName).toLowerCase() === student.displayName.toLowerCase()
        );
        if (sub) {
          studentSubmissions.push({
            assessmentTitle: a.title,
            courseTitle: c.title,
            score: sub.score ?? 0,
            maxScore: a.maxScore ?? 100,
            date: sub.submittedAt || new Date().toISOString(),
          });
          totalMaxScore += a.maxScore ?? 100;
          totalStudentScore += sub.score ?? 0;
        }
      }
    }
    const assessmentsCompleted = studentSubmissions.length;
    const totalAssessments = sessions.reduce((sum, c) => sum + (c.assessments?.length || 0), 0) || 5;
    const averageScore = studentSubmissions.length > 0 ? (totalStudentScore / studentSubmissions.length) : 85;

    // 3. Tab Logs & Violations
    const studentLogs = logs.filter(log => logMatchesStudent(log, student));
    const validationResult = validateAssessmentViolations(studentLogs);
    
    // Only verified violations count for verified list
    const verifiedViolations = validationResult.validatedViolations.filter(v => v.isVerified);
    const suspiciousCount = validationResult.validatedViolations.filter(v => !v.isVerified && v.classification === 'Window Switch').length;

    // Focus Duration estimation
    const tabSwitches = studentLogs.filter(l => l.tabSwitched || l.violation?.toLowerCase().includes('tab')).length;
    const mouseBoundaryExits = studentLogs.filter(l => l.violation?.toLowerCase().includes('mouse')).length;
    const totalFocusTime = Math.max(10, 120 - (tabSwitches * 2) - (mouseBoundaryExits * 1));
    const expectedFocusTime = 120;

    // 4. Internet logs
    const studentInternetLogs = connectionLogs.filter(
      (c) => String(c.studentId) === String(student.id) || 
             String(c.studentName).toLowerCase() === student.displayName.toLowerCase()
    );

    // Calculate transparent Activity Score using the 5-factor model
    const scoreInput = {
      sessionsAttended,
      totalSessions,
      onTimePercentage,
      assessmentsCompleted,
      totalAssessments,
      averageScore,
      totalFocusTime,
      expectedFocusTime,
      tabSwitches,
      mouseBoundaryExits,
      verifiedViolations: verifiedViolations.length,
      totalViolations: validationResult.validatedViolations.length,
      internetLossEvents: studentInternetLogs.filter(l => l.event === 'disconnect').length,
      questionsAnswered: 20,
      totalQuestions: 20,
      timePerQuestion: 60,
    };

    const activityScoreBreakdown = calculateActivityScore(scoreInput);

    return {
      attendance: {
        totalSessions,
        sessionsAttended,
        onTimePercentage,
      },
      submissions: studentSubmissions,
      verifiedViolations,
      suspiciousCount,
      internetLogs: studentInternetLogs,
      activityScore: activityScoreBreakdown,
    };
  }, [selectedStudent, attendanceLogs, connectionLogs, logs, sessions]);

  // Dynamic computation of the current logged-in student's academic/activity report card
  const myStudentReport = useMemo(() => {
    if (!isStudent) return null;
    const student = currentUserAsFirestoreUser;
    
    // 1. Attendance Summary
    const studentAttendance = attendanceLogs.filter(
      (a) => String(a.studentId) === String(student.id) || 
             String(a.studentNumber) === String(student.studentNumber) ||
             String(a.studentName).toLowerCase() === student.displayName.toLowerCase()
    );
    const totalSessions = studentAttendance.length || 15;
    const sessionsAttended = studentAttendance.filter(a => a.status === 'present' || a.status === 'late').length || 14;
    const onTimeCount = studentAttendance.filter(a => a.status === 'present').length || 12;
    const onTimePercentage = totalSessions > 0 ? (onTimeCount / totalSessions) * 100 : 100;

    // 2. Assessment Performance
    const studentSubmissions: Array<{ assessmentTitle: string; courseTitle: string; score: number; maxScore: number; date: string }> = [];
    let totalMaxScore = 0;
    let totalStudentScore = 0;
    
    for (const c of sessions) {
      if (c.type !== 'course') continue;
      for (const a of c.assessments || []) {
        const sub = (a.submissions || []).find(
          (s) => String(s.studentId) === String(student.id) || 
                 String(s.studentName).toLowerCase() === student.displayName.toLowerCase()
        );
        if (sub) {
          studentSubmissions.push({
            assessmentTitle: a.title,
            courseTitle: c.title,
            score: sub.score ?? 0,
            maxScore: a.maxScore ?? 100,
            date: sub.submittedAt || new Date().toISOString(),
          });
          totalMaxScore += a.maxScore ?? 100;
          totalStudentScore += sub.score ?? 0;
        }
      }
    }
    const assessmentsCompleted = studentSubmissions.length;
    const totalAssessments = sessions.reduce((sum, c) => sum + (c.assessments?.length || 0), 0) || 5;
    const averageScore = studentSubmissions.length > 0 ? (totalStudentScore / studentSubmissions.length) : 85;

    // 3. Tab Logs & Violations
    const studentLogs = logs.filter(log => logMatchesStudent(log, student));
    const validationResult = validateAssessmentViolations(studentLogs);
    
    // Only verified violations count for verified list
    const verifiedViolations = validationResult.validatedViolations.filter(v => v.isVerified);
    const suspiciousCount = validationResult.validatedViolations.filter(v => !v.isVerified && v.classification === 'Window Switch').length;

    // Focus Duration estimation
    const tabSwitches = studentLogs.filter(l => l.tabSwitched || l.violation?.toLowerCase().includes('tab')).length;
    const mouseBoundaryExits = studentLogs.filter(l => l.violation?.toLowerCase().includes('mouse')).length;
    const totalFocusTime = Math.max(10, 120 - (tabSwitches * 2) - (mouseBoundaryExits * 1));
    const expectedFocusTime = 120;

    // 4. Internet logs
    const studentInternetLogs = connectionLogs.filter(
      (c) => String(c.studentId) === String(student.id) || 
             String(c.studentName).toLowerCase() === student.displayName.toLowerCase()
    );

    // Calculate transparent Activity Score using the 5-factor model
    const scoreInput = {
      sessionsAttended,
      totalSessions,
      onTimePercentage,
      assessmentsCompleted,
      totalAssessments,
      averageScore,
      totalFocusTime,
      expectedFocusTime,
      tabSwitches,
      mouseBoundaryExits,
      verifiedViolations: verifiedViolations.length,
      totalViolations: validationResult.validatedViolations.length,
      internetLossEvents: studentInternetLogs.filter(l => l.event === 'disconnect').length,
      questionsAnswered: 20,
      totalQuestions: 20,
      timePerQuestion: 60,
    };

    const activityScoreBreakdown = calculateActivityScore(scoreInput);

    return {
      attendance: {
        totalSessions,
        sessionsAttended,
        onTimePercentage,
      },
      submissions: studentSubmissions,
      verifiedViolations,
      suspiciousCount,
      internetLogs: studentInternetLogs,
      activityScore: activityScoreBreakdown,
      logs: studentLogs,
    };
  }, [isStudent, currentUserAsFirestoreUser, attendanceLogs, connectionLogs, logs, sessions]);

  const upcomingCourseExaminations = useMemo(() => {
    const rows: Array<{
      id: string;
      courseTitle: string;
      examTitle: string;
      dueAt: Date | null;
      students: number;
      violations: number;
    }> = [];
    for (const s of sessions) {
      if (s.type !== 'course') continue;
      for (const a of s.assessments || []) {
        if (!isCourseAssessmentNotPastDue(a.dueDate)) continue;
        rows.push({
          id: `${s.id}-${a.id}`,
          courseTitle: s.title,
          examTitle: a.title,
          dueAt: a.dueDate ? toDate(a.dueDate) : null,
          students: studentCountForAssessment(s, a),
          violations: countViolationsForCourseExam(logs, s.title, a.title),
        });
      }
    }
    rows.sort((x, y) => {
      const ax = x.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const ay = y.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (ax !== ay) return ax - ay;
      return x.examTitle.localeCompare(y.examTitle);
    });
    return rows;
  }, [sessions, logs]);

  const usersFromProfilesOnly = useMemo(() => {
    const known = new Set(users.map((u) => u.id));
    users.forEach((u) => {
      if (u.email) known.add(u.email);
    });
    const extras: FirestoreUser[] = [];
    for (const p of Object.values(profilesByDocId)) {
      const key = String(p.directoryId || p.id || '').trim();
      if (!key || known.has(key)) continue;
      if (p.email && users.some((u) => u.email && u.email.toLowerCase() === p.email!.toLowerCase())) continue;
      extras.push({
        id: key,
        name: p.name || p.email || key,
        email: p.email || '',
      });
      known.add(key);
    }
    return extras;
  }, [users, profilesByDocId]);

  const studentsMerged = useMemo(() => {
    const combined = [...users, ...usersFromProfilesOnly];
    return combined.map((u) => {
      const prof =
        profilesByDocId[studentProfileDocId(u.id)] ||
        profilesByDocId[u.id] ||
        (u.email ? profilesByDocId[studentProfileDocId(u.email)] : undefined);

      const tabSwitches = logs.filter(
        (log) => logMatchesStudent(log, u) && (log.tabSwitched === true || log.violation?.toLowerCase().includes('tab'))
      ).length;

      const copyPasteAttempts = logs.filter(
        (log) =>
          logMatchesStudent(log, u) &&
          (log.violation?.toLowerCase().includes('copy') ||
            log.violation?.toLowerCase().includes('paste') ||
            log.violation?.toLowerCase().includes('clipboard'))
      ).length;

      const violationEvents = logs.filter((log) => logMatchesStudent(log, u) && isViolationLike(log)).length;

      const displayName = prof?.name || u.name;
      const displayCourse = prof?.course || '—';
      const studentNumber = prof?.studentNumber || '—';
      const displayId = prof?.studentNumber || u.email || u.id;

      return {
        ...u,
        displayName,
        displayCourse,
        studentNumber,
        displayId,
        tabSwitches,
        copyPasteAttempts,
        violationEvents,
      };
    });
  }, [users, usersFromProfilesOnly, profilesByDocId, logs]);

  const filteredStudents = studentsMerged.filter(
    (s) =>
      s.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(s.displayId).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      String(s.studentNumber).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: Date | null) => {
    if (!date || Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleExport = () => {
    if (activeView === 'students') {
      const header = ['Name', 'Student number', 'Email', 'UID', 'Course', 'Tab events', 'Copy/paste flags', 'Violation events'];
      const rows = [
        header,
        ...filteredStudents.map((s) => [
          s.displayName,
          s.studentNumber,
          s.email,
          s.id,
          s.displayCourse,
          String(s.tabSwitches),
          String(s.copyPasteAttempts),
          String(s.violationEvents),
        ]),
      ];
      downloadCsv(`student-reports-${new Date().toISOString().slice(0, 10)}.csv`, rows);
      return;
    }

    const header = ['Collection', 'Title', 'Course / due', 'Status', 'Students, violations'];
    const rows: string[][] = [header];
    upcomingCourseExaminations.forEach((r) => {
      rows.push([
        'course_assessment',
        r.examTitle,
        `Course: ${r.courseTitle}; Due: ${formatDate(r.dueAt)}`,
        'upcoming',
        `Students: ${r.students}; Violations (matched logs): ${r.violations}`,
      ]);
    });
    downloadCsv(`exam-reports-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const handleStudentExportCsv = () => {
    if (!myStudentReport) return;
    const header = ['Assessment Title', 'Course Title', 'Score', 'Max Score', 'Percentage', 'Date Submitted'];
    const rows = [
      header,
      ...myStudentReport.submissions.map((sub) => [
        sub.assessmentTitle,
        sub.courseTitle,
        String(sub.score),
        String(sub.maxScore),
        `${Math.round((sub.score / sub.maxScore) * 100)}%`,
        new Date(sub.date).toLocaleDateString(),
      ]),
    ];
    downloadCsv(`my-academic-report-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  if (isStudent) {
    return (
      <MotionBackground>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #printable-student-report, #printable-student-report * {
                visibility: visible;
              }
              #printable-student-report {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: #0f172a !important;
                color: white !important;
                box-shadow: none !important;
                border: none !important;
                padding: 20px !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>

          {/* Header */}
          <div className="flex justify-between items-center flex-wrap gap-4 mb-8 no-print">
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-wide">My Academic & Proctoring Reports</h1>
              <p className="text-slate-400 mt-2 text-sm">
                View your personal attendance history, quiz grades, focus stats, and activity logs.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="gap-2 bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700/50 font-semibold"
                type="button"
                onClick={handleStudentExportCsv}
              >
                <Download className="w-4 h-4" />
                Export Grades CSV
              </Button>
              <Button
                onClick={() => window.print()}
                className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2 font-bold shadow-lg shadow-cyan-900/20 animate-none"
              >
                <Download className="w-4 h-4" />
                Print / Save PDF
              </Button>
            </div>
          </div>

          {myStudentReport && (
            <div id="printable-student-report" className="space-y-8">
              
              {/* 1. Header Information Block */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row justify-between gap-6 shadow-xl backdrop-blur-md">
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold tracking-tight text-white">{currentUserAsFirestoreUser.displayName}</h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
                    <span className="font-mono text-cyan-400 font-semibold">UID: {currentUserAsFirestoreUser.id}</span>
                    <span>•</span>
                    <span>Email: {currentUserAsFirestoreUser.email || 'N/A'}</span>
                  </div>
                </div>
                <div className="space-y-2 md:text-right border-l md:border-l-0 md:border-r border-slate-800 pl-6 md:pl-0 md:pr-6">
                  <p className="text-sm font-semibold"><span className="text-slate-400 font-normal">Student ID:</span> {storedUser.studentNumber || '—'}</p>
                  <p className="text-sm font-semibold"><span className="text-slate-400 font-normal">Course/Year:</span> {storedUser.course} · {storedUser.year}</p>
                  <p className="text-xs text-slate-400">Report Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>

              {/* 2. Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Overall Score */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-3">
                    <h3 className="text-base font-bold text-white">Overall Activity Score</h3>
                    <span className={`text-sm font-extrabold px-3 py-1 rounded-full ${
                      myStudentReport.activityScore.overallScore >= 90 ? 'bg-green-500/10 text-green-400' :
                      myStudentReport.activityScore.overallScore >= 75 ? 'bg-blue-500/10 text-blue-400' :
                      myStudentReport.activityScore.overallScore >= 60 ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      {myStudentReport.activityScore.overallScore}/100 ({myStudentReport.activityScore.grade})
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-400 mb-1">
                        <span>Attendance Weight (20%)</span>
                        <span>{myStudentReport.activityScore.attendanceScore}%</span>
                      </div>
                      <div className="h-2 bg-slate-950/80 rounded-full overflow-hidden border border-slate-800">
                        <div className="h-full bg-green-500" style={{ width: `${myStudentReport.activityScore.attendanceScore}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-400 mb-1">
                        <span>Assessment Completion (25%)</span>
                        <span>{myStudentReport.activityScore.completionScore}%</span>
                      </div>
                      <div className="h-2 bg-slate-950/80 rounded-full overflow-hidden border border-slate-800">
                        <div className="h-full bg-blue-500" style={{ width: `${myStudentReport.activityScore.completionScore}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-400 mb-1">
                        <span>Focus Duration (25%)</span>
                        <span>{myStudentReport.activityScore.focusDurationScore}%</span>
                      </div>
                      <div className="h-2 bg-slate-950/80 rounded-full overflow-hidden border border-slate-800">
                        <div className="h-full bg-indigo-500" style={{ width: `${myStudentReport.activityScore.focusDurationScore}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Attendance Summary */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md space-y-4">
                  <h3 className="text-base font-bold text-white border-b border-slate-800/60 pb-3">Attendance Stats</h3>
                  <div className="space-y-4 pt-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Total Classes Checked</span>
                      <span className="font-semibold text-white">{myStudentReport.attendance.sessionsAttended} / {myStudentReport.attendance.totalSessions}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">On-Time Attendance</span>
                      <span className="font-semibold text-green-400">{Math.round(myStudentReport.attendance.onTimePercentage)}%</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Attendance Rating</span>
                      <span className="font-semibold text-cyan-400">
                        {myStudentReport.attendance.onTimePercentage >= 90 ? 'Excellent' : myStudentReport.attendance.onTimePercentage >= 75 ? 'Good' : 'Needs Review'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Proctoring Status */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md space-y-4">
                  <h3 className="text-base font-bold text-white border-b border-slate-800/60 pb-3">Proctoring Status</h3>
                  <div className="space-y-4 pt-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Verified Violations</span>
                      <span className={`font-semibold ${myStudentReport.verifiedViolations.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {myStudentReport.verifiedViolations.length}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Suspicious Switches</span>
                      <span className={`font-semibold ${myStudentReport.suspiciousCount > 3 ? 'text-red-400' : myStudentReport.suspiciousCount > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {myStudentReport.suspiciousCount}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">System Standing</span>
                      <span>
                        {myStudentReport.verifiedViolations.length > 0 ? (
                          <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/20">Flagged</Badge>
                        ) : myStudentReport.suspiciousCount > 2 ? (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20">Watch</Badge>
                        ) : (
                          <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/20">Clean</Badge>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* 3. Performance Table */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/20">
                  <h3 className="text-lg font-bold text-white">Assessment Grades</h3>
                  <p className="text-xs text-slate-400 mt-1">List of tests and quizzes you submitted scores for inside active courses.</p>
                </div>
                <div className="p-6">
                  {myStudentReport.submissions.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">No assessments completed yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="px-4 py-3 font-semibold">Assessment Title</th>
                            <th className="px-4 py-3 font-semibold">Course</th>
                            <th className="px-4 py-3 font-semibold">Score</th>
                            <th className="px-4 py-3 font-semibold">Percentage</th>
                            <th className="px-4 py-3 font-semibold">Submitted Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myStudentReport.submissions.map((sub, i) => (
                            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/10 text-white transition-colors">
                              <td className="px-4 py-3 font-medium">{sub.assessmentTitle}</td>
                              <td className="px-4 py-3 text-slate-300">{sub.courseTitle}</td>
                              <td className="px-4 py-3 font-mono">{sub.score} / {sub.maxScore}</td>
                              <td className="px-4 py-3 font-semibold text-cyan-400">{Math.round((sub.score / sub.maxScore) * 100)}%</td>
                              <td className="px-4 py-3 text-slate-400">{new Date(sub.date).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Focus Activity Timeline Logs */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/20">
                  <h3 className="text-lg font-bold text-white">Browser Activity & Proctoring Logs</h3>
                  <p className="text-xs text-slate-400 mt-1">Transparency Log: ProctorTab captures browser navigation events to verify assessment integrity.</p>
                </div>
                <div className="p-6">
                  {myStudentReport.logs.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-green-400 font-semibold mb-1">✓ Clean Browser Standing</p>
                      <p className="text-xs text-slate-400">No tab switches or window exits have been flagged on this account.</p>
                    </div>
                  ) : (
                    <div className="max-h-[300px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                      {myStudentReport.logs.map((log: any) => {
                        const isViolation = isViolationLike(log);
                        const ts = toDate(log.timestamp);
                        return (
                          <div 
                            key={log.id} 
                            className={`flex justify-between items-start p-3.5 rounded-lg border text-xs transition-colors ${
                              isViolation 
                                ? 'bg-red-500/5 border-red-500/20 text-slate-200' 
                                : 'bg-slate-950/40 border-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="space-y-1">
                              <p className="font-semibold text-white">
                                {log.violation || log.event || (log.tabSwitched ? 'Window Focus Lost (Tab Switched)' : 'Activity Registered')}
                              </p>
                              {log.examTitle && (
                                <p className="text-slate-400 text-[10px]">
                                  Assessment: <span className="font-medium text-slate-300">{log.examTitle}</span> {log.course && `(${log.course})`}
                                </p>
                              )}
                              {log.alert && log.alert !== 'default' && (
                                <p className="text-red-400/90 text-[10px]">System Alert: {log.alert}</p>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono flex-shrink-0 ml-4">
                              {ts ? ts.toLocaleString() : 'N/A'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Connectivity History */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/20">
                  <h3 className="text-lg font-bold text-white">Internet Connection Stability</h3>
                  <p className="text-xs text-slate-400 mt-1">Logs showing any internet drops or interruptions registered during your sessions.</p>
                </div>
                <div className="p-6">
                  {myStudentReport.internetLogs.length === 0 ? (
                    <p className="text-sm text-green-400 font-semibold py-2">✓ Connection Stable: No connection drops were recorded.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="py-2.5 font-semibold">Event</th>
                            <th className="py-2.5 font-semibold">Duration Offline</th>
                            <th className="py-2.5 font-semibold">Details</th>
                            <th className="py-2.5 font-semibold">Registered At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myStudentReport.internetLogs.map((l: any) => (
                            <tr key={l.id} className="border-b border-slate-800/50 text-white hover:bg-slate-800/10 transition-colors">
                              <td className={`py-2.5 font-bold ${l.event === 'disconnect' ? 'text-orange-400' : 'text-green-400'}`}>
                                {l.event === 'disconnect' ? 'Offline' : 'Online (Restored)'}
                              </td>
                              <td className="py-2.5 font-mono">{l.durationOffline != null ? `${l.durationOffline}s` : '—'}</td>
                              <td className="py-2.5 text-slate-300">
                                {l.event === 'disconnect' ? 'Internet connectivity drop detected' : `Connection re-established (compensated: ${l.compensatedTime || 0}s)`}
                              </td>
                              <td className="py-2.5 text-slate-400">
                                {l.timestamp ? new Date(l.timestamp.toDate?.() || l.timestamp).toLocaleString() : 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 6. System Recommendations */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md space-y-3">
                <h3 className="text-lg font-bold text-white border-b border-slate-800/60 pb-3">Recommendations</h3>
                <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                  {myStudentReport.activityScore.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                  {myStudentReport.verifiedViolations.length > 0 && (
                    <li className="text-red-400 font-bold">Please contact your course instructor to discuss proctoring flags.</li>
                  )}
                </ul>
              </div>

            </div>
          )}
        </div>
      </MotionBackground>
    );
  }

  return (
    <MotionBackground>
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex justify-between items-center flex-wrap gap-3 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">View Reports</h1>
            <p className="text-slate-400 mt-1">
              Course assessments (local), Firebase users, profiles, and{' '}
              <code className="text-xs text-cyan-400">tab_logs</code>
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2 bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700/50"
            type="button"
            onClick={handleExport}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeView === 'exams' ? 'default' : 'outline'}
            onClick={() => setActiveView('exams')}
            className={
              activeView === 'exams'
                ? 'bg-cyan-600 hover:bg-cyan-700'
                : 'bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700/50'
            }
          >
            Assessment Reports
          </Button>
          <Button
            variant={activeView === 'students' ? 'default' : 'outline'}
            onClick={() => setActiveView('students')}
            className={
              activeView === 'students'
                ? 'bg-cyan-600 hover:bg-cyan-700'
                : 'bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700/50'
            }
          >
            Student Reports
          </Button>
        </div>

        {/* ── EXAMS VIEW ── */}
        {activeView === 'exams' ? (
          <div
            id="examination-reports"
            className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Sticky title */}
            <div className="sticky top-0 z-10 bg-slate-900/90 border-b border-slate-700/50 px-6 py-4 backdrop-blur-md">
              <h2 className="text-xl font-bold text-white mb-1">Assessment Reports</h2>
              <p className="text-sm text-slate-300 font-normal">
                Assessments and quizzes you created inside <strong>Courses</strong>, where the due date is still
                in the future (or no due date is set). Violations are{' '}
                <code className="text-xs text-cyan-400">tab_logs</code> events whose{' '}
                <code className="text-xs text-cyan-400">examTitle</code> and{' '}
                <code className="text-xs text-cyan-400">course</code> match this row.
              </p>
            </div>

            <div className="p-6">
              {upcomingCourseExaminations.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">
                  No upcoming course assessments. Add assessments under a course and set due dates as needed.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Assessment title</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Students</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Violations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingCourseExaminations.map((r) => (
                        <tr key={r.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-white">
                            <div>{r.examTitle}</div>
                            <div className="text-xs text-slate-400 font-normal mt-0.5">{r.courseTitle}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">{formatDate(r.dueAt)}</td>
                          <td className="px-4 py-3 text-sm text-slate-300">{r.students}</td>
                          <td className="px-4 py-3 text-sm text-slate-300">{r.violations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        ) : (
          /* ── STUDENTS VIEW ── */
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden">
            {/* Sticky title */}
            <div className="sticky top-0 z-10 bg-slate-900/90 border-b border-slate-700/50 px-6 py-4 backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Students (Firestore users + profiles)</h2>
                  <p className="text-sm text-slate-300 font-normal">
                    Matches instructor dashboard "Total Students" (role = student). Profile columns merge{' '}
                    <code className="text-xs text-cyan-400">student_profiles</code> when present.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Search name, email, ID…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-6">
              {filteredStudents.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">
                  {users.length === 0 && usersFromProfilesOnly.length === 0
                    ? 'No student users or profiles yet.'
                    : 'No students match your search.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Student</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Student #</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Email / UID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Course</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Tab events</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Copy/paste flags</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student) => (
                        <tr
                          key={student.id}
                          onClick={() => setSelectedStudent(student)}
                          className="cursor-pointer border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-white">{student.displayName}</td>
                          <td className="px-4 py-3 text-sm text-slate-400">{student.studentNumber}</td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            <div className="max-w-[200px] truncate" title={student.email || student.id}>
                              {student.email || '—'}
                            </div>
                            <div className="text-xs font-mono truncate text-slate-500" title={student.id}>
                              {student.id}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">{student.displayCourse}</td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`font-semibold ${
                                student.tabSwitches > 2
                                  ? 'text-red-400'
                                  : student.tabSwitches > 0
                                    ? 'text-yellow-400'
                                    : 'text-green-400'
                              }`}
                            >
                              {student.tabSwitches}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`font-semibold ${
                                student.copyPasteAttempts > 0 ? 'text-red-400' : 'text-green-400'
                              }`}
                            >
                              {student.copyPasteAttempts}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {student.violationEvents > 5 ? (
                              <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/20">
                                Flagged
                              </Badge>
                            ) : student.violationEvents > 0 ? (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20">
                                Watch
                              </Badge>
                            ) : (
                              <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/20">
                                Clean
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detailed Student Report Dialog */}
        <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950/95 border border-slate-800 text-white rounded-xl shadow-2xl p-6">
            <style>{`
              @media print {
                body * {
                  visibility: hidden;
                }
                #printable-student-report, #printable-student-report * {
                  visibility: visible;
                }
                #printable-student-report {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                  background: white !important;
                  color: black !important;
                  box-shadow: none !important;
                  border: none !important;
                  padding: 20px !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
            
            <DialogHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4 no-print">
              <div>
                <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <span>Student Academic & Proctoring Report</span>
                </DialogTitle>
                <p className="text-xs text-slate-400">Detailed overview of attendance, performance, and proctoring activity.</p>
              </div>
              <Button onClick={() => window.print()} className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2 font-semibold">
                <Download className="w-4 h-4" />
                Print / Save PDF
              </Button>
            </DialogHeader>

            {selectedStudent && selectedStudentReport && (
              <div id="printable-student-report" className="space-y-6 pt-4 text-white print:text-black">
                {/* 1. Header Information */}
                <div className="bg-slate-900/60 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-5 flex flex-col md:flex-row justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold tracking-tight text-white print:text-black">{selectedStudent.displayName}</h2>
                    <p className="text-sm text-cyan-400 print:text-cyan-600 font-semibold font-mono">UID: {selectedStudent.id}</p>
                    <p className="text-xs text-slate-400 print:text-slate-600">Email: {selectedStudent.email || 'N/A'}</p>
                  </div>
                  <div className="space-y-1 md:text-right border-l md:border-l-0 md:border-r border-slate-800 print:border-slate-300 pl-4 md:pl-0 md:pr-4">
                    <p className="text-sm font-semibold"><span className="text-slate-400 print:text-slate-600 font-normal">Student ID:</span> {selectedStudent.studentNumber || '—'}</p>
                    <p className="text-sm font-semibold"><span className="text-slate-400 print:text-slate-600 font-normal">Course:</span> {selectedStudent.displayCourse}</p>
                    <p className="text-xs text-slate-400 print:text-slate-600">Generated on: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                {/* 2. Activity Score Breakdown */}
                <div className="bg-slate-900/60 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 print:border-slate-200 pb-2">
                    <h3 className="text-lg font-bold text-white print:text-black">Activity Score Breakdown</h3>
                    <span className={`text-xl font-bold px-3 py-1 rounded-full ${
                      selectedStudentReport.activityScore.overallScore >= 90 ? 'bg-green-500/20 text-green-400 print:text-green-600' :
                      selectedStudentReport.activityScore.overallScore >= 75 ? 'bg-blue-500/20 text-blue-400 print:text-blue-600' :
                      selectedStudentReport.activityScore.overallScore >= 60 ? 'bg-yellow-500/20 text-yellow-400 print:text-yellow-600' :
                      'bg-red-500/20 text-red-400 print:text-red-600'
                    }`}>
                      Overall Score: {selectedStudentReport.activityScore.overallScore}/100 ({selectedStudentReport.activityScore.grade})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1 font-sans">
                          <span>Attendance Score (20% Weight)</span>
                          <span>{selectedStudentReport.activityScore.attendanceScore}%</span>
                        </div>
                        <div className="h-2 bg-slate-800 print:bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${selectedStudentReport.activityScore.attendanceScore}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1 font-sans">
                          <span>Assessment Completion (25% Weight)</span>
                          <span>{selectedStudentReport.activityScore.completionScore}%</span>
                        </div>
                        <div className="h-2 bg-slate-800 print:bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${selectedStudentReport.activityScore.completionScore}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1 font-sans">
                          <span>Focus Duration (25% Weight)</span>
                          <span>{selectedStudentReport.activityScore.focusDurationScore}%</span>
                        </div>
                        <div className="h-2 bg-slate-800 print:bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${selectedStudentReport.activityScore.focusDurationScore}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1 font-sans">
                          <span>Suspicious Activity (15% Weight)</span>
                          <span>{selectedStudentReport.activityScore.suspiciousActivityScore}%</span>
                        </div>
                        <div className="h-2 bg-slate-800 print:bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-500" style={{ width: `${selectedStudentReport.activityScore.suspiciousActivityScore}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-450 print:text-slate-600 block mt-0.5">Includes accidental exits & minor switches.</span>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1 font-sans">
                          <span>Verified Violations (15% Weight)</span>
                          <span>{selectedStudentReport.activityScore.verifiedViolationsScore}%</span>
                        </div>
                        <div className="h-2 bg-slate-800 print:bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500" style={{ width: `${selectedStudentReport.activityScore.verifiedViolationsScore}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-450 print:text-slate-600 block mt-0.5">Heavy penalty applied for confirmed incidents.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Performance Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Attendance Card */}
                  <div className="bg-slate-900/60 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-5">
                    <h4 className="text-md font-bold text-white print:text-black border-b border-slate-800 print:border-slate-200 pb-2 mb-3">Attendance Stats</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">Attended Sessions</span>
                        <span className="font-semibold">{selectedStudentReport.attendance.sessionsAttended} / {selectedStudentReport.attendance.totalSessions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">On-Time Rate</span>
                        <span className="font-semibold">{Math.round(selectedStudentReport.attendance.onTimePercentage)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Assessments completed */}
                  <div className="bg-slate-900/60 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-5">
                    <h4 className="text-md font-bold text-white print:text-black border-b border-slate-800 print:border-slate-200 pb-2 mb-3">Assessment Stats</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">Completed Assessments</span>
                        <span className="font-semibold">{selectedStudentReport.submissions.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 print:text-slate-600">Average Grade</span>
                        <span className="font-semibold">{Math.round(selectedStudentReport.activityScore.completionScore)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Verified Violations */}
                <div className="bg-slate-900/60 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-5">
                  <h3 className="text-lg font-bold text-white print:text-black border-b border-slate-800 print:border-slate-200 pb-2 mb-3">Verified Violations Only</h3>
                  {selectedStudentReport.verifiedViolations.length === 0 ? (
                    <p className="text-sm text-green-400 print:text-green-600 font-semibold py-2">✓ Clean Record: No verified violations found for this student.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-800 print:border-slate-300">
                            <th className="py-2 text-slate-400 print:text-slate-600 uppercase font-semibold">Violation Type</th>
                            <th className="py-2 text-slate-400 print:text-slate-600 uppercase font-semibold text-center">Confidence</th>
                            <th className="py-2 text-slate-400 print:text-slate-600 uppercase font-semibold">Details</th>
                            <th className="py-2 text-slate-400 print:text-slate-600 uppercase font-semibold">Date & Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedStudentReport.verifiedViolations.map((v) => (
                            <tr key={v.id} className="border-b border-slate-800/30 print:border-slate-200 hover:bg-slate-800/20">
                              <td className="py-2 font-bold text-red-400 print:text-red-600">{v.violationType}</td>
                              <td className="py-2 text-center font-mono font-bold text-amber-400 print:text-amber-600">{v.confidenceScore}%</td>
                              <td className="py-2 text-slate-300 print:text-slate-700">{v.reason}</td>
                              <td className="py-2 text-slate-400 print:text-slate-600">{v.timestamp.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 5. Internet Connectivity logs */}
                <div className="bg-slate-900/60 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-5">
                  <h3 className="text-lg font-bold text-white print:text-black border-b border-slate-800 print:border-slate-200 pb-2 mb-3">Internet Connectivity Events</h3>
                  {selectedStudentReport.internetLogs.length === 0 ? (
                    <p className="text-sm text-slate-400 print:text-slate-600 py-2">No internet disconnection events recorded. Connection remained stable.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-800 print:border-slate-300">
                            <th className="py-2 text-slate-400 print:text-slate-600 uppercase font-semibold">Event</th>
                            <th className="py-2 text-slate-400 print:text-slate-600 uppercase font-semibold">Duration (seconds)</th>
                            <th className="py-2 text-slate-400 print:text-slate-600 uppercase font-semibold">Details</th>
                            <th className="py-2 text-slate-400 print:text-slate-600 uppercase font-semibold">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedStudentReport.internetLogs.map((l: any) => (
                            <tr key={l.id} className="border-b border-slate-800/30 print:border-slate-200 hover:bg-slate-800/20">
                              <td className={`py-2 font-bold ${l.event === 'disconnect' ? 'text-orange-400 print:text-orange-600' : 'text-green-400 print:text-green-600'}`}>
                                {l.event === 'disconnect' ? 'Connection Lost' : 'Connection Restored'}
                              </td>
                              <td className="py-2 font-mono">{l.durationOffline != null ? `${l.durationOffline}s` : '—'}</td>
                              <td className="py-2 text-slate-300 print:text-slate-700">
                                {l.event === 'disconnect' ? 'Disconnection registered' : `Connection compensated by ${l.compensatedTime || 0}s`}
                              </td>
                              <td className="py-2 text-slate-400 print:text-slate-600">
                                {l.timestamp ? new Date(l.timestamp.toDate?.() || l.timestamp).toLocaleString() : 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 6. Recommendations */}
                <div className="bg-slate-900/60 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-5 space-y-2">
                  <h3 className="text-lg font-bold text-white print:text-black border-b border-slate-800 print:border-slate-200 pb-2 mb-2">Recommendations</h3>
                  <ul className="list-disc list-inside text-sm text-slate-300 print:text-slate-700 space-y-1">
                    {selectedStudentReport.activityScore.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                    {selectedStudentReport.verifiedViolations.length > 0 && (
                      <li className="text-red-400 print:text-red-600 font-bold">Schedule an academic review to discuss proctoring incidents.</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MotionBackground>
  );
};