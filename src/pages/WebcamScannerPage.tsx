/**
 * WebcamScannerPage
 * ------------------
 * Standalone full-screen webcam QR attendance attendance scanner page.
 * Route: /webcam-scanner?course=<courseId>&professor=<name>
 *
 * This page is opened in a new browser tab by the instructor.
 * It uses the native getUserMedia + jsQR hook (no html5-qrcode).
 * The video element is ALWAYS in the DOM (opacity-based show/hide)
 * so Chrome continuously decodes frames — no black screen.
 *
 * KEY UPDATE: Direct Course Selector dropdown added in the sidebar
 * so professors can switch courses or select one if none is passed in URL.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, Camera, Square, RefreshCw, WifiOff, Shield, ChevronLeft } from 'lucide-react';
import { useWebcamQrScanner } from '@/hooks/useWebcamQrScanner';
import {
  getTodayDateString,
  subscribeGlobalAttendanceLogs,
  recordAttendance,
} from '@/utils/attendanceFirestore';
import { parseAttendanceQr } from '@/utils/attendanceQr';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import type { AttendanceLog, AttendanceStatus } from '@/types/attendance';

const SCAN_COOLDOWN_MS = 3000;

export default function WebcamScannerPage() {
  const [searchParams] = useSearchParams();
  const { sessions } = useSession();
  const { user: authUser } = useAuth();

  // URL params: ?course=<courseId>&status=present|late
  const courseId = searchParams.get('course') ?? '';
  const defaultStatus = (searchParams.get('status') as AttendanceStatus) ?? 'present';

  const [selectedCourseId, setSelectedCourseId] = useState(courseId);
  const [scannerStatus, setScannerStatus] = useState<AttendanceStatus>(defaultStatus);
  const [allLogs, setAllLogs] = useState<AttendanceLog[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [scanHistory, setScanHistory] = useState<Array<{
    id: string;
    name: string;
    status: 'success' | 'error';
    message: string;
    time: string;
  }>>([]);

  const lastScanRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const logsRef = useRef<AttendanceLog[]>([]);

  const today = getTodayDateString();

  // Get only courses owned by the professor
  const professorCourses = useMemo(() => {
    const ownerUid = authUser?.id || authUser?.uid || '';
    return sessions.filter((s) => s.type === 'course' && (!s.ownerUid || s.ownerUid === ownerUid));
  }, [sessions, authUser]);

  // Default to first course if none selected
  useEffect(() => {
    if (!selectedCourseId && professorCourses.length > 0) {
      setSelectedCourseId(String(professorCourses[0].id));
    }
  }, [professorCourses, selectedCourseId]);

  // Sync selectedCourseId if search param changes
  useEffect(() => {
    if (courseId) {
      setSelectedCourseId(courseId);
    }
  }, [courseId]);

  // Find the course from session list
  const course = useMemo(() => {
    return sessions.find((s) => String(s.id) === String(selectedCourseId));
  }, [sessions, selectedCourseId]);

  // Today's count for this course
  const todayCount = useMemo(() => {
    return allLogs.filter((l) => l.date === today && String(l.courseId) === String(selectedCourseId)).length;
  }, [allLogs, today, selectedCourseId]);

  // Keep logsRef in sync
  useEffect(() => { logsRef.current = allLogs; }, [allLogs]);

  // Subscribe to attendance logs
  useEffect(() => {
    const unsub = subscribeGlobalAttendanceLogs(setAllLogs, () => {});
    return unsub;
  }, []);

  // ── QR decode handler ──────────────────────────────────────────────────────
  const handleDecodedQr = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSaving) return;

    if (!selectedCourseId) {
      toast.error('Please select a course before scanning.');
      return;
    }

    const now = Date.now();
    if (lastScanRef.current.text === trimmed && now - lastScanRef.current.at < SCAN_COOLDOWN_MS) return;
    lastScanRef.current = { text: trimmed, at: now };

    setIsSaving(true);

    const scanId = Math.random().toString(36).slice(2, 8);
    const timeStr = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const payload = parseAttendanceQr(trimmed);
    if (!payload) {
      setScanHistory((h) => [{ id: scanId, name: 'Unknown', status: 'error', message: 'Malformed QR code.', time: timeStr }, ...h.slice(0, 19)]);
      toast.error('Malformed student QR code.');
      setIsSaving(false);
      return;
    }

    // QR expiration (screenshot protection — 5 min)
    const qrAgeMs = Date.now() - new Date(payload.generatedAt).getTime();
    if (qrAgeMs > 5 * 60 * 1000) {
      setScanHistory((h) => [{ id: scanId, name: payload.name, status: 'error', message: 'QR expired. Student must show a live QR.', time: timeStr }, ...h.slice(0, 19)]);
      toast.error('QR code has expired.');
      setIsSaving(false);
      return;
    }

    // Enrollment check
    if (course) {
      const roster = (course.enrolledStudents || []).map(String);
      if (roster.length > 0 && !roster.includes(String(payload.uid))) {
        setScanHistory((h) => [{ id: scanId, name: payload.name, status: 'error', message: `Not enrolled in ${course.title}.`, time: timeStr }, ...h.slice(0, 19)]);
        toast.error(`${payload.name} is not enrolled in this course.`);
        setIsSaving(false);
        return;
      }
    }

    // Duplicate check
    const alreadyIn = logsRef.current.some(
      (l) => String(l.studentId) === String(payload.uid) && String(l.courseId) === String(selectedCourseId) && l.date === today
    );
    if (alreadyIn) {
      setScanHistory((h) => [{ id: scanId, name: payload.name, status: 'error', message: 'Already checked in today.', time: timeStr }, ...h.slice(0, 19)]);
      toast.error(`${payload.name} already checked in today.`);
      setIsSaving(false);
      return;
    }

    // Save attendance
    try {
      const cId = selectedCourseId;
      const cName = course?.title || 'Unknown Course';
      await recordAttendance(cId, payload, 'Professor', cName, scannerStatus, '');
      setScanHistory((h) => [{ id: scanId, name: payload.name, status: 'success', message: `Marked ${scannerStatus} ✓`, time: timeStr }, ...h.slice(0, 19)]);
      toast.success(`${payload.name} marked ${scannerStatus}.`);
    } catch {
      setScanHistory((h) => [{ id: scanId, name: payload.name, status: 'error', message: 'Database error. Try again.', time: timeStr }, ...h.slice(0, 19)]);
      toast.error('Failed to save attendance.');
    } finally {
      setIsSaving(false);
    }
  }, [course, selectedCourseId, scannerStatus, today, isSaving]);

  // ── Native webcam scanner hook ─────────────────────────────────────────────
  const { videoRef, status: camStatus, errorMessage, cameras, start, stop } = useWebcamQrScanner({
    onDecode: handleDecodedQr,
    fps: 10,
    deviceId: selectedCameraId || undefined,
  });

  const isStreaming = camStatus === 'streaming';
  const isRequesting = camStatus === 'requesting';

  // Auto-select default camera
  useEffect(() => {
    if (cameras.length > 0 && !selectedCameraId) {
      setSelectedCameraId(cameras[0].deviceId);
    }
  }, [cameras, selectedCameraId]);

  return (
    <div className="min-h-screen bg-[#030508] text-white flex flex-col">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="font-extrabold text-sm text-white tracking-tight">ProctorTab</span>
          </div>
          <span className="text-slate-600 text-xs">|</span>
          <span className="text-xs font-semibold text-blue-400">Webcam Scanner</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (window.opener) {
                window.close();
              } else {
                window.location.href = '/professor';
              }
            }}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {isStreaming
              ? <><div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /><span className="text-red-400 font-semibold">LIVE</span></>
              : <><WifiOff className="w-3.5 h-3.5" /><span>Offline</span></>}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden animate-in fade-in duration-300">
        {/* ── Left: Video Feed ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col p-4 gap-3">

          {/* Camera + Controls bar */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 truncate"
            >
              {cameras.length === 0 && <option value="">— Click Start Camera to list devices —</option>}
              {cameras.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>

            {isStreaming ? (
              <button
                onClick={stop}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
              >
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            ) : (
              <button
                onClick={() => void start()}
                disabled={isRequesting}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
              >
                {isRequesting
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Starting...</>
                  : <><Camera className="w-3.5 h-3.5" /> Start Camera</>}
              </button>
            )}
          </div>

          {/* Error banner */}
          {errorMessage && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-3 text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Video viewport — full height, no display:none */}
          <div className="relative flex-1 min-h-[300px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950">

            {/* Idle placeholder */}
            {!isStreaming && !isRequesting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center">
                  <Camera className="w-10 h-10 text-slate-500" />
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-sm font-semibold">Camera is offline</p>
                  <p className="text-slate-600 text-xs mt-1">Click <span className="text-blue-400">Start Camera</span> and allow permission</p>
                </div>
              </div>
            )}

            {/* Requesting overlay */}
            {isRequesting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90 z-20">
                <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
                <p className="text-slate-300 text-sm">Requesting camera permission...</p>
              </div>
            )}

            {/* Saving overlay */}
            {isSaving && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70 z-30">
                <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
                <p className="text-emerald-300 text-sm font-semibold">Saving attendance...</p>
              </div>
            )}

            {/* Scan corner guides (only when streaming) */}
            {isStreaming && (
              <>
                <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-blue-400 rounded-tl-lg z-10 pointer-events-none" />
                <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-blue-400 rounded-tr-lg z-10 pointer-events-none" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-blue-400 rounded-bl-lg z-10 pointer-events-none" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-blue-400 rounded-br-lg z-10 pointer-events-none" />
              </>
            )}

            {/*
             * ✅ THE VIDEO ELEMENT
             * CRITICAL: Never use display:none / hidden class while streaming.
             * Chrome stops decoding frames for display:none elements → black screen.
             * We use opacity-0 (invisible but still decoded) vs opacity-100 (visible).
             */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                isStreaming ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>
        </div>

        {/* ── Right Panel: Info + Scan Log ─────────────────────────────── */}
        <div className="w-[300px] flex flex-col border-l border-slate-800/60 bg-slate-950/30 overflow-hidden">

          {/* Course Selector */}
          <div className="p-4 border-b border-slate-800/60 space-y-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1.5">Select Course</label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 truncate"
              >
                <option value="">— Select Course —</option>
                {professorCourses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <div className="text-2xl font-extrabold text-white">{todayCount}</div>
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mt-0.5">Today</div>
              </div>
              <div className="flex-1 bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <div className="text-2xl font-extrabold text-emerald-400">{scanHistory.filter(s => s.status === 'success').length}</div>
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mt-0.5">This Session</div>
              </div>
            </div>

            {/* Status mode toggle */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1.5">Mark As</p>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setScannerStatus('present')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all ${scannerStatus === 'present' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  Present
                </button>
                <button
                  type="button"
                  onClick={() => setScannerStatus('late')}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all ${scannerStatus === 'late' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  Late
                </button>
              </div>
            </div>
          </div>

          {/* Scan History Log */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold sticky top-0 bg-slate-950/60 py-1 z-10">Scan Log</p>
            {scanHistory.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-slate-600">No scans yet.<br/>Point a student QR code at the camera.</p>
              </div>
            ) : (
              scanHistory.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs ${
                    entry.status === 'success'
                      ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
                      : 'bg-red-950/20 border-red-500/20 text-red-300'
                  }`}
                >
                  {entry.status === 'success'
                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{entry.name}</div>
                    <div className="opacity-70">{entry.message}</div>
                    <div className="opacity-50 text-[10px] mt-0.5">{entry.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
