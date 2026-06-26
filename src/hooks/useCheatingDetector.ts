import { useState, useCallback, useRef } from 'react';
import { db } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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
  
  const eventsRef = useRef<ProctorEvent[]>([]);
  const isQuiz = (assessment?.assessmentType || 'exam') === 'quiz';

  const registerEvent = useCallback(
    async (rawType: string, details: string, durationSeconds?: number) => {
      if (!isOnline) {
        console.log(`Proctor event ${rawType} ignored due to active network disconnection.`);
        return;
      }

      // Calculate score points for the event type
      let score = 5; // default minimal score
      let eventType = rawType;

      if (rawType.toLowerCase().includes('tab')) {
        const secs = durationSeconds ?? 0;
        if (secs <= 1.5) {
          score = 8;
          eventType = 'Accidental Tab Switch';
        } else if (secs <= 4) {
          score = 15;
          eventType = 'Suspicious Tab Switch';
        } else {
          score = 30;
          eventType = 'Intentional Tab Switch';
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

      // 2. Synergy Bonus: If there are multiple distinct categories of violations (e.g. Tab switch AND Mouse exit)
      const uniqueTypes = new Set(updatedEvents.map(e => {
        if (e.type.includes('Tab')) return 'Tab';
        if (e.type.includes('Mouse')) return 'Mouse';
        if (e.type.includes('Fullscreen')) return 'Fullscreen';
        if (e.type.includes('Copy') || e.type.includes('Paste')) return 'Clipboard';
        if (e.type.includes('Screenshot') || e.type.includes('PrintScreen')) return 'Screenshot';
        return 'Other';
      }));
      const synergyBonus = uniqueTypes.size >= 2 ? 15 : 0;

      const totalRawScore = rawPointsSum + synergyBonus;

      // 3. Multi-Factor Safety Clause:
      // A student must NEVER be classified as cheating (High Risk / Auto-Submit / Confirmed Violation) based on a single event.
      let finalConfidence = 0;
      if (updatedEvents.length === 1) {
        // Cap confidence score at 25% (Low Risk) for a single isolated incident
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

      // Map to old dashboard status ('Warning' | 'Suspicious' | 'Violation') for backward compatibility
      let legacyStatus: 'Warning' | 'Suspicious' | 'Violation' = 'Warning';
      if (newSeverity === 'Suspicious') {
        legacyStatus = 'Suspicious';
      } else if (newSeverity === 'Confirmed Violation') {
        legacyStatus = 'Violation';
      }

      const autoSubmitted = newSeverity === 'Confirmed Violation';

      // Log detailed violation data to Firestore collections
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
          autoSubmitted,
          durationSeconds: durationSeconds ?? 0,
          supportingEvents: updatedEvents.map(e => ({
            type: e.type,
            details: e.details,
            timestamp: e.timestamp,
            score: e.score,
          })),
        };

        // Add doc to tab_logs to sync with existing proctor screens
        await addDoc(collection(db, 'tab_logs'), payload);
        
        // Also write to assessment_violations for unified alerts
        await addDoc(collection(db, 'assessment_violations'), {
          ...payload,
          userId: studentId,
          violationType: eventType.toLowerCase().replace(/\s+/g, '_'),
          deductedMinutes: isQuiz ? (newSeverity === 'Suspicious' ? 5 : 3) : (newSeverity === 'Suspicious' ? 10 : 5),
        });
      } catch (err) {
        console.warn('Could not log violation event to Firestore:', err);
      }

      // Execute actions (Warnings or Auto-Submits) based on Severity
      if (newSeverity === 'Confirmed Violation') {
        onAutoSubmit();
      } else {
        let penaltySeconds = 0;
        let warningMsg = '';

        if (newSeverity === 'Suspicious') {
          penaltySeconds = isQuiz ? 300 : 600; // Quiz: 5 min, Exam: 10 min
          warningMsg = `Repeated suspicious actions detected. Confidence: ${finalConfidence}%. ${isQuiz ? '5 minutes' : '10 minutes'} deducted from your timer. Please focus strictly on the exam window.`;
          onWarning(eventType, warningMsg, penaltySeconds);
        } else if (newSeverity === 'Warning') {
          penaltySeconds = isQuiz ? 180 : 300; // Quiz: 3 min, Exam: 5 min
          warningMsg = `Multiple unusual indicators detected. Confidence: ${finalConfidence}%. ${isQuiz ? '3 minutes' : '5 minutes'} deducted from your timer. Keep your focus on the page.`;
          onWarning(eventType, warningMsg, penaltySeconds);
        } else {
          // Informational: no time deduction, just a subtle heads up
          warningMsg = `Reminder: Isolated activity detected (${eventType}). Keep your focus within the assessment window. Confidence: ${finalConfidence}% (Low Risk).`;
          onWarning(eventType, warningMsg, 0);
        }
      }
    },
    [studentId, studentName, assessment, examContext, isOnline, isQuiz, onAutoSubmit, onWarning]
  );

  const resetDetector = useCallback(() => {
    eventsRef.current = [];
    setEvents([]);
    setConfidenceScore(0);
    setSeverityLevel('Informational');
  }, []);

  return {
    events,
    confidenceScore,
    severityLevel,
    registerEvent,
    resetDetector,
  };
};
