import type { Question } from '@/types';
import type { QuestionDifficulty } from '@/context/SessionContext';
import { fetchTopicContext } from './webSearch';
import { assessContentQuality, stripPdfFontArtifacts } from './contentQuality';
import { generateCompleteOptions } from './choiceGenerator';

export type QuestionType = 'multiple-choice' | 'true-false' | 'identification';

export interface AIGenerationParams {
  topic: string;
  count: number;
  difficulty: QuestionDifficulty;
  type: QuestionType;
  context?: string;
  moduleContent?: string;
}

/**
 * Generates realistic questions using Claude API with web search context or module content
 * Requires VITE_CLAUDE_API_KEY environment variable
 */
export async function generateAIQuestions(
  params: AIGenerationParams
): Promise<Question[]> {
  const { topic, count, difficulty, type, moduleContent } = params;

  console.log('[AI] Starting question generation');
  console.log(`[AI] Topic: ${topic}`);
  console.log(`[AI] Count: ${count}, Difficulty: ${difficulty}, Type: ${type}`);
  console.log(`[AI] Module content available: ${!!moduleContent}`);
  if (moduleContent) {
    console.log(`[AI] Module content (raw): ${moduleContent.length} chars`);
    const cleanedContent = cleanModuleText(moduleContent);
    console.log(`[AI] Module content (cleaned): ${cleanedContent.length} chars`);
    console.log(`[AI] Reduction: ${Math.round((1 - cleanedContent.length / moduleContent.length) * 100)}%`);
    console.log(
      `[AI] Content preview (cleaned): ${cleanedContent.substring(0, 300)}...`
    );
  }

  if (!topic.trim()) {
    throw new Error('Topic is required');
  }

  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
  if (!apiKey) {
    console.warn('[AI] VITE_CLAUDE_API_KEY not configured, using fallback generation');
    return generateFallbackQuestions(params);
  }

  try {
    // Use module content if available, otherwise fetch web context
    let context = params.context || '';
    if (moduleContent && moduleContent.trim()) {
      const rawLength = moduleContent.length;
      context = cleanModuleText(moduleContent);
      const cleanedLength = context.length;
      console.log(`[AI] ✓ Using CLEANED module content: ${rawLength} → ${cleanedLength} chars (${Math.round((1 - cleanedLength / rawLength) * 100)}% reduction)`);
    } else if (!context.trim()) {
      console.log('[AI] Fetching web context for topic...');
      context = await fetchTopicContext(topic);
      console.log(`[AI] Web context retrieved: ${context.length} chars`);
    }

    console.log(`[AI] Building prompt with context length: ${context.length} chars`);
    const prompt = buildPrompt(topic, count, difficulty, type, context);
    console.log(`[AI] Prompt built, length: ${prompt.length} chars`);

    // Prevent "stuck generating" UI when the API hangs:
    // add an explicit timeout and abort the request.
    const controller = new AbortController();
    const timeoutMs = 60_000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4000,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const error = await response.json();
      console.error('[AI] Claude API error:', error);
      return generateFallbackQuestions(params);
    }

    const data = await response.json();
    const content = data.content[0]?.text || '';

    console.log(`[AI] API response received: ${content.length} chars`);
    console.log(`[DEBUG] AI raw response preview: ${content.substring(0, 250)}...`);
    let questions = parseAIResponse(content, topic, difficulty, type);
    console.log(`[DEBUG] Parsed successfully: ${questions.length}`);
    
    // Deduplicate questions
    questions = deduplicateQuestions(questions);
    console.log(`[DEBUG] After deduplication: ${questions.length} unique questions`);
    
    return questions.slice(0, count);
  } catch (error) {
    console.error('[AI] Error generating questions with AI:', error);
    return generateFallbackQuestions(params);
  }
}

