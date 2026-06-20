import { createContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";

export interface SecuritySettings {
  tabDetector: boolean;
  copyPasteProtection: boolean;
  screenshotProtection: boolean;
  fullScreenMode: boolean;
  alarmDevice: boolean;
}

interface SettingsContextType {
  settings: SecuritySettings;
  updateSettings: (key: keyof SecuritySettings, value: boolean) => void;
}

const defaultSettings: SecuritySettings = {
  tabDetector: false,
  copyPasteProtection: false,
  screenshotProtection: false,
  fullScreenMode: false,
  alarmDevice: false,
};

function settingsEqual(a: SecuritySettings, b: SecuritySettings): boolean {
  return (
    a.tabDetector === b.tabDetector &&
    a.copyPasteProtection === b.copyPasteProtection &&
    a.screenshotProtection === b.screenshotProtection &&
    a.fullScreenMode === b.fullScreenMode &&
    a.alarmDevice === b.alarmDevice
  );
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<SecuritySettings>(defaultSettings);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "monitoring"),
      (snap) => {
        if (!snap.exists()) return;
        const raw = snap.data() as Partial<SecuritySettings>;
        const next: SecuritySettings = { ...defaultSettings, ...raw };
        setSettings((prev) => (settingsEqual(prev, next) ? prev : next));
      }
    );

    return () => unsub();
  }, []);

  const updateSettings = useCallback((key: keyof SecuritySettings, value: boolean) => {
    setSettings((prev) => {
      if (prev[key] === value) return prev;
      return {
        ...prev,
        [key]: value,
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
    }),
    [settings, updateSettings]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};
