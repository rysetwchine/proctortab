import { useEffect, useRef } from 'react';
import type { TabSwitchStatus } from '@/types';

interface TabDurationEvent {
  durationSeconds: number;
  status: TabSwitchStatus;
}

interface Props {
  enabled: boolean;
  onTabSwitch: (event: TabDurationEvent) => void;
  onTabLeave?: () => void;
  sharedLastViolationTimeRef?: React.MutableRefObject<number>;
}

/**
 * Enhanced tab detector that tracks the duration of tab/window blur events
 * using the Page Visibility API.
 * 
 * Rules:
 * - ≤1 second: Warning
 * - >1 second to ≤3 seconds: Suspicious
 * - >3 seconds: Violation
 */
export const useTabDurationDetector = ({
  enabled,
  onTabSwitch,
  onTabLeave,
  sharedLastViolationTimeRef,
}: Props) => {
  const onTabSwitchRef = useRef(onTabSwitch);
  const onTabLeaveRef = useRef(onTabLeave);
  const lastDetectionTimeRef = useRef(0);
  const tabLeaveTimeRef = useRef<number | null>(null);
  const pendingReturnRef = useRef(false);
  const DETECTION_COOLDOWN_MS = 3000; // 3-second cooldown to prevent duplicate deductions

  useEffect(() => {
    onTabSwitchRef.current = onTabSwitch;
    onTabLeaveRef.current = onTabLeave;
  }, [onTabSwitch, onTabLeave]);

  useEffect(() => {
    if (!enabled) return;

    /**
     * Calculate the duration of tab switch in seconds
     * and determine the status based on duration
     */
    const getStatusForDuration = (durationSeconds: number): TabSwitchStatus => {
      if (durationSeconds <= 1) {
        return 'Warning';
      } else if (durationSeconds <= 3) {
        return 'Suspicious';
      } else {
        return 'Violation';
      }
    };

    const handleLeave = () => {
      if (tabLeaveTimeRef.current !== null) return;
      tabLeaveTimeRef.current = Date.now();
      pendingReturnRef.current = true;
      onTabLeaveRef.current?.();
    };

    const handleReturn = () => {
      if (tabLeaveTimeRef.current === null || !pendingReturnRef.current) return;

      setTimeout(() => {
        if (document.hidden || !document.hasFocus()) return;

        pendingReturnRef.current = false;
        const now = Date.now();
        const durationMs = now - tabLeaveTimeRef.current;
        const durationSeconds = Math.ceil(durationMs / 1000);
        tabLeaveTimeRef.current = null;

        const lastLocalDetection = lastDetectionTimeRef.current;
        const lastSharedViolation = sharedLastViolationTimeRef?.current ?? 0;
        const lastTime = Math.max(lastLocalDetection, lastSharedViolation);

        if (now - lastTime >= DETECTION_COOLDOWN_MS) {
          lastDetectionTimeRef.current = now;
          if (sharedLastViolationTimeRef) {
            sharedLastViolationTimeRef.current = now;
          }
          const status = getStatusForDuration(durationSeconds);
          onTabSwitchRef.current({
            durationSeconds,
            status,
          });
        }
      }, 100);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        handleLeave();
      } else {
        handleReturn();
      }
    };

    const onWindowBlur = () => {
      handleLeave();
    };

    const onWindowFocus = () => {
      handleReturn();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [enabled, sharedLastViolationTimeRef]);
};
