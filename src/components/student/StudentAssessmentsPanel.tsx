import { useState, useMemo } from 'react';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import type { Session, CourseAssessment } from '@/context/SessionContext';
import { MotionBackground } from '@/components/shared/MotionBackground';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  FileCheck2,
  Clock,
  Calendar,
  Trophy,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  ChevronRight,
  Search,
  Info,
  HelpCircle,
  TrendingUp,
  XCircle,
  Play
} from 'lucide-react';

interface StudentAssessmentsPanelProps {
  onNavigate?: (tab: string) => void;
  onStartCourseExam?: (ctx: { courseId: string; courseTitle: string; assessment: CourseAssessment }) => void;
}

type AssessmentStatus = 'submitted' | 'overdue' | 'upcoming' | 'open';

type FlatAssessment = {
  key: string;
  courseId: string;
  courseTitle: string;
  courseAccentIndex: number;
  assessment: CourseAssessment;
  status: AssessmentStatus;
  studentScore: number | null;
  maxScore: number;
};

const ACCENT_COLORS = [
  { bg: 'from-blue-600 to-blue-800', badge: 'bg-blue-500/10 border border-blue-500/30 text-blue-400' },
  { bg: 'from-violet-600 to-violet-800', badge: 'bg-violet-500/10 border border-violet-500/30 text-violet-400' },
  { bg: 'from-emerald-600 to-emerald-800', badge: 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' },
  { bg: 'from-rose-600 to-rose-800', badge: 'bg-rose-500/10 border border-rose-500/30 text-rose-400' },
  { bg: 'from-amber-600 to-amber-800', badge: 'bg-amber-500/10 border border-amber-500/30 text-amber-400' },
  { bg: 'from-cyan-600 to-cyan-800', badge: 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400' },
];

function getAccent(idx: number) {
  return ACCENT_COLORS[idx % ACCENT_COLORS.length];
}

function resolveStatus(assessment: CourseAssessment, studentId: string): { status: AssessmentStatus; score: number | null } {
  const submission = (assessment.submissions ?? []).find(
    (s) => String(s.studentId) === String(studentId)
  );
  if (submission) {
    return { status: 'submitted', score: submission.score ?? null };
  }
  if (assessment.dueDate) {
    const due = new Date(assessment.dueDate);
    if (!Number.isNaN(due.getTime()) && due < new Date()) {
      return { status: 'overdue', score: null };
    }
  }
  if (assessment.dueDate) {
    const due = new Date(assessment.dueDate);
    const now = new Date();
    const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 3) return { status: 'upcoming', score: null };
  }
  return { status: 'open', score: null };
}

function enrolledCourses(sessions: Session[], studentId: string): Session[] {
  if (!studentId) return [];
  const sid = String(studentId);
  return sessions.filter(
    (s) => s.type === 'course' && (s.enrolledStudents ?? []).some((id) => String(id) === sid)
  );
}

const STATUS_CONFIG: Record<AssessmentStatus, {
  label: string;
  icon: any;
  color: string;
  badge: string;
  border: string;
  hoverBorder: string;
  selectedBorder: string;
  selectedBg: string;
  glow: string;
  accentBg: string;
}> = {
  submitted: {
    label: 'Submitted',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    badge: 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400',
    border: 'border-emerald-950/60',
    hoverBorder: 'hover:border-emerald-500/40',
    selectedBorder: 'border-emerald-500/60',
    selectedBg: 'bg-[#041a0d]/40',
    glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    accentBg: 'from-emerald-500 to-teal-600',
  },
  overdue: {
    label: 'Overdue',
    icon: AlertCircle,
    color: 'text-rose-400',
    badge: 'bg-rose-500/10 border border-rose-500/30 text-rose-400',
    border: 'border-rose-950/60',
    hoverBorder: 'hover:border-rose-500/40',
    selectedBorder: 'border-rose-500/60',
    selectedBg: 'bg-[#1a060b]/40',
    glow: 'shadow-[0_0_15px_rgba(239,68,68,0.15)]',
    accentBg: 'from-rose-500 to-red-600',
  },
  upcoming: {
    label: 'Upcoming',
    icon: Clock,
    color: 'text-amber-400',
    badge: 'bg-amber-500/10 border border-amber-500/30 text-amber-400',
    border: 'border-amber-950/60',
    hoverBorder: 'hover:border-amber-500/40',
    selectedBorder: 'border-amber-500/60',
    selectedBg: 'bg-[#1a1204]/40',
    glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    accentBg: 'from-amber-500 to-orange-500',
  },
  open: {
    label: 'Open',
    icon: FileCheck2,
    color: 'text-blue-400',
    badge: 'bg-blue-500/10 border border-blue-500/30 text-blue-400',
    border: 'border-blue-950/60',
    hoverBorder: 'hover:border-blue-500/40',
    selectedBorder: 'border-blue-500/60',
    selectedBg: 'bg-[#06122d]/40',
    glow: 'shadow-[0_0_15px_rgba(59,130,246,0.15)]',
    accentBg: 'from-blue-500 to-indigo-650',
  },
};

export const StudentAssessmentsPanel = ({ onNavigate, onStartCourseExam }: StudentAssessmentsPanelProps) => {
  const { sessions } = useSession();
  const { user } = useAuth();
  const studentId = resolveEnrollmentStudentId(user);

  // Filters & Tabs State
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [activeSubTab, setActiveSubTab] = useState<'active' | 'upcoming' | 'completed'>('active');
  const [selectedAssessmentKey, setSelectedAssessmentKey] = useState<string | null>(null);

  const flatAssessments = useMemo<FlatAssessment[]>(() => {
    const courses = enrolledCourses(sessions, studentId);
    const rows: FlatAssessment[] = [];
    for (const course of courses) {
      for (const assessment of course.assessments ?? []) {
        const { status, score } = resolveStatus(assessment, studentId);
        rows.push({
          key: `${course.id}-${assessment.id}`,
          courseId: String(course.id),
          courseTitle: course.title,
          courseAccentIndex: course.courseAccentIndex ?? 0,
          assessment,
          status,
          studentScore: score,
          maxScore: assessment.maxScore ?? 100,
        });
      }
    }
    return rows;
  }, [sessions, studentId]);

  // Group by course for summaries
  const courseSummary = useMemo(() => {
    const map = new Map<string, { title: string; total: number; submitted: number; accentIdx: number }>();
    for (const row of flatAssessments) {
      const existing = map.get(row.courseId) ?? { title: row.courseTitle, total: 0, submitted: 0, accentIdx: row.courseAccentIndex };
      existing.total += 1;
      if (row.status === 'submitted') existing.submitted += 1;
      map.set(row.courseId, existing);
    }
    return Array.from(map.values());
  }, [flatAssessments]);

  // Filter list by Search, Course Filter, and Sub-Tab
  const filteredAssessments = useMemo(() => {
    return flatAssessments.filter((row) => {
      const matchesSearch = 
        row.assessment.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.courseTitle.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCourse = courseFilter === 'all' || row.courseId === courseFilter;
      
      let matchesSubTab = false;
      if (activeSubTab === 'active') {
        matchesSubTab = row.status === 'open' || row.status === 'overdue';
      } else if (activeSubTab === 'upcoming') {
        matchesSubTab = row.status === 'upcoming';
      } else if (activeSubTab === 'completed') {
        matchesSubTab = row.status === 'submitted';
      }

      return matchesSearch && matchesCourse && matchesSubTab;
    }).sort((a, b) => {
      // Sort overdue first in active, otherwise by title or due date
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (b.status === 'overdue' && a.status !== 'overdue') return 1;
      return a.assessment.title.localeCompare(b.assessment.title);
    });
  }, [flatAssessments, searchQuery, courseFilter, activeSubTab]);

  // Selected Detail
  const selectedAssessment = useMemo(() => {
    if (!selectedAssessmentKey) return null;
    return flatAssessments.find((a) => a.key === selectedAssessmentKey) || null;
  }, [flatAssessments, selectedAssessmentKey]);

  const openCount = flatAssessments.filter((r) => r.status === 'open' || r.status === 'overdue').length;
  const upcomingCount = flatAssessments.filter((r) => r.status === 'upcoming').length;
  const completedCount = flatAssessments.filter((r) => r.status === 'submitted').length;

  const handleStart = (row: FlatAssessment) => {
    if (onStartCourseExam) {
      onStartCourseExam({ courseId: row.courseId, courseTitle: row.courseTitle, assessment: row.assessment });
    } else {
      sessionStorage.setItem('courseDetailsInitialTab', 'assessments');
      onNavigate?.('my-courses');
      window.setTimeout(() => { window.location.hash = `course=${row.courseId}`; }, 0);
    }
  };

  const courses = useMemo(() => {
    const list: { id: string; title: string }[] = [];
    flatAssessments.forEach((a) => {
      if (!list.some((c) => c.id === a.courseId)) {
        list.push({ id: a.courseId, title: a.courseTitle });
      }
    });
    return list;
  }, [flatAssessments]);

  return (
    <MotionBackground>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6 lg:px-8 space-y-6 animate-in fade-in duration-300">
        {/* Top Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
              Assessments Hub
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              View your pending exams, upcoming quizzes, and graded submissions.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs bg-slate-950/40 border border-slate-800/80 px-3 py-1.5 rounded-full text-slate-300 backdrop-blur-sm self-start">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
            <span>Learning Status: Evaluative Term</span>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Active & Overdue', count: openCount, sub: 'Needs attention', color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', dot: 'bg-indigo-400', tabId: 'active' as const },
            { label: 'Upcoming Quizzes', count: upcomingCount, sub: 'Scheduled soon', color: 'bg-amber-500/10 border-amber-500/20 text-amber-400', dot: 'bg-amber-400', tabId: 'upcoming' as const },
            { label: 'Completed Submissions', count: completedCount, sub: 'Graded & Done', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400', tabId: 'completed' as const },
          ].map(({ label, count, sub, color, dot, tabId }) => (
            <div 
              key={label}
              onClick={() => setActiveSubTab(tabId)}
              className={`cursor-pointer hover:scale-[1.02] border border-slate-800/70 bg-[#070420]/30 backdrop-blur-md shadow-xl transition-all duration-300 rounded-2xl p-5 flex items-center justify-between ${
                activeSubTab === tabId ? 'border-indigo-500/50 ring-1 ring-indigo-500/30' : ''
              }`}
            >
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                <h3 className="text-3xl font-extrabold text-white mt-1.5 flex items-baseline gap-2">
                  {count}
                  <span className="text-[10px] font-medium text-slate-500">{sub}</span>
                </h3>
              </div>
              <span className={`h-3 w-3 rounded-full ${dot} shadow-[0_0_8px_rgba(99,102,241,0.5)]`} />
            </div>
          ))}
        </div>

        {/* Course Performance Badges */}
        {courseSummary.length > 0 && (
          <div className="flex flex-wrap gap-2 bg-[#070420]/20 border border-slate-900 p-3 rounded-2xl">
            <span className="text-xs text-slate-400 flex items-center gap-1 self-center mr-2">
              <BookOpen className="w-3.5 h-3.5" /> Course Progress Summary:
            </span>
            {courseSummary.map((c) => {
              const accent = getAccent(c.accentIdx);
              return (
                <span key={c.title} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${accent.badge}`}>
                  {c.title} — {c.submitted}/{c.total} completed
                </span>
              );
            })}
          </div>
        )}

        {/* Core Filters & Grid */}
        <div className={`grid grid-cols-1 gap-6 ${selectedAssessment ? 'lg:grid-cols-[1fr_360px]' : ''}`}>
          
          <div className="space-y-4">
            {/* Filter Panel & Tab Selectors */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-slate-950/30 border border-slate-800/80 p-3.5 rounded-2xl backdrop-blur-md">
              {/* Left Side: Search & Course Filter */}
              <div className="flex flex-1 flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    type="text"
                    placeholder="Search assessments..."
                    className="pl-10 bg-slate-900/40 border-slate-800/80 text-white placeholder-slate-500 focus-visible:ring-indigo-500/50"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={courseFilter} onValueChange={setCourseFilter}>
                  <SelectTrigger className="w-[180px] bg-slate-900/40 border-slate-800/80 text-slate-200 focus:ring-indigo-500/50">
                    <SelectValue placeholder="All Courses" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    <SelectItem value="all">All Courses</SelectItem>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Right Side: Inner Tabs */}
              <div className="flex gap-1 p-1 bg-slate-900/85 border border-slate-800 rounded-xl">
                {[
                  { id: 'active' as const, label: 'Active' },
                  { id: 'upcoming' as const, label: 'Upcoming' },
                  { id: 'completed' as const, label: 'Completed' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveSubTab(t.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      activeSubTab === t.id 
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assessment Cards List */}
            {filteredAssessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-800 bg-[#070420]/20 py-16 text-center text-slate-400">
                <FileCheck2 className="h-10 w-10 text-slate-600" />
                <p className="text-sm font-semibold">No assessments found.</p>
                <p className="text-xs text-slate-500">
                  There are no assessments matching the chosen filters or tab category.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate?.('my-courses')}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors"
                >
                  Go to Courses <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredAssessments.map((row) => {
                  const accent = getAccent(row.courseAccentIndex);
                  const cfg = STATUS_CONFIG[row.status];
                  const StatusIcon = cfg.icon;
                  const isSelected = selectedAssessmentKey === row.key;

                  return (
                    <div
                      key={row.key}
                      onClick={() => setSelectedAssessmentKey(isSelected ? null : row.key)}
                      className={`cursor-pointer overflow-hidden rounded-2xl border transition-all duration-300 bg-[#070420]/30 backdrop-blur-md shadow-xl ${
                        isSelected 
                          ? `${cfg.selectedBorder} ${cfg.glow} ${cfg.selectedBg}` 
                          : `${cfg.border} ${cfg.hoverBorder}`
                      }`}
                    >
                      {/* Top strip colored by status to clearly distinguish them */}
                      <div className={`h-1 w-full bg-gradient-to-r ${cfg.accentBg}`} />
                      
                      <div className="flex items-center justify-between gap-4 p-4">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Course Title Badge */}
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${accent.badge}`}>
                            <BookOpen className="h-3 w-3" />
                            {row.courseTitle}
                          </span>

                          <h3 className="text-base font-bold text-white truncate">
                            {row.assessment.title}
                          </h3>

                          {/* Quick details row */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              {row.assessment.duration ?? 30} mins
                            </span>
                            <span className="flex items-center gap-1">
                              <Trophy className="w-3.5 h-3.5 text-indigo-400" />
                              {row.assessment.questions ?? row.assessment.questionItems?.length ?? 0} Questions
                            </span>
                            {row.assessment.dueDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                Due: {new Date(row.assessment.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status + CTA Container */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.badge}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {cfg.label}
                          </span>
                          
                          {row.status === 'submitted' && row.studentScore !== null && (
                            <span className="text-sm font-bold font-mono text-white">
                              Score: {row.studentScore} / {row.maxScore}
                            </span>
                          )}

                          <button 
                            type="button"
                            className="p-1 bg-slate-900/60 border border-slate-800 rounded-lg text-slate-400 hover:text-white"
                          >
                            <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${
                              isSelected ? 'rotate-90 text-indigo-400' : ''
                            }`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assessment Details Sidebar (similar style as Grades sidebar) */}
          {selectedAssessment && (
            <div className="border border-slate-800/80 bg-[#070420]/35 backdrop-blur-md rounded-2xl shadow-2xl p-5 space-y-4 animate-in slide-in-from-right duration-300 self-start">
              <div className="border-b border-slate-900/80 pb-4">
                <div className="flex items-center justify-between">
                  <Badge className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20">
                    Assessment Info
                  </Badge>
                  <button 
                    onClick={() => setSelectedAssessmentKey(null)}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    Close
                  </button>
                </div>
                <h3 className="text-lg font-bold text-white mt-2 leading-tight">
                  {selectedAssessment.assessment.title}
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  {selectedAssessment.courseTitle}
                </p>
              </div>
              <div className="space-y-4">
                {/* Details Breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950/40 border border-slate-900 p-3 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase">Exam Duration</p>
                    <p className="text-lg font-bold font-mono mt-1 text-white">
                      {selectedAssessment.assessment.duration ?? 30} mins
                    </p>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-900 p-3 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase">Max Points</p>
                    <p className="text-lg font-bold font-mono mt-1 text-white">
                      {selectedAssessment.maxScore} pts
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Question count</span>
                    <span className="font-mono text-white">
                      {selectedAssessment.assessment.questions ?? selectedAssessment.assessment.questionItems?.length ?? 0} items
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Current Status</span>
                    <span className={`font-semibold capitalize ${STATUS_CONFIG[selectedAssessment.status].color}`}>
                      {selectedAssessment.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Due Date</span>
                    <span className="font-mono text-white">
                      {selectedAssessment.assessment.dueDate 
                        ? new Date(selectedAssessment.assessment.dueDate).toLocaleString() 
                        : 'Open / No limit'}
                    </span>
                  </div>
                </div>

                <div className="h-px bg-slate-900" />

                {/* Status Advice Card */}
                {selectedAssessment.status === 'submitted' ? (
                  <div className="p-4 rounded-xl border bg-emerald-950/20 border-emerald-900/60 text-emerald-300">
                    <div className="flex gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Assessment Completed</p>
                        <p className="text-xs text-slate-455 mt-1 leading-relaxed">
                          Your answers were logged successfully. 
                          {selectedAssessment.studentScore !== null ? (
                            <span> You achieved an overall score of <strong className="text-white">{selectedAssessment.studentScore} out of {selectedAssessment.maxScore}</strong>.</span>
                          ) : (
                            <span> Graded evaluations will be published by your instructor.</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : selectedAssessment.status === 'overdue' ? (
                  <div className="p-4 rounded-xl border bg-red-950/20 border-red-900/60 text-red-300">
                    <div className="flex gap-2.5">
                      <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Overdue Submission</p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          This assessment due date has passed. You can no longer start this exam. Please contact your instructor to request extension settings.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 flex gap-2.5">
                      <HelpCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-slate-200">Exam Instructions</p>
                        <p className="text-xs text-slate-455 mt-1 leading-relaxed">
                          Once started, you will enter a fully monitored browser context. Browser tab switching, window exits, or external devices will be flagged.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStart(selectedAssessment)}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm h-11 rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Start Assessment Now
                    </button>
                  </div>
                )}

                {/* Additional disclaimer info */}
                <div className="flex items-start gap-2 text-[10px] text-slate-500 leading-normal bg-slate-950/20 p-2.5 rounded-lg">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    ProctorTab active browser integrity locks will initialize once the exam launches. Ensure stable internet connectivity before proceeding.
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </MotionBackground>
  );
};
