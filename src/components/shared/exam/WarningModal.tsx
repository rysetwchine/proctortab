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

  // Custom modal (fixed + centered) to ensure it ALWAYS shows,
  // even in fullscreen or when Radix dialogs fail to render.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" />

      <div className="relative w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg border-t-4 border-t-destructive">
        <div className="flex flex-col space-y-4 text-center">
          <div className="flex items-center justify-center">
            <AlertTriangle className="w-16 h-16 text-destructive" />
          </div>

          <h2 className="text-2xl font-semibold text-destructive">{title}</h2>

          {message?.trim?.() ? (
            <p className="text-base text-muted-foreground whitespace-pre-line">{message}</p>
          ) : null}

          <div className="pt-2">
            <Button onClick={onClose} className="w-full bg-accent hover:bg-accent/90">
              I Understand
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