function buildPrompt(
  topic: string,
  count: number,
  difficulty: QuestionDifficulty,
  type: QuestionType,
  context: string = ''
): string {
  const difficultyDescriptions = {
    easy: 'foundational and introductory, testing basic concepts and definitions. Students should be able to answer by recalling key facts or definitions directly from the material.',
    medium: 'intermediate, testing understanding and application of concepts. Students should understand how concepts relate and be able to apply them in different contexts.',
    hard: 'advanced and challenging, testing analysis, synthesis, and critical thinking. Students should analyze information, compare concepts, draw conclusions, and explain complex relationships.',
  };

  const typeInstructions = {
    'multiple-choice': `Each question MUST have exactly 4 options: 1 correct answer and 3 realistic distractors that are plausible but clearly incorrect. All options must be grammatically correct and directly related to the topic. Distractors should be academically valid alternatives (common misconceptions, related concepts, or partially correct ideas). IMPORTANT: Do NOT use generic placeholders like "A related concept" or "Another option" - every distractor must be specific, concrete, and rooted in actual academic knowledge. Do NOT leave options blank or incomplete.`,
    'true-false': `Each question should be a clear statement that is definitively either true or false based on the provided material. Statements should be natural and avoid obvious trick questions. Include a brief explanation of why the statement is true or false.`,
    identification: `Each question should be a fill-in-the-blank format where students identify or complete a term, concept, or phrase. The blank should represent a key concept from the material. Blanks should not be overly obvious or trivial.`,
  };

  const isModuleContent = context.includes('\n') && context.length > 200;

  let contextSection = '';
  if (context) {
    contextSection = `\nCOURSE MATERIAL TO BASE QUESTIONS ON:
---
${context}
---

CRITICAL INSTRUCTIONS FOR MODULE-BASED QUESTIONS:
- Base ALL questions EXCLUSIVELY on the provided material above
- Extract real concepts, facts, definitions, and examples from the material
- Ignore any leftover encoding artifacts or corrupted text. Focus only on readable academic sentences.
- NEVER reference filenames, file paths, file extensions, or metadata (e.g., never say "Based on module...", "From the PDF...", etc.)
- NEVER include content like "[Section 1]", file markers, or technical metadata in questions
- NEVER generate blank or empty options
- ONLY use information that actually appears in the provided material
- If the material contains specific terminology, industry terms, or examples, use them naturally in questions
- Make questions sound natural and academic, not like they're derived from a document
- Each question should be independently understandable without reference to the source material
- Questions should read like they come from a real textbook or course, not like AI templates

WHAT SCHOOL-GRADE QUESTIONS LOOK LIKE:
- Questions reference specific concepts, principles, theories, or terms from the material
- Options are concrete and substantive (e.g., "The First Law of Thermodynamics", not "A thermodynamic principle")
- Questions use varied phrasing: "Which...", "What...", "How...", "Why...", "When...", "According to..."
- Questions test actual understanding, not just memorization of trivial facts
- Questions are grounded in real academic content, not generic templates

DISTRACTOR GENERATION REQUIREMENTS FOR MULTIPLE-CHOICE:
- Distractors should be realistic alternatives, not obviously wrong
- Include common misconceptions students might have
- Include related but different concepts from the field
- Each distractor must be complete, grammatically correct, substantive text (20+ chars)
- Distractors must be plausible enough that students must understand the material to identify the correct answer
- Do NOT include empty options, placeholders, or generic text like "A related concept"
- All options (including distractors) must be concrete, specific, and rooted in academic knowledge
- Distractors should be actual concepts/terms/ideas, not meta-commentary about concepts
`;
  }

  return `You are an expert educational assessment specialist creating rigorous academic questions that look and feel like real school/university exam questions. Generate exactly ${count} high-quality, academically rigorous ${type} questions${isModuleContent ? ' based on course material' : ''}.${contextSection}

DIFFICULTY LEVEL: ${difficulty}
Questions should be ${difficultyDescriptions[difficulty]}

FORMAT REQUIREMENTS:
${typeInstructions[type]}

QUESTION VARIETY AND STRUCTURE REQUIREMENTS:
- Generate questions with DIVERSE structures and phrasings - DO NOT repeat the same question pattern
- Mix comprehension, application, and analysis questions appropriately for difficulty level
- Each question MUST test a DISTINCT concept or skill - absolutely NO duplicates or near-duplicates
- Vary which concepts are asked about - do NOT ask about the same material multiple times
- Use different question types within the format (e.g., "Which...", "What...", "How...", "Why..." for different questions)
- For multiple-choice: vary the position of correct answers across A/B/C/D positions
- Avoid repetitive phrasings like "Which of the following" in every question - use natural variety
- Each question should explore different aspects or applications of the topic

QUALITY STANDARDS FOR CONTENT-BASED QUESTIONS:
- Questions must be clear, unambiguous, and natural-sounding like real exam questions
- Language must be appropriate for the ${difficulty} difficulty level
- Questions must be answerable using ONLY the provided material
- Avoid trick questions, questions with multiple valid answers, or questions requiring outside knowledge
- Ensure variety in cognitive levels (comprehension, application, analysis when appropriate)
- For multiple-choice: options must all be realistic and credible (not obviously wrong)
- Distractors should represent common misconceptions or related concepts
- The correct answer must be clearly and objectively correct based on the material

CRITICAL VALIDATION REQUIREMENTS:
- EVERY option in multiple choice MUST be non-empty, grammatically correct, complete text (20+ characters)
- NO placeholder text, blanks, abbreviated text, or generic filler like "Option 1"
- NO options that are filenames, file types, metadata references, or code snippets
- NO generic distractor patterns like "Incorrect application of X", "Partial understanding of Y", "Misconception about Z"
- ALL options MUST be realistic, specific, and academically credible alternatives
- ALL options MUST be related to the topic/material and appropriate for the difficulty level
- The correct answer MUST be clearly distinguishable from distractors based on material
- Distractors must be plausible and academically valid but factually incorrect per the material
- Each question MUST test a DISTINCT concept, skill, or piece of knowledge
- Explanations must clearly reference specific material concepts or definitions
- VERIFY: No two questions ask about the same concept in the same way

RESPONSE FORMAT - Return ONLY a valid JSON array with NO additional text or markdown:

For multiple-choice and identification:
[
  {
    "question": "Natural question text here",
    "options": ["Real option with content", "Real option with content", "Real option with content", "Real option with content"],
    "correctAnswer": "The exact option text that is correct",
    "explanation": "Clear explanation of why this is correct based on the material"
  }
]

For true-false:
[
  {
    "question": "Natural statement that is true or false",
    "correctAnswer": "True" or "False",
    "explanation": "Explanation of why the statement is true or false based on the material"
  }
]

STRICT REQUIREMENTS:
- Return ONLY valid JSON array - no markdown, no code blocks, no preamble, no extra text
- Ensure ALL fields are populated with valid, non-empty content
- For multiple-choice: MUST have exactly 4 items in options array (all complete, non-empty)
- Verify correctAnswer EXACTLY matches one of the option strings
- Do not include any numbers or bullet points before questions
- Absolutely NO duplicate or near-duplicate questions - each question must be unique`;
}

function parseAIResponse(
  content: string,
  topic: string,
  difficulty: QuestionDifficulty,
  type: QuestionType
): Question[] {
  try {
    console.log(`[DEBUG] Raw AI text chars: ${content?.length || 0}`);
    // Clean up content (remove markdown code blocks if present)
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.slice(7);
    }
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.slice(3);
    }
    if (cleanContent.endsWith('```')) {
      cleanContent = cleanContent.slice(0, -3);
    }
    cleanContent = cleanContent.trim();

    const parsed = JSON.parse(cleanContent);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    console.log(`[DEBUG] JSON parsed items: ${items.length}`);

    const mapped = items
      .map((item: any, index: number) => {
        const baseQuestion: Question = {
          id: index + 1,
          question: item.question || item.stem || '',
          correctAnswer: item.correctAnswer || item.answer || '',
          difficulty,
          type,
          topic,
          explanation: item.explanation || undefined,
        };

        // Add options for multiple choice
        if (type === 'multiple-choice' && item.options) {
          // Filter out empty or invalid options
          const validOptions = item.options
            .filter((opt: any) => {
              const optStr = String(opt || '').trim();
              // Reject empty, placeholder, or metadata
              return (
                optStr.length > 0 &&
                !optStr.match(/^[\s\-_.,]*$/) && // not just punctuation
                !optStr.match(/^\[.*\]$/i) && // not like [option]
                !optStr.match(/^(file|chapter|lesson|unit|module|section|pdf|docx|pptx|txt)/i) && // not metadata
                optStr.length < 500 // reasonable length
              );
            })
            .map((opt: any) => String(opt || '').trim());

          // Only include if we have valid options
          if (validOptions.length >= 4) {
            baseQuestion.options = validOptions.slice(0, 4);
          } else if (validOptions.length > 0) {
            // If fewer than 4, still include what we have (better than nothing)
            baseQuestion.options = validOptions;
          }
        } else if (type === 'true-false') {
          baseQuestion.options = ['True', 'False'];
        } else if (type === 'identification') {
          // Identification questions might not have options
          baseQuestion.options = [];
        }

        return baseQuestion;
      })
      .filter((q) => {
        // Filter out invalid questions
        if (!q.question || q.question.trim().length === 0) return false;
        if (!q.correctAnswer || q.correctAnswer.toString().trim().length === 0) return false;

        // IMPORTANT:
        // Do NOT drop MCQ items just because the model's correctAnswer doesn't exactly match one option.
        // We can recover later in ensureQuestionQuality()/cleanMultipleChoiceOptions() by:
        // - selecting a corrected answer from options, and/or
        // - padding/repairing options to 4.
        // Dropping here is what causes "Requested 10, got 7/8" failures.

        // Filter out questions that look like metadata
        if (q.question.match(/^(file|chapter|lesson|unit|module|section)/i)) return false;
        if (q.question.includes('.pdf') || q.question.includes('.docx')) return false;

        return true;
      });
    
    console.log(`[DEBUG] After parseAIResponse basic filter: ${mapped.length}`);
    return mapped;
  } catch (error) {
    console.error('Error parsing AI response:', error, 'Raw content:', content);
    return [];
  }
}

