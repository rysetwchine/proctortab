import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import {
  Users, CheckCircle2, Clock, XCircle, Search, Filter, Camera, Square, Edit, Trash2, Download, FileText,
  TrendingUp, BarChart3, ArrowUpDown, ChevronLeft, ChevronRight, AlertCircle, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import {
  getTodayDateString,
  subscribeGlobalAttendanceLogs,
  recordAttendance,
  updateAttendanceRecord,
  deleteAttendanceRecord
} from '@/utils/attendanceFirestore';
import { parseAttendanceQr } from '@/utils/attendanceQr';
import type { AttendanceLog, AttendanceStatus } from '@/types/attendance';
import { MotionBackground } from '@/components/shared/MotionBackground';

type ActiveSubTabType = 'dashboard' | 'scanner' | 'records' | 'reports';
type ReportType = 'daily' | 'weekly' | 'monthly' | 'course';

const SCANNER_ELEMENT_ID = 'instructor-webcam-qr-scanner';
const SCAN_COOLDOWN_MS = 3000;

export function InstructorAttendancePanel() {
  const { user: authUser } = useAuth();
  const { sessions } = useSession();

  const [activeSubTab, setActiveSubTab] = useState<ActiveSubTabType>('dashboard');
  const [allLogs, setAllLogs] = useState<AttendanceLog[]>([]);

  // Search & Filter (Records)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'date' | 'time'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Scanner states
  const [selectedCourseScanner, setSelectedCourseScanner] = useState('');
  const [scannerStatusMode, setScannerStatusMode] = useState<AttendanceStatus>('present');
  const [scannerRemarks, setScannerRemarks] = useState('');
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [scannerPhase, setScannerPhase] = useState<'idle' | 'loading' | 'scanning' | 'saving' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);

  // Edit Modal states
  const [editLog, setEditLog] = useState<AttendanceLog | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('present');
  const [editRemarks, setEditRemarks] = useState('');

  // Reports states
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [reportCourseId, setReportCourseId] = useState('all');

  const itemsPerPage = 10;
  const today = getTodayDateString();

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  // Get only courses owned by the professor
  const professorCourses = useMemo(() => {
    const ownerUid = authUser?.id || authUser?.uid || '';
    return sessions.filter((s) => s.type === 'course' && (!s.ownerUid || s.ownerUid === ownerUid));
  }, [sessions, authUser]);

  // Set default scanner course
  useEffect(() => {
    if (professorCourses.length > 0 && !selectedCourseScanner) {
      setSelectedCourseScanner(String(professorCourses[0].id));
    }
  }, [professorCourses, selectedCourseScanner]);

  // Total Enrolled Students
  const totalEnrolledStudents = useMemo(() => {
    const studentIds = new Set<string>();
    professorCourses.forEach((c) => {
      (c.enrolledStudents || []).forEach((id) => studentIds.add(String(id)));
    });
    return studentIds.size;
  }, [professorCourses]);

  // Subscribe to all global logs
  useEffect(() => {
    const unsubscribe = subscribeGlobalAttendanceLogs(
      setAllLogs,
      () => toast.error('Could not sync attendance data from cloud.')
    );
    return unsubscribe;
  }, []);

  // Filter logs to match only the professor's courses
  const professorLogs = useMemo(() => {
    const courseIds = new Set(professorCourses.map((c) => String(c.id)));
    return allLogs.filter((log) => log.courseId && courseIds.has(String(log.courseId)));
  }, [allLogs, professorCourses]);

  // Today's logs
  const todayLogs = useMemo(() => {
    return professorLogs.filter((log) => log.date === today);
  }, [professorLogs, today]);

  // Dashboard Stats
  const stats = useMemo(() => {
    const checkedInToday = new Set(todayLogs.map((l) => l.studentId));
    const presentToday = todayLogs.filter((l) => l.status === 'present').length;
    const lateToday = todayLogs.filter((l) => l.status === 'late').length;
    const absentToday = Math.max(0, totalEnrolledStudents - checkedInToday.size);
    const attendancePercentage = totalEnrolledStudents > 0
      ? Math.round(((presentToday + lateToday) / totalEnrolledStudents) * 100)
      : 0;

    const totalRecords = professorLogs.length;
    const presentCount = professorLogs.filter((l) => l.status === 'present').length;
    const lateCount = professorLogs.filter((l) => l.status === 'late').length;
    const absentCount = professorLogs.filter((l) => l.status === 'absent').length;

    return {
      totalRecords,
      presentCount,
      lateCount,
      absentCount,
      presentToday,
      lateToday,
      absentToday,
      percentage: attendancePercentage,
    };
  }, [professorLogs, todayLogs, totalEnrolledStudents]);

  // Handle camera retrieval
  useEffect(() => {
    if (activeSubTab !== 'scanner') {
      void stopCamera();
      return;
    }

    Html5Qrcode.getCameras()
      .then((devices) => {
        setCameras(devices);
        if (devices.length > 0 && !selectedCameraId) {
          setSelectedCameraId(devices[0].id);
        }
      })
      .catch((err) => {
        console.warn('Failed to retrieve web cameras:', err);
        setCameraError('Webcam devices not found or permission blocked.');
      });
  }, [activeSubTab]);

  const stopCamera = async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (!instance) return;
    try {
      if (instance.isScanning) await instance.stop();
      await instance.clear();
    } catch {
      /* ignore */
    }
  };

  const handleDecodedQr = async (decodedText: string) => {
    const trimmed = decodedText.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (lastScanRef.current.text === trimmed && now - lastScanRef.current.at < SCAN_COOLDOWN_MS) {
      return; // Cooldown active
    }
    lastScanRef.current = { text: trimmed, at: now };

    setScannerPhase('saving');

    const payload = parseAttendanceQr(trimmed);
    if (!payload) {
      setLastScanResult({ status: 'error', message: 'Malformed QR payload.' });
      toast.error('Malformed student QR code.');
      setScannerPhase('scanning');
      return;
    }

    // Validation: Has the QR code expired (screenshot protection)?
    const qrAgeMs = Date.now() - new Date(payload.generatedAt).getTime();
    const QR_EXPIRATION_LIMIT_MS = 5 * 60 * 1000; // 5 minutes expiration
    if (qrAgeMs > QR_EXPIRATION_LIMIT_MS) {
      setLastScanResult({ status: 'error', message: 'QR Code Expired. Please ask student to show a live QR code.' });
      toast.error('Scan failed: QR Code has expired.');
      setScannerPhase('scanning');
      return;
    }

    const course = professorCourses.find((c) => String(c.id) === String(selectedCourseScanner));
    if (!course) {
      setLastScanResult({ status: 'error', message: 'No course selected.' });
      toast.error('Invalid course selection.');
      setScannerPhase('scanning');
      return;
    }

    // Validation: Is student enrolled?
    const roster = (course.enrolledStudents || []).map(String);
    if (roster.length > 0 && !roster.includes(String(payload.uid))) {
      setLastScanResult({ status: 'error', message: `${payload.name} is not enrolled in this course.` });
      toast.error(`${payload.name} is not enrolled in ${course.title}.`);
      setScannerPhase('scanning');
      return;
    }

    // Validation: Already scanned today?
    const hasAlreadyScanned = professorLogs.some(
      (log) => String(log.studentId) === String(payload.uid) && log.courseId === course.id && log.date === today
    );
    if (hasAlreadyScanned) {
      setLastScanResult({ status: 'error', message: `${payload.name} already checked in today.` });
      toast.error(`${payload.name} has already checked in today for ${course.title}.`);
      setScannerPhase('scanning');
      return;
    }

    // Record Attendance
    try {
      const professorName = authUser?.name || 'Professor';
      await recordAttendance(String(course.id), payload, professorName, course.title, scannerStatusMode, scannerRemarks);
      setLastScanResult({ status: 'success', message: `${payload.name} marked ${scannerStatusMode} successfully.` });
      toast.success(`${payload.name} marked ${scannerStatusMode}.`);
    } catch (err) {
      console.error('Scan attendance recording failed:', err);
      setLastScanResult({ status: 'error', message: 'Failed to write attendance log.' });
      toast.error('Database connection error.');
    } finally {
      setScannerPhase('scanning');
    }
  };

  const startCamera = async () => {
    if (!selectedCameraId) {
      toast.error('No webcam selected.');
      return;
    }

    setCameraError(null);
    setScannerPhase('loading');
    setLastScanResult(null);

    try {
      await stopCamera();
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        selectedCameraId,
        { fps: 10, qrbox: 260 },
        (text) => void handleDecodedQr(text),
        () => {
          // Silent scan failure
        }
      );
      setScannerPhase('scanning');
    } catch (err: any) {
      console.error('Failed to start webcam scanner:', err);
      setCameraError(err.message || 'Webcam initialization failed.');
      setScannerPhase('error');
      await stopCamera();
    }
  };

  const handleStopScanner = async () => {
    await stopCamera();
    setScannerPhase('idle');
    setLastScanResult(null);
  };

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, []);

  // Records Table sorting & pagination
  const filteredLogs = useMemo(() => {
    let result = [...professorLogs];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.name.toLowerCase().includes(q) ||
          log.studentNumber.toLowerCase().includes(q) ||
          log.studentId.includes(q)
      );
    }

    if (selectedCourseFilter !== 'all') {
      result = result.filter((log) => String(log.courseId) === String(selectedCourseFilter));
    }

    if (selectedStatusFilter !== 'all') {
      result = result.filter((log) => log.status === selectedStatusFilter);
    }

    result.sort((a, b) => {
      const fieldA = a[sortField];
      const fieldB = b[sortField];
      return sortOrder === 'asc' ? fieldA.localeCompare(fieldB) : fieldB.localeCompare(fieldA);
    });

    return result;
  }, [professorLogs, searchQuery, selectedCourseFilter, selectedStatusFilter, sortField, sortOrder]);

  const paginatedLogs = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));

  const toggleSort = (field: 'date' | 'time') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Edit / Delete action handlers
  const handleOpenEdit = (log: AttendanceLog) => {
    setEditLog(log);
    setEditStatus(log.status);
    setEditRemarks(log.remarks || '');
  };

  const handleSaveEdit = async () => {
    if (!editLog) return;
    try {
      await updateAttendanceRecord(String(editLog.courseId), editLog.id, {
        status: editStatus,
        remarks: editRemarks,
      });
      toast.success('Attendance record updated.');
      setEditLog(null);
    } catch {
      toast.error('Failed to update record.');
    }
  };

  const handleDeleteRecord = async (log: AttendanceLog) => {
    if (!window.confirm(`Are you sure you want to delete the attendance log for ${log.name}?`)) return;
    try {
      await deleteAttendanceRecord(String(log.courseId), log.id);
      toast.success('Attendance record deleted.');
    } catch {
      toast.error('Failed to delete record.');
    }
  };

  // CSV Excel Export
  const handleExportCsv = () => {
    if (filteredLogs.length === 0) {
      toast.error('No records available to export.');
      return;
    }

    const headers = ['Student ID', 'Student Name', 'Course', 'Program', 'Year Level', 'Date', 'Time In', 'Status', 'Remarks'];
    const rows = filteredLogs.map((log) => [
      log.studentNumber || log.studentId || '',
      log.name || '',
      log.courseName || log.course || '',
      log.program || '',
      log.year || '',
      log.date || '',
      log.time || '',
      log.status || '',
      log.remarks || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((val) => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `proctortab-attendance-audit-${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Attendance records exported as CSV/Excel.');
  };

  // PDF Export
  const handleExportPdf = () => {
    if (filteredLogs.length === 0) {
      toast.error('No records available to export.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Pop-up blocked. Please allow pop-ups to print PDF.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Attendance Audit Log - ${new Date().toLocaleDateString()}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; }
            h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 5px; }
            p { font-size: 12px; color: #64748b; margin-bottom: 25px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
            th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; padding: 10px; font-weight: 600; color: #475569; }
            td { border-bottom: 1px solid #edf2f7; padding: 10px; color: #334155; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 500; text-transform: uppercase; }
            .badge-present { background: #dcfce7; color: #15803d; }
            .badge-late { background: #fef9c3; color: #a16207; }
            .badge-absent { background: #fee2e2; color: #b91c1c; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <h1>ProctorTab Attendance Audit Report</h1>
          <p>Generated on ${new Date().toLocaleString()} · All Courses Summary</p>
          <table>
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student Name</th>
                <th>Course</th>
                <th>Program</th>
                <th>Year Level</th>
                <th>Date</th>
                <th>Time In</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLogs
                .map(
                  (log) => `
                <tr>
                  <td>${log.studentNumber || log.studentId}</td>
                  <td>${log.name}</td>
                  <td>${log.courseName || log.course}</td>
                  <td>${log.program || '—'}</td>
                  <td>${log.year || '—'}</td>
                  <td>${log.date}</td>
                  <td>${log.time || '—'}</td>
                  <td><span class="badge badge-${log.status}">${log.status}</span></td>
                  <td>${log.remarks || '—'}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Reports Computations
  const reportMetrics = useMemo(() => {
    let list = [...professorLogs];
    if (reportCourseId !== 'all') {
      list = list.filter((l) => String(l.courseId) === String(reportCourseId));
    }

    if (reportType === 'daily') {
      list = list.filter((l) => l.date === today);
    } else if (reportType === 'weekly') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      list = list.filter((l) => new Date(l.date) >= oneWeekAgo);
    } else if (reportType === 'monthly') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
      list = list.filter((l) => new Date(l.date) >= oneMonthAgo);
    }

    const present = list.filter((l) => l.status === 'present').length;
    const late = list.filter((l) => l.status === 'late').length;
    const absent = list.filter((l) => l.status === 'absent').length;
    const total = present + late + absent;
    const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    // Student frequency rankings
    const freqMap: Record<string, { name: string; number: string; present: number; total: number }> = {};
    list.forEach((l) => {
      const key = l.studentId;
      if (!freqMap[key]) {
        freqMap[key] = { name: l.name, number: l.studentNumber, present: 0, total: 0 };
      }
      freqMap[key].total += 1;
      if (l.status === 'present' || l.status === 'late') {
        freqMap[key].present += 1;
      }
    });

    const studentRankings = Object.values(freqMap).map((item) => ({
      ...item,
      rate: item.total > 0 ? Math.round((item.present / item.total) * 100) : 0,
    })).sort((a, b) => a.rate - b.rate); // Sort ascending (worst attendance first)

    return {
      totalLogs: total,
      present,
      late,
      absent,
      rate: attendanceRate,
      rankings: studentRankings.slice(0, 5),
    };
  }, [professorLogs, reportType, reportCourseId, today]);

  const getStatusLabelBadge = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return <Badge className="bg-green-500/10 text-green-400 border border-green-500/20 capitalize">Present</Badge>;
      case 'late':
        return <Badge className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 capitalize">Late</Badge>;
      case 'absent':
        return <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 capitalize">Absent</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <MotionBackground>
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        {/* Header Title */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Attendance Workspace</h1>
          <p className="text-slate-400 text-sm">
            Monitor attendance stats, run built-in webcam scanners, and audit records in real-time.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex flex-wrap gap-2 p-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl w-fit backdrop-blur-md">
          <Button variant="ghost" onClick={() => setActiveSubTab('dashboard')} className={`rounded-xl px-4 h-10 text-xs font-semibold ${activeSubTab === 'dashboard' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
            <BarChart3 className="w-4 h-4 mr-1.5" /> Dashboard
          </Button>
          <Button variant="ghost" onClick={() => setActiveSubTab('scanner')} className={`rounded-xl px-4 h-10 text-xs font-semibold ${activeSubTab === 'scanner' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
            <Camera className="w-4 h-4 mr-1.5" /> Webcam Scanner
          </Button>
          <Button variant="ghost" onClick={() => setActiveSubTab('records')} className={`rounded-xl px-4 h-10 text-xs font-semibold ${activeSubTab === 'records' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
            <Users className="w-4 h-4 mr-1.5" /> Records Table
          </Button>
          <Button variant="ghost" onClick={() => setActiveSubTab('reports')} className={`rounded-xl px-4 h-10 text-xs font-semibold ${activeSubTab === 'reports' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
            <TrendingUp className="w-4 h-4 mr-1.5" /> Generate Reports
          </Button>
        </div>

        {/* 1. DASHBOARD SUBTAB */}
        {activeSubTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Stat Cards */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Card className="border-slate-800/80 bg-slate-950/40 backdrop-blur-xl p-4 text-center rounded-3xl shadow-xl flex flex-col justify-center min-h-[120px]">
                  <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-400 animate-pulse" />
                  <div className="text-3xl font-extrabold text-white">{stats.presentToday}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Present Today</div>
                </Card>
                <Card className="border-slate-800/80 bg-slate-950/40 backdrop-blur-xl p-4 text-center rounded-3xl shadow-xl flex flex-col justify-center min-h-[120px]">
                  <Clock className="mx-auto mb-1 h-5 w-5 text-amber-400 animate-pulse" />
                  <div className="text-3xl font-extrabold text-white">{stats.lateToday}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Late Today</div>
                </Card>
                <Card className="border-slate-800/80 bg-slate-950/40 backdrop-blur-xl p-4 text-center rounded-3xl shadow-xl flex flex-col justify-center min-h-[120px]">
                  <XCircle className="mx-auto mb-1 h-5 w-5 text-rose-400" />
                  <div className="text-3xl font-extrabold text-white">{stats.absentToday}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Absent Today</div>
                </Card>
                <Card className="border-slate-800/80 bg-slate-950/40 backdrop-blur-xl p-4 text-center rounded-3xl shadow-xl flex flex-col justify-center min-h-[120px]">
                  <TrendingUp className="mx-auto mb-1 h-5 w-5 text-indigo-400" />
                  <div className="text-3xl font-extrabold text-white">{stats.percentage}%</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Attendance Today</div>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Card className="border-slate-800/80 bg-slate-950/20 backdrop-blur-xl p-4 text-center rounded-3xl shadow-xl flex flex-col justify-center min-h-[120px]">
                  <Users className="mx-auto mb-1 h-5 w-5 text-blue-400" />
                  <div className="text-3xl font-extrabold text-white">{stats.totalRecords}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Total Records</div>
                </Card>
                <Card className="border-slate-800/80 bg-slate-950/20 backdrop-blur-xl p-4 text-center rounded-3xl shadow-xl flex flex-col justify-center min-h-[120px]">
                  <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-400" />
                  <div className="text-3xl font-extrabold text-white">{stats.presentCount}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Cumulative Present</div>
                </Card>
                <Card className="border-slate-800/80 bg-slate-950/20 backdrop-blur-xl p-4 text-center rounded-3xl shadow-xl flex flex-col justify-center min-h-[120px]">
                  <Clock className="mx-auto mb-1 h-5 w-5 text-amber-400" />
                  <div className="text-3xl font-extrabold text-white">{stats.lateCount}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Cumulative Late</div>
                </Card>
                <Card className="border-slate-800/80 bg-slate-950/20 backdrop-blur-xl p-4 text-center rounded-3xl shadow-xl flex flex-col justify-center min-h-[120px]">
                  <XCircle className="mx-auto mb-1 h-5 w-5 text-rose-400" />
                  <div className="text-3xl font-extrabold text-white">{stats.absentCount}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Cumulative Absent</div>
                </Card>
              </div>
            </div>

            {/* Today's Feed */}
            <Card className="border-slate-800 bg-slate-950/20 backdrop-blur-xl rounded-3xl shadow-xl">
              <CardHeader className="border-b border-slate-800/80 p-6">
                <CardTitle className="text-lg">Today&apos;s Attendance Activity</CardTitle>
                <CardDescription className="text-xs text-slate-400">Live check-in stream across all active courses for {today}.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {todayLogs.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-sm">No checks recorded for today. Get started by scanning QR passes.</div>
                ) : (
                  <div className="overflow-x-auto border border-slate-800/60 rounded-2xl">
                    <Table>
                      <TableHeader className="bg-slate-900/40">
                        <TableRow className="border-b border-slate-800">
                          <TableHead className="py-3 text-slate-400">Student Name</TableHead>
                          <TableHead className="py-3 text-slate-400">Course</TableHead>
                          <TableHead className="py-3 text-slate-400">Time</TableHead>
                          <TableHead className="py-3 text-slate-400">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {todayLogs.map((log) => (
                          <TableRow key={log.id} className="border-b border-slate-800 hover:bg-slate-900/20 transition-colors">
                            <TableCell className="font-semibold text-slate-200 py-3.5">{log.name}</TableCell>
                            <TableCell className="text-slate-300 py-3.5">{log.courseName || log.course}</TableCell>
                            <TableCell className="text-slate-400 py-3.5">{log.time}</TableCell>
                            <TableCell className="py-3.5">{getStatusLabelBadge(log.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 2. WEBCAM SCANNER SUBTAB */}
        {activeSubTab === 'scanner' && (
          <div className="grid gap-6 md:grid-cols-[1fr_360px] items-start animate-in fade-in duration-300">
            {/* Left: Webcam Feed viewport */}
            <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col p-6 items-center">
              <div className="w-full flex justify-between items-center gap-3 flex-wrap mb-4">
                <div className="flex gap-2 items-center flex-1">
                  <span className="text-xs font-semibold text-slate-400 shrink-0">Webcam:</span>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {cameras.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label || `Camera ${d.id.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  {scannerPhase === 'scanning' || scannerPhase === 'saving' ? (
                    <Button onClick={handleStopScanner} variant="destructive" size="sm" className="rounded-xl px-4 h-8 text-xs font-bold gap-1">
                      <Square className="w-3.5 h-3.5" /> Stop Scanner
                    </Button>
                  ) : (
                    <Button onClick={startCamera} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 h-8 text-xs font-bold gap-1" disabled={scannerPhase === 'loading' || !selectedCameraId}>
                      <Camera className="w-3.5 h-3.5" /> Start Camera
                    </Button>
                  )}
                </div>
              </div>

              {cameraError && (
                <div className="w-full bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-rose-400 text-xs flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Viewport Frame */}
              <div className="relative w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60 aspect-[4/3]">
                {scannerPhase === 'idle' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 space-y-2 text-center">
                    <Camera className="w-12 h-12 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-500">Camera is currently offline. Press "Start Camera" to begin scanning.</p>
                  </div>
                )}
                {scannerPhase === 'loading' && (
                  <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col items-center justify-center gap-2 rounded-3xl">
                    <RefreshCw className="w-8 h-8 text-blue-500 mx-auto animate-spin" />
                    <p className="text-xs text-slate-400">Initializing webcam device feed...</p>
                  </div>
                )}
                {scannerPhase === 'saving' && (
                  <div className="absolute inset-0 bg-slate-950/85 z-20 flex flex-col items-center justify-center gap-2 rounded-3xl">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-xs text-slate-400">Validating and saving check-in...</p>
                  </div>
                )}

                {/* Html5Qrcode video attaches here */}
                <div id={SCANNER_ELEMENT_ID} className={`absolute inset-0 !w-full !h-full [&_video]:!block [&_video]:!w-full [&_video]:!h-full [&_video]:object-cover [&_img]:hidden ${scannerPhase !== 'idle' ? 'block' : 'hidden'}`} />
              </div>
            </Card>

            {/* Right: Scan controls & validation results */}
            <div className="space-y-6">
              {/* Scan Configuration */}
              <Card className="border-slate-800 bg-slate-950/20 backdrop-blur-xl rounded-3xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-200">Scanner Setup</h3>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Mark Course</label>
                  <select
                    value={selectedCourseScanner}
                    onChange={(e) => setSelectedCourseScanner(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {professorCourses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Standard Status</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                    <button type="button" onClick={() => setScannerStatusMode('present')} className={`py-1 rounded-lg text-xs font-bold transition-all ${scannerStatusMode === 'present' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Present</button>
                    <button type="button" onClick={() => setScannerStatusMode('late')} className={`py-1 rounded-lg text-xs font-bold transition-all ${scannerStatusMode === 'late' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Late</button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Custom Remarks</label>
                  <Input
                    placeholder="e.g. excused, morning block"
                    value={scannerRemarks}
                    onChange={(e) => setScannerRemarks(e.target.value)}
                    className="bg-slate-900 border-slate-800 text-slate-300 h-9 rounded-xl text-xs placeholder:text-slate-600"
                  />
                </div>
              </Card>

              {/* Scan audit result logs */}
              {lastScanResult && (
                <Card className={`border-0 p-5 rounded-3xl shadow-xl ${lastScanResult.status === 'success' ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-500/20' : 'bg-rose-950/20 text-rose-400 border border-rose-500/20'}`}>
                  <h4 className="font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    {lastScanResult.status === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {lastScanResult.status === 'success' ? 'Scan Accepted' : 'Scan Blocked'}
                  </h4>
                  <p className="text-xs leading-relaxed opacity-90">{lastScanResult.message}</p>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* 3. AUDIT RECORDS TABLE SUBTAB */}
        {activeSubTab === 'records' && (
          <Card className="border-slate-800 bg-slate-950/20 backdrop-blur-xl rounded-3xl overflow-hidden shadow-xl animate-in fade-in duration-300">
            {/* Filters bar */}
            <CardHeader className="flex flex-col gap-4 border-b border-slate-800/80 p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-xl font-bold text-white">Attendance Audit Log</CardTitle>
                <CardDescription className="text-xs text-slate-400">View, update, delete, and filter all attendance check-ins.</CardDescription>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search name or ID..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="pl-9 bg-slate-900/60 border-slate-800 rounded-xl h-9 text-xs w-full sm:w-44 placeholder:text-slate-600 focus-visible:ring-blue-500"
                  />
                </div>

                <select
                  value={selectedCourseFilter}
                  onChange={(e) => { setSelectedCourseFilter(e.target.value); setCurrentPage(1); }}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl h-9 text-xs text-slate-300 px-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Courses</option>
                  {professorCourses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>

                <select
                  value={selectedStatusFilter}
                  onChange={(e) => { setSelectedStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl h-9 text-xs text-slate-300 px-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>

                <Button onClick={handleExportCsv} variant="outline" size="sm" className="h-9 rounded-xl border-slate-800 bg-slate-900/40 text-slate-300 hover:text-white gap-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" /> Export Excel
                </Button>
                <Button onClick={handleExportPdf} variant="outline" size="sm" className="h-9 rounded-xl border-slate-800 bg-slate-900/40 text-slate-300 hover:text-white gap-1.5 text-xs">
                  <FileText className="w-3.5 h-3.5" /> Print PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {paginatedLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">No attendance records match the filters.</div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto border border-slate-800/60 rounded-2xl bg-slate-950/20">
                    <Table>
                      <TableHeader className="bg-slate-900/40">
                        <TableRow className="border-b border-slate-800">
                          <TableHead className="py-3.5 text-slate-400">Student ID</TableHead>
                          <TableHead className="py-3.5 text-slate-400">Student Name</TableHead>
                          <TableHead className="py-3.5 text-slate-400">Course</TableHead>
                          <TableHead className="py-3.5 text-slate-400">Program</TableHead>
                          <TableHead className="py-3.5 text-slate-400">Year Level</TableHead>
                          <TableHead className="py-3.5 text-slate-400 cursor-pointer hover:text-white" onClick={() => toggleSort('date')}>
                            <div className="flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3" /></div>
                          </TableHead>
                          <TableHead className="py-3.5 text-slate-400 cursor-pointer hover:text-white" onClick={() => toggleSort('time')}>
                            <div className="flex items-center gap-1">Time In <ArrowUpDown className="w-3 h-3" /></div>
                          </TableHead>
                          <TableHead className="py-3.5 text-slate-400">Status</TableHead>
                          <TableHead className="py-3.5 text-slate-400">Remarks</TableHead>
                          <TableHead className="py-3.5 text-slate-400 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLogs.map((log) => (
                          <TableRow key={log.id} className="border-b border-slate-800 hover:bg-slate-900/20 transition-colors">
                            <TableCell className="text-slate-300 font-mono text-xs py-3.5">{log.studentNumber || log.studentId}</TableCell>
                            <TableCell className="font-semibold text-slate-200 py-3.5">{log.name}</TableCell>
                            <TableCell className="text-slate-300 py-3.5">{log.courseName || log.course}</TableCell>
                            <TableCell className="text-slate-300 py-3.5">{log.program || '—'}</TableCell>
                            <TableCell className="text-slate-300 py-3.5">{log.year || '—'}</TableCell>
                            <TableCell className="text-slate-300 py-3.5">{log.date}</TableCell>
                            <TableCell className="text-slate-300 py-3.5">{log.time || '—'}</TableCell>
                            <TableCell className="py-3.5">{getStatusLabelBadge(log.status)}</TableCell>
                            <TableCell className="text-slate-400 text-xs py-3.5 max-w-[120px] truncate" title={log.remarks}>{log.remarks || '—'}</TableCell>
                            <TableCell className="text-right py-3.5">
                              <div className="flex justify-end gap-1.5">
                                <Button onClick={() => handleOpenEdit(log)} variant="ghost" size="icon" className="h-7 w-7 text-blue-400 hover:bg-blue-950/20 hover:text-blue-300 rounded-lg">
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button onClick={() => void handleDeleteRecord(log)} variant="ghost" size="icon" className="h-7 w-7 text-rose-400 hover:bg-rose-950/20 hover:text-rose-300 rounded-lg">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Footer */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t border-slate-900">
                      <span className="text-xs text-slate-500">Page {currentPage} of {totalPages}</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="h-8 rounded-lg border-slate-800 text-slate-300 bg-slate-950/20 hover:bg-slate-900">Previous</Button>
                        <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="h-8 rounded-lg border-slate-800 text-slate-300 bg-slate-950/20 hover:bg-slate-900">Next</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 4. REPORTS GENERATOR SUBTAB */}
        {activeSubTab === 'reports' && (
          <div className="grid gap-6 md:grid-cols-[1fr_360px] items-start animate-in fade-in duration-300">
            {/* Left: Generated Report Summary */}
            <Card className="border-slate-800 bg-slate-950/20 backdrop-blur-xl rounded-3xl overflow-hidden shadow-xl p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white capitalize">{reportType} Attendance Report</h3>
                <p className="text-xs text-slate-400">Generated metric summaries matching active queries.</p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl text-center">
                  <div className="text-2xl font-bold text-white">{reportMetrics.totalLogs}</div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-1">Total Scans</p>
                </div>
                <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl text-center">
                  <div className="text-2xl font-bold text-emerald-400">{reportMetrics.present}</div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-1">Presents</p>
                </div>
                <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl text-center">
                  <div className="text-2xl font-bold text-amber-400">{reportMetrics.late}</div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-1">Lates</p>
                </div>
                <div className="p-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl text-center">
                  <div className="text-2xl font-bold text-blue-400">{reportMetrics.rate}%</div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-1">Check-in Rate</p>
                </div>
              </div>

              {/* Student Rankings (Worst attendance lists) */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-300">Pedagogical Alert: Top Absences / Low Check-ins</h4>
                {reportMetrics.rankings.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No low check-in alerts flagged for this report window.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-800/60 rounded-2xl bg-slate-950/20">
                    <Table>
                      <TableHeader className="bg-slate-900/20">
                        <TableRow className="border-b border-slate-800">
                          <TableHead className="py-2 text-slate-400">Student Name</TableHead>
                          <TableHead className="py-2 text-slate-400 text-center">Check-in rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportMetrics.rankings.map((student) => (
                          <TableRow key={student.number} className="border-b border-slate-850 hover:bg-slate-900/10">
                            <TableCell className="py-2.5 font-medium text-slate-200 text-xs">{student.name} ({student.number})</TableCell>
                            <TableCell className="py-2.5 text-center text-xs font-bold text-rose-400">{student.rate}% ({student.present}/{student.total})</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </Card>

            {/* Right: Report settings */}
            <Card className="border-slate-800 bg-slate-950/20 backdrop-blur-xl rounded-3xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-200">Report Scope</h3>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Report Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as ReportType)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="daily">Daily Summary</option>
                  <option value="weekly">Weekly Summary</option>
                  <option value="monthly">Monthly Summary</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Course Filter</label>
                <select
                  value={reportCourseId}
                  onChange={(e) => setReportCourseId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Courses</option>
                  {professorCourses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-3 text-[10px] text-slate-500 leading-normal">
                Reports compile scans dynamically across Firestore database collections, computing attendance ratios to flag student drop-offs.
              </div>
            </Card>
          </div>
        )}

        {/* Edit Record Modal dialog overlay */}
        {editLog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md border border-slate-800 bg-slate-950 text-slate-100 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
              <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-2">Audit Check-in: {editLog.name}</h3>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AttendanceStatus)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Remarks</label>
                <Input
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="bg-[#05021a] border-slate-800 text-slate-200 h-10 rounded-xl text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveEdit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-10">Save Audit</Button>
                <Button onClick={() => setEditLog(null)} variant="outline" className="flex-1 bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 rounded-xl h-10">Cancel</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </MotionBackground>
  );
}
