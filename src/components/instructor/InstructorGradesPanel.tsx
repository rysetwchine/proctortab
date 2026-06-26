import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, collectionGroup } from 'firebase/firestore';
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
  CheckCircle2,
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
  maxScore?: number;
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  const color =
    pct >= 80 ? '#10b981' : pct >= 60 ? '#06b6d4' : pct >= 40 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="flex items-center gap-2.5 w-full">
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[10px] font-bold font-mono" style={{ color }}>
        {score} / {max}
      </span>
    </div>
  );
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
                maxScore: exam.maxScore ?? 100,
              });
            });
          } catch {
            // Skip inaccessible collections silently
          }
        }
      }

      // Also pull in-memory submissions as fallback for assessments without Firestore results
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

  const filtered = useMemo(() => {
    return results.filter((r) => {
      const matchesCourse = selectedCourse === 'all' || r.courseTitle === selectedCourse;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (r.studentName ?? '').toLowerCase().includes(q) ||
        (r.examTitle ?? '').toLowerCase().includes(q) ||
        (r.courseTitle ?? '').toLowerCase().includes(q);
      return matchesCourse && matchesSearch;
    });
  }, [results, selectedCourse, search]);

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

  return (
    <MotionBackground>
      {/* ================= MAIN CONTENT WRAPPER ================= */}
      <div className="relative z-10 space-y-6 pt-6 max-w-7xl mx-auto pb-12 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-300">

        {/* ─── Header ─── */}
        <header className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-lg rounded-xl gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Student Grades</h1>
            <p className="text-cyan-400 mt-1 text-sm font-medium opacity-90">
              All student exam scores across your courses — real-time from Firestore
            </p>
          </div>
        </header>

        {/* ─── Summary Stats ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: <Award className="w-5 h-5" />, label: 'Total Submissions', value: totalSubmissions, color: 'cyan' },
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

        {/* ─── Filters ─── */}
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
        </div>

        {/* ─── Results Table ─── */}
        <div
          className="rounded-2xl border border-slate-800/80 overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md"
          style={{ background: 'rgba(15, 23, 42, 0.35)' }}
        >
          {/* Table header */}
          <div
            className="grid px-6 py-4 border-b border-slate-800/80 text-[10px] uppercase tracking-widest text-slate-400 font-bold"
            style={{
              gridTemplateColumns: '2fr 2fr 1.5fr 2fr 80px',
              background: 'linear-gradient(90deg, rgba(6,182,212,0.08) 0%, transparent 100%)',
            }}
          >
            <span>Student</span>
            <span>Assessment</span>
            <span>Course</span>
            <span>Score</span>
            <span className="text-right">Date</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-cyan-500/40 border-t-cyan-400 animate-spin" />
              <span className="text-xs text-slate-500">Loading grades...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <BookOpen className="w-8 h-8 text-slate-700" />
              <p className="text-sm text-slate-500">No grades found.</p>
              <p className="text-[10px] text-slate-600">Scores will appear here once students submit assessments.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {filtered.map((r, idx) => {
                const pct = r.maxScore ? Math.round((r.score / r.maxScore) * 100) : 0;
                const dateStr = r.timestamp
                  ? new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—';

                return (
                  <div
                    key={`${r.examId}-${r.studentId}-${idx}`}
                    className="grid px-6 py-4 items-center hover:bg-white/[0.03] transition-colors border-b border-white/[0.02]"
                    style={{ gridTemplateColumns: '2fr 2fr 1.5fr 2fr 80px' }}
                  >
                    {/* Student */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 border border-violet-500/25"
                        style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}
                      >
                        {(r.studentName ?? 'S')[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-slate-200 font-medium truncate">{r.studentName}</span>
                    </div>

                    {/* Exam */}
                    <span className="text-xs text-slate-300 truncate pr-3">{r.examTitle}</span>

                    {/* Course */}
                    <span className="text-xs text-slate-400 truncate pr-3">{r.courseTitle}</span>

                    {/* Score bar */}
                    <div className="pr-4">
                      <ScoreBar score={r.score} max={r.maxScore ?? 100} />
                    </div>

                    {/* Date */}
                    <span className="text-[10px] text-slate-500 text-right">{dateStr}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-[10px] text-slate-600 text-center">
            Showing {filtered.length} submission{filtered.length !== 1 ? 's' : ''}
            {selectedCourse !== 'all' ? ` in ${selectedCourse}` : ''}.
            Data sourced from Firestore + in-memory sessions.
          </p>
        )}
      </div>
    </MotionBackground>
  );
}
