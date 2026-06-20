import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Edit2, Trash2, RotateCcw, Loader, Eye, EyeOff } from 'lucide-react';
import type { Question } from '@/types';

interface QuestionPreviewPanelProps {
  questions: Question[];
  isLoading?: boolean;
  onRegenerate?: () => void;
  onEditQuestion?: (index: number, question: Question) => void;
  onDeleteQuestion?: (index: number) => void;
  canEdit?: boolean;
}

export function QuestionPreviewPanel({
  questions,
  isLoading = false,
  onRegenerate,
  onEditQuestion,
  onDeleteQuestion,
  canEdit = true,
}: QuestionPreviewPanelProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedQuestion, setEditedQuestion] = useState<Question | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());

  const handleEdit = (index: number, question: Question) => {
    setEditingIndex(index);
    setEditedQuestion({ ...question });
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null && editedQuestion && onEditQuestion) {
      onEditQuestion(editingIndex, editedQuestion);
      setEditingIndex(null);
      setEditedQuestion(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditedQuestion(null);
  };

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedQuestions(newExpanded);
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'hard':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium':
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const getTypeLabel = (type?: string) => {
    switch (type) {
      case 'multiple-choice':
        return 'Multiple Choice';
      case 'true-false':
        return 'True/False';
      case 'identification':
        return 'Identification';
      default:
        return 'Question';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generating questions...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No questions to preview</p>
            {onRegenerate && (
              <Button onClick={onRegenerate} variant="outline" size="sm" className="mt-4">
                Generate Questions
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{questions.length} Questions Generated</h3>
          <p className="text-sm text-muted-foreground">Review and edit before saving</p>
        </div>
        {onRegenerate && (
          <Button onClick={onRegenerate} variant="outline" size="sm" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Regenerate
          </Button>
        )}
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {questions.map((question, index) => (
          <Card key={index} className={editingIndex === index ? 'ring-2 ring-blue-500' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className={getDifficultyColor(question.difficulty)}>
                      {question.difficulty || 'medium'}
                    </Badge>
                    <Badge variant="outline">{getTypeLabel(question.type)}</Badge>
                    <span className="text-xs text-muted-foreground">Q{index + 1}</span>
                  </div>
                  <CardTitle className="text-base">
                    {editingIndex === index ? (
                      <Textarea
                        value={editedQuestion?.question || ''}
                        onChange={(e) =>
                          setEditedQuestion({
                            ...editedQuestion!,
                            question: e.target.value,
                          })
                        }
                        className="min-h-[60px] text-sm"
                      />
                    ) : (
                      <p className="text-sm leading-relaxed break-words">{question.question}</p>
                    )}
                  </CardTitle>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleExpanded(index)}
                    className="h-8 w-8"
                    title="Toggle details"
                  >
                    {expandedQuestions.has(index) ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  {canEdit && editingIndex !== index && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(index, question)}
                      className="h-8 w-8"
                      title="Edit question"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && onDeleteQuestion && editingIndex !== index && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteQuestion(index)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Delete question"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {expandedQuestions.has(index) && (
              <CardContent className="space-y-3 pt-0">
                {/* Options for multiple choice */}
                {question.type === 'multiple-choice' && question.options && question.options.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Options:</p>
                    {editingIndex === index ? (
                      <div className="space-y-2">
                        {(editedQuestion?.options || []).map((option, optIdx) => (
                          <div key={optIdx} className="flex gap-2">
                            <span className="text-xs text-muted-foreground pt-2 w-6">
                              {String.fromCharCode(65 + optIdx)})
                            </span>
                            <Textarea
                              value={option}
                              onChange={(e) => {
                                const newOptions = [...(editedQuestion?.options || [])];
                                newOptions[optIdx] = e.target.value;
                                setEditedQuestion({
                                  ...editedQuestion!,
                                  options: newOptions,
                                });
                              }}
                              className="min-h-[40px] text-sm flex-1"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1 pl-2">
                        {question.options.map((option, optIdx) => (
                          <div
                            key={optIdx}
                            className={`text-sm p-2 rounded ${
                              option === question.correctAnswer
                                ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-300 font-medium'
                                : 'bg-gray-50 dark:bg-gray-900/20'
                            }`}
                          >
                            <span className="font-medium">{String.fromCharCode(65 + optIdx)})</span> {option}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* True/False options */}
                {question.type === 'true-false' && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Answer:</p>
                    <div className="text-sm font-medium">
                      {question.correctAnswer === 'True' ? (
                        <span className="text-green-700 dark:text-green-400">True</span>
                      ) : (
                        <span className="text-red-700 dark:text-red-400">False</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Correct answer for identification */}
                {question.type === 'identification' && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Correct Answer:</p>
                    {editingIndex === index ? (
                      <Textarea
                        value={editedQuestion?.correctAnswer?.toString() || ''}
                        onChange={(e) =>
                          setEditedQuestion({
                            ...editedQuestion!,
                            correctAnswer: e.target.value,
                          })
                        }
                        className="min-h-[40px] text-sm"
                      />
                    ) : (
                      <div className="text-sm bg-green-50 dark:bg-green-900/20 p-2 rounded text-green-900 dark:text-green-300 font-medium">
                        {question.correctAnswer}
                      </div>
                    )}
                  </div>
                )}

                {/* Explanation */}
                {question.explanation && (
                  <div className="space-y-1 border-t pt-2">
                    <p className="text-sm font-medium text-muted-foreground">Explanation:</p>
                    {editingIndex === index ? (
                      <Textarea
                        value={editedQuestion?.explanation || ''}
                        onChange={(e) =>
                          setEditedQuestion({
                            ...editedQuestion!,
                            explanation: e.target.value,
                          })
                        }
                        className="min-h-[60px] text-sm"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground bg-gray-50 dark:bg-gray-900/20 p-2 rounded">
                        {question.explanation}
                      </p>
                    )}
                  </div>
                )}

                {/* Edit actions */}
                {editingIndex === index && (
                  <div className="flex gap-2 border-t pt-3">
                    <Button onClick={handleSaveEdit} size="sm" className="flex-1">
                      Save Changes
                    </Button>
                    <Button onClick={handleCancelEdit} variant="outline" size="sm" className="flex-1">
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
