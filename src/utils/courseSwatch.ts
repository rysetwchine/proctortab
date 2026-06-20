/** Bottom accent bar on student course cards (assigned at course creation). */
export const COURSE_ACCENT_LINE_CLASSES = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
] as const;

export const COURSE_ACCENT_COUNT = COURSE_ACCENT_LINE_CLASSES.length;

function hashCourseIdToAccentIndex(courseId: string): number {
  let h = 0;
  const id = String(courseId);
  for (let i = 0; i < id.length; i++) {
    h = (h + id.charCodeAt(i) * (i + 1)) % 1009;
  }
  return h % COURSE_ACCENT_COUNT;
}

/** Next accent index to use when creating a new course (cycles for variety). */
export function nextCourseAccentIndex(existingCourseCount: number): number {
  return existingCourseCount % COURSE_ACCENT_COUNT;
}

export function resolveCourseAccentLineClass(course: {
  id: string;
  courseAccentIndex?: number;
}): string {
  const raw = course.courseAccentIndex;
  const idx =
    typeof raw === 'number' && raw >= 0 && raw < COURSE_ACCENT_COUNT
      ? raw
      : hashCourseIdToAccentIndex(course.id);
  return COURSE_ACCENT_LINE_CLASSES[idx];
}
