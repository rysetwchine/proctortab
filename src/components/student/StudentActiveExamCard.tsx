import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { useAuth } from '@/hooks/useAuth';
import type { CourseAssessment, Session } from '@/context/SessionContext';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalS = Math.floor(ms / 1000);
  if (totalS >= 48 * 3600) {
    const d = Math.floor(totalS / (24 * 3600));
    const h = Math.floor((totalS % (24 * 3600)) / 3600);
    return `${d}d ${h}h`;
  }
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type NextRow = {
  courseId: string;
  courseTitle: string;
  instructorLabel: string;
  assessment: CourseAssessment;
  dueAt: Date;
};

function pickNearestAssessment(sessions: Session[], studentId: string): NextRow | null {
  const rows: NextRow[] = [];
  for (const s of sessions) {
    if (s.type !== 'course') continue;
    if (!studentId || !(s.enrolledStudents ?? []).some((id) => String(id) === String(studentId))) continue;
    const instructorLabel = s.instructorName?.trim() ?? '';
    for (const a of s.assessments || []) {
      if (!a.dueDate?.trim()) continue;
      const dueAt = new Date(a.dueDate);
      if (Number.isNaN(dueAt.getTime())) continue;
      if (dueAt.getTime() <= Date.now()) continue;
      rows.push({
        courseId: s.id,
        courseTitle: s.title,
        instructorLabel,
        assessment: a,
        dueAt,
      });
    }
  }
  if (rows.length === 0) return null;
  rows.sort((x, y) => x.dueAt.getTime() - y.dueAt.getTime());
  return rows[0] ?? null;
}

interface StudentActiveExamCardProps {
  onGoToScores: (courseId: string) => void;
  compact?: boolean;
}

export const StudentActiveExamCard = ({ onGoToScores, compact }: StudentActiveExamCardProps) => {
  const { sessions } = useSession();
  const { user } = useAuth();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const studentId = resolveEnrollmentStudentId(user);

  const next = useMemo(
    () => pickNearestAssessment(sessions, String(studentId)),
    [sessions, studentId, tick]
  );

  const msLeft = next ? next.dueAt.getTime() - Date.now() : 0;
  const timeLeftLabel = next ? formatTimeLeft(msLeft) : '';

  return (
    <div className={cn('w-full flex flex-col min-h-0', compact ? 'h-auto' : 'h-full')}>
      <Card
        className={cn(
          'border-0 flex flex-col overflow-hidden rounded-[14px] bg-[#FFF8E1] text-stone-900 shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-amber-900/8',
          compact ? 'min-h-0' : 'h-full'
        )}
      >
        <CardContent className={cn('flex flex-col flex-1', compact ? 'gap-3 p-4' : 'gap-5 p-5 sm:p-6')}>
          <div className={cn('min-h-0', compact ? 'space-y-2' : 'space-y-3')}>
            <h3
              className={cn(
                'font-bold tracking-tight text-[#a16207]',
                compact ? 'text-sm' : 'text-base'
              )}
            >
              Active Assessment
            </h3>
            {next ? (
              <>
                <div className="flex items-start gap-2 sm:gap-3">
                  <div
                    className={cn(
                      'mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-[#FDE047] ring-1 ring-amber-900/15',
                      compact ? 'h-8 w-8' : 'h-9 w-9'
                    )}
                    aria-hidden
                  >
                    <BookOpen
                      className={cn('text-stone-900', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
                      strokeWidth={2}
                    />
                  </div>
                  <p
                    className={cn(
                      'font-bold text-stone-900 leading-snug pt-0.5',
                      compact ? 'text-sm' : 'text-base'
                    )}
                  >
                    {next.courseTitle}
                  </p>
                </div>

                <div className={cn('grid grid-cols-2 gap-2 sm:gap-4', compact ? 'pt-0' : 'pt-1')}>
                  <div
                    className={cn(
                      'min-w-0 border-[#EAB308] pl-2 sm:pl-3',
                      compact ? 'border-l-2 text-sm' : 'border-l-[3px] text-base'
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500 sm:text-[11px]">
                      Professor
                    </p>
                    <p
                      className={cn(
                        'font-bold text-stone-900 leading-tight',
                        compact ? 'mt-0.5 text-xs' : 'mt-1'
                      )}
                    >
                      {next.instructorLabel || '—'}
                    </p>
                    <p className="text-[0.5em] font-normal text-stone-600 mt-0.5 leading-snug sm:mt-1">
                      {next.courseTitle}
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500 sm:text-[11px]">
                      Time left
                    </p>
                    <p
                      className={cn(
                        'font-bold text-stone-900 tabular-nums tracking-tight',
                        compact ? 'mt-0.5 text-xs' : 'mt-1 text-base'
                      )}
                    >
                      {timeLeftLabel}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p
                className={cn(
                  'text-stone-600 leading-relaxed',
                  compact ? 'text-xs' : 'text-sm'
                )}
              >
                No upcoming assessments with a due date. Join a course to see assessments here.
              </p>
            )}
          </div>

          <div className={cn('pt-1', compact ? 'mt-1' : 'mt-auto')}>
            <Button
              type="button"
              disabled={!next}
              onClick={() => next && onGoToScores(next.courseId)}
              className={cn(
                'w-full rounded-[10px] bg-[#002366] text-white font-bold hover:bg-[#001a4d] shadow-sm border-0 disabled:opacity-50',
                compact ? 'h-9 text-sm' : 'h-11'
              )}
            >
              Go To Assessment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
