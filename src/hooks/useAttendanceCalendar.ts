import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/firebase';
import type { AttendanceLog } from '@/types/attendance';

export interface AttendanceCalendarEvent extends AttendanceLog {
  courseId: string;
}

/**
 * Hook to fetch attendance records for a specific student
 * Subscribes to realtime updates from Firestore attendance_logs collection
 */
export function useAttendanceCalendar(studentId: string | undefined) {
  const [attendanceEvents, setAttendanceEvents] = useState<AttendanceCalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!studentId) {
      setAttendanceEvents([]);
      setIsLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe | undefined;

    const setupListener = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const q = query(
          collection(db, 'attendance_logs'),
          where('studentId', '==', String(studentId))
        );

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const events: AttendanceCalendarEvent[] = snapshot.docs.map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                studentId: String(data.studentId ?? ''),
                studentNumber: String(data.studentNumber ?? ''),
                name: String(data.name ?? ''),
                email: String(data.email ?? ''),
                course: String(data.course ?? ''),
                courseName: String(data.courseName ?? data.course ?? ''),
                courseId: String(data.courseId ?? ''),
                year: String(data.year ?? ''),
                date: String(data.date ?? ''),
                time: String(data.time ?? ''),
                timestamp: data.timestamp,
                scannedByProfessor: String(data.scannedByProfessor ?? ''),
                status: data.status || 'present',
              };
            });

            setAttendanceEvents(events);
            setIsLoading(false);
          },
          (err) => {
            console.error('Error loading attendance calendar:', err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
            setIsLoading(false);
          }
        );
      } catch (err) {
        console.error('Failed to setup attendance calendar listener:', err);
        setError(err instanceof Error ? err : new Error('Setup failed'));
        setIsLoading(false);
      }
    };

    setupListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [studentId]);

  return { attendanceEvents, isLoading, error };
}

/**
 * Get attendance events for a specific date
 */
export function getAttendanceForDate(
  events: AttendanceCalendarEvent[],
  date: Date
): AttendanceCalendarEvent[] {
  const dateStr = formatDateForComparison(date);
  return events.filter((event) => event.date === dateStr);
}

/**
 * Format date to match Firestore date format (YYYY-MM-DD)
 */
export function formatDateForComparison(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse date string (YYYY-MM-DD) to Date object
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get all attendance dates in a month
 */
export function getAttendanceDatesInMonth(
  events: AttendanceCalendarEvent[],
  year: number,
  month: number
): Map<number, AttendanceCalendarEvent[]> {
  const dateMap = new Map<number, AttendanceCalendarEvent[]>();

  events.forEach((event) => {
    const date = parseDateString(event.date);
    if (date.getFullYear() === year && date.getMonth() === month - 1) {
      const day = date.getDate();
      if (!dateMap.has(day)) {
        dateMap.set(day, []);
      }
      dateMap.get(day)?.push(event);
    }
  });

  return dateMap;
}
