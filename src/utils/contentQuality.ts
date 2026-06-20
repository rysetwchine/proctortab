/**
 * Content quality heuristics for module text extraction.
 * Goal: detect when extracted text is mostly PDF/font metadata or random garbage,
 * so we can avoid feeding it into question generation.
 */
 
export interface ContentQualityResult {
  readable: boolean;
  score: number; // 0..1 (higher = more readable)
  reasons: string[];
}
 
const PDF_ARTIFACT_KEYWORDS = [
  // Common PDF object/font metadata seen in corrupted extractions
  'basefont',
  'fontdescriptor',
  'fontweight',
  'xheight',
  'capheight',
  'ascent',
  'descent',
  'leading',
  'fontbbox',
  'fontfile',
  'fontfile2',
  'fontfile3',
  'italicangle',
  'stemv',
  'flags',
  'firstchar',
  'lastchar',
  'widths',
  'charset',
  'descendantfonts',
  'tounicode',
  'cidfonttype',
  'cidfonttype2',
  'cidtogidmap',
  'cidsysteminfo',
  'identity-h',
  'winansiencoding',
  'encoding',
  'subtype',
  'type',
  'adobe',
  'ordering',
  'mediabox',
  'flatedecode',
  'endobj',
  'endstream',
  'xref',
  'trailer',
  'obj',
  'stream',
];
 
/**
 * Quick check: does this look like PDF/font metadata rather than real prose?
 */
