import { useState, useMemo } from 'react';
import { MotionBackground } from '@/components/shared/MotionBackground';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Award, 
  BookOpen, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  ChevronRight, 
  Info,
  Calendar,
  AlertCircle
} from 'lucide-react';

export function StudentGradesPanel() {
  const { sessions } = useSession();
  const { user } = useAuth();
  const studentId = resolveEnrollmentStudentId(user);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Enrolled courses
  const enrolledCourses = useMemo(() => {
    if (!studentId) return [];
    const sid = String(studentId);
    return sessions.filter(
      (s) => s.type === 'course' && (s.enrolledStudents ?? []).some((id) => String(id) === sid)
    );
  }, [sessions, studentId]);

  // All assessments from enrolled courses
  const allAssessments = useMemo(() => {
    return enrolledCourses.flatMap((c) => 
      (c.assessments ?? []).map((a: any) => ({ ...a, __course: c }))
    );
  }, [enrolledCourses]);

  // Map to student grade details
  const studentRows = useMemo(() => {
    const sid = String(studentId);
    return allAssessments.map((a: any) => {
      const sub = (a.submissions ?? []).find((s: any) => String(s.studentId) === sid);
      const score = sub?.score;
      const maxScore = a.maxScore ?? 100;
      const passingScore = a.passingScore ?? Math.round(maxScore * 0.5);
      
      let status: 'passed' | 'failed' | 'pending' = 'pending';
      if (score != null) {
        status = score >= passingScore ? 'passed' : 'failed';
      }

      return {
        id: a.id,
        title: a.title,
        courseId: a.__course?.id,
        courseTitle: a.__course?.title ?? a.__course?.name ?? 'Course',
        maxScore,
        score,
        passingScore,
        status,
        submittedAt: sub?.submittedAt,
        duration: a.duration,
        type: a.assessmentType ?? 'exam',
      };
    });
  }, [allAssessments, studentId]);

  // Statistics calculation
  const completedGrades = useMemo(() => {
    return studentRows.filter((r) => r.score != null) as Array<Required<Pick<typeof studentRows[number], 'score'>> & typeof studentRows[number]>;
  }, [studentRows]);

  const stats = useMemo(() => {
    if (completedGrades.length === 0) {
      return {
        avgPercentage: 0,
        passingRate: 0,
        totalPoints: 0,
        totalMaxPoints: 0,
        gpa: 'N/A',
        gpaColor: 'text-slate-400',
        completedCount: 0,
        pendingCount: studentRows.length,
      };
    }

    let totalPercentageSum = 0;
    let passedCount = 0;
    let totalPoints = 0;
    let totalMaxPoints = 0;

    completedGrades.forEach((g) => {
      const pct = (g.score / g.maxScore) * 100;
      totalPercentageSum += pct;
      totalPoints += g.score;
      totalMaxPoints += g.maxScore;
      if (g.status === 'passed') {
        passedCount++;
      }
    });

    const avgPercentage = totalPercentageSum / completedGrades.length;
    const passingRate = (passedCount / completedGrades.length) * 100;

    // Standard local grade mapping
    let gpa = 'F';
    let gpaColor = 'text-red-400';
    if (avgPercentage >= 95) { gpa = 'A+'; gpaColor = 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]'; }
    else if (avgPercentage >= 90) { gpa = 'A'; gpaColor = 'text-emerald-400'; }
    else if (avgPercentage >= 85) { gpa = 'B+'; gpaColor = 'text-teal-400'; }
    else if (avgPercentage >= 80) { gpa = 'B'; gpaColor = 'text-teal-400'; }
    else if (avgPercentage >= 75) { gpa = 'C+'; gpaColor = 'text-indigo-400'; }
    else if (avgPercentage >= 70) { gpa = 'C'; gpaColor = 'text-indigo-400'; }
    else if (avgPercentage >= 60) { gpa = 'D'; gpaColor = 'text-amber-400'; }

    return {
      avgPercentage: Math.round(avgPercentage * 10) / 10,
      passingRate: Math.round(passingRate * 10) / 10,
      totalPoints,
      totalMaxPoints,
      gpa,
      gpaColor,
      completedCount: completedGrades.length,
      pendingCount: studentRows.length - completedGrades.length,
    };
  }, [completedGrades, studentRows]);

  // Filtering
  const filteredRows = useMemo(() => {
    return studentRows.filter((row) => {
      const matchesSearch = 
        row.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.courseTitle.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCourse = courseFilter === 'all' || row.courseId === courseFilter;
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;

      return matchesSearch && matchesCourse && matchesStatus;
    }).sort((x, y) => {
      // Sort: Completed (recent first) then Pending
      if (x.submittedAt && y.submittedAt) {
        return new Date(y.submittedAt).getTime() - new Date(x.submittedAt).getTime();
      }
      if (x.submittedAt) return -1;
      if (y.submittedAt) return 1;
      return 0;
    });
  }, [studentRows, searchQuery, courseFilter, statusFilter]);

  // Selected row detailed details
  const selectedRowDetails = useMemo(() => {
    if (!selectedRowId) return null;
    return studentRows.find((r) => r.id === selectedRowId) || null;
  }, [studentRows, selectedRowId]);

  // SVG Chart points
  const chartPoints = useMemo(() => {
    // Sort completed grades chronologically
    const sorted = [...completedGrades].sort((x, y) => {
      return new Date(x.submittedAt || 0).getTime() - new Date(y.submittedAt || 0).getTime();
    });

    if (sorted.length === 0) return [];
    if (sorted.length === 1) {
      return [{ x: 50, y: 100 - (sorted[0].score / sorted[0].maxScore) * 80, label: sorted[0].title, pct: Math.round((sorted[0].score / sorted[0].maxScore) * 100) }];
    }

    return sorted.map((g, idx) => {
      const percentage = (g.score / g.maxScore) * 100;
      // Spread across 100% width
      const x = 10 + (idx / (sorted.length - 1)) * 80;
      // Invert Y because SVG coordinate starts from top (clamp between 10% and 90% height)
      const y = 90 - (percentage / 100) * 80;
      return {
        x,
        y,
        label: g.title,
        pct: Math.round(percentage),
      };
    });
  }, [completedGrades]);

  // SVG path drawing helpers
  const svgPathD = useMemo(() => {
    if (chartPoints.length < 2) return '';
    return chartPoints.reduce((acc, p, idx) => {
      if (idx === 0) return `M ${p.x} ${p.y}`;
      // Smooth cubic bezier curves or straight lines
      const prev = chartPoints[idx - 1];
      const cpX1 = prev.x + (p.x - prev.x) / 2;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (p.x - prev.x) / 2;
      const cpY2 = p.y;
      return `${acc} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p.x} ${p.y}`;
    }, '');
  }, [chartPoints]);

  return (
    <MotionBackground>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6 lg:px-8 space-y-6 animate-in fade-in duration-300">
        
        {/* Top Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
              My Academic Grades
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              View your performance scores, GPA status, and assessment feedback.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs bg-slate-950/40 border border-slate-800/80 px-3 py-1.5 rounded-full text-slate-300 backdrop-blur-sm self-start">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>Academic Term: 2026 Q2</span>
          </div>
        </div>

        {/* Central Filters and Table Grid */}
        <div className={`grid grid-cols-1 gap-6 ${selectedRowDetails ? 'lg:grid-cols-[1fr_360px]' : ''}`}>
          
          <div className="space-y-4">
            {/* Filter Panel */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-slate-950/30 border border-slate-800/80 p-3.5 rounded-2xl backdrop-blur-md">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type="text"
                  placeholder="Search assessment or course..."
                  className="pl-10 bg-slate-900/40 border-slate-800/80 text-white placeholder-slate-500 focus-visible:ring-indigo-500/50"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={courseFilter} onValueChange={setCourseFilter}>
                  <SelectTrigger className="w-[150px] bg-slate-900/40 border-slate-800/80 text-slate-200 focus:ring-indigo-500/50">
                    <SelectValue placeholder="All Courses" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    <SelectItem value="all">All Courses</SelectItem>
                    {enrolledCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px] bg-slate-900/40 border-slate-800/80 text-slate-200 focus:ring-indigo-500/50">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Grades Table */}
            <div className="overflow-hidden border border-slate-800/80 bg-[#070420]/30 backdrop-blur-md rounded-2xl shadow-2xl">
              <Table className="w-full border-collapse text-sm text-slate-300">
                <TableHeader>
                  <TableRow className="bg-slate-950/60 border-b border-slate-800/80 text-slate-400">
                    <TableHead className="px-4 py-3 text-left">Course</TableHead>
                    <TableHead className="px-4 py-3 text-left">Assessment</TableHead>
                    <TableHead className="px-4 py-3 text-center">Type</TableHead>
                    <TableHead className="px-4 py-3 text-center">Score</TableHead>
                    <TableHead className="px-4 py-3 text-center">Status</TableHead>
                    <TableHead className="px-4 py-3 text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-900/60">
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="px-4 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <AlertCircle className="w-8 h-8 text-slate-600" />
                          <p>No assessment records match your filters.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow 
                        key={row.id} 
                        className={`hover:bg-slate-900/25 transition-colors cursor-pointer ${
                          selectedRowId === row.id ? 'bg-indigo-500/10' : ''
                        }`}
                        onClick={() => setSelectedRowId(selectedRowId === row.id ? null : row.id)}
                      >
                        <TableCell className="px-4 py-4 font-semibold text-slate-200">
                          {row.courseTitle}
                        </TableCell>
                        <TableCell className="px-4 py-4 max-w-[200px] truncate">
                          {row.title}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-center">
                          <Badge variant="outline" className="border-slate-800 text-slate-400 capitalize">
                            {row.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-center font-bold font-mono">
                          {row.score != null ? `${row.score} / ${row.maxScore}` : '—'}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-center">
                          {row.status === 'passed' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Passed
                            </span>
                          )}
                          {row.status === 'failed' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
                              <XCircle className="w-3.5 h-3.5" />
                              Failed
                            </span>
                          )}
                          {row.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                              <Clock className="w-3.5 h-3.5" />
                              Pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right">
                          <button 
                            type="button" 
                            className="p-1 bg-slate-900/60 border border-slate-800 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
                            aria-label="Toggle details view"
                          >
                            <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${
                              selectedRowId === row.id ? 'rotate-90 text-indigo-400' : ''
                            }`} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Details Panel Sidebar */}
          {selectedRowDetails && (
            <div className="border border-slate-800/80 bg-[#070420]/35 backdrop-blur-md rounded-2xl shadow-2xl p-5 space-y-4 animate-in slide-in-from-right duration-300 self-start">
              <div className="border-b border-slate-900/80 pb-4">
                <div className="flex items-center justify-between">
                  <Badge className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20">
                    Grade Breakdown
                  </Badge>
                  <button 
                    onClick={() => setSelectedRowId(null)}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    Close
                  </button>
                </div>
                <h3 className="text-lg font-bold text-white mt-2 leading-tight">
                  {selectedRowDetails.title}
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  {selectedRowDetails.courseTitle}
                </p>
              </div>
              <div className="pt-5 space-y-4 text-sm">
                
                {/* Stats Breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950/40 border border-slate-900 p-3 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase">Obtained Score</p>
                    <p className="text-xl font-bold font-mono mt-1 text-white">
                      {selectedRowDetails.score != null ? selectedRowDetails.score : 'Pending'}
                    </p>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-900 p-3 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase">Maximum Points</p>
                    <p className="text-xl font-bold font-mono mt-1 text-white">
                      {selectedRowDetails.maxScore}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Passing Threshold</span>
                    <span className="font-mono text-white">{selectedRowDetails.passingScore} points ({Math.round((selectedRowDetails.passingScore/selectedRowDetails.maxScore)*100)}%)</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Time Limit</span>
                    <span className="font-mono text-white">{selectedRowDetails.duration} mins</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Submission Date</span>
                    <span className="font-mono text-white">
                      {selectedRowDetails.submittedAt 
                        ? new Date(selectedRowDetails.submittedAt).toLocaleDateString()
                        : 'Not submitted yet'}
                    </span>
                  </div>
                </div>

                <div className="h-px bg-slate-900" />

                {/* Status Advice Card */}
                {selectedRowDetails.score != null ? (
                  <div className={`p-4 rounded-xl border ${
                    selectedRowDetails.status === 'passed' 
                      ? 'bg-emerald-950/20 border-emerald-900/60 text-emerald-300'
                      : 'bg-red-950/20 border-red-900/60 text-red-300'
                  }`}>
                    <div className="flex gap-2.5">
                      {selectedRowDetails.status === 'passed' 
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                        : <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className="font-semibold">
                          {selectedRowDetails.status === 'passed' ? 'Passing Grade Achieved!' : 'Below Passing Limit'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {selectedRowDetails.status === 'passed' 
                            ? 'Excellent work! You successfully cleared all course thresholds. Keep up the consistent study.' 
                            : 'You did not secure passing marks. Review course modules, complete revision materials, or contact your lecturer.'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-dashed border-slate-800 text-slate-400 bg-slate-950/20 flex gap-2">
                    <Clock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-300">Awaiting Submission</p>
                      <p className="text-xs mt-1 leading-relaxed">
                        This assessment is currently pending. Make sure to review syllabus items and submit before the designated due date.
                      </p>
                    </div>
                  </div>
                )}

                {/* Additional disclaimer info */}
                <div className="flex items-start gap-2 text-[10px] text-slate-500 leading-normal bg-slate-950/20 p-2.5 rounded-lg">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    Grades shown here correspond to automatically calculated ProctorTab scores and are subject to final adjustment by your courses instructor.
                  </span>
                </div>

              </div>
            </div>
          )}

        </div>

      </div>
    </MotionBackground>
  );
}
