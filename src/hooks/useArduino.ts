import { useState, useCallback } from 'react';

export const useArduino = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const ARDUINO_API = '/api';

  // Check Arduino Connection Status
  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(`${ARDUINO_API}/arduino-status`);
      const data = await response.json();
      setIsConnected(data.connected);
      return data.connected;
    } catch (err) {
      setIsConnected(false);
      return false;
    }
  }, []);

  // Trigger Cheating Alarm
  const triggerCheatingAlarm = useCallback(
    async (duration: number = 3) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${ARDUINO_API}/trigger-alarm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'cheating',
            duration,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to trigger alarm');
        }

        console.log('✅ Cheating Alarm Triggered!', data);
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        console.error('❌ Error:', errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const setStatusNormal = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${ARDUINO_API}/status-normal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to set status');
      }

      console.log('🟢 Status set to Normal');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('❌ Error:', errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setStatusWarning = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${ARDUINO_API}/status-warning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to set status');
      }

      console.log('🟡 Status set to Warning');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('❌ Error:', errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    checkStatus,
    triggerCheatingAlarm,
    setStatusNormal,
    setStatusWarning,
    isLoading,
    error,
    isConnected,
  };
};
