import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ArduinoTabStatus = 'ACCIDENTAL' | 'SUSPICIOUS' | 'CHEATING' | 'NORMAL';

type SerialPortLike = any;

const encodeLine = (line: string) => new TextEncoder().encode(line + '\n');

/**
 * Web Serial hook for talking to an Arduino over USB from the instructor laptop.
 *
 * Features:
 * - Automatic reconnect loop on start or port disconnection.
 * - Queueing of outgoing commands when the port is disconnected.
 * - Auto-flushing of the command queue when the connection is restored.
 * - Strict syntax validation of commands before transmitting or queueing.
 */
export function useArduinoSerial() {
  const isSupported = useMemo(() => typeof navigator !== 'undefined' && 'serial' in navigator, []);

  const portRef = useRef<SerialPortLike | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const commandQueueRef = useRef<string[]>([]);
  const isReconnectingRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate command syntax: must conform to STATUS:NORMAL, STATUS:ACCIDENTAL, STATUS:SUSPICIOUS, or STATUS:CHEATING
  const validateCommand = (line: string): boolean => {
    return /^STATUS:(NORMAL|ACCIDENTAL|SUSPICIOUS|CHEATING)$/.test(line);
  };

  const flushQueue = useCallback(async () => {
    if (!writerRef.current || commandQueueRef.current.length === 0) return;
    console.log(`Flushing ${commandQueueRef.current.length} queued serial commands...`);
    const queue = [...commandQueueRef.current];
    commandQueueRef.current = [];

    for (const cmd of queue) {
      try {
        await writerRef.current.write(encodeLine(cmd));
      } catch (err) {
        console.error('Failed to send queued serial command, putting back in queue:', err);
        commandQueueRef.current.unshift(cmd);
        break;
      }
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      try {
        await writerRef.current?.close?.();
      } catch {
        // ignore
      }
      try {
        writerRef.current?.releaseLock();
      } catch {
        // ignore
      }

      try {
        await portRef.current?.close();
      } catch {
        // ignore
      }
    } finally {
      writerRef.current = null;
      portRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const connectPort = useCallback(async (port: SerialPortLike) => {
    try {
      await port.open({ baudRate: 9600 });
      const writer = port.writable?.getWriter();
      if (!writer) throw new Error('Serial port is not writable.');

      portRef.current = port;
      writerRef.current = writer;
      setIsConnected(true);
      setError(null);
      await flushQueue();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to connect to Arduino.';
      setError(msg);
      await disconnect();
      return false;
    }
  }, [disconnect, flushQueue]);

  const connect = useCallback(async () => {
    if (!isSupported) {
      setError('Web Serial is not supported in this browser. Use Chrome or Edge.');
      return false;
    }

    setIsConnecting(true);
    setError(null);
    try {
      // @ts-expect-error - navigator.serial is available only in supported browsers.
      const port: SerialPortLike = await navigator.serial.requestPort();
      return await connectPort(port);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to request serial port.';
      setError(msg);
      setIsConnecting(false);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [connectPort, isSupported]);

  const sendRaw = useCallback(async (line: string) => {
    if (!validateCommand(line)) {
      console.warn(`Blocked invalid serial command: "${line}"`);
      return false;
    }

    if (!writerRef.current) {
      console.log(`Serial port offline. Queueing command: "${line}"`);
      commandQueueRef.current.push(line);
      return false;
    }

    try {
      await writerRef.current.write(encodeLine(line));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Serial write failed.';
      setError(msg);
      console.log(`Serial write failed. Queueing command for retry: "${line}"`);
      commandQueueRef.current.push(line);
      await disconnect();
      return false;
    }
  }, [disconnect]);

  const sendStatus = useCallback(
    async (status: ArduinoTabStatus) => {
      return sendRaw(`STATUS:${status}`);
    },
    [sendRaw]
  );

  // Auto-connect to previously authorized ports on start or port changes
  useEffect(() => {
    if (!isSupported) return;

    const tryAutoConnect = async () => {
      if (isConnected || isConnecting || isReconnectingRef.current) return;
      isReconnectingRef.current = true;
      try {
        // @ts-expect-error - navigator.serial is available only in supported browsers.
        const ports = await navigator.serial.getPorts();
        if (ports.length > 0) {
          console.log('Auto-connecting to existing serial port...');
          await connectPort(ports[0]);
        }
      } catch (err) {
        console.warn('Failed to auto-connect to serial port:', err);
      } finally {
        isReconnectingRef.current = false;
      }
    };

    tryAutoConnect();

    // Set up a 5-second automatic reconnect poll loop if disconnected
    const interval = setInterval(() => {
      if (!portRef.current) {
        tryAutoConnect();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isSupported, isConnected, isConnecting, connectPort]);

  useEffect(() => {
    if (!isSupported) return;

    // @ts-expect-error - navigator.serial is available only in supported browsers.
    const serial: Serial = navigator.serial;
    const onDisconnect = (e: Event) => {
      if (portRef.current && (e as any)?.target === portRef.current) {
        console.log('Active serial port disconnected.');
        void disconnect();
      }
    };

    serial.addEventListener('disconnect', onDisconnect as any);
    return () => serial.removeEventListener('disconnect', onDisconnect as any);
  }, [disconnect, isSupported]);

  return {
    isSupported,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendStatus,
    sendRaw,
  };
}
