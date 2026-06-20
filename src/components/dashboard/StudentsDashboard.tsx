import { useMemo, type ReactNode } from 'react';
import { StudentActiveExamCard } from '@/components/student/StudentActiveExamCard';
import { JoinSessionForm } from '@/components/student/JoinSessionForm';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import type { Session } from '@/context/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, CheckCircle, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

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

function countCompletedCourseExams(courses: Session[], studentId: string) {
  // "Completed assessments" means assessments the student has ALREADY submitted.
  const sid = String(studentId || '');
  if (!sid) return 0;
  let n = 0;
  for (const c of courses) {
    for (const a of c.assessments || []) {
      if (a.assessmentType === 'quiz') continue;
      const sub = (a.submissions || []).find((s) => String(s.studentId) === sid);
      if (sub?.submittedAt) n += 1;
    }
  }
  return n;
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

type StatCardProps = {
  icon: ReactNode;
  iconWrapClass: string;
  value: number;
  title: string;
  subtitle?: string;
  onViewAll?: () => void;
  compact?: boolean;
};

function DashboardStatCard({
  icon,
  iconWrapClass,
  value,
  title,
  subtitle,
  onViewAll,
  compact,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-card border flex gap-3 items-center',
        compact ? 'rounded-lg border p-3' : 'rounded-xl p-4'
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg',
          iconWrapClass,
          compact ? 'h-12 w-12' : 'h-14 w-14'
        )}
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className={cn('font-bold leading-none', compact ? 'text-2xl' : 'text-3xl')}>{value}</p>
        <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{title}</p>
        {subtitle ? (
          <p className={cn('text-muted-foreground mt-0.5', compact ? 'text-[10px] leading-snug' : 'text-xs')}>
            {subtitle}
          </p>
        ) : null}
        {onViewAll ? (
          <button
            type="button"
            className={cn(
              'text-primary hover:underline mt-1.5 text-left font-medium',
              compact ? 'text-[10px]' : 'text-xs'
            )}
            onClick={onViewAll}
          >
            View All
          </button>
        ) : null}
      </div>
    </div>
  );
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

  const totalCoursesCount = myCoursesList.length;
  const completedExamsCount = useMemo(
    () => countCompletedCourseExams(myCoursesList, String(studentId || '')),
    [myCoursesList, studentId]
  );

  const recentAnnouncements = useMemo(
    () => collectRecentAnnouncements(myCoursesList, RECENT_ANNOUNCEMENTS_LIMIT),
    [myCoursesList]
  );

  const go = (tab: string) => {
    onNavigate?.(tab);
  };

  const handleGoToScores = (courseId: string) => {
    sessionStorage.setItem('courseDetailsInitialTab', 'scores');
    onNavigate?.('my-courses');
    window.setTimeout(() => {
      window.location.hash = `course=${courseId}`;
    }, 0);
  };

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

      <div className="flex shrink-0 flex-col gap-3 md:flex-row md:items-stretch md:gap-4">
        <div className="flex w-full min-w-0 md:w-1/2">
          <JoinSessionForm compact onNavigate={onNavigate} />
        </div>
        <div className="flex w-full min-w-0 md:w-1/2">
          <StudentActiveExamCard onGoToScores={handleGoToScores} compact />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
        <DashboardStatCard
          icon={<BookOpen className="h-6 w-6 text-amber-700" />}
          iconWrapClass="bg-amber-100"
          value={totalCoursesCount}
          title="My Courses"
          subtitle="Courses you're enrolled in"
          onViewAll={() => go('my-courses')}
          compact
        />
        <DashboardStatCard
          icon={<CheckCircle className="h-6 w-6 text-slate-700" />}
          iconWrapClass="bg-slate-100"
          value={completedExamsCount}
          title="Completed assessments"
          subtitle="Assessments you already submitted"
          onViewAll={() => go('completed-exams')}
          compact
        />
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="recent-announcements-heading">
        <div className="flex shrink-0 items-center gap-2">
          <MessageSquare className="text-muted-foreground h-5 w-5 shrink-0 md:h-6 md:w-6" aria-hidden />
          <h2 id="recent-announcements-heading" className="text-lg font-bold tracking-tight md:text-xl">
            Recent Announcements
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

