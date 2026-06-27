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

/**
 * Professor monitoring dashboard for real-time tab switch tracking
 * Displays all tab switch events with duration, status, and auto-submit status
 */
export const TabMonitoringDashboard = () => {
  const [tabLogs, setTabLogs] = useState<(TabLog & { id: string })[]>([]);
  const [mouseLogs, setMouseLogs] = useState<(MouseBoundaryViolationLog & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'tab_logs'), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as (TabLog & { id: string })[];

      setTabLogs(logs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'assessment_violations'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<MouseBoundaryViolationLog, 'id'>;
        return { id: docSnap.id, ...data };
      });
      setMouseLogs(logs.filter((row) => row.violationType === 'mouse_boundary_exit'));
    });
    return () => unsubscribe();
  }, []);

  const getStatusColor = (status: string) => {
    const s = String(status || '').trim().toLowerCase();
    if (s.includes('accidental') || s === 'warning') {
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
    if (s.includes('suspicious')) {
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
    }
    if (s.includes('intentional') || s === 'violation') {
      return 'bg-red-500/10 text-red-400 border-red-500/30';
    }
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const getStatusBgClass = (status: string) => {
    const s = String(status || '').trim().toLowerCase();
    if (s.includes('accidental') || s === 'warning') {
      return 'bg-blue-950/10 hover:bg-blue-950/20';
    }
    if (s.includes('suspicious')) {
      return 'bg-yellow-950/10 hover:bg-yellow-950/20';
    }
    if (s.includes('intentional') || s === 'violation') {
      return 'bg-red-950/20 hover:bg-red-950/30';
    }
    return 'hover:bg-slate-800/40';
  };

  const stats = {
    total: tabLogs.length,
    warnings: tabLogs.filter((log) => log.status === 'Warning' || log.behaviorClassification === 'Accidental').length,
    suspicious: tabLogs.filter((log) => log.status === 'Suspicious' || log.behaviorClassification === 'Suspicious').length,
    violations: tabLogs.filter((log) => log.status === 'Violation' || log.behaviorClassification === 'Intentional').length,
    autoSubmitted: tabLogs.filter((log) => log.autoSubmitted).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading monitoring data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards - Dark Glassmorphism */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 hover:shadow-xl hover:border-blue-500/30 transition-all duration-300">
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-400">{stats.total}</p>
            <p className="text-sm text-slate-400 font-medium mt-2">Total Events</p>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 hover:shadow-xl hover:border-yellow-500/30 transition-all duration-300">
          <div className="text-center">
            <p className="text-3xl font-bold text-yellow-400">{stats.warnings}</p>
            <p className="text-sm text-slate-400 font-medium mt-2">Warnings (Accidental)</p>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 hover:shadow-xl hover:border-orange-500/30 transition-all duration-300">
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-400">{stats.suspicious}</p>
            <p className="text-sm text-slate-400 font-medium mt-2">Suspicious</p>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 hover:shadow-xl hover:border-red-500/30 transition-all duration-300">
          <div className="text-center">
            <p className="text-3xl font-bold text-red-400">{stats.violations}</p>
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

      {/* Monitoring Table - Dark Glassmorphism */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-b border-slate-700/50 px-6 py-4 backdrop-blur-md">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Tab Switch & Proctoring Monitoring Log
          </h3>
        </div>
        <div className="p-6">
          {tabLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No tab switch events recorded yet
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Student Name</TableHead>
                    <TableHead className="font-semibold">Assessment</TableHead>
                    <TableHead className="font-semibold">Violation Event</TableHead>
                    <TableHead className="font-semibold">Behavior Classification</TableHead>
                    <TableHead className="font-semibold">Warning Displayed</TableHead>
                    <TableHead className="font-semibold text-center">Deducted Time</TableHead>
                    <TableHead className="font-semibold text-center">Strikes</TableHead>
                    <TableHead className="font-semibold text-center">Auto Submitted</TableHead>
                    <TableHead className="font-semibold">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabLogs.map((log, idx) => {
                    const classification = log.behaviorClassification || (
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
                        className={`${getStatusBgClass(classification)} hover:bg-opacity-75 transition-colors`}
                      >
                        <TableCell className="font-medium text-white">{log.studentName}</TableCell>
                        <TableCell className="text-slate-350">{log.assessmentTitle || 'Unknown'}</TableCell>
                        <TableCell>
                          <span className="font-semibold text-red-400">
                            {log.violationType || log.violation || 'Tab Switch'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${getStatusColor(classification)} font-semibold`}
                          >
                            {classification}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-300 max-w-[200px] truncate" title={log.warningMessage || log.evidence || 'Warning displayed.'}>
                          {log.warningMessage || log.evidence || 'Warning displayed.'}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-red-400">
                          {log.deductedTime != null && log.deductedTime > 0
                            ? `-${Math.round(log.deductedTime / 60)} min`
                            : 'None'}
                        </TableCell>
                        <TableCell className="text-center font-bold text-slate-300">
                          {log.intentionalViolationCount != null ? `${log.intentionalViolationCount}/3` : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {log.autoSubmitted ? (
                            <Badge className="bg-red-600 hover:bg-red-700 gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Auto Submitted
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
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

      {/* Mouse Boundary Exit Violations - Dark Glassmorphism */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-b border-slate-700/50 px-6 py-4 backdrop-blur-md">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Mouse Boundary Exit Log
          </h3>
        </div>
        <div className="p-6">
          {mouseLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No mouse boundary violations recorded yet
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Student</TableHead>
                    <TableHead className="font-semibold">Assessment</TableHead>
                    <TableHead className="font-semibold text-center">Time Deducted</TableHead>
                    <TableHead className="font-semibold text-center">Violation</TableHead>
                    <TableHead className="font-semibold">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mouseLogs.map((log, idx) => (
                    <TableRow
                      key={log.id}
                      className={`${idx % 2 === 0 ? '' : ''} hover:bg-muted/30 transition-colors`}
                    >
                      <TableCell className="font-medium">
                        {log.studentName || log.userId}
                      </TableCell>
                      <TableCell>{log.assessmentTitle || log.examId || log.quizId || 'Unknown'}</TableCell>
                      <TableCell className="text-center font-semibold">
                        {log.deductedMinutes} min
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 font-semibold">
                          {log.violationType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.timestamp
                          ? new Date(log.timestamp.toDate?.() || log.timestamp).toLocaleString()
                          : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
