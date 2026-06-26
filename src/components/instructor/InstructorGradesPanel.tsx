import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { useSession } from '@/hooks/useSession';
import { getCurrentOwnerUid } from '@/utils/storedUser';
import {
  Award,
  Users,
  BookOpen,
  TrendingUp,
  Search,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Trophy,
  Target,
  GraduationCap,
  ClipboardList,
} from 'lucide-react';
import { MotionBackground } from '@/components/shared/MotionBackground';

interface StudentResult {
  studentId: string;
  studentName: string;
  examId: string;
  courseId: string;
  score: number;
  totalItems: number;
  timestamp?: string;
  // resolved
  examTitle?: string;
  courseTitle?: string;
  assessmentType?: string;
  maxScore?: number;
}

interface StudentGroup {
  studentId: string;
  studentName: string;
  results: StudentResult[];
  totalScore: number;
  totalMax: number;
  avgPct: number;
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  const color =
    pct >= 80 ? '#10b981' : pct >= 60 ? '#06b6d4' : pct >= 40 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="flex items-center gap-2.5 w-full">
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[10px] font-bold font-mono shrink-0" style={{ color }}>
        {score}/{max} ({pct}%)
      </span>
    </div>
  );
}

function exportCSV(results: StudentResult[], filename = 'student_scores.csv') {
  const headers = [
    'Student Name',
    'Student ID',
    'Course',
    'Assessment',
    'Assessment Type',
    'Score',
    'Max Score',
    'Percentage (%)',
    'Date',
  ];

  const rows = results.map((r) => {
    const pct = r.maxScore && r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0;
    const dateStr = r.timestamp ? new Date(r.timestamp).toLocaleDateString() : '—';
    return [
      `"${r.studentName}"`,
      `"${r.studentId}"`,
      `"${r.courseTitle ?? ''}"`,
      `"${r.examTitle ?? ''}"`,
      `"${r.assessmentType ?? 'Exam'}"`,
      r.score,
      r.maxScore ?? 100,
      pct,
      `"${dateStr}"`,
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function InstructorGradesPanel() {
  const { sessions } = useSession();
  const myUid = getCurrentOwnerUid();

  const myCourses = useMemo(
    () => sessions.filter((s) => s.type === 'course' && (!myUid || !s.ownerUid || s.ownerUid === myUid)),
    [sessions, myUid]
  );

  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'by-student' | 'by-assessment'>('by-student');

  // ─── Fetch all results from Firestore ─────────────────────────────────────
  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      const allResults: StudentResult[] = [];

      for (const course of myCourses) {
        const courseId = course.id;
        const assessments = course.assessments ?? [];

        for (const exam of assessments) {
          try {
            const resultsRef = collection(db, 'courses', courseId, 'exams', exam.id, 'results');
            const snap = await getDocs(resultsRef);

            snap.forEach((docSnap) => {
              const data = docSnap.data();
              allResults.push({
                studentId: data.studentId ?? docSnap.id,
                studentName: data.studentName ?? 'Unknown Student',
                examId: data.examId ?? exam.id,
                courseId: data.courseId ?? courseId,
                score: Number(data.score ?? 0),
                totalItems: Number(data.totalItems ?? 0),
                timestamp: data.timestamp?.toDate?.()?.toISOString() ?? '',
                examTitle: exam.title ?? 'Untitled Exam',
                courseTitle: course.title ?? course.name ?? 'Unknown Course',
                assessmentType: exam.assessmentType ?? 'exam',
                maxScore: exam.maxScore ?? 100,
              });
            });
          } catch {
            // Skip inaccessible collections silently
          }
        }
      }

      // Also pull in-memory submissions as fallback
      for (const course of myCourses) {
        for (const exam of course.assessments ?? []) {
          for (const sub of exam.submissions ?? []) {
            const alreadyHave = allResults.some(
              (r) => r.examId === exam.id && String(r.studentId) === String(sub.studentId)
            );
            if (!alreadyHave) {
              allResults.push({
                studentId: String(sub.studentId),
                studentName: sub.studentName ?? 'Unknown Student',
                examId: exam.id,
                courseId: course.id,
                score: Number(sub.score ?? 0),
                totalItems: Number(exam.questions ?? 0),
                timestamp: sub.submittedAt ?? '',
                examTitle: exam.title ?? 'Untitled Exam',
                courseTitle: course.title ?? course.name ?? 'Unknown Course',
                assessmentType: exam.assessmentType ?? 'exam',
                maxScore: exam.maxScore ?? 100,
              });
            }
          }
        }
      }

      // Sort newest first
      allResults.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
      setResults(allResults);
      setLoading(false);
    };

    if (myCourses.length > 0) fetchResults();
    else setLoading(false);
  }, [myCourses]);

  const courseOptions = useMemo(() => {
    const titles = new Set(results.map((r) => r.courseTitle ?? 'Unknown'));
    return ['all', ...Array.from(titles)];
  }, [results]);

  const typeOptions = useMemo(() => {
    const types = new Set(results.map((r) => r.assessmentType ?? 'exam'));
    return ['all', ...Array.from(types)];
  }, [results]);

  const filtered = useMemo(() => {
    return results.filter((r) => {
      const matchesCourse = selectedCourse === 'all' || r.courseTitle === selectedCourse;
      const matchesType = selectedType === 'all' || (r.assessmentType ?? 'exam') === selectedType;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (r.studentName ?? '').toLowerCase().includes(q) ||
        (r.examTitle ?? '').toLowerCase().includes(q) ||
        (r.courseTitle ?? '').toLowerCase().includes(q);
      return matchesCourse && matchesSearch && matchesType;
    });
  }, [results, selectedCourse, selectedType, search]);

  // Group by student for "by-student" view
  const studentGroups = useMemo<StudentGroup[]>(() => {
    const map = new Map<string, StudentGroup>();
    for (const r of filtered) {
      const key = r.studentId;
      if (!map.has(key)) {
        map.set(key, {
          studentId: r.studentId,
          studentName: r.studentName,
          results: [],
          totalScore: 0,
          totalMax: 0,
          avgPct: 0,
        });
      }
      const group = map.get(key)!;
      group.results.push(r);
      group.totalScore += r.score;
      group.totalMax += r.maxScore ?? 100;
    }

    // Calculate average percentage per student
    for (const [, group] of map) {
      group.avgPct =
        group.results.length > 0
          ? Math.round(
              group.results.reduce(
                (sum, r) => sum + (r.maxScore ? (r.score / r.maxScore) * 100 : 0),
                0
              ) / group.results.length
            )
          : 0;
    }

    return Array.from(map.values()).sort((a, b) => b.avgPct - a.avgPct);
  }, [filtered]);

  // Summary stats
  const totalSubmissions = filtered.length;
  const uniqueStudents = new Set(filtered.map((r) => r.studentId)).size;
  const avgPct =
    filtered.length > 0
      ? Math.round(
          filtered.reduce((sum, r) => sum + (r.maxScore ? (r.score / r.maxScore) * 100 : 0), 0) /
            filtered.length
        )
      : 0;

  const toggleExpand = (studentId: string) => {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const expandAll = () => setExpandedStudents(new Set(studentGroups.map((g) => g.studentId)));
  const collapseAll = () => setExpandedStudents(new Set());

  const getGradeLabel = (pct: number) => {
    if (pct >= 97) return { label: '1.00', color: '#10b981' };
    if (pct >= 94) return { label: '1.25', color: '#10b981' };
    if (pct >= 91) return { label: '1.50', color: '#22d3ee' };
    if (pct >= 88) return { label: '1.75', color: '#22d3ee' };
    if (pct >= 85) return { label: '2.00', color: '#06b6d4' };
    if (pct >= 82) return { label: '2.25', color: '#6366f1' };
    if (pct >= 79) return { label: '2.50', color: '#6366f1' };
    if (pct >= 76) return { label: '2.75', color: '#8b5cf6' };
    if (pct >= 75) return { label: '3.00', color: '#f59e0b' };
    return { label: '5.00 (Failed)', color: '#f43f5e' };
  };

  return (
    <MotionBackground>
      <div className="relative z-10 space-y-6 pt-6 max-w-7xl mx-auto pb-12 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-300">

        {/* ─── Header ─── */}
        <header className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 px-6 py-5 flex flex-col md:flex-row justify-between items-start md:items-center shadow-lg rounded-2xl gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Student Scores</h1>
            <p className="text-cyan-400 mt-1 text-sm font-medium opacity-90">
              Per-student quiz and exam scores across your courses — exportable for grade computation
            </p>
          </div>
          <button
            onClick={() => exportCSV(filtered)}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-[1.03] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(16,185,129,0.2)]"
            style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)' }}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </header>

        {/* ─── Summary Stats ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: <ClipboardList className="w-5 h-5" />, label: 'Total Submissions', value: totalSubmissions, color: 'cyan' },
            { icon: <Users className="w-5 h-5" />, label: 'Unique Students', value: uniqueStudents, color: 'violet' },
            { icon: <TrendingUp className="w-5 h-5" />, label: 'Average Score', value: `${avgPct}%`, color: 'emerald' },
          ].map(({ icon, label, value, color }) => (
            <div
              key={label}
              className="rounded-2xl border backdrop-blur-md shadow-lg p-5 flex items-center gap-4 transition-all hover:scale-[1.02]"
              style={{
                background: 'rgba(15, 23, 42, 0.45)',
                borderColor: `rgba(${color === 'cyan' ? '6,182,212' : color === 'violet' ? '139,92,246' : '16,185,129'}, 0.25)`,
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0"
                style={{
                  background: `rgba(${color === 'cyan' ? '6,182,212' : color === 'violet' ? '139,92,246' : '16,185,129'}, 0.12)`,
                  borderColor: `rgba(${color === 'cyan' ? '6,182,212' : color === 'violet' ? '139,92,246' : '16,185,129'}, 0.3)`,
                  color: `rgb(${color === 'cyan' ? '34,211,238' : color === 'violet' ? '167,139,250' : '52,211,153'})`,
                }}
              >
                {icon}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
                <p className="text-2xl font-black text-white mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Filters & View Mode ─── */}
        <div
          className="rounded-2xl border border-slate-800/80 p-4 flex flex-col sm:flex-row gap-4 backdrop-blur-md shadow-md"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
        >
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search student, exam, or course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-800/80 text-sm text-slate-200 outline-none focus:border-cyan-500/40 transition-colors bg-slate-950/45 focus:ring-1 focus:ring-cyan-500/25"
            />
          </div>

          {/* Course filter */}
          <div className="relative">
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 rounded-xl border border-slate-800/80 text-sm text-slate-200 outline-none focus:border-cyan-500/40 transition-colors cursor-pointer bg-slate-950/45 focus:ring-1 focus:ring-cyan-500/25"
            >
              {courseOptions.map((c) => (
                <option key={c} value={c} style={{ background: '#0b0e27' }}>
                  {c === 'all' ? 'All Courses' : c}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* Type filter */}
          <div className="relative">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 rounded-xl border border-slate-800/80 text-sm text-slate-200 outline-none focus:border-cyan-500/40 transition-colors cursor-pointer bg-slate-950/45"
            >
              {typeOptions.map((t) => (
                <option key={t} value={t} style={{ background: '#0b0e27' }}>
                  {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* View mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl border border-slate-800/80 bg-slate-950/45 shrink-0">
            <button
              onClick={() => setViewMode('by-student')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'by-student'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              By Student
            </button>
            <button
              onClick={() => setViewMode('by-assessment')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'by-assessment'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              By Assessment
            </button>
          </div>
        </div>

        {/* ─── Scores Content ─── */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-cyan-500/40 border-t-cyan-400 animate-spin" />
            <span className="text-sm text-slate-500">Loading scores...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center py-20 gap-3 backdrop-blur-md"
            style={{ background: 'rgba(15, 23, 42, 0.35)' }}
          >
            <BookOpen className="w-10 h-10 text-slate-700" />
            <p className="text-sm text-slate-500 font-semibold">No scores found.</p>
            <p className="text-[10px] text-slate-600">Scores will appear here once students submit assessments.</p>
          </div>
        ) : viewMode === 'by-student' ? (
          /* ── By Student View ── */
          <div className="space-y-4">
            {/* Expand / Collapse All */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">{studentGroups.length} student{studentGroups.length !== 1 ? 's' : ''} found</p>
              <div className="flex gap-2">
                <button onClick={expandAll} className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-semibold">
                  Expand All
                </button>
                <span className="text-slate-700">·</span>
                <button onClick={collapseAll} className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-semibold">
                  Collapse All
                </button>
              </div>
            </div>

            {studentGroups.map((group, gIdx) => {
              const isExpanded = expandedStudents.has(group.studentId);
              const grade = getGradeLabel(group.avgPct);
              const rankColors = ['#f59e0b', '#94a3b8', '#b45309'];
              const rankColor = gIdx < 3 ? rankColors[gIdx] : undefined;

              return (
                <div
                  key={group.studentId}
                  className="rounded-2xl border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-lg transition-all duration-200 hover:border-slate-700/80"
                  style={{ background: 'rgba(15, 23, 42, 0.4)' }}
                >
                  {/* Student header row */}
                  <button
                    onClick={() => toggleExpand(group.studentId)}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 border"
                      style={{
                        background: 'rgba(99,102,241,0.12)',
                        borderColor: 'rgba(99,102,241,0.3)',
                        color: '#a78bfa',
                      }}
                    >
                      {(group.studentName ?? 'S')[0].toUpperCase()}
                    </div>

                    {/* Student name + course count */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-200 truncate">{group.studentName}</span>
                        {rankColor && gIdx === 0 && (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider" style={{ color: rankColor, borderColor: `${rankColor}40`, background: `${rankColor}15` }}>
                            🏆 Top Score
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {group.results.length} submission{group.results.length !== 1 ? 's' : ''} · ID: {group.studentId.slice(0, 12)}…
                      </p>
                    </div>

                    {/* Average score bar */}
                    <div className="hidden sm:flex flex-col items-end gap-1 min-w-[140px]">
                      <div className="flex items-center gap-2 w-full">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${group.avgPct}%`,
                              background:
                                group.avgPct >= 80
                                  ? '#10b981'
                                  : group.avgPct >= 60
                                  ? '#06b6d4'
                                  : group.avgPct >= 40
                                  ? '#f59e0b'
                                  : '#f43f5e',
                            }}
                          />
                        </div>
                        <span
                          className="text-xs font-black font-mono shrink-0"
                          style={{
                            color:
                              group.avgPct >= 80
                                ? '#10b981'
                                : group.avgPct >= 60
                                ? '#06b6d4'
                                : group.avgPct >= 40
                                ? '#f59e0b'
                                : '#f43f5e',
                          }}
                        >
                          {group.avgPct}%
                        </span>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                        style={{ color: grade.color, borderColor: `${grade.color}40`, background: `${grade.color}12` }}
                      >
                        Grade: {grade.label}
                      </span>
                    </div>

                    {/* Expand chevron */}
                    <ChevronRight
                      className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-cyan-400' : ''}`}
                    />
                  </button>

                  {/* Expanded: all assessments for this student */}
                  {isExpanded && (
                    <div className="border-t border-slate-800/60 divide-y divide-slate-800/40">
                      {/* Sub-header */}
                      <div
                        className="grid px-6 py-2 text-[9px] uppercase tracking-widest text-slate-500 font-bold"
                        style={{ gridTemplateColumns: '2fr 1.5fr 80px 1.5fr 70px' }}
                      >
                        <span>Assessment</span>
                        <span>Course</span>
                        <span>Type</span>
                        <span>Score</span>
                        <span className="text-right">Date</span>
                      </div>

                      {group.results.map((r, rIdx) => {
                        const dateStr = r.timestamp
                          ? new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                          : '—';
                        const aType = (r.assessmentType ?? 'exam').toLowerCase();

                        return (
                          <div
                            key={`${r.examId}-${rIdx}`}
                            className="grid px-6 py-3 items-center hover:bg-white/[0.02] transition-colors text-xs"
                            style={{ gridTemplateColumns: '2fr 1.5fr 80px 1.5fr 70px' }}
                          >
                            <span className="text-slate-300 font-medium truncate pr-3">{r.examTitle}</span>
                            <span className="text-slate-400 truncate pr-3">{r.courseTitle}</span>
                            <span>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  aType === 'quiz'
                                    ? 'bg-violet-500/10 text-violet-300 border-violet-500/25'
                                    : 'bg-blue-500/10 text-blue-300 border-blue-500/25'
                                }`}
                              >
                                {aType.charAt(0).toUpperCase() + aType.slice(1)}
                              </span>
                            </span>
                            <div className="pr-4">
                              <ScoreBar score={r.score} max={r.maxScore ?? 100} />
                            </div>
                            <span className="text-[10px] text-slate-500 text-right">{dateStr}</span>
                          </div>
                        );
                      })}

                      {/* Student total summary row */}
                      <div className="px-6 py-3 flex items-center justify-between bg-slate-900/30">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                          Total across {group.results.length} assessment{group.results.length !== 1 ? 's' : ''}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-black font-mono text-white">
                            {group.totalScore} / {group.totalMax} pts
                          </span>
                          <span
                            className="text-xs font-black px-2.5 py-1 rounded-xl border"
                            style={{ color: grade.color, borderColor: `${grade.color}40`, background: `${grade.color}12` }}
                          >
                            {group.avgPct}% avg · Grade {grade.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── By Assessment View ── */
          <div
            className="rounded-2xl border border-slate-800/80 overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md"
            style={{ background: 'rgba(15, 23, 42, 0.35)' }}
          >
            {/* Table header */}
            <div
              className="grid px-6 py-4 border-b border-slate-800/80 text-[10px] uppercase tracking-widest text-slate-400 font-bold"
              style={{
                gridTemplateColumns: '2fr 2fr 1.5fr 80px 2fr 70px',
                background: 'linear-gradient(90deg, rgba(6,182,212,0.08) 0%, transparent 100%)',
              }}
            >
              <span>Student</span>
              <span>Assessment</span>
              <span>Course</span>
              <span>Type</span>
              <span>Score</span>
              <span className="text-right">Date</span>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {filtered.map((r, idx) => {
                const dateStr = r.timestamp
                  ? new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—';
                const aType = (r.assessmentType ?? 'exam').toLowerCase();

                return (
                  <div
                    key={`${r.examId}-${r.studentId}-${idx}`}
                    className="grid px-6 py-4 items-center hover:bg-white/[0.03] transition-colors border-b border-white/[0.02]"
                    style={{ gridTemplateColumns: '2fr 2fr 1.5fr 80px 2fr 70px' }}
                  >
                    {/* Student */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 border"
                        style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', borderColor: 'rgba(139,92,246,0.25)' }}
                      >
                        {(r.studentName ?? 'S')[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-slate-200 font-medium truncate">{r.studentName}</span>
                    </div>

                    <span className="text-xs text-slate-300 truncate pr-3">{r.examTitle}</span>
                    <span className="text-xs text-slate-400 truncate pr-3">{r.courseTitle}</span>

                    <span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          aType === 'quiz'
                            ? 'bg-violet-500/10 text-violet-300 border-violet-500/25'
                            : 'bg-blue-500/10 text-blue-300 border-blue-500/25'
                        }`}
                      >
                        {aType.charAt(0).toUpperCase() + aType.slice(1)}
                      </span>
                    </span>

                    <div className="pr-4">
                      <ScoreBar score={r.score} max={r.maxScore ?? 100} />
                    </div>

                    <span className="text-[10px] text-slate-500 text-right">{dateStr}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              Showing {filtered.length} submission{filtered.length !== 1 ? 's' : ''}
              {selectedCourse !== 'all' ? ` in ${selectedCourse}` : ''}
              {selectedType !== 'all' ? ` (${selectedType}s only)` : ''}.
              Data sourced from Firestore + in-memory sessions.
            </p>
            <button
              onClick={() => exportCSV(filtered)}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export {filtered.length} rows to CSV
            </button>
          </div>
        )}
      </div>
    </MotionBackground>
  );
}
