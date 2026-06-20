import { Html5Qrcode, type CameraDevice } from 'html5-qrcode';

export type CameraStartConfig = {
  fps?: number;
  qrbox?: number;
  preferRearCamera?: boolean;
};

export type CameraSupportInfo = {
  supported: boolean;
  secureContext: boolean;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  message: string | null;
};

function isRearLabel(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes('back') ||
    l.includes('rear') ||
    l.includes('environment') ||
    l.includes('world')
  );
}

function isFrontLabel(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes('front') || l.includes('user') || l.includes('facetime');
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function getCameraSupportInfo(): CameraSupportInfo {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      secureContext: false,
      hasMediaDevices: false,
      hasGetUserMedia: false,
      message: 'Camera is only available in the browser.',
    };
  }

  const secureContext = window.isSecureContext;
  const hasMediaDevices = Boolean(navigator.mediaDevices);
  const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);

  if (!hasMediaDevices || !hasGetUserMedia) {
    return {
      supported: false,
      secureContext,
      hasMediaDevices,
      hasGetUserMedia,
      message:
        'Camera is not supported in this browser. Use Chrome or Safari on your phone, and open the scanner with https:// (not http://).',
    };
  }

  if (!secureContext) {
    return {
      supported: false,
      secureContext,
      hasMediaDevices,
      hasGetUserMedia,
      message:
        'Camera requires a secure HTTPS connection. Use a production HTTPS URL, or test on localhost where the browser allows camera access.',
    };
  }

  return {
    supported: true,
    secureContext,
    hasMediaDevices,
    hasGetUserMedia,
    message: null,
  };
}

export function assertCameraSupported(): void {
  const info = getCameraSupportInfo();
  if (!info.supported) {
    throw new Error(info.message ?? 'Camera is not available.');
  }
}

/** Prefer rear camera on phones; otherwise first usable webcam (desktop). */
export function orderCamerasForScanning(cameras: CameraDevice[]): CameraDevice[] {
  if (cameras.length <= 1) return cameras;

  const rear = cameras.filter((c) => isRearLabel(c.label));
  const front = cameras.filter((c) => isFrontLabel(c.label));
  const other = cameras.filter((c) => !rear.includes(c) && !front.includes(c));

  return [...rear, ...other, ...front];
}

export async function waitForScannerMount(
  elementId: string,
  maxAttempts = 40
): Promise<HTMLElement> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const el = document.getElementById(elementId);
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
      return el;
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  throw new Error('Camera preview area is not ready. Close the dialog and try again.');
}

async function getUserMediaWithFallback(
  constraintsList: MediaStreamConstraints[]
): Promise<MediaStream> {
  assertCameraSupported();

  let lastError: unknown;
  for (const constraints of constraintsList) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('Could not access the camera.');
}

/** Prompts for permission so device labels/IDs are available (mobile + desktop). */
export async function requestCameraPermission(preferRear = isMobileDevice()): Promise<void> {
  const constraints: MediaStreamConstraints[] = preferRear
    ? [
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        { video: { facingMode: 'user' }, audio: false },
        { video: true, audio: false },
      ]
    : [
        { video: { facingMode: 'user' }, audio: false },
        { video: true, audio: false },
      ];

  const stream = await getUserMediaWithFallback(constraints);
  stream.getTracks().forEach((track) => track.stop());
}

async function tryGetCameras(): Promise<CameraDevice[]> {
  try {
    const cameras = await Html5Qrcode.getCameras();
    return cameras ?? [];
  } catch {
    return [];
  }
}

export async function listAvailableCameras(): Promise<CameraDevice[]> {
  let cameras = await tryGetCameras();
  if (cameras.length > 0) return cameras;

  await requestCameraPermission();
  cameras = await tryGetCameras();
  return cameras;
}

export function formatCameraError(err: unknown): string {
  const info = getCameraSupportInfo();
  if (!info.supported && info.message) return info.message;

  if (err instanceof Error) {
    const msg = err.message.trim();
    if (/notallowed|permission|denied/i.test(msg)) {
      return 'Camera permission was blocked. In browser settings, allow camera for this site, then tap Start camera again.';
    }
    if (/notfound|devicesnotfound|no camera/i.test(msg)) {
      return 'No camera was found on this device.';
    }
    if (/notreadable|in use|busy|occupied/i.test(msg)) {
      return 'Camera is in use by another app. Close it and try again.';
    }
    if (/secure|https|insecure/i.test(msg)) {
      return 'Camera requires HTTPS. Open the scanner link starting with https:// and accept the certificate warning if prompted.';
    }
    if (/not supported/i.test(msg)) {
      return 'Camera is not supported in this browser. Use Chrome or Safari over HTTPS.';
    }
    if (msg) return msg;
  }
  return 'Could not start the camera. Tap Start camera to try again.';
}

export async function startHtml5QrcodeCamera(
  scanner: Html5Qrcode,
  onDecode: (text: string) => void,
  config: CameraStartConfig = {}
): Promise<{ deviceId: string; label: string }> {
  assertCameraSupported();

  const fps = config.fps ?? 10;
  const qrbox = config.qrbox ?? 250;
  const preferRear = config.preferRearCamera ?? isMobileDevice();

  const cameras = orderCamerasForScanning(await listAvailableCameras());
  const attempts: Array<string | { facingMode: string }> = [
    ...cameras.map((c) => c.id),
    ...(preferRear
      ? [{ facingMode: 'environment' }, { facingMode: 'user' }]
      : [{ facingMode: 'user' }, { facingMode: 'environment' }]),
  ];

  let lastError: unknown;

  for (const cameraIdOrConfig of attempts) {
    try {
      await scanner.start(
        cameraIdOrConfig,
        {
          fps,
          qrbox: { width: qrbox, height: qrbox },
          aspectRatio: 1,
        },
        onDecode,
        () => undefined
      );

      const label =
        typeof cameraIdOrConfig === 'string'
          ? cameras.find((c) => c.id === cameraIdOrConfig)?.label ?? 'Camera'
          : typeof cameraIdOrConfig === 'object' && cameraIdOrConfig.facingMode === 'environment'
            ? 'Rear camera'
            : 'Camera';

      return {
        deviceId: typeof cameraIdOrConfig === 'string' ? cameraIdOrConfig : cameraIdOrConfig.facingMode,
        label,
      };
    } catch (err) {
      lastError = err;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch {
        /* ignore */
      }
    }
  }

  throw lastError ?? new Error('No camera could be started');
}
