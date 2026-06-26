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
import { Input } from '@/components/ui/input';
import type { CourseAssessment, ExamDetectorsFirestore } from '@/context/SessionContext';

type SavePatch = {
  useGlobalDetectors: boolean;
  detectors: ExamDetectorsFirestore;
  allowQuestionNavigation: boolean;
  title?: string;
  duration?: number;
  dueDate?: string;
  maxAttempts?: number;
  password?: string;
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

  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('30');
  const [dueDate, setDueDate] = useState('');
  const [maxAttempts, setMaxAttempts] = useState('1');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!open || !assessment) return;
    const o = readOverrides(assessment);
    setOverrideCopy(o.copy);
    setOverrideTab(o.tab);
    setOverrideFullscreen(o.fullscreen);
    setOverrideScreenshot(o.screenshot);
    setOverrideAlarm(o.alarm);
    setAllowNav(o.allowNav);

    setTitle(assessment.title ?? '');
    setDuration(String(assessment.duration ?? 30));
    setDueDate(assessment.dueDate ?? '');
    setMaxAttempts(String(assessment.maxAttempts ?? 1));
    setPassword(assessment.password ?? '');
  }, [open, assessment]);

  if (!assessment) return null;

  const useGlobalDetectors =
    !overrideCopy && !overrideTab && !overrideFullscreen && !overrideScreenshot && !overrideAlarm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#070420] border-slate-800 text-slate-100 max-h-[90vh] overflow-y-auto shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">Reopen & Edit Assessment Settings</DialogTitle>
          <DialogDescription className="text-slate-400">Modify the settings and policies for this assessment.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* General Settings Card */}
          <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-400">General Information</p>
            
            <div className="space-y-1.5">
              <Label htmlFor="ed-title" className="text-xs text-slate-300">Assessment Title</Label>
              <Input
                id="ed-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Capstone Exam"
                className="bg-[#0b0e27] border-slate-800 text-slate-200 h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ed-duration" className="text-xs text-slate-300">Duration (Minutes)</Label>
                <Input
                  id="ed-duration"
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="bg-[#0b0e27] border-slate-800 text-slate-200 h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-attempts" className="text-xs text-slate-300">Max Attempts</Label>
                <Input
                  id="ed-attempts"
                  type="number"
                  min="1"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(e.target.value)}
                  className="bg-[#0b0e27] border-slate-800 text-slate-200 h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ed-duedate" className="text-xs text-slate-300">Due Date</Label>
                <Input
                  id="ed-duedate"
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="bg-[#0b0e27] border-slate-800 text-slate-200 h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-password" className="text-xs text-slate-300">Password (Optional)</Label>
                <Input
                  id="ed-password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="None"
                  className="bg-[#0b0e27] border-slate-800 text-slate-200 h-10 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Detector settings */}
          <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-400">Proctoring Detector Overrides</p>
            <p className="text-[11px] text-slate-400 leading-normal">
              All toggles off: this assessment uses <strong>global</strong> default policies. Enable toggles to enforce custom rules.
            </p>
            
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                <Label htmlFor="ed-copy" className="text-xs text-slate-300 font-normal">Copy / paste protection</Label>
                <Switch id="ed-copy" checked={overrideCopy} onCheckedChange={setOverrideCopy} />
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                <Label htmlFor="ed-tab" className="text-xs text-slate-300 font-normal">Tab switch detection</Label>
                <Switch id="ed-tab" checked={overrideTab} onCheckedChange={setOverrideTab} />
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                <Label htmlFor="ed-fs" className="text-xs text-slate-300 font-normal">Fullscreen exit detection</Label>
                <Switch id="ed-fs" checked={overrideFullscreen} onCheckedChange={setOverrideFullscreen} />
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                <Label htmlFor="ed-screenshot" className="text-xs text-slate-300 font-normal">Screenshot protection</Label>
                <Switch id="ed-screenshot" checked={overrideScreenshot} onCheckedChange={setOverrideScreenshot} />
              </div>
              <div className="flex items-center justify-between py-1.5">
                <Label htmlFor="ed-alarm" className="text-xs text-slate-300 font-normal">Hardware alarm device trigger</Label>
                <Switch id="ed-alarm" checked={overrideAlarm} onCheckedChange={setOverrideAlarm} />
              </div>
            </div>
            
            <div className="text-[11px] text-slate-500 bg-[#0b0e27]/85 p-2 rounded-lg border border-white/[0.04] mt-2">
              Status: <span className="font-semibold text-indigo-300">{useGlobalDetectors ? 'Inheriting Global Policy' : 'Custom Policy Enabled'}</span>
            </div>
          </div>

          {/* Question navigation */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-slate-950/40 p-4">
            <div className="space-y-0.5">
              <Label htmlFor="ed-nav" className="text-xs font-semibold text-slate-200">Allow Question Navigation</Label>
              <p className="text-[11px] text-slate-400">Off = linear navigation only (no backtracking allowed)</p>
            </div>
            <Switch id="ed-nav" checked={allowNav} onCheckedChange={setAllowNav} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-white/[0.06]">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl"
          >
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
                title: title.trim(),
                duration: parseInt(duration, 10) || 30,
                dueDate,
                maxAttempts: parseInt(maxAttempts, 10) || 1,
                password: password.trim() || undefined,
              });
              onOpenChange(false);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
