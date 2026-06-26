import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useSession } from '@/hooks/useSession';
import { type CourseExamLaunch } from '@/context/SessionContext';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { resolveCourseInstructorName } from '@/utils/storedUser';
import { cn } from '@/lib/utils';
import { BookOpen, User, ChevronRight, GraduationCap } from 'lucide-react';
import { StudentCourseDetails } from '@/components/student/StudentCourseDetails';
import { MotionBackground } from '@/components/shared/MotionBackground';
import { getStudentEnrollmentCourseIds } from '@/utils/studentEnrollments';

interface MyCoursesPanelProps {
  onStartCourseExam: (ctx: CourseExamLaunch) => void;
}

export const MyCoursesPanel = ({ onStartCourseExam }: MyCoursesPanelProps) => {
  const { sessions } = useSession();
  const { user } = useAuth();
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

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

  const sid = resolveEnrollmentStudentId(user);
  const locallyEnrolledCourseIds = getStudentEnrollmentCourseIds(sid);
  const myCourses = sessions.filter(
    (s) =>
      s.type === 'course' &&
      ((s.enrolledStudents ?? []).some((id) => String(id) === sid) ||
        locallyEnrolledCourseIds.includes(String(s.id)))
  );

  if (selectedCourse) {
    const course = myCourses.find(c => c.id === selectedCourse);
    if (course) {
      return (
        <StudentCourseDetails
          course={course}
          onBack={handleBack}
          onStartExam={onStartCourseExam}
        />
      );
    }
  }

  return (
    <MotionBackground>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6 lg:px-8 space-y-6 animate-in fade-in duration-300">
        
        {/* Top Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
              My Courses
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Select an enrolled course syllabus to continue learning, view modules, or take assessments.
            </p>
          </div>
          {myCourses.length > 0 && (
            <div className="flex items-center gap-2 text-xs bg-slate-950/40 border border-slate-800/80 px-3 py-1.5 rounded-full text-slate-300 backdrop-blur-sm self-start">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
              <span>Academic Year: 2026</span>
            </div>
          )}
        </div>

        {/* Course Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {myCourses.map((course) => (
            <Card 
              key={course.id} 
              className="overflow-hidden border-slate-800 bg-[#070420]/30 backdrop-blur-md shadow-xl hover:border-slate-700/80 transition-all duration-300 rounded-2xl cursor-pointer group"
              onClick={() => handleCourseClick(course.id)}
            >
              <div className="relative h-40 overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&q=80" 
                  alt={course.title} 
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 opacity-80"
                />
                <div className="absolute inset-0 bg-slate-950/40 group-hover:bg-slate-950/20 transition-colors" />
                <div
                  className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500"
                  aria-hidden
                />
              </div>
              <CardContent className="p-5 space-y-4">
                <h3 className="font-bold text-lg text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                  {course.title}
                </h3>
                
                <div className="flex items-center text-slate-400 text-xs min-w-0">
                  <User className="w-4 h-4 mr-2 shrink-0 text-indigo-400" />
                  <span className="truncate">Instructor: {resolveCourseInstructorName(course)}</span>
                </div>
                
                <div className="flex items-center justify-between text-xs font-semibold text-indigo-400 group-hover:text-indigo-350 border-t border-slate-900/60 pt-3">
                  <span className="flex items-center">
                    <BookOpen className="w-4 h-4 mr-1.5" />
                    Enter Course
                  </span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
            </Card>
          ))}

          {myCourses.length === 0 && (
            <Card className="col-span-full border-slate-800 bg-[#070420]/30 backdrop-blur-md rounded-2xl">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                <BookOpen className="w-12 h-12 text-slate-600 mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">No Courses Enrolled Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  You are not currently enrolled in any courses. Please enter a valid join code on the Dashboard page to enroll.
                </p>
                <button
                  onClick={() => {
                    onStartCourseExam({} as any); // just dummy back navigation fallback
                    window.location.hash = '';
                    window.location.reload();
                  }}
                  className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all"
                >
                  Go to Dashboard
                </button>
              </CardContent>
            </Card>
          )}
        </div>

      </div>
    </MotionBackground>
  );
};
