import { assessContentQuality, stripPdfFontArtifacts, type ContentQualityResult } from './contentQuality';

export interface KnowledgeChunk {
  id: string;
  text: string;
  score: number; // 0..1
  readable: boolean;
  reasons: string[];
}

export interface ModuleKnowledge {
  version: 1;
  generatedAt: string; // ISO
  stats: {
    sourceChars: number;
    cleanedChars: number;
    keptChunks: number;
    rejectedChunks: number;
  };
  topics: string[];
  subtopics: string[];
  learningObjectives: string[];
  keyConcepts: string[];
  importantTerms: string[];
  definitions: Array<{ term: string; definition: string }>;
  processes: string[];
  examples: string[];
  summaries: string[];
  chunks: KnowledgeChunk[]; // only high-quality chunks
}

/**
 * STEP 1: Cleaning for knowledge extraction (NOT the same as "PDF corruption cleaning" alone).
 * Goal: preserve real learning content while removing repeated headers, TOC fragments, PDF operators, etc.
 */
export function cleanForKnowledge(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // Remove the most common PDF/font artifact patterns first
  text = stripPdfFontArtifacts(text);
  // Extra safety: remove font-metric strings that sometimes survive tokenization.
  text = text.replace(
    /\b(FontWeight|XHeight|CapHeight|Ascent|Descent|Leading|FontBBox|FontFile2?|ItalicAngle|StemV|Widths|FirstChar|LastChar|CharSet)\b/gi,
    ' '
  );

  // Normalize
  text = text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  // Remove explicit PDF operators/markers and common binary remnants
  text = text.replace(
    /\b(endstream|endobj|stream|obj|xref|trailer|startxref|flatedecode|mediabox|contents|length)\b/gi,
    ' '
  );

  // Remove timestamps / weird doc markers (seen in Office exports)
  text = text.replace(/\bD:\d{8,}\+00'?00'?\b/g, ' ');

  // Remove table-of-contents-ish lines: "1.2 Something .... 14"
  text = text
    .split('\n')
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (/^table of contents/i.test(l)) return false;
      if (/^\d+(\.\d+)*\s+.+\s\.{2,}\s*\d+\s*$/.test(l)) return false;
      if (/^page\s*\d+\s*$/i.test(l)) return false;
      return true;
    })
    .join('\n');

  // Remove repeated headers/footers heuristically (lines that appear many times)
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const freq = new Map<string, number>();
  for (const l of lines) freq.set(l, (freq.get(l) || 0) + 1);

  const filtered = lines.filter((l) => {
    if (l.length < 6) return true;
    const count = freq.get(l) || 0;
    // if a line repeats a lot, it's likely a header/footer
    if (count >= 5 && l.length <= 80) return false;
    return true;
  });

  return filtered.join('\n').replace(/\s+\n/g, '\n').trim();
}

/**
 * STEP 2: Chunking + readability validation.
 * Keep only chunks that pass content quality checks.
 */
export function buildKnowledgeChunks(
  cleanedText: string,
  opts?: { maxChunks?: number; chunkChars?: number }
): { kept: KnowledgeChunk[]; rejected: KnowledgeChunk[] } {
  const maxChunks = opts?.maxChunks ?? 40;
  const chunkChars = opts?.chunkChars ?? 900;

  const paragraphs = cleanedText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const rawChunks: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= chunkChars) {
      rawChunks.push(p);
    } else {
      for (let i = 0; i < p.length; i += chunkChars) {
        rawChunks.push(p.slice(i, i + chunkChars));
      }
    }
  }

  const kept: KnowledgeChunk[] = [];
  const rejected: KnowledgeChunk[] = [];
  let idx = 0;

  for (const c of rawChunks) {
    const sample = c.replace(/\s+/g, ' ').trim();
    if (sample.length < 150) continue;

    const q: ContentQualityResult = assessContentQuality(sample);
    const chunk: KnowledgeChunk = {
      id: `k${idx++}`,
      text: sample,
      score: q.score,
      readable: q.readable,
      reasons: q.reasons,
    };
    if (q.readable && q.score >= 0.45) kept.push(chunk);
    else rejected.push(chunk);

    if (kept.length >= maxChunks) break;
  }

  // Sort best chunks first (higher signal to the generator)
  kept.sort((a, b) => b.score - a.score);
  return { kept, rejected };
}

function uniqTop(items: string[], max = 20): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const k = it.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it.trim());
    if (out.length >= max) break;
  }
  return out;
}

function extractHeadings(lines: string[]): string[] {
  const headings: string[] = [];
  for (const l of lines) {
    const s = l.trim();
    if (s.length < 6 || s.length > 90) continue;
    // Reject numeric-only headings like "1" / "2" (common page artifacts)
    if (/^\d+$/.test(s)) continue;
    // heading-like: Title Case / ALL CAPS / numbered section
    if (/^\d+(\.\d+)*\s+[A-Za-z].+/.test(s)) headings.push(s.replace(/^\d+(\.\d+)*\s+/, ''));
    else if (/^[A-Z][A-Za-z0-9 ,:\-]{4,}$/.test(s) && !/[.!?]$/.test(s)) headings.push(s);
    else if (/^[A-Z0-9 ,:\-]{8,}$/.test(s) && !/[.!?]$/.test(s)) headings.push(s);
  }
  return uniqTop(headings, 25);
}

