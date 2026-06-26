import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Link2, Loader2, Smartphone, Square } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  buildPhoneScannerUrl,
  createScannerSession,
  stopScannerSession,
  subscribeScannerSession,
} from '@/utils/attendanceScannerSession';
import {
  formatLanHostFromOrigin,
  getScannerBaseOrigin,
  isLocalHostname,
} from '@/utils/lanNetwork';
import { getProfessorDisplayName, readStoredUser } from '@/utils/storedUser';

interface PhoneScannerSessionPanelProps {
  courseId: string;
  courseName: string;
  enrolledStudentIds: string[];
}

export function PhoneScannerSessionPanel({
  courseId,
  courseName,
  enrolledStudentIds,
}: PhoneScannerSessionPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scannerUrl, setScannerUrl] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [lanHostHint, setLanHostHint] = useState<string | null>(null);
  const [lanDetectFailed, setLanDetectFailed] = useState(false);

  const professorLabel =
    readStoredUser().uid || getProfessorDisplayName();

  const resolvePhoneScannerUrl = useCallback(
    async (activeSessionId: string) => {
      const baseOrigin = await getScannerBaseOrigin(5173);
      const url = buildPhoneScannerUrl(courseId, activeSessionId, baseOrigin);
      const detected = formatLanHostFromOrigin(baseOrigin);
      const stillLocal =
        typeof window !== 'undefined' &&
        isLocalHostname(window.location.hostname) &&
        (detected.startsWith('localhost') || detected.startsWith('127.0.0.1'));

      setLanDetectFailed(stillLocal);
      setLanHostHint(stillLocal ? null : detected);

      return { url, stillLocal };
    },
    [courseId]
  );

  const handleStartPhoneSession = async () => {
    setIsStarting(true);
    try {
      if (sessionId && sessionActive) {
        await stopScannerSession(courseId, sessionId);
      }

      const newSessionId = await createScannerSession({
        courseId,
        courseName,
        createdBy: professorLabel,
        enrolledStudentIds,
      });

      const { url, stillLocal } = await resolvePhoneScannerUrl(newSessionId);
      setSessionId(newSessionId);
      setScannerUrl(url);
      setSessionActive(true);

      if (stillLocal) {
        toast.warning(
          'Could not detect LAN IP automatically. Open the app using http://YOUR_PC_IP:5173 on this PC, then start the session again.'
        );
      } else {
        toast.success('Attendance scanner ready. Open the scanner link in a new tab.');
      }
    } catch (err) {
      console.error('Failed to start phone scanner session:', err);
      toast.error('Could not start phone scanner. Check Firestore rules.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopPhoneSession = async () => {
    if (!sessionId) return;
    setIsStopping(true);
    try {
      await stopScannerSession(courseId, sessionId);
      setSessionActive(false);
      toast.success('Phone scanner session stopped.');
    } catch (err) {
      console.error('Failed to stop phone scanner session:', err);
      toast.error('Could not stop phone scanner session.');
    } finally {
      setIsStopping(false);
    }
  };

  const handleCopyLink = async () => {
    if (!scannerUrl) return;
    try {
      await navigator.clipboard.writeText(scannerUrl);
      toast.success('Scanner link copied.');
    } catch {
      toast.error('Could not copy link. Select and copy manually.');
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    
    const unsubscribe = subscribeScannerSession(
      courseId,
      sessionId,
      (session) => {
        if (!session) {
          setSessionActive(false);
          return;
        }
        setSessionActive(session.active);
      },
      (error) => {
        console.error('Scanner session sync error:', error);
        toast.error('Could not sync scanner session status.');
      }
    );
    
    return () => {
      unsubscribe();
    };
  }, [courseId, sessionId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5" />
          Attendance Scanner
        </CardTitle>
        <CardDescription>
          Open the scanner link on this laptop/PC to scan student QR codes. This dashboard updates in realtime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!sessionId ? (
          <>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={isStarting}
              onClick={() => void handleStartPhoneSession()}
            >
              {isStarting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="mr-2 h-4 w-4" />
              )}
              Open Attendance Scanner
            </Button>
            <p className="text-sm text-muted-foreground">
              Click to start a scanner session, then open the scanner link in a new tab on this same laptop/PC.
            </p>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant={sessionActive ? 'default' : 'secondary'}>
                  {sessionActive ? 'Session active' : 'Session stopped'}
                </Badge>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isStopping || !sessionActive}
                  onClick={() => void handleStopPhoneSession()}
                >
                  {isStopping ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="mr-2 h-4 w-4" />
                  )}
                  Stop Scanner
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isStarting}
                  onClick={() => void handleStartPhoneSession()}
                >
                  New session
                </Button>
              </div>

              {lanHostHint ? (
                <Alert>
                  <AlertTitle>Scanner link uses your LAN address</AlertTitle>
                  <AlertDescription>
                    Open: <code>http://{lanHostHint}/attendance/scan?…</code>
                  </AlertDescription>
                </Alert>
              ) : null}

              {lanDetectFailed ? (
                <Alert variant="destructive">
                  <AlertTitle>LAN IP not detected</AlertTitle>
                  <AlertDescription>
                    On this PC, open ProctorTab using your IPv4 from ipconfig (example{' '}
                    <code>http://192.168.1.10:5173</code>), then click <strong>New session</strong>.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col items-center gap-4">
                <div className="w-full space-y-2">
                  <p className="text-sm font-medium">Scanner link (Wi‑Fi)</p>
                  <div className="flex gap-2">
                      <Input readOnly value={scannerUrl} className="font-mono text-xs" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => void handleCopyLink()}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" asChild>
                        <a href={scannerUrl} target="_blank" rel="noopener noreferrer">
                          <Link2 className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  <p className="text-xs text-muted-foreground">
                    Open the link in a new tab (or copy it). Keep this dashboard open to see realtime attendance updates.
                  </p>
                </div>
              </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
