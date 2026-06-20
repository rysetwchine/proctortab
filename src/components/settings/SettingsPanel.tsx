import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/hooks/useSettings';
import type { SecuritySettings } from '@/context/SettingsContext';
import { Shield, Copy, Camera, Maximize, Bell } from 'lucide-react';
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/firebase";

export const SettingsPanel = () => {
  const { settings, updateSettings } = useSettings();
  const saveSettingToFirebase = async (key: string, value: boolean) => {
    try {
      await setDoc(
        doc(db, "settings", "monitoring"),
        { [key]: value },
        { merge: true }
      );
    } catch (error) {
      console.error(error);
    }
  };

  const saveManySettingsToFirebase = async (patch: Partial<SecuritySettings>) => {
    try {
      await setDoc(doc(db, "settings", "monitoring"), patch, { merge: true });
    } catch (error) {
      console.error(error);
    }
  };

  const securityOptions = [
    {
      key: 'tabDetector' as const,
      icon: Shield,
      label: 'Enable Tab Detector',
      description: 'Detect when students switch browser tabs during assessments',
    },
    {
      key: 'copyPasteProtection' as const,
      icon: Copy,
      label: 'Enable Copy & Paste Protection',
      description: 'Block copy-paste functionality during assessments',
    },
    {
      key: 'screenshotProtection' as const,
      icon: Camera,
      label: 'Enable Screenshot Protection',
      description: 'Prevent students from taking screenshots',
    },
    {
      key: 'fullScreenMode' as const,
      icon: Maximize,
      label: 'Enable Full Screen Mode',
      description: 'Force students to use fullscreen during assessments',
    },
    {
      key: 'alarmDevice' as const,
      icon: Bell,
      label: 'Enable Alarm Device',
      description: 'Sound alerts for suspicious activities',
    },
  ];

  const securityKeys = securityOptions.map((o) => o.key);
  const allSecurityOn = securityKeys.every((k) => settings[k]);

  const setAllSecurity = (on: boolean) => {
    const patch: Partial<SecuritySettings> = {};
    for (const key of securityKeys) {
      patch[key] = on;
      updateSettings(key, on);
    }
    void saveManySettingsToFirebase(patch);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 p-6 pb-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-xl sm:text-2xl">Security Settings</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Configure proctoring and security features for online assessments
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="security-all-toggle" className="cursor-pointer text-sm font-medium leading-none">
              All
            </Label>
            <Switch
              id="security-all-toggle"
              checked={allSecurityOn}
              onCheckedChange={setAllSecurity}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {securityOptions.map((option) => {
            const Icon = option.icon;
            return (
              <div
                key={option.key}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor={option.key} className="text-base font-semibold cursor-pointer">
                      {option.label}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {option.description}
                    </p>
                  </div>
                </div>
               <Switch
                 id={option.key}
                 checked={settings[option.key]}
                onCheckedChange={(checked) => {
  updateSettings(option.key, checked);
  saveSettingToFirebase(option.key, checked);
}}
                   
                   
                   />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {securityOptions.map((option) => (
              <div key={option.key} className="text-sm">
                <span className="font-medium">{option.label.replace('Enable ', '')}:</span>
                <span
                  className={`ml-2 font-semibold ${
                    settings[option.key] ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {settings[option.key] ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