/**
 * Calculate string similarity using Jaccard similarity coefficient
 * Returns value 0-1 where 1 is identical and 0 is completely different
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  
  const words1 = new Set(normalize(str1));
  const words2 = new Set(normalize(str2));
  
  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return intersection / union;
}

/**
 * Check if two questions are duplicates or near-duplicates
 * Returns true if similarity exceeds threshold
 */
function areQuestionsDuplicates(q1: Question, q2: Question, threshold: number = 0.65): boolean {
  // Compare questions
  const questionSimilarity = calculateStringSimilarity(q1.question, q2.question);
  
  // Compare correct answers
  const answerSimilarity = calculateStringSimilarity(
    q1.correctAnswer?.toString() || '',
    q2.correctAnswer?.toString() || ''
  );
  
  // If questions are very similar (>65%) and answers are also similar, it's a duplicate
  if (questionSimilarity > threshold && answerSimilarity > 0.5) {
    return true;
  }
  
  // If answers are nearly identical and questions are moderately similar, it's a duplicate
  if (answerSimilarity > 0.8 && questionSimilarity > 0.4) {
    return true;
  }
  
  return false;
}

/**
 * Remove duplicate and near-duplicate questions from the list
 * Keeps the first occurrence of duplicate questions
 */
function deduplicateQuestions(questions: Question[]): Question[] {
  const deduplicated: Question[] = [];
  const filtered: number[] = [];
  
  for (let i = 0; i < questions.length; i++) {
    let isDuplicate = false;
    
    // Check against all previously kept questions
    for (const kept of deduplicated) {
      if (areQuestionsDuplicates(questions[i], kept)) {
        isDuplicate = true;
        filtered.push(i);
        console.log(`[Dedup] Question ${i + 1} is duplicate of earlier question, filtering out`);
        break;
      }
    }
    
    if (!isDuplicate) {
      deduplicated.push(questions[i]);
    }
  }
  
  if (filtered.length > 0) {
    console.log(`[Dedup] ✓ Removed ${filtered.length} duplicate/near-duplicate questions`);
  }
  
  return deduplicated;
}

/**
 * Fallback question generator when API is unavailable
 */
export function generateFallbackQuestions(
  params: AIGenerationParams
): Question[] {
  const { topic, count, difficulty, type, moduleContent } = params;

  // If module content is available, build questions directly from text rather than generic placeholders.
  if (moduleContent && moduleContent.trim().length > 100) {
    console.log('[Fallback] Module content available, generating from extracted statements');
    const stripped = stripPdfFontArtifacts(moduleContent);

    const isStructuredKnowledge =
      /\bTopics:\s*\n- /i.test(stripped) ||
      /\bKey definitions:\s*\n- /i.test(stripped) ||
      /\bLearning objectives:\s*\n- /i.test(stripped) ||
      /\bHigh-quality excerpts\b/i.test(stripped) ||
      /\[E\d+\s*\|\s*score=/i.test(stripped);

    // If we have STRUCTURED knowledge context, generate school-like questions from it
    // instead of sentence heuristics.
    if (isStructuredKnowledge) {
      const knowledgeQuestions = generateFromStructuredKnowledgeContext(
        topic,
        count,
        difficulty,
        type,
        stripped
      );
      if (knowledgeQuestions.length > 0) {
        console.log(`[Fallback] ✓ Generated ${knowledgeQuestions.length} questions from structured knowledge context`);
        return knowledgeQuestions.slice(0, count);
      }
    }

    const quality = assessContentQuality(stripped);
    console.log(`[Fallback] Content quality score: ${quality.score.toFixed(2)} (${quality.readable ? 'readable' : 'NOT readable'})`);

    // If content looks corrupted/metadata-only, do NOT generate "statement-based" questions (this creates gibberish).
    if (!quality.readable) {
      console.warn('[Fallback] Content not readable; falling back to topic-based templates instead of using corrupted text');
      return generateFallbackQuestions({ topic, count, difficulty, type }); // recursion enters generic branch below
    }

    console.log(`[Fallback] Content length: ${stripped.length} chars`);
    console.log(`[Fallback] Content preview: ${stripped.substring(0, 150)}...`);

    const content = stripped.replace(/\s+/g, ' ').trim();
    // IMPORTANT: do NOT cap statements to `count` here.
    // If we cap too early, we end up recycling only a few statements and producing repeated questions.
    let statements = extractStatements(content);

    // If statements are still too few, create additional candidates from paragraph windows.
    if (statements.length < Math.max(12, Math.floor(count * 0.6))) {
      const paras = stripped
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter((p) => p.length > 120);
      const extra: string[] = [];
      for (const p of paras) {
        // Create rolling windows so we get more unique "excerpts"
        for (let i = 0; i < p.length; i += 180) {
          const win = p.slice(i, i + 240).trim();
          if (win.length >= 80) extra.push(win);
          if (extra.length >= 120) break;
        }
        if (extra.length >= 120) break;
      }
      statements = [...statements, ...extra];
      // De-dup
      const seen = new Set<string>();
      statements = statements.filter((s) => {
        const k = s.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    console.log(`[Fallback] Extracted ${statements.length} usable statements from content`);
    if (statements.length === 0) {
      console.warn('[Fallback] No usable statements found; falling back to topic-based templates');
      return generateFallbackQuestions({ topic, count, difficulty, type }); // recursion enters generic branch below
    }
    
    const questions: Question[] = [];

    for (let i = 0; i < count; i++) {
      const statement = statements[i % statements.length] || statements[0] || content.slice(0, 120);
      if (type === 'true-false') {
        questions.push(buildTrueFalseQuestion(i + 1, topic, statement, difficulty));
      } else if (type === 'identification') {
        questions.push(buildIdentificationQuestion(i + 1, topic, statement, difficulty));
      } else {
        questions.push(buildMultipleChoiceQuestion(i + 1, topic, statement, difficulty));
      }
    }

    console.log(`[Fallback] ✓ Generated ${questions.length} questions from module content`);

    // Dedupe. If dedupe collapses too much, top-up from later excerpts.
    const deduped = deduplicateQuestions(questions);
    if (deduped.length >= count) return deduped.slice(0, count);

    const topUp: Question[] = [];
    const start = Math.min(
      statements.length - 1,
      Math.max(0, Math.floor(statements.length / 3))
    );
    for (let j = 0; j < count * 2 && deduped.length + topUp.length < count; j++) {
      const idx = (start + j) % statements.length;
      const st = statements[idx] || statements[0];
      if (type === 'true-false') topUp.push(buildTrueFalseQuestion(10_000 + j, topic, st, difficulty));
      else if (type === 'identification') topUp.push(buildIdentificationQuestion(10_000 + j, topic, st, difficulty));
      else topUp.push(buildMultipleChoiceQuestion(10_000 + j, topic, st, difficulty));
    }

    return deduplicateQuestions([...deduped, ...topUp]).slice(0, count);
  }

  // No module content - use generic templates
  console.warn('[Fallback] ⚠️ No module content available, using generic template questions');
  const { topic: baseTopic, count: baseCount, difficulty: baseDifficulty, type: baseType } = params;
  const questions: Question[] = [];
  const questionTemplates = getTemplatesForType(baseType);

  for (let i = 0; i < baseCount; i++) {
    const template = questionTemplates[i % questionTemplates.length];
    const question = fillTemplate(template, baseTopic, baseDifficulty, baseType, i + 1);
    questions.push(question);
  }

  console.log(`[Fallback] Generated ${questions.length} generic template questions`);
  return questions;
}

function parseBullets(sectionLabel: string, text: string): string[] {
  const re = new RegExp(`${sectionLabel}:\\s*\\n([\\s\\S]*?)(\\n\\n|$)`, 'i');
  const m = text.match(re);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*-\s+/, '').trim())
    .filter(Boolean);
}

function parseDefinitions(text: string): Array<{ term: string; definition: string }> {
  const re = /Key definitions:\s*\n([\s\S]*?)(\n\n|$)/i;
  const m = text.match(re);
  if (!m) return [];
  const lines = m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*-\s+/, '').trim())
    .filter(Boolean);
  const defs: Array<{ term: string; definition: string }> = [];
  for (const line of lines) {
    const parts = line.split(':');
    if (parts.length < 2) continue;
    const term = parts.shift()!.trim();
    const definition = parts.join(':').trim();
    if (term.length >= 2 && definition.length >= 10) defs.push({ term, definition });
  }
  return defs;
}

