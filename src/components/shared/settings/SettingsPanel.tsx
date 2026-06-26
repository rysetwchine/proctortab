import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/hooks/useSettings';
import type { SecuritySettings } from '@/context/SettingsContext';
import { 
  Shield, Copy, Camera, Maximize, Bell,
  UserCircle2, IdCard, Mail, GraduationCap,
  CalendarDays, BookOpen, Save, Loader2
} from 'lucide-react';
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { MotionBackground } from '@/components/shared/MotionBackground';
import { ContentCard } from '@/components/ui/ContentCard';
import { DarkToggle } from '@/components/ui/DarkToggle';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { StudentQrCard } from '@/components/instructor/StudentQrCard';
import { syncStudentProfileToFirestore } from '@/utils/syncStudentProfileFirestore';
import { getCurrentStudentDirectoryId, studentProfileDocId } from '@/utils/studentDirectory';

export const SettingsPanel = () => {
  const { settings, updateSettings } = useSettings();
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isStudent = (storedUser?.role?.toLowerCase?.() || "student") === "student";

  // State for Student Settings
  const [profile, setProfile] = useState({
    name: '',
    studentNumber: '',
    email: '',
    course: '',
    year: '',
    program: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isStudent) {
      setLoading(false);
      return;
    }
    const loadProfile = async () => {
      try {
        const directoryId = getCurrentStudentDirectoryId();
        if (directoryId) {
          const docRef = doc(db, 'student_profiles', studentProfileDocId(directoryId));
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setProfile({
              name: data.name || storedUser.name || '',
              studentNumber: data.studentNumber || storedUser.studentNumber || '',
              email: data.email || storedUser.email || '',
              course: data.course || storedUser.course || '',
              year: data.year || storedUser.year || '',
              program: data.program || '',
            });
          } else {
            setProfile({
              name: storedUser.name || '',
              studentNumber: storedUser.studentNumber || '',
              email: storedUser.email || '',
              course: storedUser.course || '',
              year: storedUser.year || '',
              program: '',
            });
          }
        }
      } catch (err) {
        console.warn('Error loading student profile:', err);
      } finally {
        setLoading(false);
      }
    };
    void loadProfile();
  }, [isStudent]);

  const handleSaveProfile = async () => {
    if (!profile.name.trim() || !profile.studentNumber.trim() || !profile.email.trim() || !profile.course.trim() || !profile.year.trim()) {
      toast.error("Please fill in all required fields (Name, Student Number, Email, Course, Year).");
      return;
    }

    setSaving(true);
    try {
      const directoryId = getCurrentStudentDirectoryId();
      
      // 1. Save core fields via sync function
      await syncStudentProfileToFirestore({
        name: profile.name,
        studentNumber: profile.studentNumber,
        email: profile.email,
        course: profile.course,
        year: profile.year,
      }, directoryId);

      // 2. Save program field (since syncStudentProfileToFirestore doesn't take program)
      if (directoryId) {
        await setDoc(
          doc(db, "student_profiles", studentProfileDocId(directoryId)),
          { program: profile.program },
          { merge: true }
        );
      }

      // 3. Update localStorage 'user'
      const updatedUser = {
        ...storedUser,
        name: profile.name,
        studentNumber: profile.studentNumber,
        email: profile.email,
        course: profile.course,
        year: profile.year,
      };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      localStorage.removeItem("userProfile");

      toast.success("Profile updated and QR Code refreshed!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

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

  if (isStudent) {
    if (loading) {
      return (
        <MotionBackground>
          <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <p className="text-slate-400 mt-4 text-sm font-medium">Loading your profile settings...</p>
          </div>
        </MotionBackground>
      );
    }

    return (
      <MotionBackground>
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-white tracking-wide">Account Settings</h1>
            <p className="text-slate-400 mt-2 text-sm">
              Manage your personal student details and live-generate your attendance QR code.
            </p>
          </div>

          {/* Settings Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Profile Form */}
            <div className="lg:col-span-7 space-y-6">
              <ContentCard className="border border-slate-800 bg-slate-900/40 backdrop-blur-md p-6 rounded-xl shadow-xl">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <UserCircle2 className="w-5 h-5 text-cyan-400" />
                  Profile Details
                </h2>

                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 flex items-center gap-2 mb-1.5 uppercase tracking-wider">
                      <UserCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                      Full Name *
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/55 transition-all text-sm"
                      placeholder="Juan dela Cruz"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    />
                  </div>

                  {/* Student Number */}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 flex items-center gap-2 mb-1.5 uppercase tracking-wider">
                      <IdCard className="w-3.5 h-3.5 text-cyan-400" />
                      Student Number *
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-white placeholder:text-slate-550 focus:outline-none focus:border-cyan-500/55 transition-all text-sm"
                      placeholder="2023-0101"
                      value={profile.studentNumber}
                      onChange={(e) => setProfile({ ...profile, studentNumber: e.target.value })}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 flex items-center gap-2 mb-1.5 uppercase tracking-wider">
                      <Mail className="w-3.5 h-3.5 text-cyan-400" />
                      Email Address *
                    </label>
                    <input
                      type="email"
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-white placeholder:text-slate-550 focus:outline-none focus:border-cyan-500/55 transition-all text-sm"
                      placeholder="student@icct.edu.ph"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    />
                  </div>

                  {/* Grid for Course & Year */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Course */}
                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-2 mb-1.5 uppercase tracking-wider">
                        <GraduationCap className="w-3.5 h-3.5 text-cyan-400" />
                        Course *
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-white placeholder:text-slate-550 focus:outline-none focus:border-cyan-500/55 transition-all text-sm"
                        placeholder="BSIT"
                        value={profile.course}
                        onChange={(e) => setProfile({ ...profile, course: e.target.value })}
                      />
                    </div>

                    {/* Year */}
                    <div>
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-2 mb-1.5 uppercase tracking-wider">
                        <CalendarDays className="w-3.5 h-3.5 text-cyan-400" />
                        Year *
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-white placeholder:text-slate-550 focus:outline-none focus:border-cyan-500/55 transition-all text-sm"
                        placeholder="3rd Year"
                        value={profile.year}
                        onChange={(e) => setProfile({ ...profile, year: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Program */}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 flex items-center gap-2 mb-1.5 uppercase tracking-wider">
                      <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                      Academic Program
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-white placeholder:text-slate-550 focus:outline-none focus:border-cyan-500/55 transition-all text-sm"
                      placeholder="Bachelor of Science in Information Technology"
                      value={profile.program}
                      onChange={(e) => setProfile({ ...profile, program: e.target.value })}
                    />
                  </div>
                </div>

                {/* Save Button */}
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveProfile}
                  className="w-full mt-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white py-3 rounded-lg font-bold text-sm tracking-wide transition-all shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving changes...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Settings
                    </>
                  )}
                </button>
              </ContentCard>
            </div>

            {/* QR Card */}
            <div className="lg:col-span-5">
              <div className="border border-slate-800 bg-slate-900/40 backdrop-blur-md p-1.5 rounded-xl shadow-xl overflow-hidden">
                <StudentQrCard
                  uid={storedUser.uid || getCurrentStudentDirectoryId()}
                  profile={{
                    name: profile.name,
                    studentNumber: profile.studentNumber,
                    email: profile.email,
                    course: profile.course,
                    year: profile.year,
                    program: profile.program || undefined,
                  }}
                />
              </div>
            </div>

          </div>
        </div>
      </MotionBackground>
    );
  }

  return (
    <MotionBackground>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">Security Settings</h1>

        <ContentCard>
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl text-white font-semibold">Configure all security features</h2>
                <p className="text-slate-400 text-sm">Enable or disable all proctoring settings at once</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="security-all-toggle" className="cursor-pointer text-sm font-medium text-white">
                  All
                </Label>
                <DarkToggle
                  id="security-all-toggle"
                  enabled={allSecurityOn}
                  onChange={() => setAllSecurity(!allSecurityOn)}
                />
              </div>
            </div>

            {securityOptions.map((option) => {
              const Icon = option.icon;
              return (
                <div
                  key={option.key}
                  className="flex justify-between items-center p-4 bg-slate-950/40 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 transition-colors"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <Icon className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={option.key} className="text-base font-semibold cursor-pointer text-white">
                        {option.label}
                      </Label>
                      <p className="text-sm text-slate-400 mt-1">
                        {option.description}
                      </p>
                    </div>
                  </div>
                  <DarkToggle
                    id={option.key}
                    enabled={settings[option.key]}
                    onChange={() => {
                      updateSettings(option.key, !settings[option.key]);
                      saveSettingToFirebase(option.key, !settings[option.key]);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </ContentCard>

        <ContentCard className="mt-6">
          <h2 className="text-xl text-white font-semibold mb-4">Current Configuration</h2>
          <div className="grid grid-cols-2 gap-4">
            {securityOptions.map((option) => (
              <div key={option.key} className="text-sm">
                <span className="font-medium text-slate-300">{option.label.replace('Enable ', '')}:</span>
                <span
                  className={`ml-2 font-semibold ${
                    settings[option.key] ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {settings[option.key] ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </ContentCard>
      </div>
    </MotionBackground>
  );
};
