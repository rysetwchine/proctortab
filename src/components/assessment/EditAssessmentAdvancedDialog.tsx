import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { CourseAssessment, ExamDetectorsFirestore } from '@/context/SessionContext';

type SavePatch = {
  useGlobalDetectors: boolean;
  detectors: ExamDetectorsFirestore;
  allowQuestionNavigation: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessment: CourseAssessment | null;
  onSave: (patch: SavePatch) => void;
};

function readOverrides(assessment: CourseAssessment): {
  copy: boolean;
  tab: boolean;
  fullscreen: boolean;
  screenshot: boolean;
  alarm: boolean;
  allowNav: boolean;
} {
  const legacy = assessment.activeExamDetectors;
  if (legacy && assessment.useGlobalDetectors === undefined && !assessment.detectors) {
    return {
      copy: legacy.copyPaste,
      tab: legacy.tabSwitch,
      fullscreen: legacy.fullscreenExit,
      screenshot: false,
      alarm: false,
      allowNav: assessment.allowQuestionNavigation !== false,
    };
  }
  const d = assessment.detectors ?? {
    tabSwitch: false,
    copyPaste: false,
    fullscreen: false,
    screenshot: false,
    alarm: false,
  };
  return {
    copy: d.copyPaste,
    tab: d.tabSwitch,
    fullscreen: d.fullscreen,
    screenshot: d.screenshot,
    alarm: d.alarm,
    allowNav: assessment.allowQuestionNavigation !== false,
  };
}

export function EditAssessmentAdvancedDialog({ open, onOpenChange, assessment, onSave }: Props) {
  const [overrideCopy, setOverrideCopy] = useState(false);
  const [overrideTab, setOverrideTab] = useState(false);
  const [overrideFullscreen, setOverrideFullscreen] = useState(false);
  const [overrideScreenshot, setOverrideScreenshot] = useState(false);
  const [overrideAlarm, setOverrideAlarm] = useState(false);
  const [allowNav, setAllowNav] = useState(true);

  useEffect(() => {
    if (!open || !assessment) return;
    const o = readOverrides(assessment);
    setOverrideCopy(o.copy);
    setOverrideTab(o.tab);
    setOverrideFullscreen(o.fullscreen);
    setOverrideScreenshot(o.screenshot);
    setOverrideAlarm(o.alarm);
    setAllowNav(o.allowNav);
  }, [open, assessment]);

  if (!assessment) return null;

  const useGlobalDetectors =
    !overrideCopy && !overrideTab && !overrideFullscreen && !overrideScreenshot && !overrideAlarm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Advanced assessment settings</DialogTitle>
          <DialogDescription>{assessment.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <p className="text-sm font-semibold">Detector overrides</p>
            <p className="text-xs text-muted-foreground">
              All off: this assessment uses <strong>global</strong> monitoring. Turn on only the detectors this
              assessment should enforce.
            </p>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ed-copy" className="font-normal">
                Copy / paste protection
              </Label>
              <Switch id="ed-copy" checked={overrideCopy} onCheckedChange={setOverrideCopy} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ed-tab" className="font-normal">
                Tab switch detection
              </Label>
              <Switch id="ed-tab" checked={overrideTab} onCheckedChange={setOverrideTab} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ed-fs" className="font-normal">
                Fullscreen exit detection
              </Label>
              <Switch id="ed-fs" checked={overrideFullscreen} onCheckedChange={setOverrideFullscreen} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ed-screenshot" className="font-normal">
                Screenshot protection
              </Label>
              <Switch id="ed-screenshot" checked={overrideScreenshot} onCheckedChange={setOverrideScreenshot} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ed-alarm" className="font-normal">
                Alarm device
              </Label>
              <Switch id="ed-alarm" checked={overrideAlarm} onCheckedChange={setOverrideAlarm} />
            </div>
            <p className="text-xs text-muted-foreground rounded-md bg-background/60 p-2 border">
              Mode:{' '}
              <span className="font-medium">
                {useGlobalDetectors ? 'Use global detector settings' : 'Custom — only enabled switches apply'}
              </span>
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="ed-nav" className="font-normal">
                Allow previous / next questions
              </Label>
              <p className="text-xs text-muted-foreground">Off = linear assessment (no backtracking)</p>
            </div>
            <Switch id="ed-nav" checked={allowNav} onCheckedChange={setAllowNav} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave({
                useGlobalDetectors,
                detectors: {
                  tabSwitch: overrideTab,
                  copyPaste: overrideCopy,
                  fullscreen: overrideFullscreen,
                  screenshot: overrideScreenshot,
                  alarm: overrideAlarm,
                },
                allowQuestionNavigation: allowNav,
              });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
