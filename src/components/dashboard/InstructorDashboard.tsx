import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, orderBy, query } from "firebase/firestore";
import { db } from "@/firebase";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/hooks/useSession';
import { formatJoinCode } from '@/utils/codeGenerator';
import { getCurrentOwnerUid } from '@/utils/storedUser';
import { Plus, Copy, CheckCircle, AlertTriangle, Users, FileEdit, FolderOpen, ClipboardList, Monitor } from 'lucide-react';
import { TabMonitoringDashboard } from './TabMonitoringDashboard';
import { type ArduinoTabStatus } from '@/hooks/useArduinoSerial';
import { useArduinoSerialContext } from '@/context/ArduinoSerialContext';


interface InstructorDashboardProps {
  onNavigate: (tab: string) => void;
}

function isCourseAssessmentNotPastDue(dueDate: string | undefined): boolean {
  if (dueDate == null || String(dueDate).trim() === '') return true;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() >= Date.now();
}

export const InstructorDashboard = ({ onNavigate }: InstructorDashboardProps) => {
  const { sessions } = useSession();
  const storedProfile = JSON.parse(localStorage.getItem("userProfile") || "{}");
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");

  const displayName =
    storedUser?.role === "professor"
      ? storedUser?.name
      : storedProfile?.name || storedUser?.name || "Unknown User";

  const myUid = getCurrentOwnerUid();
  const myCourses = useMemo(
    () =>
      sessions.filter(
        (s) => s.type === "course" && (!myUid || !s.ownerUid || s.ownerUid === myUid)
      ),
    [sessions, myUid]
  );

  const localCoursesCount = myCourses.length;
  const upcomingCourseExamsCount = useMemo(() => {
    let n = 0;
    for (const s of myCourses) {
      for (const a of s.assessments || []) {
        if (isCourseAssessmentNotPastDue(a.dueDate)) n += 1;
      }
    }
    return n;
  }, [myCourses]);

  const [studentsCount, setStudentsCount] = useState(0);
  const [liveJoinSessionsCount, setLiveJoinSessionsCount] = useState(0);
  const [tabLogs, setTabLogs] = useState<any[]>([]);
  const [mouseViolationLogs, setMouseViolationLogs] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [createdSession, setCreatedSession] = useState<{ title: string; code: string } | null>(null);
  const [selectedDueDate, setSelectedDueDate] = useState('');
  const [showTabMonitoring, setShowTabMonitoring] = useState(false);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('All Section');
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);

  const logs = useMemo(() => [...tabLogs, ...mouseViolationLogs], [tabLogs, mouseViolationLogs]);

  // Arduino (USB) alarm/display integration (instructor laptop only)
  const arduino = useArduinoSerialContext();
  const arduinoSendRef = useRef(arduino.sendStatus);
  useEffect(() => {
    arduinoSendRef.current = arduino.sendStatus;
  }, [arduino.sendStatus]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "exam_sessions"), (snapshot) => {
      const rows = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as { id: string; status?: string; title?: string }[];

      const activeRows = rows.filter((s) => s.status === "active");
      setLiveJoinSessionsCount(activeRows.length);
      setActiveSession(activeRows[0] || null);
    });

    return () => unsub();
  }, []);
  const availableCourseTitles = useMemo(() => {
    const fromCourses = (myCourses || [])
      .map((c: any) => String(c?.title || '').trim())
      .filter(Boolean);
    const fromLogs = (logs || [])
      .map((l: any) => String(l?.course || '').trim())
      .filter(Boolean);
    const uniq = Array.from(new Set([...fromCourses, ...fromLogs]));
    uniq.sort((a, b) => a.localeCompare(b));
    return uniq;
  }, [myCourses, logs]);

  const filteredLogs = useMemo(() => {
    const selected = String(selectedCourseFilter || '').trim();
    if (!selected || selected === 'All Section') return logs || [];
    return (logs || []).filter((l: any) => String(l?.course || '').trim() === selected);
  }, [logs, selectedCourseFilter]);

  const uniqueStudents = useMemo(
    () => new Set((filteredLogs || []).map((log: any) => log.userId || log.studentId)).size,
    [filteredLogs]
  );

  // 🔴 ALERTS (warning / alert / screenshot / etc.)
  const alertsCount = useMemo(
    () =>
      (filteredLogs || []).filter((log: any) =>
        log.alert === "warning" ||
        log.alert === "alert" ||
        log.violation?.toLowerCase?.().includes("screenshot") ||
        log.alert?.toLowerCase?.().includes("screenshot")
      ).length,
    [filteredLogs]
  );

  // ⚠️ VIOLATIONS (tab switching + duration-based + explicit violation label)
  const violationsCount = useMemo(
    () =>
      (filteredLogs || []).filter((log: any) =>
        log.tabSwitched === true ||
        log.violation?.toLowerCase?.().includes("tab") ||
        log.violation?.toLowerCase?.().includes("switch") ||
        log.violationType === "mouse_boundary_exit" ||
        log.violation?.toLowerCase?.().includes("mouse") ||
        log.violation?.toLowerCase?.().includes("tracking")
      ).length,
    [filteredLogs]
  );
 


