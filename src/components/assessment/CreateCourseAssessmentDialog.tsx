import { useMemo, useState, useEffect } from 'react';
import { BookOpen, Loader } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CourseModule } from '@/context/SessionContext';
import type { CourseAssessmentInput, QuestionDifficulty } from '@/context/SessionContext';
import {
  generateQuestionsFromModule as generateQuestionsFromModuleFallback,
  generateQuestionsFromModuleContent,
} from '@/utils/courseExamQuestions';
import { getAllSelectableModuleFiles, getCombinedModuleContent, validateFilesHaveContent } from '@/utils/moduleListingService';
import { getModuleItemKnowledge } from '@/utils/moduleStorageService';
import { buildKnowledgeContextForAI } from '@/utils/moduleKnowledge';
import { cleanMultipleChoiceOptions } from '@/utils/questionValidator';
import { ModuleFileSelector } from './ModuleFileSelector';
import { QuestionPreviewPanel } from './QuestionPreviewPanel';
import { examQuestions } from '@/data/questions';
import type { Question } from '@/types';

export type QuestionBuildMode = 'default' | 'module';

interface CreateCourseAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  modules: CourseModule[];
  onCreate: (input: CourseAssessmentInput) => void;
}

export function CreateCourseAssessmentDialog({
  open,
  onOpenChange,
  courseId,
  modules,
  onCreate,
}: CreateCourseAssessmentDialogProps) {
  const [assessmentType, setAssessmentType] = useState<'exam' | 'quiz'>('exam');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [timerMinutes, setTimerMinutes] = useState('30');
  const [maxScore, setMaxScore] = useState('100');
  const [maxScoreTouched, setMaxScoreTouched] = useState(false);
  const [passingScore, setPassingScore] = useState('60');
  const [maxAttempts, setMaxAttempts] = useState('1');
  const [password, setPassword] = useState('');
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeChoices, setRandomizeChoices] = useState(true);
  const [overrideTab, setOverrideTab] = useState(false);
  const [overrideCopyPaste, setOverrideCopyPaste] = useState(false);
  const [overrideFullscreen, setOverrideFullscreen] = useState(false);
  const [overrideScreenshot, setOverrideScreenshot] = useState(false);
  const [overrideAlarm, setOverrideAlarm] = useState(false);
  const [allowQuestionNavigation, setAllowQuestionNavigation] = useState(true);

  // Professor requirement: hide the built-in Question Bank option and only allow "From modules".
  const [questionMode, setQuestionMode] = useState<QuestionBuildMode>('module');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [moduleDifficulty, setModuleDifficulty] = useState<QuestionDifficulty>('medium');
  const [moduleQuestionType, setModuleQuestionType] = useState<'multiple-choice' | 'true-false' | 'identification'>('multiple-choice');
  const [moduleQuestionCount, setModuleQuestionCount] = useState('10');
  const [moduleSelectionTouched, setModuleSelectionTouched] = useState(false);
  const [defaultQuestionCount, setDefaultQuestionCount] = useState('10');
  const [previewQuestions, setPreviewQuestions] = useState<Question[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedModule = useMemo(
    () => modules.find((m) => m.id === selectedModuleId),
    [modules, selectedModuleId]
  );

  useEffect(() => {
    // UX FIX:
    // Users often expect "From modules" to work immediately after uploading modules.
    // Auto-select available module files the first time they switch to module mode,
    // unless they've already manually changed the selection.
    if (questionMode === 'module' && selectedFileIds.length === 0 && !moduleSelectionTouched) {
      const ids = getAllSelectableModuleFiles(modules).map((f) => f.id);
      if (ids.length > 0) setSelectedFileIds(ids);
    }
  }, [questionMode, modules, selectedFileIds.length, moduleSelectionTouched]);

  useEffect(() => {
    // Ensure we never get stuck in "Generating..." due to early returns / stale async.
    // This prevents the "Preview keeps loading forever" bug.
    let cancelled = false;
    const updatePreview = async () => {
      try {
        if (questionMode === 'module' && selectedFileIds.length > 0) {
          setIsGenerating(true);
          
          // OLD FLOW used combined raw extracted PDF text.
          // NEW FLOW: use STRUCTURED knowledge context + validated high-quality excerpts.
          let combinedContent = getCombinedModuleContent(modules, selectedFileIds);
          let combinedKnowledgeContext = '';
          
          // Validate files have content
          let validation = validateFilesHaveContent(modules, selectedFileIds);

          // 🔥 CRITICAL: If local state doesn't have fileContent (common after refresh),
          // pull the saved CLEANED + ANALYZED knowledge from Firestore subcollection.
          if (courseId) {
            try {
              const fetchedKnowledge = await Promise.all(
                selectedFileIds.map(async (fullId) => {
                  const parts = fullId.split('-');
                  const moduleId = parts[0];
                  const itemId = parts.slice(1).join('-');
                  if (!moduleId || !itemId) return '';
                  const payload = await getModuleItemKnowledge(courseId, moduleId, itemId);
                  if (!payload) return '';
                  if (payload.knowledge) return buildKnowledgeContextForAI(payload.knowledge);
                  // Fallback to cleanedContent if knowledge object isn't present (older uploads)
                  return (payload.cleanedContent || '').trim();
                })
              );
              const fetchedContext = fetchedKnowledge.filter(Boolean).join('\n\n---\n\n');
              if (fetchedContext.trim()) combinedKnowledgeContext = fetchedContext;
            } catch (e) {
              console.warn('[ExamPreview] Failed to fetch module knowledge from Firestore:', e);
            }
          }

          // Derive a meaningful topic/title (avoid "Module content")
          const firstFile = selectedFileIds[0];
          const firstModuleId = firstFile ? firstFile.split('-')[0] : '';
          const derivedTitle =
            selectedModule?.displayName ||
            selectedModule?.title ||
            modules.find((m) => m.id === firstModuleId)?.displayName ||
            modules.find((m) => m.id === firstModuleId)?.title ||
            'Module';
          
          // Decide what "knowledge" to generate from:
          // 1) Prefer structured knowledge context from Firestore (best quality).
          // 2) Fallback to combined extracted text in local state (works right after upload).
          const generationSource =
            combinedKnowledgeContext.trim().length > 300
              ? combinedKnowledgeContext
              : combinedContent;

          if ((validation.valid || generationSource.trim().length > 300) && generationSource.trim().length > 0) {
            const requested = parseInt(moduleQuestionCount, 10) || 10;

            // PROFESSIONAL LMS RULE:
            // Generate per-module so:
            // - coverage is balanced (20 max per module)
            // - we don't collapse everything into one title/topic
            // - duplicates across two modules are less likely
            const moduleIds = Array.from(
              new Set(selectedFileIds.map((id) => id.split('-')[0]).filter(Boolean))
            );

            // Distribute requested count across modules (max 20 per module is already enforced in the UI).
            const base = Math.floor(requested / Math.max(moduleIds.length, 1));
            const rem = requested % Math.max(moduleIds.length, 1);

            const perModuleCounts = moduleIds.map((_, i) => {
              const n = base + (i < rem ? 1 : 0);
              return Math.min(20, Math.max(1, n));
            });

            // Pre-fetch knowledge contexts (Firestore) per selected file, then group by moduleId
            const knowledgeByFile = new Map<string, string>();
            if (courseId) {
              try {
                const fetched = await Promise.all(
                  selectedFileIds.map(async (fullId) => {
                    const parts = fullId.split('-');
                    const moduleId = parts[0];
                    const itemId = parts.slice(1).join('-');
                    if (!moduleId || !itemId) return [fullId, ''] as const;
                    const payload = await getModuleItemKnowledge(courseId, moduleId, itemId);
                    if (!payload) return [fullId, ''] as const;
                    if (payload.knowledge) return [fullId, buildKnowledgeContextForAI(payload.knowledge)] as const;
                    return [fullId, (payload.cleanedContent || '').trim()] as const;
                  })
                );
                for (const [k, v] of fetched) knowledgeByFile.set(k, v || '');
              } catch (e) {
                console.warn('[ExamPreview] Failed to fetch module knowledge per file:', e);
              }
            }

            const all: Question[] = [];

            for (let i = 0; i < moduleIds.length; i++) {
              const moduleId = moduleIds[i];
              const fileIdsForModule = selectedFileIds.filter((id) => id.split('-')[0] === moduleId);
              const moduleMeta = modules.find((m) => m.id === moduleId);
              const moduleTitle = moduleMeta?.displayName || moduleMeta?.title || derivedTitle || 'Module';

              const moduleKnowledgeContext = fileIdsForModule
                .map((fid) => knowledgeByFile.get(fid) || '')
                .filter(Boolean)
                .join('\n\n---\n\n');

              // Fallback to local combined extracted text for this module group
              const moduleCombinedText = getCombinedModuleContent(modules, fileIdsForModule);
              const moduleGenerationSource =
                moduleKnowledgeContext.trim().length > 300 ? moduleKnowledgeContext : moduleCombinedText;

              const syntheticModule: CourseModule = {
                id: moduleId,
                title: moduleTitle,
                week: moduleMeta?.week || 0,
                items: [
                  {
                    id: 'knowledge-context',
                    title: moduleTitle,
                    fileName: moduleTitle,
                    type: 'pdf',
                    mimeType: 'application/pdf',
                    fileContent: moduleGenerationSource,
                    fileSize: moduleGenerationSource.length,
                    uploadStatus: 'uploaded',
                    uploadedAt: new Date(),
                  } as any,
                ],
              };

              const perCount = perModuleCounts[i] || 1;
              const qs = await generateQuestionsFromModuleContent(
                syntheticModule,
                perCount,
                moduleDifficulty,
                moduleQuestionType
              );

              all.push(...qs);
            }

            // IMPORTANT:
            // Do NOT re-run filtering here (it can reduce 40 -> 5).
            // Only pad/repair MCQ options to ensure 4 choices in the UI.
            const repaired =
              moduleQuestionType === 'multiple-choice'
                ? all.map((q) => cleanMultipleChoiceOptions(q))
                : all;

            const reindexed = repaired.map((q, idx) => ({ ...q, id: idx + 1 }));
            if (!cancelled) setPreviewQuestions(reindexed);
          } else if (selectedModule) {
            // Fallback to module-based if no file content
            const questions = generateQuestionsFromModuleFallback(
              selectedModule,
              parseInt(moduleQuestionCount, 10) || 10
            );
            const repaired = questions.map((q) => cleanMultipleChoiceOptions(q));
            if (!cancelled) setPreviewQuestions(repaired);
          } else {
            // Nothing usable selected; clear preview so we don't show stale questions
            if (!cancelled) setPreviewQuestions([]);
          }
          if (!cancelled) setIsGenerating(false);
        } else if (questionMode === 'default') {
          const n = parseInt(defaultQuestionCount, 10) || 10;
          setPreviewQuestions(examQuestions.slice(0, Math.min(n, examQuestions.length)));
          setIsGenerating(false);
        } else {
          // Not enough input to generate a preview
          setPreviewQuestions([]);
          setIsGenerating(false);
        }
      } catch (error) {
        console.error('Error updating preview:', error);
        setIsGenerating(false);
      }
    };

    updatePreview();
    return () => {
      cancelled = true;
    };
  }, [
    questionMode,
    selectedFileIds,
    selectedModule,
    modules,
    moduleQuestionCount,
    moduleDifficulty,
    moduleQuestionType,
    defaultQuestionCount,
  ]);

  // Enforce "20 questions per module" rule:
  // - 1 module selected => max 20
  // - 2 modules selected => max 40
  // etc.
  const maxModuleQuestions = useMemo(() => {
    const moduleIds = new Set<string>();
    for (const fullId of selectedFileIds) {
      const moduleId = fullId.split('-')[0];
      if (moduleId) moduleIds.add(moduleId);
    }
    const moduleCount = Math.max(moduleIds.size, 1);
    return moduleCount * 20;
  }, [selectedFileIds]);

  useEffect(() => {
    if (questionMode !== 'module') return;
    const n = parseInt(moduleQuestionCount, 10) || 10;
    if (n > maxModuleQuestions) setModuleQuestionCount(String(maxModuleQuestions));
  }, [questionMode, moduleQuestionCount, maxModuleQuestions]);

  // Auto-set / clamp max score to the number of available questions.
  // Requirement: if there are only 10 questions, max score should be 10 (and cannot exceed that).
  const maxPossibleScore = useMemo(
    () => Math.max(previewQuestions.length, 1),
    [previewQuestions.length]
  );

  useEffect(() => {
    // Keep it at least 1, and never greater than question count.
    const current = parseInt(maxScore, 10);
    const currentValid = Number.isFinite(current) && current > 0;

    // If user never touched max score, always follow question count.
    // If user did touch it, only clamp down when it exceeds question count or becomes invalid.
    if (!maxScoreTouched || !currentValid || current > maxPossibleScore) {
      setMaxScore(String(maxPossibleScore));
    }
  }, [maxPossibleScore, maxScore, maxScoreTouched]);

  const resetForm = () => {
    setTitle('');
    setDueDate('');
    setTimerMinutes('30');
    setMaxScore('100');
    setMaxScoreTouched(false);
    setPassingScore('60');
    setMaxAttempts('1');
    setPassword('');
    setRandomizeQuestions(false);
    setRandomizeChoices(true);
    setOverrideTab(false);
    setOverrideCopyPaste(false);
    setOverrideFullscreen(false);
    setOverrideScreenshot(false);
    setOverrideAlarm(false);
    setAllowQuestionNavigation(true);
    setQuestionMode('module');
    setSelectedModuleId('');
    setSelectedFileIds([]);
    setModuleSelectionTouched(false);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;

    if (questionMode === 'module' && selectedFileIds.length === 0) return;

    const questionItems = previewQuestions;
    const questionCount = questionItems.length;

    const useGlobalDetectors = !overrideTab && !overrideCopyPaste && !overrideFullscreen && !overrideScreenshot && !overrideAlarm;
    const detectors = {
      tabSwitch: overrideTab,
      copyPaste: overrideCopyPaste,
      fullscreen: overrideFullscreen,
      screenshot: overrideScreenshot,
      alarm: overrideAlarm,
    };

    const parsedMaxScore = parseInt(maxScore, 10);
    const safeMaxScore = Math.min(
      Number.isFinite(parsedMaxScore) && parsedMaxScore > 0 ? parsedMaxScore : questionCount,
      questionCount
    );

    onCreate({
      title: title.trim(),
      duration: parseInt(timerMinutes, 10) || 30,
      dueDate,
      assessmentType,
      maxScore: safeMaxScore,
      passingScore: parseInt(passingScore, 10) || 60,
      maxAttempts: Math.max(parseInt(maxAttempts, 10) || 1, 1),
      password: password.trim() || undefined,
      randomizeQuestions,
      randomizeChoices,
      useGlobalDetectors,
      detectors,
      allowQuestionNavigation,
      questionItems,
      questions: questionItems.length,
      questionSource: questionMode,
      sourceModuleId: questionMode === 'module' ? selectedModule?.id : undefined,
      sourceModuleTitle: questionMode === 'module' ? selectedModule?.title : undefined,
    });

    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create {assessmentType === 'quiz' ? 'Quiz' : 'Assessment'}</DialogTitle>
          <DialogDescription>
            Configure questions, security, timer, and grading options for this course assessment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Basic details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={assessmentType}
                  onChange={(e) => setAssessmentType(e.target.value as 'exam' | 'quiz')}
                >
                  <option value="exam">Assessment</option>
                  <option value="quiz">Quiz</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessment-title">Title</Label>
                <Input
                  id="assessment-title"
                  placeholder="e.g. Midterm Assessment"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="assessment-due">Due date</Label>
                <Input
                  id="assessment-due"
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </section>

          <hr className="border-border" />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Question source</h3>
            <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BookOpen className="h-4 w-4" />
                <span>From modules</span>
              </div>
              <div>
                <Label>Select Module Files</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Choose one or more files to generate questions from
                </p>
                <ModuleFileSelector
                  modules={modules}
                  selectedFileIds={selectedFileIds}
                  onSelectionChange={(ids) => {
                    setModuleSelectionTouched(true);
                    setSelectedFileIds(ids);
                  }}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Number of questions (max {maxModuleQuestions})</Label>
                  <Input
                    type="number"
                    min={1}
                    // 20 questions per selected module (e.g. 2 modules => 40 max)
                    max={maxModuleQuestions}
                    value={moduleQuestionCount}
                    onChange={(e) => setModuleQuestionCount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={moduleDifficulty}
                    onChange={(e) => setModuleDifficulty(e.target.value as QuestionDifficulty)}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Question Type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={moduleQuestionType}
                    onChange={(e) =>
                      setModuleQuestionType(
                        e.target.value as 'multiple-choice' | 'true-false' | 'identification'
                      )
                    }
                  >
                    <option value="multiple-choice">Multiple Choice</option>
                    <option value="true-false">True/False</option>
                    <option value="identification">Identification</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Preview: Selected modules
                </p>
                {isGenerating && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader className="h-3 w-3 animate-spin" />
                    <span>Generating...</span>
                  </div>
                )}
              </div>
              
              {previewQuestions.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {previewQuestions.length} questions
                    </Badge>
                    <Badge variant="outline">
                      {previewQuestions[0]?.type === 'multiple-choice' ? 'Multiple Choice' : previewQuestions[0]?.type === 'true-false' ? 'True/False' : 'Identification'}
                    </Badge>
                    <Badge variant="outline">
                      {previewQuestions[0]?.difficulty || 'medium'}
                    </Badge>
                  </div>
                  <div className="bg-background/50 rounded p-2 border text-sm space-y-2 max-h-[140px] overflow-y-auto">
                    <div className="text-xs font-medium text-muted-foreground">Sample question:</div>
                    <p className="text-sm leading-relaxed">
                      <strong>Q:</strong> {previewQuestions[0]?.question}
                    </p>
                    {previewQuestions[0]?.type === 'multiple-choice' && previewQuestions[0]?.options && (
                      <div className="text-xs space-y-1 ml-2">
                        <div className="text-muted-foreground">Options:</div>
                        {previewQuestions[0].options.slice(0, 2).map((opt, i) => (
                          <div key={i} className="text-muted-foreground">
                            {String.fromCharCode(97 + i)}. {opt}
                          </div>
                        ))}
                        {previewQuestions[0].options.length > 2 && (
                          <div className="text-muted-foreground text-xs italic">
                            + {previewQuestions[0].options.length - 2} more option{previewQuestions[0].options.length - 2 !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : isGenerating ? (
                <div className="text-center py-4">
                  <Loader className="h-4 w-4 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {questionMode === 'module' ? 'Generating questions from module content...' : 'Generating questions...'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic py-2">
                  {selectedFileIds.length === 0
                    ? 'Select module files above to generate questions.'
                    : 'No questions to preview yet'}
                </p>
              )}
            </div>
          </section>

          <hr className="border-border" />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Assessment settings</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Timer (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max score</Label>
                <Input
                  type="number"
                  min={1}
                  max={maxPossibleScore}
                  value={maxScore}
                  onChange={(e) => {
                    setMaxScoreTouched(true);
                    const raw = e.target.value;
                    const n = parseInt(raw, 10);
                    if (!Number.isFinite(n)) {
                      setMaxScore(raw);
                      return;
                    }
                    setMaxScore(String(Math.min(Math.max(n, 1), maxPossibleScore)));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Passing score (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={passingScore}
                  onChange={(e) => setPassingScore(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Attempts allowed</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="exam-password">
                Optional {assessmentType === 'quiz' ? 'quiz' : 'assessment'} code
              </Label>
              <Input
                id="exam-password"
                type="password"
                placeholder="Leave blank for open access"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Students must enter this code before starting. Leave empty to skip.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="randomize-q">Randomize questions</Label>
                <p className="text-xs text-muted-foreground">Shuffle order per attempt</p>
              </div>
              <Switch
                id="randomize-q"
                checked={randomizeQuestions}
                onCheckedChange={setRandomizeQuestions}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="randomize-c">Randomize choices</Label>
                <p className="text-xs text-muted-foreground">Shuffle answer options</p>
              </div>
              <Switch
                id="randomize-c"
                checked={randomizeChoices}
                onCheckedChange={setRandomizeChoices}
              />
            </div>
          </section>

          <hr className="border-border" />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Advanced — detector overrides & navigation</h3>
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Detector overrides</p>
                <p className="text-xs text-muted-foreground mt-1">
                  All off: this assessment uses your <strong>global</strong> monitoring defaults. Turn a switch on to
                  enforce only that detector for this assessment (other detectors stay off unless also enabled here).
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="exam-det-copy" className="font-normal">
                  Copy / paste protection
                </Label>
                <Switch
                  id="exam-det-copy"
                  checked={overrideCopyPaste}
                  onCheckedChange={setOverrideCopyPaste}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="exam-det-tab" className="font-normal">
                  Tab switch detection
                </Label>
                <Switch id="exam-det-tab" checked={overrideTab} onCheckedChange={setOverrideTab} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="exam-det-fs" className="font-normal">
                  Fullscreen exit detection
                </Label>
                <Switch
                  id="exam-det-fs"
                  checked={overrideFullscreen}
                  onCheckedChange={setOverrideFullscreen}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="exam-det-screenshot" className="font-normal">
                  Screenshot protection
                </Label>
                <Switch
                  id="exam-det-screenshot"
                  checked={overrideScreenshot}
                  onCheckedChange={setOverrideScreenshot}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="exam-det-alarm" className="font-normal">
                  Alarm device
                </Label>
                <Switch
                  id="exam-det-alarm"
                  checked={overrideAlarm}
                  onCheckedChange={setOverrideAlarm}
                />
              </div>
              <p className="text-xs text-muted-foreground rounded-md bg-background/60 p-2 border">
                Mode:{' '}
                <span className="font-medium">
                  {!overrideTab && !overrideCopyPaste && !overrideFullscreen && !overrideScreenshot && !overrideAlarm
                    ? 'Use global detector settings'
                    : 'Custom — only switches turned ON apply'}
                </span>
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="allow-prev-next">Allow previous / next questions</Label>
                <p className="text-xs text-muted-foreground">Turn off for a linear assessment (no backtracking)</p>
              </div>
              <Switch
                id="allow-prev-next"
                checked={allowQuestionNavigation}
                onCheckedChange={setAllowQuestionNavigation}
              />
            </div>
          </section>

          <hr className="border-border" />

          {/* Question Preview Section */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Questions Preview</h3>
            <QuestionPreviewPanel
              questions={previewQuestions}
              isLoading={isGenerating}
              canEdit={true}
            />
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              !title.trim() ||
              previewQuestions.length === 0 ||
              (questionMode === 'module' && selectedFileIds.length === 0)
            }
          >
            Create {assessmentType === 'quiz' ? 'quiz' : 'assessment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
