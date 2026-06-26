/**
 * useWebcamQrScanner
 * -------------------
 * Native webcam + QR scanner hook.
 * getUserMedia() → <video> ref → canvas + jsQR frame scanning.
 *
 * KEY FIX: The <video> element must NEVER use display:none while streaming.
 * Chrome does not decode video frames for hidden (display:none) elements,
 * causing a permanent black screen even though the camera hardware is on.
 * Use opacity / visibility instead to hide/show the video in the UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

export type ScannerStatus = 'idle' | 'requesting' | 'streaming' | 'error';

export interface UseWebcamQrScannerOptions {
  /** Called every time a valid QR code string is decoded */
  onDecode: (text: string) => void;
  /** Frames per second to scan (default 10) */
  fps?: number;
  /** Device ID to use. If omitted the browser picks the default camera. */
  deviceId?: string;
}

export interface UseWebcamQrScannerReturn {
  /** Attach this ref to the <video> element in JSX */
  videoRef: React.RefObject<HTMLVideoElement>;
  status: ScannerStatus;
  errorMessage: string | null;
  /** Available cameras — populated after first permission grant */
  cameras: MediaDeviceInfo[];
  start: () => Promise<void>;
  stop: () => void;
}

export function useWebcamQrScanner({
  onDecode,
  fps = 10,
  deviceId,
}: UseWebcamQrScannerOptions): UseWebcamQrScannerReturn {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number | null>(null);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const activeRef   = useRef(false); // guards against stale async callbacks
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const [status, setStatus]           = useState<ScannerStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras]         = useState<MediaDeviceInfo[]>([]);

  // ── stop ─────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    activeRef.current = false;

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setStatus('idle');
  }, []);

  // ── scanFrame ─────────────────────────────────────────────────────────────
  const scheduleNextScan = useCallback((fn: () => void, delayMs: number) => {
    timerRef.current = setTimeout(() => {
      if (activeRef.current) {
        rafRef.current = requestAnimationFrame(fn);
      }
    }, delayMs);
  }, []);

  const scanFrame = useCallback(() => {
    if (!activeRef.current) return;

    const video = videoRef.current;
    // Wait until the video has real decoded frame data
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      scheduleNextScan(scanFrame, 100); // retry soon
      return;
    }

    // Lazy-create an offscreen canvas
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { scheduleNextScan(scanFrame, 100); return; }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result  = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (result?.data) {
        onDecodeRef.current(result.data);
      }
    } catch {
      /* ignore decode errors */
    }

    scheduleNextScan(scanFrame, 1000 / fps);
  }, [fps, scheduleNextScan]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    stop();                        // clean up any previous session
    activeRef.current = true;
    setErrorMessage(null);
    setStatus('requesting');

    try {
      // Build video constraints
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: 'user' };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      if (!activeRef.current) {
        // Component unmounted while we were waiting for permission
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Populate the camera dropdown (labels available after permission)
      void navigator.mediaDevices.enumerateDevices().then((devs) => {
        setCameras(devs.filter((d) => d.kind === 'videoinput'));
      });

      const video = videoRef.current;
      if (!video) throw new Error('Video element is not mounted in the DOM.');

      // Assign stream — MUST happen before play()
      video.muted      = true;
      video.playsInline = true;
      video.srcObject  = stream;

      // Wait for the video to have decoded its first frame
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { cleanup(); resolve(); };
        const onErr   = () => { cleanup(); reject(new Error('Video failed to load stream.')); };
        const cleanup = () => {
          video.removeEventListener('canplay',  onReady);
          video.removeEventListener('error',    onErr);
        };
        video.addEventListener('canplay',  onReady, { once: true });
        video.addEventListener('error',    onErr,   { once: true });
        // Fallback — if canplay never fires, resolve after 4 s
        setTimeout(() => { cleanup(); resolve(); }, 4000);
      });

      // Explicitly call play() (required in some browsers despite autoPlay attr)
      try { await video.play(); } catch { /* autoPlay may have already started it */ }

      if (!activeRef.current) return; // stopped while awaiting

      setStatus('streaming');
      // Begin QR scanning loop
      rafRef.current = requestAnimationFrame(scanFrame);

    } catch (err: unknown) {
      if (activeRef.current) {
        setErrorMessage(buildErrorMessage(err));
        setStatus('error');
      }
      stop();
    }
  }, [deviceId, scanFrame, stop]);

  // Cleanup on unmount
  useEffect(() => () => { stop(); }, [stop]);

  return { videoRef, status, errorMessage, cameras, start, stop };
}

function buildErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Could not start the camera.';
  const msg = err.message.toLowerCase();
  if (/notallowed|permission|denied/.test(msg))
    return 'Camera permission was blocked. In browser settings, allow camera access for this site and try again.';
  if (/notfound|devicesnotfound|no camera/.test(msg))
    return 'No camera was found. Please connect a webcam and try again.';
  if (/notreadable|in use|busy|occupied/.test(msg))
    return 'Camera is in use by another app (Acer QuickPanel, Zoom, Teams, etc.). Close that app and try again.';
  if (/overconstrained/.test(msg))
    return 'Selected camera does not support the required settings. Try a different camera.';
  if (/secure|https|insecure/.test(msg))
    return 'Camera requires HTTPS. Open the app via https://.';
  return err.message || 'Could not start the camera.';
}
