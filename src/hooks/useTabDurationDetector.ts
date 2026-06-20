import { useEffect, useRef } from 'react';
import type { TabSwitchStatus } from '@/types';

interface TabDurationEvent {
  durationSeconds: number;
  status: TabSwitchStatus;
}

interface Props {
  enabled: boolean;
  onTabSwitch: (event: TabDurationEvent) => void;
  sharedLastViolationTimeRef?: React.MutableRefObject<number>;
}

/**
 * Enhanced tab detector that tracks the duration of tab/window blur events
 * using the Page Visibility API and window blur/focus events.
 * 
 * Rules:
 * - ≤1 second: Warning
 * - >1 second to ≤3 seconds: Suspicious
 * - >3 seconds: Violation
 */
export const useTabDurationDetector = ({
  enabled,
  onTabSwitch,
  sharedLastViolationTimeRef,
}: Props) => {
  const onTabSwitchRef = useRef(onTabSwitch);
  const lastDetectionTimeRef = useRef(0);
  const tabLeaveTimeRef = useRef<number | null>(null);
  const pendingReturnRef = useRef(false);
  const DETECTION_COOLDOWN_MS = 3000; // 3-second cooldown to prevent duplicate deductions

  useEffect(() => {
    onTabSwitchRef.current = onTabSwitch;
  }, [onTabSwitch]);

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

    const handleTabLeave = () => {
      // Avoid overwriting if we already recorded a leave.
      if (tabLeaveTimeRef.current !== null) return;
      tabLeaveTimeRef.current = Date.now();
      pendingReturnRef.current = true;
    };

    const handleTabReturn = () => {
      // Prevent duplicate processing if no tab leave was recorded
      if (tabLeaveTimeRef.current === null || !pendingReturnRef.current) return;

      pendingReturnRef.current = false;

      const now = Date.now();
      const durationMs = now - tabLeaveTimeRef.current;
      // Use ceiling instead of round to avoid 0-second durations
      const durationSeconds = Math.ceil(durationMs / 1000);

      tabLeaveTimeRef.current = null;

      // Check cooldowns to prevent duplicate deductions
      const lastLocalDetection = lastDetectionTimeRef.current;
      const lastSharedViolation = sharedLastViolationTimeRef?.current ?? 0;
      const lastTime = Math.max(lastLocalDetection, lastSharedViolation);

      // Only trigger if enough time has passed since last detection
      if (now - lastTime >= DETECTION_COOLDOWN_MS) {
        lastDetectionTimeRef.current = now;

        // Update shared violation time if provided
        if (sharedLastViolationTimeRef) {
          sharedLastViolationTimeRef.current = now;
        }

        const status = getStatusForDuration(durationSeconds);
        onTabSwitchRef.current({
          durationSeconds,
          status,
        });
      }
    };

    // Using Page Visibility API as primary detector (more reliable)
    const onVisibilityChange = () => {
      if (document.hidden) {
        handleTabLeave();
      } else {
        handleTabReturn();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    // Fallback: some browsers/flows (e.g., Alt-Tab) may not always toggle `document.hidden` reliably.
    window.addEventListener('blur', handleTabLeave);
    window.addEventListener('focus', handleTabReturn);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', handleTabLeave);
      window.removeEventListener('focus', handleTabReturn);
    };
  }, [enabled, sharedLastViolationTimeRef]);
};
