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
  // Virtual desktop switch counter
  const [virtualDesktopCount, setVirtualDesktopCount] = useState(0);

  const eventsRef = useRef<ProctorEvent[]>([]);
  const autoSubmittedRef = useRef(false);
  const isQuiz = (assessment?.assessmentType || 'exam') === 'quiz';

  const registerEvent = useCallback(
    async (rawType: string, details: string, durationSeconds?: number) => {
      if (!isOnline) {
        console.log(`Proctor event ${rawType} ignored due to active network disconnection.`);
        return;
      }

      // Guard: if already auto-submitted, ignore further events
      if (autoSubmittedRef.current) return;

      // Calculate score points for the event type
      let score = 5; // default minimal score
      let eventType = rawType;

      const isTabEvent = rawType.toLowerCase().includes('tab');
      const isVirtualDesktop = rawType.toLowerCase().includes('virtual') || rawType.toLowerCase().includes('desktop');

      if (isTabEvent || isVirtualDesktop) {
        const secs = durationSeconds ?? 0;
        if (secs <= 1.5) {
          score = 8;
          eventType = isVirtualDesktop ? 'Virtual Desktop Switch (Accidental)' : 'Accidental Tab Switch';
        } else if (secs <= 4) {
          score = 15;
          eventType = isVirtualDesktop ? 'Virtual Desktop Switch (Suspicious)' : 'Suspicious Tab Switch';
        } else {
          score = 30;
          eventType = isVirtualDesktop ? 'Virtual Desktop Switch (Intentional)' : 'Intentional Tab Switch';
        }

        // ─── FEATURE: 3-Strike Intentional Switch Auto-Submit ────────────────
        // An "intentional" event is any tab/desktop switch that lasted >3 seconds
        if (secs > 3) {
          const newCount = intentionalSwitchCountRef.current + 1;
          intentionalSwitchCountRef.current = newCount;
          setIntentionalSwitchCount(newCount);

          if (newCount >= 3) {
            // Third intentional switch — auto submit immediately
            autoSubmittedRef.current = true;

            // Log to Firestore before submitting
            try {
              const payload = {
                studentId,
                studentName,
                course: examContext?.courseTitle || '',
                assessmentId: examContext?.assessmentId || assessment?.id || 'unknown',
                assessmentTitle: examContext?.examTitle || assessment?.title || 'Unknown Assessment',
                timestamp: serverTimestamp(),
                violationType: 'intentional_auto_submit',
                evidence: `3rd intentional tab/virtual-desktop switch detected (${secs}s). Auto-submitted.`,
                severityLevel: 'Confirmed Violation' as SeverityLevel,
                confidenceScore: 100,
                status: 'Violation',
                autoSubmitted: true,
                durationSeconds: secs,
              };
              await addDoc(collection(db, 'tab_logs'), payload);
              await addDoc(collection(db, 'assessment_violations'), {
                ...payload,
                userId: studentId,
                deductedMinutes: 0,
              });
              // RTDB alert
              await set(ref(rtdb, 'alerts/student1/event'), 'tab_switch_3');
              const cleanStudentId = String(studentId).replace(/[.#$/[\]]/g, '_');
              await set(ref(rtdb, `alerts/${cleanStudentId}/event`), 'tab_switch_3');
            } catch (err) {
              console.warn('Could not log auto-submit event:', err);
            }

            onWarning(
              '🚨 Assessment Auto-Submitted',
              `You have been detected switching tabs or virtual desktops 3 times intentionally. Your ${isQuiz ? 'quiz' : 'assessment'} has been automatically submitted as per the exam policy.`,
              0
            );
            onAutoSubmit();
            return;
          } else if (newCount === 2) {
            // Second intentional switch — serious warning
            onWarning(
              '⚠️ Final Warning — 2nd Intentional Switch',
              `This is your 2nd intentional tab/virtual-desktop switch. ONE MORE will automatically submit your ${isQuiz ? 'quiz' : 'assessment'}. Return to the exam window immediately.`,
              isQuiz ? 300 : 600
            );
          } else if (newCount === 1) {
            // First intentional switch — 1st warning
            onWarning(
              '⚠️ Warning — 1st Intentional Switch',
              `An intentional tab/virtual-desktop switch was detected (${secs}s). You have 2 remaining chances before automatic submission. Please stay in the exam window.`,
              isQuiz ? 180 : 300
            );
          }
        }

        // Track virtual desktop count separately for display
        if (isVirtualDesktop) {
          setVirtualDesktopCount((c) => c + 1);
        }
      } else if (rawType.toLowerCase().includes('fullscreen')) {
        score = 20;
        eventType = 'Fullscreen Exit';
      } else if (rawType.toLowerCase().includes('mouse')) {
        score = 6;
        eventType = 'Mouse Boundary Exit';
      } else if (rawType.toLowerCase().includes('copy') || rawType.toLowerCase().includes('paste')) {
        score = 10;
        eventType = 'Copy/Paste Attempt';
      } else if (rawType.toLowerCase().includes('screenshot') || rawType.toLowerCase().includes('printscreen') || rawType.toLowerCase().includes('snip')) {
        score = 25;
        eventType = 'Screenshot Attempt';
      } else if (rawType.toLowerCase().includes('shortcut') || rawType.toLowerCase().includes('keyboard')) {
        score = 10;
        eventType = 'Unauthorized Keyboard Shortcut';
      }

      const newEvent: ProctorEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: eventType,
        timestamp: Date.now(),
        details,
        score,
      };

      // Update state and ref
      const updatedEvents = [...eventsRef.current, newEvent];
      eventsRef.current = updatedEvents;
      setEvents(updatedEvents);

      // Compute Multi-Factor Confidence Score
      // 1. Calculate raw points sum
      const rawPointsSum = updatedEvents.reduce((sum, item) => sum + item.score, 0);

      // 2. Synergy Bonus: If there are multiple distinct categories of violations
      const uniqueTypes = new Set(updatedEvents.map(e => {
        if (e.type.includes('Tab') || e.type.includes('Desktop')) return 'Tab';
        if (e.type.includes('Mouse')) return 'Mouse';
        if (e.type.includes('Fullscreen')) return 'Fullscreen';
        if (e.type.includes('Copy') || e.type.includes('Paste')) return 'Clipboard';
        if (e.type.includes('Screenshot') || e.type.includes('PrintScreen')) return 'Screenshot';
        return 'Other';
      }));
      const synergyBonus = uniqueTypes.size >= 2 ? 15 : 0;

      const totalRawScore = rawPointsSum + synergyBonus;

      // 3. Multi-Factor Safety Clause
      let finalConfidence = 0;
      if (updatedEvents.length === 1) {
        finalConfidence = Math.min(25, totalRawScore);
      } else {
        finalConfidence = Math.min(100, totalRawScore);
      }

      setConfidenceScore(finalConfidence);

      // Determine Severity Level
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

      // Map to old dashboard status for backward compatibility
      let legacyStatus: 'Warning' | 'Suspicious' | 'Violation' = 'Warning';
      if (newSeverity === 'Suspicious') {
        legacyStatus = 'Suspicious';
      } else if (newSeverity === 'Confirmed Violation') {
        legacyStatus = 'Violation';
      }

      const autoSubmittedFlag = newSeverity === 'Confirmed Violation';

      // Log detailed violation data to Firestore
      try {
        const payload = {
          studentId,
          studentName,
          course: examContext?.courseTitle || '',
          assessmentId: examContext?.assessmentId || assessment?.id || 'unknown',
          assessmentTitle: examContext?.examTitle || assessment?.title || 'Unknown Assessment',
          timestamp: serverTimestamp(),
          violationType: eventType,
          evidence: details,
          severityLevel: newSeverity,
          confidenceScore: finalConfidence,
          status: legacyStatus,
          autoSubmitted: autoSubmittedFlag,
          durationSeconds: durationSeconds ?? 0,
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
          deductedMinutes: isQuiz ? (newSeverity === 'Suspicious' ? 5 : 3) : (newSeverity === 'Suspicious' ? 10 : 5),
        });

        // Write to Firebase Realtime Database for ESP32 board
        let rtdbEvent = '';
        const lowerRaw = rawType.toLowerCase();
        if (lowerRaw.includes('tab') || lowerRaw.includes('desktop')) {
          const tabSwitchesCount = updatedEvents.filter(e =>
            e.type.toLowerCase().includes('tab') || e.type.toLowerCase().includes('desktop')
          ).length;
          if (tabSwitchesCount === 1) rtdbEvent = 'tab_switch_1';
          else if (tabSwitchesCount === 2) rtdbEvent = 'tab_switch_2';
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

      // Execute actions based on Severity (only for non-intentional events that weren't already warned above)
      const isIntentionalTabAlreadyHandled = (isTabEvent || isVirtualDesktop) && (durationSeconds ?? 0) > 3;

      if (newSeverity === 'Confirmed Violation' && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        onAutoSubmit();
      } else if (!isIntentionalTabAlreadyHandled) {
        let penaltySeconds = 0;
        let warningMsg = '';

        if (newSeverity === 'Suspicious') {
          penaltySeconds = isQuiz ? 300 : 600;
          warningMsg = `Repeated suspicious actions detected. Confidence: ${finalConfidence}%. ${isQuiz ? '5 minutes' : '10 minutes'} deducted from your timer. Please focus strictly on the exam window.`;
          onWarning(eventType, warningMsg, penaltySeconds);
        } else if (newSeverity === 'Warning') {
          penaltySeconds = isQuiz ? 180 : 300;
          warningMsg = `Multiple unusual indicators detected. Confidence: ${finalConfidence}%. ${isQuiz ? '3 minutes' : '5 minutes'} deducted from your timer. Keep your focus on the page.`;
          onWarning(eventType, warningMsg, penaltySeconds);
        } else {
          warningMsg = `Reminder: Isolated activity detected (${eventType}). Keep your focus within the assessment window. Confidence: ${finalConfidence}% (Low Risk).`;
          onWarning(eventType, warningMsg, 0);
        }
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
    setVirtualDesktopCount(0);
  }, []);

  return {
    events,
    confidenceScore,
    severityLevel,
    intentionalSwitchCount,
    virtualDesktopCount,
    registerEvent,
    resetDetector,
  };
};
