import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/hooks/useSession';
import { formatJoinCode } from '@/utils/codeGenerator';
import { Activity, Plus, Copy, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const ActivitiesPanel = () => {
  const { sessions, createSession } = useSession();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newActivity, setNewActivity] = useState({ title: '', description: '' });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const activities = sessions.filter((s) => s.type === 'activity');

  const handleCreateActivity = () => {
    if (!newActivity.title.trim()) return;
    
    createSession({
      title: newActivity.title,
      type: 'activity',
      status: 'active',
      enrolledStudents: [],
      description: newActivity.description,
    });
    
    setNewActivity({ title: '', description: '' });
    setShowCreateForm(false);
  };

  const copyJoinCode = (code: string) => {
    navigator.clipboard.writeText(formatJoinCode(code));
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Activities Management</h2>
        <Button onClick={() => setShowCreateForm(!showCreateForm)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create New Activity
        </Button>
      </div>

      {showCreateForm && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Create New Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Activity Title</label>
              <Input
                placeholder="e.g., Quiz #1, Group Project, Lab Exercise"
                value={newActivity.title}
                onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description (Optional)</label>
              <Textarea
                placeholder="Brief description of the activity..."
                value={newActivity.description}
                onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateActivity} className="flex-1">
                Create Activity
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activities.map((activity) => (
          <Card key={activity.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white -mx-6 -mt-6 rounded-t-lg">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  <span className="text-base">{activity.title}</span>
                </div>
                <Badge variant="secondary" className="bg-white/20">
                  {activity.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {activity.description && (
                <p className="text-sm text-muted-foreground">{activity.description}</p>
              )}
              
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Join Code</p>
                    <p className="text-xl font-bold font-mono">{formatJoinCode(activity.joinCode)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyJoinCode(activity.joinCode)}
                  >
                    {copiedCode === activity.joinCode ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Participants</span>
                <span className="font-semibold">{activity.enrolledStudents.length} students</span>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Created {activity.createdAt.toLocaleDateString()}</span>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" size="sm">
                  View
                </Button>
                <Button variant="outline" className="flex-1" size="sm">
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {activities.length === 0 && !showCreateForm && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Activities Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first activity to get started
              </p>
              <Button onClick={() => setShowCreateForm(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Activity
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
