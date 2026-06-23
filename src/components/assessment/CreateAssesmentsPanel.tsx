import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAssessment } from '@/hooks/useAssesment';
import { Plus, X, CheckCircle, ClipboardList } from 'lucide-react';
import { Question } from '@/types';

export const CreateAssessmentPanel = () => {
  const { addAssessment } = useAssessment();
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [dueDate, setDueDate] = useState('');
  const [questions, setQuestions] = useState<Omit<Question, 'id'>[]>([
    { question: '', options: ['', '', '', ''], correctAnswer: 0 },
  ]);
  const [showSuccess, setShowSuccess] = useState(false);

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

  const updateCorrectAnswer = (qIndex: number, correctIndex: number) => {
    const updated = [...questions];
    updated[qIndex].correctAnswer = correctIndex;
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
      questions: validQuestions.map((q, idx) => ({ ...q, id: idx + 1 })),
      status: 'draft',
    });

    setShowSuccess(true);
    setTitle('');
    setDuration(30);
    setDueDate('');
    setQuestions([{ question: '', options: ['', '', '', ''], correctAnswer: 0 }]);
    
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Create Assessment</h2>
        <p className="text-muted-foreground mt-1">Build new assessments and quizzes for your students</p>
      </div>

      {showSuccess && (
        <Card className="border-2 border-green-500 bg-green-50 dark:bg-green-900/20">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <p className="font-semibold text-green-700 dark:text-green-400">
              Assessment created successfully! You can view it in Active Assessments.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            New Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg">Questions ({questions.length})</Label>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${qIdx}`}
                            checked={q.correctAnswer === oIdx}
                            onChange={() => updateCorrectAnswer(qIdx, oIdx)}
                            className="w-4 h-4"
                            title="Mark as correct answer"
                          />
                          <div className="flex-1">
                            <Label className="text-xs">
                              Option {String.fromCharCode(65 + oIdx)}
                            </Label>
                            <Input
                              value={opt}
                              onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                              placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                              className={q.correctAnswer === oIdx ? 'border-green-500 ring-1 ring-green-500' : ''}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Select the radio button to mark the correct answer (currently: Option {String.fromCharCode(65 + (parseInt(q.correctAnswer) || 0))})
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setTitle('');
                  setDuration(30);
                  setDueDate('');
                  setQuestions([{ question: '', options: ['', '', '', ''], correctAnswer: 0 }]);
                }}
              >
                Clear Form
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
