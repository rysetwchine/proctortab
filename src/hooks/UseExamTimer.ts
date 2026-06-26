import { useState, useEffect, useRef, useCallback } from 'react';

export const useExamTimer = (initialTime: number, onExpire?: () => void) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          onExpireRef.current?.();
          return 0;
        }
        return prev - 1;
      });
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
