import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { MotionBackground } from '@/components/shared/MotionBackground';
import type { AttendanceLog } from '@/types/attendance';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { subscribeAttendanceLogs } from '@/utils/attendanceFirestore';
import { getTodayDateString } from '@/utils/attendanceFirestore';

// NOTE: This page aggregates attendance records across ALL enrolled courses.
// It preserves the existing attendance API/subscription (`subscribeAttendanceLogs`).

export function AttendanceAllCoursesPage() {
  const { sessions } = useSession();
  const { user } = useAuth();
  const studentId = resolveEnrollmentStudentId(user);

  const enrolledCourses = useMemo(() => {
    if (!studentId) return [];
    const sid = String(studentId);
    return sessions.filter(
      (s) => s.type === 'course' && (s.enrolledStudents ?? []).some((id) => String(id) === sid)
    );
  }, [sessions, studentId]);

  const today = getTodayDateString();

  // We keep one unified subscription that merges logs from each course.
  // To avoid re-subscribing on every render, we rely on course ids + studentId only.
  const courseIds = useMemo(() => enrolledCourses.map((c) => String(c.id)), [enrolledCourses]);

  return <AttendanceAllCoursesPageImpl studentId={studentId} today={today} courseIds={courseIds} enrolledCourses={enrolledCourses} />;
}


function AttendanceAllCoursesPageImpl({
  studentId,
  today,
  courseIds,
  enrolledCourses,
}: {
  studentId: string;
  today: string;
  courseIds: string[];
  enrolledCourses: any[];
}) {
  const [allLogs, setAllLogs] = useState<AttendanceLog[]>([]);


  useEffect(() => {
    if (!studentId) return;

    const unsubscribers: Array<() => void> = [];
    const merged: AttendanceLog[] = [];

    const pushAndUpdate = () => {
      // De-dupe by log.id
      const map = new Map<string, AttendanceLog>();
      for (const l of merged) map.set(String(l.id), l);
      setAllLogs(Array.from(map.values()));
    };

    merged.length = 0;
    setAllLogs([]);

    for (const cid of courseIds) {
      const unsub = subscribeAttendanceLogs(
        cid,
        (logsFromCourse) => {
          // Replace course logs in merged array
          // Remove previous records for this course
          const courseName = enrolledCourses.find((c) => String(c.id) === String(cid))?.title ?? '';
          void courseName;
          for (let i = merged.length - 1; i >= 0; i--) {
            if (String(merged[i].courseId) === String(cid)) merged.splice(i, 1);
          }
          merged.push(...logsFromCourse);
          pushAndUpdate();
        },
        () => toast.error('Could not load attendance records.')
      );
      unsubscribers.push(unsub);
    }

    return () => {
      unsubscribers.forEach((u) => u && u());
    };
  }, [studentId, courseIds.join('|')]);

  const todays = useMemo(() => allLogs.filter((l) => l.date === today && String(l.studentId) === String(studentId)), [allLogs, today, studentId]);

  const totalCount = todays.length;
  const presentCount = todays.filter((l) => l.status === 'present').length;
  const lateCount = todays.filter((l) => l.status === 'late').length;
  const absentCount = Math.max(0, enrolledCourses.reduce((acc, c) => acc + (c.enrolledStudents?.length ?? 0), 0) - totalCount);

  return (
    <MotionBackground>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Attendance</h2>
            <p className="text-sm text-muted-foreground">All attendance records across your enrolled courses.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 px-3 py-1.5 text-sm">Present today: {presentCount}</Badge>
            <Badge variant="outline" className="px-3 py-1.5 text-xs text-slate-300 border-slate-700 bg-slate-900/30">Late today: {lateCount}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-center">
            <Badge variant="outline" className="bg-transparent">Total Records</Badge>
            <div className="text-2xl font-semibold text-white mt-2">{totalCount}</div>
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-center">
            <Badge className="bg-green-900/20 text-green-300 border border-green-800/30">Present</Badge>
            <div className="text-2xl font-semibold text-white mt-2">{presentCount}</div>
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-center">
            <Badge className="bg-yellow-900/20 text-yellow-300 border border-yellow-800/30">Late</Badge>
            <div className="text-2xl font-semibold text-white mt-2">{lateCount}</div>
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-center">
            <Badge className="bg-red-900/20 text-red-300 border border-red-800/30">Absent</Badge>
            <div className="text-2xl font-semibold text-white mt-2">{absentCount}</div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today&apos;s attendance</CardTitle>
            <CardDescription>Live data aggregated from all enrolled courses.</CardDescription>
          </CardHeader>
          <CardContent>
            {todays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance records yet for today.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todays
                    .slice()
                    .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
                    .map((log) => {
                      const courseTitle =
                        enrolledCourses.find((c) => String(c.id) === String(log.courseId))?.title ?? log.courseName ?? String(log.courseId);
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">{courseTitle}</TableCell>
                          <TableCell>{log.time || '—'}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                log.status === 'present'
                                  ? 'bg-green-100 text-green-800 border-green-200'
                                  : log.status === 'late'
                                    ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                                    : 'bg-red-100 text-red-800 border-red-200'
                              }
                              variant="outline"
                            >
                              {String(log.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MotionBackground>
  );
}

