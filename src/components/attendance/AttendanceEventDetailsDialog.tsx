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

  const statusColor = event.status === 'present' ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900';
  const statusLabel = event.status === 'present' ? 'Present' : 'Absent';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Attendance Details
          </DialogTitle>
          <DialogDescription>
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
                <BookOpen className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
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
                <User className="h-5 w-5 text-purple-600 mt-1 flex-shrink-0" />
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
                <Clock className="h-5 w-5 text-orange-600 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Time Scanned</p>
                  <p className="text-lg font-semibold">{event.time}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">Status:</p>
            <Badge className={`${statusColor} border-0 font-semibold`}>
              {statusLabel}
            </Badge>
          </div>

          {/* Additional Info */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
            <p>
              <strong>Student:</strong> {event.name} ({event.studentNumber})
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
