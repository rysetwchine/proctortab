/**
 * Convert a filename into a clean, user-friendly title.
 *
 * Examples:
 *  - "Week_1_Intro.pdf" -> "Week 1 Intro"
 *  - "chapter-2.notes.v3.PDF" -> "chapter 2 notes v3"
 */
export function deriveCleanTitleFromFilename(filename: string): string {
  const justName = String(filename || '').split(/[/\\]/).pop() || '';

  // Remove the last extension only (handles "file.v2.pdf" -> "file.v2")
  const withoutExt = justName.replace(/\.[^/.]+$/, '');

  // Normalize separators to spaces and collapse whitespace
  const cleaned = withoutExt
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

