import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface WarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
}

export const WarningModal = ({
  isOpen,
  onClose,
  title = 'WARNING MESSAGE',
  message,
}: WarningModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" />

      <div className="relative w-full max-w-lg rounded-[2.5rem] border border-red-500/30 bg-slate-900/90 p-8 shadow-[0_0_50px_rgba(239,68,68,0.25)] text-white">
        <div className="flex flex-col space-y-6 text-center">
          <div className="flex items-center justify-center">
            <div className="p-4 bg-red-500/10 rounded-full border border-red-500/20 animate-pulse">
              <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
          </div>

          <h2 className="text-2xl font-black text-red-500 tracking-wider uppercase">{title}</h2>

          {message?.trim?.() ? (
            <p className="text-sm text-slate-300 leading-relaxed font-semibold whitespace-pre-line bg-slate-950/40 p-4 rounded-2xl border border-white/5">{message}</p>
          ) : null}

          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black rounded-xl shadow-[0_4px_20px_rgba(239,68,68,0.3)] transition-all transform hover:scale-[1.02] active:scale-[0.98] uppercase tracking-wider text-xs"
            >
              I Understand
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
