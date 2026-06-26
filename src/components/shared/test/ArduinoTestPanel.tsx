import { useState, useEffect } from 'react';
import { useArduino } from '@/hooks/useArduino';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle, Zap } from 'lucide-react';

/**
 * Quick test component to verify Arduino connection and functionality
 * Add this to your dashboard for quick testing
 */
export const ArduinoTestPanel = () => {
  const { checkStatus, triggerCheatingAlarm, setStatusNormal, setStatusWarning, isConnected, isLoading, error } = useArduino();
  const [connectionChecked, setConnectionChecked] = useState(false);

  useEffect(() => {
    // Auto-check connection on mount
    checkStatus().then(() => setConnectionChecked(true));
  }, [checkStatus]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Arduino System Test
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2 p-3 bg-gray-100 rounded">
          {isConnected ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-semibold text-green-600">✅ Connected</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="font-semibold text-red-600">❌ Not Connected</span>
            </>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-100 border border-red-300 rounded text-sm text-red-700">
            ⚠️ Error: {error}
          </div>
        )}

        {/* Test Buttons */}
        <div className="space-y-2">
          <Button
            onClick={() => checkStatus()}
            disabled={isLoading}
            className="w-full"
            variant="outline"
          >
            {isLoading ? '🔄 Checking...' : '🔍 Check Connection'}
          </Button>

          <Button
            onClick={() => triggerCheatingAlarm(3)}
            disabled={isLoading || !isConnected}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {isLoading ? '⏳ Triggering...' : '🚨 Test Alarm (3s)'}
          </Button>

          <Button
            onClick={() => setStatusNormal()}
            disabled={isLoading || !isConnected}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {isLoading ? '⏳ Setting...' : '🟢 Green Light'}
          </Button>

          <Button
            onClick={() => setStatusWarning()}
            disabled={isLoading || !isConnected}
            className="w-full bg-yellow-600 hover:bg-yellow-700"
          >
            {isLoading ? '⏳ Setting...' : '🟡 Yellow Light'}
          </Button>
        </div>

        {/* Instructions */}
        <div className="text-xs text-gray-600 p-2 bg-gray-50 rounded">
          <p className="font-semibold mb-1">📖 Setup:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Make sure Arduino is connected via USB</li>
            <li>Run `node server.js` in terminal</li>
            <li>Press "Check Connection"</li>
            <li>Try "Test Alarm"</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