function extractLearningObjectives(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const s = l.trim();
    if (!s) continue;
    if (/^(learning objectives|objectives|outcomes)\b/i.test(s)) continue;
    if (/^(students (will|should) be able to|you (will|should) be able to)\b/i.test(s)) out.push(s);
    if (/^(after (reading|completing) this|by the end of this)\b/i.test(s)) out.push(s);
  }
  return uniqTop(out, 20);
}

function extractDefinitions(text: string): Array<{ term: string; definition: string }> {
  const defs: Array<{ term: string; definition: string }> = [];
  const candidates = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (const line of candidates) {
    // "Term: definition"
    const colon = line.match(/^([A-Za-z][A-Za-z0-9 \-]{2,60}):\s+(.{30,})$/);
    if (colon) {
      const term = colon[1].trim();
      if (!/^\d+$/.test(term)) defs.push({ term, definition: colon[2].trim() });
      continue;
    }

    // "X is/are/means/refers to/defined as ..."
    const isDef = line.match(
      /^([A-Za-z][A-Za-z0-9 \-]{2,60})\s+(is|are|means|refers to|is defined as|are defined as)\s+(.{30,})$/i
    );
    if (isDef) {
      const term = isDef[1].trim();
      if (!/^\d+$/.test(term)) defs.push({ term, definition: isDef[3].trim() });
    }
  }

  // de-dup + cap
  const seen = new Set<string>();
  const unique: Array<{ term: string; definition: string }> = [];
  for (const d of defs) {
    const key = d.term.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
    if (unique.length >= 25) break;
  }
  return unique;
}

function extractImportantTerms(text: string, defs: Array<{ term: string; definition: string }>): string[] {
  const terms = new Set<string>();
  for (const d of defs) terms.add(d.term);

  // Pull capitalized multi-word terms (very rough noun phrase heuristic)
  const matches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g) || [];
  for (const m of matches) {
    const t = m.trim();
    if (t.length < 4) continue;
    if (/^\d+$/.test(t)) continue;
    if (/^(The|This|That|These|Those|Figure|Table|Chapter|Section)$/i.test(t)) continue;
    terms.add(t);
    if (terms.size >= 60) break;
  }

  return uniqTop([...terms], 30);
}

function extractProcesses(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const l of lines) {
    if (/\b(steps|procedure|process|workflow|pipeline|phases)\b/i.test(l) && l.length <= 160) {
      out.push(l);
    }
    if (/^(step\s*\d+|phase\s*\d+)\b/i.test(l)) out.push(l);
  }
  return uniqTop(out, 15);
}

function extractExamples(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const l of lines) {
    if (/^(example|e\.g\.)\b/i.test(l) && l.length <= 200) out.push(l);
    if (/\b(for example|for instance|such as)\b/i.test(l) && l.length <= 200) out.push(l);
  }
  return uniqTop(out, 12);
}

function extractKeyConcepts(chunks: KnowledgeChunk[], defs: Array<{ term: string; definition: string }>): string[] {
  // Prefer defined terms first, then add top repeated content words.
  const concepts = new Set<string>();
  for (const d of defs.slice(0, 12)) concepts.add(d.term);

  const stop = new Set([
    'the','and','for','with','from','that','this','these','those','into','over','under','between','within',
    'what','when','where','which','who','whom','why','how','also','because','therefore','however','more','most',
    'use','used','using','can','could','may','might','must','should','would','will','shall',
  ]);

  const freq = new Map<string, number>();
  for (const c of chunks.slice(0, 20)) {
    const words = c.text
      .toLowerCase()
      .replace(/[^a-z0-9 \-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !stop.has(w));
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  }

  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([w]) => w);

  for (const w of top) concepts.add(w);
  return uniqTop([...concepts].map((s) => s.replace(/\b\w/g, (m) => m.toUpperCase())), 20);
}

/**
 * STEP 2: Knowledge analysis — build structured learning data.
 */
