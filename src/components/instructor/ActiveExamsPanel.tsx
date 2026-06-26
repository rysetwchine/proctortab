import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAssessment } from '@/hooks/useAssesment';
import { mockStudents } from '@/data/mockData';
import { Play, Pause, Trash2, CheckCircle, Users, AlertTriangle, FileEdit, Eye, Volume2, Radio } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { formatJoinCode } from '@/utils/codeGenerator';

export const ActiveExamsPanel = () => {
  const { assessments, updateAssessmentStatus, deleteAssessment } = useAssessment();
  const [liveJoinSessions, setLiveJoinSessions] = useState<
    { id: string; title?: string; code?: string; status?: string }[]
  >([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'exam_sessions'), (snapshot) => {
      const active = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s: any) => s.status === 'active');
      setLiveJoinSessions(active as { id: string; title?: string; code?: string; status?: string }[]);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const focus = sessionStorage.getItem('activeExamsFocus');
    if (!focus) return;
    sessionStorage.removeItem('activeExamsFocus');
    const id = focus === 'live-sessions' ? 'active-exams-live-sessions' : 'active-exams-assessments';
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-600">Active</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'completed':
        return <Badge variant="outline">Completed</Badge>;
      default:
        return null;
    }
  };

  const handleDelete = (id: string, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"?`)) {
      deleteAssessment(id);
    }
  };

  // Mock real-time monitoring data
  const liveStudents = mockStudents.slice(0, 5).map((s, idx) => ({
    ...s,
    progress: Math.floor(Math.random() * 100),
    currentQuestion: Math.floor(Math.random() * 20) + 1,
    violations: s.violations,
    lastActivity: new Date(Date.now() - Math.random() * 300000),
  }));

  const activeExams = assessments.filter((a) => a.status === 'active');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Active Assessments</h2>
        <p className="text-muted-foreground mt-1">Monitor join-code sessions and assessment activity</p>
      </div>

      <Card id="active-exams-live-sessions" className="border-2 border-primary/40 scroll-mt-4">
        <CardHeader className="bg-muted/50">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Radio className="h-5 w-5 text-primary" />
            Live join sessions (Firestore)
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Sessions you created from the dashboard with a join code. Count matches &quot;Ongoing Sessions&quot; on the
            home overview.
          </p>
        </CardHeader>
        <CardContent>
          {liveJoinSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No active join-code sessions. Create one from the instructor dashboard.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Title</th>
                    <th className="px-4 py-2 text-left font-semibold">Join code</th>
                    <th className="px-4 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {liveJoinSessions.map((s) => (
                    <tr key={s.id} className="border-b">
                      <td className="px-4 py-3 font-medium">{s.title || 'Untitled'}</td>
                      <td className="px-4 py-3 font-mono">{s.code ? formatJoinCode(s.code) : '—'}</td>
                      <td className="px-4 py-3">
                        <Badge className="bg-green-600">Active</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Monitoring Command Center */}
      {activeExams.length > 0 && (
        <Card className="border-2 border-green-500">
          <CardHeader className="bg-green-50 dark:bg-green-900/20">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                LIVE MONITORING - Command Center
              </CardTitle>
              <Badge className="bg-green-600">{liveStudents.length} Students Online</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4">
              <Card className="border">
                <CardContent className="flex flex-col items-center p-4 text-center">
                  <Users className="w-6 h-6 text-blue-500 mb-1" />
                  <p className="text-2xl font-bold text-blue-500">{liveStudents.length}</p>
                  <p className="text-xs text-muted-foreground">Active Students</p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardContent className="flex flex-col items-center p-4 text-center">
                  <AlertTriangle className="w-6 h-6 text-red-500 mb-1" />
                  <p className="text-2xl font-bold text-red-500">
                    {liveStudents.filter((s) => s.violations > 0).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Alerts</p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardContent className="flex flex-col items-center p-4 text-center">
                  <FileEdit className="w-6 h-6 text-purple-500 mb-1" />
                  <p className="text-2xl font-bold text-purple-500">
                    {liveStudents.reduce((sum, s) => sum + s.violations, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Violations</p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardContent className="flex flex-col items-center p-4 text-center">
                  <Volume2 className="w-6 h-6 text-orange-500 mb-1" />
                  <p className="text-2xl font-bold text-orange-500">ON</p>
                  <p className="text-xs text-muted-foreground">Alarm Device</p>
                </CardContent>
              </Card>
            </div>

            {/* Live Student Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Student</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Progress</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Question</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Tab Switches</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {liveStudents.map((student) => (
                    <tr key={student.id} className="border-b hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-sm">{student.name}</p>
                          <p className="text-xs text-muted-foreground">{student.id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-blue-500 h-full rounded-full"
                              style={{ width: `${student.progress}%` }}
                            />
                          </div>
                          <span className="text-xs">{student.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{student.currentQuestion}/20</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${student.violations > 2 ? 'text-red-600' : student.violations > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {student.violations}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {student.violations > 2 ? (
                          <Badge variant="destructive">Warning</Badge>
                        ) : student.violations > 0 ? (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Suspicious</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-100 text-green-800">Normal</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="ghost">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Assessments */}
      <div id="active-exams-assessments" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">All Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {assessments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No assessments created yet. Go to "Create Assessment" to get started.
              </div>
            ) : (
              assessments.map((exam) => (
                <Card key={exam.id} className={`border-2 ${exam.status === 'active' ? 'border-green-300' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-lg">{exam.title}</h3>
                          {getStatusBadge(exam.status)}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-muted-foreground">
                          <div>
                            <span className="font-semibold">Duration:</span> {exam.duration} min
                          </div>
                          <div>
                            <span className="font-semibold">Questions:</span> {exam.questions.length}
                          </div>
                          <div>
                            <span className="font-semibold">Students:</span>{' '}
                            {exam.totalStudents || 0}
                          </div>
                          <div>
                            <span className="font-semibold">Created:</span> {formatDate(exam.createdAt)}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap justify-end">
                        {exam.status === 'draft' && (
                          <Button
                            size="sm"
                            onClick={() => updateAssessmentStatus(exam.id, 'active')}
                            className="gap-2 bg-green-600 hover:bg-green-700"
                          >
                            <Play className="w-4 h-4" />
                            Activate
                          </Button>
                        )}
                        {exam.status === 'active' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateAssessmentStatus(exam.id, 'completed')}
                              className="gap-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Complete
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateAssessmentStatus(exam.id, 'draft')}
                              className="gap-2"
                            >
                              <Pause className="w-4 h-4" />
                              Pause
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(exam.id, exam.title)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};
