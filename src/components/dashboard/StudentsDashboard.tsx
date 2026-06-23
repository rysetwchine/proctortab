import { useMemo } from 'react';
import { JoinSessionForm } from '@/components/student/JoinSessionForm';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import type { Session } from '@/context/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

interface StudentDashboardProps {
  onStartExam: () => void;
  onNavigate?: (tab: string) => void;
}

function enrolledCourses(sessions: Session[], studentId: string) {
  if (!studentId) return [];
  const sid = String(studentId);
  return sessions.filter(
    (s) =>
      s.type === 'course' && (s.enrolledStudents ?? []).some((id) => String(id) === sid)
  );
}

const RECENT_ANNOUNCEMENTS_LIMIT = 12;

type AnnouncementFeedItem = {
  key: string;
  courseId: string;
  courseTitle: string;
  text: string;
  date: string;
  dateMs: number;
};

function collectRecentAnnouncements(courses: Session[], limit: number): AnnouncementFeedItem[] {
  const rows: AnnouncementFeedItem[] = [];
  for (const c of courses) {
    for (const a of c.announcements || []) {
      const dateMs = new Date(a.date || '').getTime();
      rows.push({
        key: `${c.id}-${a.id}-${a.date}`,
        courseId: String(c.id),
        courseTitle: c.title,
        text: a.text,
        date: a.date,
        dateMs: Number.isNaN(dateMs) ? 0 : dateMs,
      });
    }
  }
  rows.sort((x, y) => y.dateMs - x.dateMs);
  return rows.slice(0, limit);
}

export const StudentDashboard = ({ onStartExam, onNavigate }: StudentDashboardProps) => {
  void onStartExam;
  const { sessions } = useSession();
  const { user } = useAuth();
  const studentId = resolveEnrollmentStudentId(user);

  const myCoursesList = useMemo(
    () => enrolledCourses(sessions, studentId),
    [sessions, studentId]
  );

  const recentAnnouncements = useMemo(
    () => collectRecentAnnouncements(myCoursesList, RECENT_ANNOUNCEMENTS_LIMIT),
    [myCoursesList]
  );

  const handleOpenCourseAnnouncements = (courseId: string) => {
    sessionStorage.setItem('courseDetailsInitialTab', 'announcements');
    onNavigate?.('my-courses');
    window.setTimeout(() => {
      window.location.hash = `course=${courseId}`;
    }, 0);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3 pb-4 md:gap-4">
      <WelcomeBanner />

      <JoinSessionForm onNavigate={onNavigate} />

      <section className="flex flex-col gap-2" aria-labelledby="recent-announcements-heading">
        <div className="flex shrink-0 items-center gap-2">
          <MessageSquare className="text-muted-foreground h-5 w-5 shrink-0 md:h-6 md:w-6" aria-hidden />
          <h2 id="recent-announcements-heading" className="text-lg font-bold tracking-tight md:text-xl">
            Notifications
          </h2>
        </div>

        {recentAnnouncements.length === 0 ? (
          <p className="text-muted-foreground shrink-0 text-xs md:text-sm">
            No announcements from your instructors yet. They will appear here when posted in your courses.
          </p>
        ) : (
          <div className="max-h-[min(60dvh,28rem)] overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-muted/25 p-2">
            <div className="flex flex-col gap-2">
              {recentAnnouncements.map((item) => (
                <Card key={item.key} className="border bg-card shadow-sm">
                  <CardContent className="p-3 sm:p-3.5">
                    <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                      <p className="text-foreground text-xs font-semibold sm:text-sm">{item.courseTitle}</p>
                      <p className="text-muted-foreground shrink-0 text-[10px] tabular-nums sm:text-xs">
                        {item.date ? new Date(item.date).toLocaleString() : ''}
                      </p>
                    </div>
                    <p className="text-foreground line-clamp-3 text-xs leading-snug sm:text-sm">{item.text}</p>
                    <button
                      type="button"
                      className="text-primary mt-2 text-left text-[10px] font-medium hover:underline sm:text-xs"
                      onClick={() => handleOpenCourseAnnouncements(item.courseId)}
                    >
                      Open in course
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};