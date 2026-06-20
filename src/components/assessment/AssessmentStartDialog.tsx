import { useState } from 'react';
import { Lock, Clock, HelpCircle, RotateCcw, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { CourseAssessment } from '@/context/SessionContext';
import { canStartAttempt } from '@/utils/examSession';

interface AssessmentStartDialogProps {
  open: boolean;
  assessment: CourseAssessment | null;
  courseId: string;
  studentId: string;
  /** Student must be on the course roster (professors previewing pass true). */
  isEnrolledInCourse: boolean;
  /** False when due date has passed. */
  isWithinDueWindow: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (assessment: CourseAssessment) => void;
}

export function AssessmentStartDialog({
  open,
  assessment,
  courseId,
  studentId,
  isEnrolledInCourse,
  isWithinDueWindow,
  onOpenChange,
  onStart,
}: AssessmentStartDialogProps) {
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  if (!assessment) return null;

  const attemptInfo = canStartAttempt(assessment, courseId, studentId);
  const requiresPassword = Boolean(assessment.password?.trim());
  const questionCount = assessment.questionItems?.length ?? assessment.questions ?? 0;

  const policyBlocked = !isEnrolledInCourse || !isWithinDueWindow;
  const canClickStart = attemptInfo.allowed && !policyBlocked;

  const handleStart = () => {
    if (!attemptInfo.allowed || policyBlocked) return;

    if (requiresPassword) {
      if (passwordInput.trim() !== assessment.password?.trim()) {
        setPasswordError('Incorrect password. Please try again.');
        return;
      }
    }

    setPasswordInput('');
    setPasswordError(null);
    onStart(assessment);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPasswordInput('');
      setPasswordError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{assessment.title}</DialogTitle>
          <DialogDescription className="capitalize">
            {(assessment.assessmentType || 'exam') === 'quiz' ? 'Quiz' : 'Assessment'} · Max{' '}
            {assessment.maxScore ?? 100} pts · Pass {assessment.passingScore ?? 60}%
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {!isEnrolledInCourse ? (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">You are not enrolled in this course.</p>
            </div>
          ) : null}

          {isEnrolledInCourse && !isWithinDueWindow ? (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">This assessment is past its due date and is closed.</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3.5 w-3.5" />
              {assessment.duration} min
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <HelpCircle className="h-3.5 w-3.5" />
              {questionCount} questions
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" />
              {attemptInfo.used}/{attemptInfo.max} attempts
            </Badge>
            {requiresPassword ? (
              <Badge variant="outline" className="gap-1">
                <Lock className="h-3.5 w-3.5" />
                Password required
              </Badge>
            ) : null}
          </div>

          {assessment.dueDate ? (
            <p className="text-muted-foreground">
              Due: {new Date(assessment.dueDate).toLocaleString()}
            </p>
          ) : null}

          {!attemptInfo.allowed ? (
            <p className="text-destructive font-medium">You have used all allowed attempts for this assessment.</p>
          ) : null}

          {requiresPassword && attemptInfo.allowed && !policyBlocked ? (
            <div className="space-y-2">
              <Label htmlFor="start-password">Assessment code</Label>
              <Input
                id="start-password"
                type="password"
                placeholder="Enter code from your professor"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError(null);
                }}
                autoComplete="off"
              />
              {passwordError ? <p className="text-xs text-destructive">{passwordError}</p> : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleStart} disabled={!canClickStart}>
            Start assessment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
