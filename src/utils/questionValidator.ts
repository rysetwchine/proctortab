/**
 * Question Validation and Quality Assurance
 * Ensures generated questions meet academic standards
 */

import type { Question } from '@/types';
import { stripPdfFontArtifacts } from './contentQuality';

const PDF_ARTIFACT_RE = /\b(basefont|fontdescriptor|descendantfonts|tounicode|cidfonttype|cidtogidmap|cidsysteminfo|identity-h|winansiencoding|flatedecode|endobj|endstream|xref|trailer|stream|obj|subtype|fontweight|xheight|capheight|ascent|descent|leading|fontbbox|fontfile)\b/i;

function looksCorruptedOrGibberish(text: string): boolean {
  const s = (text || '').trim();
  if (!s) return true;

  // PDF metadata keywords
  if (PDF_ARTIFACT_RE.test(s)) return true;

  // Too many symbols
  const total = s.length;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const spaces = (s.match(/\s/g) || []).length;
  const digits = (s.match(/[0-9]/g) || []).length;
  const symbols = total - letters - spaces - digits;
  if (total > 0 && symbols / total > 0.22) return true;

  // Token soup / spaced-out garbage (many 1–2 char tokens)
  const tokens = s.split(/\s+/).filter(Boolean);
  const shortRatio = tokens.filter((t) => t.length <= 2).length / Math.max(tokens.length, 1);
  if (tokens.length >= 12 && shortRatio > 0.28) return true;

  // Very low vowel density in short words often indicates corruption
  const shortWords = tokens.filter((t) => /^[A-Za-z]{3,8}$/.test(t));
  if (shortWords.length >= 8) {
    const withVowels = shortWords.filter((t) => /[aeiou]/i.test(t)).length;
    if (withVowels / shortWords.length < 0.55) return true;
  }

  return false;
}

/**
 * Validate a single question for quality and correctness
 */
export function validateQuestion(question: Question, type: 'multiple-choice' | 'true-false' | 'identification'): boolean {
  // Basic validation
  if (!question.question || question.question.trim().length === 0) {
    console.warn('Question text is empty');
    return false;
  }

  if (!question.correctAnswer || question.correctAnswer.toString().trim().length === 0) {
    console.warn('Correct answer is empty');
    return false;
  }

  // Question shouldn't look like metadata
  if (isMetadataLike(question.question)) {
    console.warn('Question appears to be metadata:', question.question);
    return false;
  }

  // Reject corrupted/gibberish stems (this is the root cause of unreadable exams)
  if (looksCorruptedOrGibberish(question.question)) {
    console.warn('Question appears corrupted/gibberish:', question.question);
    return false;
  }

  // Type-specific validation
  if (type === 'multiple-choice') {
    return validateMultipleChoice(question);
  } else if (type === 'true-false') {
    return validateTrueFalse(question);
  } else if (type === 'identification') {
    return validateIdentification(question);
  }

  return true;
}

/**
 * Validate multiple choice question
 */
function validateMultipleChoice(question: Question): boolean {
  if (!question.options || question.options.length === 0) {
    console.warn('Multiple choice question has no options');
    return false;
  }

  // We allow 1–2 options here because we can auto-pad options later in cleanMultipleChoiceOptions().
  // This prevents discarding otherwise good AI-generated stems just because the model returned fewer options.

  // Check for blank options
  const blankOptions = question.options.filter((opt) => !opt || opt.trim().length === 0);
  if (blankOptions.length > 0) {
    console.warn('Multiple choice question has blank options');
    return false;
  }

  // Reject options that look like PDF metadata/corrupted extraction
  const corruptedOptions = question.options.filter((opt) => looksCorruptedOrGibberish(stripPdfFontArtifacts(opt || '')));
  if (corruptedOptions.length > 0) {
    console.warn('Multiple choice question has corrupted options');
    return false;
  }

  // Check that correct answer is in options
  const correctAnswerStr = question.correctAnswer.toString().trim();
  const hasCorrectAnswer = question.options.some((opt) => opt.trim() === correctAnswerStr);
  // Do not fail here: cleanMultipleChoiceOptions() can recover by selecting the first option
  // as the correct answer and padding to 4 options.
  if (!hasCorrectAnswer) console.warn('Correct answer not in options (will attempt to repair):', correctAnswerStr);

  // Check that options are diverse (not all identical)
  const uniqueOptions = new Set(question.options.map((opt) => opt.toLowerCase().trim()));
  if (uniqueOptions.size === 1) {
    console.warn('All options are identical');
    return false;
  }

  // Warn if multiple options are very similar
  if (uniqueOptions.size < question.options.length * 0.5) {
    console.warn('Many options appear duplicated or very similar');
  }

  return true;
}

/**
 * Validate true/false question
 */
function validateTrueFalse(question: Question): boolean {
  const answer = question.correctAnswer.toString().trim().toLowerCase();

  if (answer !== 'true' && answer !== 'false') {
    console.warn('True/false answer must be True or False, got:', question.correctAnswer);
    return false;
  }

  return true;
}

/**
 * Validate identification question
 */
function validateIdentification(question: Question): boolean {
  // Identification just needs a non-empty question and answer
  // Answer should be reasonably short (a term/concept)
  const answerStr = question.correctAnswer.toString();
  if (answerStr.length > 300) {
    console.warn('Identification answer seems too long (should be a term or concept)');
    return false;
  }

  return true;
}

