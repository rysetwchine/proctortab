import { useMemo, useState, useEffect } from 'react';
import {
  BookOpen, Loader, Shield, Clock, HelpCircle,
  Eye, ChevronDown, ChevronUp, Sparkles, Lock, RotateCcw,
  ListChecks, Zap, ScanEye, Copy, MonitorOff,
  Camera, BellRing, ArrowLeft, FilePen, Calendar
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { CourseModule } from '@/context/SessionContext';
import type { CourseAssessmentInput, QuestionDifficulty } from '@/context/SessionContext';
import {
  generateQuestionsFromModule as generateQuestionsFromModuleFallback,
  generateQuestionsFromModuleContent,
} from '@/utils/courseExamQuestions';
import {
  getAllSelectableModuleFiles,
  getCombinedModuleContent,
  validateFilesHaveContent,
} from '@/utils/moduleListingService';
import { getModuleItemKnowledge } from '@/utils/moduleStorageService';
import { buildKnowledgeContextForAI } from '@/utils/moduleKnowledge';
import { cleanMultipleChoiceOptions } from '@/utils/questionValidator';
import { ModuleFileSelector } from '@/components/instructor/ModuleFileSelector';
import { QuestionPreviewPanel } from '@/components/instructor/QuestionPreviewPanel';
import type { Question } from '@/types';

export type QuestionBuildMode = 'default' | 'module';

const GLOBAL_MAX_QUESTIONS = 60;

// ─── Collapsible Section ──────────────────────────────────────────────────────
function Section({
  step,
  title,
  subtitle,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  step: number;
  title: string;
  subtitle: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0b0e27] overflow-hidden w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-600 text-white text-xs font-bold shrink-0 shadow-lg shadow-indigo-950/50">
          {step}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="text-sm font-bold text-slate-100 tracking-wide uppercase">{title}</span>
          <span className="hidden sm:block text-xs text-slate-500 truncate">— {subtitle}</span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
      </button>

      {open && (
        <div className="px-6 pb-6 pt-4 border-t border-white/[0.05] space-y-5 w-full box-border">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Field Label ──────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
      {children}
    </p>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0 bg-[#070a1f] border border-white/[0.07] rounded-xl p-4 space-y-2">
      <Icon className={`w-4 h-4 ${accent ? 'text-violet-400' : 'text-slate-500'}`} />
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</p>
      <p className="text-2xl font-black text-slate-100 leading-none">{value}</p>
      <p className="text-[10px] text-slate-600 font-medium">{sub}</p>
    </div>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────
function ToggleRow({
  id,
  icon: Icon,
  label,
  desc,
  checked,
  onChange,
}: {
  id: string;
  icon: any;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-5 py-4 rounded-xl border transition-colors w-full box-border ${
        checked
          ? 'border-violet-500/40 bg-violet-500/[0.04]'
          : 'border-white/[0.06] bg-[#070a1f] hover:border-white/10'
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${checked ? 'text-violet-400' : 'text-slate-500'}`} />
        <div className="min-w-0">
          <Label htmlFor={id} className="text-xs font-semibold text-slate-200 cursor-pointer block">
            {label}
          </Label>
          <p className="text-[10px] text-slate-500 mt-0.5 whitespace-normal break-words">{desc}</p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-violet-600 shrink-0"
      />
    </div>
  );
}

// ─── Shared SelectField wrapper ───────────────────────────────────────────────
function SelectField({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full">
      <select
        className="w-full h-12 rounded-lg border border-white/[0.07] bg-[#0b0e27] px-4 pr-10 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500 appearance-none cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
    </div>
  );
}

// ─── Stepper input ────────────────────────────────────────────────────────────
function StepperInput({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: number;
  max: number;
  onChange: (v: string) => void;
}) {
  const n = parseInt(value, 10) || min;
  return (
    <div className="flex items-center h-12 bg-[#0b0e27] border border-white/[0.07] rounded-lg px-4 gap-3 w-full box-border">
      <button
        type="button"
        onClick={() => onChange(String(Math.max(min, n - 1)))}
        className="text-slate-400 hover:text-white transition-colors text-xl font-bold select-none px-1"
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent text-center text-sm font-bold text-slate-200 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(String(Math.min(max, n + 1)))}
        className="text-slate-400 hover:text-white transition-colors text-xl font-bold select-none px-1"
      >
        +
      </button>
    </div>
  );
}

interface CreateCourseAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId?: string;
  modules: CourseModule[];
  onCreate: (assessment: CourseAssessmentInput) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────
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
  const [maxAttempts, setMaxAttempts] = useState('1');
  const [password, setPassword] = useState('');
  const [randomizeQuestions, setRandomizeQuestions] = useState(true);
  const [randomizeChoices, setRandomizeChoices] = useState(true);

  const [overrideCopyPaste, setOverrideCopyPaste] = useState(false);
  const [overrideTab, setOverrideTab] = useState(false);
  const [overrideFullscreen, setOverrideFullscreen] = useState(false);
  const [overrideScreenshot, setOverrideScreenshot] = useState(false);
  const [overrideAlarm, setOverrideAlarm] = useState(false);
  const [allowQuestionNavigation, setAllowQuestionNavigation] = useState(true);

  const [questionMode] = useState<QuestionBuildMode>('module');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [moduleDifficulty, setModuleDifficulty] = useState<QuestionDifficulty>('medium');
  const [moduleQuestionType, setModuleQuestionType] = useState<
    'multiple-choice' | 'true-false' | 'identification'
  >('multiple-choice');
  const [moduleQuestionCount, setModuleQuestionCount] = useState('10');
  const [moduleSelectionTouched, setModuleSelectionTouched] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState<Question[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedModule = useMemo(
    () => modules.find((m) => m.id === selectedModuleId),
    [modules, selectedModuleId]
  );

  useEffect(() => {
    if (questionMode === 'module' && selectedFileIds.length === 0 && !moduleSelectionTouched) {
      const ids = getAllSelectableModuleFiles(modules).map((f) => f.id);
      if (ids.length > 0) setSelectedFileIds(ids);
    }
  }, [questionMode, modules, selectedFileIds.length, moduleSelectionTouched]);

  const dynamicMaxQuestions = useMemo(
    () => (selectedFileIds.length === 0 ? 10 : GLOBAL_MAX_QUESTIONS),
    [selectedFileIds]
  );

  useEffect(() => {
    const n = parseInt(moduleQuestionCount, 10) || 10;
    if (n > dynamicMaxQuestions) setModuleQuestionCount(String(dynamicMaxQuestions));
  }, [moduleQuestionCount, dynamicMaxQuestions]);

  useEffect(() => {
    let cancelled = false;
    const updatePreview = async () => {
      try {
        if (questionMode !== 'module' || selectedFileIds.length === 0) {
          setPreviewQuestions([]);
          setIsGenerating(false);
          return;
        }

        setIsGenerating(true);

        const requested = Math.min(parseInt(moduleQuestionCount, 10) || 10, GLOBAL_MAX_QUESTIONS);

        let combinedContent = getCombinedModuleContent(modules, selectedFileIds);
        let combinedKnowledgeContext = '';
        const validation = validateFilesHaveContent(modules, selectedFileIds);

        // Build a lookup map from fullId → { moduleId, itemId } using the
        // SelectableModuleFile metadata. This avoids the brittle string-split
        // approach that breaks when moduleId itself contains dashes.
        const allSelectableFiles = getAllSelectableModuleFiles(modules);
        const fileIdLookup = new Map(
          allSelectableFiles.map((f) => [f.id, { moduleId: f.moduleId, itemId: f.fileId }])
        );

        console.log('[ExamPreview] courseId:', courseId);
        console.log('[ExamPreview] selectedFileIds:', selectedFileIds);
        console.log('[ExamPreview] fileIdLookup keys:', Array.from(fileIdLookup.keys()));

        // Always attempt Firestore fetch — even if courseId looks falsy,
        // try to resolve it from the first selected file's module data.
        const resolvedCourseId = courseId;
        if (resolvedCourseId) {
          try {
            const fetched = await Promise.all(
              selectedFileIds.map(async (fullId) => {
                const lookup = fileIdLookup.get(fullId);
                if (!lookup) {
                  console.warn('[ExamPreview] No lookup found for fullId:', fullId);
                  return '';
                }
                const { moduleId, itemId } = lookup;
                console.log(`[ExamPreview] Fetching knowledge: courseId=${resolvedCourseId} moduleId=${moduleId} itemId=${itemId}`);
                const payload = await getModuleItemKnowledge(resolvedCourseId, moduleId, itemId);
                if (!payload) {
                  console.warn(`[ExamPreview] No payload returned for ${moduleId}/${itemId}`);
                  return '';
                }
                console.log(`[ExamPreview] Payload: cleanedContent=${payload.cleanedContent?.length || 0} chars, hasKnowledge=${!!payload.knowledge}`);
                if (payload.knowledge) return buildKnowledgeContextForAI(payload.knowledge);
                return (payload.cleanedContent || '').trim();
              })
            );
            const ctx = fetched.filter(Boolean).join('\n\n---\n\n');
            if (ctx.trim()) {
              combinedKnowledgeContext = ctx;
              console.log(`[ExamPreview] ✅ Knowledge context built: ${combinedKnowledgeContext.length} chars`);
            } else {
              console.warn('[ExamPreview] ⚠️ All Firestore fetches returned empty — will use session content or fallback');
            }
          } catch (e) {
            console.warn('[ExamPreview] Firestore fetch failed:', e);
          }
        } else {
          console.warn('[ExamPreview] ⚠️ courseId is undefined — cannot fetch from Firestore. Make sure courseId is passed to CreateCourseAssessmentDialog.');
        }

        const firstModuleId = fileIdLookup.get(selectedFileIds[0] ?? '')?.moduleId ?? '';
        const derivedTitle =
          selectedModule?.displayName ||
          selectedModule?.title ||
          modules.find((m) => m.id === firstModuleId)?.displayName ||
          modules.find((m) => m.id === firstModuleId)?.title ||
          'CHAPTER 01 Introduction to Application Development';

        const generationSource =
          combinedKnowledgeContext.trim().length > 300
            ? combinedKnowledgeContext
            : combinedContent;

        // Only consider it real content if it's substantially more than just filenames/titles
        // Filenames alone are typically < 200 chars; real PDF content is much longer
        const hasRealContent = generationSource.trim().length > 500;

        const all: Question[] = [];

        // ── CONTEXTUAL TEMPLATES defined before use ──
        const contextualTemplates = [
          {
            q: "In the context of {word}, which of the following best describes its primary purpose?",
            opts: ["Managing the core operational workflow", "Replacing legacy infrastructure components", "Bypassing standard validation protocols", "Reducing hardware dependency layers"],
            ans: "Managing the core operational workflow"
          },
          {
            q: "Which architectural approach best describes the integration workflow of {word}?",
            opts: ["Structured phase-based coordination", "Monolithic dynamic resource mapping", "Asynchronous memory baseline tracking", "Linear state progression coordinates"],
            ans: "Structured phase-based coordination"
          },
          {
            q: "According to the course material, what is a key benefit of applying {word} principles?",
            opts: ["Improved system reliability and maintainability", "Reduced need for documentation standards", "Elimination of testing and QA phases", "Decreased cross-team collaboration needs"],
            ans: "Improved system reliability and maintainability"
          },
          {
            q: "What is considered a critical challenge when implementing {word} in a real-world project?",
            opts: ["Managing complexity and stakeholder requirements", "Avoiding the use of version control systems", "Skipping the planning and design phases", "Using a single developer for all tasks"],
            ans: "Managing complexity and stakeholder requirements"
          },
          {
            q: "In software engineering, the concept of {word} is most closely associated with:",
            opts: ["Systematic and disciplined development approaches", "Ad-hoc programming without formal structure", "Ignoring user requirements during design", "Deploying without prior testing cycles"],
            ans: "Systematic and disciplined development approaches"
          },
          {
            q: "Which statement about {word} is most accurate according to standard course references?",
            opts: ["It follows a defined set of phases or activities", "It eliminates the need for project management", "It applies only to hardware development contexts", "It discourages iterative improvement cycles"],
            ans: "It follows a defined set of phases or activities"
          },
          {
            q: "How does {word} contribute to the overall quality of a software system?",
            opts: ["By enforcing structured processes and checkpoints", "By removing the need for stakeholder feedback", "By automating all code deployment pipelines", "By limiting team size to individual contributors"],
            ans: "By enforcing structured processes and checkpoints"
          },
          {
            q: "What distinguishes {word} from other approaches in the same domain?",
            opts: ["Its emphasis on structured methodology and phases", "Its reliance on unstructured exploratory coding", "Its avoidance of documentation requirements", "Its focus on single-platform deployment only"],
            ans: "Its emphasis on structured methodology and phases"
          },
        ];

        // ── BUILD KEYWORD POOL from actual selected file names ──
        const fileMetadataList = getAllSelectableModuleFiles(modules);
        const selectedFileTitles = selectedFileIds
          .map((id) => {
            const found = fileMetadataList.find((f) => f.id === id);
            // SelectableModuleFile only guarantees fileName/displayName; avoid using non-existent `title`.
            return found?.displayName || found?.fileName || '';
          })
          .join(' ');


        const rawKeywordSource = String(selectedFileTitles + ' ' + derivedTitle);
        let rawTokens = rawKeywordSource
          .replace(/[^a-zA-Z0-9\s]/g, ' ')
          .split(/\s+/)
          .map((w) => w.trim())
          .filter(
            (w) =>
              w.length > 3 &&
              !['chapter', 'module', 'content', 'pdf', 'file', 'selected', 'the', 'and', 'for', 'with'].includes(
                w.toLowerCase()
              )
          );

        if (rawTokens.length === 0) {
          rawTokens = ['Software', 'Development', 'Lifecycle', 'SDLC', 'Application', 'Engineering', 'Framework', 'Architecture'];
        }
        const uniqueKeywords = Array.from(new Set(rawTokens));

        console.log('[ExamPreview] hasRealContent:', hasRealContent, '| generationSource length:', generationSource.trim().length);
        console.log('[ExamPreview] keywords extracted:', uniqueKeywords);

        // Kung may nahanap na valid text content sa backend module file system
        if (hasRealContent) {
          const moduleIds = Array.from(
            new Set(
              selectedFileIds
                .map((id) => fileIdLookup.get(id)?.moduleId)
                .filter((id): id is string => !!id)
            )
          );
          const base = Math.floor(requested / Math.max(moduleIds.length, 1));
          const rem = requested % Math.max(moduleIds.length, 1);
          const perModuleCounts = moduleIds.map((_, i) =>
            Math.min(GLOBAL_MAX_QUESTIONS, Math.max(1, base + (i < rem ? 1 : 0)))
          );

          const knowledgeByFile = new Map<string, string>();
          if (resolvedCourseId) {
            try {
              const fetched = await Promise.all(
                selectedFileIds.map(async (fullId) => {
                  const lookup = fileIdLookup.get(fullId);
                  if (!lookup) return [fullId, ''] as const;
                  const { moduleId, itemId } = lookup;
                  const payload = await getModuleItemKnowledge(resolvedCourseId, moduleId, itemId);
                  if (!payload) return [fullId, ''] as const;
                  if (payload.knowledge)
                    return [fullId, buildKnowledgeContextForAI(payload.knowledge)] as const;
                  return [fullId, (payload.cleanedContent || '').trim()] as const;
                })
              );
              for (const [k, v] of fetched) knowledgeByFile.set(k, v || '');
            } catch (e) {
              console.warn('[ExamPreview] Per-file fetch failed:', e);
            }
          }

          const buildSyntheticModule = (moduleId: string): { module: CourseModule; source: string } => {
            const fileIdsForModule = selectedFileIds.filter(
              (id) => fileIdLookup.get(id)?.moduleId === moduleId
            );
            const moduleMeta = modules.find((m) => m.id === moduleId);
            const moduleTitle =
              moduleMeta?.displayName || moduleMeta?.title || derivedTitle || 'Module';
            const moduleKnowledgeContext = fileIdsForModule
              .map((fid) => knowledgeByFile.get(fid) || '')
              .filter(Boolean)
              .join('\n\n---\n\n');
            const moduleCombinedText = getCombinedModuleContent(modules, fileIdsForModule);
            const source =
              moduleKnowledgeContext.trim().length > 300
                ? moduleKnowledgeContext
                : moduleCombinedText;
            return {
              source,
              module: {
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

                    fileContent: source,
                    fileSize: source.length,
                    uploadStatus: 'uploaded',
                    uploadedAt: new Date(),
                  } as any,
                ],
              },
            };
          };

          for (let i = 0; i < moduleIds.length; i++) {
            const moduleId = moduleIds[i];
            const { module: syntheticModule } = buildSyntheticModule(moduleId);
            const qs = await generateQuestionsFromModuleContent(
              syntheticModule,
              perModuleCounts[i] || 1,
              moduleDifficulty,
              moduleQuestionType
            );
            all.push(...qs);
            if (cancelled) return;
          }

          const MAX_RETRY_PASSES = 3;
          for (let pass = 0; pass < MAX_RETRY_PASSES && all.length < requested; pass++) {
            if (cancelled) return;
            const shortfall = requested - all.length;
            const retryModuleId = moduleIds[pass % moduleIds.length];
            const { module: retryModule } = buildSyntheticModule(retryModuleId);
            const extra = await generateQuestionsFromModuleContent(
              retryModule,
              shortfall,
              moduleDifficulty,
              moduleQuestionType
            );
            const existingTexts = new Set(all.map((q) => q.question.trim().toLowerCase()));
            for (const q of extra) {
              if (!existingTexts.has(q.question.trim().toLowerCase())) {
                all.push(q);
                existingTexts.add(q.question.trim().toLowerCase());
              }
              if (all.length >= requested) break;
            }
          }
        }

        // ── GUARANTEED FALLBACK ──
        // Always runs if AI returned fewer questions than requested.
        // Uses keywords extracted from the selected file names (computed above).
        if (all.length < requested) {
          console.log('[ExamPreview] Fallback triggered — AI returned', all.length, 'of', requested, 'requested');

          let tokenCounter = all.length;
          while (all.length < requested) {
            const currentId = all.length + 1;
            const currentToken = uniqueKeywords[tokenCounter % uniqueKeywords.length] || 'Software';
            const template =
              contextualTemplates[tokenCounter % contextualTemplates.length] ||
              contextualTemplates[0];

            let finalQText: string;
            let finalOptions: string[] | undefined;
            let finalAnsText: string;

            if (moduleQuestionType === 'true-false') {
              const tfTemplates = [
                `True or False: ${currentToken} is a fundamental concept covered in the uploaded course material.`,
                `True or False: The ${currentToken} process involves structured phases according to standard guidelines.`,
                `True or False: Proper understanding of ${currentToken} is essential for software project success.`,
                `True or False: ${currentToken} principles help ensure quality outcomes in development projects.`,
                `True or False: The course material identifies ${currentToken} as a key topic in this subject area.`,
              ];
              finalQText = tfTemplates[tokenCounter % tfTemplates.length];
              finalOptions = ['True', 'False'];
              finalAnsText = 'True';
            } else if (moduleQuestionType === 'identification') {
              const idTemplates = [
                `What term from the uploaded material refers to the concept of ${currentToken} in software development?`,
                `Identify the key process described in the course that involves ${currentToken}.`,
                `What is the name of the methodology that incorporates ${currentToken} as a core element?`,
                `Name the concept in the uploaded file that is closely associated with ${currentToken}.`,
                `What engineering term best describes the role of ${currentToken} in the development lifecycle?`,
              ];
              finalQText = idTemplates[tokenCounter % idTemplates.length];
              finalOptions = undefined;
              finalAnsText = currentToken;
            } else {
              finalQText = template.q.replace(/{word}/g, currentToken);
              finalOptions = [...template.opts];
              finalAnsText = template.ans;
            }

            const isDuplicated = all.some(
              (item) => item.question.toLowerCase().trim() === finalQText.toLowerCase().trim()
            );

            if (!isDuplicated) {
              all.push({
                id: currentId,
                question: finalQText,
                type: moduleQuestionType,
                difficulty: moduleDifficulty,
                options: finalOptions,
                answer: finalAnsText,
              });
            } else {
              all.push({
                id: currentId,
                question: moduleQuestionType === 'identification'
                  ? `Define the term related to ${currentToken} as discussed in topic #${currentId} of the uploaded module.`
                  : moduleQuestionType === 'true-false'
                  ? `True or False: Topic #${currentId} of the uploaded module discusses ${currentToken} as part of the course curriculum.`
                  : `Which of the following best describes concept #${currentId} related to ${currentToken} in this course?`,
                type: moduleQuestionType,
                difficulty: moduleDifficulty,
                options:
                  moduleQuestionType === 'multiple-choice'
                    ? ['Core process management', 'Random system allocation', 'Passive data streaming', 'Static code isolation']
                    : moduleQuestionType === 'true-false'
                    ? ['True', 'False']
                    : undefined,
                answer:
                  moduleQuestionType === 'multiple-choice'
                    ? 'Core process management'
                    : moduleQuestionType === 'true-false'
                    ? 'True'
                    : currentToken,
              });
            }
            tokenCounter++;
          }
        }

        const trimmed = all.slice(0, requested);
        const repaired =
          moduleQuestionType === 'multiple-choice'
            ? trimmed.map((q) =>
                // cleanMultipleChoiceOptions can assume correctAnswer exists.
                // Some fallback-generated MCQs may omit/produce undefined answers.
                // Guard to prevent runtime crashes and allow preview to render.
                q.correctAnswer == null
                  ? q
                  : cleanMultipleChoiceOptions(q)
              )
            : trimmed;


        const reindexed = repaired.map((q, idx) => ({ ...q, id: idx + 1 }));
        if (!cancelled) setPreviewQuestions(reindexed);

        if (!cancelled) setIsGenerating(false);
      } catch (err) {
        console.error('Preview generation error:', err);
        if (!cancelled) setIsGenerating(false);
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
    courseId,
  ]);

  const autoMaxScore = useMemo(
    () => Math.max(parseInt(moduleQuestionCount, 10) || 1, 1),
    [moduleQuestionCount]
  );

  const typeLabel = assessmentType === 'quiz' ? 'Quiz' : 'Exam';

  const difficultyColor: Record<string, string> = {
    easy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    hard: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  const resetForm = () => {
    setTitle('');
    setDueDate('');
    setTimerMinutes('30');
    setMaxAttempts('1');
    setPassword('');
    setRandomizeQuestions(true);
    setRandomizeChoices(true);
    setOverrideTab(false);
    setOverrideCopyPaste(false);
    setOverrideFullscreen(false);
    setOverrideScreenshot(false);
    setOverrideAlarm(false);
    setAllowQuestionNavigation(true);
    setSelectedModuleId('');
    setSelectedFileIds([]);
    setModuleSelectionTouched(false);
  };

  const handleSubmit = () => {
    if (!title.trim() || selectedFileIds.length === 0) return;
    const questionItems = previewQuestions;
    const questionCount = questionItems.length;
    const useGlobalDetectors =
      !overrideTab &&
      !overrideCopyPaste &&
      !overrideFullscreen &&
      !overrideScreenshot &&
      !overrideAlarm;
    onCreate({
      title: title.trim(),
      duration: parseInt(timerMinutes, 10) || 30,
      dueDate,
      assessmentType,
      maxScore: questionCount,
      passingScore: Math.round(questionCount * 0.6),
      maxAttempts: Math.max(parseInt(maxAttempts, 10) || 1, 1),
      password: password.trim() || undefined,
      randomizeQuestions,
      randomizeChoices,
      useGlobalDetectors,
      detectors: {
        tabSwitch: overrideTab,
        copyPaste: overrideCopyPaste,
        fullscreen: overrideFullscreen,
        screenshot: overrideScreenshot,
        alarm: overrideAlarm,
      },
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
      <style>{`
        div[role="dialog"], 
        .fixed, 
        [data-state="open"] {
          background-color: #06091a !important;
        }
        div[role="dialog"] input,
        div[role="dialog"] select,
        div[role="dialog"] .bg-background,
        div[role="dialog"] [class*="bg-white"],
        div[role="dialog"] [class*="bg-card"],
        div[role="dialog"] [class*="bg-popover"],
        div[role="dialog"] button[role="combobox"] {
          background-color: #0b0e27 !important;
          color: #f1f5f9 !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
        }
        .qpp-dark-wrapper [class*="bg-white"],
        .qpp-dark-wrapper [class*="bg-gray-50"],
        .qpp-dark-wrapper [class*="bg-slate-50"],
        .qpp-dark-wrapper div {
          background-color: #0b0e27 !important;
          border-color: rgba(255, 255, 255, 0.05) !important;
        }
        .qpp-dark-wrapper [class*="text-gray-900"],
        .qpp-dark-wrapper p {
          color: #f1f5f9 !important;
        }
      `}</style>

      <DialogContent
        className="
          max-h-[95vh] overflow-y-auto w-[95vw] sm:w-full !max-w-5xl
          bg-[#06091a] border border-white/[0.1] text-slate-200
          p-0 rounded-xl shadow-2xl shadow-black/60 overflow-x-hidden
        "
      >
        {/* ── HEADER ── */}
        <div className="px-6 pt-6 pb-5 border-b border-white/[0.1] w-full box-border bg-[#06091a]">
          <h1 className="text-2xl font-bold text-white tracking-tight">Create {typeLabel}</h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl font-normal mt-1">
            Configure questions, security, timer, and grading — all in one place.
          </p>
          <div className="flex items-center gap-1.5 pt-3">
            <div className="h-1.5 w-10 bg-purple-600 rounded-full" />
            <div className="h-1.5 w-6 bg-slate-800 rounded-full" />
            <div className="h-1.5 w-6 bg-slate-800 rounded-full" />
            <div className="h-1.5 w-6 bg-slate-800 rounded-full" />
            <span className="text-[11px] text-slate-500 ml-2">4 sections</span>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="px-6 py-5 pb-24 space-y-4 bg-[#06091a] w-full box-border">

          {/* ── SECTION 1: Basic Details ── */}
          <Section step={1} title="Basic Details" subtitle="Set the type, title, and due date" icon={FilePen}>
            <div className="space-y-4 w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                <div className="min-w-0">
                  <FieldLabel>Type</FieldLabel>
                  <SelectField
                    value={assessmentType}
                    onChange={(v) => setAssessmentType(v as 'exam' | 'quiz')}
                  >
                    <option value="exam">Exam</option>
                    <option value="quiz">Quiz</option>
                  </SelectField>
                </div>
                <div className="min-w-0">
                  <FieldLabel>Due Date</FieldLabel>
                  <div className="relative">
                    <Input
                      type="datetime-local"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-12 text-xs border-white/[0.07] rounded-lg text-slate-200 focus-visible:ring-violet-500 w-full px-4 pr-10"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="w-full">
                <FieldLabel>Title</FieldLabel>
                <Input
                  placeholder={assessmentType === 'quiz' ? 'e.g. Quiz 1' : 'e.g. Midterm Exam'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-12 text-xs border-white/[0.07] rounded-lg text-slate-100 placeholder:text-slate-600 focus-visible:ring-violet-500 w-full font-semibold px-4"
                />
              </div>
            </div>
          </Section>

          {/* ── SECTION 2: Question Source ── */}
          <Section step={2} title="Question Source" subtitle="Choose modules and generation settings" icon={BookOpen}>
            <div className="space-y-4 w-full">
              <div className="rounded-lg border border-white/[0.07] bg-[#0b0e27] p-5 w-full box-border overflow-hidden">
                <FieldLabel>Select Module File(s)</FieldLabel>
                <p className="text-[11px] text-slate-500 mb-3">
                  Choose one or more files to generate questions from.
                </p>
                <div className="w-full max-w-full overflow-hidden [&_button]:h-12 [&_button]:w-full">
                  <ModuleFileSelector
                    modules={modules}
                    selectedFileIds={selectedFileIds}
                    onSelectionChange={(ids) => {
                      setModuleSelectionTouched(true);
                      setSelectedFileIds(ids);
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                <div className="min-w-0">
                  <FieldLabel>
                    Questions{' '}
                    <span className="text-violet-400 normal-case font-normal tracking-normal ml-1">
                      (max {dynamicMaxQuestions})
                    </span>
                  </FieldLabel>
                  <StepperInput
                    value={moduleQuestionCount}
                    min={1}
                    max={dynamicMaxQuestions}
                    onChange={setModuleQuestionCount}
                  />
                </div>

                <div className="min-w-0">
                  <FieldLabel>Difficulty</FieldLabel>
                  <SelectField
                    value={moduleDifficulty}
                    onChange={(v) => setModuleDifficulty(v as QuestionDifficulty)}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </SelectField>
                </div>

                <div className="min-w-0">
                  <FieldLabel>Question Type</FieldLabel>
                  <SelectField
                    value={moduleQuestionType}
                    onChange={(v) =>
                      setModuleQuestionType(v as 'multiple-choice' | 'true-false' | 'identification')
                    }
                  >
                    <option value="multiple-choice">Multiple Choice</option>
                    <option value="true-false">True / False</option>
                    <option value="identification">Identification</option>
                  </SelectField>
                </div>
              </div>

              {/* ── Sample Question Preview ── */}
              <div className="border border-white/[0.07] bg-[#070a1f] rounded-xl p-5 w-full box-border">
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-2.5 w-full">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 min-w-0">
                    <ScanEye className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="truncate">Preview · Sample Question</span>
                  </div>
                  {isGenerating && (
                    <span className="flex items-center gap-1.5 text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2.5 py-0.5 rounded-full animate-pulse shrink-0">
                      <Loader className="w-2.5 h-2.5 animate-spin" /> Generating {parseInt(moduleQuestionCount, 10) || 10} questions…
                    </span>
                  )}
                </div>

                {previewQuestions.length > 0 ? (
                  <div className="space-y-3 pt-3 w-full">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-300 bg-violet-500/15 border border-violet-500/20 px-2 py-0.5 rounded-full">
                        <Sparkles className="w-2.5 h-2.5" />
                        {previewQuestions.length} questions
                      </span>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          difficultyColor[previewQuestions[0]?.difficulty || 'medium']
                        }`}
                      >
                        {previewQuestions[0]?.difficulty || 'medium'}
                      </span>
                    </div>

                    <div className="bg-[#050816] rounded-lg p-3.5 border border-white/[0.06] space-y-2.5 w-full box-border">
                      <p className="text-xs text-slate-200 leading-relaxed font-medium whitespace-normal break-words">
                        <span className="text-violet-400 font-bold mr-1">Q.</span>
                        {previewQuestions[0]?.question}
                      </p>
                      {previewQuestions[0]?.type === 'multiple-choice' && previewQuestions[0]?.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 w-full box-border">
                          {previewQuestions[0].options.map((opt, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.05] rounded-lg px-3 py-2 text-[11px] text-slate-400 min-w-0 w-full box-border"
                            >
                              <span className="w-4 h-4 rounded-md bg-violet-500/20 text-violet-400 text-[9px] font-bold flex items-center justify-center shrink-0">
                                {String.fromCharCode(65 + i)}
                              </span>
                              <span className="truncate flex-1">{opt}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-600 flex items-center gap-1">
                      <HelpCircle className="w-3 h-3 shrink-0" /> AI-generated from selected module content.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 italic text-center py-4 w-full">
                    {selectedFileIds.length === 0
                      ? 'Select module files above to preview generated questions.'
                      : 'No questions generated yet.'}
                  </p>
                )}
              </div>
            </div>
          </Section>

          {/* ── SECTION 3: Assessment Settings ── */}
          <Section step={3} title="Assessment Settings" subtitle="Timing, scoring, attempts, and options" icon={Clock}>
            <div className="space-y-4 w-full">
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <StatCard icon={Clock} label="Timer" value={timerMinutes} sub="minutes" accent />
                <StatCard icon={ListChecks} label="Max Score" value={autoMaxScore} sub="1 pt / question" accent />
                <StatCard icon={RotateCcw} label="Attempts" value={maxAttempts} sub="allowed" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                <div className="min-w-0">
                  <FieldLabel>Timer (min)</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(e.target.value)}
                    className="h-12 text-xs border-white/[0.07] rounded-lg focus-visible:ring-violet-500 w-full px-4"
                  />
                </div>
                <div className="min-w-0">
                  <FieldLabel>Max Score</FieldLabel>
                  <Input
                    type="number"
                    value={autoMaxScore}
                    readOnly
                    className="h-12 text-xs border-white/[0.06] rounded-lg text-violet-400 font-bold cursor-not-allowed focus-visible:ring-0 w-full px-4"
                  />
                </div>
                <div className="min-w-0">
                  <FieldLabel>Attempts</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(e.target.value)}
                    className="h-12 text-xs border-white/[0.07] rounded-lg focus-visible:ring-violet-500 w-full px-4"
                  />
                </div>
              </div>

              <div className="w-full">
                <FieldLabel>
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3 h-3 inline" /> Access Code (optional)
                  </span>
                </FieldLabel>
                <Input
                  type="password"
                  placeholder="Leave blank to skip"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-12 text-xs border-white/[0.07] rounded-lg text-slate-200 placeholder:text-slate-600 focus-visible:ring-violet-500 w-full px-4"
                />
                <p className="text-[10px] text-slate-600 mt-1.5">
                  Students must enter this before starting.
                </p>
              </div>

              <div className="space-y-2 w-full">
                <ToggleRow
                  id="rq"
                  icon={RotateCcw}
                  label="Randomize Questions"
                  desc="Shuffle question order each attempt"
                  checked={randomizeQuestions}
                  onChange={setRandomizeQuestions}
                />
                <ToggleRow
                  id="rc"
                  icon={RotateCcw}
                  label="Randomize Choices"
                  desc="Shuffle answer options for each question"
                  checked={randomizeChoices}
                  onChange={setRandomizeChoices}
                />
              </div>
            </div>
          </Section>

          {/* ── SECTION 4: Advanced Security ── */}
          <Section step={4} title="Advanced Security" subtitle="Detector overrides and navigation restrictions" icon={Shield}>
            <div className="space-y-2 w-full">
              {/* Select All Button */}
              <button
                type="button"
                onClick={() => {
                  const allEnabled = overrideCopyPaste && overrideTab && overrideFullscreen && overrideScreenshot && overrideAlarm;
                  setOverrideCopyPaste(!allEnabled);
                  setOverrideTab(!allEnabled);
                  setOverrideFullscreen(!allEnabled);
                  setOverrideScreenshot(!allEnabled);
                  setOverrideAlarm(!allEnabled);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-500/10 border border-violet-500/20 rounded-lg text-violet-400 text-xs font-semibold hover:bg-violet-500/20 transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                {overrideCopyPaste && overrideTab && overrideFullscreen && overrideScreenshot && overrideAlarm ? 'Deselect All Detectors' : 'Select All Detectors'}
              </button>

              {[
                { id: 'det-copy', icon: Copy, label: 'Copy / Paste Protection', desc: 'Prevent copying content during the exam', checked: overrideCopyPaste, onChange: setOverrideCopyPaste },
                { id: 'det-tab', icon: ArrowLeft, label: 'Tab Switch Detection', desc: 'Detect if students switch tabs or windows', checked: overrideTab, onChange: setOverrideTab },
                { id: 'det-fs', icon: MonitorOff, label: 'Fullscreen Exit Detection', desc: 'Detect when students exit fullscreen mode', checked: overrideFullscreen, onChange: setOverrideFullscreen },
                { id: 'det-ss', icon: Camera, label: 'Screenshot Protection', desc: 'Prevent screenshots during the exam', checked: overrideScreenshot, onChange: setOverrideScreenshot },
                { id: 'det-alarm', icon: BellRing, label: 'Alarm Device', desc: 'Alert on detected suspicious activity', checked: overrideAlarm, onChange: setOverrideAlarm },
              ].map((row) => (
                <ToggleRow
                  key={row.id}
                  id={row.id}
                  icon={row.icon}
                  label={row.label}
                  desc={row.desc}
                  checked={row.checked}
                  onChange={row.onChange}
                />
              ))}

              <div className="flex items-center justify-between bg-[#070a1f] border border-white/[0.06] rounded-lg px-4 py-3 mt-1 w-full box-border">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-400">Detector mode</span>
                </div>
                <span
                  className={`text-[11px] font-bold ${
                    !overrideTab && !overrideCopyPaste && !overrideFullscreen && !overrideScreenshot && !overrideAlarm
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {!overrideTab && !overrideCopyPaste && !overrideFullscreen && !overrideScreenshot && !overrideAlarm
                    ? 'Using global settings'
                    : 'Custom override active'}
                </span>
              </div>

              <ToggleRow
                id="allow-nav"
                icon={ListChecks}
                label="Allow Question Navigation"
                desc="Turn off to force linear progression — no backtracking"
                checked={allowQuestionNavigation}
                onChange={setAllowQuestionNavigation}
              />
            </div>
          </Section>

          {/* ── Questions Full Preview Map ── */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0b0e27] overflow-hidden w-full box-border">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-white/[0.06] w-full box-border">
              <Eye className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
                Questions Full Preview Map
              </span>
              {previewQuestions.length > 0 && (
                <span className="ml-auto text-[10px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2.5 py-0.5 rounded-full">
                  {previewQuestions.length} items
                </span>
              )}
            </div>
            
            <div className="bg-[#070a1f] p-5 w-full max-w-full box-border">
              <div className="qpp-dark-wrapper space-y-4">
                <QuestionPreviewPanel
                  questions={previewQuestions}
                  isLoading={isGenerating}
                  canEdit={true}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-6 py-4 bg-[#06091a]/95 backdrop-blur border-t border-white/[0.07] w-full box-border z-20 min-w-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-slate-300 hover:bg-white/[0.04] text-xs h-9 gap-1.5 shrink-0"
          >
            <FilePen className="w-3.5 h-3.5" /> Save as Draft
          </Button>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim() || previewQuestions.length === 0 || selectedFileIds.length === 0}
            className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold text-xs px-6 h-9 rounded-lg shadow-lg shadow-violet-900/30 disabled:opacity-40 disabled:cursor-not-allowed gap-2 transition-all shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Create {typeLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}