import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { mockStudents } from '@/data/mockData';
import { useState } from 'react';
import { Search, AlertTriangle, CheckCircle, Flag } from 'lucide-react';

export const StudentList = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStudents = mockStudents.filter(
    (student) =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.course.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      case 'flagged':
        return <Flag className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'warning':
        return 'secondary';
      case 'flagged':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Student List</CardTitle>
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name or course..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">
                    Student Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Course</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">
                    Violations
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">{student.id}</td>
                    <td className="px-4 py-3 text-sm font-medium">{student.name}</td>
                    <td className="px-4 py-3 text-sm">{student.course}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`font-semibold ${
                          student.violations > 2
                            ? 'text-red-600'
                            : student.violations > 0
                            ? 'text-yellow-600'
                            : 'text-green-600'
                        }`}
                      >
                        {student.violations}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={getStatusVariant(student.status)}
                        className="flex items-center gap-1 w-fit"
                      >
                        {getStatusIcon(student.status)}
                        {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
            <span>Total Students: {filteredStudents.length}</span>
            <span>
              Active: {filteredStudents.filter((s) => s.status === 'active').length} | Warnings:{' '}
              {filteredStudents.filter((s) => s.status === 'warning').length} | Flagged:{' '}
              {filteredStudents.filter((s) => s.status === 'flagged').length}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
