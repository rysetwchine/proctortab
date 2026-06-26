import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Clock, BookOpen, User } from 'lucide-react';
import type { AttendanceCalendarEvent } from '@/hooks/useAttendanceCalendar';

interface AttendanceEventDetailsDialogProps {
  event: AttendanceCalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AttendanceEventDetailsDialog({
  event,
  isOpen,
  onClose,
}: AttendanceEventDetailsDialogProps) {
  if (!event) return null;

  const isPresent = event.status === 'present';
  const statusColor = isPresent
    ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/20'
    : 'bg-violet-500/15 text-violet-200 border-violet-400/20';
  const statusLabel = isPresent ? 'Present' : 'Absent';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md border border-slate-800/80 bg-[#070420]/90 backdrop-blur-xl text-slate-100 shadow-[0_0_50px_rgba(99,102,241,0.18)]">

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <CheckCircle2 className={`h-5 w-5 ${isPresent ? 'text-emerald-400' : 'text-violet-400'}`} />
            Attendance Details
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            {new Date(event.date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Course Name */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <BookOpen className="h-5 w-5 text-indigo-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Course</p>
                  <p className="text-lg font-semibold">{event.courseName || event.course || 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Professor */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-violet-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Scanned by</p>
                  <p className="text-lg font-semibold">{event.scannedByProfessor}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Time Scanned */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-blue-400 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Time Scanned</p>
                  <p className="text-lg font-semibold">{event.time}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-300">Status:</p>
            <Badge className={`${statusColor} border font-semibold`} variant="outline">
              {statusLabel}
            </Badge>
          </div>

          {/* Additional Info */}
          <div className="bg-slate-900/40 rounded-lg p-3 text-xs text-slate-300 border border-slate-800/60">
            <p>
              <strong>Student:</strong> {event.name} ({event.studentNumber})
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
