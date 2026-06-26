import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QuestionCard } from './QuestionCard';
import { WarningModal } from './WarningModal';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { useExamTimer } from '@/hooks/UseExamTimer';
import { useTabDurationDetector } from '@/hooks/useTabDurationDetector';
import { useMouseBoundaryDetector } from '@/hooks/useMouseBoundaryDetector';
import { useSettings } from '@/hooks/useSettings';
import { useNetworkCompensation } from '@/hooks/useNetworkCompensation';
import { useCheatingDetector } from '@/hooks/useCheatingDetector';
import type { CourseAssessment } from '@/context/SessionContext';
import { getExamDetectorRuntime } from '@/utils/examDetectorPolicy';
import { prepareExamQuestions } from '@/utils/examSession';
import { examQuestions } from '@/data/questions';
import type { Question } from '@/types';
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle, 
  Flag, 
  Save, 
  ShieldAlert,
  Monitor,
  X,
} from 'lucide-react';
import { MotionBackground } from '@/components/shared/MotionBackground';
import {
  registerActiveSession,
  updateSessionActivity,
  terminateSession,
  monitorSimultaneousLogins,
} from '@/utils/sessionManagement';

export type ExamFinishPayload = {
  answers: Record<number, string>;
  sessionQuestions: Question[];
  violations?: any[];
};

interface ExamInterfaceProps {
  onFinish: (payload: ExamFinishPayload) => void;
  assessment?: CourseAssessment;
  examContext?: {
    courseTitle?: string;
    examTitle?: string;
    assessmentId?: string;
  };
}

