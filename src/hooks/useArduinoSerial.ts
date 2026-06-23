import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ArduinoTabStatus = 'ACCIDENTAL' | 'SUSPICIOUS' | 'CHEATING';

type SerialPortLike = any;

const encodeLine = (line: string) => new TextEncoder().encode(line + '\n');

/**
 * Web Serial hook for talking to an Arduino over USB from the instructor laptop.
 *
 * Notes:
 * - Web Serial requires a user gesture to connect (button click).
 * - Works on Chromium browsers (Chrome/Edge). Firefox/Safari do not support it.
 * - Requires a secure context (HTTPS; localhost is treated as secure).
 */
export function useArduinoSerial() {
  const isSupported = useMemo(() => typeof navigator !== 'undefined' && 'serial' in navigator, []);

  const portRef = useRef<SerialPortLike | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await port.open({ baudRate: 9600 });
      const writer = port.writable?.getWriter();
      if (!writer) throw new Error('Serial port is not writable.');

      portRef.current = port;
      writerRef.current = writer;
      setIsConnected(true);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to connect to Arduino.';
      setError(msg);
      await disconnect();
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [disconnect, isSupported]);

  const sendRaw = useCallback(async (line: string) => {
    if (!writerRef.current) return false;
    try {
      await writerRef.current.write(encodeLine(line));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Serial write failed.';
      setError(msg);
      // If writing fails, the port is often gone.
      await disconnect();
      return false;
    }
  }, [disconnect]);

  const sendStatus = useCallback(
    async (status: ArduinoTabStatus) => {
      // Required command format:
      // STATUS:ACCIDENTAL | STATUS:SUSPICIOUS | STATUS:CHEATING
      return sendRaw(`STATUS:${status}`);
    },
    [sendRaw]
  );

  useEffect(() => {
    if (!isSupported) return;

    // Keep connection state accurate if the USB device is unplugged.
    // @ts-expect-error - navigator.serial is available only in supported browsers.
    const serial: Serial = navigator.serial;
    const onDisconnect = (e: Event) => {
      // If our active port was disconnected, reset state.
      if (portRef.current && (e as any)?.target === portRef.current) {
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

