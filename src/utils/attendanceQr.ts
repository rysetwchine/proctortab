import type { AttendanceQrPayload, StudentProfileQrFields } from '@/types/attendance';

const REQUIRED_QR_FIELDS: (keyof AttendanceQrPayload)[] = [
  'uid',
  'name',
  'studentNumber',
  'email',
  'course',
  'program',
  'year',
  'systemIdentifier',
  'securityToken',
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

export function generateSecurityToken(uid: string, studentNumber: string, generatedAt: string): string {
  const salt = 'PROCTORTAB_SECURE_SALT_2026';
  const str = `${uid}:${studentNumber}:${generatedAt}:${salt}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `pt_tok_${Math.abs(hash).toString(16)}`;
}

export function buildAttendanceQrPayload(
  uid: string,
  profile: StudentProfileQrFields
): AttendanceQrPayload {
  const generatedAt = new Date().toISOString();
  const program = profile.program || (profile.course === 'BSIT' ? 'Bachelor of Science in Information Technology' : 'Academic Program');
  const securityToken = generateSecurityToken(uid.trim(), profile.studentNumber.trim(), generatedAt);

  return {
    uid: uid.trim(),
    name: profile.name.trim(),
    studentNumber: profile.studentNumber.trim(),
    email: profile.email.trim(),
    course: profile.course.trim(),
    program: program.trim(),
    year: profile.year.trim(),
    systemIdentifier: 'proctortab-attendance-system-v1',
    securityToken,
    generatedAt,
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

    // Verify system identifier
    if (raw.systemIdentifier !== 'proctortab-attendance-system-v1') {
      return null;
    }

    // Verify security token validity
    const expectedToken = generateSecurityToken(
      raw.uid || '',
      raw.studentNumber || '',
      raw.generatedAt || ''
    );
    if (raw.securityToken !== expectedToken) {
      console.warn('QR Code security token validation failed');
      return null;
    }

    return raw as AttendanceQrPayload;
  } catch {
    return null;
  }
}
