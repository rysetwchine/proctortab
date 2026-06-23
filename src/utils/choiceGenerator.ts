/**
 * Intelligent Choice/Distractor Generator
 * Generates realistic, topic-related distractors for multiple choice questions
 */

/**
 * Extract key concepts and entities from content
 */
function extractKeyPhrases(content: string, limit = 20): string[] {
  // Remove common words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'that', 'this', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been',
    'by', 'from', 'up', 'about', 'as', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'between', 'under', 'along', 'following', 'behind',
    'beyond', 'plus', 'except', 'but', 'yet', 'so', 'has', 'have', 'had', 'do', 'does',
    'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can', 'it', 'its',
  ]);

  // Extract capitalized phrases and important terms
  const phrases = new Set<string>();

  // Capitalized sequences (likely proper nouns/concepts)
  const capitalizedMatches = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  capitalizedMatches.forEach((match: string) => {
    if (match.length > 2) phrases.add(match);
  });

  // Important domain terms (longer words often indicate technical terms)
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 6 && !stopWords.has(word));

  const freq = new Map<string, number>();
  words.forEach((word) => {
    freq.set(word, (freq.get(word) || 0) + 1);
  });

  Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .forEach(([word]) => phrases.add(word));

  return Array.from(phrases).slice(0, limit);
}

/**
 * Generate related misconceptions for a correct answer
 */
function generateMisconceptions(correctAnswer: string, topic: string): string[] {
  const misconceptions: string[] = [];

  // Common misconception patterns
  const patterns = [
    // Opposite/negation
    `Not ${correctAnswer}`,
    `The opposite of ${correctAnswer}`,
    `The inverse of ${correctAnswer}`,

    // Partial truths
    `${correctAnswer}, but only sometimes`,
    `${correctAnswer} under certain conditions`,

    // Related but different concepts
    `Similar to ${correctAnswer} but distinct`,
    `Often confused with ${correctAnswer}`,
  ];

  // Add some patterns
  if (correctAnswer.includes(' ')) {
    const words = correctAnswer.split(' ');
    if (words.length >= 2) {
      misconceptions.push(`${words[0]} ${words[1]} incorrectly`);
      misconceptions.push(`The reverse of ${correctAnswer}`);
    }
  }

  // Time/scope misconceptions
  misconceptions.push(`${correctAnswer} (historically true but not current)`);
  misconceptions.push(`${correctAnswer} in theory but not in practice`);

  return misconceptions.filter((m) => m.length < 150);
}

/**
 * Generate alternative answers that are semantically similar but contextually different
 */
function generateAlternatives(topic: string, keyPhrases: string[]): string[] {
  const alternatives: string[] = [];

  // Prefer concrete alternatives derived from module key phrases (avoid generic placeholders).
  const pool = keyPhrases
    .map((p) => p.trim())
    .filter((p) => p.length >= 6);

  // Use other key phrases directly as distractors (common in real exams: related terms)
  pool.slice(0, 8).forEach((p) => alternatives.push(p));

  // If key phrases are short single-words, wrap into a clearer phrase
  pool
    .filter((p) => p.split(' ').length === 1)
    .slice(0, 6)
    .forEach((p) => alternatives.push(`The concept of ${p}`));

  return alternatives.slice(0, 10);
}

/**
 * Filter and validate distractor options
 */
function validateDistracters(
  distractors: string[],
  correctAnswer: string,
  topic: string
): string[] {
  return distractors
    .filter((d) => {
      // Don't include empty strings
      if (!d || d.trim().length === 0) return false;

      // Don't duplicate correct answer
      if (d.toLowerCase() === correctAnswer.toLowerCase()) return false;

      // Don't be too similar to correct answer
      const simScore = stringSimilarity(d, correctAnswer);
      if (simScore > 0.9) return false;

      // Don't be too long or too short
      if (d.length < 10 || d.length > 250) return false;

      // Don't include placeholder-like text
      if (/^(option|choice|answer|result|outcome|alternative)/i.test(d)) return false;

      // Must be complete sentences or phrases
      if (d.split(' ').length < 2 && d.length < 20) return false;

      return true;
    })
    .slice(0, 3); // Return top 3 after filtering
}

/**
 * Calculate string similarity (0-1)
 */
function stringSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein distance
 */
function getEditDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Generate intelligent distractors from module content
 * @param correctAnswer - The correct answer/option
 * @param topic - The topic being tested
 * @param moduleContent - The actual lesson content for context
 * @param difficulty - Question difficulty level
 * @returns Array of 3 distractor options
 */
export function generateIntelligentDistracters(
  correctAnswer: string,
  topic: string,
  moduleContent?: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): string[] {
  // Extract key phrases if content available
  const keyPhrases = moduleContent ? extractKeyPhrases(moduleContent, 15) : [];

  // Generate candidate distractors from multiple strategies
  const candidates: Set<string> = new Set();

  // Strategy 1: Misconceptions
  generateMisconceptions(correctAnswer, topic).forEach((m) => candidates.add(m));

  // Strategy 2: Alternatives
  generateAlternatives(topic, keyPhrases).forEach((a) => candidates.add(a));

  // Strategy 3: If we have content, generate from related concepts
  if (moduleContent && moduleContent.length > 100) {
    const phrases = extractKeyPhrases(moduleContent, 10);
    phrases.slice(0, 5).forEach((phrase) => {
      candidates.add(`${phrase} is a key aspect of this concept`);
      candidates.add(`This relates to ${phrase}`);
    });
  }

  // Strategy 4: Difficulty-aware distractors
  if (difficulty === 'hard') {
    // For hard questions, generate more subtle misconceptions
    const words = correctAnswer.split(' ');
    if (words.length > 1) {
      candidates.add(`Confusing ${words[0]} with ${words[1]}`);
      candidates.add(`Mixing up the relationship between key terms`);
    }
  }

  // Validate and return distractors
  const validated = validateDistracters(Array.from(candidates), correctAnswer, topic);

  // If we don't have enough, add generic but topic-relevant alternatives
  while (validated.length < 3) {
    // Prefer other module-derived key phrases as final fallback (more realistic than generic placeholders)
    const pool = keyPhrases
      .map((p) => p.trim())
      .filter((p) => p.length >= 6 && p.toLowerCase() !== correctAnswer.toLowerCase());
    const pick = pool.find((p) => !validated.some((v) => v.toLowerCase() === p.toLowerCase()));
    if (pick) validated.push(pick);
    else validated.push(`A closely related but incorrect alternative to "${correctAnswer}"`);
  }

  return validated.slice(0, 3);
}

/**
 * Generate complete set of 4 options with correct answer
 * Ensures options are randomized
 */
export function generateCompleteOptions(
  correctAnswer: string,
  topic: string,
  moduleContent?: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): string[] {
  const distractors = generateIntelligentDistracters(correctAnswer, topic, moduleContent, difficulty);

  // Ensure exactly 4 options
  while (distractors.length < 3) {
    distractors.push(`An alternative aspect of ${topic}`);
  }

  const options = [correctAnswer, ...distractors.slice(0, 3)];

  // Shuffle options
  return options.sort(() => Math.random() - 0.5);
}
