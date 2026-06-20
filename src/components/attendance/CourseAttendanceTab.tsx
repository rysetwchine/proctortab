import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import type { AttendanceLog } from '@/types/attendance';
import { getTodayDateString, subscribeAttendanceLogs } from '@/utils/attendanceFirestore';
import { PhoneScannerSessionPanel } from '@/components/attendance/PhoneScannerSessionPanel';

interface CourseAttendanceTabProps {
  courseId: string;
  courseName: string;
  enrolledStudentIds: string[];
}

export function CourseAttendanceTab({
  courseId,
  courseName,
  enrolledStudentIds,
}: CourseAttendanceTabProps) {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);

  const today = getTodayDateString();

  const todayLogs = useMemo(
    () => logs.filter((log) => log.date === today),
    [logs, today]
  );

  useEffect(() => {
    const unsubscribe = subscribeAttendanceLogs(
      courseId,
      setLogs,
      () => toast.error('Could not load attendance records.')
    );
    return unsubscribe;
  }, [courseId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Attendance</h2>
          <p className="text-sm text-muted-foreground">
            Use the attendance scanner link on your laptop/PC. This dashboard updates in realtime.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1 px-3 py-1.5 text-sm">
          <Users className="h-4 w-4" />
          Present today: {todayLogs.length}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PhoneScannerSessionPanel
          courseId={courseId}
          courseName={courseName}
          enrolledStudentIds={enrolledStudentIds}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today&apos;s attendance</CardTitle>
            <CardDescription>
              Live updates for {today} · {courseName}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {todayLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students checked in yet today.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Student #</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.name}</TableCell>
                      <TableCell>{log.studentNumber}</TableCell>
                      <TableCell>{log.time}</TableCell>
                      <TableCell>
                        <Badge className="capitalize">{log.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