export function assessContentQuality(text: string): ContentQualityResult {
  const reasons: string[] = [];
  const raw = (text || '').trim();
  if (!raw) return { readable: false, score: 0, reasons: ['empty'] };
 
  // Limit analysis to first N chars for speed/determinism
  const sample = raw.slice(0, 20000);
 
  const totalChars = sample.length;
  const letterChars = (sample.match(/[A-Za-z]/g) || []).length;
  const digitChars = (sample.match(/[0-9]/g) || []).length;
  const spaceChars = (sample.match(/\s/g) || []).length;
  const symbolChars = totalChars - letterChars - digitChars - spaceChars;
 
  const letterRatio = totalChars ? letterChars / totalChars : 0;
  const symbolRatio = totalChars ? symbolChars / totalChars : 1;
 
  // Token-level checks
  const tokens = sample.split(/\s+/).filter(Boolean);
  const tokenCount = Math.max(tokens.length, 1);
  const singleCharTokens = tokens.filter((t) => t.length === 1).length;
  const singleCharRatio = singleCharTokens / tokenCount;
 
  // Repeated short-token check (catches "u u u e a a ..." garbage)
  const freq = new Map<string, number>();
  for (const t of tokens) {
    const k = t.toLowerCase();
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  let maxToken = '';
  let maxCount = 0;
  for (const [k, v] of freq.entries()) {
    if (v > maxCount) {
      maxCount = v;
      maxToken = k;
    }
  }
  const maxTokenRatio = maxCount / tokenCount;

  const artifactHits = tokens.filter((t) =>
    PDF_ARTIFACT_KEYWORDS.includes(t.toLowerCase())
  ).length;
  const artifactRatio = artifactHits / tokenCount;
 
  // "Font subset" patterns like BCDHEE+Arial-BoldMT
  const fontSubsetHits = tokens.filter((t) => /^[A-Z]{3,8}\+/.test(t)).length;
  const fontSubsetRatio = fontSubsetHits / tokenCount;
 
  // Vowel sanity: random garbage tends to have very low vowel percentage in short tokens
  const shortWordTokens = tokens.filter((t) => /^[A-Za-z]{3,8}$/.test(t));
  const shortTotal = Math.max(shortWordTokens.length, 1);
  const shortWithVowels = shortWordTokens.filter((t) => /[aeiou]/i.test(t)).length;
  const shortVowelRatio = shortWithVowels / shortTotal;
 
  // Score composition (simple, interpretable weights)
  let score = 1;
  score -= Math.max(0, 0.55 - letterRatio) * 1.2; // penalize low letters
  score -= Math.max(0, symbolRatio - 0.12) * 1.5; // penalize lots of symbols
  score -= Math.max(0, singleCharRatio - 0.08) * 2.0; // penalize spaced-out garbage
  score -= Math.max(0, artifactRatio - 0.02) * 3.0; // penalize PDF keywords
  score -= Math.max(0, fontSubsetRatio - 0.005) * 4.0; // heavily penalize font subset patterns
  score -= Math.max(0, 0.75 - shortVowelRatio) * 1.0; // penalize low vowels in short words
  // Penalize extremely repetitive short tokens (common in corrupted PDF extractions)
  if (maxToken && maxToken.length <= 2) {
    score -= Math.max(0, maxTokenRatio - 0.05) * 2.5;
  }
 
  // Clamp
  score = Math.max(0, Math.min(1, score));
 
  if (letterRatio < 0.55) reasons.push(`low_letter_ratio:${letterRatio.toFixed(2)}`);
  if (symbolRatio > 0.12) reasons.push(`high_symbol_ratio:${symbolRatio.toFixed(2)}`);
  if (singleCharRatio > 0.08) reasons.push(`many_single_char_tokens:${singleCharRatio.toFixed(2)}`);
  if (artifactRatio > 0.02) reasons.push(`pdf_artifacts:${artifactRatio.toFixed(3)}`);
  if (fontSubsetRatio > 0.005) reasons.push(`font_subset_patterns:${fontSubsetRatio.toFixed(3)}`);
  if (shortVowelRatio < 0.75) reasons.push(`low_vowel_ratio:${shortVowelRatio.toFixed(2)}`);
  if (maxToken && maxToken.length <= 2 && maxTokenRatio > 0.05) {
    reasons.push(`repetitive_short_token:${maxToken}:${maxTokenRatio.toFixed(2)}`);
  }
 
  // Decision threshold:
  // Be careful not to mark real academic text as "unreadable" (false negatives),
  // because that would make the UI show "Empty" even though there is usable content.
  //
  // 1) If score is decent -> readable
  // 2) Otherwise, allow if core signals look like natural text (letters + low PDF artifacts)
  const readable =
    score >= 0.40 ||
    (letterRatio >= 0.45 &&
      artifactRatio <= 0.04 &&
      fontSubsetRatio <= 0.01 &&
      singleCharRatio <= 0.18 &&
      symbolRatio <= 0.18);
  // Hard fail: if it's basically "u u u e a a ..." token soup, never call it readable.
  const tokenSoup =
    (singleCharRatio > 0.22 && maxTokenRatio > 0.10 && maxToken.length <= 2) ||
    (maxTokenRatio > 0.16 && maxToken.length <= 2);
  if (tokenSoup) {
    return { readable: false, score: Math.min(score, 0.2), reasons: [...reasons, 'token_soup'] };
  }
  if (!readable && reasons.length === 0) reasons.push('low_score');
 
  return { readable, score, reasons };
}
 
/**
 * Remove the most common PDF/font artifact patterns while preserving real text.
 * Use this when you detect the extraction has metadata mixed into content.
 */
export function stripPdfFontArtifacts(text: string): string {
  if (!text) return '';
 
  let out = text;
 
  // Drop common PDF dictionary / font blocks that sometimes get extracted as text
  out = out.replace(
    // NOTE:
    // Some corrupted extractions contain slightly mutated tokens like "FontFile2o" or "FontBBox1".
    // Match a broader family of these keywords to strip them reliably.
    /\b(Subtype|BaseFont|FontDescriptor|DescendantFonts|ToUnicode|CIDFontType2|CIDToGIDMap|CIDSystemInfo|Identity-H|Ordering|Adobe|Encoding|FontWeight|XHeight|CapHeight|Ascent|Descent|Leading|FontBBox(?:\w+)?|FontFile(?:\w+)?|ItalicAngle|StemV|Flags|FirstChar|LastChar|Widths|CharSet)\b/gi,
    ' '
  );
 
  // Remove font subset names like "BCDH EE+Arial-BoldMT" or "ABCDEE+TimesNewRomanPSMT"
  out = out.replace(/\b[A-Z]{3,8}\+[A-Za-z0-9-]+\b/g, ' ');
 
  // Remove repeated operator-ish fragments that slip through
  out = out.replace(/\b(ET|BT|TJ|Tj|Tf|Tm|Td|rg|RG)\b/g, ' ');
 
  // Normalize whitespace
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}
