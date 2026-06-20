import { WifiOff, Wifi, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface ConnectionStatusIndicatorProps {
  isOnline: boolean;
  showCompensationMessage: boolean;
  compensationSeconds: number;
  onDismiss: () => void;
}

export const ConnectionStatusIndicator = ({
  isOnline,
  showCompensationMessage,
  compensationSeconds,
  onDismiss,
}: ConnectionStatusIndicatorProps) => {
  const minutes = Math.floor(compensationSeconds / 60);
  const seconds = compensationSeconds % 60;
  const timeString =
    minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <>
      {/* Disconnection Warning Banner */}
      {!isOnline && (
        <Alert
          className={cn(
            'mb-4 border-orange-500 bg-orange-50 text-orange-900',
            'dark:bg-orange-950 dark:text-orange-50'
          )}
        >
          <WifiOff className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertTitle>Internet Connection Lost</AlertTitle>
          <AlertDescription>
            Your assessment timer will continue running. The time lost due to no internet
            connection will be restored once you reconnect.
          </AlertDescription>
        </Alert>
      )}

      {/* Compensation Success Message */}
      {showCompensationMessage && isOnline && (
        <Alert
          className={cn(
            'mb-4 border-green-500 bg-green-50 text-green-900',
            'dark:bg-green-950 dark:text-green-50'
          )}
          onAnimationEnd={() => {
            setTimeout(onDismiss, 3000);
          }}
        >
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle>Connection Restored</AlertTitle>
          <AlertDescription>
            Welcome back! <strong>{timeString}</strong> has been restored to your assessment time
            due to connection loss.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