function parseExcerpts(knowledgeContext: string): string[] {
  // Excerpts look like: [E12 | score=0.82] Some text...
  const re =
    /\[E\d+\s*\|\s*score=[0-9.]+\]\s+([\s\S]*?)(?=\n\[E\d+\s*\|\s*score=|\n\n|$)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(knowledgeContext)) !== null) {
    const t = (m[1] || '').replace(/\s+/g, ' ').trim();
    if (t.length >= 60) out.push(t);
  }
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = e.toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function generateFromStructuredKnowledgeContext(
  topic: string,
  count: number,
  difficulty: QuestionDifficulty,
  type: QuestionType,
  knowledgeContext: string
): Question[] {
  const defs = parseDefinitions(knowledgeContext);
  const concepts = parseBullets('Key concepts', knowledgeContext);
  const objectives = parseBullets('Learning objectives', knowledgeContext);
  const terms = parseBullets('Important terms', knowledgeContext);
  const topics = parseBullets('Topics', knowledgeContext);
  const excerpts = parseExcerpts(knowledgeContext);

  const pool = [...new Set([...terms, ...concepts, ...topics])].filter(Boolean);
  const questions: Question[] = [];

  const pickDistractors = (correct: string): string[] => {
    const alt = pool.filter((p) => p !== correct).slice(0, 12);
    const out = alt.sort(() => Math.random() - 0.5).slice(0, 3);
    while (out.length < 3) out.push(`Plausible alternative ${out.length + 1}`);
    return out;
  };

  for (let i = 0; i < count; i++) {
    // Rotate styles for variety
    const style = i % 4;

    if (type === 'true-false') {
      const src = defs[i % Math.max(defs.length, 1)];
      const statement = src
        ? `${src.term} refers to ${src.definition.replace(/\.$/, '')}.`
        : `${topic} includes multiple related concepts that must be understood for implementation.`;
      questions.push({
        id: i + 1,
        question: statement,
        options: ['True', 'False'],
        correctAnswer: 'True',
        difficulty,
        type: 'true-false',
        topic,
        explanation: `This statement is derived from the structured module knowledge.`,
      });
      continue;
    }

    if (type === 'identification') {
      const src = defs[i % Math.max(defs.length, 1)];
      const term = src?.term || (pool[i % Math.max(pool.length, 1)] || topic);
      const def = src?.definition || `a key concept covered in ${topic}`;
      questions.push({
        id: i + 1,
        question: `Identify the term: ${def.replace(new RegExp(escapeRegex(term), 'i'), '__________')}`,
        options: [],
        correctAnswer: term,
        difficulty,
        type: 'identification',
        topic,
        explanation: `The answer is a term extracted from the module knowledge base.`,
      });
      continue;
    }

    // Multiple choice
    if (defs.length > 0 && style === 0) {
      const d = defs[i % defs.length];
      const correct = d.term;
      const opts = [correct, ...pickDistractors(correct)];
      questions.push({
        id: i + 1,
        question: `Which term best matches the definition below?\n\n${d.definition}`,
        options: opts,
        correctAnswer: correct,
        difficulty,
        type: 'multiple-choice',
        topic,
        explanation: `The correct answer directly matches the module's definition.`,
      });
    } else if (objectives.length > 0 && style === 1) {
      const obj = objectives[i % objectives.length];
      // Rotate correct answer instead of always using index 0 (this was causing repetition)
      const correct =
        pool[(i + 3) % Math.max(pool.length, 1)] ||
        concepts[i % Math.max(concepts.length, 1)] ||
        terms[i % Math.max(terms.length, 1)] ||
        topics[i % Math.max(topics.length, 1)] ||
        `Key concept in ${topic}`;
      const excerpt = excerpts.length ? excerpts[i % excerpts.length] : '';
      const opts = generateCompleteOptions(
        correct,
        topic,
        excerpt || knowledgeContext,
        difficulty === 'easy' ? 'easy' : difficulty === 'hard' ? 'hard' : 'medium'
      );
      questions.push({
        id: i + 1,
        question: excerpt
          ? `Which concept is MOST directly assessed by the learning objective below?\n\n${obj}\n\n(Excerpt)\n"${excerpt}"`
          : `Which concept is MOST directly assessed by the learning objective below?\n\n${obj}`,
        options: opts,
        correctAnswer: correct,
        difficulty,
        type: 'multiple-choice',
        topic,
        explanation: `This maps the objective to a core concept extracted from the module.`,
      });
    } else if (concepts.length > 0 && style === 2) {
      const c = concepts[i % concepts.length];
      const correct = c;
      const opts = [correct, ...pickDistractors(correct)];
      questions.push({
        id: i + 1,
        question: `Which of the following is a key concept discussed in the module?`,
        options: opts,
        correctAnswer: correct,
        difficulty,
        type: 'multiple-choice',
        topic,
        explanation: `The correct option is listed as a key concept in the module knowledge.`,
      });
    } else {
      // Excerpt-driven question for scale (lets us generate 50+ unique questions)
      const excerpt = excerpts.length
        ? excerpts[i % excerpts.length]
        : (topics[0] ? `Topic focus: ${topics[0]}` : topic);
      const correct =
        pool[i % Math.max(pool.length, 1)] ||
        concepts[i % Math.max(concepts.length, 1)] ||
        terms[i % Math.max(terms.length, 1)] ||
        topics[i % Math.max(topics.length, 1)] ||
        `Core idea in ${topic}`;
      const opts = generateCompleteOptions(
        correct,
        topic,
        excerpt || knowledgeContext,
        difficulty === 'easy' ? 'easy' : difficulty === 'hard' ? 'hard' : 'medium'
      );
      const patterns = [
        `Based on the excerpt below, which option best matches the key concept being discussed?\n\n"${excerpt}"`,
        `According to the course material excerpt, which term/concept is most relevant?\n\n"${excerpt}"`,
        `Read the excerpt. Which option is the best answer?\n\n"${excerpt}"`,
        `From the excerpt, which concept is being emphasized?\n\n"${excerpt}"`,
      ];
      questions.push({
        id: i + 1,
        question: patterns[style],
        options: opts,
        correctAnswer: correct,
        difficulty,
        type: 'multiple-choice',
        topic,
        explanation: `The excerpt and options are derived from validated module knowledge.`,
      });
    }
  }

  return deduplicateQuestions(questions);
}

