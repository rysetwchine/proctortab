import { useState, useCallback, useRef } from 'react';
import { db, rtdb } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import type { CourseAssessment } from '@/context/SessionContext';

export interface ProctorEvent {
  id: string;
  type: string;
  timestamp: number;
  details: string;
  score: number;
}

export type SeverityLevel = 'Informational' | 'Warning' | 'Suspicious' | 'Confirmed Violation';

interface Props {
  studentId: string;
  studentName: string;
  assessment?: CourseAssessment;
  examContext?: {
    courseTitle?: string;
    examTitle?: string;
    assessmentId?: string;
  };
  onAutoSubmit: () => void;
  onWarning: (title: string, message: string, penaltySeconds: number) => void;
  isOnline?: boolean;
}

export const useCheatingDetector = ({
  studentId,
  studentName,
  assessment,
  examContext,
  onAutoSubmit,
  onWarning,
  isOnline = true,
}: Props) => {
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [severityLevel, setSeverityLevel] = useState<SeverityLevel>('Informational');

  // Intentional tab switch counter (>3 seconds = intentional)
  const [intentionalSwitchCount, setIntentionalSwitchCount] = useState(0);
  const intentionalSwitchCountRef = useRef(0);

  const eventsRef = useRef<ProctorEvent[]>([]);
  const autoSubmittedRef = useRef(false);
  const isQuiz = (assessment?.assessmentType || 'exam') === 'quiz';

  const registerEvent = useCallback(
    async (rawType: string, details: string, durationSeconds?: number, isAlreadyDeducted?: boolean) => {
      if (!isOnline) {
        console.log(`Proctor event ${rawType} ignored due to active network disconnection.`);
        return;
      }

      // Guard: if already auto-submitted, ignore further events
      if (autoSubmittedRef.current) return;

      const lowerRaw = rawType.toLowerCase();
      let score = 5;
      let eventType = rawType;
      let behaviorClassification: 'Accidental' | 'Suspicious' | 'Intentional' = 'Intentional';
      
      const isTabEvent = lowerRaw.includes('tab') || lowerRaw.includes('desktop') || lowerRaw.includes('leave') || lowerRaw.includes('blur') || lowerRaw.includes('external');

      // 1. Determine classification and score for tab loss / focus events
      if (isTabEvent) {
        const secs = durationSeconds ?? 0;
        if (secs <= 1) {
          score = 8;
          eventType = 'Accidental Tab Switch';
          behaviorClassification = 'Accidental';
        } else if (secs <= 3) {
          score = 15;
          eventType = 'Suspicious Tab Switch';
          behaviorClassification = 'Suspicious';
        } else {
          score = 30;
          eventType = 'Intentional Tab Switch';
          behaviorClassification = 'Intentional';
        }
      } else {
        // Other events are always Intentional Behavior
        behaviorClassification = 'Intentional';
        if (lowerRaw.includes('fullscreen')) {
          score = 20;
          eventType = 'Fullscreen Exit';
        } else if (lowerRaw.includes('mouse')) {
          score = 6;
          eventType = 'Mouse Boundary Exit';
        } else if (lowerRaw.includes('copy') || lowerRaw.includes('paste') || lowerRaw.includes('clipboard')) {
          score = 10;
          eventType = 'Copy/Paste Attempt';
        } else if (lowerRaw.includes('screenshot') || lowerRaw.includes('printscreen') || lowerRaw.includes('snip')) {
          score = 25;
          eventType = 'Screenshot Attempt';
        } else if (lowerRaw.includes('shortcut') || lowerRaw.includes('keyboard')) {
          score = 10;
          eventType = 'Unauthorized Keyboard Shortcut';
        }
      }

      // If behavior is Accidental, we only display a warning notification, NO database record, NO penalty!
      if (behaviorClassification === 'Accidental') {
        const warningMsg = "Warning: Tab switching detected. Please remain on the assessment page.";
        onWarning('Accidental Activity Detected', warningMsg, 0);
        return;
      }

      // Otherwise (Suspicious or Intentional), we record the activity/violation
      
      // Calculate penalty:
      // Suspicious: NO penalty.
      // Intentional: Quiz: 5 mins (300s), Exam: 10 mins (600s)
      let penaltySeconds = 0;
      let dbPenaltySeconds = 0;
      if (behaviorClassification === 'Intentional') {
        dbPenaltySeconds = isQuiz ? 300 : 600;
        if (!isAlreadyDeducted) {
          penaltySeconds = dbPenaltySeconds;
        }
      }

      // Track intentional violation counts
      let newCount = intentionalSwitchCountRef.current;
      if (behaviorClassification === 'Intentional') {
        newCount += 1;
        intentionalSwitchCountRef.current = newCount;
        setIntentionalSwitchCount(newCount);
      }

      const newEvent: ProctorEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: eventType,
        timestamp: Date.now(),
        details,
        score,
      };

      const updatedEvents = [...eventsRef.current, newEvent];
      eventsRef.current = updatedEvents;
      setEvents(updatedEvents);

      // Compute confidence score
      const rawPointsSum = updatedEvents.reduce((sum, item) => sum + item.score, 0);
      const uniqueTypes = new Set(updatedEvents.map(e => {
        const typeLower = e.type.toLowerCase();
        if (typeLower.includes('tab') || typeLower.includes('desktop') || typeLower.includes('leave') || typeLower.includes('blur') || typeLower.includes('external')) return 'Tab';
        if (typeLower.includes('mouse')) return 'Mouse';
        if (typeLower.includes('fullscreen')) return 'Fullscreen';
        if (typeLower.includes('copy') || typeLower.includes('paste') || typeLower.includes('clipboard')) return 'Clipboard';
        if (typeLower.includes('screenshot') || typeLower.includes('printscreen')) return 'Screenshot';
        return 'Other';
      }));
      const synergyBonus = uniqueTypes.size >= 2 ? 15 : 0;
      const totalRawScore = rawPointsSum + synergyBonus;
      const finalConfidence = updatedEvents.length === 1 ? Math.min(25, totalRawScore) : Math.min(100, totalRawScore);
      setConfidenceScore(finalConfidence);

      // Severity Level
      let newSeverity: SeverityLevel = 'Informational';
      if (finalConfidence < 35) {
        newSeverity = 'Informational';
      } else if (finalConfidence < 65) {
        newSeverity = 'Warning';
      } else if (finalConfidence < 85) {
        newSeverity = 'Suspicious';
      } else {
        newSeverity = 'Confirmed Violation';
      }
      setSeverityLevel(newSeverity);

      let legacyStatus: 'Warning' | 'Suspicious' | 'Violation' = 'Warning';
      if (behaviorClassification === 'Suspicious' || newSeverity === 'Suspicious') {
        legacyStatus = 'Suspicious';
      } else if (behaviorClassification === 'Intentional' || newSeverity === 'Confirmed Violation') {
        legacyStatus = 'Violation';
      }

      // Check if we hit 3 intentional violations -> Auto Submit!
      const autoSubmittedFlag = newCount >= 3;

      // Select dynamic warning message
      let warningMsg = '';
      if (newCount >= 3) {
        autoSubmittedRef.current = true;
        warningMsg = `🚨 Assessment Auto-Submitted: You have reached three (3) intentional violations. Your ${isQuiz ? 'quiz' : 'assessment'} has been automatically submitted.`;
      } else if (newCount === 2) {
        warningMsg = "Warning: Multiple violations detected. Continued activity may result in automatic submission.";
      } else {
        // Specific warnings based on type
        if (isTabEvent) {
          if (behaviorClassification === 'Suspicious') {
            warningMsg = "Warning: Tab switching detected. Please remain on the assessment page.";
          } else {
            warningMsg = `Warning: Tab switching detected. Please remain on the assessment page. ${isQuiz ? '5' : '10'} minutes deducted.`;
          }
        } else if (lowerRaw.includes('copy') || lowerRaw.includes('paste') || lowerRaw.includes('clipboard')) {
          warningMsg = "Warning: Copy-paste attempt detected. This activity has been recorded.";
        } else if (lowerRaw.includes('screenshot') || lowerRaw.includes('printscreen') || lowerRaw.includes('snip')) {
          warningMsg = "Warning: Screenshot attempt detected. Unauthorized actions are prohibited.";
        } else if (lowerRaw.includes('fullscreen')) {
          warningMsg = "Warning: Full-screen mode exited. Please return immediately.";
        } else if (lowerRaw.includes('mouse')) {
          warningMsg = "Warning: Unusual mouse activity detected. This activity has been recorded.";
        } else {
          warningMsg = "Warning: Cheating attempt detected. Please remain in the assessment environment.";
        }
      }

      // Write logs in real-time
      try {
        const payload = {
          studentId,
          studentName,
          course: examContext?.courseTitle || '',
          assessmentId: examContext?.assessmentId || assessment?.id || 'unknown',
          assessmentTitle: examContext?.examTitle || assessment?.title || 'Unknown Assessment',
          timestamp: new Date(),
          violationType: eventType,
          evidence: details,
          severityLevel: newSeverity,
          status: legacyStatus,
          autoSubmitted: autoSubmittedFlag,
          durationSeconds: durationSeconds ?? 0,
          behaviorClassification,
          warningMessage: warningMsg,
          deductedTime: dbPenaltySeconds,
          violationCount: updatedEvents.length,
          intentionalViolationCount: newCount,
          supportingEvents: updatedEvents.map(e => ({
            type: e.type,
            details: e.details,
            timestamp: e.timestamp,
            score: e.score,
          })),
        };

        await addDoc(collection(db, 'tab_logs'), payload);
        await addDoc(collection(db, 'assessment_violations'), {
          ...payload,
          userId: studentId,
          violationType: eventType.toLowerCase().replace(/\s+/g, '_'),
          deductedMinutes: Number((dbPenaltySeconds / 60).toFixed(2)),
        });

        // Arduino ESP32 RTDB alert
        let rtdbEvent = '';
        if (isTabEvent) {
          if (newCount === 1) rtdbEvent = 'tab_switch_1';
          else if (newCount === 2) rtdbEvent = 'tab_switch_2';
          else rtdbEvent = 'tab_switch_3';
        } else if (lowerRaw.includes('screenshot') || lowerRaw.includes('printscreen') || lowerRaw.includes('snip')) {
          rtdbEvent = 'screen_shot';
        } else if (lowerRaw.includes('mouse')) {
          rtdbEvent = 'mouse_leave';
        } else if (lowerRaw.includes('fullscreen')) {
          rtdbEvent = 'full_screen_exit';
        }

        if (rtdbEvent) {
          try {
            await set(ref(rtdb, 'alerts/student1/event'), rtdbEvent);
            const cleanStudentId = String(studentId).replace(/[.#$/[\]]/g, '_');
            await set(ref(rtdb, `alerts/${cleanStudentId}/event`), rtdbEvent);
          } catch (rtdbErr) {
            console.warn('Could not write alert to Realtime Database:', rtdbErr);
          }
        }
      } catch (err) {
        console.warn('Could not log violation event to Firestore:', err);
      }

      // Handle actions
      if (autoSubmittedFlag) {
        autoSubmittedRef.current = true;
        onWarning('Assessment Terminated', warningMsg, penaltySeconds);
        onAutoSubmit();
      } else {
        onWarning(eventType, warningMsg, penaltySeconds);
      }
    },
    [studentId, studentName, assessment, examContext, isOnline, isQuiz, onAutoSubmit, onWarning]
  );

  const resetDetector = useCallback(() => {
    eventsRef.current = [];
    intentionalSwitchCountRef.current = 0;
    autoSubmittedRef.current = false;
    setEvents([]);
    setConfidenceScore(0);
    setSeverityLevel('Informational');
    setIntentionalSwitchCount(0);
  }, []);

  return {
    events,
    confidenceScore,
    severityLevel,
    intentionalSwitchCount,
    registerEvent,
    resetDetector,
  };
};
