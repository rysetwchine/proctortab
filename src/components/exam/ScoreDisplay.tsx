import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Award, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { Question } from '@/types';
import type { CourseAssessment } from '@/context/SessionContext';
import { examQuestions } from '@/data/questions';
import { getBaseQuestionsForAssessment } from '@/utils/examSession';
import { QuestionCard } from './QuestionCard';

interface ScoreDisplayProps {
  answers: Record<number, string>;
  assessment?: CourseAssessment;
  questions?: Question[];
  /** Same ordering/options as the live exam (required when questions were shuffled). */
  sessionQuestions?: Question[];
  onReturnToDashboard: () => void;
}

export const ScoreDisplay = ({
  answers,
  assessment,
  questions: questionsProp,
  sessionQuestions,
  onReturnToDashboard,
}: ScoreDisplayProps) => {
  const [showReview, setShowReview] = useState(false);

  const questions = useMemo(() => {
    if (sessionQuestions?.length) return sessionQuestions;
    if (questionsProp?.length) return questionsProp;
    if (assessment) return getBaseQuestionsForAssessment(assessment);
    return examQuestions;
  }, [sessionQuestions, questionsProp, assessment]);

  const passingScore = assessment?.passingScore ?? 60;
  const maxScore = assessment?.maxScore ?? 100;

  const { correctAnswers, percentage, pointsEarned } = useMemo(() => {
    let correct = 0;
    questions.forEach((q) => {
      if (answers[q.id] === q.correctAnswer) correct += 1;
    });
    const totalQuestions = questions.length;
    const pct = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
    const pts =
      totalQuestions > 0 ? Math.round((correct / totalQuestions) * maxScore * 100) / 100 : 0;
    return { correctAnswers: correct, percentage: pct, pointsEarned: pts };
  }, [answers, questions, maxScore]);

  const totalQuestions = questions.length;
  const passed = percentage >= passingScore;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start p-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader
          className={`${passed ? 'bg-green-600' : 'bg-red-600'} text-white -mx-6 -mt-6 rounded-t-lg`}
        >
          <CardTitle className="text-center flex items-center justify-center gap-2">
            {passed ? <Award className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
            {assessment?.title ? `${assessment.title.toUpperCase()} — RESULTS` : 'ASSESSMENT RESULTS'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div
              className={`w-40 h-40 rounded-full flex flex-col items-center justify-center border-8 ${
                passed ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
              }`}
            >
              <span className="text-4xl font-bold">{pointsEarned}</span>
              <span className="text-sm text-muted-foreground">/ {maxScore} pts</span>
              <span className="text-xs text-muted-foreground mt-1">{percentage}%</span>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className={`text-2xl font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>
              {passed ? 'Congratulations! You Passed!' : 'Unfortunately, You Did Not Pass'}
            </h2>
            <p className="text-muted-foreground">
              {passed
                ? 'Great job! You have successfully completed the assessment.'
                : 'Keep studying and try again.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 py-6">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                <p className="text-2xl font-bold text-blue-600">{totalQuestions}</p>
                <p className="text-xs text-muted-foreground">Total Questions</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{correctAnswers}</p>
                <p className="text-xs text-muted-foreground">Correct Answers</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <XCircle className="w-6 h-6 mx-auto mb-2 text-red-600" />
                <p className="text-2xl font-bold text-red-600">
                  {totalQuestions - correctAnswers}
                </p>
                <p className="text-xs text-muted-foreground">Wrong Answers</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Performance</span>
              <span className="font-semibold">{percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  percentage >= 90
                    ? 'bg-green-600'
                    : percentage >= 75
                      ? 'bg-blue-600'
                      : percentage >= passingScore
                        ? 'bg-yellow-600'
                        : 'bg-red-600'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border text-left">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50"
              onClick={() => setShowReview((v) => !v)}
            >
              <span>Your answers (locked)</span>
              {showReview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showReview ? (
              <div className="space-y-4 border-t p-4 max-h-[50vh] overflow-y-auto">
                {questions.map((q) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    selectedAnswer={answers[q.id]}
                    onAnswerChange={() => {}}
                    readOnly
                  />
                ))}
              </div>
            ) : null}
          </div>

          <Button onClick={onReturnToDashboard} className="w-full bg-blue-600 hover:bg-blue-700">
            RETURN TO DASHBOARD
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
