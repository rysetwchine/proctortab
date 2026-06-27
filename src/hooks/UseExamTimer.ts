import { useState, useEffect, useRef, useCallback } from 'react';

export const useExamTimer = (initialTime: number, onExpire?: () => void) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      lastTickRef.current = null;
      return;
    }

    lastTickRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - (lastTickRef.current ?? now);
      lastTickRef.current = now;
      const elapsedSeconds = Math.round(elapsedMs / 1000);

      if (elapsedSeconds > 0) {
        setTimeLeft((prev) => {
          const nextTime = prev - elapsedSeconds;
          if (nextTime <= 0) {
            setIsRunning(false);
            setTimeout(() => {
              onExpireRef.current?.();
            }, 0);
            return 0;
          }
          return nextTime;
        });
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);
  const reset = useCallback((time?: number) => {
    setTimeLeft(time ?? initialTime);
    setIsRunning(false);
  }, [initialTime]);
  const deduct = useCallback((seconds: number) => {
    console.log(`[useExamTimer] deduct called: deducting ${seconds} seconds.`);
    setTimeLeft((prev) => {
      const newTime = Math.max(0, prev - seconds);
      console.log(`[useExamTimer] Time adjusted: from ${prev}s to ${newTime}s.`);
      if (newTime <= 0) {
        setIsRunning(false);
        setTimeout(() => {
          console.log('[useExamTimer] Time fully depleted. Expiring session.');
          onExpireRef.current?.();
        }, 100);
      }
      return newTime;
    });
  }, []);
  const compensate = useCallback((seconds: number) => {
    setTimeLeft((prev) => prev + seconds);
  }, []);

  const formatTime = () => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return {
    timeLeft,
    isRunning,
    formatTime,
    start,
    pause,
    reset,
    deduct,
    compensate,
  };
};