interface QuestionTemplate {
  pattern: string;
  correctPattern: string;
  distractorPatterns?: string[];
  explanationPattern: string;
}

function extractStatements(text: string): string[] {
  const cleaned = stripPdfFontArtifacts(text || '');

  const looksLikePdfMetadata = (s: string) =>
    /\b(basefont|fontdescriptor|descendantfonts|tounicode|cidfonttype|cidtogidmap|cidsysteminfo|identity-h|winansiencoding|flatedecode|endobj|endstream|xref|trailer|stream|obj|subtype|fontweight|xheight|capheight|ascent|descent|leading|fontbbox|fontfile2?|italicangle|stemv|widths|firstchar|lastchar|charset|guid|extgstate|procset)\b/i.test(
      s
    );

  const isMeaningfulSentence = (sentence: string): boolean => {
    const s = sentence.trim();
    if (s.length < 50) return false;
    if (looksLikePdfMetadata(s)) return false;

    const words = s.split(/\s+/).filter(Boolean);
    if (words.length < 8) return false;

    const singleCharRatio =
      words.filter((w) => w.length === 1).length / Math.max(words.length, 1);
    if (singleCharRatio > 0.12) return false;

    // Reject "token soup" (e.g., "e Ai e E A e ou a a u I ...")
    // These sequences often slip through if most tokens are 2 chars (Ai, ou, qe, ...).
    const shortTokenRatio =
      words.filter((w) => w.length <= 2).length / Math.max(words.length, 1);
    if (shortTokenRatio > 0.22) return false;

    const avgWordLen =
      words.reduce((sum, w) => sum + w.length, 0) / Math.max(words.length, 1);
    if (avgWordLen < 4.2) return false;

    // Excessive repetition of very short tokens is also a strong corruption signal
    const freq = new Map<string, number>();
    for (const w of words) {
      const k = w.toLowerCase();
      if (k.length <= 2) freq.set(k, (freq.get(k) || 0) + 1);
    }
    let maxShort = 0;
    for (const v of freq.values()) maxShort = Math.max(maxShort, v);
    if (maxShort / Math.max(words.length, 1) > 0.12) return false;

    // Avoid lines that are mostly random alphanumerics
    if (/[A-Z0-9]{12,}/.test(s)) return false;

    return true;
  };

  // 1) Sentence-based candidates
  const sentenceCandidates = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(isMeaningfulSentence);

  // 2) Line/bullet-based candidates (slides/notes/PDF headings often don't end with punctuation)
  const lineCandidates = cleaned
    .split(/\n+/)
    .flatMap((line) => line.split(/(?:^|\s)[•\-–—]\s+/)) // bullets
    .map((line) => line.trim())
    .filter((s) => {
      if (!s) return false;
      if (s.length < 40) return false;
      if (s.length > 260) return false;
      if (looksLikePdfMetadata(s)) return false;
      const words = s.split(/\s+/).filter(Boolean);
      if (words.length < 7) return false;
      const singleCharRatio = words.filter((w) => w.length === 1).length / Math.max(words.length, 1);
      if (singleCharRatio > 0.12) return false;
      if (/[A-Z0-9]{12,}/.test(s)) return false;
      return true;
    });

  const combined = [...sentenceCandidates, ...lineCandidates];
  const seen = new Set<string>();
  const unique = combined.filter((s) => {
    const k = s.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return unique;
}

function buildMultipleChoiceQuestion(
  id: number,
  topic: string,
  statement: string,
  difficulty: QuestionDifficulty
): Question {
  const cleanedStatement = stripPdfFontArtifacts(statement);
  let answer = extractMainPhrase(cleanedStatement) || cleanedStatement;

  // If we extracted a "bad" answer (too short / looks like garbage), use a safer generic question.
  if (answer.trim().length < 10 || answer.split(/\s+/).length < 2) {
    // IMPORTANT: don't fall back to the module title (users hate seeing questions that just echo the title).
    // Use a phrase from the statement itself instead.
    answer = cleanedStatement
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 10)
      .join(' ');
    if (answer.trim().length < 12) answer = 'The key concept described in the excerpt';
  }

  const distractors = generateDistractorsFromStatement(cleanedStatement, 3).map(stripPdfFontArtifacts);

  // Ensure exactly 4 options (1 correct + 3 distractors), non-empty and unique.
  const optionSet: string[] = [];
  for (const opt of [answer, ...distractors]) {
    const t = (opt || '').trim();
    if (!t) continue;
    if (!optionSet.some((x) => x.toLowerCase() === t.toLowerCase())) optionSet.push(t);
  }
  while (optionSet.length < 4) {
    const keyTerms = cleanedStatement
      .split(/[\s,;.!?]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 4 && /[a-z]/i.test(w))
      .slice(0, 6);
    const term = keyTerms[optionSet.length - 1] || keyTerms[0] || 'the material';
    optionSet.push(`A related but different idea involving ${term}`);
  }
  const finalOptions = optionSet.slice(0, 4);
  return {
    id,
    question: makeQuestionText(id, cleanedStatement, topic, difficulty),
    options: finalOptions,
    correctAnswer: answer,
    difficulty,
    type: 'multiple-choice',
    topic,
    explanation: `The statement is based on module content: ${cleanedStatement}`,
  };
}

function buildTrueFalseQuestion(
  id: number,
  topic: string,
  statement: string,
  difficulty: QuestionDifficulty
): Question {
  const normalized = statement.replace(/\s+/g, ' ').trim();
  return {
    id,
    question: `${normalized}`,
    options: ['True', 'False'],
    correctAnswer: 'True',
    difficulty,
    type: 'true-false',
    topic,
    explanation: `This statement is intended to reflect module content: ${normalized}`,
  };
}

function buildIdentificationQuestion(
  id: number,
  topic: string,
  statement: string,
  difficulty: QuestionDifficulty
): Question {
  const phrase =
    extractMainPhrase(statement) ||
    statement.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ') ||
    'Key concept';
  const questionText = statement.replace(new RegExp(escapeRegex(phrase), 'i'), '__________');
  return {
    id,
    question: questionText.length > 20 ? questionText : `Identify the key concept: __________`,
    options: [],
    correctAnswer: phrase,
    difficulty,
    type: 'identification',
    topic,
    explanation: `The answer is drawn from the module statement: ${statement}`,
  };
}

function extractMainPhrase(statement: string): string {
  const match = statement.match(/\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*)\b/);
  if (match) {
    return match[1];
  }
  const words = statement.split(/\s+/).slice(0, 5).join(' ');
  return words;
}

