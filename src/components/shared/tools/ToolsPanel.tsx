import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wrench, FileText, BarChart3, Users, Download, Upload } from 'lucide-react';

export const ToolsPanel = () => {
  const tools = [
    {
      title: 'Export Grades',
      description: 'Download student grades as CSV or Excel file',
      icon: Download,
      action: () => alert('Export feature coming soon!'),
      color: 'from-green-500 to-green-600',
    },
    {
      title: 'Import Students',
      description: 'Bulk import student data from CSV file',
      icon: Upload,
      action: () => alert('Import feature coming soon!'),
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Generate Reports',
      description: 'Create comprehensive performance reports',
      icon: FileText,
      action: () => alert('Report generator coming soon!'),
      color: 'from-purple-500 to-purple-600',
    },
    {
      title: 'Analytics Dashboard',
      description: 'View detailed statistics and insights',
      icon: BarChart3,
      action: () => alert('Analytics feature coming soon!'),
      color: 'from-orange-500 to-orange-600',
    },
    {
      title: 'Bulk Messaging',
      description: 'Send announcements to all students',
      icon: Users,
      action: () => alert('Messaging feature coming soon!'),
      color: 'from-pink-500 to-pink-600',
    },
    {
      title: 'Attendance Tracker',
      description: 'Monitor and record student attendance',
      icon: Users,
      action: () => alert('Attendance feature coming soon!'),
      color: 'from-teal-500 to-teal-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wrench className="w-8 h-8" />
        <h2 className="text-3xl font-bold">Tools & Utilities</h2>
      </div>

      <p className="text-muted-foreground">
        Quick access to essential teaching and administrative tools
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool, index) => (
          <Card key={index} className="hover:shadow-lg transition-all hover:-translate-y-1">
            <CardHeader className={`bg-gradient-to-r ${tool.color} text-white -mx-6 -mt-6 rounded-t-lg`}>
              <CardTitle className="flex items-center gap-2 text-lg">
                <tool.icon className="w-5 h-5" />
                {tool.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground min-h-[40px]">{tool.description}</p>
              <Button onClick={tool.action} className="w-full" variant="outline">
                Open Tool
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
