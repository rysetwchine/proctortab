import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { Camera, Loader2, Square, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  formatCameraError,
  getCameraSupportInfo,
  requestCameraPermission,
  startHtml5QrcodeCamera,
  waitForScannerMount,
} from '@/utils/attendanceCamera';
import {
  getTodayDateString,
  processStudentAttendanceScan,
  recordAttendance,
  subscribeAttendanceLogs,
} from '@/utils/attendanceFirestore';
import { subscribeScannerSession } from '@/utils/attendanceScannerSession';
import type { AttendanceLog } from '@/types/attendance';

const SCANNER_ELEMENT_ID = 'phone-attendance-qr-scanner';
const SCAN_COOLDOWN_MS = 2800;

type ScanPhase = 'idle' | 'loading' | 'scanning' | 'saving' | 'stopped' | 'error';

export default function PhoneAttendanceScanPage() {
  const [searchParams] = useSearchParams();
  
  // Memoize URL params so they don't trigger effect re-runs on every render
  const { courseId, sessionId, paramsValid } = useMemo(() => {
    const cId = searchParams.get('course')?.trim() ?? '';
    const sId = searchParams.get('session')?.trim() ?? '';
    return {
      courseId: cId,
      sessionId: sId,
      paramsValid: Boolean(cId && sId),
    };
  }, [searchParams]);

  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const [courseName, setCourseName] = useState('');
  const [enrolledIds, setEnrolledIds] = useState<string[]>([]);
  const [scannedBy, setScannedBy] = useState('');
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [lastScanName, setLastScanName] = useState<string | null>(null);
  const [lastScanStatus, setLastScanStatus] = useState<'success' | 'error' | null>(null);
  const [lastScanMessage, setLastScanMessage] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const logsRef = useRef<AttendanceLog[]>([]);
  const sessionActiveRef = useRef(false);
  const courseNameRef = useRef('');
  const enrolledIdsRef = useRef<string[]>([]);
  const scannedByRef = useRef('');
  const courseIdRef = useRef('');
  const phaseRef = useRef<ScanPhase>('idle');

  const today = getTodayDateString();
  const todayCount = useMemo(
    () => logs.filter((log) => log.date === today).length,
    [logs, today]
  );

  // Memoize camera support info to avoid infinite loop in useSyncExternalStore
  const cameraSupport = useMemo(() => getCameraSupportInfo(), []);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    courseNameRef.current = courseName;
  }, [courseName]);

  useEffect(() => {
    enrolledIdsRef.current = enrolledIds;
  }, [enrolledIds]);

  useEffect(() => {
    scannedByRef.current = scannedBy;
  }, [scannedBy]);

  useEffect(() => {
    courseIdRef.current = courseId;
  }, [courseId]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stopCamera = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (!instance) return;
    try {
      if (instance.isScanning) await instance.stop();
      await instance.clear();
    } catch {
      /* ignore */
    }
  }, []);

  const handleDecodedQr = useCallback(
    async (decodedText: string) => {
      if (!sessionActiveRef.current || processingRef.current) return;

      const trimmed = decodedText.trim();
      if (!trimmed) return;

      const now = Date.now();
      if (
        lastScanRef.current.text === trimmed &&
        now - lastScanRef.current.at < SCAN_COOLDOWN_MS
      ) {
        return;
      }
      lastScanRef.current = { text: trimmed, at: now };

      processingRef.current = true;
      setPhase('saving');

      const result = processStudentAttendanceScan(trimmed, {
        courseName: courseNameRef.current || 'this course',
        enrolledStudentIds: enrolledIdsRef.current,
        scannedByProfessor: scannedByRef.current,
        existingLogs: logsRef.current,
        today: getTodayDateString(),
      });

      if ('message' in result) {
        setLastScanStatus('error');
        setLastScanMessage(result.message);
        toast.error(result.message);
        setPhase('scanning');
        processingRef.current = false;
        return;
      }

      if (!('payload' in result)) {
        setLastScanStatus('error');
        setLastScanMessage('Invalid scan result');
        toast.error('Invalid scan result');
        setPhase('scanning');
        processingRef.current = false;
        return;
      }

      try {
        await recordAttendance(courseIdRef.current, result.payload, scannedByRef.current, courseNameRef.current);
        setScanCount((c) => c + 1);
        setLastScanName(result.payload.name);
        setLastScanStatus('success');
        setLastScanMessage(`${result.payload.name} marked present.`);
        toast.success(`${result.payload.name} marked present.`);
      } catch (err) {
        console.error('Phone attendance save failed:', err);
        setLastScanStatus('error');
        setLastScanMessage('Failed to save attendance.');
        toast.error('Failed to save attendance.');
      } finally {
        processingRef.current = false;
        if (sessionActiveRef.current) setPhase('scanning');
      }
    },
    []
  );

  const startCamera = useCallback(async () => {
    if (!sessionActiveRef.current) {
      toast.error('Scanner session is not active.');
      return;
    }

    setCameraError(null);
    setPhase('loading');

    try {
      const camSupport = getCameraSupportInfo();
      if (!camSupport.supported) {
        throw new Error(camSupport.message ?? 'Camera is not available.');
      }

      // Request camera permission explicitly before starting scanner
      try {
        await requestCameraPermission();
      } catch (permissionErr) {
        const permissionMsg = formatCameraError(permissionErr);
        setCameraError(permissionMsg);
        setPhase('error');
        toast.error(permissionMsg);
        return;
      }

      await stopCamera();
      await waitForScannerMount(SCANNER_ELEMENT_ID);

      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
      scannerRef.current = scanner;

      await startHtml5QrcodeCamera(
        scanner,
        (text) => {
          void handleDecodedQr(text);
        },
        { fps: 10, qrbox: 280, preferRearCamera: true }
      );

      setPhase('scanning');
    } catch (err) {
      console.error('Phone camera start failed:', err);
      const message = formatCameraError(err);
      setCameraError(message);
      setPhase('error');
      toast.error(message);
      await stopCamera();
    }
  }, [handleDecodedQr, stopCamera]);

  const handleStopScanner = async () => {
    await stopCamera();
    setPhase('stopped');
    toast.message('Scanner stopped on this phone.');
  };

  useEffect(() => {
    if (!paramsValid) return;
    
    const unsubscribe = subscribeAttendanceLogs(
      courseId,
      (logs) => {
        setLogs(logs);
      },
      () => {
        console.error('Could not load attendance records');
        toast.error('Could not load attendance records.');
      }
    );
    
    return () => {
      unsubscribe?.();
    };
  }, [courseId, paramsValid]);

  useEffect(() => {
    if (!paramsValid) return;
    
    const unsubscribe = subscribeScannerSession(
      courseId,
      sessionId,
      (session) => {
        if (!session) {
          setSessionActive(false);
          sessionActiveRef.current = false;
          return;
        }
        setCourseName(session.courseName);
        setEnrolledIds(session.enrolledStudentIds);
        setScannedBy(session.createdBy);
        setSessionActive(session.active);
        sessionActiveRef.current = session.active;
        
        // Stop camera if session ends using ref to avoid dependency chain
        if (!session.active) {
          if (phaseRef.current === 'scanning' || phaseRef.current === 'loading') {
            setPhase('stopped');
          }
          void stopCamera();
        }
      },
      (error) => {
        console.error('Scanner session error:', error);
        toast.error('Could not load scanner session.');
      }
    );
    
    return () => {
      unsubscribe();
    };
  }, [courseId, sessionId, paramsValid, stopCamera]);

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  if (!paramsValid) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle>Invalid scanner link</CardTitle>
            <CardDescription>
              Open the scanner from the professor&apos;s Attendance tab using &quot;Use Phone
              Scanner&quot;.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-lg flex-col gap-4 p-4 pb-8">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            ProctorTab Attendance
          </p>
          <h1 className="text-xl font-bold">{courseName || 'Course scanner'}</h1>
          <p className="text-sm text-muted-foreground">Scan student QR codes from Profile</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="secondary">Today: {todayCount}</Badge>
          <Badge variant="secondary">This session: {scanCount}</Badge>
          {sessionActive === false ? (
            <Badge variant="destructive">Session ended</Badge>
          ) : sessionActive ? (
            <Badge>Session active</Badge>
          ) : (
            <Badge variant="outline">Loading session…</Badge>
          )}
        </div>

        {sessionActive === false ? (
          <Alert variant="destructive">
            <AlertTitle>Session stopped</AlertTitle>
            <AlertDescription>
              The professor ended this scanner session on PC. Ask them to start a new phone session.
            </AlertDescription>
          </Alert>
        ) : null}

        {!cameraSupport.supported ? (
          <Alert variant="destructive">
            <AlertTitle>Camera not available</AlertTitle>
            <AlertDescription>{cameraSupport.message}</AlertDescription>
          </Alert>
        ) : null}

        {cameraError ? (
          <Alert variant="destructive">
            <AlertTitle>Camera error</AlertTitle>
            <AlertDescription>{cameraError}</AlertDescription>
          </Alert>
        ) : null}

        {lastScanMessage ? (
          <Alert variant={lastScanStatus === 'success' ? 'default' : 'destructive'}>
            <AlertTitle className="flex items-center gap-2">
              {lastScanStatus === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : null}
              {lastScanStatus === 'success' ? 'Checked in' : 'Scan issue'}
            </AlertTitle>
            <AlertDescription>{lastScanMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="p-3">
            <div className="relative overflow-hidden rounded-lg border bg-muted/30">
              {(phase === 'loading' || phase === 'saving') && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/85">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    {phase === 'loading' ? 'Starting camera…' : 'Saving attendance…'}
                  </p>
                </div>
              )}
              <div
                id={SCANNER_ELEMENT_ID}
                className="min-h-[min(70vh,520px)] w-full [&_video]:!block [&_video]:h-full [&_video]:w-full [&_img]:hidden"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="flex-1"
            disabled={
              phase === 'loading' ||
              phase === 'saving' ||
              sessionActive !== true ||
              !cameraSupport.supported
            }
            onClick={() => void startCamera()}
          >
            {phase === 'loading' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            {phase === 'scanning' || phase === 'saving' ? 'Restart camera' : 'Start camera'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            disabled={phase === 'idle' || phase === 'loading'}
            onClick={() => void handleStopScanner()}
          >
            <Square className="mr-2 h-4 w-4" />
            Stop Scanner
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Tap <strong>Start camera</strong> and allow permission. Use an{' '}
          <strong>https://</strong> link from the professor&apos;s QR code.
        </p>
      </div>
    </div>
  );
}
