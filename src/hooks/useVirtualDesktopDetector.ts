import { useEffect, useRef } from 'react';

/**
 * Virtual Desktop / Multi-Desktop Detector
 *
 * Windows virtual desktops (Task View) and macOS Spaces both cause:
 *   1. document.hidden becomes true (visibilitychange)
 *   2. window loses focus (blur event)
 *
 * A regular tab switch also hides the document. However, when switching
 * virtual desktops, the window usually loses focus AND the visibility
 * changes within a very short window (< 200 ms apart), and often the
 * blur fires BEFORE the visibilitychange.
 *
 * We classify a detection as a "virtual desktop switch suspected" when:
 *  - Both blur and visibilitychange occur within 500 ms of each other
 *  - The page is hidden WHILE the window itself has no focus
 *
 * This is the closest achievable detection without native OS APIs.
 */
interface Props {
  enabled: boolean;
  onVirtualDesktopSuspected: (durationSeconds: number) => void;
  sharedLastViolationTimeRef?: React.MutableRefObject<number>;
}

export const useVirtualDesktopDetector = ({
  enabled,
  onVirtualDesktopSuspected,
  sharedLastViolationTimeRef,
}: Props) => {
  const callbackRef = useRef(onVirtualDesktopSuspected);
  const blurTimeRef = useRef<number | null>(null);
  const visibilityHideTimeRef = useRef<number | null>(null);
  const leaveTimeRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef(0);
  const DETECTION_COOLDOWN_MS = 5000;
  const SIMULTANEOUS_THRESHOLD_MS = 500; // blur + visibilitychange within 500ms = virtual desktop

  useEffect(() => {
    callbackRef.current = onVirtualDesktopSuspected;
  }, [onVirtualDesktopSuspected]);

  useEffect(() => {
    if (!enabled) return;

    const tryDetect = () => {
      const blurTime = blurTimeRef.current;
      const visTime = visibilityHideTimeRef.current;
      if (blurTime === null || visTime === null) return;

      // Both events occurred within threshold — likely virtual desktop switch
      const gap = Math.abs(blurTime - visTime);
      if (gap <= SIMULTANEOUS_THRESHOLD_MS) {
        const now = Date.now();
        const lastLocal = lastDetectionTimeRef.current;
        const lastShared = sharedLastViolationTimeRef?.current ?? 0;
        const lastTime = Math.max(lastLocal, lastShared);

        if (now - lastTime >= DETECTION_COOLDOWN_MS) {
          lastDetectionTimeRef.current = now;
          if (sharedLastViolationTimeRef) {
            sharedLastViolationTimeRef.current = now;
          }
          leaveTimeRef.current = Math.min(blurTime, visTime);
          // Will calculate duration on return
        }
      }

      // Reset
      blurTimeRef.current = null;
      visibilityHideTimeRef.current = null;
    };

    const onBlur = () => {
      blurTimeRef.current = Date.now();
      setTimeout(tryDetect, SIMULTANEOUS_THRESHOLD_MS + 50);
    };

    const onFocus = () => {
      // Page came back — calculate duration
      const leaveTime = leaveTimeRef.current;
      if (leaveTime !== null) {
        const durationMs = Date.now() - leaveTime;
        const durationSeconds = Math.ceil(durationMs / 1000);
        leaveTimeRef.current = null;
        callbackRef.current(durationSeconds);
      }
      blurTimeRef.current = null;
      visibilityHideTimeRef.current = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        visibilityHideTimeRef.current = Date.now();
        setTimeout(tryDetect, SIMULTANEOUS_THRESHOLD_MS + 50);
      } else {
        // Visible again — calculate duration if we were tracking
        const leaveTime = leaveTimeRef.current;
        if (leaveTime !== null) {
          const durationMs = Date.now() - leaveTime;
          const durationSeconds = Math.ceil(durationMs / 1000);
          leaveTimeRef.current = null;
          callbackRef.current(durationSeconds);
        }
        blurTimeRef.current = null;
        visibilityHideTimeRef.current = null;
      }
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, sharedLastViolationTimeRef]);
};
