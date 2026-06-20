import React, { createContext, useContext, type ReactNode } from 'react';
import { useArduinoSerial } from '@/hooks/useArduinoSerial';

type ArduinoSerialContextValue = ReturnType<typeof useArduinoSerial>;

const ArduinoSerialContext = createContext<ArduinoSerialContextValue | null>(null);

/**
 * Keeps the Web Serial connection alive across route/sidebar navigation by
 * hoisting the serial hook state above individual pages/components.
 */
export function ArduinoSerialProvider({ children }: { children: ReactNode }) {
  const arduino = useArduinoSerial();
  return <ArduinoSerialContext.Provider value={arduino}>{children}</ArduinoSerialContext.Provider>;
}

export function useArduinoSerialContext() {
  const ctx = useContext(ArduinoSerialContext);
  if (!ctx) {
    throw new Error('useArduinoSerialContext must be used within ArduinoSerialProvider');
  }
  return ctx;
}

