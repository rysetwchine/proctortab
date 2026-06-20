import { db } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Generates a unique student number in format: TA2024XXXXX
 * Where XXXXX is a 5-digit sequential number starting from 00001
 * The year portion (2024) updates automatically based on current year
 */
export async function generateUniqueStudentNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `TA${currentYear}`;

  // Query all users in Firestore to find the highest number for this year
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('studentNumber', '>=', `${prefix}00000`));
  const querySnapshot = await getDocs(q);

  let maxNumber = 0;

  // Find the highest sequential number for this year
  querySnapshot.forEach((doc) => {
    const studentNumber = doc.data().studentNumber as string | undefined;
    if (studentNumber && studentNumber.startsWith(prefix)) {
      const numberPart = parseInt(studentNumber.slice(prefix.length), 10);
      if (!isNaN(numberPart)) {
        maxNumber = Math.max(maxNumber, numberPart);
      }
    }
  });

  // Generate the next number
  const nextNumber = maxNumber + 1;
  const paddedNumber = String(nextNumber).padStart(5, '0');

  return `${prefix}${paddedNumber}`;
}

/**
 * Validates if a string is a valid student number format
 */
export function isValidStudentNumber(studentNumber: string): boolean {
  // Format: TA202400001 (TA + 4-digit year + 5-digit sequential number)
  const pattern = /^TA\d{4}\d{5}$/;
  return pattern.test(studentNumber);
}
