import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { StudentProfileQrFields } from '@/types/attendance';
import {
  buildAttendanceQrPayload,
  getIncompleteProfileFields,
  isProfileCompleteForQr,
  serializeAttendanceQrPayload,
} from '@/utils/attendanceQr';

interface StudentQrCardProps {
  uid: string;
  profile: StudentProfileQrFields;
}

export function StudentQrCard({ uid, profile }: StudentQrCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState<string | null>(null);

  const isComplete = useMemo(() => isProfileCompleteForQr(uid, profile), [uid, profile]);
  const missingFields = useMemo(
    () => getIncompleteProfileFields(uid, profile),
    [uid, profile]
  );

  const payloadKey = useMemo(
    () =>
      JSON.stringify({
        uid,
        ...profile,
      }),
    [uid, profile]
  );

  useEffect(() => {
    if (!isComplete) {
      setQrDataUrl('');
      setQrError(null);
      return;
    }

    let cancelled = false;

    const generate = async () => {
      try {
        const payload = buildAttendanceQrPayload(uid, profile);
        const serialized = serializeAttendanceQrPayload(payload);
        const dataUrl = await QRCode.toDataURL(serialized, {
          width: 280,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setQrError(null);
        }
      } catch {
        if (!cancelled) {
          setQrDataUrl('');
          setQrError('Could not generate QR code. Please try again.');
        }
      }
    };

    void generate();

    return () => {
      cancelled = true;
    };
  }, [isComplete, payloadKey, uid, profile]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `proctortab-attendance-${profile.studentNumber || uid}.png`;
    link.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <QrCode className="h-5 w-5" />
          Generate QR Code
        </CardTitle>
        <CardDescription>
          Show this code to your professor for attendance. It updates automatically when you save
          your profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isComplete ? (
          <Alert variant="destructive">
            <AlertTitle>Profile incomplete</AlertTitle>
            <AlertDescription>
              Complete these fields before generating your attendance QR:{' '}
              {missingFields.join(', ')}.
            </AlertDescription>
          </Alert>
        ) : null}

        {qrError ? (
          <Alert variant="destructive">
            <AlertTitle>QR generation failed</AlertTitle>
            <AlertDescription>{qrError}</AlertDescription>
          </Alert>
        ) : null}

        {isComplete && qrDataUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img
              src={qrDataUrl}
              alt="Student attendance QR code"
              className="h-[280px] w-[280px] rounded-lg border bg-white p-2"
            />
            <p className="text-center text-xs text-muted-foreground">
              Generated for {profile.name} · {profile.studentNumber}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Download QR
            </Button>
          </div>
        ) : null}

        {!isComplete ? (
          <p className="text-sm text-muted-foreground">
            Fill in all profile fields above and click Save Changes to enable your QR code.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
