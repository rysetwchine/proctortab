import { useState, useEffect } from 'react';
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/hooks/useSession';
import { formatJoinCode } from '@/utils/codeGenerator';
import { BookOpen, Users, Copy, Plus, CheckCircle } from 'lucide-react';
import { CourseDetails } from '../dashboard/Coursedetails';
import { CourseEnrolledStudents } from './CourseEnrolledStudents';
import { ExamInterface } from '../exam/ExamInterface';
import type { ExamFinishPayload } from '../exam/ExamInterface';
import { ScoreDisplay } from '../exam/ScoreDisplay';
import type { CourseAssessment } from '@/context/SessionContext';
import {
  getCurrentOwnerUid,
  getProfessorDisplayName,
  readStoredUser,
  resolveCourseInstructorName,
} from '@/utils/storedUser';
import { nextCourseAccentIndex } from '@/utils/courseSwatch';
import { toast } from 'sonner';
interface CoursesPanelProps {
  onNavigate?: (tab: string) => void;
}

export const CoursesPanel = ({ onNavigate }: CoursesPanelProps) => {
  const { sessions, createSession, deleteSession } = useSession();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<CourseAssessment | null>(null);
  const [examMode, setExamMode] = useState(false);
  const [professorExamSummary, setProfessorExamSummary] = useState<{
    assessment: CourseAssessment;
    payload: ExamFinishPayload;
  } | null>(null);
  const [rosterCourseId, setRosterCourseId] = useState<string | null>(null);
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#course=')) {
        setSelectedCourse(hash.replace('#course=', ''));
      } else {
        setSelectedCourse(null);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check initial hash

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleCourseClick = (courseId: string) => {
    window.location.hash = `course=${courseId}`;
  };

  const handleBack = () => {
    window.location.hash = '';
  };

  const stored = readStoredUser();
  const myOwnerUid = getCurrentOwnerUid();
  const isProfessor = String(stored.role || '').toLowerCase() === 'professor';

  const allCourseSessions = sessions.filter((s) => s.type === 'course');
  const courses =
    isProfessor && myOwnerUid
      ? allCourseSessions.filter((c) => !c.ownerUid || c.ownerUid === myOwnerUid)
      : allCourseSessions;

  const rosterCourse = rosterCourseId ? courses.find((c) => c.id === rosterCourseId) : undefined;
  if (rosterCourse) {
    return (
      <CourseEnrolledStudents
        course={rosterCourse}
        onBack={() => setRosterCourseId(null)}
      />
    );
  }

  if (selectedCourse) {
    const course = courses.find(c => c.id === selectedCourse);
    if (course) {
      if (professorExamSummary) {
        return (
          <div
            className="fixed inset-0 z-[100] bg-background overflow-y-auto"
            role="dialog"
            aria-label="Assessment results"
          >
            <ScoreDisplay
              answers={professorExamSummary.payload.answers}
              sessionQuestions={professorExamSummary.payload.sessionQuestions}
              assessment={professorExamSummary.assessment}
              onReturnToDashboard={() => setProfessorExamSummary(null)}
            />
          </div>
        );
      }

      if (examMode && selectedExam) {
        return (
          <div
            className="fixed inset-0 z-[100] bg-background overflow-y-auto"
            role="dialog"
            aria-label="Assessment"
          >
            <ExamInterface
              assessment={selectedExam}
              examContext={{
                courseTitle: course.title,
                examTitle: selectedExam.title,
                assessmentId: selectedExam.id,
              }}
              onFinish={(payload) => {
                setProfessorExamSummary({ assessment: selectedExam, payload });
                setExamMode(false);
                setSelectedExam(null);
              }}
            />
          </div>
        );
      }

      return (
        <CourseDetails
          course={{
            id: course.id,
            name: course.title,
            instructor: resolveCourseInstructorName(course),
            thumbnail: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&q=80',
          }}
          onBack={handleBack}
          onStartExam={(ctx) => {
            setSelectedExam(ctx.assessment);
            setExamMode(true);
          }}
          onNavigate={onNavigate}
        />
      );
    }
  }

  const handleCreateCourse = async () => {
    if (!newCourseTitle.trim()) return;

    const instructorName = getProfessorDisplayName();
    const ownerUid = getCurrentOwnerUid();
    const courseAccentIndex = nextCourseAccentIndex(sessions.filter((s) => s.type === 'course').length);

    const created = createSession({
      title: newCourseTitle,
      type: 'course',
      status: 'active',
      enrolledStudents: [],
      description: 'New course created',
      instructorName,
      courseAccentIndex,
      ...(ownerUid ? { ownerUid } : {}),
    });

    // SAVE TO FIREBASE (so other devices can join by code)
    const joinCodeNormalized = String(created.joinCode || '')
      .replace(/[-\s]/g, '')
      .toUpperCase();
    try {
      await setDoc(
        doc(db, "courses", String(created.id)),
        {
          title: created.title,
          type: created.type,
          status: created.status,
          joinCode: created.joinCode,
          joinCodeNormalized,
          instructorName: created.instructorName || '',
          ownerUid: created.ownerUid || '',
          courseAccentIndex: typeof created.courseAccentIndex === 'number' ? created.courseAccentIndex : 0,
          enrolledStudents: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error('[CoursesPanel] Failed to save course to Firestore:', e);
      toast.error(
        'Course was created locally, but failed to sync to cloud. Other devices will not be able to join until this is fixed (check Firestore rules / authentication).'
      );
    }

    setNewCourseTitle('');
    setShowCreateForm(false);
  };

  const copyJoinCode = async (code: string) => {
    const formattedCode = formatJoinCode(code);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(formattedCode);
      } else {
        // Fallback for older browsers or restricted iframes
        const textArea = document.createElement("textarea");
        textArea.value = formattedCode;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Fallback copy failed', err);
        }
        textArea.remove();
      }
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Still show copied state to user even if it failed in preview
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  return (
    <div className="space-y-6 relative min-h-[calc(100vh-100px)]">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Courses Management</h2>
      </div>

      {showCreateForm && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Create New Course</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Enter course title (e.g., Data Structures 101)"
              value={newCourseTitle}
              onChange={(e) => setNewCourseTitle(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={handleCreateCourse} className="flex-1">
                Create Course
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {courses.map((course) => (
          <Card key={course.id} className="hover:shadow-lg transition-shadow overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white pb-6">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                {course.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Instructor:</span>{' '}
                {resolveCourseInstructorName(course)}
              </p>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Join Code</p>
                  <p className="text-2xl font-bold font-mono">{formatJoinCode(course.joinCode)}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyJoinCode(course.joinCode)}
                  className="gap-2"
                >
                  {copiedCode === course.joinCode ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold">{course.enrolledStudents.length}</span>
                <span className="text-muted-foreground">students enrolled</span>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  size="sm"
                  onClick={() => setRosterCourseId(course.id)}
                >
                  View Details
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteSession(course.id)}
                >
                  Delete
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  size="sm"
                  onClick={() => handleCourseClick(course.id)}
                >
                  Open Course
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {courses.length === 0 && !showCreateForm && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Courses Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first course to get started
              </p>
              <Button onClick={() => setShowCreateForm(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Course
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Floating Action Button for Create Course */}
      {!showCreateForm && (
        <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center justify-center text-white bg-blue-600 rounded-full w-14 h-14 hover:bg-blue-700 shadow-xl transition-transform hover:scale-105"
            title="Create New Course"
          >
            <Plus className="w-8 h-8" />
          </button>
        </div>
      )}
    </div>
  );
};
