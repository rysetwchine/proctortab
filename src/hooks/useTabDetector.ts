import { useEffect, useRef } from "react";

interface Props {
  enabled: boolean;
  onTabSwitch: () => void;
  sharedLastViolationTimeRef?: React.MutableRefObject<number>;
}

export const useTabDetector = ({ enabled, onTabSwitch, sharedLastViolationTimeRef }: Props) => {
  const onTabSwitchRef = useRef(onTabSwitch);
  const lastDetectionTimeRef = useRef(0);
  const DETECTION_COOLDOWN_MS = 3000; // 3-second cooldown to prevent duplicate deductions

  useEffect(() => {
    onTabSwitchRef.current = onTabSwitch;
  }, [onTabSwitch]);

  useEffect(() => {
    if (!enabled) return;

    const handleEvent = () => {
      const now = Date.now();
      // Check both local and shared cooldowns to prevent overlapping detector penalties
      const lastLocalDetection = lastDetectionTimeRef.current;
      const lastSharedViolation = sharedLastViolationTimeRef?.current ?? 0;
      const lastTime = Math.max(lastLocalDetection, lastSharedViolation);

      // Only trigger if enough time has passed since last detection (local or shared)
      if (now - lastTime >= DETECTION_COOLDOWN_MS) {
        lastDetectionTimeRef.current = now;
        // Update shared violation time if provided
        if (sharedLastViolationTimeRef) {
          sharedLastViolationTimeRef.current = now;
        }
        onTabSwitchRef.current();
      }
    };

    const onBlur = () => handleEvent();

    const onVisibility = () => {
      if (document.hidden) handleEvent();
    };

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, sharedLastViolationTimeRef]);
};
