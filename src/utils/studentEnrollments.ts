/**
 * Student enrollment persistence (student-side only).
 *
 * Problem this solves:
 * - A student can "join" a course in UI, but after refresh/logout the course card can disappear
 *   if the course roster state wasn't persisted yet or the student id used for filtering changes.
 *
 * Approach:
 * - Persist the list of joined courseIds per-student in localStorage.
 * - Student UI treats a course as "joined" if:
 *    1) course.enrolledStudents includes studentId (normal roster), OR
 *    2) course.id exists in this persisted list (student-side fallback).
 *
 * This does NOT modify professor-side behavior or data models.
 */

const STORAGE_KEY_PREFIX = 'proctortab_student_enrollments_v1:';

function key(studentId: string): string {
  return `${STORAGE_KEY_PREFIX}${String(studentId || '').trim()}`;
}

export function getStudentEnrollmentCourseIds(studentId: string): string[] {
  if (!studentId) return [];
  try {
    const raw = localStorage.getItem(key(studentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String);
  } catch {
    return [];
  }
}

export function isStudentEnrolledLocally(studentId: string, courseId: string): boolean {
  if (!studentId || !courseId) return false;
  return getStudentEnrollmentCourseIds(studentId).includes(String(courseId));
}

export function addStudentEnrollment(studentId: string, courseId: string): void {
  if (!studentId || !courseId) return;
  const sid = String(studentId);
  const cid = String(courseId);
  const existing = new Set(getStudentEnrollmentCourseIds(sid));
  existing.add(cid);
  try {
    localStorage.setItem(key(sid), JSON.stringify(Array.from(existing)));
  } catch {
    // ignore quota / privacy mode
  }
}

export function removeStudentEnrollment(studentId: string, courseId: string): void {
  if (!studentId || !courseId) return;
  const sid = String(studentId);
  const cid = String(courseId);
  const existing = new Set(getStudentEnrollmentCourseIds(sid));
  existing.delete(cid);
  try {
    localStorage.setItem(key(sid), JSON.stringify(Array.from(existing)));
  } catch {
    // ignore
  }
}

