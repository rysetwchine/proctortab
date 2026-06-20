import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface NetworkCompensationState {
  isOnline: boolean;
  disconnectTime: number | null;
  lastCompensatedTime: number;
  showCompensationMessage: boolean;
  compensationSeconds: number;
}

interface UseNetworkCompensationProps {
  onCompensate?: (seconds: number) => void;
  examContext?: {
    courseTitle?: string;
    examTitle?: string;
    assessmentId?: string;
  };
}

export const useNetworkCompensation = ({
  onCompensate,
  examContext,
}: UseNetworkCompensationProps) => {
  const [state, setState] = useState<NetworkCompensationState>({
    isOnline: navigator.onLine,
    disconnectTime: null,
    lastCompensatedTime: 0,
    showCompensationMessage: false,
    compensationSeconds: 0,
  });

  const onCompensateRef = useRef(onCompensate);
  const userRef = useRef(JSON.parse(localStorage.getItem('user') || 'null'));

  useEffect(() => {
    onCompensateRef.current = onCompensate;
    userRef.current = JSON.parse(localStorage.getItem('user') || 'null');
  }, [onCompensate]);

  const logConnectionEvent = useCallback(
    async (eventData: {
      event: 'disconnect' | 'reconnect';
      disconnectedAt?: number;
      reconnectedAt?: number;
      durationOffline?: number;
      compensatedTime?: number;
    }) => {
      try {
        await addDoc(
          collection(db, 'connection_logs'),
          {
            studentName: userRef.current?.name || 'Unknown Student',
            ...eventData,
            ...(examContext?.courseTitle ? { course: examContext.courseTitle } : {}),
            ...(examContext?.examTitle ? { examTitle: examContext.examTitle } : {}),
            ...(examContext?.assessmentId ? { assessmentId: examContext.assessmentId } : {}),
            timestamp: serverTimestamp(),
          }
        );
      } catch (error) {
        console.error('Failed to log connection event:', error);
      }
    },
    [examContext]
  );

  useEffect(() => {
    const handleOnline = () => {
      setState((prev) => {
        if (!prev.disconnectTime) return prev;

        const now = Date.now();
        const durationOffline = Math.floor((now - prev.disconnectTime) / 1000);

        // Prevent duplicate compensation within same reconnect
        if (now - prev.lastCompensatedTime < 1000) {
          return {
            ...prev,
            isOnline: true,
            disconnectTime: null,
          };
        }

        onCompensateRef.current?.(durationOffline);

        // Log the reconnection event with compensation
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
        };
      });
    };

    const handleOffline = () => {
      const now = Date.now();
      setState((prev) => {
        // Log the disconnection event
        void logConnectionEvent({
          event: 'disconnect',
          disconnectedAt: now,
        });

        return {
          ...prev,
          isOnline: false,
          disconnectTime: now,
        };
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [logConnectionEvent]);

  const dismissCompensationMessage = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showCompensationMessage: false,
    }));
  }, []);

  return {
    isOnline: state.isOnline,
    isDisconnected: !state.isOnline,
    disconnectTime: state.disconnectTime,
    showCompensationMessage: state.showCompensationMessage,
    compensationSeconds: state.compensationSeconds,
    dismissCompensationMessage,
  };
};
