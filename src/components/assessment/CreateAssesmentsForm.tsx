import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAssessment } from '@/hooks/useAssessment';
import { Plus, X } from 'lucide-react';
import { Question } from '@/types';

interface CreateAssessmentFormProps {
  onClose: () => void;
}

export const CreateAssessmentForm = ({ onClose }: CreateAssessmentFormProps) => {
  const { addAssessment } = useAssessment();
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [dueDate, setDueDate] = useState('');
  const [questions, setQuestions] = useState<Omit<Question, 'id'>[]>([
  { question: '', options: ['', '', '', ''], correctAnswer: 0 },
]);

  const addQuestion = () => {
    setQuestions([...questions, { question: '', options: ['', '', '', ''], correctAnswer: 0 }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: 'question', value: string) => {
    const updated = [...questions];
    updated[index][field] = value;
    setQuestions(updated);
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const updated = [...questions];
    updated[qIndex].options[oIndex] = value;
    setQuestions(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || questions.length === 0) {
      alert('Please fill in all required fields');
      return;
    }

    const validQuestions = questions.filter(
      (q) => q.question.trim() && q.options.every((opt) => opt.trim())
    );

    if (validQuestions.length === 0) {
      alert('Please add at least one complete question');
      return;
    }

addAssessment({
  title,
  duration,
  dueDate,
  questions: validQuestions.map((q, idx) => ({ ...q, id: idx + 1 })),
  status: 'draft',
  createdAt: new Date().toISOString(),
});

    alert('Assessment created successfully!');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 overflow-y-auto z-50">
      <Card className="w-full max-w-4xl my-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">Create New Assessment</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Assessment Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Data Structures Final Assessment"
                  required
                />
              </div>
              <div>
                <Label htmlFor="duration">Duration (minutes) *</Label>
                <Input
                  id="duration"
                  type="number"
                  min="5"
                  max="180"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  required
                />
              </div>
             
            </div>
<div>
  <Label htmlFor="dueDate">Due Date *</Label>
  <Input
    id="dueDate"
    type="datetime-local"
    value={dueDate}
    onChange={(e) => setDueDate(e.target.value)}
    required
  />
</div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg">Questions</Label>
                <Button type="button" onClick={addQuestion} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Question
                </Button>
              </div>

              {questions.map((q, qIdx) => (
                <Card key={qIdx} className="border-2">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <Label className="text-sm font-semibold">Question {qIdx + 1}</Label>
                      {questions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeQuestion(qIdx)}
                          className="h-8 w-8"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <Textarea
                      value={q.question}
                      onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
                      placeholder="Enter your question here..."
                      rows={2}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx}>
                          <Label className="text-xs">
                            Option {String.fromCharCode(65 + oIdx)}
                          </Label>
                          <Input
                            value={opt}
                            onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700">
                Create Assessment
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
