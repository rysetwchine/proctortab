import type { Question } from '@/types';
import type { CourseModule } from '@/context/SessionContext';
import type { QuestionDifficulty } from '@/context/SessionContext';
import { generateAIQuestions, generateFallbackQuestions, type AIGenerationParams } from './aiQuestionGenerator';
import { ensureQuestionQuality } from './questionValidator';
import { examQuestions } from '@/data/questions';
import { getModuleContent } from './moduleStorageService';
import { assessContentQuality, stripPdfFontArtifacts } from './contentQuality';
import { analyzeModuleKnowledge, buildCompactKnowledgeContextForAI, type ModuleKnowledge } from './moduleKnowledge';
import { generateCompleteOptions } from './choiceGenerator';

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pickOptions(correct: string, pool: string[], count = 4): string[] {
  const unique = [...new Set([correct, ...pool])].filter(Boolean);
  while (unique.length < count) {
    unique.push(`Option ${unique.length + 1}`);
  }
  const shuffled = [...unique].sort(
    (a, b) => hashString(correct + a) - hashString(correct + b)
  );
  return shuffled.slice(0, count);
}

function difficultyLabel(d: QuestionDifficulty): string {
  if (d === 'easy') return 'foundational';
  if (d === 'hard') return 'advanced';
  return 'intermediate';
}

function normalizeQuestionKey(q: Question): string {
  return (q.question || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateStringSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

  const words1 = new Set(normalize(str1));
  const words2 = new Set(normalize(str2));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter((w) => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / union;
}

const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','these','those','into','over','under','between','within',
  'what','when','where','which','who','whom','why','how','also','because','therefore','however','more','most',
  'based','according','following','statement','excerpt','material','course','module','below','above',
  'identify','definition','concept','best','most','accurate','correct',
]);

function keywordsOf(text: string, max = 10): string[] {
  const tokens = (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, max);
}

function keywordSignature(q: Question): string {
  const k = [
    ...keywordsOf(q.question || '', 10),
    ...keywordsOf(q.correctAnswer?.toString() || '', 6),
  ];
  return [...new Set(k)].slice(0, 12).sort().join(' ');
}

function areNearDuplicate(q1: Question, q2: Question): boolean {
  const questionSimilarity = calculateStringSimilarity(q1.question || '', q2.question || '');
  const answerSimilarity = calculateStringSimilarity(
    q1.correctAnswer?.toString() || '',
    q2.correctAnswer?.toString() || ''
  );

  // Similar stems + similar answers => near-duplicate
  if (questionSimilarity > 0.60 && answerSimilarity > 0.45) return true;
  // Very similar answers + moderately similar stems
  if (answerSimilarity > 0.78 && questionSimilarity > 0.35) return true;

  // Keyword-level similarity (catches reworded duplicates that slip past Jaccard)
  const sig1 = keywordSignature(q1);
  const sig2 = keywordSignature(q2);
  if (sig1 && sig2 && calculateStringSimilarity(sig1, sig2) > 0.62) return true;
  return false;
}

function conceptKey(q: Question): string {
  const base =
    (q.correctAnswer?.toString() || '') +
    ' ' +
    (q.question || '');
  return base
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 5)
    .slice(0, 6)
    .join(' ');
}

function filterAgainstExisting(candidates: Question[], existing: Question[]): Question[] {
  const out: Question[] = [];
  for (const c of candidates) {
    if (!c?.question) continue;
    let dup = false;
    for (const e of existing) {
      if (areNearDuplicate(c, e)) {
        dup = true;
        break;
      }
      // Prevent repeating the same concept in the same way
      if (conceptKey(c) && conceptKey(e) && calculateStringSimilarity(conceptKey(c), conceptKey(e)) > 0.72) {
        dup = true;
        break;
      }
    }
    if (!dup) out.push(c);
  }
  return out;
}

function mergeUniqueQuestions(
  primary: Question[],
  secondary: Question[],
  max: number
): Question[] {
  const out: Question[] = [];
  const seen = new Set<string>();
  for (const q of [...primary, ...secondary]) {
    const key = normalizeQuestionKey(q);
    if (!key || seen.has(key)) continue;
    // Second safety: block near-duplicates (not just exact string matches)
    if (out.some((kept) => areNearDuplicate(q, kept))) continue;
    seen.add(key);
    out.push({ ...q, id: out.length + 1 });
    if (out.length >= max) break;
  }
  return out;
}

