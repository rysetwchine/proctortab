import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Award, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Clock, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import type { Question } from '@/types';
import type { CourseAssessment } from '@/context/SessionContext';
import { examQuestions } from '@/data/questions';
import { getBaseQuestionsForAssessment } from '@/utils/examSession';
import { QuestionCard } from './QuestionCard';
import { MotionBackground } from '@/components/shared/MotionBackground';

interface ScoreDisplayProps {
  answers: Record<number, string>;
  assessment?: CourseAssessment;
  questions?: Question[];
  sessionQuestions?: Question[];
  violations?: any[]; // The cheating activities the student did
  timeSpentSeconds?: number;
  onReturnToDashboard: () => void;
}

export const ScoreDisplay = ({
  answers,
  assessment,
  questions: questionsProp,
  sessionQuestions,
  violations = [],
  timeSpentSeconds,
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

  const { correctAnswers, wrongAnswers, skippedQuestions, percentage, pointsEarned } = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let skipped = 0;

    questions.forEach((q) => {
      const ans = answers[q.id];
      if (ans == null || ans === '') {
        skipped += 1;
      } else if (ans === q.correctAnswer) {
        correct += 1;
      } else {
        wrong += 1;
      }
    });

    const totalQuestions = questions.length;
    const pct = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
    const pts = totalQuestions > 0 ? Math.round((correct / totalQuestions) * maxScore * 100) / 100 : 0;

    return { 
      correctAnswers: correct, 
      wrongAnswers: wrong, 
      skippedQuestions: skipped, 
      percentage: pct, 
      pointsEarned: pts
    };
  }, [answers, questions, maxScore]);

  const passed = percentage >= passingScore;

  const formattedTimeSpent = useMemo(() => {
    const totalSeconds = timeSpentSeconds ?? Math.round((assessment?.duration ?? 30) * 0.65 * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s`;
  }, [timeSpentSeconds, assessment?.duration]);

  return (
    <MotionBackground>
      <div className="flex flex-col items-center justify-start p-4 py-8 md:py-12 animate-in fade-in duration-300 relative z-10 w-full">
        <div className="w-full max-w-4xl space-y-6">
          
          {/* HEADER HERO PANEL (ONLY SCORE, NO PERCENTAGE, NO GRADE) */}
          <div className="bg-[#020208]/50 border border-slate-800/50 backdrop-blur-md shadow-[0_0_30px_rgba(6,182,212,0.05)] rounded-2xl overflow-hidden">
            <div className={`p-6 bg-gradient-to-r ${
              passed 
                ? 'from-emerald-950/20 to-teal-950/20 border-b border-emerald-500/25' 
                : 'from-rose-950/20 to-red-950/20 border-b border-rose-500/25'
            } flex flex-col sm:flex-row items-center justify-between gap-6`}>
              
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-[0_0_15px_rgba(0,0,0,0.3)] ${
                  passed 
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-400' 
                    : 'bg-rose-500/10 border-rose-500/35 text-rose-455'
                }`}>
                  {passed ? <Award className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
                </div>
                <div className="space-y-1">
                  <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                    passed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-455'
                  }`}>
                    {passed ? 'Passed' : 'Not Passed'}
                  </span>
                  <h1 className="text-xl md:text-2xl font-bold text-slate-100 uppercase tracking-wide">
                    {assessment?.title || 'ASSESSMENT RESULTS'}
                  </h1>
                  <p className="text-xs text-slate-400">Course Assessment Completed</p>
                </div>
              </div>

              {/* Score box only */}
              <div className="text-center bg-[#020208]/70 border border-slate-800/50 rounded-xl p-3.5 px-6 shadow-inner ring-1 ring-cyan-500/10">
                <p className="text-[10px] uppercase tracking-wider text-slate-450 font-bold mb-0.5">Final Score</p>
                <p className="text-3xl font-black text-slate-100">{pointsEarned} <span className="text-xs text-slate-500 font-normal">/ {maxScore} pts</span></p>
              </div>

            </div>
          </div>

          {/* METRICS GRID SUMMARY */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            
            <div className="bg-[#020208]/55 border border-slate-800/50 backdrop-blur-md rounded-xl p-4 text-center hover:border-emerald-500/35 transition-colors duration-300">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-2 text-emerald-400">
                <CheckCircle className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-slate-100">{correctAnswers}</p>
              <p className="text-[10px] text-slate-400 font-medium">Correct Answers</p>
            </div>

            <div className="bg-[#020208]/55 border border-slate-800/50 backdrop-blur-md rounded-xl p-4 text-center hover:border-rose-500/35 transition-colors duration-300">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-2 text-rose-455">
                <XCircle className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-slate-100">{wrongAnswers}</p>
              <p className="text-[10px] text-slate-400 font-medium">Wrong Answers</p>
            </div>

            <div className="bg-[#020208]/55 border border-slate-800/50 backdrop-blur-md rounded-xl p-4 text-center hover:border-yellow-500/35 transition-colors duration-300">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-2 text-yellow-400">
                <AlertCircle className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-slate-100">{skippedQuestions}</p>
              <p className="text-[10px] text-slate-400 font-medium">Skipped Items</p>
            </div>

            <div className="bg-[#020208]/55 border border-slate-800/50 backdrop-blur-md rounded-xl p-4 text-center hover:border-cyan-500/35 transition-colors duration-300">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto mb-2 text-cyan-400">
                <Clock className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-slate-100 truncate">{formattedTimeSpent}</p>
              <p className="text-[10px] text-slate-400 font-medium">Time Spent</p>
            </div>

          </div>

          {/* CHEATING VIOLATIONS DISPLAY */}
          <div className="bg-[#020208]/50 border border-slate-800/50 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800/50 bg-gradient-to-r from-cyan-950/20 to-blue-950/20 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                Proctoring Logs: Logged Cheating & Suspicious Activities
              </h3>
              <span className={`text-[9px] font-mono px-2.5 py-0.5 rounded border font-bold ${
                violations.length > 0 
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-455 animate-pulse' 
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                {violations.length} Incident(s)
              </span>
            </div>
            
            <div className="p-6 bg-slate-950/10">
              {violations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 bg-slate-900/10 border border-slate-900/40 rounded-xl">
                  <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                    <ShieldCheck className="w-7 h-7 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-bold text-slate-200">No Proctoring Incidents Logged</p>
                    <p className="text-xs text-slate-400 max-w-sm">Congratulations! The student completed this assessment within acceptable integrity parameters.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border border-slate-800/60 rounded-xl overflow-hidden bg-[#020208]/40">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="p-3.5">Time</th>
                            <th className="p-3.5">Incident Category</th>
                            <th className="p-3.5">Evidence Details</th>
                            <th className="p-3.5 text-right">Points Weight</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900">
                          {violations.map((evt, idx) => {
                            const timeStr = new Date(evt.timestamp).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit', 
                              second: '2-digit' 
                            });
                            
                            return (
                              <tr key={evt.id || idx} className="hover:bg-slate-900/40 text-slate-350 transition-colors">
                                <td className="p-3.5 font-mono text-[10px] text-slate-450 whitespace-nowrap">{timeStr}</td>
                                <td className="p-3.5 font-bold text-rose-455">{evt.type}</td>
                                <td className="p-3.5 text-[11px] leading-relaxed max-w-xs sm:max-w-md break-words">{evt.details}</td>
                                <td className="p-3.5 text-right font-mono font-bold text-slate-300">+{evt.score} pts</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3.5 flex gap-2 text-[10px] text-rose-455/90 leading-normal">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      <strong>Academic Integrity Notice:</strong> These incidents were logged automatically by the client-side ProctorTab agent. Instructors will verify these events against network fluctuations, browser lag, and device performance metrics before making final academic evaluations.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* REVIEW DRAWER */}
          <div className="bg-[#020208]/50 border border-slate-800/50 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-6 py-4 text-sm font-bold text-slate-200 hover:bg-slate-900/40 transition-colors border-none outline-none select-none"
              onClick={() => setShowReview((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-4.5 h-4.5 text-cyan-400" />
                <span>Review Assessment Questions & Key Answers (Locked)</span>
              </div>
              {showReview ? <ChevronUp className="h-4 w-4 text-cyan-400" /> : <ChevronDown className="h-4 w-4 text-cyan-400" />}
            </button>
            
            {showReview ? (
              <div className="space-y-6 border-t border-slate-850 p-6 bg-slate-950/20 max-h-[60vh] overflow-y-auto">
                <p className="text-xs text-slate-400 italic">
                  * Note: Your selected options are displayed. Editing is locked. Answer keys are provided for review.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {questions.map((q) => {
                    const isCorrect = answers[q.id] === q.correctAnswer;
                    return (
                      <div key={q.id} className="relative">
                        <span className={`absolute top-4 right-4 z-10 font-mono text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm ${
                          isCorrect 
                            ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-400' 
                            : 'bg-rose-500/10 border-rose-500/35 text-rose-455'
                        }`}>
                          {isCorrect ? 'Correct' : 'Incorrect'}
                        </span>
                        
                        <QuestionCard
                          key={q.id}
                          question={q}
                          selectedAnswer={answers[q.id]}
                          onAnswerChange={() => {}}
                          readOnly
                        />
                        
                        {!isCorrect && (
                          <div className="mt-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-medium">
                            Correct Answer Key: <span className="font-bold">{q.correctAnswer}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* BOTTOM ACTION BUTTON */}
          <div className="flex justify-center pt-2">
            <Button 
              onClick={onReturnToDashboard} 
              className="w-full max-w-sm py-5 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-[0_0_18px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.45)] transition-all duration-300 flex items-center justify-center gap-2"
            >
              <span>Return to Portal Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

        </div>
      </div>
    </MotionBackground>
  );
};