export function analyzeModuleKnowledge(rawExtractedText: string): {
  cleanedContent: string;
  knowledge: ModuleKnowledge;
  rejectedChunks: KnowledgeChunk[];
} {
  const sourceChars = rawExtractedText?.length || 0;
  const cleanedContent = cleanForKnowledge(rawExtractedText);
  const cleanedChars = cleanedContent.length;

  const { kept, rejected } = buildKnowledgeChunks(cleanedContent);

  const lines = cleanedContent.split('\n').map((l) => l.trim()).filter(Boolean);

  const topics = extractHeadings(lines);
  const learningObjectives = extractLearningObjectives(lines);
  const definitions = extractDefinitions(cleanedContent);
  const importantTerms = extractImportantTerms(cleanedContent, definitions);
  const processes = extractProcesses(cleanedContent);
  const examples = extractExamples(cleanedContent);
  const keyConcepts = extractKeyConcepts(kept, definitions);

  const knowledge: ModuleKnowledge = {
    version: 1,
    generatedAt: new Date().toISOString(),
    stats: {
      sourceChars,
      cleanedChars,
      keptChunks: kept.length,
      rejectedChunks: rejected.length,
    },
    topics,
    subtopics: [],
    learningObjectives,
    keyConcepts,
    importantTerms,
    definitions,
    processes,
    examples,
    summaries: [],
    chunks: kept,
  };

  return { cleanedContent, knowledge, rejectedChunks: rejected };
}

/**
 * Build AI-safe context: structured + only high-quality chunks.
 * This is what should be sent to the AI instead of raw extracted PDF text.
 */
export function buildKnowledgeContextForAI(knowledge: ModuleKnowledge): string {
  const safeList = (label: string, items: string[], max = 12) =>
    items && items.length
      ? `${label}:\n- ${items.slice(0, max).map((s) => s.trim()).filter(Boolean).join('\n- ')}\n`
      : '';

  const defs =
    knowledge.definitions && knowledge.definitions.length
      ? `Key definitions:\n- ${knowledge.definitions
          .slice(0, 12)
          .map((d) => `${d.term}: ${d.definition}`)
          .join('\n- ')}\n`
      : '';

  const excerpts =
    knowledge.chunks && knowledge.chunks.length
      ? `High-quality excerpts (validated):\n${knowledge.chunks
          .slice(0, 10)
          .map((c, i) => `[E${i + 1} | score=${c.score.toFixed(2)}] ${c.text}`)
          .join('\n\n')}\n`
      : '';

  return [
    safeList('Topics', knowledge.topics, 12),
    safeList('Learning objectives', knowledge.learningObjectives, 10),
    safeList('Key concepts', knowledge.keyConcepts, 12),
    safeList('Important terms', knowledge.importantTerms, 12),
    defs,
    safeList('Processes / procedures', knowledge.processes, 10),
    safeList('Examples', knowledge.examples, 8),
    excerpts,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Build a compact AI-safe context that fits within a character budget.
 * This prevents token overflow / truncated JSON when requesting many questions.
 */
export function buildCompactKnowledgeContextForAI(
  knowledge: ModuleKnowledge,
  opts?: {
    maxChars?: number;
    maxTopics?: number;
    maxConcepts?: number;
    maxTerms?: number;
    maxObjectives?: number;
    maxDefinitions?: number;
    maxProcesses?: number;
    maxExamples?: number;
    maxExcerpts?: number;
  }
): string {
  const maxChars = opts?.maxChars ?? 7000;
  const maxTopics = opts?.maxTopics ?? 10;
  const maxConcepts = opts?.maxConcepts ?? 10;
  const maxTerms = opts?.maxTerms ?? 10;
  const maxObjectives = opts?.maxObjectives ?? 8;
  const maxDefinitions = opts?.maxDefinitions ?? 10;
  const maxProcesses = opts?.maxProcesses ?? 6;
  const maxExamples = opts?.maxExamples ?? 6;
  const maxExcerpts = opts?.maxExcerpts ?? 2;

  const safeList = (label: string, items: string[], max = 10) =>
    items && items.length
      ? `${label}:\n- ${items.slice(0, max).map((s) => s.trim()).filter(Boolean).join('\n- ')}\n`
      : '';

  const defs =
    knowledge.definitions && knowledge.definitions.length
      ? `Key definitions:\n- ${knowledge.definitions
          .slice(0, maxDefinitions)
          .map((d) => `${d.term}: ${d.definition}`)
          .join('\n- ')}\n`
      : '';

  const excerpts =
    knowledge.chunks && knowledge.chunks.length
      ? `High-quality excerpts (validated):\n${knowledge.chunks
          .slice(0, maxExcerpts)
          .map((c, i) => `[E${i + 1} | score=${c.score.toFixed(2)}] ${c.text}`)
          .join('\n\n')}\n`
      : '';

  const parts = [
    safeList('Topics', knowledge.topics, maxTopics),
    safeList('Learning objectives', knowledge.learningObjectives, maxObjectives),
    safeList('Key concepts', knowledge.keyConcepts, maxConcepts),
    safeList('Important terms', knowledge.importantTerms, maxTerms),
    defs,
    safeList('Processes / procedures', knowledge.processes, maxProcesses),
    safeList('Examples', knowledge.examples, maxExamples),
    excerpts,
  ].filter(Boolean);

  let out = '';
  for (const p of parts) {
    if ((out + '\n' + p).length > maxChars) break;
    out = out ? out + '\n' + p : p;
  }
  return out.trim();
}