function ensureExactCount(
  questions: Question[],
  {
    topic,
    count,
    difficulty,
    type,
    moduleContent,
  }: {
    topic: string;
    count: number;
    difficulty: QuestionDifficulty;
    type: 'multiple-choice' | 'true-false' | 'identification';
    moduleContent?: string;
  }
): Question[] {
  // Always run through quality + MCQ padding logic first
  let out = ensureQuestionQuality(questions, type, 0);
  if (out.length >= count) return out.slice(0, count).map((q, i) => ({ ...q, id: i + 1 }));

  // Top up (prefer module-based fallback, then generic templates).
  // IMPORTANT: Keep trying until we reach exact count or we hit a hard cap.
  const hardCap = 6; // should be more than enough; fallback generation is deterministic
  let tries = 0;
  while (out.length < count && tries < hardCap) {
    tries += 1;
    const missing = count - out.length;
    const fromModule = ensureQuestionQuality(
      generateFallbackQuestions({
        topic,
        count: missing,
        difficulty,
        type,
        moduleContent,
      }),
      type,
      0
    );
    out = mergeUniqueQuestions(out, fromModule, count);
    if (out.length >= count) break;

    const missing2 = count - out.length;
    const fromGeneric = ensureQuestionQuality(
      generateFallbackQuestions({ topic, count: missing2, difficulty, type }),
      type,
      0
    );
    out = mergeUniqueQuestions(out, fromGeneric, count);
  }

  // Last resort: if still short, generate deterministic questions FROM the structured knowledge context
  // (not raw PDF text and not a single repeated template).
  if (out.length < count && type === 'multiple-choice') {
    const kb = moduleContent || '';
    const parseBullets = (label: string): string[] => {
      const re = new RegExp(`${label}:\\s*\\n([\\s\\S]*?)(\\n\\n|$)`, 'i');
      const m = kb.match(re);
      if (!m) return [];
      return m[1]
        .split('\n')
        .map((l) => l.replace(/^\s*-\s+/, '').trim())
        .filter((x) => x.length >= 3 && !/^\d+$/.test(x));
    };
    const defs: Array<{ term: string; definition: string }> = [];
    const defLines = parseBullets('Key definitions');
    for (const line of defLines) {
      const parts = line.split(':');
      if (parts.length < 2) continue;
      const term = parts.shift()!.trim();
      const definition = parts.join(':').trim();
      if (term.length >= 2 && definition.length >= 10 && !/^\d+$/.test(term)) defs.push({ term, definition });
    }
    const concepts = [
      ...parseBullets('Key concepts'),
      ...parseBullets('Important terms'),
      ...parseBullets('Topics'),
    ].filter(Boolean);

    const pool = [...new Set([...defs.map((d) => d.term), ...concepts])].filter(Boolean);
    const patterns = [
      (term: string) => `Which option best defines the term "${term}" as used in this module?`,
      (term: string) => `In the module context, which statement about "${term}" is MOST accurate?`,
      (term: string) => `Which scenario best demonstrates the correct use of "${term}"?`,
      (term: string) => `Which of the following is a common misconception about "${term}"?`,
      (term: string) => `Which comparison best distinguishes "${term}" from closely related ideas in the module?`,
    ];

    let idx = 0;
    while (out.length < count && idx < 200) {
      idx += 1;
      const i = out.length + 1;
      const term = pool[(i - 1) % Math.max(pool.length, 1)] || topic;
      if (!term || /^\d+$/.test(term) || term.trim().length < 2) continue;

      const stem = patterns[(i - 1) % patterns.length](term);
      const correct = defs.find((d) => d.term === term)?.definition || `${term} is a key concept discussed in the module.`;
      const options = generateCompleteOptions(correct, topic, kb, 'medium');
      const candidate: Question = {
        id: i,
        question: stem,
        options,
        correctAnswer: options.includes(correct) ? correct : options[0],
        difficulty,
        type: 'multiple-choice',
        topic,
        explanation: 'Generated from structured module knowledge to satisfy the requested exam length.',
      };
      // Avoid repeating the same concept signature
      if (out.some((q) => areNearDuplicate(candidate, q))) continue;
      out.push(candidate);
    }
  }

  return out.slice(0, count).map((q, i) => ({ ...q, id: i + 1 }));
}

function deriveTopicName(rawTopic: string, knowledge: ModuleKnowledge): string {
  const t = (rawTopic || '').trim();
  // Avoid junk topics like "1" or very short titles
  if (t.length >= 3 && !/^\d+$/.test(t)) return t;
  const fromHeading = (knowledge.topics || []).find((x) => x && x.trim().length >= 6 && !/^\d+$/.test(x.trim()));
  if (fromHeading) return fromHeading.trim();
  const fromConcept = (knowledge.keyConcepts || []).find((x) => x && x.trim().length >= 4 && !/^\d+$/.test(x.trim()));
  if (fromConcept) return fromConcept.trim();
  return 'Selected module';
}

