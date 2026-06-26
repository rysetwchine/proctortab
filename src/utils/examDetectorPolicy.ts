import type { CourseAssessment } from '@/context/SessionContext';
import type { SecuritySettings } from '@/context/SettingsContext';

export type ExamDetectorRuntime = {
  tabEnabled: boolean;
  copyPasteEnabled: boolean;
  fullscreenExitEnabled: boolean;
  wantFullscreen: boolean;
  screenshotEnabled: boolean;
  alarmEnabled: boolean;
};

/**
 * Resolves per-exam detector behavior:
 * - useGlobalDetectors true (or legacy exam with no overrides): mirror global monitoring settings.
 * - useGlobalDetectors false: only toggled detectors apply; others stay off even if global is on.
 * - Legacy `activeExamDetectors` (without new fields) is treated as override mode.
 */
export function getExamDetectorRuntime(
  assessment: CourseAssessment | undefined,
  settings: SecuritySettings
): ExamDetectorRuntime {
  const legacy = assessment?.activeExamDetectors;
  const detectors = assessment?.detectors ?? {
    tabSwitch: false,
    copyPaste: false,
    fullscreen: false,
    screenshot: false,
    alarm: false,
  };

  let useGlobal = assessment?.useGlobalDetectors;
  if (useGlobal === undefined) {
    if (legacy) useGlobal = false;
    else useGlobal = true;
  }

  if (useGlobal) {
    return {
      tabEnabled: settings.tabDetector,
      copyPasteEnabled: settings.copyPasteProtection,
      fullscreenExitEnabled: settings.fullScreenMode,
      wantFullscreen: settings.fullScreenMode,
      screenshotEnabled: settings.screenshotProtection,
      alarmEnabled: settings.alarmDevice,
    };
  }

  const tab = legacy ? legacy.tabSwitch : detectors.tabSwitch;
  const copy = legacy ? legacy.copyPaste : detectors.copyPaste;
  const fs = legacy ? legacy.fullscreenExit : detectors.fullscreen;
  const screenshot = detectors.screenshot ?? false;
  const alarm = detectors.alarm ?? false;

  return {
    tabEnabled: Boolean(tab),
    copyPasteEnabled: Boolean(copy),
    fullscreenExitEnabled: Boolean(fs),
    wantFullscreen: Boolean(fs),
    screenshotEnabled: Boolean(screenshot),
    alarmEnabled: Boolean(alarm),
  };
}

/** Returns false if due date is set and is in the past (submission window closed). */
export function isExamWithinDueWindow(assessment: CourseAssessment): boolean {
  const raw = assessment.dueDate?.trim();
  if (!raw) return true;
  const due = new Date(raw).getTime();
  if (Number.isNaN(due)) return true;
  return Date.now() <= due;
}
