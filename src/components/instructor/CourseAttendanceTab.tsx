import { useEffect, useMemo, useState } from 'react';
import { Users, CheckCircle2, Clock, XCircle } from 'lucide-react';
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
import { PhoneScannerSessionPanel } from '@/components/instructor/PhoneScannerSessionPanel';
import { ScannerErrorBoundary } from '@/components/shared/ScannerErrorBoundary';
import type { AttendanceCalendarEvent } from '@/hooks/useAttendanceCalendar';
import { MotionBackground } from '@/components/shared/MotionBackground';
import { AttendanceEventDetailsDialog } from '@/components/student/AttendanceEventDetailsDialog';

interface CourseAttendanceTabProps {

  courseId: string;
  courseName: string;
  enrolledStudentIds: string[];
  // Optional: time string in "HH:MM" 24-hour format, e.g. "08:15"
  // Students who scan after this time are marked Late instead of Present.
  lateAfterTime?: string;
  // Optional: map of studentId -> student name for absent row display
  enrolledStudents?: { id: string; name: string; studentNumber?: string }[];
}

export function CourseAttendanceTab({
  courseId,
  courseName,
  enrolledStudentIds,
  lateAfterTime = '08:15',
  enrolledStudents = [],
}: CourseAttendanceTabProps) {
  const [selectedEvent, setSelectedEvent] = useState<AttendanceCalendarEvent | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  // Derive status for each scanned log:
  // If scan time is after lateAfterTime, override status to "late".
  const processedLogs = useMemo(() => {
    return todayLogs.map((log) => {
      let status = log.status as any;
      if (status === 'present' && log.time && lateAfterTime) {

        // log.time expected as "HH:MM" or "HH:MM:SS" (24h)
        const logTimeParts = log.time.split(':');
        const cutoffParts = lateAfterTime.split(':');
        const logMinutes =
          parseInt(logTimeParts[0] ?? '0', 10) * 60 + parseInt(logTimeParts[1] ?? '0', 10);
        const cutoffMinutes =
          parseInt(cutoffParts[0] ?? '0', 10) * 60 + parseInt(cutoffParts[1] ?? '0', 10);
        if (logMinutes > cutoffMinutes) status = 'late';
      }
      return { ...log, status };
    });
  }, [todayLogs, lateAfterTime]);

  // Build absent list: enrolled students who have NO log today
  const scannedStudentIds = useMemo(
    () => new Set(processedLogs.map((l) => l.studentId)),
    [processedLogs]
  );

  const absentRows = useMemo(() => {
    // Use enrolledStudents list if provided, otherwise fall back to IDs only
    if (enrolledStudents.length > 0) {
      return enrolledStudents.filter((s) => !scannedStudentIds.has(s.id));
    }
    return enrolledStudentIds
      .filter((id) => !scannedStudentIds.has(id))
      .map((id) => ({ id, name: id, studentNumber: undefined }));
  }, [enrolledStudents, enrolledStudentIds, scannedStudentIds]);

  const presentCount = processedLogs.filter((l) => l.status === 'present').length;
  const lateCount = processedLogs.filter((l) => l.status === 'late').length;
  const absentCount = absentRows.length;

  const openDetailsForLog = (event: AttendanceCalendarEvent) => {
    setSelectedEvent(event);
    setDetailsOpen(true);
  };

  const synthAbsentEvent = (absentStudent: { id: string; name: string; studentNumber?: string }): AttendanceCalendarEvent => {
    return {
      id: `absent-${absentStudent.id}-${today}`,
      studentId: absentStudent.id,
      studentNumber: absentStudent.studentNumber ?? '',
      name: absentStudent.name,
      email: '',
      course: courseId,
      courseName,
      courseId,
      year: '',
      date: today,
      time: '',
      timestamp: null as any,
      scannedByProfessor: '—',
      status: 'absent' as any,
    };
  };
  const totalCount = enrolledStudentIds.length;

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'late':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'absent':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return '';
    }
  };

  return (
    <MotionBackground>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Attendance</h2>
            <p className="text-sm text-muted-foreground">
              Use the attendance scanner link on your laptop/PC. This dashboard updates in realtime.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 px-3 py-1.5 text-sm">
              <Users className="h-4 w-4" />
              Present today: {presentCount}
            </Badge>
            <Badge variant="outline" className="px-3 py-1.5 text-xs text-slate-300 border-slate-700 bg-slate-900/30">
              DEV: courseId={courseId}
            </Badge>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-3 text-xs text-slate-300">
          <div className="font-semibold text-slate-200 mb-1">DEV realtime debug</div>
          <div>today={today} · logs={logs.length} · todayLogs={todayLogs.length} · processedTodayLogs={processedLogs.length}</div>
          <div className="mt-1">
            latest={processedLogs[0] ? `${processedLogs[0].name} ${processedLogs[0].studentNumber} ${processedLogs[0].time} ${processedLogs[0].status}` : '—'}
          </div>
        </div>

        {/* Summary stats */}
        {/* Required: Total Students, Present Today, Absent Today, Weekly Average */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-center">
            <Users className="mx-auto mb-2 h-5 w-5 text-blue-400 drop-shadow" />
            <div className="text-2xl font-semibold text-white">{totalCount}</div>
            <div className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Total Students</div>
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-green-400 drop-shadow" />
            <div className="text-2xl font-semibold text-white">{presentCount}</div>
            <div className="text-xs font-semibold text-green-300 uppercase tracking-wide">Present Today</div>
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-center">
            <XCircle className="mx-auto mb-2 h-5 w-5 text-red-400 drop-shadow" />
            <div className="text-2xl font-semibold text-white">{absentCount}</div>
            <div className="text-xs font-semibold text-red-300 uppercase tracking-wide">Absent Today</div>
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-center">
            <Clock className="mx-auto mb-2 h-5 w-5 text-violet-400 drop-shadow" />
            <div className="text-2xl font-semibold text-white">{(Math.round(((presentCount) / Math.max(1, totalCount)) * 1000) / 10)}%</div>
            <div className="text-xs font-semibold text-violet-300 uppercase tracking-wide">Weekly Average</div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT: Today table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Today&apos;s attendance</CardTitle>
              <CardDescription>
                Live updates for {today} · {courseName} · Late cut-off: {lateAfterTime}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {processedLogs.length === 0 && absentRows.length === 0 ? (
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
                    {/* Scanned students (present / late) */}
                    {processedLogs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="hover:bg-slate-900/30 cursor-pointer"
                        onClick={() =>
                          openDetailsForLog({
                            id: log.id,
                            studentId: log.studentId,
                            studentNumber: log.studentNumber,
                            name: log.name,
                            email: log.email,
                            course: log.course,
                            courseName: log.courseName || courseName,
                            courseId: courseId,
                            year: log.year,
                            date: log.date,
                            time: log.time,
                            timestamp: log.timestamp,
                            scannedByProfessor: log.scannedByProfessor,
                            status: log.status as any,
                          })
                        }
                      >
                        <TableCell className="font-medium py-4">{log.name}</TableCell>
                        <TableCell className="py-4">{log.studentNumber}</TableCell>
                        <TableCell className="py-4">{log.time}</TableCell>
                        <TableCell className="py-4">
                          <Badge
                            className={`capitalize border ${statusBadgeClass(log.status)}`}
                            variant="outline"
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Auto-absent: enrolled students with no scan */}
                    {absentRows.map((student) => (
                      <TableRow
                        key={`absent-${student.id}`}
                        className="opacity-60 hover:bg-slate-900/10 cursor-pointer"
                        onClick={() => openDetailsForLog(synthAbsentEvent(student))}
                      >
                        <TableCell className="font-medium py-4">{student.name}</TableCell>
                        <TableCell className="py-4">{student.studentNumber ?? '—'}</TableCell>
                        <TableCell className="py-4">—</TableCell>
                        <TableCell className="py-4">
                          <Badge
                            className={`capitalize border ${statusBadgeClass('absent')}`}
                            variant="outline"
                          >
                            Absent
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* RIGHT: Live scanner */}
          <ScannerErrorBoundary>
            <PhoneScannerSessionPanel
              courseId={courseId}
              courseName={courseName}
              enrolledStudentIds={enrolledStudentIds}
            />
          </ScannerErrorBoundary>
        </div>
      </div>
      <AttendanceEventDetailsDialog
        event={selectedEvent}
        isOpen={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setSelectedEvent(null);
        }}
      />
    </MotionBackground>
  );
}