function buildQuestionTargetsText(knowledge: ModuleKnowledge, count: number, type: 'multiple-choice' | 'true-false' | 'identification'): string {
  // Build a "plan" so the model spreads coverage across real module concepts.
  const terms = [
    ...knowledge.definitions.map((d) => d.term),
    ...knowledge.keyConcepts,
    ...knowledge.importantTerms,
    ...knowledge.topics,
    ...knowledge.processes,
  ].filter(Boolean);

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const t of terms) {
    const k = t.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(t.trim());
    if (uniq.length >= 40) break;
  }

  // If the concept pool is small, expand targets using different excerpts.
  // This prevents the AI from recycling only ~5–6 concepts repeatedly.
  const excerptTargets: string[] = [];
  const excerpts =
    (knowledge.chunks || [])
      .map((c) => (c.text || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 120);
  for (const ex of excerpts) {
    // create multiple windows per excerpt so each target is distinct
    for (let i = 0; i < ex.length; i += 180) {
      const win = ex.slice(i, i + 220).trim();
      if (win.length >= 120) excerptTargets.push(win);
      if (excerptTargets.length >= 40) break;
    }
    if (excerptTargets.length >= 40) break;
  }

  const styles =
    type === 'identification'
      ? ['Identification', 'Key term', 'Fill-in-the-blank']
      : type === 'true-false'
        ? ['True/False', 'Concept check', 'Misconception check']
        : ['Definition', 'Concept', 'Application', 'Scenario', 'Analysis', 'Comparison'];

  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    // Prefer unique concepts first; if we run out, force variety via different excerpt windows.
    const concept =
      uniq[i] ||
      excerptTargets[i - uniq.length] ||
      uniq[i % Math.max(uniq.length, 1)] ||
      (knowledge.topics[0] || 'the module content');
    const style = styles[i % styles.length];
    if (concept.length > 120 && concept.includes(' ')) {
      // excerpt target
      lines.push(`${i + 1}. ${style} (use this excerpt): "${concept}"`);
    } else {
      lines.push(`${i + 1}. ${style}: ${concept}`);
    }
  }

  return `QUESTION TARGETS (must cover these concepts; 1 question per line):\n${lines.join('\n')}\n`;
}

function repairMcqOptionsFromContext(
  questions: Question[],
  opts: {
    topic: string;
    difficulty: QuestionDifficulty;
    moduleContext: string;
  }
): Question[] {
  const diff =
    opts.difficulty === 'easy' ? 'easy' : opts.difficulty === 'hard' ? 'hard' : 'medium';

  const looksPlaceholder = (s: string) =>
    /^(option\s*\d+|plausible alternative|another related concept|a related but incorrect idea|a common misconception related to)\b/i.test(
      s.trim()
    );

  return questions.map((q) => {
    if (q.type !== 'multiple-choice') return q;

    const rawOpts = (q.options || []).map((o) => stripPdfFontArtifacts(String(o || '')).trim());
    const cleaned = rawOpts.filter((o) => o && o.length >= 6 && !looksPlaceholder(o));

    // If we don't have 4 strong options, regenerate options using module context key terms.
    if (cleaned.length < 4 || cleaned.some((o) => o.length < 10)) {
      const correct = stripPdfFontArtifacts(String(q.correctAnswer || '')).trim() || cleaned[0] || 'The correct answer';
      const regenerated = generateCompleteOptions(correct, opts.topic, opts.moduleContext, diff);
      const finalCorrect = regenerated.includes(correct) ? correct : regenerated[0];
      return { ...q, options: regenerated, correctAnswer: finalCorrect };
    }

    // Ensure exactly 4 unique
    const uniq = Array.from(new Set(cleaned.map((o) => o.trim()))).slice(0, 4);
    while (uniq.length < 4) {
      const correct = stripPdfFontArtifacts(String(q.correctAnswer || '')).trim() || uniq[0] || 'The correct answer';
      const regenerated = generateCompleteOptions(correct, opts.topic, opts.moduleContext, diff);
      for (const o of regenerated) {
        if (uniq.length >= 4) break;
        if (!uniq.includes(o)) uniq.push(o);
      }
    }
    const correct = String(q.correctAnswer || '').trim();
    const correctFixed = uniq.includes(correct) ? correct : uniq[0];
    return { ...q, options: uniq.slice(0, 4), correctAnswer: correctFixed };
  });
}

