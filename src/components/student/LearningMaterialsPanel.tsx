import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Video, Link, Download, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Material {
  id: string;
  title: string;
  description: string;
  type: 'document' | 'video' | 'link';
  course: string;
  uploadedAt: Date;
}

export const LearningMaterialsPanel = () => {
  const materials: Material[] = [
    {
      id: '1',
      title: 'Introduction to Data Structures',
      description: 'Basic concepts and overview',
      type: 'document',
      course: 'Data Structures 101',
      uploadedAt: new Date('2026-03-15'),
    },
    {
      id: '2',
      title: 'Arrays and Linked Lists Tutorial',
      description: 'Video lecture on fundamental data structures',
      type: 'video',
      course: 'Data Structures 101',
      uploadedAt: new Date('2026-03-18'),
    },
    {
      id: '3',
      title: 'Stack Operations Reference',
      description: 'External resource on stack implementation',
      type: 'link',
      course: 'Data Structures 101',
      uploadedAt: new Date('2026-03-20'),
    },
  ];

  const getTypeIcon = (type: Material['type']) => {
    switch (type) {
      case 'video':
        return <Video className="w-5 h-5" />;
      case 'link':
        return <Link className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: Material['type']) => {
    switch (type) {
      case 'video':
        return 'from-red-500 to-red-600';
      case 'link':
        return 'from-blue-500 to-blue-600';
      default:
        return 'from-green-500 to-green-600';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Learning Materials</h2>
        <p className="text-muted-foreground mt-1">
          Course materials and resources from your professors
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {materials.map((material) => (
          <Card key={material.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className={`bg-gradient-to-r ${getTypeColor(material.type)} text-white -mx-6 -mt-6 rounded-t-lg`}>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {getTypeIcon(material.type)}
                  {material.title}
                </CardTitle>
                <Badge variant="secondary" className="bg-white/20 capitalize">
                  {material.type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-muted-foreground">{material.description}</p>

              <div className="flex items-center gap-2 text-sm">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{material.course}</span>
              </div>

              <div className="text-sm text-muted-foreground">
                Uploaded {material.uploadedAt.toLocaleDateString()}
              </div>

              <Button className="w-full gap-2">
                <Download className="w-4 h-4" />
                {material.type === 'link' ? 'Open Link' : 'View Material'}
              </Button>
            </CardContent>
          </Card>
        ))}

        {materials.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Materials Available</h3>
              <p className="text-muted-foreground">
                Your professors haven't uploaded any materials yet
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