export const ExamInterface = ({ onFinish, examContext, assessment }: ExamInterfaceProps) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<number, boolean>>({});
  const [showWarning, setShowWarning] = useState(false);
  const [warningTitle, setWarningTitle] = useState('WARNING MESSAGE');
  const [warningMessage, setWarningMessage] = useState('');
  const [isAutoSubmitted, setIsAutoSubmitted] = useState(false);
  const [isExamDisabled, setIsExamDisabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [sessionBlock, setSessionBlock] = useState<{ isBlocked: boolean; reason?: string }>({ isBlocked: false });
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved'>('saved');
  // Multi-desktop warning overlay state
  const [showDesktopWarning, setShowDesktopWarning] = useState(false);
  const [desktopWarningCount, setDesktopWarningCount] = useState(0);

  const { settings } = useSettings();
  const answersRef = useRef(answers);
  const sessionQuestionsRef = useRef<Question[]>([]);
  const lastViolationTimeRef = useRef(0); // Shared cooldown for all violation types
  const fullscreenReenableTimerRef = useRef<number | null>(null);
  const eventsRef = useRef<any[]>([]); // Always-current ref to cheating events

  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const userProfile = JSON.parse(localStorage.getItem('userProfile') || 'null');
  const studentId = user?.uid || user?.id || userProfile?.studentId || 'unknown-student';
  const studentName = user?.name || 'Unknown Student';
  const studentNumber = user?.studentNumber || userProfile?.studentNumber || 'N/A';

  useEffect(() => {
    answersRef.current = answers;
    
    // Simulate auto-save feedback when answers change
    if (Object.keys(answers).length > 0) {
      setSaveStatus('saving');
      const timer = setTimeout(() => {
        setSaveStatus('saved');
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [answers]);

  const sessionSeedRef = useRef(`${assessment?.id ?? 'legacy'}-${Math.random().toString(36).slice(2)}`);
  const sessionQuestions = useMemo(() => {
    if (!assessment) return examQuestions;
    return prepareExamQuestions(assessment, sessionSeedRef.current);
  }, [assessment]);

  useEffect(() => {
    sessionQuestionsRef.current = sessionQuestions;
  }, [sessionQuestions]);

  const { tabEnabled, copyPasteEnabled, fullscreenExitEnabled, wantFullscreen, screenshotEnabled } = useMemo(
    () => getExamDetectorRuntime(assessment, settings),
    [assessment, settings]
  );

  const allowBack = assessment?.allowQuestionNavigation !== false;
  const isQuiz = (assessment?.assessmentType || 'exam') === 'quiz';
  const timerSeconds = Math.max((assessment?.duration ?? 30) * 60, 60);

  const clearRtdbAlert = useCallback(async () => {
    try {
      const { rtdb } = await import('@/firebase');
      const { ref, set } = await import('firebase/database');
      await set(ref(rtdb, 'alerts/student1/event'), 'clear');
      if (studentId) {
        const cleanStudentId = String(studentId).replace(/[.#$/\[\]]/g, '_');
        await set(ref(rtdb, `alerts/${cleanStudentId}/event`), 'clear');
      }
    } catch (e) {
      console.warn('Could not clear RTDB alert:', e);
    }
  }, [studentId]);

  const handleExpire = useCallback(() => {
    void clearRtdbAlert();
    onFinish({
      answers: answersRef.current,
      sessionQuestions: sessionQuestionsRef.current,
      violations: eventsRef.current,
    });
  }, [onFinish, clearRtdbAlert]);

  const { formatTime, start, pause, deduct, compensate } = useExamTimer(timerSeconds, handleExpire);

  const openWarning = useCallback((title: string, message: string) => {
    setWarningTitle(title);
    setWarningMessage(message);
    setShowWarning((prev) => {
      if (!prev) return true;
      window.setTimeout(() => setShowWarning(true), 0);
      return false;
    });
  }, []);

  const {
    isOnline,
    showCompensationMessage,
    compensationSeconds,
    liveOfflineDuration,
    dismissCompensationMessage,
  } = useNetworkCompensation({
    onCompensate: compensate,
    onPauseTimer: pause,
    onResumeTimer: start,
    examContext,
  });

  useEffect(() => {
    start();
  }, [start]);

  // Multi-device active session control
  useEffect(() => {
    if (!studentId || !assessment?.id) return;

    let unsubscribeSimultaneous: (() => void) | null = null;
    let heartbeatInterval: number | null = null;

    const initSession = async () => {
      const res = await registerActiveSession({
        studentId,
        studentName,
        assessmentId: assessment.id,
        assessmentTitle: assessment.title || 'Unknown Assessment',
        courseId: assessment.courseId || '',
        courseTitle: examContext?.courseTitle || '',
      });

      if (!res.success) {
        setSessionBlock({
          isBlocked: true,
          reason: res.existingSession?.terminatedReason || 'An active session is already running on another device.',
        });
        return;
      }

      unsubscribeSimultaneous = monitorSimultaneousLogins(
        studentId,
        assessment.id,
        (existingSession) => {
          setSessionBlock({
            isBlocked: true,
            reason: 'Simultaneous login detected. This session has been terminated.',
          });
        }
      );

      heartbeatInterval = window.setInterval(() => {
        updateSessionActivity(studentId, assessment.id);
      }, 10000);
    };

    initSession();

    return () => {
      if (unsubscribeSimultaneous) unsubscribeSimultaneous();
      if (heartbeatInterval) window.clearInterval(heartbeatInterval);
      terminateSession(studentId, assessment.id, 'Exam completed or exited');
    };
  }, [studentId, studentName, assessment, examContext]);

  // Initialize unified anti-cheating verification system
  const {
    events,
    confidenceScore,
    severityLevel,
    intentionalSwitchCount,
    registerEvent,
  } = useCheatingDetector({
    studentId,
    studentName,
    assessment,
    examContext,
    isOnline,
    onAutoSubmit: () => {
      setIsAutoSubmitted(true);
      setIsExamDisabled(true);
      openWarning(
        'Assessment Terminated',
        isQuiz
          ? 'Multiple confirmed violations detected. Your quiz has been automatically submitted.'
          : 'Multiple confirmed violations detected. Your assessment has been automatically submitted.'
      );
      setTimeout(() => {
        onFinish({
          answers: answersRef.current,
          sessionQuestions: sessionQuestionsRef.current,
          violations: eventsRef.current,
        });
      }, 2000);
    },
    onWarning: (title, message, penaltySeconds) => {
      openWarning(title, message);
      if (penaltySeconds > 0) {
        deduct(penaltySeconds);
      }
    },
  });

  // Synchronize student's active exam progress to Firestore in real-time
  useEffect(() => {
    if (!studentId || !assessment?.id) return;
    const docRef = doc(db, 'active_exam_students', `${studentId}_${assessment.id}`);
    
    const totalQuestions = sessionQuestions.length;
    const answersCount = Object.keys(answers).length;
    const progressPercent = totalQuestions > 0 ? Math.round((answersCount / totalQuestions) * 100) : 0;
    
    // Count tab switch / violation events
    const violationsCount = events.length;
    
    let currentStatus = 'Normal';
    if (violationsCount > 2) {
      currentStatus = 'Violation';
    } else if (violationsCount > 0) {
      currentStatus = 'Suspicious';
    }

    const payload = {
      studentId,
      studentName,
      studentNumber,
      assessmentId: assessment.id,
      assessmentTitle: assessment.title,
      courseId: examContext?.assessmentId || assessment?.id || '',
      courseTitle: examContext?.courseTitle || '',
      currentQuestion: currentQuestionIndex + 1,
      totalQuestions,
      answersCount,
      progress: progressPercent,
      violations: violationsCount,
      status: currentStatus,
      lastActivity: new Date(),
    };

    setDoc(docRef, payload, { merge: true }).catch((err) => {
      console.warn('Could not update active exam student status:', err);
    });
  }, [
    studentId,
    studentName,
    studentNumber,
    assessment?.id,
    assessment?.title,
    examContext?.assessmentId,
    examContext?.courseTitle,
    currentQuestionIndex,
    sessionQuestions.length,
    answers,
    events,
  ]);

  // Clean up student status from Firestore when exiting the exam page (unmounting)
  useEffect(() => {
    return () => {
      if (studentId && assessment?.id) {
        const docRef = doc(db, 'active_exam_students', `${studentId}_${assessment.id}`);
        deleteDoc(docRef).catch((err) => {
          console.warn('Could not delete active exam student status on cleanup:', err);
        });
      }
    };
  }, [studentId, assessment?.id]);

  // ─── Multi-Desktop / Virtual Desktop Overlay ────────────────────────────
  // We detect virtual desktop switches by listening to visibilitychange.
  // A separate listener here ONLY shows the visual warning overlay.
  // The actual violation is already logged by useTabDurationDetector below
  // (both a tab switch and a virtual desktop switch hide the page).
  // We do NOT call registerEvent here to avoid double-counting.
  useEffect(() => {
    if (!tabEnabled) return;

    const handlePageHide = () => {
      if (document.hidden) {
        // Show the multi-desktop/tab warning overlay immediately when page is hidden
        setShowDesktopWarning(true);
        setDesktopWarningCount((c) => c + 1);
      }
    };

    document.addEventListener('visibilitychange', handlePageHide);
    return () => document.removeEventListener('visibilitychange', handlePageHide);
  }, [tabEnabled]);

  // Keep eventsRef always current so handleExpire can read it without referencing events before init
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const handleTabDurationSwitch = useCallback(
    (event: { durationSeconds: number; status: 'Warning' | 'Suspicious' | 'Violation' }) => {
      const { durationSeconds } = event;
      registerEvent(
        'Tab Switch',
        `Switched tabs/blurred browser window for ${durationSeconds} second(s).`,
        durationSeconds
      );
    },
    [registerEvent]
  );

  // Tab Exit hook
  useTabDurationDetector({
    enabled: tabEnabled,
    onTabSwitch: handleTabDurationSwitch,
    sharedLastViolationTimeRef: lastViolationTimeRef,
  });

  // Mouse boundary exit hook — only active when cursor monitoring is enabled
  useMouseBoundaryDetector({
    enabled: true, // Always track cursor (it's always part of proctoring)
    sharedLastViolationTimeRef: lastViolationTimeRef,
    onBoundaryExit: (pos) => {
      registerEvent(
        'Mouse Exit',
        `Moved cursor outside browser workspace boundaries (X: ${pos.x}, Y: ${pos.y}).`
      );
    }
  });

  // Clipboard override handlers — only active when copyPasteEnabled
  useEffect(() => {
    if (!copyPasteEnabled) return; // ← Only enforce when setting is ON

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      registerEvent('Copy/Paste Blocked', 'Attempted to copy assessment text.');
    };
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      registerEvent('Copy/Paste Blocked', 'Attempted to paste external text.');
    };
    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      registerEvent('Copy/Paste Blocked', 'Attempted to cut assessment content.');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        registerEvent('Clipboard Restriction', `Blocked keyboard shortcut Ctrl/Cmd + ${e.key.toUpperCase()}`);
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
  }, [copyPasteEnabled, registerEvent]);

  // Screen protection / screenshot handlers — only active when screenshotEnabled
  useEffect(() => {
    if (!screenshotEnabled) return; // ← Only enforce when setting is ON

    const handleScreenshotAttempt = (details: string) => {
      registerEvent('Screenshot Attempt', details);
      
      // Overwrite Clipboard with Watermark text
      try {
        const timeNow = new Date();
        const timeStr = `${String(timeNow.getHours()).padStart(2, '0')}:${String(timeNow.getMinutes()).padStart(2, '0')}:${String(timeNow.getSeconds()).padStart(2, '0')}`;
        const warningText = `[ProctorTab Security Alert] Screenshot blocked for student "${studentName}" (ID: ${studentNumber}) at ${timeStr}. Unauthorized content distribution is strictly prohibited.`;
        navigator.clipboard.writeText(warningText).catch(() => {});
      } catch (err) {
        console.warn('Could not overwrite clipboard:', err);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      const isSnipping = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's';

      if (isPrintScreen) {
        e.preventDefault();
        handleScreenshotAttempt('PrintScreen key pressed (keydown).');
      }

      if (isSnipping) {
        e.preventDefault();
        handleScreenshotAttempt('Snipping Tool keyboard shortcut activated (Cmd/Ctrl + Shift + S).');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      if (isPrintScreen) {
        e.preventDefault();
        handleScreenshotAttempt('PrintScreen key released (keyup).');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [screenshotEnabled, studentName, studentNumber, registerEvent]);

  // Fullscreen constraint handler
  useEffect(() => {
    if (!wantFullscreen) return;

    document.documentElement.requestFullscreen().catch(() => {});

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        const now = Date.now();
        if (now - lastViolationTimeRef.current >= 3000) {
          lastViolationTimeRef.current = now;

          if (fullscreenExitEnabled) {
            registerEvent('Fullscreen Exit', 'Exited secure fullscreen mode.');
          }
        }
        // Use our non-blocking custom warning modal instead of synchronous window.alert
        openWarning(
          'Fullscreen Exit Detected',
          'Please remain in fullscreen mode during the assessment. Continued exit will result in automated submission.'
        );
        
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
    };
  }, [wantFullscreen, fullscreenExitEnabled, registerEvent]);

  // Exit fullscreen strictly on component unmount (prevents automatic exit on dependency re-run)
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Reset hardware alerts on mount
  useEffect(() => {
    void clearRtdbAlert();
  }, [clearRtdbAlert]);

  const currentQuestion = sessionQuestions[currentQuestionIndex];
  const totalQuestions = sessionQuestions.length;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  // Watermark timestamp ticks
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAnswerChange = (answer: string) => {
    if (isExamDisabled) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: answer,
    }));
  };

  const handlePrevious = () => {
    if (!allowBack || isExamDisabled) return;
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (isExamDisabled) return;
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const toggleFlag = () => {
    setFlaggedQuestions((prev) => ({
      ...prev,
      [currentQuestionIndex]: !prev[currentQuestionIndex],
    }));
  };

  const handleSubmit = () => {
    if (isExamDisabled) return;
    if (confirm('Are you sure you want to submit your assessment?')) {
      void clearRtdbAlert();
      onFinish({ answers, sessionQuestions, violations: events });
    }
  };

  const handleNavigateToQuestion = (idx: number) => {
    if (!allowBack || isExamDisabled) return;
    setCurrentQuestionIndex(idx);
  };

  // Compute progress analytics
  const answeredCount = useMemo(() => {
    return sessionQuestions.filter((q) => answers[q.id] != null && answers[q.id] !== '').length;
  }, [answers, sessionQuestions]);

  const unansweredCount = totalQuestions - answeredCount;
  const flaggedCount = Object.values(flaggedQuestions).filter(Boolean).length;
  const progressPercentage = Math.round((answeredCount / totalQuestions) * 100);

  // Time-left warning color resolves
  const timerString = formatTime();
  const isTimeCritical = useMemo(() => {
    // Check if time is less than 5 minutes (300 seconds)
    if (!timerString) return false;
    const parts = timerString.split(':');
    if (parts.length < 2) return false;
    const mins = parseInt(parts[0], 10);
    return mins < 5 && mins >= 0;
  }, [timerString]);

  if (sessionBlock.isBlocked) {
    return (
      <div className="fixed inset-0 bg-[#06031b]/95 backdrop-blur-md z-50 flex items-center justify-center p-6 text-center select-none text-white animate-in fade-in duration-200">
        <div className="max-w-md w-full bg-slate-900/60 border border-red-500/30 rounded-2xl p-8 space-y-6 shadow-2xl backdrop-blur-lg animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-red-500 uppercase">Exam Session Blocked</h1>
            <p className="text-slate-300 text-sm">
              {sessionBlock.reason || 'Simultaneous login detected or session terminated.'}
            </p>
          </div>
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 text-xs text-slate-400 text-left leading-relaxed">
            <p className="font-semibold text-red-400 mb-1">Why am I seeing this?</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>You may have opened this examination on another device or browser tab.</li>
              <li>Your previous session was closed or expired due to inactivity.</li>
              <li>Only one active session is permitted per student at any time.</li>
            </ul>
          </div>
          <p className="text-xs text-slate-500">
            Please contact your instructor or administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground">No questions available for this assessment.</p>
      </div>
    );
  }

  const currentTimeStr = `${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}:${String(currentTime.getSeconds()).padStart(2, '0')}`;

  return (
    <MotionBackground>
      {/* Screenshot protection watermark */}
      {settings.screenshotProtection && (
        <div className="fixed inset-0 pointer-events-none z-[45] overflow-hidden select-none opacity-[0.16]">
          <svg className="w-full h-full" style={{ pointerEvents: 'none' }} preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="watermark-exam" x="0" y="0" width="220" height="220" patternUnits="userSpaceOnUse">
                <g transform="rotate(-40 110 110)">
                  <text x="110" y="80" textAnchor="middle" fontSize="14" fontFamily="monospace" fontWeight="600" fill="white">{studentName}</text>
                  <text x="110" y="105" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="white">#{studentNumber}</text>
                  <text x="110" y="130" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="white">{currentTimeStr}</text>
                </g>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#watermark-exam)" />
          </svg>
        </div>
      )}

      {/* Connection Status Overlay */}
      <ConnectionStatusIndicator
        isOnline={isOnline}
        showCompensationMessage={showCompensationMessage}
        compensationSeconds={compensationSeconds}
        liveOfflineDuration={liveOfflineDuration}
        onDismiss={dismissCompensationMessage}
      />

      <div className={`min-h-screen p-4 md:p-8 flex flex-col justify-center items-center ${copyPasteEnabled ? 'select-none' : ''}`}>
        <div className="max-w-4xl w-full flex flex-col gap-6 my-auto text-slate-200">

          {/* ═══ HEADER CARD — Title + Timer + Progress ═══ */}
          <div
            className="w-full rounded-3xl border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl hover:border-cyan-500/20 transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(2, 2, 8, 0.5) 0%, rgba(2, 2, 8, 0.75) 100%)' }}
          >
            {/* shimmer top line */}
            <div className="h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

            <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Left: exam info */}
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cyan-500/35 text-cyan-400 font-bold uppercase"
                    style={{ background: 'rgba(6,182,212,0.08)' }}
                  >
                    {assessment?.assessmentType || 'Assessment'}
                  </span>
                  <span className="text-xs text-slate-500">·</span>
                  <span className="text-xs text-slate-400 truncate">{examContext?.courseTitle || 'ProctorTab Secure Course'}</span>

                  {/* Auto-save indicator */}
                  <div className="flex items-center gap-1.5 ml-1 text-[10px]">
                    <Save className={`w-3 h-3 ${saveStatus === 'saving' ? 'text-cyan-400 animate-spin' : 'text-emerald-400'}`} />
                    <span className={saveStatus === 'saving' ? 'text-cyan-400/80' : 'text-emerald-400/80'}>
                      {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
                    </span>
                  </div>

                  {/* ── Intentional Switch Counter Badge ── */}
                  {intentionalSwitchCount > 0 && (
                    <span
                      className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                        intentionalSwitchCount >= 2
                          ? 'border-rose-500/60 text-rose-400 bg-rose-500/10 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                          : 'border-amber-500/50 text-amber-400 bg-amber-500/8'
                      }`}
                    >
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Intentional Switches: {intentionalSwitchCount}/3
                    </span>
                  )}
                </div>

                <h1 className="text-xl font-black text-white uppercase tracking-wide">
                  {examContext?.examTitle || assessment?.title || 'ASSESSMENT WORKSPACE'}
                </h1>

                {/* Progress bar */}
                <div className="flex items-center gap-3 pt-0.5">
                  <div className="flex-1 h-2 rounded-full overflow-hidden border border-white/8" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressPercentage}%`, background: 'linear-gradient(90deg, #06b6d4, #3b82f6)' }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                    {answeredCount} / {totalQuestions} answered
                  </span>
                  {isAutoSubmitted && (
                    <span className="flex items-center gap-1 text-[9px] font-bold text-rose-400 animate-pulse">
                      <AlertTriangle className="w-3 h-3" />
                      AUTO SUBMITTED
                    </span>
                  )}
                </div>
              </div>

              {/* Right: Timer */}
              <div
                className={`flex flex-col items-center justify-center rounded-2xl border px-6 py-4 min-w-[130px] flex-shrink-0 transition-all duration-300 ${
                  isTimeCritical
                    ? 'border-rose-500/50 shadow-[0_0_25px_rgba(239,68,68,0.25)]'
                    : 'border-cyan-500/45 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                }`}
                style={{
                  background: isTimeCritical
                    ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(2, 2, 8, 0.4) 100%)'
                    : 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(2, 2, 8, 0.4) 100%)',
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className={`w-3 h-3 ${isTimeCritical ? 'text-rose-400 animate-pulse' : 'text-cyan-400'}`} />
                  <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">Remaining</span>
                </div>
                <div
                  className={`text-3xl font-black font-mono tracking-wider ${
                    isTimeCritical ? 'text-rose-400 animate-pulse' : 'text-cyan-400'
                  }`}
                >
                  {timerString}
                </div>
                {isTimeCritical && (
                  <p className="text-[8px] text-rose-400 font-bold mt-1 uppercase tracking-widest animate-pulse">Running out!</p>
                )}
              </div>
            </div>
          </div>

          {/* ═══ QUESTION CARD ═══ */}
          <div
            className="w-full rounded-3xl border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.47)] backdrop-blur-xl hover:border-indigo-500/20 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(2, 2, 8, 0.55) 0%, rgba(2, 2, 8, 0.7) 100%)' }}
          >
            {/* Question counter strip */}
            <div
              className="px-6 py-4 border-b border-white/10 flex items-center justify-between"
              style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.12) 0%, transparent 70%)' }}
            >
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
                Question {currentQuestionIndex + 1} of {totalQuestions}
              </span>
              {flaggedQuestions[currentQuestionIndex] && (
                <span className="flex items-center gap-1.5 text-[9px] font-bold text-amber-400">
                  <Flag className="w-3 h-3 fill-amber-400" />
                  Flagged for Review
                </span>
              )}
            </div>

            <div className="p-6 md:p-8">
              <QuestionCard
                question={currentQuestion}
                selectedAnswer={answers[currentQuestion.id]}
                onAnswerChange={handleAnswerChange}
                readOnly={isExamDisabled}
              />
            </div>
          </div>

          {/* ═══ NAVIGATION TOOLBAR ═══ */}
          <div
            className="w-full rounded-3xl border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl hover:border-cyan-500/20 transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(2, 2, 8, 0.5) 0%, rgba(2, 2, 8, 0.75) 100%)' }}
          >
            <div className="p-4 flex justify-between items-center gap-3">

              {/* Previous */}
              <button
                onClick={handlePrevious}
                disabled={!allowBack || currentQuestionIndex === 0 || isExamDisabled}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-sm font-bold text-slate-350 hover:text-cyan-400 hover:border-cyan-500/40 hover:bg-white/[0.04] transition-all duration-250 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:text-slate-350 disabled:hover:border-white/10 disabled:hover:bg-transparent"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              {/* Flag */}
              <button
                onClick={toggleFlag}
                disabled={isExamDisabled}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-bold transition-all duration-250 hover:scale-[1.01] ${
                  flaggedQuestions[currentQuestionIndex]
                    ? 'border-amber-500/50 text-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                    : 'border-white/10 text-slate-400 hover:text-amber-400 hover:border-amber-500/35 hover:bg-white/[0.04]'
                }`}
                style={{
                  background: flaggedQuestions[currentQuestionIndex]
                    ? 'rgba(245,158,11,0.08)'
                    : 'rgba(255,255,255,0.02)',
                }}
              >
                <Flag className={`w-4 h-4 ${flaggedQuestions[currentQuestionIndex] ? 'fill-amber-400' : ''}`} />
                <span className="hidden sm:inline">
                  {flaggedQuestions[currentQuestionIndex] ? 'Flagged' : 'Flag'}
                </span>
              </button>

              {/* Next or Submit */}
              {!isLastQuestion ? (
                <button
                  onClick={handleNext}
                  disabled={isExamDisabled}
                  className="flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold text-white transition-all duration-250 hover:scale-[1.03] hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                    boxShadow: '0 0 20px rgba(6,182,212,0.25)',
                  }}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isExamDisabled}
                  className="flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold text-white transition-all duration-250 hover:scale-[1.03] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #0d9488 100%)',
                    boxShadow: '0 0 20px rgba(16,185,129,0.25)',
                  }}
                >
                  <ShieldAlert className="w-4 h-4" />
                  Submit Assessment
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Proctor warning modal */}
      <WarningModal
        isOpen={showWarning}
        title={warningTitle}
        message={warningMessage}
        onClose={() => {
          setShowWarning(false);
          void clearRtdbAlert();
          // Re-enable fullscreen if wantFullscreen is enabled and we are not in fullscreen
          if (wantFullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        }}
      />

      {/* ═══ VIRTUAL DESKTOP / MULTI-DESKTOP WARNING OVERLAY ═══ */}
      {showDesktopWarning && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(239,68,68,0.4)] border border-rose-500/50 animate-in zoom-in-90 duration-200"
            style={{ background: 'linear-gradient(135deg, rgba(20,5,5,0.97) 0%, rgba(40,8,8,0.95) 100%)' }}
          >
            {/* Red shimmer top */}
            <div className="h-1 w-full bg-gradient-to-r from-rose-700 via-red-500 to-rose-700" />

            <div className="p-7 space-y-5">
              {/* Icon + heading */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.25)]">
                  <Monitor className="w-7 h-7 text-rose-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-500/80 mb-1">ProctorTab Security Alert</p>
                  <h2 className="text-xl font-black text-white leading-tight">Multi-Desktop Activity Detected</h2>
                  <p className="text-xs text-rose-400/80 mt-1 font-semibold">Detection #{desktopWarningCount}</p>
                </div>
                <button
                  onClick={() => setShowDesktopWarning(false)}
                  className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Alert message */}
              <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4 space-y-2">
                <p className="text-sm text-slate-200 leading-relaxed">
                  The system has detected that you switched to a <strong className="text-rose-300">different virtual desktop</strong> (e.g., Desktop 2, Task View, or macOS Spaces) while this exam was active.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  This has been <strong className="text-rose-400">flagged and logged</strong> to your instructor's monitoring dashboard. Multiple occurrences may result in automatic submission.
                </p>
              </div>

              {/* Violation counter */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Tab/Desktop Switches</p>
                  <p className="text-2xl font-black text-rose-400 mt-1">{desktopWarningCount}</p>
                </div>
                <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Intentional Switches</p>
                  <p className={`text-2xl font-black mt-1 ${intentionalSwitchCount >= 2 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                    {intentionalSwitchCount}<span className="text-sm text-slate-500">/3</span>
                  </p>
                </div>
              </div>

              {/* Warning level */}
              <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-950/40 border border-slate-800/50 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>
                  <strong className="text-white">Reminder:</strong> You must remain on this exam page at all times. Switching virtual desktops, opening other applications, or leaving the browser will be recorded as a violation.
                </span>
              </div>

              {/* Dismiss button */}
              <button
                onClick={() => setShowDesktopWarning(false)}
                className="w-full h-11 rounded-xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', boxShadow: '0 0 20px rgba(220,38,38,0.25)' }}
              >
                I Understand — Return to Exam
              </button>
            </div>
          </div>
        </div>
      )}
    </MotionBackground>
  );
};
