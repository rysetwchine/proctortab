import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/firebase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import type { MouseBoundaryViolationLog, TabLog } from '@/types';
import { useSession } from '@/hooks/useSession';

/**
 * Professor monitoring dashboard for real-time tab switch tracking
 * Displays all tab switch events with duration, status, and auto-submit status
 */
export const TabMonitoringDashboard = () => {
  const { sessions } = useSession();
  const myCourseIds = sessions.map((s) => String(s.id));
  const [violations, setViolations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState('All Sections');

  useEffect(() => {
    if (myCourseIds.length === 0) {
      setViolations([]);
      setLoading(false);
      return;
    }

    // Query violations in real-time ordered by timestamp
    const q = query(collection(db, 'assessment_violations'), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Enforce Professor Data Isolation
      const filtered = list.filter((v: any) => myCourseIds.includes(String(v.courseId)));
      setViolations(filtered);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [sessions]);

  const getStatusColor = (classification: string) => {
    const c = String(classification || '').trim().toLowerCase();
    if (c.includes('accidental') || c === 'warning') {
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
    if (c.includes('suspicious')) {
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
    }
    if (c.includes('intentional') || c === 'violation' || c === 'confirmed violation') {
      return 'bg-red-500/10 text-red-400 border-red-500/30';
    }
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const getStatusBgClass = (classification: string) => {
    const c = String(classification || '').trim().toLowerCase();
    if (c.includes('accidental') || c === 'warning') {
      return 'bg-blue-950/10 hover:bg-blue-950/20';
    }
    if (c.includes('suspicious')) {
      return 'bg-yellow-950/10 hover:bg-yellow-950/20';
    }
    if (c.includes('intentional') || c === 'violation' || c === 'confirmed violation') {
      return 'bg-red-950/20 hover:bg-red-950/30';
    }
    return 'hover:bg-slate-800/40';
  };

  const filteredViolations = violations.filter((v) => {
    if (selectedSection === 'All Sections') return true;
    return String(v.studentSection || v.section || '').trim() === selectedSection;
  });

  const stats = {
    total: filteredViolations.length,
    warnings: filteredViolations.filter(
      (v) =>
        v.behaviorClassification === 'Accidental' ||
        v.severityLevel === 'Warning' ||
        v.status === 'Warning'
    ).length,
    suspicious: filteredViolations.filter(
      (v) =>
        v.behaviorClassification === 'Suspicious' ||
        v.severityLevel === 'Suspicious' ||
        v.status === 'Suspicious'
    ).length,
    violations: filteredViolations.filter(
      (v) =>
        v.behaviorClassification === 'Intentional' ||
        v.severityLevel === 'Confirmed Violation' ||
        v.status === 'Violation'
    ).length,
    autoSubmitted: filteredViolations.filter((v) => v.autoSubmitted).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading proctoring monitoring data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title & Section Filter Select dropdown */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Live Student Monitoring
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filter Section:</span>
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500/50"
          >
            <option value="All Sections">All Sections</option>
            <option value="Section A">Section A</option>
            <option value="Section B">Section B</option>
            <option value="Section C">Section C</option>
            <option value="Section D">Section D</option>
          </select>
        </div>
      </div>
      {/* Statistics Cards - Dark Glassmorphism */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 hover:shadow-xl hover:border-blue-500/30 transition-all duration-300">
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-400">{stats.total}</p>
            <p className="text-sm text-slate-400 font-medium mt-2">Total Events</p>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 hover:shadow-xl hover:border-blue-500/30 transition-all duration-300">
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-400">{stats.warnings}</p>
            <p className="text-sm text-slate-400 font-medium mt-2">Warnings (Accidental)</p>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 hover:shadow-xl hover:border-yellow-500/30 transition-all duration-300">
          <div className="text-center">
            <p className="text-3xl font-bold text-yellow-400">{stats.suspicious}</p>
            <p className="text-sm text-slate-400 font-medium mt-2">Suspicious</p>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 hover:shadow-xl hover:border-orange-500/30 transition-all duration-300">
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-400">{stats.violations}</p>
            <p className="text-sm text-slate-400 font-medium mt-2">Intentional Violations</p>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 hover:shadow-xl hover:border-red-500/30 transition-all duration-300">
          <div className="text-center">
            <p className="text-3xl font-bold text-red-400">{stats.autoSubmitted}</p>
            <p className="text-sm text-slate-400 font-medium mt-2">Auto-Submitted</p>
          </div>
        </div>
      </div>

      {/* Unified Live Proctoring Table - Dark Glassmorphism */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-b border-slate-700/50 px-6 py-4 backdrop-blur-md">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Instructor Real-Time Proctoring & Cheating Monitoring Log
          </h3>
        </div>
        <div className="p-6">
          {filteredViolations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No proctoring violation logs recorded yet for this section
            </p>
          ) : (
            <div className="border border-slate-700 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-800/80 border-b border-slate-700">
                    <TableHead className="font-semibold text-slate-200">Student Details</TableHead>
                    <TableHead className="font-semibold text-slate-200">Assessment</TableHead>
                    <TableHead className="font-semibold text-slate-200">Violation Event</TableHead>
                    <TableHead className="font-semibold text-slate-200">Classification</TableHead>
                    <TableHead className="font-semibold text-slate-200">Warning Details</TableHead>
                    <TableHead className="font-semibold text-slate-200 text-center">Deducted Time</TableHead>
                    <TableHead className="font-semibold text-slate-200 text-center">Strikes</TableHead>
                    <TableHead className="font-semibold text-slate-200 text-center">Auto Submitted</TableHead>
                    <TableHead className="font-semibold text-slate-200">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredViolations.map((log) => {
                    const isMouse = String(log.violationType || '').toLowerCase().includes('mouse');
                    const classification = isMouse 
                      ? 'Suspicious'
                      : log.behaviorClassification || (
                          log.durationSeconds != null && log.durationSeconds > 0
                            ? log.durationSeconds <= 1
                              ? 'Accidental'
                              : log.durationSeconds <= 3
                                ? 'Suspicious'
                                : 'Intentional'
                            : 'Intentional'
                        );

                    return (
                      <TableRow
                        key={log.id}
                        className={`${getStatusBgClass(classification)} border-b border-slate-800/50 transition-colors`}
                      >
                        <TableCell className="font-medium text-white">
                          <div className="font-bold text-slate-100">{log.studentName}</div>
                          <div className="text-xs text-slate-400 font-mono">ID: {log.studentNumber || log.studentId || 'N/A'}</div>
                          <div className="text-[11px] text-cyan-400 font-semibold">{log.studentSection || log.section || 'N/A'}</div>
                        </TableCell>
                        <TableCell className="text-slate-350">
                          <div className="font-semibold text-slate-200">{log.assessmentTitle || 'Unknown'}</div>
                          <div className="text-xs text-slate-400 capitalize">{log.assessmentType || 'Exam'}</div>
                        </TableCell>
                        <TableCell>
                          <span className="font-extrabold text-red-400 uppercase tracking-wide text-xs">
                            {log.violationType || 'Cheating Attempt'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${getStatusColor(classification)} font-semibold uppercase text-[9px]`}
                          >
                            {classification}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-300 max-w-[220px] truncate" title={log.warningMessage || log.evidence || 'Warning sent.'}>
                          {log.warningMessage || log.evidence || 'Warning sent.'}
                        </TableCell>
                        <TableCell className="text-center font-bold text-red-400">
                          {log.deductedTime != null && log.deductedTime > 0
                            ? `-${Math.round(log.deductedTime / 60)} min`
                            : log.deductedMinutes != null && log.deductedMinutes > 0
                              ? `-${log.deductedMinutes} min`
                              : 'None'}
                        </TableCell>
                        <TableCell className="text-center font-extrabold text-slate-300">
                          {log.intentionalViolationCount != null ? `${log.intentionalViolationCount}/3` : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {log.autoSubmitted ? (
                            <Badge className="bg-red-600 hover:bg-red-700 gap-1 text-[10px]">
                              <AlertTriangle className="w-3 h-3 text-white animate-bounce" />
                              Auto Submitted
                            </Badge>
                          ) : (
                            <span className="text-slate-500 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-450">
                          {log.timestamp
                            ? new Date(log.timestamp.toDate?.() || log.timestamp).toLocaleTimeString()
                            : 'N/A'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
