import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { resolveEnrollmentStudentId } from '@/utils/studentEnrollmentId';
import { Clock, FileText, Shield, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const ActiveExamsPanel = () => {
  const { sessions } = useSession();
  const { user } = useAuth();
  const sid = resolveEnrollmentStudentId(user);

  const activeExams = sessions.filter(
    (s) => 
      s.type === 'exam' && 
      s.status === 'active' && 
      (s.enrolledStudents ?? []).some((id) => String(id) === String(sid))
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Active Assessments</h2>
        <p className="text-muted-foreground mt-1">
          Assessments available for you to take
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {activeExams.map((exam) => (
          <Card key={exam.id} className="hover:shadow-lg transition-shadow border-2 border-primary/20">
            <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white -mx-6 -mt-6 rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {exam.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Duration:</span>
                  <span>{exam.duration || 30} minutes</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Proctoring:</span>
                  <Badge variant="secondary">Active</Badge>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Questions:</span>
                  <span>20 items</span>
                </div>
              </div>

              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    Tab switching and copy-paste are monitored during this assessment
                  </p>
                </div>
              </div>

              <Button className="w-full bg-green-600 hover:bg-green-700">
                Start Assessment
              </Button>
            </CardContent>
          </Card>
        ))}

        {activeExams.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Active Assessments</h3>
              <p className="text-muted-foreground">
                You don't have any assessments available at the moment
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
