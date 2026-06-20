import { useState, useMemo, useEffect, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  FileText,
  Play,
  CheckCircle,
  CalendarDays,
  Award,
  Clock,
  Shield,
  HelpCircle,
  MessageSquare,
  Plus,
  FolderOpen,
  Upload,
  Trash2,
  Download,
  Users,
  User,
  QrCode,
} from 'lucide-react';
import { getStorage, ref, getBytes, getDownloadURL, uploadBytes, deleteObject } from 'firebase/storage';
import { Bytes, collection, deleteDoc, doc, getDocs, orderBy, query, setDoc, writeBatch } from 'firebase/firestore';
import { CourseAttendanceTab } from '@/components/attendance/CourseAttendanceTab';
import { CreateCourseAssessmentDialog } from '@/components/assessment/CreateCourseAssessmentDialog';
import { EditAssessmentAdvancedDialog } from '@/components/assessment/EditAssessmentAdvancedDialog';
import { AssessmentStartDialog } from '@/components/assessment/AssessmentStartDialog';
import { CourseExamResultsTable } from '@/components/course/CourseExamResultsTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { recordAttempt } from '@/utils/examSession';
import { getExamDetectorRuntime, isExamWithinDueWindow } from '@/utils/examDetectorPolicy';
import { syncExamDocumentToFirestore } from '@/utils/examSettingsFirestore';
import {
  uploadModuleFile,
  saveModuleToFirestore,
  deleteAllModulesFromFirestore,
  deleteModuleFromFirestore,
  clearModuleContentCache,
  loadModulesFromFirestore,
} from '@/utils/moduleStorageService';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from '@/hooks/useSession';
import type {
  CourseAssessment,
  CourseAssessmentInput,
  CourseExamLaunch,
  AssessmentSubmission,
  CourseAssignment,
  ModuleItem,
  CourseModule,
} from '@/context/SessionContext';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { resolveCourseInstructorName } from '@/utils/storedUser';
import { isStudentEnrolledLocally } from '@/utils/studentEnrollments';
import { deriveCleanTitleFromFilename } from '@/utils/filenameTitle';
import { cn } from '@/lib/utils';
import { PdfViewer } from '@/components/pdf/PdfViewer';
import { db, firebaseApp } from '@/firebase';

const MAX_FILE_BYTES = 1_200_000;

// Firestore chunk sizing: keep each chunk well under Firestore 1 MiB doc limit.
const LEARNING_PDF_CHUNK_BYTES = 700_000;

