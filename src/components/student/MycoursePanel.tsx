import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useSession } from '@/hooks/useSession';
import { type CourseExamLaunch } from '@/context/SessionContext';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { resolveCourseInstructorName } from '@/utils/storedUser';
import { resolveCourseAccentLineClass } from '@/utils/courseSwatch';
import { getStudentEnrollmentCourseIds } from '@/utils/studentEnrollments';
import { cn } from '@/lib/utils';
import { BookOpen, User, ChevronRight } from 'lucide-react';
import { CourseDetails } from '../dashboard/Coursedetails';

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
        <CourseDetails
          course={{
            id: course.id,
            name: course.title,
            instructor: resolveCourseInstructorName(course),
            thumbnail: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&q=80',
          }}
          onBack={handleBack}
          onStartExam={onStartCourseExam}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">My Courses</h2>
          <p className="text-muted-foreground mt-1">
            Courses you are currently enrolled in
          </p>
        </div>
        <div className="md:hidden">
          <button 
            onClick={() => window.location.hash = ''}
            className="text-sm text-blue-600 font-medium"
          >
            + Join Course
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {myCourses.map((course) => (
          <Card 
            key={course.id} 
            className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
            onClick={() => handleCourseClick(course.id)}
          >
            <div className="relative h-40 overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&q=80" 
                alt={course.title} 
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
              <div
                className={cn('absolute bottom-0 left-0 right-0 h-1', resolveCourseAccentLineClass(course))}
                aria-hidden
              />
            </div>
            <CardContent className="p-5">
              <h3 className="font-bold text-lg mb-2 line-clamp-1">{course.title}</h3>
              <div className="flex items-center text-muted-foreground text-sm mb-4 min-w-0">
                <User className="w-4 h-4 mr-2 shrink-0" />
                <span className="truncate">{resolveCourseInstructorName(course)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-medium text-blue-600">
                <span className="flex items-center">
                  <BookOpen className="w-4 h-4 mr-2" />
                  View Course
                </span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </CardContent>
          </Card>
        ))}

        {myCourses.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Courses Yet</h3>
              <p className="text-muted-foreground">
                Use a join code to enroll in a course
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
