import { useEffect, useState } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { AssessmentProvider } from '@/context/AssesmentContext';
import { SessionProvider } from '@/context/SessionContext';
import type { CourseExamLaunch } from '@/context/SessionContext';

import { LoginScreen } from '@/components/auth/LoginScreen';
import { RegisterScreen } from '@/components/auth/RegisterScreen';
import { AppLayout } from '@/components/layout/AppLayout';
import { InstructorDashboard } from '@/components/dashboard/InstructorDashboard';
import { StudentDashboard } from '@/components/dashboard/StudentsDashboard';
import { ExamInstructions } from '@/components/exam/ExamInstruction';
import { ExamInterface } from '@/components/exam/ExamInterface';
import type { ExamFinishPayload } from '@/components/exam/ExamInterface';
import { ScoreDisplay } from '@/components/exam/ScoreDisplay';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ReportsPanel } from '@/components/reports/ReporstPanel';
import { CoursesPanel } from '@/components/courses/CoursesDetails';
import { ModulesPanel } from '@/components/modules/ModulewsPAnel';
import { ToolsPanel } from '@/components/tools/ToolsPanel';
import { MyCoursesPanel } from '@/components/student/MycoursePanel';
import { LearningMaterialsPanel } from '@/components/student/LearningMaterialsPanel';
import { ActiveExamsPanel as StudentActiveExamsPanel } from '@/components/student/ActiveExamsPanel';
import { CompletedExamsPanel } from '@/components/student/CompletedExamsPanel';
import { LogsPanel } from '@/components/logs/LogsPanel';
import { CreateAssessmentPanel } from '../components/assessment/CreateAssesmentsPanel';
import { ActiveExamsPanel } from '@/components/assessment/ActiveExamsPanel';
import { CalendarPanel } from "@/components/dashboard/CalendarPanel";
import { signOut } from "firebase/auth";
import { addDoc, collection, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import {
  computeGradedExamScore,
  saveCourseExamResultToFirestore,
} from '@/utils/examResultsFirestore';
import { mergeAssessmentSubmission } from '@/utils/examSession';
import { StudentAssessmentsPanel } from '@/components/student/StudentAssessmentsPanel';

type AuthScreen = 'login' | 'register';
type ExamState = 'none' | 'instructions' | 'active' | 'completed';

const InnerAppContent = () => {
  const { updateAssessment } = useSession();
  const { user: authUser } = useAuth();
const [user, setUser] = useState<any>(() => {
  const stored = localStorage.getItem("user");
  return stored ? JSON.parse(stored) : null;
});
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [activeTab, setActiveTab] = useState('dashboard');



  const [examState, setExamState] = useState<ExamState>('none');
  const [examAnswers, setExamAnswers] = useState<Record<number, string>>({});
  const [lastFinishPayload, setLastFinishPayload] = useState<ExamFinishPayload | null>(null);
  const [courseExamLaunch, setCourseExamLaunch] = useState<CourseExamLaunch | null>(null);

  useEffect(() => {
    if (user?.role === 'professor' && activeTab === 'calendar') {
      setActiveTab('dashboard');
    }
  }, [user?.role, activeTab]);

const handleLogout = async () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  try {
    await addDoc(collection(db, "tab_logs"), {
      userId: user?.uid || "",
      user: user.name,
      role: user.role,
      event: "logout",
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Could not log logout to Firestore:", e);
  }

  try {
    await signOut(auth);
  } catch (e) {
    console.warn("Firebase signOut failed:", e);
  }

  // CLEAR ALL CACHED USER DATA on logout to prevent old profile appearing for next user
  localStorage.removeItem("user");
  localStorage.removeItem("userProfile");
  setUser(null);
  setActiveTab("dashboard");
};
  if (!user) {
    return authScreen === 'login' ? (
      <LoginScreen
        onLogin={(name, role) => {
          const existing = JSON.parse(localStorage.getItem("user") || "{}");
          const userData = {
            ...existing,
            name,
            role: (role || "student").toLowerCase(),
          };
          localStorage.setItem("user", JSON.stringify(userData));
          setUser(userData);
        }}

  onSwitchToRegister={() => setAuthScreen('register')}
/>
    ) : (
      <RegisterScreen 
        onSwitchToLogin={() => setAuthScreen('login')}
        onRegisterSuccess={async (uid, name, role) => {
          // Clear old cached profile data to prevent wrong user from appearing
          localStorage.removeItem('userProfile');
          
          // Load complete user profile from Firestore to ensure all profile fields are available
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const completeUser = {
              uid,
              name: userData.name || name,
              email: userData.email || '',
              studentNumber: userData.studentNumber || '',
              course: userData.course || '',
              year: userData.year || '',
              role: (role || "student").toLowerCase(),
            };
            localStorage.setItem("user", JSON.stringify(completeUser));
            setUser(completeUser);
          } else {
            // Fallback if document doesn't exist yet
            const userData = {
              uid,
              name,
              email: '',
              role: (role || "student").toLowerCase(),
            };
            localStorage.setItem("user", JSON.stringify(userData));
            setUser(userData);
          }
        }}
      />
    );
  }

  if (examState === 'instructions') {
    return (
      <ExamInstructions
        examTitle={courseExamLaunch?.assessment.title}
        assessment={courseExamLaunch?.assessment}
        onStart={() => setExamState('active')}
      />
    );
  }

  if (examState === 'active') {
    return (
      <ExamInterface
        assessment={courseExamLaunch?.assessment}
        examContext={
          courseExamLaunch
            ? {
                courseTitle: courseExamLaunch.courseTitle,
                examTitle: courseExamLaunch.assessment.title,
                assessmentId: courseExamLaunch.assessment.id,
              }
            : undefined
        }
        onFinish={(payload) => {
          setLastFinishPayload(payload);
          setExamAnswers(payload.answers);

          const role = String(user?.role || '').toLowerCase();
          if (courseExamLaunch && role === 'student') {
            const sid = resolveEnrollmentStudentId(authUser);
            const graded = computeGradedExamScore(
              payload.answers,
              payload.sessionQuestions,
              courseExamLaunch.assessment
            );
            void saveCourseExamResultToFirestore({
              courseId: courseExamLaunch.courseId,
              examId: courseExamLaunch.assessment.id,
              studentId: sid,
              studentName: user?.name || 'Student',
              score: graded.score,
              totalItems: graded.totalItems,
            }).catch((e) => console.warn('Could not save exam result to Firestore:', e));

            const merged = mergeAssessmentSubmission(
              courseExamLaunch.assessment.submissions,
              {
                studentId: sid,
                studentName: user?.name || 'Student',
                score: graded.score,
                maxScore: graded.maxScore,
                submittedAt: new Date().toISOString(),
              }
            );
            updateAssessment(courseExamLaunch.courseId, courseExamLaunch.assessment.id, {
              submissions: merged,
            });
          }

          setExamState('completed');
        }}
      />
    );
  }

  if (examState === 'completed') {
    return (
      <ScoreDisplay
        answers={examAnswers}
        sessionQuestions={lastFinishPayload?.sessionQuestions}
        assessment={courseExamLaunch?.assessment}
        onReturnToDashboard={() => {
          setExamState('none');
          setExamAnswers({});
          setLastFinishPayload(null);
          setCourseExamLaunch(null);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  return (
 <AppLayout
  activeTab={activeTab}
  onTabChange={setActiveTab}
  onLogout={handleLogout}
>
  {/* Professor Routes */}
  {activeTab === 'dashboard' && user?.role === 'professor' && (
    <InstructorDashboard onNavigate={setActiveTab} />
  )}

  {activeTab === 'courses' && <CoursesPanel onNavigate={setActiveTab} />}
  {activeTab === 'modules' && <ModulesPanel />}

  {activeTab === 'create-assessment' && <CreateAssessmentPanel />}

  {activeTab === 'active-exams' && user?.role === 'professor' && (
    <ActiveExamsPanel />
  )}

  {activeTab === 'reports' && <ReportsPanel />}
  {activeTab === 'calendar' && user?.role === 'student' && <CalendarPanel />}
  {activeTab === 'tools' && <ToolsPanel />}

  {/* Student Routes */}
  {activeTab === 'dashboard' && user?.role === 'student' && (
    <StudentDashboard
      onStartExam={() => {
        setCourseExamLaunch(null);
        setExamState('instructions');
      }}
      onNavigate={setActiveTab}
    />
  )}

  {activeTab === 'assessments' && user?.role === 'student' && (
    <StudentAssessmentsPanel
      onNavigate={setActiveTab}
      onStartCourseExam={(ctx) => {
        setCourseExamLaunch(ctx);
        setExamState('instructions');
      }}
    />
  )}

  {activeTab === 'my-courses' && user?.role === 'student' && (
    <MyCoursesPanel
      onStartCourseExam={(ctx) => {
        setCourseExamLaunch(ctx);
        setExamState('instructions');
      }}
    />
  )}

  {activeTab === 'active-exams' && user?.role === 'student' && (
    <StudentActiveExamsPanel />
  )}

  {activeTab === 'completed-exams' && user?.role === 'student' && (
    <CompletedExamsPanel onNavigate={setActiveTab} />
  )}

  {/* Shared Routes */}
  {activeTab === 'settings' && <SettingsPanel />}
{activeTab === 'logs' && (
  <LogsPanel />
)}
</AppLayout>
  );
};

const Index = () => {
  return (
    <AuthProvider>
      <SessionProvider>
        <SettingsProvider>
          <AssessmentProvider>
            <InnerAppContent />
          </AssessmentProvider>
        </SettingsProvider>
      </SessionProvider>
    </AuthProvider>
  );
};

export default Index;