function makeQuestionText(
  id: number,
  statement: string,
  topic: string,
  difficulty: QuestionDifficulty
): string {
  const trimmed = statement.replace(/\.$/, '').trim();
  const patterns = [
    `Which of the following best summarizes the main point of the excerpt below?\n\n"${trimmed}"`,
    `Based on the course material, what is the MOST accurate interpretation of:\n\n"${trimmed}"`,
    `Which option best matches the concept described here?\n\n"${trimmed}"`,
    `Which option best defines the key idea implied by:\n\n"${trimmed}"`,
    `A student is reviewing the course material. Which choice best aligns with:\n\n"${trimmed}"`,
    `Which of the following is the best answer given the statement:\n\n"${trimmed}"`,
  ];
  return patterns[(id - 1) % patterns.length];
}

function generateDistractorsFromStatement(statement: string, count: number): string[] {
  const distractors: string[] = [];
  
  // Strategy 1: Extract related concepts and variations - domain specific
  const conceptPairs = [
    { pattern: /\b(deployment|implementation)\b/i, alternatives: ['Requirements gathering', 'System design', 'Code review', 'Performance monitoring'] },
    { pattern: /\b(strategy|method|approach)\b/i, alternatives: ['Technical specification', 'Resource allocation', 'Risk management', 'Timeline planning'] },
    { pattern: /\b(testing|verification|quality)\b/i, alternatives: ['System documentation', 'User training', 'Change management', 'Stakeholder communication'] },
    { pattern: /\b(scheduling|planning|timeline)\b/i, alternatives: ['Resource management', 'Risk mitigation', 'Change tracking', 'Performance metrics'] },
    { pattern: /\b(analysis|evaluation)\b/i, alternatives: ['Implementation execution', 'System design', 'Documentation review', 'Performance testing'] },
  ];
  
  // Strategy 2: Find domain-specific alternatives from concept pairs
  for (const pair of conceptPairs) {
    if (pair.pattern.test(statement)) {
      const alternatives = pair.alternatives.filter(alt => !statement.toLowerCase().includes(alt.toLowerCase()));
      distractors.push(...alternatives.slice(0, count - distractors.length));
      break;
    }
  }
  
  // Strategy 3: Extract domain-specific wrong answers
  if (distractors.length < count) {
    const mainConcept = extractMainPhrase(statement);
    const wrongAnswers = generateDomainSpecificDistracters(statement, mainConcept);
    distractors.push(...wrongAnswers.filter(w => w !== mainConcept && !distractors.includes(w)).slice(0, count - distractors.length));
  }
  
  // Strategy 4: Generate realistic academic distractors (only if needed)
  if (distractors.length < count) {
    // Extract key terms from statement for more targeted alternatives
    const keyTerms = statement
      .split(/[\s,;.!?]+/)
      .filter(w => w.length > 4 && !/^(the|and|with|from|about|as|or|in|to|for|by|on|is|are|be|been|was|were)$/i.test(w))
      .slice(0, 3);
    
    const alternatives = [
      keyTerms[0] ? `Related to ${keyTerms[0]}, but not the primary answer` : 'Related concept not directly applicable',
      keyTerms[1] ? `Consequence of ${keyTerms[1]}` : 'Dependent outcome',
      'Prerequisites for the main concept',
      'Alternative approach to achieve similar goals',
      'Frequently confused with this topic',
    ];
    
    distractors.push(...alternatives.slice(0, count - distractors.length));
  }

  // FINAL GUARANTEE: ensure we always return exactly `count` distractors (no blanks).
  // Use key terms from the statement so distractors still feel anchored in the PDF content.
  const keyTerms = statement
    .split(/[\s,;.!?]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 4 && /[a-z]/i.test(w))
    .slice(0, 10);

  const uniq: string[] = [];
  for (const d of distractors) {
    const t = (d || '').replace(/^the /i, '').trim();
    if (!t) continue;
    if (!uniq.some((x) => x.toLowerCase() === t.toLowerCase())) uniq.push(t);
  }
  while (uniq.length < count) {
    const term = keyTerms[uniq.length] || keyTerms[0] || 'the material';
    uniq.push(`A common misconception related to ${term}`);
  }

  return uniq.slice(0, count);
}

