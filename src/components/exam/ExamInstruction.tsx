import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { CourseAssessment } from '@/context/SessionContext';
import { useSettings } from '@/hooks/useSettings';
import { getExamDetectorRuntime } from '@/utils/examDetectorPolicy';

interface ExamInstructionsProps {
  onStart: () => void;
  examTitle?: string;
  assessment?: CourseAssessment;
}

export const ExamInstructions = ({ onStart, examTitle, assessment }: ExamInstructionsProps) => {
  const { settings } = useSettings();

  const runtime = useMemo(
    () => getExamDetectorRuntime(assessment, settings),
    [assessment, settings]
  );

  const detectedBehaviors = useMemo(() => {
    const items: string[] = [];

    // Tab switching categories (only if tab detector is enabled)
    if (runtime.tabEnabled) {
      items.push('Accidental Tab Switching');
      items.push('Suspicious Tab Switching');
      items.push('Intentional Tab Switching');
    }

    // Mouse detector is currently always enabled in ExamInterface
    items.push('Mouse Sensitivity Tracking');

    if (settings.screenshotProtection) items.push('Screenshot Prohibition');
    if (runtime.copyPasteEnabled) items.push('Copy and Paste Restrictions');
    if (runtime.fullscreenExitEnabled || runtime.wantFullscreen) items.push('Fullscreen Exit');

    return items;
  }, [
    runtime.tabEnabled,
    runtime.copyPasteEnabled,
    runtime.fullscreenExitEnabled,
    runtime.wantFullscreen,
    settings.screenshotProtection,
  ]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardContent className="p-8 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-accent" />
            <h3 className="text-2xl font-bold">
              Important Reminders Before Taking This Assessment
            </h3>
          </div>

          {examTitle ? (
            <p className="text-sm text-muted-foreground -mt-2">
              Assessment: <span className="font-medium text-foreground">{examTitle}</span>
            </p>
          ) : null}

          <div className="space-y-4 text-muted-foreground">
            <p className="text-base text-muted-foreground whitespace-pre-line">
              Please note that any suspicious behavior may be detected by the system and may flag students for cheating.
              Continuous violations may result in auto-submission of the assessment.
            </p>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Detected behaviors include:</p>
              <ul className="list-disc pl-5 space-y-1">
                {detectedBehaviors.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>

            {(runtime.fullscreenExitEnabled || runtime.wantFullscreen) && (
              <p className="text-sm text-muted-foreground">
                Note: If you exit Fullscreen mode, the system will automatically re-enable Fullscreen after 10 seconds to
                prevent further deductions.
              </p>
            )}
          </div>

          <div className="pt-6">
            <Button onClick={onStart} className="w-full bg-accent hover:bg-accent/90">
              Start Assessment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