/**
 * Check if text looks like file metadata rather than academic content
 */
function isMetadataLike(text: string): boolean {
  const metadataPatterns = [
    /^(file|filename|chapter|lesson|unit|module|section|slide)[\s:]/i,
    /\.pdf|\.docx|\.pptx|\.txt/i,
    /^\[.*\]$/,
    /^(extracted from|from file|based on)/i,
    /^(question|answer|option)\s*\d+/i,
  ];

  return metadataPatterns.some((pattern) => pattern.test(text));
}

/**
 * Filter questions to ensure quality
 */
export function filterQuestions(
  questions: Question[],
  type: 'multiple-choice' | 'true-false' | 'identification'
): Question[] {
  return questions.filter((q) => {
    const isValid = validateQuestion(q, type);
    if (!isValid) {
      console.warn('Filtering out invalid question:', q.question);
    }
    return isValid;
  });
}

/**
 * Ensure options in multiple choice are properly formatted
 */
export function cleanMultipleChoiceOptions(question: Question): Question {
  if (question.type !== 'multiple-choice' || !question.options) {
    return question;
  }

  // Clean each option
  const cleanedOptions = question.options
    .map((opt) => {
      if (!opt) return '';
      // Trim whitespace
      let cleaned = opt.toString().trim();
      // Remove leading option labels ONLY when they are clearly labels (e.g., "A) ", "B. ", "1 - ").
      // IMPORTANT: do NOT remove a normal leading "A" in real text like "An unrelated consequence"
      cleaned = cleaned
        .replace(/^(?:[A-Da-d][\)\.\:\-]\s+|\d+[\)\.\:\-]\s+|[\u2022\-\*]\s+)/, '');
      return cleaned;
    })
    .filter((opt) => opt.length > 0);

  const extractAnchorText = (): string => {
    const fromExplanation = typeof question.explanation === 'string' ? question.explanation : '';
    // Common pattern from our generators:
    // "The statement is based on module content: <text...>"
    const m1 = fromExplanation.match(/module content:\s*([\s\S]{50,500})/i);
    if (m1?.[1]) return m1[1].trim();

    // Many questions include an excerpt in quotes.
    const m2 = (question.question || '').match(/"([\s\S]{50,500}?)"/);
    if (m2?.[1]) return m2[1].trim();

    return (question.question || '').slice(0, 500);
  };

  const padToFour = (opts: string[], correct: string): string[] => {
    const anchor = extractAnchorText();
    const keyTerms = anchor
      .split(/[\s,;.!?]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 4 && /[a-z]/i.test(w))
      .slice(0, 12);

    const out: string[] = [];
    const c = (correct || '').trim();
    if (c) out.push(c);
    for (const o of opts) {
      const t = (o || '').trim();
      if (!t) continue;
      if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    }

    while (out.length < 4) {
      const term = keyTerms[out.length - 1] || keyTerms[0] || 'the material';
      // Make sure we never duplicate the correct answer text
      const candidate = `A related but incorrect idea involving ${term}`;
      if (!out.some((x) => x.toLowerCase() === candidate.toLowerCase())) out.push(candidate);
    }

    return out.slice(0, 4);
  };

  // Update correct answer if needed
  // Guard: some fallback MCQs may have missing/undefined correctAnswer.
  let correctAnswer = (question.correctAnswer ?? '').toString().trim();
  const correctInOptions =
    correctAnswer.length > 0
      ? cleanedOptions.some((opt) => opt.toLowerCase() === correctAnswer.toLowerCase())
      : false;


  if (!correctInOptions && cleanedOptions.length > 0) {
    console.warn('Correct answer not found in cleaned options, using first option');
    correctAnswer = cleanedOptions[0];
  }

  return {
    ...question,
    // Always ensure multiple-choice has 4 non-empty options (users reported 1–2 choice questions).
    options: padToFour(cleanedOptions, correctAnswer),
    correctAnswer,
  };
}

/**
 * Ensure True/False questions always have exactly two options: ["True", "False"].
 * Some AI outputs may accidentally include 4 MCQ-style options or only a single option.
 */
export function cleanTrueFalseOptions(question: Question): Question {
  if (question.type !== 'true-false') return question;

  const raw = (question.correctAnswer ?? '').toString().trim().toLowerCase();
  const normalized = raw === 'false' ? 'False' : 'True'; // default to True if missing/invalid

  return {
    ...question,
    options: ['True', 'False'],
    correctAnswer: normalized,
  };
}

/**
 * Ensure all questions meet minimum quality standards
 */
export function ensureQuestionQuality(
  questions: Question[],
  type: 'multiple-choice' | 'true-false' | 'identification',
  minCount: number = 1
): Question[] {
  // Filter invalid questions
  let valid = filterQuestions(questions, type);

  // Clean up multiple choice options
  if (type === 'multiple-choice') {
    valid = valid.map((q) => cleanMultipleChoiceOptions(q));
  }
  if (type === 'true-false') {
    valid = valid.map((q) => cleanTrueFalseOptions(q));
  }

  // If we have fewer than minimum, log warning
  if (valid.length < minCount) {
    console.warn(`Generated only ${valid.length} valid questions, requested ${minCount}`);
  }

  return valid;
}
