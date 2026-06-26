/**
 * useWebcamQrScanner
 * -------------------
 * A fully native webcam + QR scanner hook.
 * Uses getUserMedia() to stream the camera into a <video> ref,
 * then scans frames via canvas + jsQR (no html5-qrcode dependency).
 *
 * This avoids all the DOM-sizing / black-screen bugs of html5-qrcode.
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
  /** Attach this to the <video> element */
  videoRef: React.RefObject<HTMLVideoElement>;
  status: ScannerStatus;
  errorMessage: string | null;
  /** List of available camera devices (populated after first permission grant) */
  cameras: MediaDeviceInfo[];
  /** Start streaming & scanning */
  start: () => Promise<void>;
  /** Stop streaming & scanning */
  stop: () => void;
}

export function useWebcamQrScanner({
  onDecode,
  fps = 10,
  deviceId,
}: UseWebcamQrScannerOptions): UseWebcamQrScannerReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  /** Stop everything */
  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
  }, []);

  /** Scan one frame using canvas + jsQR */
  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Lazy-create the offscreen canvas once
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (result?.data) {
        onDecodeRef.current(result.data);
      }
    } catch {
      // ignore decode errors — just keep scanning
    }

    // Schedule next scan at the requested fps
    const delay = 1000 / fps;
    setTimeout(() => {
      rafRef.current = requestAnimationFrame(scanFrame);
    }, delay);
  }, [fps]);

  /** Start streaming from the camera */
  const start = useCallback(async () => {
    stop(); // clean up first
    setErrorMessage(null);
    setStatus('requesting');

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Populate camera list (labels are only available after permission)
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
      });

      const video = videoRef.current;
      if (!video) throw new Error('Video element not mounted.');

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await video.play();
      setStatus('streaming');

      // Start scanning frames
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (err: unknown) {
      const msg = buildErrorMessage(err);
      setErrorMessage(msg);
      setStatus('error');
      stop();
    }
  }, [deviceId, scanFrame, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { videoRef, status, errorMessage, cameras, start, stop };
}

function buildErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Could not start the camera.';
  const msg = err.message.toLowerCase();
  if (/notallowed|permission|denied/.test(msg))
    return 'Camera permission was blocked. Open browser settings and allow camera access for this site, then try again.';
  if (/notfound|devicesnotfound|no camera/.test(msg))
    return 'No camera was found. Please connect a webcam and try again.';
  if (/notreadable|in use|busy|occupied/.test(msg))
    return 'Camera is already in use by another app (e.g. Zoom, Teams, Windows Camera). Close it and try again.';
  if (/overconstrained/.test(msg))
    return 'Selected camera does not support the required resolution. Try a different camera.';
  if (/secure|https|insecure/.test(msg))
    return 'Camera requires HTTPS. Make sure you are opening the app via https://.';
  return err.message || 'Could not start the camera.';
}
