import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

export type CursorPosition = { x: number; y: number };

interface Props {
  enabled: boolean;
  /** Called once per "exit" event, after edge-filter + cooldown pass. */
  onBoundaryExit: (cursor: CursorPosition) => void;
  /**
   * Shared cooldown reference to avoid stacking penalties from multiple detectors at once.
   * (e.g., tab switch + mouse exit occurring nearly simultaneously)
   */
  sharedLastViolationTimeRef?: MutableRefObject<number>;
  /** Cooldown before another deduction can happen again. Default 8000ms (within 5–10s). */
  cooldownMs?: number;
  /**
   * Ignore tiny accidental edge touches: if the last in-viewport mouse position was
   * within this many pixels of an edge, do not treat the immediate exit as a violation.
   */
  ignoreEdgePx?: number;
}

/**
 * Detects when the user's cursor exits the visible browser viewport/window.
 *
 * Implementation notes:
 * - Uses `mouseout` with `relatedTarget === null` to detect leaving the document/window.
 * - Tracks last in-viewport cursor position via `mousemove`.
 * - Ignores "micro edge touches" to reduce false positives.
 * - Prevents repeated deductions while the cursor remains outside.
 * - Applies a cooldown (5–10s requirement) before allowing another trigger.
 * - Throttles mousemove handler to reduce CPU load and system lag.
 */
export function useMouseBoundaryDetector({
  enabled,
  onBoundaryExit,
  sharedLastViolationTimeRef,
  cooldownMs = 8000,
  ignoreEdgePx = 15,
}: Props) {
  const onBoundaryExitRef = useRef(onBoundaryExit);
  const isOutsideRef = useRef(false);
  const lastDetectionTimeRef = useRef(0);
  const lastMovePosRef = useRef<CursorPosition>({ x: 0, y: 0 });
  const recentExitsRef = useRef<number[]>([]);
  const exitTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    onBoundaryExitRef.current = onBoundaryExit;
  }, [onBoundaryExit]);

  useEffect(() => {
    if (!enabled) return;

    const triggerViolation = () => {
      const now = Date.now();
      const lastShared = sharedLastViolationTimeRef?.current ?? 0;
      const lastTime = Math.max(lastDetectionTimeRef.current, lastShared);

      if (now - lastTime < cooldownMs) return;

      lastDetectionTimeRef.current = now;
      if (sharedLastViolationTimeRef) sharedLastViolationTimeRef.current = now;
      isOutsideRef.current = true;
      recentExitsRef.current = []; // Reset after triggering

      onBoundaryExitRef.current(lastMovePosRef.current);
    };

    const updateInsideStateFromMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      lastMovePosRef.current = { x, y };

      // When the user re-enters the viewport, clear any pending exit timeouts
      if (x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight) {
        isOutsideRef.current = false;
        if (exitTimeoutRef.current) {
          clearTimeout(exitTimeoutRef.current);
          exitTimeoutRef.current = null;
        }
      }
    };

    // Throttle mousemove handler to 50ms (20 updates/second max) to avoid CPU lag
    let lastUpdate = 0;
    const throttledMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastUpdate < 50) return;
      lastUpdate = now;
      updateInsideStateFromMove(e);
    };

    const handleExit = () => {
      // Prevent repeated instant deductions while cursor stays outside.
      if (isOutsideRef.current) return;

      const now = Date.now();
      const lastShared = sharedLastViolationTimeRef?.current ?? 0;
      const lastTime = Math.max(lastDetectionTimeRef.current, lastShared);

      if (now - lastTime < cooldownMs) return;

      // 1. Edge Calibration: Ignore if the last position was right next to the edge (e.g. scrollbars, tabs)
      const lastX = lastMovePosRef.current.x;
      const lastY = lastMovePosRef.current.y;
      const isNearEdge =
        lastX <= ignoreEdgePx ||
        lastX >= window.innerWidth - ignoreEdgePx ||
        lastY <= ignoreEdgePx ||
        lastY >= window.innerHeight - ignoreEdgePx;

      if (isNearEdge) {
        return; // Accidental touch during navigation, ignore
      }

      // 2. Pattern detection: Check for repeated exits in the last 30 seconds
      recentExitsRef.current = recentExitsRef.current.filter((t) => now - t < 30000);
      recentExitsRef.current.push(now);

      // If they exit repeatedly (3 or more times within 30s), trigger immediately
      if (recentExitsRef.current.length >= 3) {
        if (exitTimeoutRef.current) {
          clearTimeout(exitTimeoutRef.current);
          exitTimeoutRef.current = null;
        }
        triggerViolation();
        return;
      }

      // 3. Duration-based check: Schedule a violation only if they stay outside for >1.5s
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = window.setTimeout(() => {
        triggerViolation();
        exitTimeoutRef.current = null;
      }, 1500);
    };

    const onMouseOut = (e: MouseEvent) => {
      // `relatedTarget === null` is the reliable signal that we left the window/document.
      const related = e.relatedTarget;
      const toEl = (e as MouseEvent & { toElement?: EventTarget | null }).toElement ?? null;
      if (related === null && toEl === null) {
        // Record coordinates at the moment of exit to bypass throttling lag
        if (e.clientX !== undefined && e.clientY !== undefined) {
          lastMovePosRef.current = { x: e.clientX, y: e.clientY };
        }
        handleExit();
      }
    };

    window.addEventListener("mousemove", throttledMouseMove, { passive: true });
    document.addEventListener("mouseout", onMouseOut);
    const onMouseLeave = () => handleExit();
    document.documentElement.addEventListener("mouseleave", onMouseLeave);

    return () => {
      window.removeEventListener("mousemove", throttledMouseMove);
      document.removeEventListener("mouseout", onMouseOut);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
      }
    };
  }, [enabled, cooldownMs, ignoreEdgePx, sharedLastViolationTimeRef]);
}
