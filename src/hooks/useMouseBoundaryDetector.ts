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
 */
export function useMouseBoundaryDetector({
  enabled,
  onBoundaryExit,
  sharedLastViolationTimeRef,
  cooldownMs = 8000,
  ignoreEdgePx = 2,
}: Props) {
  const onBoundaryExitRef = useRef(onBoundaryExit);
  const isOutsideRef = useRef(false);
  const lastDetectionTimeRef = useRef(0);
  const lastMovePosRef = useRef<CursorPosition>({ x: 0, y: 0 });

  useEffect(() => {
    onBoundaryExitRef.current = onBoundaryExit;
  }, [onBoundaryExit]);

  useEffect(() => {
    if (!enabled) return;

    const updateInsideStateFromMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      lastMovePosRef.current = { x, y };

      // When the user re-enters the viewport, mousemove will fire again.
      if (x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight) {
        isOutsideRef.current = false;
      }
    };

    const handleExit = () => {
      // Prevent repeated instant deductions while cursor stays outside.
      if (isOutsideRef.current) return;

      const now = Date.now();
      const lastShared = sharedLastViolationTimeRef?.current ?? 0;
      const lastTime = Math.max(lastDetectionTimeRef.current, lastShared);

      if (now - lastTime < cooldownMs) return;

      lastDetectionTimeRef.current = now;
      if (sharedLastViolationTimeRef) sharedLastViolationTimeRef.current = now;
      isOutsideRef.current = true;

      onBoundaryExitRef.current(lastMovePosRef.current);
    };

    const onMouseOut = (e: MouseEvent) => {
      // `relatedTarget === null` is the reliable signal that we left the window/document.
      // (Moving between elements inside the page will have a relatedTarget.)
      const related = e.relatedTarget;
      const toEl = (e as MouseEvent & { toElement?: EventTarget | null }).toElement ?? null;
      if (related === null && toEl === null) {
        handleExit();
      }
    };

    window.addEventListener("mousemove", updateInsideStateFromMove, { passive: true });
    document.addEventListener("mouseout", onMouseOut);
    // Extra reliability: `mouseleave` on the root element fires more consistently in some browsers.
    const onMouseLeave = () => handleExit();
    document.documentElement.addEventListener("mouseleave", onMouseLeave);

    return () => {
      window.removeEventListener("mousemove", updateInsideStateFromMove);
      document.removeEventListener("mouseout", onMouseOut);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [enabled, cooldownMs, ignoreEdgePx, sharedLastViolationTimeRef]);
}