async function generateToExactCountWithRetries(params: {
  topic: string;
  count: number;
  difficulty: QuestionDifficulty;
  type: 'multiple-choice' | 'true-false' | 'identification';
  moduleContent: string;
}): Promise<Question[]> {
  const { topic, count, difficulty, type, moduleContent } = params;

  console.log(`[DEBUG] Requested count: ${count}`);

  // Root cause of "requested 20 but got 4-8" is usually truncated JSON due to token limits.
  // Fix: generate in SMALL BATCHES + retry missing until exact count is satisfied.
  const maxAttempts = 5;
  let collected: Question[] = [];

  let attempt = 0;
  while (collected.length < count && attempt < maxAttempts) {
    attempt += 1;
    const missing = count - collected.length;
    console.log(`[DEBUG] Missing questions: ${missing}`);

    // Batch size small to avoid output truncation.
    // Oversample a little (but keep small) to survive validation/dedup.
    const batchRequest = Math.min(6, Math.max(missing, 1));
    const batchCount = Math.min(8, batchRequest + 2);
    console.log(`[DEBUG] Retry attempt #${attempt} generating ${batchCount} (target missing ${missing})`);

    // Tell the AI what to avoid to prevent it from repeating the same ~6 questions.
    const avoidList = collected
      .slice(0, 12)
      .map((q) => (q.question || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const avoidBlock = avoidList.length
      ? `\n\nDO NOT repeat or closely rephrase any of these already-generated questions:\n- ${avoidList.join('\n- ')}\n`
      : '';

    const raw = await generateAIQuestions({
      topic,
      count: batchCount,
      difficulty,
      type,
      moduleContent: (moduleContent + avoidBlock).substring(0, 15000),
    });
    console.log(`[DEBUG] Raw AI returned: ${raw.length}`);

    // Validate + repair (pads MCQ options, etc.)
    const beforeValidate = raw.length;
    let valid = ensureQuestionQuality(raw, type, 0);
    const afterValidate = valid.length;
    console.log(`[DEBUG] Removed invalid: ${Math.max(0, beforeValidate - afterValidate)}`);

    valid = repairMcqOptionsFromContext(valid, { topic, difficulty, moduleContext: moduleContent });

    const beforeDedupe = valid.length;
    valid = filterAgainstExisting(valid, collected);
    const afterDedupe = valid.length;
    console.log(`[DEBUG] Removed duplicates: ${Math.max(0, beforeDedupe - afterDedupe)}`);

    collected = mergeUniqueQuestions(collected, valid, count);
    console.log(`[DEBUG] Remaining valid: ${collected.length}`);
  }

  // If we still came up short, top-up using module-based fallback (still deduped)
  if (collected.length < count) {
    const missing = count - collected.length;
    console.log(`[DEBUG] Regenerating missing: ${missing} (fallback)`);
    const topUp = ensureQuestionQuality(
      generateFallbackQuestions({ topic, count: missing, difficulty, type, moduleContent }),
      type,
      0
    );
    const repaired = repairMcqOptionsFromContext(topUp, { topic, difficulty, moduleContext: moduleContent });
    collected = mergeUniqueQuestions(collected, filterAgainstExisting(repaired, collected), count);
  }

  // Final guarantee (never return fewer unless everything fails)
  collected = ensureExactCount(collected, { topic, count, difficulty, type, moduleContent });
  collected = repairMcqOptionsFromContext(collected, { topic, difficulty, moduleContext: moduleContent });
  console.log(`[DEBUG] Final count returned: ${collected.length}`);

  return collected;
}

/**
 * Preprocess module content to remove file metadata and corrupted data
 * CRITICAL: Removes ALL metadata, titles, non-content markers, and OCR artifacts
 * Targets: OCR garbage, file metadata, broken symbols, control characters
 * 
 * This function mirrors the cleanModuleText logic from aiQuestionGenerator to ensure
 * consistent cleaning across the pipeline.
 */
function preprocessModuleContent(content: string): string {
  let processed = content;

  // NEW FLOW: if content is already a structured knowledge context, keep structure.
  // The old word-filtering step is designed for corrupted PDF extractions and can
  // destroy clean bullet lists/headings.
  const isStructuredKnowledge =
    /\bTopics:\s*\n- /i.test(processed) ||
    /\bKey definitions:\s*\n- /i.test(processed) ||
    /\bHigh-quality excerpts\b/i.test(processed) ||
    /\[E\d+\s*\|\s*score=/i.test(processed);
  if (isStructuredKnowledge) {
    processed = stripPdfFontArtifacts(processed)
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
      .replace(/\b(endstream|endobj|stream|obj|xref|trailer|startxref|FlateDecode|Length)\b/gi, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return processed;
  }

  // PHASE 0: Initial normalization
  processed = processed
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ');

  // QUICK STRIP: remove the most common PDF/font artifacts early (before token filtering)
  // This directly targets the exact garbage the user reported: "Subtype BaseFont ... Identity-H ..."
  processed = stripPdfFontArtifacts(processed);

  // PHASE 1: Remove PDF operators and metadata
  processed = processed
    .replace(/\b(MediaBox|Contents|Filter|Resources|Font|ExtGState|ProcSet|ImageB|ImageC|ImageI|Type|Group|Transparency|DeviceRGB|Tabs|StructParents|GS\d+|F\d+|O\*|stream|endstream|obj|endobj|xref|trailer|startxref|FlateDecode|Length|Tf|Tj|TJ|ET|BT|RG|rg|re|gsave|grestore)\b/gi, ' ');

  // PHASE 2: Remove isolated characters and garbage
  processed = processed
    .replace(/\s[A-Z0-9]\s/g, ' ')
    .replace(/[A-Za-z][\`\"\'\$\@\#\^\&\*]/g, ' ')
    .replace(/[\`\"\'\$\@\#\^\&\*]+/g, ' ');

  // PHASE 3: AGGRESSIVE word filtering
  processed = processed
    .split(/\s+/)
    .filter(word => {
      if (!word || word.length === 0) return false;
      
      const vowelCount = (word.match(/[aeiouAEIOU]/g) || []).length;
      const wordLength = word.length;
      
      if (wordLength < 4) {
        const validShort = ['a', 'i', 'is', 'to', 'in', 'on', 'at', 'as', 'of', 'or', 'an', 'by', 'be', 'we', 'he', 'it', 'up', 'so', 'if', 'no', 'go', 'do', 'me', 'my', 'us', 'are', 'and', 'but', 'for', 'the', 'you', 'not', 'all'];
        if (validShort.includes(word.toLowerCase())) return true;
        // Allow common acronyms (AI, IoT, CPU, etc.) but reject random 1–2 char vowel soup.
        if (/^[A-Z]{2,5}$/.test(word)) return true;
        return false;
      }
      
      if (wordLength < 11) {
        return vowelCount >= 2;
      }
      
      return vowelCount >= 3;
    })
    .filter(word => {
      if (!/[a-zA-Z]/.test(word)) return false;
      
      const specialCharCount = (word.match(/[^a-zA-Z0-9\-\']/g) || []).length;
      if (specialCharCount > word.length * 0.3) return false;
      
      const pdfKeywords = ['type', 'resources', 'font', 'extgstate', 'procset', 'mediabox', 'contents', 'group', 'transparency', 'devicergb', 'tabs', 'structparents', 'filter', 'length'];
      if (pdfKeywords.includes(word.toLowerCase())) return false;
      
      return true;
    })
    .join(' ');

  // PHASE 4: Remove metadata
  processed = processed
    .replace(/\b(file|filename|title|name|created|modified|author|document|page):\s*[^\n]*/gi, '')
    .replace(/Un-named\s+(Microsoft|Word|Document).*?(?=\n|$)/gi, '')
    .replace(/[A-Z]:[\\\/][\w\-\\\/]*/gi, '')
    .replace(/\[?\s*(Section|Chapter|Lesson|Unit|Module|Page|Appendix|Table of Contents)\s+[\d\w]+\s*\]?/gi, '')
    .replace(/^---+\s*(File|Chapter|Lesson|Unit|Module|Page).*?(?=\n|$)/gm, '')
    .replace(/^(Extracted from|From file|File:|Source).*?(?=\n|$)/gm, '');

  // PHASE 5: Line-by-line filtering
  const lines = processed.split('\n');
  const cleanLines = lines
    .map(line => line.trim())
    .filter(line => {
      if (!line || line.length === 0) return false;
      if (/^[A-Z]:\d{4}/.test(line)) return false;
      if (/^Page\s*\d+/i.test(line)) return false;
      if (/^\d+\s*$/.test(line)) return false;
      if (/^[%&^$*\-_\s`"';:?/<>|\\]{3,}$/.test(line)) return false;
      
      if (line.length < 15) {
        const charCount = (line.match(/[%&^$*\-_`"';:?/<>|\\]/g) || []).length;
        if (charCount > line.length * 0.3) return false;
      }
      
      if (/^[a-z]\s+[a-z](\s+[a-z])+$/i.test(line)) return false;
      
      const symbolCount = (line.match(/[%&^$*<>[\]{}()]/g) || []).length;
      if (symbolCount > line.length * 0.2) return false;
      
      if (line.length < 8 && !/[aeiouAEIOU0-9]/i.test(line)) return false;
      
      const vowelCount = (line.match(/[aeiouAEIOU]/g) || []).length;
      if (vowelCount < line.length * 0.1) return false;
      
      return true;
    });

  processed = cleanLines.join('\n');

  // PHASE 6: Final cleanup
  processed = processed
    .replace(/\n\n\n+/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();

  // PHASE 7: Validate
  if (!processed || processed.length < 50) {
    console.warn('[PreprocessContent] Warning: Content too short after cleaning', processed.length, 'chars');
  } else {
    const reductionPct = Math.round((1 - processed.length / content.length) * 100);
    console.log(`[PreprocessContent] ✓ Cleaned: ${content.length} → ${processed.length} chars (${reductionPct}% removed)`);
  }

  return processed;
}

/**
 * Generate questions from a topic using AI.
 * Falls back to template-based generation if AI is unavailable.
 */
export async function generateQuestionsFromTopic(
  topic: string,
  count: number,
  difficulty: QuestionDifficulty,
  type: 'multiple-choice' | 'true-false' | 'identification' = 'multiple-choice'
): Promise<Question[]> {
  return generateAIQuestions({
    topic,
    count,
    difficulty,
    type,
  });
}

/**
 * Generate questions from module content
 * Extracts content from uploaded files and generates real questions
 * Falls back to Firestore subcollection if module.items is empty
 */
export async function generateQuestionsFromModuleContent(
  module: CourseModule,
  count: number,
  difficulty: QuestionDifficulty = 'medium',
  type: 'multiple-choice' | 'true-false' | 'identification' = 'multiple-choice',
  courseId?: string
): Promise<Question[]> {
  try {
    console.log(`[QuestionGen] ═══════════════════════════════════════`);
    console.log(`[QuestionGen] Starting question generation from module: ${module.title}`);
    console.log(`[QuestionGen] Module has ${module.items?.length || 0} items`);
    console.log(`[DEBUG] Requested count: ${count}`);
    
    // Combine all file content from module items with detailed logging
    let rawContent = '';
    const itemContents: { fileName: string; length: number; preview: string }[] = [];
    
    // Try to get content from module.items first
    if (module.items && module.items.length > 0) {
      rawContent = module.items
        .map((item, index) => {
          const contentLength = item.fileContent?.trim().length || 0;
          const preview = item.fileContent?.substring(0, 100) || '';
          console.log(
            `[QuestionGen] Item ${index + 1}/${module.items!.length} (${item.fileName}): ${contentLength} chars`
          );
          if (contentLength > 0) {
            console.log(
              `[QuestionGen]   Preview: ${preview}...`
            );
            itemContents.push({ fileName: item.fileName || 'Unknown', length: contentLength, preview });
          }
          if (!item.fileContent) return '';
          return item.fileContent;
        })
        .filter(Boolean)
        .join('\n\n');
    }
    
    // Fallback: if no content in module.items and courseId provided, try Firestore
    if (!rawContent.trim() && courseId) {
      console.log(`[QuestionGen] Module items empty, attempting to fetch from Firestore subcollection...`);
      try {
        rawContent = await getModuleContent(courseId, module.id);
        if (rawContent.trim()) {
          console.log(`[QuestionGen] ✓ Retrieved ${rawContent.length} chars from Firestore subcollection`);
        }
      } catch (firestoreError) {
        console.warn(`[QuestionGen] Failed to fetch from Firestore:`, firestoreError);
      }
    }

    console.log(`[QuestionGen] Combined content length: ${rawContent.length} chars`);
    console.log(`[AI] Raw extracted length: ${rawContent.length}`);
    if (itemContents.length > 0) {
      console.log(`[QuestionGen] Content sources:`);
      itemContents.forEach((ic) => {
        console.log(`[QuestionGen]   - ${ic.fileName}: ${ic.length} chars`);
      });
    }

    if (!rawContent.trim()) {
      // Fallback if no content extracted
      console.warn(
        '[QuestionGen] ✗ No extractable content in module, using fallback generation'
      );
      return ensureExactCount(
        generateFallbackQuestions({
          topic: module.title,
          count,
          difficulty,
          type,
        }),
        { topic: module.title, count, difficulty, type }
      );
    }

    // Preprocess content to remove file metadata and encoding artifacts
    const cleanedContent = preprocessModuleContent(rawContent);
    console.log(`[AI] Cleaned length: ${cleanedContent.length}`);
    const reductionPct = Math.round((1 - cleanedContent.length / rawContent.length) * 100);
    console.log(
      `[QuestionGen] Content cleaning: ${rawContent.length} → ${cleanedContent.length} chars (${reductionPct}% removed)`
    );
    console.log(
      `[QuestionGen] Content preview (cleaned): ${cleanedContent.substring(0, 300)}...`
    );

    // NEW: content quality gate — if the cleaned text still looks like PDF/font metadata or random noise,
    // DO NOT feed it into the AI (it causes the exact garbage question stems seen by the user).
    const quality = assessContentQuality(cleanedContent);
    console.log(`[QuestionGen] Content quality score: ${quality.score.toFixed(2)} (${quality.readable ? 'readable' : 'NOT readable'})`);
    if (!quality.readable) {
      // IMPORTANT:
      // Even if our heuristic says "not readable", we should still pass the cleaned content
      // into the fallback generator. The fallback path can:
      //  - detect structured knowledge context and build questions from it, OR
      //  - decide to fall back to templates if the content is truly corrupted.
      //
      // The previous behavior dropped moduleContent entirely, which caused the UI to show
      // generic hard-coded questions like "_____ is related to <Module Title>".
      console.warn('[QuestionGen] ✗ Content failed readability checks; routing to fallback WITH module content');
      console.warn(`[QuestionGen]   Reasons: ${quality.reasons.join(', ')}`);
      const topic = module.displayName || module.title || 'Module';
      return ensureExactCount(
        generateFallbackQuestions({
          topic,
          count,
          difficulty,
          type,
          moduleContent: cleanedContent || rawContent,
        }),
        { topic, count, difficulty, type, moduleContent: cleanedContent || rawContent }
      );
    }
    
    if (!cleanedContent.trim()) {
      // If preprocessing removed all content, use fallback
      console.warn(
        '[QuestionGen] ✗ Module content appears to be metadata-only, using fallback generation'
      );
      const topic = module.displayName || module.title || 'Module';
      return ensureExactCount(
        generateFallbackQuestions({
          topic,
          count,
          difficulty,
          type,
          moduleContent: rawContent,
        }),
        { topic, count, difficulty, type, moduleContent: rawContent }
      );
    }

    // Use just the module title as topic (not "content" suffix),
    // but guard against bad titles like "1" (common when a week number leaks into title).
    const rawTopic = module.displayName || module.title || 'Module';

    // ADVANCED FLOW:
    // Analyze the module into structured knowledge (topics, definitions, key concepts, excerpts),
    // and send ONLY that structured knowledge to the AI (not raw extracted text).
    const { knowledge } = analyzeModuleKnowledge(cleanedContent);
    const topic = deriveTopicName(rawTopic, knowledge);
    if (topic !== rawTopic) console.log(`[AI] Topic normalized: "${rawTopic}" -> "${topic}"`);
    console.log(
      `[DEBUG] Knowledge stats: keptChunks=${knowledge.stats.keptChunks}, rejectedChunks=${knowledge.stats.rejectedChunks}, topics=${knowledge.topics.length}, defs=${knowledge.definitions.length}, concepts=${knowledge.keyConcepts.length}`
    );

    console.log(`[AI] Topics extracted (${knowledge.topics.length}):`, knowledge.topics.slice(0, 8));
    console.log(`[AI] Concepts extracted (${knowledge.keyConcepts.length}):`, knowledge.keyConcepts.slice(0, 10));
    console.log(`[AI] Definitions extracted (${knowledge.definitions.length})`);

    // Keep context compact (prevents truncated JSON). This is the PROFESSIONAL LMS fix:
    // send a structured summary, not raw PDF text.
    const compactKnowledge: ModuleKnowledge = { ...knowledge, chunks: (knowledge.chunks || []).slice(0, 6) };
    const knowledgeContext = buildCompactKnowledgeContextForAI(compactKnowledge, {
      // Larger requested exams need smaller per-request context to avoid truncation.
      maxChars: count >= 20 ? 5500 : 7000,
      maxExcerpts: count >= 20 ? 1 : 2,
      maxDefinitions: 10,
      maxConcepts: 10,
      maxTopics: 10,
      maxTerms: 10,
    });
    const targets = buildQuestionTargetsText(knowledge, count, type);
    const moduleContextForAI = `${knowledgeContext}\n${targets}`.trim();
    console.log(`[DEBUG] Module context chars (for AI): ${moduleContextForAI.length}`);

    console.log(`[QuestionGen] ✓ Sending to AI generator`);
    console.log(`[QuestionGen]   Topic: ${topic}`);
    console.log(
      `[QuestionGen]   Content for AI: ${cleanedContent.substring(0, 15000).length} chars`
    );
    console.log(`[QuestionGen]   Difficulty: ${difficulty}, Type: ${type}, Count: ${count}`);

    // NEW: retry until we reach EXACT requested count (dedupe/validation safe)
    const finalized = await generateToExactCountWithRetries({
      topic,
      count,
      difficulty,
      type,
      moduleContent: moduleContextForAI,
    });

    console.log(`[QuestionGen] ✓ Successfully generated ${finalized.length} high-quality questions`);
    console.log(`[QuestionGen] ═══════════════════════════════════════`);
    return finalized;
  } catch (error) {
    console.error('[QuestionGen] ✗ Error generating questions from module content:', error);
    console.log(`[QuestionGen] ═══════════════════════════════════════`);
    // Fallback to basic generation
    return ensureExactCount(
      generateFallbackQuestions({
        topic: module.title,
        count,
        difficulty,
        type,
      }),
      { topic: module.title, count, difficulty, type }
    );
  }
}

/**
 * Build clean context from modules: filters to readable text without metadata/OCR noise
 */
function buildCleanContext(modules: CourseModule[]): string {
  return modules
    .flatMap(m => m.items || [])
    .map(i => (i.fileContent || "").trim())
    .filter(text => text.length > 100)
    .map(text => text.substring(0, 1500))
    .join("\n\n");
}

/**
 * Generate questions from multiple modules by concatenating their content.
 */
export async function generateQuestionsFromModulesContent(
  modules: CourseModule[],
  count: number,
  difficulty: QuestionDifficulty = 'medium',
  type: 'multiple-choice' | 'true-false' | 'identification' = 'multiple-choice'
): Promise<Question[]> {
  try {
    // Use safe context builder for clean, limited readable text
    const content = buildCleanContext(modules);

    const topic = modules.map((m) => m.displayName || m.title).join(' + ');
    if (!content.trim()) {
      return generateFallbackQuestions({ topic, count, difficulty, type });
    }

    // Preprocess to remove any remaining corrupted data
    const cleanedContent = preprocessModuleContent(content);
    const quality = assessContentQuality(cleanedContent);
    if (!quality.readable) {
      console.warn('[QuestionGen] Multi-module content failed readability checks, using fallback');
      return generateFallbackQuestions({ topic, count, difficulty, type });
    }
    
    return generateAIQuestions({
      topic,
      count,
      difficulty,
      type,
      moduleContent: cleanedContent,
    });
  } catch (error) {
    console.error('Error generating questions from multiple modules:', error);
    return generateFallbackQuestions({ topic: modules[0]?.title || 'Module', count, difficulty, type });
  }
}

function moduleKeywords(mod: CourseModule): string[] {
  const words = new Set<string>();
  words.add(mod.title.trim());
  words.add(mod.displayName?.trim() || '');
  for (const item of mod.items || []) {
    if (item.title?.trim()) words.add(item.title.trim());
    if (item.fileName?.trim()) {
      words.add(item.fileName.replace(/\.[^.]+$/, '').trim());
    }
  }
  return [...words].filter(Boolean);
}

/** 
 * Build questions tied to a course module (DEPRECATED - use generateQuestionsFromModuleContent)
 * This function is kept for backward compatibility.
 * Falls back to generic question generation based on module title when content is unavailable.
 */
export function generateQuestionsFromModule(
  mod: CourseModule,
  count = 10
): Question[] {
  console.warn(
    'generateQuestionsFromModule is deprecated. Use generateQuestionsFromModuleContent instead for real content-based generation.'
  );
  
  // Fallback: generate generic questions from module title
  // This is only used when no file content is available
  return generateFallbackQuestions({
    topic: mod.displayName || mod.title || 'Module',
    count,
    difficulty: 'medium',
    type: 'multiple-choice',
  });
}

export function resolveAssessmentQuestionBank(
  questionItems: Question[] | undefined,
  fallbackCount: number
): Question[] {
  if (questionItems && questionItems.length > 0) {
    return questionItems.map((q, i) => ({ ...q, id: q.id ?? i + 1 }));
  }
  return examQuestions.slice(0, Math.max(fallbackCount, 1));
}
