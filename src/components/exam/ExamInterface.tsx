import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QuestionCard } from './QuestionCard';
import { WarningModal } from './WarningModal';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { useExamTimer } from '@/hooks/UseExamTimer';
import { useTabDurationDetector } from '@/hooks/useTabDurationDetector';
import { useMouseBoundaryDetector } from '@/hooks/useMouseBoundaryDetector';
import { useSettings } from '@/hooks/useSettings';
import { useNetworkCompensation } from '@/hooks/useNetworkCompensation';
import type { CourseAssessment } from '@/context/SessionContext';
import { getExamDetectorRuntime } from '@/utils/examDetectorPolicy';
import { prepareExamQuestions } from '@/utils/examSession';
import { examQuestions } from '@/data/questions';
import { logTabSwitch } from '@/utils/logTabSwitch';
import { logMouseBoundaryExit } from '@/utils/logMouseBoundaryExit';
import type { Question } from '@/types';
import { Clock, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

export type ExamFinishPayload = {
  answers: Record<number, string>;
  sessionQuestions: Question[];
};

interface ExamInterfaceProps {
  onFinish: (payload: ExamFinishPayload) => void;
  assessment?: CourseAssessment;
  /** When set, tab_logs include course + exam so reports can attribute violations. */
  examContext?: {
    courseTitle?: string;
    examTitle?: string;
    assessmentId?: string;
  };
}

export const ExamInterface = ({ onFinish, examContext, assessment }: ExamInterfaceProps) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showWarning, setShowWarning] = useState(false);
  const [warningTitle, setWarningTitle] = useState('WARNING MESSAGE');
  const [warningMessage, setWarningMessage] = useState('');
  const [isAutoSubmitted, setIsAutoSubmitted] = useState(false);
  const [isExamDisabled, setIsExamDisabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const { settings } = useSettings();
  const answersRef = useRef(answers);
  const sessionQuestionsRef = useRef<Question[]>([]);
  const lastViolationTimeRef = useRef(0); // Shared cooldown for all violation types
  const fullscreenReenableTimerRef = useRef<number | null>(null);

  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const userProfile = JSON.parse(localStorage.getItem('userProfile') || 'null');
  const studentId = user?.id || userProfile?.studentId || 'unknown-student';
  const studentName = user?.name || 'Unknown Student';

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const sessionSeedRef = useRef(`${assessment?.id ?? 'legacy'}-${Math.random().toString(36).slice(2)}`);
  const sessionQuestions = useMemo(() => {
    if (!assessment) return examQuestions;
    return prepareExamQuestions(assessment, sessionSeedRef.current);
  }, [assessment]);

  useEffect(() => {
    sessionQuestionsRef.current = sessionQuestions;
  }, [sessionQuestions]);

  const { tabEnabled, copyPasteEnabled, fullscreenExitEnabled, wantFullscreen } = useMemo(
    () => getExamDetectorRuntime(assessment, settings),
    [assessment, settings]
  );

  const allowBack = assessment?.allowQuestionNavigation !== false;

  const isQuiz = (assessment?.assessmentType || 'exam') === 'quiz';

  const timerSeconds = Math.max((assessment?.duration ?? 30) * 60, 60);

  const handleExpire = useCallback(() => {
    onFinish({
      answers: answersRef.current,
      sessionQuestions: sessionQuestionsRef.current,
    });
  }, [onFinish]);

  const { formatTime, start, deduct, compensate } = useExamTimer(timerSeconds, handleExpire);

  /**
   * Robust warning opener:
   * If a warning is already open, toggle it off then on so the modal reliably re-appears.
   */
  const openWarning = useCallback((title: string, message: string) => {
    setWarningTitle(title);
    setWarningMessage(message);
    setShowWarning((prev) => {
      if (!prev) return true;
      // Force a re-open on next tick
      window.setTimeout(() => setShowWarning(true), 0);
      return false;
    });
  }, []);

  const {
    isOnline,
    showCompensationMessage,
    compensationSeconds,
    dismissCompensationMessage,
  } = useNetworkCompensation({
    onCompensate: compensate,
    examContext,
  });

  useEffect(() => {
    start();
  }, [start]);

  const logPayload = useCallback(
    (extra: Record<string, unknown>) => ({
      studentName: user?.name || 'Unknown Student',
      ...extra,
      ...(examContext?.courseTitle ? { course: examContext.courseTitle } : {}),
      ...(examContext?.examTitle ? { examTitle: examContext.examTitle } : {}),
      ...(examContext?.assessmentId ? { assessmentId: examContext.assessmentId } : {}),
      timestamp: serverTimestamp(),
    }),
    [user?.name, examContext?.courseTitle, examContext?.examTitle, examContext?.assessmentId]
  );

  /**
   * Handle tab switch with duration-based classification
   * Rules:
   * - ≤1 second: Warning (deduct 10 minutes)
   * - >1-3 seconds: Suspicious (deduct 15 minutes)
   * - >3 seconds: Violation (auto-submit)
   */
  const handleTabDurationSwitch = useCallback(
    (event: { durationSeconds: number; status: 'Warning' | 'Suspicious' | 'Violation' }) => {
      const { durationSeconds, status } = event;
      // QUIZ RULE:
      // Auto-submit when away for 3 seconds (or more).
      // The duration detector classifies 3 seconds as "Suspicious" (<=3),
      // so we override here for quizzes only.
      const effectiveStatus: 'Warning' | 'Suspicious' | 'Violation' =
        isQuiz && durationSeconds >= 3 ? 'Violation' : status;

      // Warning labels requested by user (based on duration thresholds):
      // 0–1s -> Accidental, 1–2s -> Suspicious, 3+ -> Intentional
      const tabSwitchTitle =
        durationSeconds <= 1
          ? 'Accidental Tab Switching'
          : durationSeconds < 3
            ? 'Suspicious Tab Switching'
            : 'Intentional Tab Switching';

      // Log the tab switch to Firestore (fire and forget to avoid blocking)
      logTabSwitch({
        studentId,
        studentName,
        course: examContext?.courseTitle || '',
        assessmentId: examContext?.assessmentId || assessment?.id || 'unknown',
        assessmentTitle: examContext?.examTitle || assessment?.title || 'Unknown Assessment',
        durationSeconds,
        status: effectiveStatus,
        autoSubmitted: effectiveStatus === 'Violation',
      });

      if (effectiveStatus === 'Violation') {
        // Auto-submit the assessment immediately
        setIsAutoSubmitted(true);
        setIsExamDisabled(true);
        openWarning(
          tabSwitchTitle,
          isQuiz
            ? 'You were away from the quiz window for 3 seconds or more.\nYour quiz has been automatically submitted.\nYour answers have been recorded.'
            : 'You were away from the assessment window for more than 3 seconds.\nYour assessment has been automatically submitted.\nYour answers have been recorded.'
        );

        // Automatically submit after showing the warning (2 second delay for UX)
        setTimeout(() => {
          onFinish({
            answers: answersRef.current,
            sessionQuestions: sessionQuestionsRef.current,
          });
        }, 2000);
      } else if (effectiveStatus === 'Suspicious') {
        const penaltySeconds = isQuiz ? 300 : 900; // Quiz: 5 min, Exam: 15 min
        openWarning(
          tabSwitchTitle,
          `You've been detected away from the ${isQuiz ? 'quiz' : 'assessment'} window for ${durationSeconds} seconds.\n${isQuiz ? '5 minutes' : '15 minutes'} deducted from your time.`
        );
        deduct(penaltySeconds);
      } else {
        // Warning (≤1 second)
        const penaltySeconds = isQuiz ? 300 : 600; // Quiz: 5 min, Exam: 10 min
        openWarning(
          tabSwitchTitle,
          `You briefly switched away from the ${isQuiz ? 'quiz' : 'assessment'} window for ${durationSeconds} second(s).\n${isQuiz ? '5 minutes' : '10 minutes'} deducted from your time.`
        );
        deduct(penaltySeconds);
      }
    },
    [studentId, studentName, examContext?.assessmentId, examContext?.examTitle, assessment?.id, assessment?.title, deduct, onFinish, isQuiz, openWarning]
  );

  // Duration-based tab detector:
  // - Measures how long the student is away (seconds)
  // - Logs `durationSeconds` to Firestore for professor dashboard threshold view
  // - Applies the warning/suspicious/violation behavior in `handleTabDurationSwitch`
  useTabDurationDetector({
    enabled: tabEnabled,
    onTabSwitch: handleTabDurationSwitch,
    sharedLastViolationTimeRef: lastViolationTimeRef,
  });

  // Mouse boundary exit detector: instant time deduction + toast + Firestore log
  useMouseBoundaryDetector({
    enabled: true, // Always ON for exams & quizzes (no instructor toggle)
    sharedLastViolationTimeRef: lastViolationTimeRef,
    onBoundaryExit: (pos) => {
      const deductedMinutes = isQuiz ? 5 : 10;
      deduct(deductedMinutes * 60);

      // Use the same warning modal style as tab switch warnings
      openWarning(
        'Mouse Sensitivity',
        isQuiz
          ? 'Mouse cursor left the quiz page.\n5 minutes deducted.'
          : 'Mouse cursor left the assessment page.\n10 minutes deducted.'
      );

      void logMouseBoundaryExit({
        userId: studentId,
        studentName,
        assessmentType: isQuiz ? "quiz" : "exam",
        ...(isQuiz
          ? { quizId: examContext?.assessmentId || assessment?.id || "unknown" }
          : { examId: examContext?.assessmentId || assessment?.id || "unknown" }),
        assessmentTitle: examContext?.examTitle || assessment?.title || "Unknown Assessment",
        deductedMinutes,
        cursorPosition: pos,
      });
    },
  });

  useEffect(() => {
    if (!copyPasteEnabled) return;

    const handleCopy = (e: ClipboardEvent) => e.preventDefault();
    const handlePaste = (e: ClipboardEvent) => e.preventDefault();
    const handleCut = (e: ClipboardEvent) => e.preventDefault();

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };

    const disableSelect = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('selectstart', disableSelect);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('selectstart', disableSelect);
    };
  }, [copyPasteEnabled]);

  useEffect(() => {
    const triggerWarning = (message: string, type: string) => {
      openWarning('WARNING MESSAGE', message);
      deduct(300); // 5 minutes = 300 seconds

      void addDoc(collection(db, 'tab_logs'), logPayload({ violation: type }));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      // Support both Ctrl+Shift+S and Win/Meta+Shift+S (common snipping shortcut).
      const isSnipping =
        (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's';

      if (isPrintScreen) {
        e.preventDefault();

        triggerWarning(
          "\nYou've been detected taking a screenshot.\n5 minutes deducted from your time.\n\nI Understand",
          'PrintScreen'
        );
      }

      if (isSnipping) {
        e.preventDefault();

        triggerWarning(
          "\nYou've been detected taking a screenshot.\n5 minutes deducted from your time.\n\nI Understand",
          'Snipping Tool'
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [settings.screenshotProtection, deduct, logPayload, openWarning]);

  useEffect(() => {
    if (!wantFullscreen) return;

    document.documentElement.requestFullscreen().catch(() => {});

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        // Shared cooldown: prevent duplicate deductions for overlapping violations
        const now = Date.now();
        if (now - lastViolationTimeRef.current >= 3000) {
          lastViolationTimeRef.current = now;

          if (fullscreenExitEnabled) {
            void addDoc(
              collection(db, 'tab_logs'),
              logPayload({ violation: 'Fullscreen Exit Detected' })
            );
            deduct(isQuiz ? 300 : 600); // Quiz: 5 min, Exam: 10 min
            openWarning(
              'Exit Full Screen',
              ''
            );
          }
        }
        alert('Please remain in fullscreen mode during the assessment');
        // Re-enable fullscreen after 10 seconds (matches the pre-assessment reminder)
        if (fullscreenReenableTimerRef.current) {
          window.clearTimeout(fullscreenReenableTimerRef.current);
        }
        fullscreenReenableTimerRef.current = window.setTimeout(() => {
          document.documentElement.requestFullscreen().catch(() => {});
        }, 10000);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (fullscreenReenableTimerRef.current) {
        window.clearTimeout(fullscreenReenableTimerRef.current);
        fullscreenReenableTimerRef.current = null;
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [wantFullscreen, fullscreenExitEnabled, deduct, logPayload, isQuiz, openWarning]);

  const currentQuestion = sessionQuestions[currentQuestionIndex];
  const totalQuestions = sessionQuestions.length;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  // Watermark timestamp tick
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAnswerChange = (answer: string) => {
    if (isExamDisabled) return; // Prevent answering if auto-submitted
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: answer,
    }));
  };

  const handlePrevious = () => {
    if (!allowBack || isExamDisabled) return; // Prevent navigation if auto-submitted
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (isExamDisabled) return; // Prevent navigation if auto-submitted
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handleSubmit = () => {
    if (isExamDisabled) return; // Prevent manual submit if auto-submitted
    if (confirm('Are you sure you want to submit your assessment?')) {
      onFinish({ answers, sessionQuestions });
    }
  };

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground">No questions available for this assessment.</p>
      </div>
    );
  }

  const formatCurrentTime = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const studentNumber = userProfile?.studentNumber || 'N/A';
  const currentTimeStr = formatCurrentTime(currentTime);

  return (
    <>
      {settings.screenshotProtection && (
        <div
          className="fixed inset-0 pointer-events-none z-40 overflow-hidden select-none"
          style={{
            opacity: 0.11,
          }}
        >
          <svg
            className="w-full h-full"
            style={{ pointerEvents: 'none' }}
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <pattern
                id="watermark"
                x="0"
                y="0"
                width="200"
                height="200"
                patternUnits="userSpaceOnUse"
              >
                <g transform="rotate(-45 100 100)">
                  <text
                    x="100"
                    y="80"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="15"
                    fontFamily="monospace"
                    fontWeight="600"
                    fill="currentColor"
                    className="text-foreground"
                  >
                    {studentName}
                  </text>
                  <text
                    x="100"
                    y="100"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="14"
                    fontFamily="monospace"
                    fill="currentColor"
                    className="text-foreground"
                  >
                    #{studentNumber}
                  </text>
                  <text
                    x="100"
                    y="120"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="13"
                    fontFamily="monospace"
                    fill="currentColor"
                    className="text-foreground"
                  >
                    {currentTimeStr}
                  </text>
                </g>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#watermark)" />
          </svg>
        </div>
      )}

      <div
        className={`min-h-screen bg-background p-4 md:p-8 ${
          copyPasteEnabled ? 'select-none' : ''
        }`}
      >
        <div className="max-w-4xl mx-auto space-y-6 mb-12">
          <ConnectionStatusIndicator
            isOnline={isOnline}
            showCompensationMessage={showCompensationMessage}
            compensationSeconds={compensationSeconds}
            onDismiss={dismissCompensationMessage}
          />

          <Card>
            <CardHeader className={`${
              isAutoSubmitted ? 'bg-red-600' : 'bg-blue-500'
            } text-white -mx-6 -mt-6 rounded-t-lg flex flex-row items-center justify-between`}>
              <CardTitle className="text-center flex-1">
                {assessment?.title?.toUpperCase() || 'ASSESSMENT INTERFACE'}
              </CardTitle>
              {isAutoSubmitted && (
                <div className="flex items-center gap-2 bg-red-700 px-3 py-1 rounded-full text-sm font-semibold">
                  <AlertTriangle className="w-4 h-4" />
                  AUTO SUBMITTED
                </div>
              )}
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {isAutoSubmitted && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
                  <p className="font-semibold">Assessment Auto-Submitted</p>
                  <p className="text-sm mt-1">
                    Your assessment was automatically submitted due to prolonged tab switching. Your current answers have been recorded.
                  </p>
                </div>
              )}
              
              <div className="flex justify-between items-center">
                <span className="font-semibold">
                  Question {currentQuestionIndex + 1} of {totalQuestions}
                </span>
                <div className="flex items-center gap-2 px-4 py-2 border-2 border-accent rounded-lg font-bold text-accent">
                  <Clock className="w-5 h-5" />
                  <span>{formatTime()}</span>
                </div>
              </div>

              <QuestionCard
                question={currentQuestion}
                selectedAnswer={answers[currentQuestion.id]}
                onAnswerChange={handleAnswerChange}
                readOnly={isExamDisabled}
              />

              <div className="flex justify-between items-center pt-4">
                <Button
                  onClick={handlePrevious}
                  disabled={!allowBack || currentQuestionIndex === 0 || isExamDisabled}
                  variant="outline"
                  className="gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  PREVIOUS
                </Button>

                <div className="flex gap-2">
                  {!isLastQuestion ? (
                    <Button 
                      onClick={handleNext} 
                      disabled={isExamDisabled}
                      className="gap-2 bg-blue-500 hover:bg-blue-600"
                    >
                      NEXT
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      disabled={isExamDisabled}
                      className="gap-2 bg-green-600 hover:bg-green-700"
                    >
                      SUBMIT
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <WarningModal
          isOpen={showWarning}
          title={warningTitle}
          message={warningMessage}
          onClose={() => setShowWarning(false)}
        />
      </div>
    </>
  );
};