useEffect(() => {
  const unsub = onSnapshot(collection(db, "tab_logs"), (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    setTabLogs(data);
  });

  return () => unsub();
}, []);

useEffect(() => {
  const q = query(collection(db, "assessment_violations"), orderBy("timestamp", "desc"));
  const unsub = onSnapshot(q, (snapshot) => {
    const rows = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((row: any) => row?.violationType === "mouse_boundary_exit")
      .map((row: any) => ({
        ...row,
        // Normalize to match the live dashboard table fields
        studentId: row.userId,
        studentName: row.studentName || row.userId,
        assessmentTitle: row.assessmentTitle || row.examId || row.quizId || "Unknown",
        violation: "Mouse Tracking",
      }));

    setMouseViolationLogs(rows);
  });

  return () => unsub();
}, []);

// When the Arduino is connected, listen for NEW tab-switch logs and send a STATUS command immediately.
// This does NOT modify any existing tab detection; it only reacts to the existing Firestore logs.
useEffect(() => {
  if (!arduino.isConnected) return;

  let isFirstSnapshot = true;
  const sentIds = new Set<string>();

  const toNumberSeconds = (raw: unknown): number | null => {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const statusFromDuration = (durationSeconds: number): ArduinoTabStatus => {
    // User requirements:
    // 0–1 second  -> ACCIDENTAL
    // 1–3 seconds -> SUSPICIOUS
    // 3+ seconds  -> CHEATING
    if (durationSeconds <= 1) return 'ACCIDENTAL';
    // Note: durationSeconds is an integer in our logs. We treat 3 as "3+"
    // to match the Arduino threshold requirement.
    if (durationSeconds < 3) return 'SUSPICIOUS';
    return 'CHEATING';
  };

  const statusFromExistingLog = (docData: any): ArduinoTabStatus | null => {
    // Prefer exact duration bucketing if present
    const seconds = toNumberSeconds(docData?.durationSeconds);
    if (seconds != null) return statusFromDuration(seconds);

    // Fallback: many parts of the app already store a categorical status.
    // Map it to the required Arduino STATUS commands.
    const status = String(docData?.status || '').trim().toLowerCase();
    if (status === 'warning') return 'ACCIDENTAL';
    if (status === 'suspicious') return 'SUSPICIOUS';
    if (status === 'violation') return 'CHEATING';

    return null;
  };

  const unsub = onSnapshot(collection(db, "tab_logs"), (snapshot) => {
    // Skip the initial snapshot so we don't replay historical logs on connect.
    if (isFirstSnapshot) {
      isFirstSnapshot = false;
      return;
    }

    for (const change of snapshot.docChanges()) {
      // Some flows may "modify" an existing log doc; handle both.
      if (change.type !== 'added' && change.type !== 'modified') continue;

      const id = change.doc.id;
      if (sentIds.has(id)) continue;

      const docData = change.doc.data() as any;
      const status = statusFromExistingLog(docData);
      if (!status) continue;

      sentIds.add(id);
      // Send immediately to Arduino
      void arduinoSendRef.current(status);

      // Helpful debug in console
      // eslint-disable-next-line no-console
      console.log('[Arduino] Sent', status, 'for tab_log', id, docData?.durationSeconds ?? docData?.status);
    }
  });

  return () => unsub();
}, [arduino.isConnected]);

useEffect(() => {
  const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
    const students = snapshot.docs.filter(
      (d) => d.data().role === "student"
    );
    setStudentsCount(students.length);
  });

  return () => unsub();
}, []);

  const goCourses = () => onNavigate("courses");

  const goReportsExaminations = () => {
    sessionStorage.setItem("reportsInitialView", "examination");
    onNavigate("reports");
  };

  const goActiveExamsLiveSessions = () => {
    sessionStorage.setItem("activeExamsFocus", "live-sessions");
    onNavigate("active-exams");
  };

  const goReportsStudents = () => {
    sessionStorage.setItem("reportsInitialView", "students");
    onNavigate("reports");
  };

 const handleCreateSession = async () => {
  if (!sessionTitle.trim()) return;

  const examCode = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

  await addDoc(collection(db, "exam_sessions"), {
    title: sessionTitle,
    code: examCode,
    status: "active",
    createdAt: new Date(),
    dueDate: selectedDueDate || null,
    enrolledStudents: [],
    questions: [],
  });

  setCreatedSession({
    title: sessionTitle,
    code: examCode,
  });

  setSessionTitle('');
  setShowCreateSession(false);
  setSelectedDueDate('');

  alert("Assessment Code: " + examCode);
};

  const copyJoinCode = async (code: string) => {
    const formattedCode = formatJoinCode(code);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(formattedCode);
      } else {
        // Fallback for older browsers or restricted iframes
        const textArea = document.createElement("textarea");
        textArea.value = formattedCode;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Fallback copy failed', err);
        }
        textArea.remove();
      }
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Still show copied state to user even if it failed in preview
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };
const handleDeleteAllLogs = async () => {
  const confirmDelete = window.confirm(
    "Are you sure you want to delete ALL logs? This cannot be undone."
  );

  if (!confirmDelete) return;

  try {
    const deletePromises = [
      ...(tabLogs || []).map((log) => deleteDoc(doc(db, "tab_logs", log.id))),
      ...(mouseViolationLogs || []).map((log) => deleteDoc(doc(db, "assessment_violations", log.id))),
    ];

    await Promise.all(deletePromises);

    alert("All logs deleted successfully!");
  } catch (error) {
    console.error("Error deleting logs:", error);
    alert("Failed to delete logs.");
  }
};
 

  return (
  <div className="space-y-6 pt-6">

 {/* HEADER */}
<div className="h-14 flex items-center justify-between">

 <div className="flex items-center mb-4 w-full">

  {/* LEFT SIDE */}
  <div className="flex-1">
    <h2 className="text-3xl font-bold leading-tight">
      Instructor Dashboard
    </h2>

    <p className="text-muted-foreground text-sm mt-0.5">
      Overview and session management
    </p>
  </div>

  {/* RIGHT SIDE (FORCED TO EDGE) */}
  <div className="flex items-center gap-3 ml-auto">

    <Button
      variant={arduino.isConnected ? 'default' : 'outline'}
      size="sm"
      className="gap-2"
      disabled={!arduino.isSupported || arduino.isConnecting}
      title={
        !arduino.isSupported
          ? 'Web Serial is not supported in this browser. Use Chrome/Edge.'
          : undefined
      }
      onClick={() => {
        if (!arduino.isSupported) return;
        if (arduino.isConnected) {
          void arduino.disconnect();
        } else {
          void arduino.connect();
        }
      }}
    >
      {arduino.isConnected ? 'Arduino Connected' : 'Connect Arduino'}
    </Button>

    {arduino.isConnected ? (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void arduino.sendStatus('CHEATING')}
        title="Sends STATUS:CHEATING to test LED/buzzer"
      >
        Test Alarm
      </Button>
    ) : null}

    <Button
      variant={showTabMonitoring ? 'default' : 'outline'}
      onClick={() => setShowTabMonitoring(!showTabMonitoring)}
      className="gap-2"
      size="sm"
    >
      <Monitor className="w-4 h-4" />
      {showTabMonitoring ? 'Dashboard' : 'Monitor'}
    </Button>

    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
      {displayName?.charAt(0).toUpperCase()}
    </div>

    <div className="flex flex-col leading-tight">
      <span className="font-semibold">
        {displayName}
      </span>

      <span className="text-sm text-muted-foreground capitalize">
        {storedUser?.role}
      </span>
    </div>

  </div>

