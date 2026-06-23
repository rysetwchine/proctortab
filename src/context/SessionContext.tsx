import { createContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { formatJoinCode, generateJoinCode } from '@/utils/codeGenerator';
import type { Question } from '@/types';
import { auth } from '@/firebase';
import { db } from '@/firebase';
import {
  arrayUnion,
  doc,
  getDocs,
  query,
  collection,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { syncModuleToFirestore, loadModulesFromFirestore } from '@/utils/moduleStorageService';
import {
  deleteCourseAssessmentFromFirestore,
  loadCourseAssessmentsFromFirestore,
  saveCourseAssessmentToFirestore,
} from '@/utils/courseExamFirestore';
import { addStudentEnrollment } from '@/utils/studentEnrollments';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';

// ============================================================================
// FIRESTORE COLLECTION STRUCTURE
// ============================================================================
// Firestore stores course modules with the following hierarchy:
//
//   courses/
//     {courseId}/
//       modules/
//         {moduleId}/
//           - id: string
//           - title: string
//           - displayName: string
//           - description: string
//           - week: number
//           - items: ModuleItem[]
//             - id: string
//             - title: string
//             - type: 'pdf' | 'video' | 'file' | 'docx' | 'txt' | 'pptx'
//             - fileName: string
//             - mimeType: string
//             - storageUrl: string (path in Firebase Storage)
//             - fileSize: number
//             - uploadStatus: 'pending' | 'uploaded' | 'failed'
//             - uploadedAt: Date
//           - contentSummary: string (auto-generated summary of module content)
//           - uploadedAt: Date (server timestamp)
//
// File contents are stored in Firebase Storage:
//   gs://bucket/courses/{courseId}/modules/{moduleId}/{fileName}
//
// Local storage (localStorage) serves as fallback when offline
// ============================================================================

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type AssessmentQuestionSource = 'default' | 'module' | 'generated';

export interface ModuleItem {
  id: string;
  title: string;
  type: 'pdf' | 'video' | 'file' | 'docx' | 'txt' | 'pptx';
  size?: string;
  duration?: string;
  fileName?: string;
  mimeType?: string;
  dataUrl?: string;
  /** Public/signed URL for in-app viewing (e.g., Firebase Storage download URL). */
  downloadUrl?: string;
  fileContent?: string;
  fileSize?: number;
  uploadStatus?: 'pending' | 'uploaded' | 'failed';
  uploadedAt?: Date;
  storageUrl?: string;
  // Metadata flags saved in Firestore to indicate content availability
  _hasExtractedContent?: boolean;
  _contentLength?: number;
  _metadata?: Record<string, any>;
}

export interface CourseModule {
  id: string;
  title: string;
  displayName?: string;
  description?: string;
  week: number;
  items: ModuleItem[];
  contentSummary?: string;
  uploadedAt?: Date;
}

export interface AssignmentSubmission {
  studentId: string;
  studentName: string;
  fileName: string;
  dataUrl: string;
  submittedAt: string;
}

export interface CourseAssignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  linkedLearningModuleItemId?: string;
  linkedLearningModuleTitle?: string;
  fileName?: string;
  mimeType?: string;
  dataUrl?: string;
  submissions?: AssignmentSubmission[];
}

export interface AssessmentSubmission {
  studentId: string;
  studentName: string;
  score: number | null;
  maxScore: number;
  submittedAt?: string;
}

/** @deprecated Legacy shape; prefer useGlobalDetectors + detectors. */
export interface ActiveExamDetectors {
  tabSwitch: boolean;
  copyPaste: boolean;
  fullscreenExit: boolean;
}

/** Stored on exam and mirrored to Firestore courses/{courseId}/exams/{examId}. */
export interface ExamDetectorsFirestore {
  copyPaste: boolean;
  tabSwitch: boolean;
  fullscreen: boolean;
  screenshot: boolean;
  alarm: boolean;
}

export interface CourseAssessment {
  id: string;
  title: string;
  duration: number;
  questions?: number;
  dueDate: string;
  assessmentType?: 'exam' | 'quiz';
  maxScore?: number;
  submissions?: AssessmentSubmission[];
  questionItems?: Question[];
  questionSource?: AssessmentQuestionSource;
  sourceModuleId?: string;
  sourceModuleTitle?: string;
  generatedTopic?: string;
  generatedDifficulty?: QuestionDifficulty;
  password?: string;
  maxAttempts?: number;
  randomizeQuestions?: boolean;
  randomizeChoices?: boolean;
  passingScore?: number;
  /** When true (default), global monitoring settings apply. When false, only `detectors` toggles apply. */
  useGlobalDetectors?: boolean;
  detectors?: ExamDetectorsFirestore;
  /** @deprecated */
  activeExamDetectors?: ActiveExamDetectors;
  /** When false, students cannot move to previous questions (linear exam). Default true. */
  allowQuestionNavigation?: boolean;
}

export interface CourseAnnouncement {
  id: number;
  text: string;
  date: string;
}

export type CourseAssessmentInput = {
  title: string;
  duration?: number;
  dueDate?: string;
  questions?: number;
  assessmentType?: 'exam' | 'quiz';
  maxScore?: number;
  submissions?: AssessmentSubmission[];
  questionItems?: Question[];
  questionSource?: AssessmentQuestionSource;
  sourceModuleId?: string;
  sourceModuleTitle?: string;
  generatedTopic?: string;
  generatedDifficulty?: QuestionDifficulty;
  password?: string;
  maxAttempts?: number;
  randomizeQuestions?: boolean;
  randomizeChoices?: boolean;
  passingScore?: number;
  useGlobalDetectors?: boolean;
  detectors?: ExamDetectorsFirestore;
  activeExamDetectors?: ActiveExamDetectors;
  allowQuestionNavigation?: boolean;
};

export type CourseExamLaunch = {
  courseId: string;
  courseTitle: string;
  assessment: CourseAssessment;
};

export interface Session {
  id: string;
  title: string;
  joinCode: string;
  type: 'exam' | 'activity' | 'course';
  status: 'active' | 'completed' | 'scheduled';
  createdAt: Date;
  enrolledStudents: string[];
  duration?: number;
  description?: string;
  /** Shown to students (e.g. professor name). */
  instructorName?: string;
  /** Firebase auth uid of the professor who created this course (local scope). */
  ownerUid?: string;
  modules?: CourseModule[];
  assessments?: CourseAssessment[];
  courseAssignments?: CourseAssignment[];
  announcements?: CourseAnnouncement[];
  /** Accent color index (0-based) chosen when the course is created; used on student course cards. */
  courseAccentIndex?: number;
}

interface SessionContextType {
  deleteSession: (courseId: string) => void;
  sessions: Session[];
  createSession: (session: Omit<Session, 'id' | 'joinCode' | 'createdAt'>) => Session;
  joinSession: (code: string, studentId: string) => Promise<Session | null>;
  getSessionByCode: (code: string) => Session | undefined;
  getActiveSession: () => Session | null;
  addModule: (courseId: string, module: Omit<CourseModule, 'id'>) => string | undefined;
  addModuleItem: (courseId: string, moduleId: string, item: Omit<ModuleItem, 'id'>) => void;
  removeCourseModule: (courseId: string, moduleId: string) => void;
  removeCourseModuleItem: (courseId: string, moduleId: string, itemId: string) => void;
  clearCourseModules: (courseId: string) => void;
  addAssessment: (courseId: string, assessmentData: CourseAssessmentInput) => string | undefined;
  updateAssessment: (courseId: string, assessmentId: string, patch: Partial<CourseAssessment>) => void;
  removeAssessment: (courseId: string, assessmentId: string) => void;
  addCourseAssignment: (courseId: string, assignment: Omit<CourseAssignment, 'id'>) => void;
  updateCourseAssignment: (courseId: string, assignmentId: string, patch: Partial<CourseAssignment>) => void;
  removeCourseAssignment: (courseId: string, assignmentId: string) => void;
  submitCourseAssignment: (courseId: string, assignmentId: string, submission: AssignmentSubmission) => void;
  setCourseAnnouncements: (courseId: string, announcements: CourseAnnouncement[]) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem('proctortab_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((s: Session) => ({
          ...s,
          createdAt: new Date(s.createdAt),
        }));
      } catch (e) {
        console.error('Failed to parse sessions from localStorage', e);
      }
    }
    return [];
  });

  /**
   * IMPORTANT:
   * Avoid re-loading Firestore modules/assessments on every `sessions` state update.
   * When `loadModulesFromFirestore()` resolves it calls `setSessions()`, which would previously
   * re-trigger the auth effect (because it depended on `sessions`) and cause an infinite-ish
   * reload loop + console spam + UI flicker (PDF viewer blinking while open).
   */
  const [currentUser, setCurrentUser] = useState(() => auth.currentUser);
  const loadedModuleCoursesRef = useRef<Set<string>>(new Set());
  const loadedAssessmentCoursesRef = useRef<Set<string>>(new Set());
  const loadedCoursesFromCloudRef = useRef(false);

  const normalizeJoinCode = (code: string) =>
    String(code || '')
      .trim()
      .replace(/[-\s]/g, '')
      .toUpperCase();

  const sessionFromCourseDoc = (courseId: string, data: any): Session => ({
    id: String(courseId),
    title: String(data.title || 'Course'),
    joinCode: String(data.joinCode || ''),
    type: (data.type as Session['type']) || 'course',
    status: (data.status as Session['status']) || 'active',
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    enrolledStudents: Array.isArray(data.enrolledStudents) ? data.enrolledStudents.map(String) : [],
    description: typeof data.description === 'string' ? data.description : undefined,
    instructorName: typeof data.instructorName === 'string' ? data.instructorName : undefined,
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : undefined,
    modules: [],
    assessments: [],
    courseAssignments: [],
    announcements: [],
    courseAccentIndex: typeof data.courseAccentIndex === 'number' ? data.courseAccentIndex : undefined,
  });

  // Load modules from Firestore when a session is loaded
  const loadModulesFromCloud = useCallback(async (courseId: string) => {
    if (!auth.currentUser) return;
    
    try {
      const firestoreModules = await loadModulesFromFirestore(courseId);
      if (firestoreModules.length > 0) {
        setSessions((prev) =>
          prev.map((s) => {
            if (String(s.id) !== String(courseId)) return s;
            // Merge Firestore modules with local ones, preferring Firestore if ID matches
            const moduleMap = new Map<string, CourseModule>();
            
            // Add local modules first
            (s.modules || []).forEach((m) => moduleMap.set(m.id, m));
            
            // Override with Firestore modules
            firestoreModules.forEach((m) => moduleMap.set(m.id, m));
            
            return { ...s, modules: Array.from(moduleMap.values()) };
          })
        );
      }
    } catch (error) {
      console.warn('Failed to load modules from Firestore:', error);
      // Continue with local modules
    }
  }, []);

  useEffect(() => {
    /**
     * IMPORTANT:
     * Avoid saving huge blobs into localStorage (can exceed quota and silently fail),
     * which leads to "items disappear after refresh".
     *
     * We persist heavy content (module extracted text + assessment questions) in Firestore.
     * localStorage only keeps a lightweight cache so the app can bootstrap quickly.
     */
    try {
      const slim = sessions.map((s) => ({
        ...s,
        // Modules: store metadata only; fileContent is loaded from Firestore content subcollection.
        modules: (s.modules || []).map((m) => ({
          ...m,
          items: (m.items || []).map((it: any) => {
            const { fileContent, ...rest } = it || {};
            return rest;
          }),
        })),
        // Assessments: store metadata only; full questionItems are loaded from Firestore.
        assessments: (s.assessments || []).map((a) => ({
          ...a,
          questionItems: undefined,
        })),
      }));
      localStorage.setItem('proctortab_sessions', JSON.stringify(slim));
    } catch (e) {
      console.warn('[SessionContext] Failed to persist sessions to localStorage (quota?):', e);
    }
  }, [sessions]);

  // Track auth state once (do NOT depend on sessions).
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (!user) {
        // Reset caches on logout so next login refreshes.
        loadedModuleCoursesRef.current.clear();
        loadedAssessmentCoursesRef.current.clear();
        loadedCoursesFromCloudRef.current = false;
      }
    });
    return unsubscribe;
  }, []);

  /**
   * Load courses from Firestore so courses are shared across devices:
   * - Professor: load courses they own (ownerUid == current user's uid stored in localStorage)
   * - Student: load courses where they are enrolled (enrolledStudents array-contains studentId)
   *
   * Without this, the app relies on localStorage and different devices won't see the same courses.
   */
  useEffect(() => {
    if (!currentUser) return;
    if (loadedCoursesFromCloudRef.current) return;

    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem('user') || '{}') as {
          uid?: string;
          role?: string;
        };
      } catch {
        return {};
      }
    })();

    const role = String(stored.role || '').toLowerCase();
    const ownerUid = typeof stored.uid === 'string' && stored.uid.trim() ? stored.uid.trim() : undefined;
    const studentId = resolveEnrollmentStudentId(null as any);

    (async () => {
      try {
        let q;
        if (role === 'professor' && ownerUid) {
          q = query(collection(db, 'courses'), where('ownerUid', '==', ownerUid));
        } else {
          // Default to student behavior.
          q = query(collection(db, 'courses'), where('enrolledStudents', 'array-contains', String(studentId)));
        }

        const snap = await getDocs(q);
        if (snap.empty) {
          loadedCoursesFromCloudRef.current = true;
          return;
        }

        const cloudSessions: Session[] = snap.docs.map((d) => sessionFromCourseDoc(d.id, d.data()));

        setSessions((prev) => {
          const map = new Map<string, Session>();
          prev.forEach((s) => map.set(String(s.id), s));
          cloudSessions.forEach((s) => {
            const existing = map.get(String(s.id));
            map.set(String(s.id), existing ? { ...s, ...existing, ...s } : s);
          });
          return Array.from(map.values());
        });

        // Optional: backfill joinCodeNormalized for professor-owned legacy courses
        if (role === 'professor' && ownerUid) {
          await Promise.all(
            snap.docs.map(async (d) => {
              const data: any = d.data() || {};
              if (!data.joinCodeNormalized && data.joinCode) {
                try {
                  await updateDoc(doc(db, 'courses', d.id), {
                    joinCodeNormalized: normalizeJoinCode(String(data.joinCode)),
                    updatedAt: serverTimestamp(),
                  });
                } catch {
                  // ignore if rules block
                }
              }
            })
          );
        }

        loadedCoursesFromCloudRef.current = true;
      } catch (e) {
        console.warn('[SessionContext] Failed to load courses from Firestore:', e);
        loadedCoursesFromCloudRef.current = true;
      }
    })();
  }, [currentUser]);

  // Load Firestore modules/assessments ONCE per course when the user is logged in.
  useEffect(() => {
    if (!currentUser) return;
    if (!sessions.length) return;

    sessions.forEach((session) => {
      const sid = String(session.id);

      if (!loadedModuleCoursesRef.current.has(sid)) {
        loadedModuleCoursesRef.current.add(sid);
        loadModulesFromCloud(sid);
      }

      if (session.type === 'course' && !loadedAssessmentCoursesRef.current.has(sid)) {
        loadedAssessmentCoursesRef.current.add(sid);
        (async () => {
          try {
            const cloud = await loadCourseAssessmentsFromFirestore(sid);
            if (!cloud.length) return;
            setSessions((prev) =>
              prev.map((s) => {
                if (String(s.id) !== sid) return s;
                const map = new Map<string, CourseAssessment>();
                (s.assessments || []).forEach((a) => map.set(String(a.id), a));
                cloud.forEach((a) => map.set(String(a.id), a));
                return { ...s, assessments: Array.from(map.values()) };
              })
            );
          } catch (e) {
            console.warn('[SessionContext] Failed to load course assessments from Firestore:', e);
          }
        })();
      }
    });
  }, [currentUser, sessions, loadModulesFromCloud]);

  const createSession = (sessionData: Omit<Session, 'id' | 'joinCode' | 'createdAt'>) => {
    const newSession: Session = {
      ...sessionData,
      id: Date.now().toString(),
      joinCode: generateJoinCode(),
      createdAt: new Date(),
      enrolledStudents: sessionData.enrolledStudents ?? [],
      modules: sessionData.modules ?? [],
      assessments: sessionData.assessments ?? [],
      courseAssignments: sessionData.courseAssignments ?? [],
      announcements: sessionData.announcements ?? [],
    };
    setSessions((prev) => [...prev, newSession]);
    return newSession;
  };

  const deleteSession = (courseId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== courseId));
  };

  const joinSession = async (code: string, studentId: string): Promise<Session | null> => {
    const cleanCode = normalizeJoinCode(code);
    const sid = String(studentId);

    // Resolve the target session from the CURRENT state so we can persist enrollment immediately.
    // (React state updates are async; relying on the effect that writes to localStorage can race with refresh/logout.)
    const target = sessions.find(
      (s) => s.joinCode.replace(/[-\s]/g, '').toUpperCase() === cleanCode
    );
    if (!target) {
      // Not found locally — attempt cloud lookup (so phone/student devices can join professor-created courses).
      try {
        // Try multiple lookups to be robust against older course docs:
        // 1) joinCodeNormalized (preferred)
        // 2) joinCode exact match (some legacy docs may not have joinCodeNormalized)
        const candidates = [
          query(collection(db, 'courses'), where('joinCodeNormalized', '==', cleanCode)),
          query(collection(db, 'courses'), where('joinCode', '==', cleanCode)),
          query(collection(db, 'courses'), where('joinCode', '==', formatJoinCode(cleanCode))),
        ];

        let docSnap: any = null;
        for (const candidate of candidates) {
          const snap = await getDocs(candidate);
          if (!snap.empty) {
            docSnap = snap.docs[0];
            break;
          }
        }
        if (!docSnap) return null;

        const data: any = docSnap.data() || {};
        const courseId = String(docSnap.id);

        const cloudSession: Session = sessionFromCourseDoc(courseId, {
          ...data,
          joinCode: String(data.joinCode || cleanCode),
        });

        // Ensure the course exists in local state so the student dashboard can display it.
        setSessions((prev) => {
          if (prev.some((s) => String(s.id) === courseId)) return prev;
          return [...prev, cloudSession];
        });

        // Enroll the student (cloud + local)
        if (!cloudSession.enrolledStudents.includes(sid)) {
          try {
            await updateDoc(doc(db, 'courses', courseId), {
              enrolledStudents: arrayUnion(sid),
              updatedAt: serverTimestamp(),
            });
          } catch (e) {
            console.warn('[SessionContext] Failed to persist enrollment to Firestore (rules?):', e);
          }

          cloudSession.enrolledStudents = [...cloudSession.enrolledStudents, sid];
          setSessions((prev) =>
            prev.map((s) =>
              String(s.id) === courseId
                ? { ...s, enrolledStudents: Array.from(new Set([...(s.enrolledStudents ?? []).map(String), sid])) }
                : s
            )
          );
        }

        addStudentEnrollment(sid, courseId);
        return cloudSession;
      } catch (e) {
        console.warn('[SessionContext] Cloud join lookup failed:', e);
        return null;
      }
    }

    let resolved: Session | null = target;

    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.joinCode.replace(/[-\s]/g, '').toUpperCase() === cleanCode);
      if (idx === -1) {
        resolved = null;
        return prev;
      }

      return prev.map((s, i) => {
        if (i !== idx) return s;
        const roster = (s.enrolledStudents ?? []).map(String);
        if (roster.includes(sid)) {
          resolved = s;
          return s;
        }
        const nextRoster = [...roster, sid];
        resolved = { ...s, enrolledStudents: nextRoster };
        return { ...s, enrolledStudents: nextRoster };
      });
    });

    // Student-side persistence fallback: ensure the course stays "joined" even if roster persistence races.
    // This is safe to call even if the student was already enrolled.
    addStudentEnrollment(sid, target.id);

    return resolved;
  };

  const getSessionByCode = (code: string) => {
    const cleanCode = code.trim().replace(/[-\s]/g, '').toUpperCase();
    return sessions.find((s) => s.joinCode.trim().toUpperCase() === cleanCode);
  };

  const getActiveSession = () => {
    return sessions.find((s) => s.status === 'active') || null;
  };

  const addModule = (courseId: string, moduleData: Omit<CourseModule, 'id'>) => {
    const newModuleId = Date.now().toString();
    const newModule: CourseModule = { ...moduleData, id: newModuleId, items: moduleData.items ?? [] };
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        return { ...s, modules: [...(s.modules || []), newModule] };
      })
    );

    // Sync to Firestore in background (non-blocking)
    // Only sync if user is authenticated
    if (auth.currentUser) {
      syncModuleToFirestore(courseId, newModule).catch((error) => {
        console.warn('Failed to sync module to Firestore (will retry on next sync):', error);
        // Continue gracefully - module is saved locally and will sync when network is available
      });
    }

    return newModuleId;
  };

  const addModuleItem = (courseId: string, moduleId: string, item: ModuleItem | Omit<ModuleItem, 'id'>) => {
    // Support both items with and without ID
    const newItem: ModuleItem = 'id' in item 
      ? (item as ModuleItem)
      : { ...item, id: Date.now().toString() };
    let moduleToSync: CourseModule | undefined;

    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        const modules = (s.modules || []).map((m) => {
          if (String(m.id) !== String(moduleId)) return m;
          const updated = { ...m, items: [...(m.items || []), newItem] };
          moduleToSync = updated; // Keep reference for Firestore sync
          return updated;
        });
        return { ...s, modules };
      })
    );

    // Sync updated module to Firestore
    if (moduleToSync && auth.currentUser) {
      syncModuleToFirestore(courseId, moduleToSync).catch((error) => {
        console.warn('Failed to sync module item to Firestore:', error);
      });
    }
  };

  const removeCourseModule = (courseId: string, moduleId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        return { ...s, modules: (s.modules || []).filter((m) => String(m.id) !== String(moduleId)) };
      })
    );
  };

  const removeCourseModuleItem = (courseId: string, moduleId: string, itemId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        const modules = (s.modules || []).map((m) => {
          if (String(m.id) !== String(moduleId)) return m;
          return { ...m, items: (m.items || []).filter((it) => String(it.id) !== String(itemId)) };
        });
        return { ...s, modules };
      })
    );
  };

  const clearCourseModules = (courseId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        return { ...s, modules: [] };
      })
    );
  };

  const addAssessment = (courseId: string, assessmentData: CourseAssessmentInput): string | undefined => {
    const questionItems = assessmentData.questionItems ?? [];
    const newId = Date.now().toString();
    const useGlobalDetectors = assessmentData.useGlobalDetectors ?? true;
    const detectors = assessmentData.detectors ?? {
      tabSwitch: false,
      copyPaste: false,
      fullscreen: false,
      screenshot: false,
      alarm: false,
    };
    const newAssessment: CourseAssessment = {
      id: newId,
      title: assessmentData.title,
      duration: assessmentData.duration ?? 30,
      dueDate: assessmentData.dueDate ?? '',
      questions: questionItems.length || assessmentData.questions || 0,
      assessmentType: assessmentData.assessmentType ?? 'exam',
      maxScore: assessmentData.maxScore ?? 100,
      submissions: assessmentData.submissions ?? [],
      questionItems: questionItems.length ? questionItems : undefined,
      questionSource: assessmentData.questionSource,
      sourceModuleId: assessmentData.sourceModuleId,
      sourceModuleTitle: assessmentData.sourceModuleTitle,
      generatedTopic: assessmentData.generatedTopic,
      generatedDifficulty: assessmentData.generatedDifficulty,
      password: assessmentData.password?.trim() || undefined,
      maxAttempts: assessmentData.maxAttempts ?? 1,
      randomizeQuestions: assessmentData.randomizeQuestions ?? false,
      randomizeChoices: assessmentData.randomizeChoices ?? false,
      passingScore: assessmentData.passingScore ?? 60,
      useGlobalDetectors,
      detectors,
      ...(assessmentData.activeExamDetectors
        ? { activeExamDetectors: assessmentData.activeExamDetectors }
        : {}),
      allowQuestionNavigation: assessmentData.allowQuestionNavigation ?? true,
    };
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        return { ...s, assessments: [...(s.assessments || []), newAssessment] };
      })
    );

    // Persist to Firestore so assessments (including password-protected) survive refresh/logout/login.
    if (auth.currentUser) {
      saveCourseAssessmentToFirestore(String(courseId), newAssessment).catch((e) => {
        console.warn('[SessionContext] Failed to save assessment to Firestore:', e);
      });
    }

    return newId;
  };

  const updateAssessment = (courseId: string, assessmentId: string, patch: Partial<CourseAssessment>) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        const assessments = (s.assessments || []).map((a) =>
          String(a.id) === String(assessmentId) ? { ...a, ...patch } : a
        );
        return { ...s, assessments };
      })
    );
  };

  const removeAssessment = (courseId: string, assessmentId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        return {
          ...s,
          assessments: (s.assessments || []).filter((a) => String(a.id) !== String(assessmentId)),
        };
      })
    );

    // Persist delete to Firestore.
    if (auth.currentUser) {
      deleteCourseAssessmentFromFirestore(String(courseId), String(assessmentId)).catch((e) => {
        console.warn('[SessionContext] Failed to delete assessment from Firestore:', e);
      });
    }
  };

  const addCourseAssignment = (courseId: string, data: Omit<CourseAssignment, 'id'>) => {
    const row: CourseAssignment = { ...data, id: Date.now().toString() };
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        return { ...s, courseAssignments: [...(s.courseAssignments || []), row] };
      })
    );
  };

  const updateCourseAssignment = (courseId: string, assignmentId: string, patch: Partial<CourseAssignment>) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        const courseAssignments = (s.courseAssignments || []).map((a) =>
          String(a.id) === String(assignmentId) ? { ...a, ...patch } : a
        );
        return { ...s, courseAssignments };
      })
    );
  };

  const removeCourseAssignment = (courseId: string, assignmentId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        return {
          ...s,
          courseAssignments: (s.courseAssignments || []).filter((a) => String(a.id) !== String(assignmentId)),
        };
      })
    );
  };

  const submitCourseAssignment = (courseId: string, assignmentId: string, submission: AssignmentSubmission) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (String(s.id) !== String(courseId)) return s;
        const courseAssignments = (s.courseAssignments || []).map((a) => {
          if (String(a.id) !== String(assignmentId)) return a;
          const submissions = [...(a.submissions || [])];
          const existingIdx = submissions.findIndex((sub) => sub.studentId === submission.studentId);
          if (existingIdx !== -1) {
            submissions[existingIdx] = submission;
          } else {
            submissions.push(submission);
          }
          return { ...a, submissions };
        });
        return { ...s, courseAssignments };
      })
    );
  };

  const setCourseAnnouncements = (courseId: string, announcements: CourseAnnouncement[]) => {
    setSessions((prev) =>
      prev.map((s) => (String(s.id) === String(courseId) ? { ...s, announcements } : s))
    );
  };

  return (
    <SessionContext.Provider
      value={{
        sessions,
        createSession,
        joinSession,
        getSessionByCode,
        getActiveSession,
        addModule,
        addModuleItem,
        removeCourseModule,
        removeCourseModuleItem,
        clearCourseModules,
        addAssessment,
        updateAssessment,
        removeAssessment,
        addCourseAssignment,
        updateCourseAssignment,
        removeCourseAssignment,
        submitCourseAssignment,
        setCourseAnnouncements,
        deleteSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};
