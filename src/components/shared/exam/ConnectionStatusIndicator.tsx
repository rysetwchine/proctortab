import { useEffect, useState } from 'react';
import { WifiOff, Wifi, Clock, CheckCircle2, RefreshCw } from 'lucide-react';

interface ConnectionStatusIndicatorProps {
  isOnline: boolean;
  showCompensationMessage: boolean;
  compensationSeconds: number;
  liveOfflineDuration?: number;
  onDismiss: () => void;
}

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const ConnectionStatusIndicator = ({
  isOnline,
  showCompensationMessage,
  compensationSeconds,
  liveOfflineDuration = 0,
  onDismiss,
}: ConnectionStatusIndicatorProps) => {
  const [showSuccess, setShowSuccess] = useState(false);

  // Auto-dismiss the reconnected banner after 5 seconds
  useEffect(() => {
    if (showCompensationMessage && isOnline) {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        setShowSuccess(false);
        onDismiss();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showCompensationMessage, isOnline, onDismiss]);

  return (
    <>
      {/* ═══════════════════════════════════════════════════════
          FULL-SCREEN OFFLINE OVERLAY
          Blocks exam interaction while disconnected
      ═══════════════════════════════════════════════════════ */}
      {!isOnline && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6 animate-in fade-in duration-300"
          style={{
            background: 'rgba(4, 2, 18, 0.96)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {/* Animated background pulse rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-96 h-96 rounded-full border border-orange-500/10 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute w-72 h-72 rounded-full border border-orange-500/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
            <div className="absolute w-48 h-48 rounded-full border border-orange-500/20 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.6s' }} />
          </div>

          <div
            className="relative max-w-md w-full rounded-2xl border border-orange-500/30 overflow-hidden shadow-[0_0_80px_rgba(249,115,22,0.15)] animate-in zoom-in-95 duration-300"
            style={{ background: 'linear-gradient(160deg, rgba(15,10,30,0.95) 0%, rgba(7,4,20,0.98) 100%)' }}
          >
            {/* Top accent line */}
            <div className="h-px bg-gradient-to-r from-transparent via-orange-500/80 to-transparent" />

            <div className="p-8 text-center space-y-6">
              {/* Icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-xl scale-150 animate-pulse" />
                  <div className="relative w-20 h-20 rounded-full border-2 border-orange-500/40 bg-orange-500/10 flex items-center justify-center">
                    <WifiOff className="w-9 h-9 text-orange-400" />
                  </div>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <h2 className="text-xl font-black text-white tracking-tight">
                  Connection Lost
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Your internet connection has been interrupted. The exam timer has been
                  <span className="text-orange-400 font-semibold"> paused</span> and will resume once you reconnect.
                </p>
              </div>

              {/* Live disconnection timer */}
              <div
                className="rounded-xl border border-orange-500/25 p-4 space-y-2"
                style={{ background: 'rgba(249,115,22,0.06)' }}
              >
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500 uppercase tracking-widest font-bold">
                  <Clock className="w-3.5 h-3.5 text-orange-400" />
                  Time Offline
                </div>
                <div className="text-4xl font-black text-orange-400 font-mono tracking-wider">
                  {formatDuration(liveOfflineDuration)}
                </div>
                <p className="text-[10px] text-slate-500">
                  This exact duration will be added back to your exam timer upon reconnection.
                </p>
              </div>

              {/* Reconnecting indicator */}
              <div className="flex items-center justify-center gap-2.5 text-xs text-slate-400">
                <RefreshCw className="w-3.5 h-3.5 text-orange-400 animate-spin" />
                <span>Attempting to reconnect automatically…</span>
              </div>

              {/* Info boxes */}
              <div className="grid grid-cols-2 gap-2.5 text-left">
                {[
                  { title: 'Timer Paused', desc: 'No exam time is being consumed while offline.' },
                  { title: 'Auto Restore', desc: 'Your full offline duration will be compensated.' },
                  { title: 'Progress Saved', desc: 'All answered questions are saved locally.' },
                  { title: 'No Violation', desc: 'Connection loss is not counted as cheating.' },
                ].map(({ title, desc }) => (
                  <div
                    key={title}
                    className="rounded-xl border border-white/6 p-3"
                    style={{ background: 'rgba(255,255,255,0.025)' }}
                  >
                    <p className="text-[10px] font-bold text-slate-300 mb-0.5">{title}</p>
                    <p className="text-[9px] text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom accent line */}
            <div className="h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          RECONNECTED SUCCESS TOAST (top banner)
      ═══════════════════════════════════════════════════════ */}
      {showSuccess && isOnline && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] animate-in slide-in-from-top-4 duration-400 w-full max-w-md px-4">
          <div
            className="rounded-2xl border border-emerald-500/35 p-4 shadow-[0_0_40px_rgba(16,185,129,0.2)] flex items-start gap-3"
            style={{ background: 'linear-gradient(135deg, rgba(6,30,20,0.97) 0%, rgba(7,4,20,0.97) 100%)' }}
          >
            {/* Top shimmer */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent rounded-t-2xl" />

            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-sm font-bold text-emerald-300">Connection Restored</p>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Welcome back!{' '}
                <span className="text-emerald-400 font-bold">{formatDuration(compensationSeconds)}</span>{' '}
                has been added back to your exam timer to compensate for the connection loss.
              </p>
              {/* Progress bar auto-dismiss */}
              <div className="mt-2.5 h-1 rounded-full overflow-hidden bg-slate-800/60">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                  style={{
                    animation: 'shrink-progress 5s linear forwards',
                    width: '100%',
                  }}
                />
              </div>
            </div>
          </div>
          <style>{`
            @keyframes shrink-progress {
              from { width: 100%; }
              to { width: 0%; }
            }
          `}</style>
        </div>
      )}
    </>
  );
};
