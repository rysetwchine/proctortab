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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    switch (status) {
      case 'Warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Suspicious':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Violation':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusBgClass = (status: string) => {
    switch (status) {
      case 'Warning':
        return 'bg-yellow-50';
      case 'Suspicious':
        return 'bg-orange-50';
      case 'Violation':
        return 'bg-red-50';
      default:
        return 'bg-gray-50';
    }
  };

  const stats = {
    total: tabLogs.length,
    warnings: tabLogs.filter((log) => log.status === 'Warning').length,
    suspicious: tabLogs.filter((log) => log.status === 'Suspicious').length,
    violations: tabLogs.filter((log) => log.status === 'Violation').length,
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
      {/* Statistics Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total Events</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-yellow-600">{stats.warnings}</p>
              <p className="text-sm text-muted-foreground">Warnings</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-orange-600">{stats.suspicious}</p>
              <p className="text-sm text-muted-foreground">Suspicious</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-red-600">{stats.violations}</p>
              <p className="text-sm text-muted-foreground">Violations</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-red-700">{stats.autoSubmitted}</p>
              <p className="text-sm text-muted-foreground">Auto-Submitted</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monitoring Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Tab Switch Monitoring Log
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                    <TableHead className="font-semibold text-center">
                      Duration (seconds)
                    </TableHead>
                    <TableHead className="font-semibold text-center">Status</TableHead>
                    <TableHead className="font-semibold text-center">Auto Submitted</TableHead>
                    <TableHead className="font-semibold">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabLogs.map((log, idx) => (
                    <TableRow
                      key={log.id}
                      className={`${getStatusBgClass(log.status)} ${
                        idx % 2 === 0 ? '' : ''
                      } hover:bg-opacity-75 transition-colors`}
                    >
                      <TableCell className="font-medium">{log.studentName}</TableCell>
                      <TableCell>{log.assessmentTitle || 'Unknown'}</TableCell>
                      <TableCell className="text-center font-semibold">
                        {log.durationSeconds}s
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`${getStatusColor(log.status)} font-semibold`}
                        >
                          {log.status}
                        </Badge>
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mouse Boundary Exit Violations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Mouse Boundary Exit Log
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
};