async function saveLearningPdfToFirestoreChunks(params: {
  courseId: string;
  moduleId: string;
  itemId: string;
  file: File;
}): Promise<{ chunkCount: number; totalBytes: number }> {
  const { courseId, moduleId, itemId, file } = params;
  const buf = new Uint8Array(await file.arrayBuffer());
  const totalBytes = buf.byteLength;
  const chunkCount = Math.ceil(totalBytes / LEARNING_PDF_CHUNK_BYTES);

  // Manifest doc
  const manifestRef = doc(
    db,
    'courses',
    courseId,
    'modules',
    moduleId,
    'learningPdfFiles',
    itemId
  );

  await setDoc(
    manifestRef,
    {
      fileName: file.name,
      mimeType: file.type || 'application/pdf',
      totalBytes,
      chunkBytes: LEARNING_PDF_CHUNK_BYTES,
      chunkCount,
      createdAt: Date.now(),
    },
    { merge: true }
  );

  // Chunk docs (batched in groups to avoid huge single batch)
  let batch = writeBatch(db);
  let ops = 0;

  for (let i = 0; i < chunkCount; i++) {
    const start = i * LEARNING_PDF_CHUNK_BYTES;
    const end = Math.min(totalBytes, start + LEARNING_PDF_CHUNK_BYTES);
    const slice = buf.slice(start, end);

    const chunkRef = doc(
      db,
      'courses',
      courseId,
      'modules',
      moduleId,
      'learningPdfFiles',
      itemId,
      'chunks',
      String(i).padStart(6, '0')
    );

    batch.set(chunkRef, {
      index: i,
      size: slice.byteLength,
      data: Bytes.fromUint8Array(slice),
    });
    ops++;

    // Firestore batch limit is 500 ops. Keep it safe.
    if (ops >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  return { chunkCount, totalBytes };
}

async function deleteLearningPdfFromFirestoreChunks(params: {
  courseId: string;
  moduleId: string;
  itemId: string;
}): Promise<void> {
  const { courseId, moduleId, itemId } = params;

  // Delete chunks first
  const chunksRef = collection(
    db,
    'courses',
    String(courseId),
    'modules',
    String(moduleId),
    'learningPdfFiles',
    String(itemId),
    'chunks'
  );
  const snap = await getDocs(chunksRef);
  if (!snap.empty) {
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      ops++;
      if (ops >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  // Delete manifest doc
  const manifestRef = doc(
    db,
    'courses',
    String(courseId),
    'modules',
    String(moduleId),
    'learningPdfFiles',
    String(itemId)
  );
  await deleteDoc(manifestRef);
}

function readRole(): string {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return String(u?.role || '').toLowerCase();
  } catch {
    return '';
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

interface CourseDetailsProps {
  course: {
    id: string;
    name: string;
    instructor: string;
    thumbnail: string;
  };
  onBack: () => void;
  onStartExam: (ctx: CourseExamLaunch) => void;
  onNavigate?: (tab: string) => void;
}

type CourseTab = 'modules' | 'assignments' | 'exams' | 'scores' | 'announcements' | 'attendance';

export const CourseDetails = ({ course, onBack, onStartExam }: CourseDetailsProps) => {
  const [activeTab, setActiveTab] = useState<CourseTab>('modules');
  const { settings } = useSettings();
  const { user } = useAuth();
  const {
    sessions,
    addModule,
    addModuleItem,
    removeCourseModule,
    removeCourseModuleItem,
    clearCourseModules,
    addAssessment,
    updateAssessment,
    removeAssessment,
    addCourseAssignment,
    removeCourseAssignment,
    submitCourseAssignment,
    setCourseAnnouncements,
  } = useSession();

  const isProfessor = (user?.role || readRole()) === 'professor';
  const studentId = resolveEnrollmentStudentId(user);
  const initialTabAppliedRef = useRef(false);

  useEffect(() => {
    initialTabAppliedRef.current = false;
  }, [course.id]);

  useEffect(() => {
    if (initialTabAppliedRef.current) return;

    const initial = sessionStorage.getItem('courseDetailsInitialTab');
    if (initial === 'scores') {
      sessionStorage.removeItem('courseDetailsInitialTab');
      setActiveTab('scores');
      initialTabAppliedRef.current = true;
      return;
    }
    if (initial === 'announcements') {
      sessionStorage.removeItem('courseDetailsInitialTab');
      setActiveTab('announcements');
      initialTabAppliedRef.current = true;
      return;
    }
    if (initial === 'exams') {
      sessionStorage.removeItem('courseDetailsInitialTab');
      setActiveTab('exams');
      initialTabAppliedRef.current = true;
      return;
    }

    setActiveTab('modules');
    initialTabAppliedRef.current = true;
  }, [course.id]);

  useEffect(() => {
    if (isProfessor) return;
    if (activeTab === 'assignments' || activeTab === 'attendance') {
      setActiveTab('modules');
    }
  }, [isProfessor, activeTab]);

  const [showAddModule, setShowAddModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleWeek, setNewModuleWeek] = useState('');
  const [newModuleFiles, setNewModuleFiles] = useState<File[]>([]);
  const addModuleFileInputRef = useRef<HTMLInputElement | null>(null);
  const newWeekUploadInputRef = useRef<HTMLInputElement | null>(null);
  const newModuleTitleAutoRef = useRef(false);
  const [showCreateAssessment, setShowCreateAssessment] = useState(false);

  // Learning Modules (RAW PDFs for students to read; NO extraction)
  const [showAddLearningModule, setShowAddLearningModule] = useState(false);
  const [learningModuleTitle, setLearningModuleTitle] = useState('');
  const [learningModuleFile, setLearningModuleFile] = useState<File | null>(null);
  const learningModuleTitleAutoRef = useRef(false);

  const [announcementText, setAnnouncementText] = useState('');

  const [assignTitle, setAssignTitle] = useState('Activity 1');
  const [assignDescription, setAssignDescription] = useState('');
  const [assignDue, setAssignDue] = useState('');
  const [assignFile, setAssignFile] = useState<File | null>(null);
  const [assignLinkedModuleItemId, setAssignLinkedModuleItemId] = useState('none');

  const [gradebook, setGradebook] = useState<CourseAssessment | null>(null);
  const [gradeRows, setGradeRows] = useState<AssessmentSubmission[]>([]);
  const [studentGradeView, setStudentGradeView] = useState<CourseAssessment | null>(null);

  const [takeExamModal, setTakeExamModal] = useState<CourseAssessment | null>(null);
  const [editAdvancedAssessment, setEditAdvancedAssessment] = useState<CourseAssessment | null>(null);

  const fullCourse = sessions.find((s) => String(s.id) === String(course.id));
  const modules = fullCourse?.modules || [];
  const assessments = fullCourse?.assessments || [];

  // Keep learning modules in a dedicated hidden module (week 0, title "Learning Modules"),
  // and render it as a separate section instead of a normal week card.
  const { weekModules, learningModuleContainer } = useMemo(() => {
    const lm = modules.find((m) => m.week === 0 && m.title === 'Learning Modules');
    const normal = modules.filter((m) => !(m.week === 0 && m.title === 'Learning Modules'));
    return { weekModules: normal, learningModuleContainer: lm || null };
  }, [modules]);

  // When creating an assessment, we MUST use hydrated modules (with fileContent loaded from the
  // Firestore subcollection). Otherwise module files show as "Empty" after a refresh and the
  // generator has no saved knowledge to use.
  const [hydratedModules, setHydratedModules] = useState<CourseModule[] | null>(null);
  const [hydratedModulesLoading, setHydratedModulesLoading] = useState(false);

  useEffect(() => {
    if (!showCreateAssessment) return;
    let cancelled = false;
    (async () => {
      try {
        setHydratedModulesLoading(true);
        const loaded = await loadModulesFromFirestore(String(course.id));
        if (!cancelled) setHydratedModules(loaded);
      } catch (e) {
        console.warn('[CourseDetails] Failed to hydrate modules for assessment:', e);
        if (!cancelled) setHydratedModules(null);
      } finally {
        if (!cancelled) setHydratedModulesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreateAssessment, course.id]);

  const handleAddLearningModule = async () => {
    if (!isProfessor) return;
    if (!learningModuleTitle.trim()) {
      toast.error('Please enter a module title.');
      return;
    }
    if (!learningModuleFile) {
      toast.error('Please upload a PDF file.');
      return;
    }

    const file = learningModuleFile;
    const isPdf =
      (file.type && file.type.toLowerCase().includes('pdf')) ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      toast.error('PDF files only.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`File too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`);
      return;
    }

    const toastId = `learning-module-${Date.now()}`;
    toast.loading('Uploading learning module...', { id: toastId });

    try {
      // Ensure the hidden Learning Modules container exists.
      const moduleId =
        learningModuleContainer?.id ||
        addModule(course.id, { title: 'Learning Modules', week: 0, items: [] });

      const itemId = Date.now().toString();
      const safeName = file.name.replace(/[^\w.\- ()]/g, '_');
      // IMPORTANT: Use the SAME Storage base path as the existing (working) module uploader.
      // The project's Firebase Storage rules likely only allow writes under:
      //   courses/{courseId}/modules/{moduleId}/...
      // Using a different top-level folder (e.g. learning-modules) can be rejected and surface as a CORS error.
      const storageUrl = `courses/${course.id}/modules/${moduleId}/${itemId}-${safeName}`;

      // IMPORTANT (deadline-safe):
      // Your Firebase console shows Storage requires a paid plan, so Storage uploads will fail (404 preflight/CORS).
      // For Learning Modules, we store the ORIGINAL PDF bytes in Firestore (chunked) and render it in-app.
      // This is NOT text extraction and does NOT touch any existing PDF extraction code.
      toast.loading('Saving PDF to Firestore for in-app viewing...', { id: toastId });
      const chunkInfo = await saveLearningPdfToFirestoreChunks({
        courseId: String(course.id),
        moduleId: String(moduleId),
        itemId,
        file,
      });

      const newItem: ModuleItem = {
        id: itemId,
        title: learningModuleTitle.trim(),
        fileName: file.name,
        type: 'pdf',
        mimeType: file.type || 'application/pdf',
        fileSize: file.size,
        fileContent: '', // IMPORTANT: no extracted text here
        storageUrl,
        uploadStatus: 'uploaded',
        uploadedAt: new Date(),
        _metadata: {
          learningModule: true,
          rawPdf: true,
          storage: 'firestoreChunks',
          chunkCount: chunkInfo.chunkCount,
          totalBytes: chunkInfo.totalBytes,
        } as any,
      };

      // Update UI immediately (local state)
      addModuleItem(course.id, moduleId, newItem);

      // Extra persistence: explicitly save updated module doc to Firestore
      try {
        const existingItems =
          learningModuleContainer?.id === moduleId ? (learningModuleContainer.items || []) : [];
        const updatedModule: CourseModule = {
          id: moduleId,
          title: 'Learning Modules',
          week: 0,
          items: [...existingItems, newItem],
        };
        await saveModuleToFirestore(course.id, updatedModule);
      } catch (persistErr) {
        console.warn('[LearningModule] Failed to persist module immediately:', persistErr);
      }

      toast.success('Learning module uploaded.', { id: toastId });
      setLearningModuleTitle('');
      setLearningModuleFile(null);
      setShowAddLearningModule(false);
      learningModuleTitleAutoRef.current = false;
    } catch (e) {
      console.error('[LearningModule] Upload failed:', e);
      // Firebase Storage errors often hide the real HTTP status behind a generic CORS message in the browser.
      const anyErr = e as any;
      const code = anyErr?.code ? String(anyErr.code) : '';
      const serverResponse =
        anyErr?.serverResponse ||
        anyErr?.customData?.serverResponse ||
        anyErr?.customData?.server_response ||
        '';
      const details = [code, serverResponse].filter(Boolean).join(' • ');
      toast.error(
        `Upload failed${details ? `: ${details}` : ''}. If this persists, run setup-cors.bat and ensure Anonymous Auth is enabled.`,
        { id: toastId }
      );
    }
  };

  const isStudentEnrolled = useMemo(() => {
    const roster = (fullCourse?.enrolledStudents ?? []).map(String);
    return roster.includes(String(studentId)) || isStudentEnrolledLocally(String(studentId), String(course.id));
  }, [fullCourse?.enrolledStudents, studentId, course.id]);
  const courseAssignments = fullCourse?.courseAssignments || [];
  const announcements = fullCourse?.announcements || [];
  const learningModuleItems = learningModuleContainer?.items || [];

  const instructorDisplay = useMemo(() => {
    if (fullCourse) return resolveCourseInstructorName(fullCourse);
    return course.instructor?.trim() || '—';
  }, [fullCourse, course.instructor]);

  const instructorInitial = useMemo(() => {
    const t = instructorDisplay.trim();
    const m = /^[A-Za-z0-9]/.exec(t);
    return m ? m[0].toUpperCase() : '?';
  }, [instructorDisplay]);

  const syncAnnouncements = (next: typeof announcements) => {
    setCourseAnnouncements(String(course.id), next);
  };

  const handleSendAnnouncement = () => {
    if (!announcementText.trim() || !isProfessor) return;
    const next = [
      ...announcements,
      { id: Date.now(), text: announcementText.trim(), date: new Date().toISOString() },
    ];
    syncAnnouncements(next);
    setAnnouncementText('');
  };

  const handleAddModule = async () => {
    if (!newModuleTitle.trim() || !newModuleWeek.trim()) return;

    console.log("Saving module:", { title: newModuleTitle, week: newModuleWeek });
    console.log("Selected files:", newModuleFiles);

    const moduleId = addModule(course.id, {
      title: newModuleTitle.trim(),
      week: parseInt(newModuleWeek, 10) || 1,
      items: [],
    });
    
    // If files are selected, upload them to the new module
    if (newModuleFiles.length > 0 && moduleId) {
      console.log(`📁 Processing ${newModuleFiles.length} file(s) for module ${moduleId}`);
      
      const toastId = `add-module-upload-${Date.now()}`;
      let uploadedCount = 0;
      const failedFiles: string[] = [];

      try {
        toast.loading(`Processing ${newModuleFiles.length} file(s)...`, { id: toastId });

        for (let i = 0; i < newModuleFiles.length; i++) {
          const file = newModuleFiles[i];

          // Validate file type
          if (!file.type.includes('pdf') &&
              !file.type.includes('word') &&
              !file.type.includes('document') &&
              !file.type.includes('text') &&
              !file.type.includes('presentation') &&
              !file.type.includes('sheet')) {
            console.warn(`⚠️ Skipped unsupported file type: ${file.type} for ${file.name}`);
            toast.warning(`Skipped ${file.name}: Unsupported file type`, { id: toastId });
            failedFiles.push(file.name);
            continue;
          }

          // Validate file size
          if (file.size > MAX_FILE_BYTES) {
            toast.warning(`Skipped ${file.name}: File too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`, { id: toastId });
            failedFiles.push(file.name);
            continue;
          }

          try {
            const progress = `(${i + 1}/${newModuleFiles.length})`;
            console.log(`⏳ Processing: ${file.name} ${progress}`);
            toast.loading(`Processing ${file.name} ${progress}...`, { id: toastId });

            // Upload file with content extraction
            const moduleItem = await uploadModuleFile(course.id, moduleId, file, file.name);

            // Add to module (this updates state and syncs to Firestore automatically)
            addModuleItem(course.id, moduleId, moduleItem);

            uploadedCount++;
            console.log(`✅ Uploaded: ${file.name}`);

          } catch (fileError) {
            console.error(`❌ Error processing ${file.name}:`, fileError);
            failedFiles.push(file.name);
            toast.error(
              `Failed to process ${file.name}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`,
              { id: toastId }
            );
          }
        }

        // Final summary
        if (uploadedCount > 0) {
          toast.success(`✓ Module created with ${uploadedCount} file(s)`, { id: toastId });
        } else if (failedFiles.length > 0) {
          toast.error(`Module created but files failed: ${failedFiles.join(', ')}`, { id: toastId });
        }
      } catch (error) {
        console.error('[AddModule] Error:', error);
        toast.error(`Error processing files: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
      }
    }

    setNewModuleTitle('');
    setNewModuleWeek('');
    setNewModuleFiles([]);
    setShowAddModule(false);
    newModuleTitleAutoRef.current = false;
  };

  const handleDeleteAllModules = async () => {
    if (!isProfessor) return;
    const ok = window.confirm(
      'Delete ALL modules for this course? This will permanently remove all uploaded module files/content and cannot be undone.'
    );
    if (!ok) return;

    const toastId = `delete-all-modules-${Date.now()}`;
    try {
      toast.loading('Deleting all modules...', { id: toastId });
      const deletedCount = await deleteAllModulesFromFirestore(course.id);
      clearCourseModules(course.id);
      toast.success(`Deleted ${deletedCount} module(s).`, { id: toastId });
    } catch (error) {
      console.error('[DeleteAllModules] Error:', error);
      toast.error(
        `Failed to delete modules: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id: toastId }
      );
    }
  };

  const handleDeleteSingleModule = async (module: CourseModule) => {
    if (!isProfessor) return;
    const ok = window.confirm(
      `Delete "${module.title}" (Week ${module.week})? This will permanently remove this module and all uploaded files/content in it.`
    );
    if (!ok) return;

    const toastId = `delete-module-${module.id}-${Date.now()}`;
    try {
      toast.loading('Deleting module...', { id: toastId });
      await deleteModuleFromFirestore(String(course.id), String(module.id));
      clearModuleContentCache();
      removeCourseModule(course.id, module.id);
      setHydratedModules((prev) => (prev ? prev.filter((m) => String(m.id) !== String(module.id)) : prev));
      toast.success('Module deleted.', { id: toastId });
    } catch (error) {
      console.error('[DeleteModule] Error:', error);
      toast.error(
        `Failed to delete module: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id: toastId }
      );
    }
  };

  const handleDeleteLearningModuleItem = async (item: ModuleItem) => {
    if (!isProfessor) return;
    if (!learningModuleContainer?.id) return;

    const label = item.title || item.fileName || 'this learning module';
    const ok = window.confirm(`Delete "${label}"? This will permanently remove the PDF from Learning Modules.`);
    if (!ok) return;

    const toastId = `delete-learning-module-${item.id}-${Date.now()}`;
    try {
      toast.loading('Deleting learning module...', { id: toastId });

      // 1) Delete stored raw PDF bytes (Firestore chunks) if present
      if (item?._metadata?.storage === 'firestoreChunks') {
        await deleteLearningPdfFromFirestoreChunks({
          courseId: String(course.id),
          moduleId: String(learningModuleContainer.id),
          itemId: String(item.id),
        });
      }

      // 2) Best-effort delete from Storage (if enabled for this deployment)
      if (item.storageUrl) {
        try {
          const storage = getStorage();
          await deleteObject(ref(storage, item.storageUrl));
        } catch (e) {
          // Ignore storage delete errors (many deployments have Storage disabled due to billing).
          console.warn('[LearningModule] Storage delete failed (ignored):', e);
        }
      }

      // 3) Update module items and persist module doc
      const nextItems = (learningModuleContainer.items || []).filter(
        (it) => String(it.id) !== String(item.id)
      );
      removeCourseModuleItem(course.id, learningModuleContainer.id, String(item.id));
      await saveModuleToFirestore(course.id, {
        id: learningModuleContainer.id,
        title: 'Learning Modules',
        week: 0,
        items: nextItems,
      });

      toast.success('Learning module deleted.', { id: toastId });
    } catch (error) {
      console.error('[DeleteLearningModule] Error:', error);
      toast.error(
        `Failed to delete learning module: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id: toastId }
      );
    }
  };

  const handleAddModuleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (files) {
      const selected = Array.from(files);
      console.log("Selected files for new module:", selected.map(f => f.name));

      // Merge, but avoid duplicates (same name+size+lastModified)
      setNewModuleFiles((prev) => {
        const existingKeys = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
        const next = [...prev];
        for (const f of selected) {
          const key = `${f.name}|${f.size}|${f.lastModified}`;
          if (!existingKeys.has(key)) next.push(f);
        }
        return next;
      });

      // Quick user feedback (so it doesn't feel like "nothing happened")
      toast.success(`Selected ${selected.length} file(s)`);

      // Auto-fill module title from filename when:
      // - user hasn't typed their own title yet (empty), OR
      // - the last title was auto-generated (so it's safe to overwrite)
      // Only do this for single-file selection to avoid confusing titles.
      if (selected.length === 1) {
        const derived = deriveCleanTitleFromFilename(selected[0].name);
        if (derived && (!newModuleTitle.trim() || newModuleTitleAutoRef.current)) {
          setNewModuleTitle(derived);
          newModuleTitleAutoRef.current = true;
        }
      }

      // Reset input so user can select the same file again if needed
      if (addModuleFileInputRef.current) addModuleFileInputRef.current.value = '';
    }
  };

  const handleRemoveAddModuleFile = (index: number) => {
    setNewModuleFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMultiFileUploadNewWeek = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    e.currentTarget.value = '';
    
    if (!files || files.length === 0 || !isProfessor) return;

    const fileList = Array.from(files);
    const totalFiles = fileList.length;
    const toastId = `upload-${Date.now()}`;
    // IMPORTANT: modules state updates asynchronously. If we compute "nextWeek" from `modules`
    // inside the loop, multiple uploads in a single action can accidentally reuse the same week.
    // Use a local incrementing counter for the duration of this upload.
    let nextWeekCounter =
      modules.length === 0 ? 1 : Math.max(...modules.map((m) => m.week || 0), 0) + 1;

    try {
      // Check total size upfront
      const totalSize = fileList.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_FILE_BYTES * 5) {
        toast.error(`Total file size exceeds ${Math.round((MAX_FILE_BYTES * 5) / 1024 / 1024)} MB limit`);
        return;
      }

      // Show initial loading toast
      toast.loading(`Uploading ${totalFiles} file(s)...`, { id: toastId });

      // Process files sequentially
      let uploadedCount = 0;
      const failedFiles: string[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        
        // Validate file
        if (!file.type.includes('pdf') && 
            !file.type.includes('word') && 
            !file.type.includes('document') &&
            !file.type.includes('text') &&
            !file.type.includes('presentation')) {
          toast.warning(`Skipped ${file.name}: Unsupported file type`, { id: toastId });
          failedFiles.push(file.name);
          continue;
        }

        if (file.size > MAX_FILE_BYTES) {
          toast.warning(`Skipped ${file.name}: File too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`, { id: toastId });
          failedFiles.push(file.name);
          continue;
        }

        try {
          // Update progress toast
          const progress = `(${i + 1}/${totalFiles})`;
          toast.loading(`Uploading ${file.name} ${progress}...`, { id: toastId });

          // Create new module for this file
          const nextWeek = nextWeekCounter;
          nextWeekCounter += 1;
          
          const titleFromFile = deriveCleanTitleFromFilename(file.name) || 'Module';
          
          // Create module first
          const moduleId = addModule(course.id, {
            title: titleFromFile,
            week: nextWeek,
            items: [],
          });

          if (!moduleId) {
            throw new Error('Failed to create module');
          }

          // Upload file with Firebase Storage and extract content
          const moduleItem = await uploadModuleFile(course.id, moduleId, file, file.name);

          // Add the uploaded item to the module
          addModuleItem(course.id, moduleId, moduleItem);

          // Save module to Firestore
          const updatedModule: CourseModule = {
            id: moduleId,
            title: titleFromFile,
            week: nextWeek,
            items: [moduleItem],
            uploadedAt: new Date(),
          };

          try {
            await saveModuleToFirestore(course.id, updatedModule);
          } catch (firestoreError) {
            console.warn('[CourseDetails] Firestore save warning:', firestoreError);
            // Continue even if Firestore fails - data is in session
          }

          uploadedCount++;
          toast.success(`✓ ${file.name} uploaded to Week ${nextWeek}`, { id: toastId });

        } catch (fileError) {
          console.error(`Error uploading ${file.name}:`, fileError);
          failedFiles.push(file.name);
          toast.error(
            `Failed to upload ${file.name}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`,
            { id: toastId }
          );
        }
      }

      // Final summary
      if (uploadedCount > 0 && failedFiles.length === 0) {
        toast.success(`✓ Successfully uploaded ${uploadedCount} file(s)`, { id: toastId });
      } else if (uploadedCount > 0 && failedFiles.length > 0) {
        toast.info(`Uploaded ${uploadedCount}/${totalFiles}. Failed: ${failedFiles.join(', ')}`, { id: toastId });
      } else {
        toast.error(`Failed to upload files. ${failedFiles.length} errors.`, { id: toastId });
      }
    } catch (error) {
      console.error('[CourseDetails] Upload error:', error);
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
    }
  };

  const handleAddAssignment = async () => {
    if (!assignTitle.trim() || !isProfessor) return;
    const selectedLearningModule =
      assignLinkedModuleItemId && assignLinkedModuleItemId !== 'none'
        ? learningModuleItems.find((item) => String(item.id) === String(assignLinkedModuleItemId))
        : null;
    let dataUrl: string | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    if (assignFile) {
      if (assignFile.size > MAX_FILE_BYTES) {
        alert(`File too large. Max ${Math.round(MAX_FILE_BYTES / 1024)} KB.`);
        return;
      }
      dataUrl = await fileToDataUrl(assignFile);
      fileName = assignFile.name;
      mimeType = assignFile.type || 'application/octet-stream';
    }
    addCourseAssignment(course.id, {
      title: assignTitle.trim(),
      description: assignDescription.trim(),
      dueDate: assignDue,
      linkedLearningModuleItemId: selectedLearningModule ? String(selectedLearningModule.id) : undefined,
      linkedLearningModuleTitle:
        selectedLearningModule?.title || selectedLearningModule?.fileName || undefined,
      fileName,
      mimeType,
      dataUrl,
    });
    setAssignTitle('');
    setAssignDescription('');
    setAssignDue('');
    setAssignFile(null);
    setAssignLinkedModuleItemId('none');
  };

  const getLinkedAssignmentsForLearningModule = (itemId: string) =>
    courseAssignments.filter(
      (assignment) =>
        String(assignment.linkedLearningModuleItemId || '') === String(itemId || '')
    );

  const renderLinkedAssignments = (item: ModuleItem) => {
    const linkedAssignments = getLinkedAssignmentsForLearningModule(String(item.id || ''));
    if (!linkedAssignments.length) return null;

    return (
      <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Linked Activities
        </p>
        {isProfessor ? (
          <div className="space-y-3">
            {linkedAssignments.map((assignment) => (
              <div key={assignment.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{assignment.title}</p>
                    {assignment.description ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {assignment.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleString() : 'Not set'}
                    </p>
                  </div>
                  {assignment.dataUrl ? (
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a
                        href={assignment.dataUrl}
                        download={assignment.fileName || 'attachment'}
                        className="inline-flex items-center gap-1"
                      >
                        <Download className="h-4 w-4" />
                        Attachment
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {linkedAssignments.map((assignment) => {
              const submission = assignment.submissions?.find(
                (s) => String(s.studentId) === String(studentId)
              );
              const hasSubmission = Boolean(submission);
              const dueMs = assignment.dueDate ? new Date(assignment.dueDate).getTime() : Number.NaN;
              const deadlinePassed =
                Boolean(assignment.dueDate) && !Number.isNaN(dueMs) && dueMs < Date.now();

              return (
                <AccordionItem key={assignment.id} value={String(assignment.id)}>
                  <AccordionTrigger className="hover:no-underline">
                    <span className="truncate">{assignment.title}</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      {assignment.description ? (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Instructions
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {assignment.description}
                          </p>
                        </div>
                      ) : null}

                      <p className="text-xs text-muted-foreground">
                        Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleString() : 'Not set'}
                      </p>

                      {assignment.dataUrl ? (
                        <Button type="button" variant="outline" size="sm" asChild>
                          <a
                            href={assignment.dataUrl}
                            download={assignment.fileName || 'attachment'}
                            className="inline-flex items-center gap-1"
                          >
                            <Download className="h-4 w-4" />
                            Download Attachment
                          </a>
                        </Button>
                      ) : null}

                      <div className="rounded-md border bg-background p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Submission
                        </p>
                        {hasSubmission ? (
                          <div className="mt-2 flex items-center gap-2 text-sm text-green-600 font-medium">
                            <CheckCircle className="w-4 h-4 shrink-0" />
                            <span className="truncate" title={submission?.fileName}>
                              Submitted: {submission?.fileName}
                            </span>
                          </div>
                        ) : deadlinePassed ? (
                          <div className="mt-2 text-sm text-destructive font-medium">
                            Deadline passed. Submissions closed.
                          </div>
                        ) : (
                          <div className="mt-2 flex flex-col gap-2">
                            <Input
                              type="file"
                              className="max-w-[280px] text-xs h-8"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    submitCourseAssignment(course.id, assignment.id, {
                                      studentId,
                                      studentName: user?.name || 'Student',
                                      fileName: file.name,
                                      dataUrl: ev.target?.result as string,
                                      submittedAt: new Date().toISOString()
                                    });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    );
  };

  const handleCreateAssessment = (input: CourseAssessmentInput) => {
    const newId = addAssessment(course.id, input);
    if (newId) {
      const useGlobal = input.useGlobalDetectors ?? true;
      const detectors = input.detectors ?? {
        tabSwitch: false,
        copyPaste: false,
        fullscreen: false,
        screenshot: false,
        alarm: false,
      };
      void syncExamDocumentToFirestore(course.id, newId, {
        title: input.title.trim(),
        useGlobalDetectors: useGlobal,
        detectors,
        allowQuestionNavigation: input.allowQuestionNavigation,
      }).catch((e) => console.warn('Could not sync exam settings to Firestore:', e));
    }
  };

  const openExamStart = (assessment: CourseAssessment) => {
    if (!isProfessor && !isStudentEnrolled) {
      alert('You are not enrolled in this course.');
      return;
    }
    if (!isExamWithinDueWindow(assessment)) {
      alert('This assessment is past its due date and is no longer available.');
      return;
    }
    setTakeExamModal(assessment);
  };

  const handleStudentStartAssessment = (assessment: CourseAssessment) => {
    recordAttempt(course.id, assessment.id, studentId);
    onStartExam({
      courseId: course.id,
      courseTitle: course.name,
      assessment,
    });
  };

  const openGradebook = (a: CourseAssessment) => {
    setGradebook(a);
    setGradeRows(JSON.parse(JSON.stringify(a.submissions || [])));
  };

  const seedEnrolled = () => {
    if (!gradebook || !fullCourse) return;
    const ids = fullCourse.enrolledStudents || [];
    setGradeRows((prev) => {
      const map = new Map(prev.map((r) => [r.studentId, r]));
      ids.forEach((id) => {
        if (!map.has(id)) {
          map.set(id, {
            studentId: id,
            studentName: id.length > 12 ? `${id.slice(0, 8)}…` : id,
            score: null,
            maxScore: gradebook.maxScore ?? 100,
            submittedAt: undefined,
          });
        }
      });
      return Array.from(map.values());
    });
  };

  const addManualGradeRow = () => {
    if (!gradebook) return;
    const id = `manual-${Date.now()}`;
    setGradeRows((prev) => [
      ...prev,
      {
        studentId: id,
        studentName: '',
        score: null,
        maxScore: gradebook.maxScore ?? 100,
        submittedAt: new Date().toISOString(),
      },
    ]);
  };

  const saveGradebook = () => {
    if (!gradebook) return;
    updateAssessment(course.id, gradebook.id, { submissions: gradeRows });
    setGradebook(null);
  };

  const scoreSummary = (a: CourseAssessment) => {
    const subs = a.submissions || [];
    const max = a.maxScore ?? 100;
    const graded = subs.filter((s) => s.score != null && !Number.isNaN(s.score));
    if (graded.length === 0) return `— / ${max}`;
    const sum = graded.reduce((acc, s) => acc + (s.score as number), 0);
    const avg = Math.round((sum / graded.length) * 10) / 10;
    return `${avg} avg (${graded.length} graded) / ${max}`;
  };

  const studentOwnSubmission = (a: CourseAssessment) => {
    const subs = a.submissions || [];
    return subs.find((s) => s.studentId === studentId);
  };

  const filteredAssessmentsForStudentScores = useMemo(() => assessments, [assessments]);

  const studentScoreCell = (a: CourseAssessment) => {
    const sub = studentOwnSubmission(a);
    const max = a.maxScore ?? 100;
    if (sub && sub.score != null && !Number.isNaN(sub.score)) return `${sub.score} / ${max}`;
    if (sub) return `Pending / ${max}`;
    return `— / ${max}`;
  };

  const detectorSummary = (a: CourseAssessment) => {
    const usesGlobal = a.useGlobalDetectors !== false && !a.activeExamDetectors;
    if (usesGlobal) return 'Detectors: global defaults';
    const r = getExamDetectorRuntime(a, settings);
    const parts: string[] = [];
    if (r.tabEnabled) parts.push('Tab');
    if (r.copyPasteEnabled) parts.push('Copy/paste');
    if (r.fullscreenExitEnabled) parts.push('Fullscreen exit');
    return parts.length ? `This assessment: ${parts.join(' · ')}` : 'This assessment: no detectors enabled';
  };

  return (
    <div
      className={cn(
        'relative mx-auto min-h-[calc(100vh-100px)] max-w-7xl',
        isProfessor ? 'space-y-6' : 'space-y-0'
      )}
    >
      {isProfessor ? (
        <>
          <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 pb-2 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 -mx-4 px-4 sm:mx-0 sm:px-0">
            <Button variant="ghost" onClick={onBack} className="-ml-2 shrink-0 gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to courses</span>
            </Button>
          </div>
          <div className="relative overflow-hidden rounded-b-xl bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 px-5 py-8 text-white shadow-md sm:px-8 mb-6 -mx-4 sm:mx-0">
            <div className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="relative flex items-center gap-4">
              <div className="hidden h-16 w-16 overflow-hidden rounded-lg sm:block border-2 border-white/20">
                <img src={course.thumbnail} alt={course.name} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-blue-200/90">{course.id}</p>
                <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{course.name}</h1>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 pb-2 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 -mx-4 px-4 sm:mx-0 sm:px-0">
            <Button variant="ghost" onClick={onBack} className="-ml-2 shrink-0 gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to courses</span>
            </Button>
          </div>

          <div
            className="-mx-4 flex gap-0 overflow-x-auto border-b border-slate-800 bg-slate-900 px-1 text-white sm:mx-0"
            role="tablist"
            aria-label="Course sections"
          >
            {(
              [
                { id: 'modules' as const, label: 'CONTENT' },
                    { id: 'exams' as const, label: 'ASSESSMENTS' },
                { id: 'scores' as const, label: 'SCORES' },
                { id: 'announcements' as const, label: 'ANNOUNCEMENT' },
              ] as const
            ).map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={cn(
                    'relative shrink-0 px-4 py-3 text-sm font-semibold tracking-wide transition-colors sm:px-6 sm:text-base',
                    isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                  )}
                  onClick={() => setActiveTab(t.id)}
                >
                  <span className="flex items-center gap-2">
                    {t.label}
                    {t.id === 'announcements' && announcements.length > 0 ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold leading-none text-white">
                        {announcements.length > 99 ? '99+' : announcements.length}
                      </span>
                    ) : null}
                  </span>
                  {isActive ? (
                    <span
                      className="absolute bottom-0 left-3 right-3 h-1 rounded-t bg-blue-500 sm:left-4 sm:right-4"
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="relative overflow-hidden rounded-b-xl bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 px-5 py-8 text-white shadow-md sm:px-8">
            <div className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
            <p className="relative font-mono text-xs text-blue-200/90">{course.id}</p>
            <h1 className="relative mt-1 text-2xl font-bold leading-tight sm:text-3xl">{course.name}</h1>
            <div className="relative mt-3 flex items-center gap-2 text-sm text-blue-100">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white"
                aria-hidden
              >
                {instructorInitial}
              </div>
              <span>{instructorDisplay}</span>
            </div>
          </div>
        </>
      )}

      <div className={cn('flex gap-8 pb-24', isProfessor ? 'flex-col md:flex-row' : 'flex-col')}>
        {isProfessor ? (
          <div className="w-full md:w-64 space-y-2 flex-shrink-0">
            <div className="rounded-lg border bg-card p-3 flex items-center gap-3 mb-1 shadow-sm">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold"
                aria-hidden
              >
                {instructorInitial}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3 shrink-0" />
                  Instructor
                </p>
                <p className="font-semibold text-sm truncate">{instructorDisplay}</p>
              </div>
            </div>
            <Button
              variant={activeTab === 'modules' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('modules')}
            >
              <FileText className="w-4 h-4 mr-2" />
              Content / Modules
            </Button>
            <Button
              variant={activeTab === 'assignments' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('assignments')}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Activities
            </Button>
            <Button
              variant={activeTab === 'exams' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('exams')}
            >
              <Play className="w-4 h-4 mr-2" />
              Quizzes / Assessments
            </Button>
            <Button
              variant={activeTab === 'scores' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('scores')}
            >
              <FileText className="w-4 h-4 mr-2" />
              Scores
            </Button>
            <Button
              variant={activeTab === 'announcements' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('announcements')}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Announcements
            </Button>
            <Button
              variant={activeTab === 'attendance' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('attendance')}
            >
              <QrCode className="w-4 h-4 mr-2" />
              Attendance
            </Button>
          </div>
        ) : null}

        <div className={cn('flex-1 min-w-0', !isProfessor && 'pt-6')}>
          {activeTab === 'modules' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Course Content</h2>
                {isProfessor ? (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <p className="text-sm text-muted-foreground max-w-md text-right hidden md:block">
                      Add more weeks/modules, or upload files on each week card.
                    </p>

                    {modules.length > 0 && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="gap-2"
                        onClick={() => setShowAddModule(true)}
                        title="Add module/week"
                      >
                        <Plus className="h-4 w-4" />
                        Add module
                      </Button>
                    )}

                    {modules.length > 0 && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        onClick={() => void handleDeleteAllModules()}
                        title="Delete all modules"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete all
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
              <input
                id="course-empty-module-upload"
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.pptx,.ppt,.odt"
                className="hidden"
                onChange={(e) => void handleMultiFileUploadNewWeek(e)}
                ref={newWeekUploadInputRef}
              />
              {weekModules.length > 0 ? (
                weekModules.map((module) => (
                  <Card key={module.id}>
                    <CardHeader className="bg-muted/50 py-3 flex flex-row items-center justify-between gap-2">
                      <CardTitle className="text-lg">
                        Week {module.week}: {module.title}
                      </CardTitle>
                      {isProfessor && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => void handleDeleteSingleModule(module)}
                          aria-label={`Delete module ${module.title}`}
                          title="Delete this module"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                      {module.items && module.items.length > 0 ? (
                        module.items.map((item, idx) => (
                          <ModuleItemRow
                            key={item.id || `${module.id}-${idx}`}
                            item={item}
                            isProfessor={isProfessor}
                            courseId={String(course.id)}
                            moduleId={String(module.id)}
                            showPdfViewerButton={false}
                          />
                        ))
                      ) : isProfessor ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20">
                          <FolderOpen className="h-10 w-10 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground text-center max-w-sm">
                            No files in this week yet. Upload a PDF, slide deck, or any module file from your computer.
                          </p>
                          <input
                            id={`mod-upload-empty-${module.id}`}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.doc,.txt,.pptx,.ppt,.odt,.xlsx,.xls"
                            className="hidden"
                            onChange={async (e) => {
                              const files = e.currentTarget.files;
                              e.currentTarget.value = '';
                              if (!files || files.length === 0 || !isProfessor) return;

                              const fileList = Array.from(files);
                              const toastId = `upload-empty-${module.id}-${Date.now()}`;
                              let uploadedCount = 0;
                              const failedFiles: string[] = [];

                              try {
                                toast.loading(`Uploading ${fileList.length} file(s) to Week ${module.week}...`, { id: toastId });

                                for (let i = 0; i < fileList.length; i++) {
                                  const file = fileList[i];

                                  // Validate file type
                                  if (!file.type.includes('pdf') &&
                                      !file.type.includes('word') &&
                                      !file.type.includes('document') &&
                                      !file.type.includes('text') &&
                                      !file.type.includes('presentation') &&
                                      !file.type.includes('sheet')) {
                                    console.warn(`Skipped unsupported file type: ${file.type} for ${file.name}`);
                                    toast.warning(`Skipped ${file.name}: Unsupported file type`, { id: toastId });
                                    failedFiles.push(file.name);
                                    continue;
                                  }

                                  // Validate file size
                                  if (file.size > MAX_FILE_BYTES) {
                                    toast.warning(`Skipped ${file.name}: File too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`, { id: toastId });
                                    failedFiles.push(file.name);
                                    continue;
                                  }

                                  try {
                                    // Update progress
                                    const progress = `(${i + 1}/${fileList.length})`;
                                    toast.loading(`Uploading ${file.name} ${progress}...`, { id: toastId });

                                    console.log(`[ModuleUpload] Processing: ${file.name} (${file.type}, ${file.size} bytes)`);

                                    // Use uploadModuleFile to extract content and upload
                                    const moduleItem = await uploadModuleFile(course.id, module.id, file, file.name);

                                    // Add to module (this updates state and syncs to Firestore automatically)
                                    addModuleItem(course.id, module.id, moduleItem);

                                    uploadedCount++;
                                    console.log(`✓ Uploaded: ${file.name}`);
                                  } catch (fileError) {
                                    console.error(`Error uploading ${file.name}:`, fileError);
                                    failedFiles.push(file.name);
                                    toast.error(
                                      `Failed to upload ${file.name}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`,
                                      { id: toastId }
                                    );
                                  }
                                }

                                // Final summary
                                if (uploadedCount > 0 && failedFiles.length === 0) {
                                  toast.success(`✓ Successfully uploaded ${uploadedCount} file(s) to Week ${module.week}`, { id: toastId });
                                } else if (uploadedCount > 0 && failedFiles.length > 0) {
                                  toast.info(`Uploaded ${uploadedCount}/${fileList.length}. Failed: ${failedFiles.join(', ')}`, { id: toastId });
                                } else {
                                  toast.error(`Failed to upload files.`, { id: toastId });
                                }
                              } catch (error) {
                                console.error('[ModuleUpload] Error:', error);
                                toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="gap-2"
                          >
                            <span
                              role="button"
                              tabIndex={0}
                              className="inline-flex items-center gap-2"
                              onClick={() =>
                                document.getElementById(`mod-upload-empty-${module.id}`)?.click()
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ')
                                  document
                                    .getElementById(`mod-upload-empty-${module.id}`)
                                    ?.click();
                              }}
                            >
                              <Upload className="h-4 w-4" />
                              Upload file
                            </span>
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-4 text-center">No materials posted for this week yet.</p>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : isProfessor ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-14 px-6 text-center space-y-4">
                    <div className="rounded-full bg-muted p-4">
                      <FolderOpen className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <div className="space-y-1 max-w-md">
                      <p className="text-lg font-semibold text-foreground">No modules yet</p>
                      <p className="text-sm text-muted-foreground">
                        Create a week to organize content, or upload a file from your PC — we will add a week and attach the file for you.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2 w-full max-w-md">
                      <Button
                        type="button"
                        className="gap-2"
                        onClick={() => {
                          setShowAddModule(true);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Add module {newModuleFiles.length > 0 && `with ${newModuleFiles.length} file(s)`}
                      </Button>
                      {/* New-week upload hidden per professor UI request */}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {/* Learning Modules (RAW PDFs, no extraction) */}
              <div className="border-t border-border pt-8 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-lg font-semibold">Learning Modules</h3>
                    <p className="text-sm text-muted-foreground">
                      PDFs students can open and read (original file, no extraction)
                    </p>
                  </div>
                  {isProfessor && (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowAddLearningModule(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Add Learning Module
                    </Button>
                  )}
                </div>

                {(learningModuleContainer?.items?.length ?? 0) > 0 ? (
                  <Card>
                    <CardContent className="p-4">
                      {isProfessor ? (
                        <Accordion type="multiple" className="w-full">
                          {(learningModuleContainer?.items || []).map((item, idx) => (
                            <AccordionItem key={item.id || `learning-${idx}`} value={String(item.id || idx)}>
                              <AccordionTrigger className="hover:no-underline">
                                <span className="truncate">{item.title || item.fileName || `Learning module ${idx + 1}`}</span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="pt-2">
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                      <ModuleItemRow
                                        item={item}
                                        isProfessor={isProfessor}
                                        courseId={String(course.id)}
                                        moduleId={String(learningModuleContainer?.id || '')}
                                        showPdfViewerButton={true}
                                      />
                                      {renderLinkedAssignments(item)}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive shrink-0"
                                      onClick={() => void handleDeleteLearningModuleItem(item)}
                                      aria-label="Delete learning module"
                                      title="Delete learning module"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      ) : (
                        <Accordion type="single" collapsible className="w-full">
                          {(learningModuleContainer?.items || []).map((item, idx) => (
                            <AccordionItem key={item.id || `learning-${idx}`} value={String(item.id || idx)}>
                              <AccordionTrigger className="hover:no-underline">
                                <span className="truncate">
                                  {item.title || item.fileName || `Learning module ${idx + 1}`}
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="pt-2">
                                  <ModuleItemRow
                                    item={item}
                                    isProfessor={isProfessor}
                                    courseId={String(course.id)}
                                    moduleId={String(learningModuleContainer?.id || '')}
                                    showPdfViewerButton={true}
                                  />
                                  {renderLinkedAssignments(item)}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No learning modules uploaded yet.
                  </p>
                )}

                <Dialog open={showAddLearningModule} onOpenChange={setShowAddLearningModule}>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Add Learning Module</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Module Title</Label>
                        <Input
                          value={learningModuleTitle}
                          onChange={(e) => {
                            learningModuleTitleAutoRef.current = false;
                            setLearningModuleTitle(e.target.value);
                          }}
                          placeholder="e.g. Week 1 Reading"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Upload PDF</Label>
                        <Input
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setLearningModuleFile(file);
                            if (file) {
                              const derived = deriveCleanTitleFromFilename(file.name);
                              if (
                                derived &&
                                (!learningModuleTitle.trim() || learningModuleTitleAutoRef.current)
                              ) {
                                setLearningModuleTitle(derived);
                                learningModuleTitleAutoRef.current = true;
                              }
                            }
                          }}
                        />
                        {learningModuleFile && (
                          <p className="text-xs text-muted-foreground">
                            Selected: {learningModuleFile.name}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowAddLearningModule(false);
                          setLearningModuleTitle('');
                          setLearningModuleFile(null);
                          learningModuleTitleAutoRef.current = false;
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="button" onClick={() => void handleAddLearningModule()}>
                        Add
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Student "Activities" table removed (activities are shown via linked dropdowns under Learning Modules). */}
            </div>
          )}

          {!isProfessor && activeTab === 'exams' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Quizzes / Assessments</h2>
              {assessments.length > 0 ? (
                assessments.map((assessment) => {
                  const dueOk = isExamWithinDueWindow(assessment);
                  const startDisabled = !isStudentEnrolled || !dueOk;
                  const sub = (assessment.submissions || []).find((s) => String(s.studentId) === String(studentId));
                  const max = sub?.maxScore ?? assessment.maxScore ?? 100;
                  const scoreLabel =
                    sub?.score != null && !Number.isNaN(sub.score as any)
                      ? `${sub.score} / ${max}`
                      : sub
                        ? 'Submitted'
                        : '—';
                  const dueLabel = assessment.dueDate ? new Date(assessment.dueDate).toLocaleString() : 'Not set';
                  return (
                    <Card key={assessment.id} className="mb-6 overflow-hidden border-2 border-blue-500">
                      <CardHeader className="bg-blue-500 pb-6 text-white">
                        <CardTitle className="flex flex-col gap-1 text-center">
                          <span>{assessment.title}</span>
                          <span className="text-xs font-normal uppercase tracking-wide opacity-90">
                            {(assessment.assessmentType || 'exam') === 'quiz' ? 'Quiz' : 'Assessment'} · Max{' '}
                            {assessment.maxScore ?? 100} pts
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-center">
                        <div className="mb-4 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground sm:gap-6">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{assessment.duration} min</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <HelpCircle className="h-4 w-4" />
                            <span>{assessment.questions ?? 0} Questions</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CalendarDays className="h-4 w-4" />
                            <span>Due: {dueLabel}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Award className="h-4 w-4" />
                            <span>Score: {scoreLabel}</span>
                          </div>
                          <div className="flex items-center gap-1 max-w-md text-center">
                            <Shield className="h-4 w-4 shrink-0 text-blue-600" />
                            <span className="text-xs sm:text-sm">{detectorSummary(assessment)}</span>
                          </div>
                        </div>
                        {!isStudentEnrolled ? (
                          <p className="mb-3 text-sm text-destructive">You are not enrolled in this course.</p>
                        ) : null}
                        {isStudentEnrolled && !dueOk ? (
                          <p className="mb-3 text-sm text-destructive">This assessment is past its due date.</p>
                        ) : null}
                        <Button
                          type="button"
                          disabled={startDisabled}
                          onClick={() => openExamStart(assessment)}
                          className="w-full bg-green-600 hover:bg-green-700 sm:w-64"
                        >
                          Start assessment
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    No quizzes or assessments yet.
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {isProfessor && activeTab === 'assignments' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Activities</h2>
              {isProfessor && (
                <Card className="border-primary/40">
                  <CardHeader>
                    <CardTitle className="text-lg">Create activity</CardTitle>
                    <p className="text-sm text-muted-foreground font-normal">
                      Title, description, due date, and optional file for students to download.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Title</label>
                      <Select value={assignTitle} onValueChange={setAssignTitle}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select activity" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 10 }, (_, i) => `Activity ${i + 1}`).map((label) => (
                            <SelectItem key={label} value={label}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Learning module</label>
                      <Select value={assignLinkedModuleItemId} onValueChange={setAssignLinkedModuleItemId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose uploaded module" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No linked module</SelectItem>
                          {learningModuleItems.map((item, idx) => (
                            <SelectItem key={item.id || `assignment-module-${idx}`} value={String(item.id)}>
                              {item.title || item.fileName || `Learning module ${idx + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pick which uploaded learning module should display this activity in its dropdown.
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={assignDescription}
                        onChange={(e) => setAssignDescription(e.target.value)}
                        placeholder="Instructions for students"
                        rows={4}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Due date</label>
                      <Input type="datetime-local" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Attachment (optional)</label>
                      <Input type="file" onChange={(e) => setAssignFile(e.target.files?.[0] || null)} />
                      {assignFile && (
                        <p className="text-xs text-muted-foreground mt-1">{assignFile.name}</p>
                      )}
                    </div>
                    <Button type="button" onClick={() => void handleAddAssignment()}>
                      Publish activity
                    </Button>
                  </CardContent>
                </Card>
              )}

              {courseAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activities posted yet.</p>
              ) : (
                courseAssignments.map((a) => (
                  <Card key={a.id}>
                    <CardHeader className="bg-muted/50 py-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <CardTitle className="text-lg">{a.title}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{a.description}</p>
                        </div>
                        {isProfessor && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive shrink-0"
                            onClick={() => removeCourseAssignment(course.id, a.id)}
                            aria-label="Delete activity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>
                          Due:{' '}
                          {a.dueDate ? new Date(a.dueDate).toLocaleString() : 'Not set'}
                        </span>
                      </div>
                      {a.dataUrl && (
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" asChild>
                            <a href={a.dataUrl} download={a.fileName || 'attachment'} className="gap-1 inline-flex items-center">
                              <Download className="h-4 w-4" />
                              {isProfessor ? 'View / download file' : 'Download'}
                            </a>
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {isProfessor && activeTab === 'exams' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Quizzes / Assessments</h2>
              <div className="flex justify-end">
                <Button type="button" onClick={() => setShowCreateAssessment(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create assessment / quiz
                </Button>
              </div>
              {assessments.length > 0 ? (
                assessments.map((assessment) => (
                  <Card key={assessment.id} className="border-2 border-blue-500 mb-6 overflow-hidden">
                    <CardHeader className="bg-blue-500 text-white pb-6 mb-6">
                      <CardTitle className="text-center flex flex-col gap-1">
                        <span>{assessment.title}</span>
                        <span className="text-xs font-normal opacity-90 uppercase tracking-wide">
                          {(assessment.assessmentType || 'exam') === 'quiz' ? 'Quiz' : 'Assessment'} · Max {assessment.maxScore ?? 100} pts
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm text-muted-foreground mb-6">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{assessment.duration} min</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <HelpCircle className="w-4 h-4" />
                          <span>{assessment.questions ?? 0} Questions</span>
                        </div>
                        <div className="flex items-center gap-1 max-w-md text-center">
                          <Shield className="w-4 h-4 shrink-0 text-blue-600" />
                          <span className="text-xs sm:text-sm">{detectorSummary(assessment)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4">
                        Navigation:{' '}
                        {assessment.allowQuestionNavigation !== false
                          ? 'Students can move between questions'
                          : 'Linear assessment — no backtracking'}
                      </p>
                      <div className="flex flex-col sm:flex-row items-stretch justify-center gap-2 sm:gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => setEditAdvancedAssessment(assessment)}
                        >
                          Advanced settings
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="w-full sm:w-auto"
                          onClick={() => {
                            const ok = window.confirm(
                              `Delete "${assessment.title}"? This will permanently remove this assessment/quiz.`
                            );
                            if (!ok) return;
                            removeAssessment(course.id, assessment.id);
                            toast.success('Assessment deleted.');
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                        <Button
                          type="button"
                          onClick={() => openExamStart(assessment)}
                          className="w-full sm:w-64 bg-green-600 hover:bg-green-700"
                        >
                          START ASSESSMENT
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    No quizzes or assessments yet.
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {isProfessor && activeTab === 'attendance' && (
            <CourseAttendanceTab
              courseId={course.id}
              courseName={course.name}
              enrolledStudentIds={(fullCourse?.enrolledStudents ?? []).map(String)}
            />
          )}

          {activeTab === 'announcements' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Announcements</h2>
              {isProfessor && (
                <Card className="p-4 space-y-3">
                  <Textarea
                    placeholder="Write an announcement for everyone enrolled in this course…"
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    rows={4}
                  />
                  <Button type="button" onClick={handleSendAnnouncement}>
                    Post announcement
                  </Button>
                </Card>
              )}
              <div className="space-y-3">
                {announcements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No announcements yet.</p>
                ) : (
                  announcements.map((a) => (
                    <Card key={a.id}>
                      <CardContent className="p-4">
                        <p className="whitespace-pre-wrap">{a.text}</p>
                        <p className="text-xs text-muted-foreground mt-2">{new Date(a.date).toLocaleString()}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'scores' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">{isProfessor ? 'Scores & gradebook' : 'My grades'}</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Activity</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Type</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Due date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Score</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(isProfessor ? assessments : filteredAssessmentsForStudentScores).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-muted-foreground">
                          No graded activities yet.
                        </td>
                      </tr>
                    ) : (
                      (isProfessor ? assessments : filteredAssessmentsForStudentScores).map((item) => (
                        <tr key={item.id} className="border-b hover:bg-muted/50">
                          <td className="px-4 py-4 font-medium">{item.title}</td>
                          <td className="px-4 py-4 text-sm text-muted-foreground capitalize">
                            {item.assessmentType || 'exam'}
                          </td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">
                            {item.dueDate
                              ? new Date(item.dueDate).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                              : '—'}
                          </td>
                          <td className="px-4 py-4 font-bold text-sm">
                            {isProfessor ? scoreSummary(item) : studentScoreCell(item)}
                          </td>
                          <td className="px-4 py-4">
                            <Button
                              size="sm"
                              type="button"
                              onClick={() => {
                                if (isProfessor) openGradebook(item);
                                else setStudentGradeView(item);
                              }}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {isProfessor ? (
                <CourseExamResultsTable courseId={course.id} assessments={assessments} />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {showAddModule && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add module (week)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Module title</label>
                <Input
                  placeholder="e.g. Introduction"
                  value={newModuleTitle}
                  onChange={(e) => {
                    newModuleTitleAutoRef.current = false;
                    setNewModuleTitle(e.target.value);
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Week number</label>
                <Input
                  type="number"
                  placeholder="1"
                  value={newModuleWeek}
                  onChange={(e) => setNewModuleWeek(e.target.value)}
                />
              </div>

              <div className="border-t pt-4">
                <label className="text-sm font-medium mb-3 block">Upload PDF/Files (Optional)</label>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => addModuleFileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') addModuleFileInputRef.current?.click();
                  }}
                  className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer relative group"
                >
                  <input
                    ref={addModuleFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,application/pdf,application/msword,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                    onChange={handleAddModuleFileSelect}
                    className="hidden"
                  />
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload PDF, Word, Text, or PowerPoint files
                  </p>
                </div>

                {newModuleFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium">Selected Files ({newModuleFiles.length}):</p>
                    {newModuleFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveAddModuleFile(index)}
                          className="flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="button" onClick={() => void handleAddModule()} className="flex-1">
                  Add module {newModuleFiles.length > 0 && `with ${newModuleFiles.length} file(s)`}
                </Button>
                <Button type="button" variant="outline" onClick={() => {
                   setShowAddModule(false);
                   setNewModuleTitle('');
                   setNewModuleWeek('');
                   newModuleTitleAutoRef.current = false;
                   setNewModuleFiles([]);
                 }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <CreateCourseAssessmentDialog
        open={showCreateAssessment}
        onOpenChange={setShowCreateAssessment}
        courseId={String(course.id)}
        modules={(hydratedModules && hydratedModules.length > 0 ? hydratedModules : modules).filter(
          (m) => !(m.week === 0 && m.title === 'Learning Modules')
        )}
        onCreate={handleCreateAssessment}
      />

      <EditAssessmentAdvancedDialog
        open={Boolean(editAdvancedAssessment)}
        assessment={editAdvancedAssessment}
        onOpenChange={(open) => {
          if (!open) setEditAdvancedAssessment(null);
        }}
        onSave={(patch) => {
          if (!editAdvancedAssessment) return;
          updateAssessment(course.id, editAdvancedAssessment.id, {
            ...patch,
            activeExamDetectors: undefined,
          });
          void syncExamDocumentToFirestore(course.id, editAdvancedAssessment.id, {
            title: editAdvancedAssessment.title,
            useGlobalDetectors: patch.useGlobalDetectors,
            detectors: patch.detectors,
            allowQuestionNavigation: patch.allowQuestionNavigation,
          }).catch((e) => console.warn('Could not sync exam settings to Firestore:', e));
        }}
      />

      <AssessmentStartDialog
        open={Boolean(takeExamModal)}
        assessment={takeExamModal}
        courseId={course.id}
        studentId={studentId}
        isEnrolledInCourse={isProfessor || isStudentEnrolled}
        isWithinDueWindow={takeExamModal ? isExamWithinDueWindow(takeExamModal) : true}
        onOpenChange={(open) => {
          if (!open) setTakeExamModal(null);
        }}
        onStart={handleStudentStartAssessment}
      />

      {gradebook && isProfessor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="w-full max-w-3xl my-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Gradebook · {gradebook.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Enter scores for students who took this {(gradebook.assessmentType || 'exam') === 'quiz' ? 'quiz' : 'assessment'}. Use &quot;Add enrolled&quot; to create rows from the course roster.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={seedEnrolled}>
                  Add enrolled students
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addManualGradeRow}>
                  Add manual row
                </Button>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Student</th>
                      <th className="px-3 py-2 text-left">ID</th>
                      <th className="px-3 py-2 text-left">Score</th>
                      <th className="px-3 py-2 text-left">Max</th>
                      <th className="px-3 py-2 text-left">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          No rows yet. Use &quot;Add enrolled students&quot; or &quot;Add manual row&quot;, then enter scores.
                        </td>
                      </tr>
                    ) : (
                      gradeRows.map((row, i) => (
                        <tr key={`${row.studentId}-${i}`} className="border-t">
                          <td className="px-3 py-2">
                            <Input
                              value={row.studentName}
                              onChange={(e) => {
                                const next = [...gradeRows];
                                next[i] = { ...row, studentName: e.target.value };
                                setGradeRows(next);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{row.studentId}</td>
                          <td className="px-3 py-2 w-24">
                            <Input
                              type="number"
                              value={row.score ?? ''}
                              placeholder="—"
                              onChange={(e) => {
                                const v = e.target.value;
                                const next = [...gradeRows];
                                next[i] = {
                                  ...row,
                                  score: v === '' ? null : Number(v),
                                };
                                setGradeRows(next);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 w-20">
                            <Input
                              type="number"
                              value={row.maxScore}
                              onChange={(e) => {
                                const next = [...gradeRows];
                                next[i] = { ...row, maxScore: Number(e.target.value) || 0 };
                                setGradeRows(next);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setGradebook(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveGradebook}>
                  Save grades
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {studentGradeView && !isProfessor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{studentGradeView.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const sub = studentOwnSubmission(studentGradeView);
                if (!sub) {
                  return <p className="text-sm text-muted-foreground">No score recorded for you yet.</p>;
                }
                return (
                  <>
                    <p className="text-lg font-semibold">
                      {sub.score != null ? `${sub.score} / ${sub.maxScore}` : `Pending / ${sub.maxScore}`}
                    </p>
                    {sub.submittedAt && (
                      <p className="text-xs text-muted-foreground">Submitted {new Date(sub.submittedAt).toLocaleString()}</p>
                    )}
                  </>
                );
              })()}
              <Button type="button" variant="outline" onClick={() => setStudentGradeView(null)}>
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

function ModuleItemRow({
  item,
  isProfessor,
  courseId,
  moduleId,
  showPdfViewerButton = false,
}: {
  item: ModuleItem;
  isProfessor: boolean;
  courseId: string;
  moduleId: string;
  /**
   * Learning Modules = raw PDFs (no extraction) → allow PDF viewer.
   * Extracted modules/files → hide PDF viewer button (original PDF may not exist).
   */
  showPdfViewerButton?: boolean;
}) {
  const [inlinePdfOpen, setInlinePdfOpen] = useState(false);
  const [inlinePdfSrc, setInlinePdfSrc] = useState<string | null>(null);
  const [inlinePdfError, setInlinePdfError] = useState<string | null>(null);
  const inlinePdfBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Cleanup any generated Blob URLs when closing the fullscreen viewer.
    if (inlinePdfOpen) return;
    if (inlinePdfBlobUrlRef.current) {
      URL.revokeObjectURL(inlinePdfBlobUrlRef.current);
      inlinePdfBlobUrlRef.current = null;
    }
    setInlinePdfSrc(null);
    setInlinePdfError(null);
  }, [inlinePdfOpen]);

  useEffect(() => {
    return () => {
      if (inlinePdfBlobUrlRef.current) {
        URL.revokeObjectURL(inlinePdfBlobUrlRef.current);
        inlinePdfBlobUrlRef.current = null;
      }
    };
  }, []);

  const resolvePdfUrl = async (): Promise<string> => {
    // 0) If we already stored a download URL (preferred for learning modules), use it.
    if (item.downloadUrl && String(item.downloadUrl).startsWith('http')) {
      return String(item.downloadUrl);
    }

    // 1) If a PDF dataUrl was stored (legacy), use it directly.
    if (item.dataUrl && String(item.dataUrl).startsWith('data:application/pdf')) {
      return String(item.dataUrl);
    }

    // 1.5) If Storage is unavailable (no billing plan), learning PDFs are stored in Firestore chunks.
    if (item?._metadata?.storage === 'firestoreChunks' && courseId && moduleId) {
      const chunksRef = collection(
        db,
        'courses',
        String(courseId),
        'modules',
        String(moduleId),
        'learningPdfFiles',
        String(item.id),
        'chunks'
      );
      const snap = await getDocs(query(chunksRef, orderBy('index', 'asc')));
      const parts: Uint8Array[] = [];
      let total = 0;
      snap.forEach((d) => {
        const data: any = d.data();
        const bytes: Uint8Array | undefined = data?.data?.toUint8Array?.();
        if (bytes) {
          parts.push(bytes);
          total += bytes.byteLength;
        }
      });
      if (parts.length === 0) throw new Error('No PDF chunks found in Firestore.');

      const merged = new Uint8Array(total);
      let offset = 0;
      for (const p of parts) {
        merged.set(p, offset);
        offset += p.byteLength;
      }

      const blob = new Blob([merged], { type: item.mimeType || 'application/pdf' });
      return URL.createObjectURL(blob);
    }

    // 2) Try Firebase Storage path (preferred).
    if (item.storageUrl) {
      const storage = getStorage();
      const fileRef = ref(storage, item.storageUrl);

      // Try a normal download URL first.
      try {
        const url = await getDownloadURL(fileRef);
        return url;
      } catch {
        // Fall back to bytes → Blob URL (more robust when download URLs are restricted).
      }

      const bytes = await getBytes(fileRef);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    }

    throw new Error('PDF file not available.');
  };

  const openPdfInline = async () => {
    setInlinePdfOpen(true);
    setInlinePdfSrc(null);
    setInlinePdfError(null);
    try {
      const url = await resolvePdfUrl();
      if (url.startsWith('blob:')) inlinePdfBlobUrlRef.current = url;
      setInlinePdfSrc(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setInlinePdfError(msg);
    }
  };

  const openPdfFullscreen = async () => {
    // Open a blank tab immediately (avoids popup blockers), then render the PDF inside it.
    // Note: avoid "noopener/noreferrer" here because some browsers treat about:blank as a different origin
    // which can break blob/data URL rendering and result in a blank tab.
    const w = window.open('about:blank', '_blank');
    if (!w) {
      // Some browsers/environments (or embedded webviews) block popups.
      // Fallback: show an in-page fullscreen viewer instead.
      void openPdfInline();
      return;
    }
    try {
      w.document.title = item.fileName || item.title || 'PDF';
      w.document.body.innerHTML = '<p style="font-family:system-ui;padding:16px">Loading PDF…</p>';
    } catch {
      // ignore cross-browser restrictions
    }

    try {
      const url = await resolvePdfUrl();

      // Render inside the opened tab for a consistent "fullscreen" experience.
      // This also works better than direct navigation for blob/data URLs in some browsers.
      try {
        w.document.open();
        w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${String(item.fileName || item.title || 'PDF').replace(/</g, '&lt;')}</title>
    <style>
      html, body { height: 100%; margin: 0; background: #0b1220; }
      .bar { height: 44px; display: flex; align-items: center; padding: 0 12px; gap: 12px; color: #e5e7eb; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .bar .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
      .bar a { color: #93c5fd; text-decoration: none; font-size: 12px; }
      iframe { width: 100%; height: calc(100% - 44px); border: 0; background: #111827; }
    </style>
  </head>
  <body>
    <div class="bar">
      <div class="title">${String(item.fileName || item.title || 'PDF').replace(/</g, '&lt;')}</div>
      <a id="openRaw" href="#" target="_blank" rel="noopener">Open raw</a>
    </div>
    <iframe id="pdfFrame" title="PDF viewer"></iframe>
    <script>
      (function () {
        var url = ${JSON.stringify(url)};
        var frame = document.getElementById('pdfFrame');
        var link = document.getElementById('openRaw');
        if (frame) frame.src = url;
        if (link) link.href = url;
      })();
    </script>
  </body>
</html>`);
        w.document.close();
      } catch {
        // Fallback if document writing is blocked for any reason.
        w.location.href = url;
      }

      // If we created a blob URL, revoke it later to avoid leaking memory.
      if (url.startsWith('blob:')) {
        window.setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
        }, 10 * 60 * 1000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      try {
        w.document.body.innerHTML = `<p style="font-family:system-ui;padding:16px;color:#b91c1c">Failed to load PDF: ${msg}</p>`;
      } catch {
        // ignore
      }
      toast.error(`Failed to open PDF: ${msg}`);
    }
  };

  const icon =
    item.type === 'pdf' ? (
      <FileText className="w-5 h-5 text-blue-500" />
    ) : item.type === 'video' ? (
      <Play className="w-5 h-5 text-red-500" />
    ) : (
      <Upload className="w-5 h-5 text-emerald-600" />
    );

  // Format file size
  const formatSize = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format upload date
  const formatDate = (date?: Date | string) => {
    if (!date) return '';
    // Support Firestore Timestamp, ISO strings, and Date objects
    const anyDate: any = date as any;
    const d =
      anyDate instanceof Date
        ? anyDate
        : typeof anyDate === 'string'
          ? new Date(anyDate)
          : typeof anyDate?.toDate === 'function'
            ? anyDate.toDate()
            : typeof anyDate?.seconds === 'number'
              ? new Date(anyDate.seconds * 1000)
              : new Date(anyDate);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const sizeStr = formatSize(item.fileSize);
  const dateStr = formatDate(item.uploadedAt);
  const contentIndicator = item.fileContent && item.fileContent.length > 0
    ? ` • ${item.fileContent.length} chars extracted`
    : '';

  const meta =
    item.type === 'pdf'
      ? `PDF • ${sizeStr}${dateStr ? ` • ${dateStr}` : ''}${contentIndicator}`
      : item.type === 'video'
        ? `Video • ${item.duration || '—'}`
        : `${item.fileName || 'File'} • ${sizeStr}${dateStr ? ` • ${dateStr}` : ''}`;

  return (
    <>
      <div className="flex items-center justify-between gap-3 p-3 hover:bg-muted rounded-lg transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          {icon}
          <div className="min-w-0">
            <p className="font-medium truncate">{item.title}</p>
            <p className="text-xs text-muted-foreground">{meta}</p>
          </div>
        </div>
        {item.type === 'pdf' && showPdfViewerButton && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1 inline-flex items-center"
            onClick={() => void openPdfFullscreen()}
          >
            <FileText className="h-4 w-4" />
            View PDF
          </Button>
        )}
        {item.type === 'file' && item.dataUrl && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={item.dataUrl}
              download={item.fileName || 'download'}
              className="shrink-0 gap-1 inline-flex items-center"
            >
              <Download className="h-4 w-4" />
              {isProfessor ? 'View' : 'Download'}
            </a>
          </Button>
        )}
      </div>

      {inlinePdfOpen ? (
        <div className="fixed inset-0 z-[200] bg-background">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">{item.fileName || item.title || 'PDF'}</p>
              <p className="text-xs text-muted-foreground truncate">
                Fullscreen preview (popup blocked, so opened in-page)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void openPdfFullscreen()}>
                Open in new tab
              </Button>
              <Button type="button" onClick={() => setInlinePdfOpen(false)}>
                Close
              </Button>
            </div>
          </div>

          <div className="h-[calc(100vh-56px)]">
            {inlinePdfSrc ? (
              <PdfViewer fileUrl={inlinePdfSrc} />
            ) : inlinePdfError ? (
              <div className="p-6">
                <p className="text-sm text-destructive">Failed to load PDF: {inlinePdfError}</p>
              </div>
            ) : (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">Loading PDF…</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default CourseDetails;
