import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { syncStudentProfileToFirestore } from '@/utils/syncStudentProfileFirestore';
import { LogIn, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface JoinSessionFormProps {
  /** Tighter layout when embedded on the student dashboard */
  compact?: boolean;
  /** Switch app tab after joining a course (e.g. open My Courses). */
  onNavigate?: (tab: string) => void;
}

export const JoinSessionForm = ({ compact, onNavigate }: JoinSessionFormProps) => {
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { joinSession } = useSession();
  const { user } = useAuth();

  const handleJoinSession = async () => {
    try {
      if (!joinCode.trim()) {
        setMessage({ type: 'error', text: 'Please enter a join code' });
        return;
      }

      const studentId = resolveEnrollmentStudentId(user);
      localStorage.setItem('student_id', studentId);
      console.log('TRYING JOIN:', joinCode);

      const cleanCode = joinCode.trim().replace(/[-\s]/g, '').toUpperCase();

      // Show loading state
      setMessage({ type: 'success', text: 'Joining session...' });

      const session = await joinSession(cleanCode, studentId);

      console.log('SESSION RESULT:', session);

      if (!session) {
        setMessage({ type: 'error', text: 'Invalid join code. Please check and try again.' });
        return;
      }

      setMessage({
        type: 'success',
        text: 'Successfully Joined Academic Session',
      });

      if (session.type !== 'course') {
        localStorage.setItem(
          'activeExam',
          JSON.stringify({
            id: session.id,
            title: session.title,
            code: session.joinCode,
          })
        );
      }

      try {
        const prof = JSON.parse(localStorage.getItem('userProfile') || '{}');
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        await syncStudentProfileToFirestore(
          {
            name: prof.name || u.name || '',
            studentNumber: prof.studentNumber || '',
            email: prof.email || u.email || '',
            course: prof.course || '',
            year: prof.year || '',
          },
          studentId
        );
      } catch (e) {
        console.warn('Could not sync student profile to cloud (check Firestore rules):', e);
      }

      setJoinCode('');

      setTimeout(() => {
        if (session.type === 'course') {
          onNavigate?.('my-courses');
          window.location.hash = `course=${session.id}`;
        } else {
          window.location.hash = `exam=${session.id}`;
        }
      }, 200);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Something went wrong' });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleJoinSession();
    }
  };

  return (
    <div className={cn('w-full flex flex-col min-h-0', compact ? 'h-auto' : 'h-full')}>
      <Card
        className={cn(
          'border-0 shadow-md overflow-hidden rounded-xl flex flex-col bg-gradient-to-br from-green-500 to-[#20bb5a] text-white ring-1 ring-black/5',
          compact ? 'min-h-0' : 'h-full'
        )}
      >
        <CardContent
          className={cn('flex flex-col flex-1', compact ? 'gap-3 p-4 sm:p-4' : 'gap-5 p-6 sm:p-7')}
        >
          <div className={cn(compact ? 'space-y-0.5' : 'space-y-1')}>
            <h3
              className={cn(
                'font-bold tracking-tight flex items-center gap-2',
                compact ? 'text-lg' : 'text-xl'
              )}
            >
              <LogIn className={cn('shrink-0 opacity-95', compact ? 'w-4 h-4' : 'w-5 h-5')} />
              Join session
            </h3>
            <p className={cn('text-white/90 leading-relaxed', compact ? 'text-xs' : 'text-sm')}>
              Enter the join code provided by your professor
            </p>
          </div>

          <div className={cn(compact ? 'space-y-2' : 'space-y-3')}>
            <Input
              placeholder="Enter join code"
              value={joinCode}
              onChange={(e) => {
                // Auto-format with dash: JGBQ2L -> JGB-Q2L
                let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (value.length > 3) {
                  value = value.slice(0, 3) + '-' + value.slice(3);
                }
                if (value.length > 7) {
                  value = value.slice(0, 7);
                }
                setJoinCode(value);
                setMessage(null);
              }}
              onKeyDown={handleKeyPress}
              className={cn(
                'w-full font-mono bg-white text-foreground border-0 shadow-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-white/80',
                compact ? 'h-9 text-sm' : 'h-11 text-base'
              )}
              maxLength={7}
              aria-label="Join code"
            />
            <Button
              type="button"
              onClick={handleJoinSession}
              className={cn(
                'w-full gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-sm border-0',
                compact ? 'h-9' : 'h-11'
              )}
            >
              <LogIn className="w-4 h-4 shrink-0" />
              Join session
            </Button>
          </div>

          {message && (
            <Alert
              variant={message.type === 'success' ? 'default' : 'destructive'}
              className="bg-white/95 text-foreground border-0"
            >
              {message.type === 'success' ? (
                <CheckCircle className="h-4 w-4 text-emerald-700" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription className="text-foreground">{message.text}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
