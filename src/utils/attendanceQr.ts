import type { AttendanceQrPayload, StudentProfileQrFields } from '@/types/attendance';

const REQUIRED_QR_FIELDS: (keyof AttendanceQrPayload)[] = [
  'uid',
  'name',
  'studentNumber',
  'email',
  'course',
  'year',
  'generatedAt',
];

export function isProfileCompleteForQr(
  uid: string,
  profile: StudentProfileQrFields
): boolean {
  if (!uid.trim()) return false;
  return (
    profile.name.trim() !== '' &&
    profile.studentNumber.trim() !== '' &&
    profile.email.trim() !== '' &&
    profile.course.trim() !== '' &&
    profile.year.trim() !== ''
  );
}

export function getIncompleteProfileFields(
  uid: string,
  profile: StudentProfileQrFields
): string[] {
  const missing: string[] = [];
  if (!uid.trim()) missing.push('Account ID (sign in again)');
  if (!profile.name.trim()) missing.push('Name');
  if (!profile.studentNumber.trim()) missing.push('Student Number');
  if (!profile.email.trim()) missing.push('Email');
  if (!profile.course.trim()) missing.push('Course');
  if (!profile.year.trim()) missing.push('Year');
  return missing;
}

export function buildAttendanceQrPayload(
  uid: string,
  profile: StudentProfileQrFields
): AttendanceQrPayload {
  return {
    uid: uid.trim(),
    name: profile.name.trim(),
    studentNumber: profile.studentNumber.trim(),
    email: profile.email.trim(),
    course: profile.course.trim(),
    year: profile.year.trim(),
    generatedAt: new Date().toISOString(),
  };
}

export function serializeAttendanceQrPayload(payload: AttendanceQrPayload): string {
  return JSON.stringify(payload);
}

export function parseAttendanceQr(text: string): AttendanceQrPayload | null {
  try {
    const raw = JSON.parse(text) as Partial<AttendanceQrPayload>;
    for (const key of REQUIRED_QR_FIELDS) {
      const value = raw[key];
      if (typeof value !== 'string' || !value.trim()) return null;
    }
    return raw as AttendanceQrPayload;
  } catch {
    return null;
  }
}
