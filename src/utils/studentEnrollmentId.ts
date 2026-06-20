import type { User } from '@/types';
import { getCurrentStudentDirectoryId } from '@/utils/studentDirectory';

/**
 * One stable id for enrollments: Firebase uid/email from storage, else persisted student_id,
 * else AuthContext user, else a single generated id (never a new id per join).
 */
export function resolveEnrollmentStudentId(authUser: User | null): string {
  let id = getCurrentStudentDirectoryId();
  if (id) return String(id);

  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}') as { uid?: string; email?: string };
    if (u?.uid) return String(u.uid);
    if (u?.email) return String(u.email);
  } catch {
    /* ignore */
  }

  const persisted = localStorage.getItem('student_id');
  if (persisted) return String(persisted);

  if (authUser?.id) return String(authUser.id);

  const generated = `student_${Date.now()}`;
  localStorage.setItem('student_id', generated);
  return generated;
}
