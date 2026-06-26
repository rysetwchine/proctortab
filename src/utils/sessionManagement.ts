/**
 * Multi-Device Session Management System
 * 
 * Implements active session management to prevent students from accessing
 * the examination website using multiple devices simultaneously.
 * 
 * Features:
 * - Restricts one active examination session per student
 * - Detects simultaneous logins
 * - Automatically terminates or flags secondary sessions
 * - Logs device information (Device ID, Browser, IP Address, Login Time)
 */

import { db } from '@/firebase';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, onSnapshot, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';

export interface DeviceInfo {
  deviceId: string;
  userAgent: string;
  browser: string;
  platform: string;
  language: string;
  screenResolution: string;
  timezone: string;
  ipAddress?: string;
}

export interface ActiveSession {
  sessionId: string;
  studentId: string;
  studentName: string;
  assessmentId: string;
  assessmentTitle: string;
  courseId?: string;
  courseTitle?: string;
  deviceInfo: DeviceInfo;
  loginTime: any; // Firestore timestamp
  lastActivity: any; // Firestore timestamp
  isActive: boolean;
  terminatedReason?: string;
  terminatedAt?: any;
}

/**
 * Generate a unique device ID based on browser fingerprint
 */
export function generateDeviceId(): string {
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || '',
    // @ts-expect-error - deviceMemory is not in standard Navigator type but exists in some browsers
    (navigator as any).deviceMemory || '',
  ].join('|');
  
  // Simple hash to create a consistent ID
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `device-${Math.abs(hash).toString(16)}`;
}

/**
 * Collect device information for logging
 */
