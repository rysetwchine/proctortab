import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface NetworkCompensationState {
  isOnline: boolean;
  disconnectTime: number | null;
  lastCompensatedTime: number;
  showCompensationMessage: boolean;
  compensationSeconds: number;
  liveOfflineDuration: number; // live counter while disconnected
}

interface UseNetworkCompensationProps {
  onCompensate?: (seconds: number) => void;
  onPauseTimer?: () => void;   // called when connection drops — pause exam timer
  onResumeTimer?: () => void;  // called when reconnected — resume exam timer
  examContext?: {
    courseTitle?: string;
    examTitle?: string;
    assessmentId?: string;
  };
}

export const useNetworkCompensation = ({
  onCompensate,
  onPauseTimer,
  onResumeTimer,
  examContext,
}: UseNetworkCompensationProps) => {
  const [state, setState] = useState<NetworkCompensationState>({
    isOnline: navigator.onLine,
    disconnectTime: null,
    lastCompensatedTime: 0,
    showCompensationMessage: false,
    compensationSeconds: 0,
    liveOfflineDuration: 0,
  });

  const onCompensateRef = useRef(onCompensate);
  const onPauseRef = useRef(onPauseTimer);
  const onResumeRef = useRef(onResumeTimer);
  const userRef = useRef(JSON.parse(localStorage.getItem('user') || 'null'));
  const pingIntervalRef = useRef<number | null>(null);
  const liveCounterRef = useRef<number | null>(null);

  useEffect(() => {
    onCompensateRef.current = onCompensate;
    onPauseRef.current = onPauseTimer;
    onResumeRef.current = onResumeTimer;
    userRef.current = JSON.parse(localStorage.getItem('user') || 'null');
  }, [onCompensate, onPauseTimer, onResumeTimer]);

  const logConnectionEvent = useCallback(
    async (eventData: {
      event: 'disconnect' | 'reconnect';
      disconnectedAt?: number;
      reconnectedAt?: number;
      durationOffline?: number;
      compensatedTime?: number;
    }) => {
      try {
        await addDoc(collection(db, 'connection_logs'), {
          studentName: userRef.current?.name || 'Unknown Student',
          studentId: userRef.current?.id || 'unknown',
          ...eventData,
          browserInfo: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            onLine: navigator.onLine,
          },
          ...(examContext?.courseTitle ? { course: examContext.courseTitle } : {}),
          ...(examContext?.examTitle ? { examTitle: examContext.examTitle } : {}),
          ...(examContext?.assessmentId ? { assessmentId: examContext.assessmentId } : {}),
          timestamp: serverTimestamp(),
          isCheatingViolation: false,
          eventType: 'network_connectivity',
        });
      } catch (error) {
        console.error('Failed to log connection event:', error);
      }
    },
    [examContext]
  );

  // ─── Active ping check (every 5s) to catch drops that browser.onLine misses ───
  const startPingCheck = useCallback(() => {
    if (pingIntervalRef.current) return;
    pingIntervalRef.current = window.setInterval(async () => {
      try {
        // Ping a tiny resource with a cache-busting param
        await fetch(`https://www.gstatic.com/generate_204?_=${Date.now()}`, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
        });
        // If we get here and were offline, fire online recovery
        if (!navigator.onLine) {
          window.dispatchEvent(new Event('online'));
        }
      } catch {
        // Ping failed — if we thought we were online, trigger offline
        if (navigator.onLine) {
          window.dispatchEvent(new Event('offline'));
        }
      }
    }, 5000);
  }, []);

  const stopPingCheck = useCallback(() => {
    if (pingIntervalRef.current) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  // ─── Live offline duration counter ───
  const startLiveCounter = useCallback((disconnectTime: number) => {
    if (liveCounterRef.current) window.clearInterval(liveCounterRef.current);
    liveCounterRef.current = window.setInterval(() => {
      setState((prev) => ({
        ...prev,
        liveOfflineDuration: Math.floor((Date.now() - disconnectTime) / 1000),
      }));
    }, 1000);
  }, []);

  const stopLiveCounter = useCallback(() => {
    if (liveCounterRef.current) {
      window.clearInterval(liveCounterRef.current);
      liveCounterRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setState((prev) => {
        if (!prev.disconnectTime) return { ...prev, isOnline: true };

        const now = Date.now();
        const durationOffline = Math.floor((now - prev.disconnectTime) / 1000);

        // Prevent duplicate compensation within the same reconnect
        if (now - prev.lastCompensatedTime < 1000) {
          return { ...prev, isOnline: true, disconnectTime: null };
        }

        // Add back exactly the time they were offline
        onCompensateRef.current?.(durationOffline);
        // Resume the exam timer
        onResumeRef.current?.();

        void logConnectionEvent({
          event: 'reconnect',
          disconnectedAt: prev.disconnectTime,
          reconnectedAt: now,
          durationOffline,
          compensatedTime: durationOffline,
        });

        return {
          isOnline: true,
          disconnectTime: null,
          lastCompensatedTime: now,
          showCompensationMessage: true,
          compensationSeconds: durationOffline,
          liveOfflineDuration: 0,
        };
      });

      stopLiveCounter();
      stopPingCheck();
    };

    const handleOffline = () => {
      const now = Date.now();

      // Pause the exam timer immediately
      onPauseRef.current?.();

      setState((prev) => {
        if (!prev.isOnline) return prev; // already offline
        void logConnectionEvent({ event: 'disconnect', disconnectedAt: now });
        return {
          ...prev,
          isOnline: false,
          disconnectTime: now,
          liveOfflineDuration: 0,
          showCompensationMessage: false,
        };
      });

      startLiveCounter(now);
      startPingCheck();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Bootstrap: if already offline on mount
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopLiveCounter();
      stopPingCheck();
    };
  }, [logConnectionEvent, startLiveCounter, stopLiveCounter, startPingCheck, stopPingCheck]);

  const dismissCompensationMessage = useCallback(() => {
    setState((prev) => ({ ...prev, showCompensationMessage: false }));
  }, []);

  return {
    isOnline: state.isOnline,
    isDisconnected: !state.isOnline,
    disconnectTime: state.disconnectTime,
    liveOfflineDuration: state.liveOfflineDuration,
    showCompensationMessage: state.showCompensationMessage,
    compensationSeconds: state.compensationSeconds,
    dismissCompensationMessage,
  };
};
