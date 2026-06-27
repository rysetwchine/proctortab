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
import { 
  Users, FolderOpen, ClipboardList, Monitor, Cpu, 
  Activity, Book, Bell, Ban, MousePointerClick, 
  AppWindow, Maximize 
} from 'lucide-react';
import { TabMonitoringDashboard } from './TabMonitoringDashboard';
import { type ArduinoTabStatus } from '@/hooks/useArduinoSerial';
import { useArduinoSerialContext } from '@/context/ArduinoSerialContext';

// Import the live wallpaper component
import { MotionBackground } from '@/components/shared/MotionBackground'; 

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
          studentId: row.userId,
          studentName: row.studentName || row.userId,
          assessmentTitle: row.assessmentTitle || row.examId || row.quizId || "Unknown",
          violation: "Mouse Tracking",
        }));
      setMouseViolationLogs(rows);
    });
    return () => unsub();
  }, []);

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
      if (durationSeconds <= 1) return 'ACCIDENTAL';
      if (durationSeconds < 3) return 'SUSPICIOUS';
      return 'CHEATING';
    };

    const statusFromExistingLog = (docData: any): ArduinoTabStatus | null => {
      const seconds = toNumberSeconds(docData?.durationSeconds);
      if (seconds != null) return statusFromDuration(seconds);
      const status = String(docData?.status || '').trim().toLowerCase();
      if (status === 'warning') return 'ACCIDENTAL';
      if (status === 'suspicious') return 'SUSPICIOUS';
      if (status === 'violation') return 'CHEATING';
      return null;
    };

    const unsub = onSnapshot(collection(db, "tab_logs"), (snapshot) => {
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        return;
      }
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added' && change.type !== 'modified') continue;
        const id = change.doc.id;
        if (sentIds.has(id)) continue;
        const docData = change.doc.data() as any;
        const status = statusFromExistingLog(docData);
        if (!status) continue;
        sentIds.add(id);
        void arduinoSendRef.current(status);
      }
    });
    return () => unsub();
  }, [arduino.isConnected]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const students = snapshot.docs.filter((d) => d.data().role === "student");
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
    const examCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await addDoc(collection(db, "exam_sessions"), {
      title: sessionTitle,
      code: examCode,
      status: "active",
      createdAt: new Date(),
      dueDate: selectedDueDate || null,
      enrolledStudents: [],
      questions: [],
    });
    setCreatedSession({ title: sessionTitle, code: examCode });
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
    <MotionBackground>
      {/* ================= MAIN CONTENT WRAPPER ================= */}
      <div className="relative z-10 space-y-8 pt-6 max-w-7xl mx-auto pb-12 px-4 sm:px-6 lg:px-8">
        
        {/* ================= DARK GLASS HEADER ================= */}
        <header className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-lg rounded-xl gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Instructor Dashboard</h1>
            <p className="text-cyan-400 mt-1 text-sm font-medium opacity-90">Overview and session management</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex gap-3">
              <Button
                variant={arduino.isConnected ? 'default' : 'outline'}
                className="gap-2 shadow-sm bg-slate-800/80 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white backdrop-blur-sm"
                disabled={!arduino.isSupported || arduino.isConnecting}
                onClick={() => {
                  if (!arduino.isSupported) return;
                  if (arduino.isConnected) void arduino.disconnect();
                  else void arduino.connect();
                }}
              >
                <Cpu className="w-4 h-4 text-cyan-400" />
                {arduino.isConnected ? 'Arduino Connected' : 'Connect Arduino'}
              </Button>

              {arduino.isConnected && (
                <Button variant="outline" className="shadow-sm bg-slate-800/80 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white backdrop-blur-sm" onClick={() => void arduino.sendStatus('CHEATING')}>
                  Test Alarm
                </Button>
              )}

              <Button
                variant={showTabMonitoring ? 'default' : 'outline'}
                onClick={() => setShowTabMonitoring(!showTabMonitoring)}
                className="gap-2 shadow-sm bg-slate-800/80 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white backdrop-blur-sm"
              >
                <Monitor className="w-4 h-4 text-cyan-400" />
                {showTabMonitoring ? 'Dashboard' : 'Monitor'}
              </Button>
            </div>

            {/* UPGRADED PROFESSOR PROFILE (DARK MODE) */}
            <div className="flex items-center gap-3 pl-6 border-l border-slate-700/50">
              <div className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shadow-md">
                {displayName?.charAt(0).toUpperCase()}
              </div>
              <div className="leading-tight hidden sm:block">
                <h2 className="text-lg font-bold text-white">{displayName}</h2>
                <span className="text-sm font-medium text-slate-400 capitalize">{storedUser?.role}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Show Tab Monitoring Dashboard or Regular Dashboard */}
        {showTabMonitoring ? (
          <div className="bg-slate-900/60 backdrop-blur-md rounded-xl p-4 border border-slate-700/50">
             <TabMonitoringDashboard />
          </div>
        ) : (
          <>
            {/* ================= DARK OVERVIEW CARDS ================= */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* TOTAL COURSES */}
              <div className="bg-slate-900/60 backdrop-blur-md rounded-xl shadow-lg border border-slate-700/50 p-6 flex items-center gap-5 transition hover:shadow-xl hover:bg-slate-800/80 hover:-translate-y-1 duration-300 cursor-pointer group" onClick={goCourses}>
                <div className="bg-blue-500/20 text-blue-400 border border-blue-500/30 w-14 h-14 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                  <Book className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-white leading-none mb-1">{localCoursesCount}</p>
                  <p className="text-sm text-slate-400 font-medium">Total Courses</p>
                  <span className="text-cyan-400 text-xs font-semibold mt-1 inline-block group-hover:underline">View All</span>
                </div>
              </div>

              {/* ACTIVE ASSESSMENTS */}
              <div className="bg-slate-900/60 backdrop-blur-md rounded-xl shadow-lg border border-slate-700/50 p-6 flex items-center gap-5 transition hover:shadow-xl hover:bg-slate-800/80 hover:-translate-y-1 duration-300 cursor-pointer group" onClick={goReportsExaminations}>
                <div className="bg-green-500/20 text-green-400 border border-green-500/30 w-14 h-14 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                  <ClipboardList className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-white leading-none mb-1">{upcomingCourseExamsCount}</p>
                  <p className="text-sm text-slate-400 font-medium">Active Assessments</p>
                  <span className="text-cyan-400 text-xs font-semibold mt-1 inline-block group-hover:underline">View All</span>
                </div>
              </div>

              {/* TOTAL STUDENTS */}
              <div className="bg-slate-900/60 backdrop-blur-md rounded-xl shadow-lg border border-slate-700/50 p-6 flex items-center gap-5 transition hover:shadow-xl hover:bg-slate-800/80 hover:-translate-y-1 duration-300 cursor-pointer group" onClick={goReportsStudents}>
                <div className="bg-purple-500/20 text-purple-400 border border-purple-500/30 w-14 h-14 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                  <Users className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-white leading-none mb-1">{studentsCount}</p>
                  <p className="text-sm text-slate-400 font-medium">Total Students</p>
                  <span className="text-cyan-400 text-xs font-semibold mt-1 inline-block group-hover:underline">View All</span>
                </div>
              </div>
              
            </section>

            {/* ================= DARK LIVE SESSION AREA ================= */}
            <section className="bg-slate-900/70 backdrop-blur-lg rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden">
              
              {/* Pulsing Live Header */}
              <div className="bg-slate-950/80 px-6 py-4 flex flex-col sm:flex-row items-center justify-between border-b border-slate-800/80 gap-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,1)]"></span>
                  </span>
                  <h2 className="text-white font-bold tracking-wider uppercase text-lg">Live Session Monitoring</h2>
                </div>
                <span className="bg-slate-800 text-cyan-300 text-xs font-bold px-3 py-1.5 rounded-md border border-slate-700 shadow-inner">
                  {activeSession?.title ? `ACTIVE SESSION • ${activeSession.title}` : "NO ACTIVE SESSION"}
                </span>
              </div>

              {/* Live Session Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-700/50 bg-slate-900/40 border-b border-slate-700/50">
                <div className="p-6 text-center">
                  <Users className="w-8 h-8 text-blue-400 mx-auto mb-2 drop-shadow-md" />
                  <p className="text-3xl font-bold text-white">{uniqueStudents}</p>
                  <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide mt-1">Students Active</p>
                </div>
                <div className="p-6 text-center">
                  <Bell className="w-8 h-8 text-amber-400 mx-auto mb-2 drop-shadow-md" />
                  <p className="text-3xl font-bold text-white">{alertsCount}</p>
                  <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide mt-1">New Alerts</p>
                </div>
                <div className="p-6 text-center bg-red-950/20">
                  <Ban className="w-8 h-8 text-red-500 mx-auto mb-2 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <p className="text-3xl font-bold text-red-400">{violationsCount}</p>
                  <p className="text-sm font-semibold text-red-500/80 uppercase tracking-wide mt-1">Total Violations</p>
                </div>
              </div>

              {/* Live Monitoring Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse bg-transparent">
                  <thead>
                    <tr className="bg-slate-800/60 text-slate-300 text-xs uppercase tracking-wider border-b border-slate-700/50">
                      <th className="p-4 font-bold">Student Name</th>
                      <th className="p-4 font-bold">Subject</th>
                      <th className="p-4 font-bold">Assessment Type (Exam/Quiz)</th>
                      <th className="p-4 font-bold">Violation</th>
                      <th className="p-4 font-bold">Threshold/Action</th>
                      <th className="p-4 font-bold">Time</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-700/50">
                    {[...filteredLogs]
                      .sort((a, b) => {
                        const timeA = a.timestamp?.seconds || 0;
                        const timeB = b.timestamp?.seconds || 0;
                        return timeB - timeA;
                      })
                      .map((log, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 font-medium text-slate-100">{log.studentName || log.studentId}</td>

                          <td className="p-4 text-slate-300 font-medium">
                            {(() => {
                              const subject = String(log.subject ?? log.course ?? log.courseTitle ?? '').trim();
                              return subject || '—';
                            })()}
                          </td>

                          <td className="p-4">
                            {(() => {
                              const quizLike = String(log.quizId ?? log.quizTitle ?? '').trim();
                              const examLike = String(log.examId ?? log.examTitle ?? '').trim();
                              const assessmentType = quizLike ? 'Quiz' : examLike ? 'Exam' : (String(log.assessmentType ?? '').trim() || '—');
                              return (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md border bg-violet-500/10 text-violet-300 text-xs font-bold">
                                  {assessmentType}
                                </span>
                              );
                            })()}
                          </td>

                          <td className="p-4">
                            {(() => {
                              const type = log.violationType;
                              const text = String(log.violation || log.alert || "Tab Switch").trim();

                              let Icon = AppWindow;
                              let colorClass = "bg-red-500/20 text-red-400 border-red-500/30";

                              if (type === "mouse_boundary_exit" || text.toLowerCase().includes("mouse")) {
                                Icon = MousePointerClick;
                                colorClass = "bg-orange-500/20 text-orange-400 border-orange-500/30";
                              } else if (text.toLowerCase().includes("fullscreen")) {
                                Icon = Maximize;
                                colorClass = "bg-amber-500/20 text-amber-400 border-amber-500/30";
                              }

                              return (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${colorClass}`}>
                                  <Icon className="w-3.5 h-3.5" />
                                  {text}
                                </span>
                              );
                            })()}
                          </td>

                          <td className="p-4 text-slate-300">
                            {(() => {
                              const classification = log.behaviorClassification || (
                                log.durationSeconds != null && log.durationSeconds > 0
                                  ? log.durationSeconds <= 1
                                    ? 'Accidental'
                                    : log.durationSeconds <= 3
                                      ? 'Suspicious'
                                      : 'Intentional'
                                  : 'Intentional'
                              );

                              const rawTime = log.deductedTime ?? (log.deductedMinutes ? log.deductedMinutes * 60 : 0);
                              const deductedMins = Math.round(rawTime / 60);

                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-200 font-semibold">{classification}</span>
                                    {deductedMins > 0 && (
                                      <Badge variant="outline" className="bg-red-500/10 border-red-500/20 text-red-400 font-black">
                                        -{deductedMins}m
                                      </Badge>
                                    )}
                                  </div>
                                  {log.warningMessage && (
                                    <p className="text-[10px] text-slate-500 max-w-[220px] truncate" title={log.warningMessage}>
                                      {log.warningMessage}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </td>

                          <td className="p-4 text-slate-400 font-medium">{log.timestamp?.toDate?.()?.toLocaleString() || "N/A"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Footer / Filters */}
              <div className="bg-slate-900/80 border-t border-slate-700/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Popover open={coursePickerOpen} onOpenChange={setCoursePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="shadow-sm font-semibold bg-slate-800/80 text-slate-200 border-slate-600 hover:bg-slate-700 hover:text-white">
                        Filter by Section
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-3 shadow-2xl rounded-xl bg-slate-800 border-slate-700 text-white">
                      <div className="space-y-3">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Select Section</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={selectedCourseFilter === 'All Section' ? 'default' : 'outline'}
                            size="sm"
                            className={selectedCourseFilter === 'All Section' ? "bg-cyan-600 text-white hover:bg-cyan-500" : "bg-slate-900/50 text-slate-300 border-slate-600 hover:bg-slate-700"}
                            onClick={() => { setSelectedCourseFilter('All Section'); setCoursePickerOpen(false); }}
                          >
                            All Section
                          </Button>
                          {availableCourseTitles.length === 0 ? (
                            <span className="text-xs text-slate-500 px-1 py-1">No courses found.</span>
                          ) : (
                            availableCourseTitles.map((title) => (
                              <Button
                                key={title}
                                type="button"
                                variant={selectedCourseFilter === title ? 'default' : 'outline'}
                                size="sm"
                                className={selectedCourseFilter === title ? "bg-cyan-600 text-white hover:bg-cyan-500" : "bg-slate-900/50 text-slate-300 border-slate-600 hover:bg-slate-700"}
                                onClick={() => { setSelectedCourseFilter(title); setCoursePickerOpen(false); }}
                              >
                                {title}
                              </Button>
                            ))
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Badge variant="secondary" className="px-3 py-1 text-sm bg-slate-800/80 border border-slate-600 text-cyan-400 shadow-sm">
                    {selectedCourseFilter}
                  </Badge>
                </div>

                <Button variant="destructive" onClick={handleDeleteAllLogs} className="shadow-sm bg-red-600 hover:bg-red-500 text-white font-bold">
                  Clear All Logs
                </Button>
              </div>
              
            </section>
          </>
        )}
      </div>
    </MotionBackground>
  );
};