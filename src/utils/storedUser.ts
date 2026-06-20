export type StoredAuthUser = {
  uid?: string;
  name?: string;
  email?: string;
  role?: string;
};

export function readStoredUser(): StoredAuthUser {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}') as StoredAuthUser;
  } catch {
    return {};
  }
}

export function readUserProfile(): { name?: string } {
  try {
    return JSON.parse(localStorage.getItem('userProfile') || '{}') as { name?: string };
  } catch {
    return {};
  }
}

/** Display name for the logged-in professor (matches header / dashboard intent). */
export function getProfessorDisplayName(): string {
  const u = readStoredUser();
  const p = readUserProfile();
  const raw = (u.name || p.name || u.email || '').trim();
  return raw || 'Professor';
}

export function getCurrentOwnerUid(): string | undefined {
  const u = readStoredUser();
  return typeof u.uid === 'string' && u.uid.trim() ? u.uid.trim() : undefined;
}

/**
 * Instructor label stored on the course, with sensible fallbacks for legacy rows
 * and for the owning professor viewing their own course.
 */
export function resolveCourseInstructorName(course: {
  instructorName?: string;
  ownerUid?: string;
}): string {
  const n = course.instructorName?.trim();
  if (n) return n;
  const me = readStoredUser();
  const myUid = getCurrentOwnerUid();
  const isProf = String(me.role || '').toLowerCase() === 'professor';
  if (isProf && myUid && course.ownerUid === myUid) {
    return getProfessorDisplayName();
  }
  if (isProf && !course.ownerUid) {
    return getProfessorDisplayName();
  }
  return '—';
}
