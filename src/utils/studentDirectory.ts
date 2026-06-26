import { auth } from '@/firebase';

/**
 * Stable id used in course enrollments and Firestore `student_profiles` docs.
 * Matches login (uid/email) and join flow so roster and profile stay aligned.
 */
export function getCurrentStudentDirectoryId(): string {
  if (auth.currentUser) {
    return auth.currentUser.uid;
  }
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (u?.uid) return String(u.uid);
    if (u?.email) return String(u.email);
  } catch {
    /* ignore */
  }
  const fallback = localStorage.getItem("student_id");
  return fallback ? String(fallback) : "";
}

/** Firestore document id — avoid slashes only (emails/uid are fine). */
export function studentProfileDocId(enrolledId: string): string {
  return String(enrolledId || "").replace(/\//g, "_");
}