function generateDomainSpecificDistracters(statement: string, mainConcept: string): string[] {
  const distractors: string[] = [];
  const lowerStatement = statement.toLowerCase();
  
  // Educational/Software domain distractors
  if (lowerStatement.includes('requirement') || lowerStatement.includes('specification')) {
    distractors.push('System architecture', 'Database design', 'User interface prototype', 'Security policy');
  } else if (lowerStatement.includes('implementation') || lowerStatement.includes('deployment')) {
    distractors.push('Requirements gathering', 'System design', 'Code review process', 'User training');
  } else if (lowerStatement.includes('testing') || lowerStatement.includes('quality')) {
    distractors.push('System documentation', 'Performance monitoring', 'Risk assessment', 'Change management');
  } else if (lowerStatement.includes('schedule') || lowerStatement.includes('timeline')) {
    distractors.push('Resource allocation', 'Risk management', 'Change tracking', 'Performance metrics');
  } else if (lowerStatement.includes('manage') || lowerStatement.includes('strategy')) {
    distractors.push('Technical implementation', 'Stakeholder communication', 'Process automation', 'System integration');
  }
  
  // If we don't have any domain-specific distractors, use general academic ones
  if (distractors.length === 0) {
    distractors.push(
      `Peripheral aspect of ${mainConcept}`,
      `Prerequisite for ${mainConcept}`,
      `Consequence of ${mainConcept}`,
      `Alternative term for ${mainConcept}`
    );
  }
  
  return distractors;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTemplatesForType(type: QuestionType): QuestionTemplate[] {
  const multipleChoiceTemplates: QuestionTemplate[] = [
    {
      pattern: `What is the primary definition of {{topic}}?`,
      correctPattern: `A key principle or definition of {{topic}}`,
      distractorPatterns: [
        'An unrelated concept',
        'A common misconception',
        'A reversed or opposite definition',
      ],
      explanationPattern: `This correctly defines {{topic}}.`,
    },
    {
      pattern: `Which statement accurately describes a core aspect of {{topic}}?`,
      correctPattern: `An accurate statement about {{topic}}`,
      distractorPatterns: [
        'A partially true statement',
        'A statement about a related but different topic',
        'A factually incorrect claim',
      ],
      explanationPattern: `This statement is accurate regarding {{topic}}.`,
    },
    {
      pattern: `In the context of {{topic}}, what is the most appropriate {{difficulty}} approach?`,
      correctPattern: `Apply the correct method related to {{topic}}`,
      distractorPatterns: [
        'Use an outdated technique',
        'Apply a technique from an unrelated field',
        'Skip essential steps',
      ],
      explanationPattern: `This is the correct approach for {{difficulty}}-level work in {{topic}}.`,
    },
    {
      pattern: `Which example best illustrates {{topic}}?`,
      correctPattern: `A realistic example demonstrating {{topic}}`,
      distractorPatterns: [
        'An example of something similar but different',
        'A counterexample',
        'An unrelated example',
      ],
      explanationPattern: `This example clearly demonstrates {{topic}}.`,
    },
    {
      pattern: `What would be a logical consequence of {{topic}}?`,
      correctPattern: `A logical result or consequence of {{topic}}`,
      distractorPatterns: [
        'An unrelated consequence',
        'A consequence of something else',
        'An unlikely or illogical outcome',
      ],
      explanationPattern: `This is a logical consequence of {{topic}}.`,
    },
  ];

  const trueFalseTemplates: QuestionTemplate[] = [
    {
      pattern: `{{topic}} is a fundamental concept in its field.`,
      correctPattern: 'True',
      explanationPattern: `{{topic}} is indeed a fundamental concept.`,
    },
    {
      pattern: `All aspects of {{topic}} require the same level of difficulty to master.`,
      correctPattern: 'False',
      explanationPattern: `Different aspects of {{topic}} vary in complexity.`,
    },
    {
      pattern: `{{topic}} has remained completely unchanged since its introduction.`,
      correctPattern: 'False',
      explanationPattern: `{{topic}} has evolved and developed over time.`,
    },
    {
      pattern: `Understanding {{topic}} requires knowledge of related concepts.`,
      correctPattern: 'True',
      explanationPattern: `{{topic}} is connected to and builds upon related concepts.`,
    },
  ];

  const identificationTemplates: QuestionTemplate[] = [
    {
      pattern: `The primary principle or mechanism of {{topic}} is called: ___________`,
      correctPattern: 'A specific principle or mechanism related to {{topic}}',
      explanationPattern: `This term describes a key aspect of {{topic}}.`,
    },
    {
      pattern: `{{topic}} is most commonly associated with: ___________`,
      correctPattern: 'A relevant concept, field, or practitioner',
      explanationPattern: `{{topic}} is indeed associated with this concept.`,
    },
    {
      pattern: `The main advantage of {{topic}} is: ___________`,
      correctPattern: 'A key benefit or advantage',
      explanationPattern: `This is indeed a significant advantage of {{topic}}.`,
    },
    {
      pattern: `{{topic}} can be categorized as a type of: ___________`,
      correctPattern: 'A broader category or classification',
      explanationPattern: `{{topic}} fits within this broader classification.`,
    },
  ];

  if (type === 'true-false') {
    return trueFalseTemplates;
  } else if (type === 'identification') {
    return identificationTemplates;
  } else {
    return multipleChoiceTemplates;
  }
}

function fillTemplate(
  template: QuestionTemplate,
  topic: string,
  difficulty: QuestionDifficulty,
  type: QuestionType,
  id: number
): Question {
  const fill = (str: string) =>
    str
      .replace(/\{\{topic\}\}/g, topic)
      .replace(/\{\{difficulty\}\}/g, difficulty);

  const question = fill(template.pattern);
  const correctAnswer = fill(template.correctPattern);
  const explanation = fill(template.explanationPattern);

  const base: Question = {
    id,
    question,
    correctAnswer,
    difficulty,
    topic,
    explanation,
    type,
  };

  if (type === 'multiple-choice') {
    const opts = template.distractorPatterns
      ? [correctAnswer, ...template.distractorPatterns.map(fill)]
      : [correctAnswer];

    // Ensure exactly 4 options for MCQ templates
    while (opts.length < 4) opts.push(`Plausible alternative ${opts.length}`);
    base.options = opts.slice(0, 4);
  } else if (type === 'true-false') {
    base.options = ['True', 'False'];
    const ans = (correctAnswer || '').toString().trim().toLowerCase();
    base.correctAnswer = ans === 'false' ? 'False' : 'True';
  } else if (type === 'identification') {
    base.options = [];
  }

  return base;
}

/**
 * Comprehensive text cleaning utility for PDF-extracted content
 * Removes encoding artifacts, metadata, corrupted text, and non-readable characters
 * while preserving actual academic content
 * 
 * This is AGGRESSIVE cleaning to handle severely corrupted PDFs
 */
function cleanModuleText(text: string): string {
  // If we're already receiving STRUCTURED knowledge context (our new pipeline),
  // do NOT run nuclear word-filtering (it destroys headings/bullets and over-removes content).
  const isStructuredKnowledge =
    /\bTopics:\s*\n- /i.test(text) ||
    /\bKey definitions:\s*\n- /i.test(text) ||
    /\bHigh-quality excerpts\b/i.test(text) ||
    /\[E\d+\s*\|\s*score=/i.test(text);
  if (isStructuredKnowledge) {
    return stripPdfFontArtifacts(text)
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
      .replace(
        /\b(endstream|endobj|stream|obj|xref|trailer|startxref|flatedecode)\b/gi,
        ' '
      )
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  let processed = text;

  // PHASE 0: Initial normalization - convert all non-printable ASCII to spaces
  processed = processed
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ');

  // QUICK STRIP: remove the most common PDF/font artifacts early
  processed = stripPdfFontArtifacts(processed);

  // PHASE 1: Remove PDF operators and metadata completely
  processed = processed
    .replace(/\b(MediaBox|Contents|Filter|Resources|Font|ExtGState|ProcSet|ImageB|ImageC|ImageI|Type|Group|Transparency|DeviceRGB|Tabs|StructParents|GS\d+|F\d+|O\*|stream|endstream|obj|endobj|xref|trailer|startxref|FlateDecode|Length|Tf|Tj|TJ|ET|BT|RG|rg|re|gsave|grestore)\b/gi, ' ');

  // PHASE 2: Remove isolated characters and garbage
  processed = processed
    .replace(/\s[A-Z0-9]\s/g, ' ')  // Single char with spaces
    .replace(/[A-Za-z][\`\"\'\$\@\#\^\&\*]/g, ' ')  // Letter + special chars
    .replace(/[\`\"\'\$\@\#\^\&\*]+/g, ' '); // Multiple symbols

  // PHASE 3: AGGRESSIVE word filtering
  processed = processed
    .split(/\s+/)
    .filter(word => {
      if (!word || word.length === 0) return false;
      
      // Count vowels
      const vowelCount = (word.match(/[aeiouAEIOU]/g) || []).length;
      const wordLength = word.length;
      
      // Short words (< 4 chars)
      if (wordLength < 4) {
        const validShort = ['a', 'i', 'is', 'to', 'in', 'on', 'at', 'as', 'of', 'or', 'an', 'by', 'be', 'we', 'he', 'it', 'up', 'so', 'if', 'no', 'go', 'do', 'me', 'my', 'us', 'are', 'and', 'but', 'for', 'the', 'you', 'not', 'all'];
        // Keep only real short stop-words OR common acronyms (AI, IoT, CPU, ...)
        if (validShort.includes(word.toLowerCase())) return true;
        if (/^[A-Z]{2,5}$/.test(word)) return true;
        return false;
      }
      
      // Medium words (4-10 chars): must have 2+ vowels
      if (wordLength < 11) {
        return vowelCount >= 2;
      }
      
      // Long words (11+ chars): must have at least 3 vowels
      return vowelCount >= 3;
    })
    .filter(word => {
      // No letters = garbage
      if (!/[a-zA-Z]/.test(word)) return false;
      
      // Too many special characters = garbage
      const specialCharCount = (word.match(/[^a-zA-Z0-9\-\']/g) || []).length;
      if (specialCharCount > word.length * 0.3) return false;
      
      // Known PDF keywords = garbage
      const pdfKeywords = ['type', 'resources', 'font', 'extgstate', 'procset', 'mediabox', 'contents', 'group', 'transparency', 'devicergb', 'tabs', 'structparents', 'filter', 'length'];
      if (pdfKeywords.includes(word.toLowerCase())) return false;
      
      return true;
    })
    .join(' ');

  // PHASE 4: Remove file metadata and technical markers
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
      
      // Check for too many special characters
      if (line.length < 15) {
        const charCount = (line.match(/[%&^$*\-_`"';:?/<>|\\]/g) || []).length;
        if (charCount > line.length * 0.3) return false;
      }
      
      if (/^[a-z]\s+[a-z](\s+[a-z])+$/i.test(line)) return false;
      
      const symbolCount = (line.match(/[%&^$*<>[\]{}()]/g) || []).length;
      if (symbolCount > line.length * 0.2) return false;
      
      if (line.length < 8 && !/[aeiouAEIOU0-9]/i.test(line)) return false;
      
      // Check for mostly non-English words
      const words = line.split(/\s+/);
      const vowelCount = (line.match(/[aeiouAEIOU]/g) || []).length;
      if (vowelCount < line.length * 0.1) return false;  // Less than 10% vowels = trash
      
      return true;
    });

  processed = cleanLines.join('\n');

  // PHASE 6: Final text normalization
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
    console.warn(`[CleanModuleText] ⚠️ Warning: Cleaned content is very short (${processed.length} chars)`);
    console.warn(`[CleanModuleText] Original length was: ${text.length} chars`);
  } else {
    const reductionPct = Math.round((1 - processed.length / text.length) * 100);
    console.log(`[CleanModuleText] ✓ Cleaned: ${text.length} → ${processed.length} chars (${reductionPct}% removed)`);
  }

  return processed;
}
