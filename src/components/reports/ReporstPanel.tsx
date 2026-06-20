import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Users, AlertTriangle, Search, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { studentProfileDocId } from '@/utils/studentDirectory';
import { useSession } from '@/hooks/useSession';
import type { Session, CourseAssessment } from '@/context/SessionContext';

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

  const totalViolations = useMemo(
    () => logs.filter(isViolationLike).length,
    [logs]
  );

  const studentsWithActivity = useMemo(() => {
    const keys = new Set<string>();
    logs.forEach((log) => {
      if (!isViolationLike(log)) return;
      const k =
        log.userId ||
        log.studentId ||
        log.studentName ||
        log.user ||
        '';
      if (k) keys.add(String(k));
    });
    return keys.size;
  }, [logs]);

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold">View Reports</h2>
          <p className="text-muted-foreground mt-1">
            Course assessments (local), Firebase users, profiles, and <code className="text-xs">tab_logs</code>
          </p>
        </div>
        <Button variant="outline" className="gap-2" type="button" onClick={handleExport}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary cards removed per request */}

      <div className="flex gap-2">
        <Button variant={activeView === 'exams' ? 'default' : 'outline'} onClick={() => setActiveView('exams')}>
          Assessment Reports
        </Button>
        <Button variant={activeView === 'students' ? 'default' : 'outline'} onClick={() => setActiveView('students')}>
          Student Reports
        </Button>
      </div>

      {activeView === 'exams' && (
        <div className="space-y-6">
          <Card id="examination-reports" className="scroll-mt-4 border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl">Assessment Reports</CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Assessments and quizzes you created inside <strong>Courses</strong>, where the due date is still in the future
                (or no due date is set). Violations are <code className="text-xs">tab_logs</code> events whose{' '}
                <code className="text-xs">examTitle</code> and <code className="text-xs">course</code> match this row
                (written when a student starts an assessment from a course).
              </p>
            </CardHeader>
            <CardContent>
              {upcomingCourseExaminations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No upcoming course assessments. Add assessments under a course and set due dates as needed.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Assessment title</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Students</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Violations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingCourseExaminations.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium">
                            <div>{r.examTitle}</div>
                            <div className="text-xs text-muted-foreground font-normal mt-0.5">{r.courseTitle}</div>
                          </td>
                          <td className="px-4 py-3 text-sm">{formatDate(r.dueAt)}</td>
                          <td className="px-4 py-3 text-sm">{r.students}</td>
                          <td className="px-4 py-3 text-sm">{r.violations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeView === 'students' && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-xl">Students (Firestore users + profiles)</CardTitle>
                <p className="text-sm text-muted-foreground font-normal mt-1">
                  Matches instructor dashboard &quot;Total Students&quot; (role = student). Profile columns merge{' '}
                  <code className="text-xs">student_profiles</code> when present.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search name, email, ID…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {users.length === 0 && usersFromProfilesOnly.length === 0
                  ? 'No student users or profiles yet.'
                  : 'No students match your search.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Student</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Student #</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Email / UID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Course</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Tab events</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Copy/paste flags</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((student) => (
                      <tr key={student.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium">{student.displayName}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{student.studentNumber}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div className="max-w-[200px] truncate" title={student.email || student.id}>
                            {student.email || '—'}
                          </div>
                          <div className="text-xs font-mono truncate" title={student.id}>
                            {student.id}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">{student.displayCourse}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`font-semibold ${
                              student.tabSwitches > 2
                                ? 'text-red-600'
                                : student.tabSwitches > 0
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                            }`}
                          >
                            {student.tabSwitches}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`font-semibold ${
                              student.copyPasteAttempts > 0 ? 'text-red-600' : 'text-green-600'
                            }`}
                          >
                            {student.copyPasteAttempts}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {student.violationEvents > 5 ? (
                            <Badge variant="destructive">Flagged</Badge>
                          ) : student.violationEvents > 0 ? (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              Watch
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-100 text-green-800">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
};