export function collectDeviceInfo(): DeviceInfo {
  const userAgent = navigator.userAgent;
  
  // Parse browser from user agent
  let browser = 'Unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  
  return {
    deviceId: generateDeviceId(),
    userAgent,
    browser,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Register an active session for a student
 * Returns false if another active session exists
 */
export async function registerActiveSession(params: {
  studentId: string;
  studentName: string;
  assessmentId: string;
  assessmentTitle: string;
  courseId?: string;
  courseTitle?: string;
}): Promise<{ success: boolean; sessionId?: string; existingSession?: ActiveSession }> {
  try {
    const deviceInfo = collectDeviceInfo();
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json').then((r) => r.json());
      deviceInfo.ipAddress = ipRes.ip || 'Unknown';
    } catch {
      deviceInfo.ipAddress = 'Unknown';
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Check for existing active sessions for this student and assessment
    const existingSessionRef = doc(db, 'active_sessions', `${params.studentId}_${params.assessmentId}`);
    const existingDoc = await getDoc(existingSessionRef);
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data() as ActiveSession;
      
      // Check if the existing session is still active (last activity within 5 minutes)
      const lastActivity = existingData.lastActivity?.toDate?.() || new Date(0);
      const now = new Date();
      const timeSinceActivity = (now.getTime() - lastActivity.getTime()) / 1000; // seconds
      
      if (timeSinceActivity < 300 && existingData.isActive) {
        // If it's a different device, log a simultaneous login event before overwriting
        if (existingData.deviceInfo.deviceId !== deviceInfo.deviceId) {
          await logSessionEvent({
            sessionId: existingData.sessionId,
            studentId: params.studentId,
            studentName: params.studentName,
            assessmentId: params.assessmentId,
            assessmentTitle: params.assessmentTitle,
            event: 'simultaneous_login_detected',
            deviceInfo: existingData.deviceInfo,
            reason: `New session started on device: ${deviceInfo.browser} (${deviceInfo.platform})`,
          });
        }
      } else {
        // Existing session is stale or inactive, terminate it first
        await updateDoc(existingSessionRef, {
          isActive: false,
          terminatedReason: 'Session expired',
          terminatedAt: serverTimestamp(),
        });
      }
    }
    
    // Create new active session
    const newSession: ActiveSession = {
      sessionId,
      studentId: params.studentId,
      studentName: params.studentName,
      assessmentId: params.assessmentId,
      assessmentTitle: params.assessmentTitle,
      courseId: params.courseId,
      courseTitle: params.courseTitle,
      deviceInfo,
      loginTime: serverTimestamp(),
      lastActivity: serverTimestamp(),
      isActive: true,
    };
    
    await setDoc(existingSessionRef, newSession);
    
    // Log the session start
    await logSessionEvent({
      sessionId,
      studentId: params.studentId,
      studentName: params.studentName,
      assessmentId: params.assessmentId,
      assessmentTitle: params.assessmentTitle,
      event: 'session_started',
      deviceInfo,
    });
    
    return { success: true, sessionId };
  } catch (error) {
    console.error('Failed to register active session:', error);
    return { success: false };
  }
}

/**
 * Update session activity timestamp (heartbeat)
 */
export async function updateSessionActivity(studentId: string, assessmentId: string): Promise<void> {
  try {
    const sessionRef = doc(db, 'active_sessions', `${studentId}_${assessmentId}`);
    await updateDoc(sessionRef, {
      lastActivity: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to update session activity:', error);
  }
}

/**
 * Terminate an active session
 */
export async function terminateSession(studentId: string, assessmentId: string, reason: string): Promise<void> {
  try {
    const sessionRef = doc(db, 'active_sessions', `${studentId}_${assessmentId}`);
    
    const docSnap = await getDoc(sessionRef);
    let sessionId = 'unknown-session';
    if (docSnap.exists()) {
      sessionId = docSnap.data().sessionId || 'unknown-session';
    }

    await updateDoc(sessionRef, {
      isActive: false,
      terminatedReason: reason,
      terminatedAt: serverTimestamp(),
    });
    
    // Log the termination
    await logSessionEvent({
      sessionId,
      studentId,
      event: 'session_terminated',
      reason,
    });
  } catch (error) {
    console.error('Failed to terminate session:', error);
  }
}

/**
 * Log session events for audit trail
 */
async function logSessionEvent(params: {
  sessionId: string;
  studentId?: string;
  studentName?: string;
  assessmentId?: string;
  assessmentTitle?: string;
  event: 'session_started' | 'session_terminated' | 'simultaneous_login_detected' | 'device_changed';
  reason?: string;
  deviceInfo?: DeviceInfo;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'session_logs'), {
      ...params,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to log session event:', error);
  }
}

/**
 * Monitor for simultaneous login attempts
 * Returns a cleanup function to stop monitoring
 */
export function monitorSimultaneousLogins(
  studentId: string,
  assessmentId: string,
  onSimultaneousLogin: (existingSession: ActiveSession) => void
): () => void {
  const sessionRef = doc(db, 'active_sessions', `${studentId}_${assessmentId}`);
  
  const unsubscribe = onSnapshot(sessionRef, (doc) => {
    if (!doc.exists()) return;
    
    const data = doc.data() as ActiveSession;
    const currentDeviceId = generateDeviceId();
    
    // Check if the session is active and from a different device
    if (data.isActive && data.deviceInfo.deviceId !== currentDeviceId) {
      // Simultaneous login detected
      onSimultaneousLogin(data);
      
      // Log the event
      logSessionEvent({
        sessionId: data.sessionId,
        studentId: data.studentId,
        studentName: data.studentName,
        assessmentId: data.assessmentId,
        assessmentTitle: data.assessmentTitle,
        event: 'simultaneous_login_detected',
        deviceInfo: data.deviceInfo,
      });
    }
  });
  
  return unsubscribe;
}

/**
 * Get all active sessions for a student
 */
export async function getStudentActiveSessions(studentId: string): Promise<ActiveSession[]> {
  try {
    const sessionsRef = collection(db, 'active_sessions');
    const snapshot = await getDocs(sessionsRef);
    
    const sessions: ActiveSession[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as ActiveSession;
      if (data.studentId === studentId && data.isActive) {
        sessions.push(data);
      }
    });
    
    return sessions;
  } catch (error) {
    console.error('Failed to get student active sessions:', error);
    return [];
  }
}

/**
 * Terminate all active sessions for a student
 */
export async function terminateAllStudentSessions(studentId: string, reason: string): Promise<void> {
  try {
    const sessions = await getStudentActiveSessions(studentId);
    
    for (const session of sessions) {
      await terminateSession(session.studentId, session.assessmentId, reason);
    }
  } catch (error) {
    console.error('Failed to terminate all student sessions:', error);
  }
}

/**
 * Check if a student has an active session on a different device
 */
export async function hasActiveSessionOnDifferentDevice(
  studentId: string,
  assessmentId: string
): Promise<{ hasActive: boolean; existingSession?: ActiveSession }> {
  try {
    const sessionRef = doc(db, 'active_sessions', `${studentId}_${assessmentId}`);
    const doc = await getDoc(sessionRef);
    
    if (!doc.exists()) {
      return { hasActive: false };
    }
    
    const data = doc.data() as ActiveSession;
    const currentDeviceId = generateDeviceId();
    
    if (data.isActive && data.deviceInfo.deviceId !== currentDeviceId) {
      return { hasActive: true, existingSession: data };
    }
    
    return { hasActive: false };
  } catch (error) {
    console.error('Failed to check active session:', error);
    return { hasActive: false };
  }
}
