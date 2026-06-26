import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAssessment } from '@/hooks/useAssesment';
import { Play, Pause, Trash2, CheckCircle } from 'lucide-react';

export const ActiveExams = () => {
  const { assessments, updateAssessmentStatus, deleteAssessment } = useAssessment();

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Active Assessments</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {assessments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No assessments created yet. Click "Create Assessment" to get started.
            </div>
          ) : (
            assessments.map((exam) => (
              <Card key={exam.id} className="border-2">
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

                    <div className="flex gap-2">
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
  );
};
