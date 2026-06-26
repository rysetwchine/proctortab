import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Clock,
  FileText,
  Award,
  User,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Shield,
  Camera,
  Maximize,
  Bell,
  Copy,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { CourseAssessment } from '@/context/SessionContext';
import { useSettings } from '@/hooks/useSettings';
import { useSession } from '@/hooks/useSession';
import { getExamDetectorRuntime } from '@/utils/examDetectorPolicy';
import { MotionBackground } from '@/components/shared/MotionBackground';

interface ExamInstructionsProps {
  onStart: () => void;
  examTitle?: string;
  assessment?: CourseAssessment;
}

export const ExamInstructions = ({ onStart, examTitle, assessment }: ExamInstructionsProps) => {
  const { settings } = useSettings();
  const { sessions } = useSession();

  const course = useMemo(() => {
    return sessions.find(
      (s) =>
        s.id === assessment?.courseId ||
        s.assessments?.some((a) => a.id === assessment?.id)
    );
  }, [sessions, assessment]);

  const courseName = course?.title || 'General Course';
  const instructorName = course?.instructorName || 'Course Instructor';

  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const userProfile = JSON.parse(localStorage.getItem('userProfile') || 'null');
  const studentId = user?.uid || user?.id || userProfile?.studentId || 'unknown-student';
  const attemptNumber = useMemo(() => {
    return (assessment?.submissions?.filter((s) => s.studentId === studentId).length || 0) + 1;
  }, [assessment?.submissions, studentId]);

  const runtime = useMemo(
    () => getExamDetectorRuntime(assessment, settings),
    [assessment, settings]
  );

  const [understandAgreed, setUnderstandAgreed] = useState(false);

  // The 5 proctoring guidelines — exactly matching the 5 instructor settings toggles
  const allGuidelineDefinitions = [
    {
      key: 'tab',
      enabled: runtime.tabEnabled,
      icon: <Shield className="w-4 h-4" />,
      title: 'Tab Detector',
      desc: 'Switching or leaving the exam browser tab will be detected and logged as a violation.',
      activeBg: 'bg-cyan-500/10',
      activeBorder: 'border-cyan-500/30',
      activeIcon: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400',
      activeTitle: 'text-cyan-300',
      inactiveBg: 'bg-white/[0.02]',
      inactiveBorder: 'border-white/8',
      inactiveIcon: 'bg-slate-800/50 border-slate-700/40 text-slate-500',
      inactiveTitle: 'text-slate-500',
    },
    {
      key: 'copy',
      enabled: runtime.copyPasteEnabled,
      icon: <Copy className="w-4 h-4" />,
      title: 'Copy & Paste Protection',
      desc: 'Copying, cutting, and pasting are fully blocked during this assessment session.',
      activeBg: 'bg-violet-500/10',
      activeBorder: 'border-violet-500/30',
      activeIcon: 'bg-violet-500/15 border-violet-500/30 text-violet-400',
      activeTitle: 'text-violet-300',
      inactiveBg: 'bg-white/[0.02]',
      inactiveBorder: 'border-white/8',
      inactiveIcon: 'bg-slate-800/50 border-slate-700/40 text-slate-500',
      inactiveTitle: 'text-slate-500',
    },
    {
      key: 'screenshot',
      enabled: runtime.screenshotEnabled,
      icon: <Camera className="w-4 h-4" />,
      title: 'Screenshot Protection',
      desc: 'Taking screenshots during the exam is prevented and monitored by the system.',
      activeBg: 'bg-rose-500/10',
      activeBorder: 'border-rose-500/30',
      activeIcon: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
      activeTitle: 'text-rose-300',
      inactiveBg: 'bg-white/[0.02]',
      inactiveBorder: 'border-white/8',
      inactiveIcon: 'bg-slate-800/50 border-slate-700/40 text-slate-500',
      inactiveTitle: 'text-slate-500',
    },
    {
      key: 'fullscreen',
      enabled: runtime.wantFullscreen,
      icon: <Maximize className="w-4 h-4" />,
      title: 'Full Screen Mode',
      desc: 'The exam runs in mandatory fullscreen. Exiting fullscreen is logged as a violation.',
      activeBg: 'bg-amber-500/10',
      activeBorder: 'border-amber-500/30',
      activeIcon: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
      activeTitle: 'text-amber-300',
      inactiveBg: 'bg-white/[0.02]',
      inactiveBorder: 'border-white/8',
      inactiveIcon: 'bg-slate-800/50 border-slate-700/40 text-slate-500',
      inactiveTitle: 'text-slate-500',
    },
    {
      key: 'alarm',
      enabled: runtime.alarmEnabled,
      icon: <Bell className="w-4 h-4" />,
      title: 'Alarm Device',
      desc: 'Sound alerts will play on the proctor device when suspicious activity is detected.',
      activeBg: 'bg-emerald-500/10',
      activeBorder: 'border-emerald-500/30',
      activeIcon: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
      activeTitle: 'text-emerald-300',
      inactiveBg: 'bg-white/[0.02]',
      inactiveBorder: 'border-white/8',
      inactiveIcon: 'bg-slate-800/50 border-slate-700/40 text-slate-500',
      inactiveTitle: 'text-slate-500',
    },
  ];

  const activeCount = allGuidelineDefinitions.filter((g) => g.enabled).length;

  return (
    <MotionBackground>
      <div className="min-h-screen flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-500">
        <div className="max-w-4xl w-full space-y-5">

          {/* ═══ HERO BANNER ═══ */}
          <div
            className="relative rounded-2xl overflow-hidden border border-white/10 shadow-[0_8px_60px_rgba(0,0,0,0.7)]"
            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.14) 0%, rgba(7,4,32,0.92) 45%, rgba(59,130,246,0.14) 100%)' }}
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />

            <div className="relative p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 rounded-2xl bg-cyan-500/25 blur-xl scale-125" />
                  <div className="relative w-14 h-14 rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-cyan-500/25 to-blue-600/20 flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.35)]">
                    <BookOpen className="w-7 h-7 text-cyan-400" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[9px] uppercase tracking-[0.2em] text-cyan-400 font-bold font-mono">
                      ProctorTab — Secure Assessment
                    </span>
                  </div>
                  <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                    {examTitle || assessment?.title || 'Course Assessment'}
                  </h1>
                  <p className="text-sm text-slate-400">{courseName}&nbsp;·&nbsp;{instructorName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                {[
                  { label: 'Duration', value: `${assessment?.duration ?? 30}m` },
                  { label: 'Questions', value: `${assessment?.questions ?? 10}` },
                  { label: 'Attempt', value: `#${attemptNumber}`, accent: true },
                ].map(({ label, value, accent }) => (
                  <div
                    key={label}
                    className={`text-center rounded-xl px-5 py-3 border min-w-[72px] backdrop-blur-sm ${
                      accent
                        ? 'bg-cyan-500/12 border-cyan-500/35 shadow-[0_0_18px_rgba(6,182,212,0.2)]'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</p>
                    <p className={`text-lg font-black mt-0.5 ${accent ? 'text-cyan-400' : 'text-white'}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ═══ BODY GRID ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* LEFT COLUMN (3/5) */}
            <div className="lg:col-span-3 flex flex-col gap-5">

              {/* Assessment Details */}
              <div
                className="rounded-2xl border border-white/8 overflow-hidden shadow-[0_4px_40px_rgba(0,0,0,0.6)]"
                style={{ background: 'linear-gradient(160deg, rgba(15,23,42,0.9) 0%, rgba(7,4,32,0.95) 100%)' }}
              >
                <div
                  className="px-5 py-3.5 flex items-center gap-2.5 border-b border-white/8"
                  style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.1) 0%, transparent 100%)' }}
                >
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Assessment Details</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: <User className="w-3.5 h-3.5" />, label: 'Instructor', value: instructorName },
                      { icon: <BookOpen className="w-3.5 h-3.5" />, label: 'Course', value: courseName },
                      { icon: <Clock className="w-3.5 h-3.5" />, label: 'Time Limit', value: `${assessment?.duration ?? 30} Minutes` },
                      { icon: <FileText className="w-3.5 h-3.5" />, label: 'Total Items', value: `${assessment?.questions ?? 10} Questions` },
                      { icon: <Award className="w-3.5 h-3.5" />, label: 'Max Score', value: `${assessment?.maxScore ?? 100} pts` },
                    ].map(({ icon, label, value }) => (
                      <div
                        key={label}
                        className="group rounded-xl p-3.5 border border-white/6 hover:border-cyan-500/25 transition-all duration-200"
                        style={{ background: 'rgba(255,255,255,0.028)' }}
                      >
                        <div className="flex items-center gap-1.5 text-slate-500 text-[9px] uppercase tracking-widest font-bold mb-2 group-hover:text-cyan-400 transition-colors">
                          {icon}
                          <span>{label}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-100 block truncate">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Proctoring Guidelines — exactly 5 settings */}
              <div
                className="rounded-2xl border border-white/8 overflow-hidden shadow-[0_4px_40px_rgba(0,0,0,0.6)]"
                style={{ background: 'linear-gradient(160deg, rgba(15,23,42,0.9) 0%, rgba(7,4,32,0.95) 100%)' }}
              >
                <div
                  className="px-5 py-3.5 flex items-center gap-2.5 border-b border-white/8"
                  style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.1) 0%, transparent 100%)' }}
                >
                  <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Proctoring Settings</span>
                  <span
                    className={`ml-auto text-[9px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase border ${
                      activeCount > 0
                        ? 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400'
                        : 'bg-white/5 border-white/10 text-slate-500'
                    }`}
                  >
                    {activeCount} / 5 Active
                  </span>
                </div>
                <div className="p-5 space-y-2.5">
                  {allGuidelineDefinitions.map(({ key, enabled, icon, title, desc, activeBg, activeBorder, activeIcon, activeTitle, inactiveBg, inactiveBorder, inactiveIcon, inactiveTitle }) => (
                    <div
                      key={key}
                      className={`flex items-start gap-3.5 rounded-xl p-3.5 border transition-all duration-200 ${
                        enabled ? `${activeBg} ${activeBorder}` : `${inactiveBg} ${inactiveBorder}`
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 ${enabled ? activeIcon : inactiveIcon}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${enabled ? activeTitle : inactiveTitle}`}>{title}</span>
                          {enabled ? (
                            <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 flex-shrink-0">
                              <CheckCircle2 className="w-3 h-3" />
                              ON
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-slate-600 flex-shrink-0">
                              <XCircle className="w-3 h-3" />
                              OFF
                            </span>
                          )}
                        </div>
                        <p className={`text-[10px] leading-relaxed mt-0.5 ${enabled ? 'text-slate-400' : 'text-slate-600'}`}>
                          {desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN (2/5) */}
            <div className="lg:col-span-2 flex flex-col gap-5">

              {/* Proctor Notice */}
              <div
                className="rounded-2xl border border-white/8 overflow-hidden shadow-[0_4px_40px_rgba(0,0,0,0.6)]"
                style={{ background: 'linear-gradient(160deg, rgba(15,23,42,0.9) 0%, rgba(7,4,32,0.95) 100%)' }}
              >
                <div
                  className="px-5 py-3.5 border-b border-white/8 flex items-center gap-2"
                  style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.08) 0%, transparent 100%)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Proctor Notice</span>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    This assessment is fully monitored by the{' '}
                    <span className="text-cyan-400 font-semibold">ProctorTab Security Engine</span>.
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    All interactions are logged in real time and stored for instructor review. The proctoring settings shown on the left are configured by your instructor.
                  </p>

                  <div
                    className="rounded-xl border border-white/6 p-3.5 space-y-2.5"
                    style={{ background: 'rgba(255,255,255,0.025)' }}
                  >
                    <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-3">What Is Monitored</p>
                    {[
                      { label: 'Screen activity logged', color: 'bg-cyan-400', text: 'text-cyan-400' },
                      { label: 'Tab focus tracked', color: 'bg-violet-400', text: 'text-violet-400' },
                      { label: 'Cursor position recorded', color: 'bg-amber-400', text: 'text-amber-400' },
                      { label: 'Session integrity enforced', color: 'bg-emerald-400', text: 'text-emerald-400' },
                    ].map(({ label, color, text }) => (
                      <div key={label} className="flex items-center gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
                        <span className={`text-[10px] font-medium ${text}`}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Agreement + Start */}
              <div
                className="rounded-2xl border border-white/8 overflow-hidden shadow-[0_4px_40px_rgba(0,0,0,0.6)]"
                style={{ background: 'linear-gradient(160deg, rgba(15,23,42,0.9) 0%, rgba(7,4,32,0.95) 100%)' }}
              >
                <div className="p-5 space-y-4">
                  {/* Agreement */}
                  <div
                    onClick={() => setUnderstandAgreed((prev) => !prev)}
                    className="flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-300"
                    style={{
                      borderColor: understandAgreed ? 'rgba(6,182,212,0.45)' : 'rgba(255,255,255,0.08)',
                      background: understandAgreed
                        ? 'linear-gradient(135deg, rgba(6,182,212,0.09) 0%, rgba(59,130,246,0.07) 100%)'
                        : 'rgba(255,255,255,0.025)',
                      boxShadow: understandAgreed ? '0 0 25px rgba(6,182,212,0.12)' : 'none',
                    }}
                  >
                    <Checkbox
                      id="understand-terms"
                      checked={understandAgreed}
                      onCheckedChange={(val) => setUnderstandAgreed(!!val)}
                      className="mt-0.5 flex-shrink-0 border-slate-600 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                    />
                    <div className="space-y-1 select-none">
                      <label htmlFor="understand-terms" className="text-xs font-bold text-slate-100 cursor-pointer block">
                        I Understand &amp; Agree
                      </label>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        I acknowledge that my behavior, screen, and browser state will be monitored and logged by ProctorTab throughout this session.
                      </p>
                    </div>
                  </div>

                  {/* Start Button */}
                  <button
                    onClick={understandAgreed ? onStart : undefined}
                    disabled={!understandAgreed}
                    className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 ${
                      understandAgreed
                        ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.99]'
                        : 'cursor-not-allowed opacity-35'
                    }`}
                    style={
                      understandAgreed
                        ? {
                            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                            boxShadow: '0 0 30px rgba(6,182,212,0.5), 0 4px 20px rgba(0,0,0,0.4)',
                            color: 'white',
                          }
                        : {
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: '#475569',
                          }
                    }
                  >
                    <span>Begin Assessment</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {!understandAgreed && (
                    <p className="text-[10px] text-center text-slate-600">
                      Agree to the terms above to unlock the assessment.
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </MotionBackground>
  );
};
