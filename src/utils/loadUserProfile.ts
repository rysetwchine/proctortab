import { db } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  studentNumber: string;
  course: string;
  year: string;
  role: 'student' | 'professor';
  createdAt?: any;
};

/**
 * Loads the current user's complete profile from Firestore using their UID.
 * This is the source of truth for all user profile data.
 * 
 * IMPORTANT: Always call this function after login/register to get fresh data
 * instead of relying on cached localStorage data.
 */
export async function loadUserProfileFromFirestore(uid: string): Promise<UserProfile | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (!userDoc.exists()) {
      console.warn(`User document not found for UID: ${uid}`);
      return null;
    }
    const data = userDoc.data();
    return {
      uid: uid,
      name: data.name || '',
      email: data.email || '',
      studentNumber: data.studentNumber || '',
      course: data.course || '',
      year: data.year || '',
      role: data.role || 'student',
      createdAt: data.createdAt,
    };
  } catch (error) {
    console.error('Error loading user profile from Firestore:', error);
    return null;
  }
}

/**
 * Gets the currently authenticated user's profile.
 * First checks if user UID is available, then loads from Firestore.
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const uid = user?.uid;

  if (!uid) {
    console.warn('No authenticated user UID found');
    return null;
  }

  return loadUserProfileFromFirestore(uid);
}