</div>

</div>

  {/* Show Tab Monitoring Dashboard or Regular Dashboard */}
  {showTabMonitoring ? (
    <TabMonitoringDashboard />
  ) : (
    <>
    {/* DASHBOARD STATS ROW */}
    <div className="grid grid-cols-3 gap-4 mt-4 mb-4">

  {/* TOTAL COURSES */}
  <div className="bg-card border rounded-xl p-4 flex gap-3 items-center">

    <div className="w-14 h-14 flex items-center justify-center bg-blue-100 rounded-lg">
      <FolderOpen className="w-7 h-7 text-blue-600" />
    </div>

    <div className="flex flex-col flex-1">
      <p className="text-3xl font-bold leading-none">{localCoursesCount}</p>
      <p className="text-sm text-muted-foreground">Total Courses</p>

      <button
        type="button"
        className="text-xs text-primary hover:underline mt-2 text-left"
        onClick={goCourses}
      >
        View All
      </button>
    </div>

  </div>

  {/* ACTIVE EXAMS */}
  <div className="bg-card border rounded-xl p-4 flex gap-3 items-center">

    <div className="w-14 h-14 flex items-center justify-center bg-green-100 rounded-lg">
      <ClipboardList className="w-7 h-7 text-green-600" />
    </div>

    <div className="flex flex-col flex-1">
      <p className="text-3xl font-bold leading-none">{upcomingCourseExamsCount}</p>
      <p className="text-sm text-muted-foreground">Active Assessments</p>

      <button
        type="button"
        className="text-xs text-primary hover:underline mt-2 text-left"
        onClick={goReportsExaminations}
      >
        View All
      </button>
    </div>

  </div>

  {/* TOTAL STUDENTS */}
  <div className="bg-card border rounded-xl p-4 flex gap-3 items-center">

    <div className="w-14 h-14 flex items-center justify-center bg-purple-100 rounded-lg">
      <Users className="w-7 h-7 text-purple-600" />
    </div>

    <div className="flex flex-col flex-1">
      <p className="text-3xl font-bold leading-none">{studentsCount}</p>
      <p className="text-sm text-muted-foreground">Total Students</p>

      <button
        type="button"
        className="text-xs text-primary hover:underline mt-2 text-left"
        onClick={goReportsStudents}
      >
        View All
      </button>
    </div>

  </div>

</div>

     {/* LIVE SESSION MONITORING DASHBOARD */}
<Card>
  <CardHeader>
    <CardTitle className="text-center bg-accent text-accent-foreground py-3 rounded-t-lg">
      LIVE SESSION MONITORING DASHBOARD
    </CardTitle>
  </CardHeader>

  <CardContent className="space-y-4">

    {/* LIVE STATUS BAR */}
    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-md text-center font-semibold text-sm">
      <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
      LIVE SESSION • {activeSession?.title || "No Active Session"}
    </div>

    {/* STATS */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      
      <Card>
        <CardContent className="flex flex-col items-center p-4 text-center">
          <Users className="w-6 h-6 text-blue-500 mb-1" />
          <p className="text-2xl font-bold text-blue-500">{uniqueStudents}</p>
          <p className="text-xs text-muted-foreground">Students</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col items-center p-4 text-center">
          <AlertTriangle className="w-6 h-6 text-red-500 mb-1" />
          <p className="text-2xl font-bold text-red-500">{alertsCount}</p>
          <p className="text-xs text-muted-foreground">Alerts</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col items-center p-4 text-center">
          <FileEdit className="w-6 h-6 text-purple-500 mb-1" />
          <p className="text-2xl font-bold text-purple-500">{violationsCount}</p>
          <p className="text-xs text-muted-foreground">Violations</p>
        </CardContent>
      </Card>

    </div>

    {/* LIVE TABLE */}
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Student</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Assessment - Subject</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Violation</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Threshold</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Time</th>
          </tr>
        </thead>

        <tbody>
         {[...filteredLogs]
  .sort((a, b) => {
    const timeA = a.timestamp?.seconds || 0;
    const timeB = b.timestamp?.seconds || 0;
    return timeB - timeA;
  })
  .map((log, idx) => (
            <tr key={idx} className="border-b">
              <td className="px-4 py-3 text-sm">
                {log.studentName || log.studentId}
              </td>

              <td className="px-4 py-3 text-sm">
                {(() => {
                  const assessmentTitle = String(
                    log.examTitle ?? log.assessmentTitle ?? log.assessmentName ?? log.title ?? ''
                  ).trim();
                  const courseTitle = String(log.course ?? '').trim();
                  if (assessmentTitle && courseTitle) return `${assessmentTitle} - ${courseTitle}`;
                  return assessmentTitle || courseTitle || 'N/A';
                })()}
              </td>

              <td className="px-4 py-3 text-sm text-red-500">
                {log.violation || log.alert || "Tab Switch"}
              </td>

              <td className="px-4 py-3 text-sm">
                {(() => {
                  if (log.violationType === "mouse_boundary_exit") {
                    const raw = log.deductedMinutes;
                    const n =
                      typeof raw === "number"
                        ? raw
                        : typeof raw === "string"
                          ? Number(raw)
                          : null;
                    const ded = n == null || Number.isNaN(n) ? null : n;
                    return ded != null ? `${ded} min deducted` : "Mouse boundary exit";
                  }

                  const raw = log.durationSeconds;
                  const n =
                    typeof raw === 'number'
                      ? raw
                      : typeof raw === 'string'
                        ? Number(raw)
                        : null;
                  if (n == null || Number.isNaN(n)) return '—';
                  // Rules requested:
                  // 0-1 seconds: accidental
                  // 1-3 seconds: suspicious
                  // 3+ seconds: intentional
                  // Use non-overlapping buckets (matches tab duration detector):
                  // <=1 accidental, <3 suspicious, >=3 intentional
                  const label = n <= 1 ? 'Accidental' : n < 3 ? 'Suspicious' : 'Intentional';
                  return `${n}s • ${label}`;
                })()}
              </td>

              <td className="px-4 py-3 text-sm">
                {log.timestamp?.toDate?.()?.toLocaleString() || "N/A"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
  <div className="flex items-center gap-2">
    <Popover open={coursePickerOpen} onOpenChange={setCoursePickerOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          Section
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground px-1">Filter</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={selectedCourseFilter === 'All Section' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setSelectedCourseFilter('All Section');
                setCoursePickerOpen(false);
              }}
            >
              All Section
            </Button>
            {availableCourseTitles.length === 0 ? (
              <span className="text-xs text-muted-foreground px-1 py-1">No courses found.</span>
            ) : (
              availableCourseTitles.map((title) => (
                <Button
                  key={title}
                  type="button"
                  variant={selectedCourseFilter === title ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedCourseFilter(title);
                    setCoursePickerOpen(false);
                  }}
                >
                  {title}
                </Button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>

    <Badge variant="secondary">
      {selectedCourseFilter}
    </Badge>
  </div>

  <Button
    variant="destructive"
    onClick={handleDeleteAllLogs}
  >
    Delete All Logs
  </Button>
</div>
  </CardContent>
</Card>
      
      </>
    )}
    </div>
  );
};
