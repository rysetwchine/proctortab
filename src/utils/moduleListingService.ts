/**
 * Module Listing Service
 * Handles listing and organizing uploaded module files for selection
 */

import type { CourseModule, ModuleItem } from '@/context/SessionContext';
import { assessContentQuality } from './contentQuality';

/**
 * "Has content" for UI selection should be LENIENT:
 * - If we extracted enough characters, we should allow selection.
 * - Quality issues should be shown as a WARNING, not treated as "Empty".
 *
 * Reason: many PDFs extract messy-but-usable text (still enough to generate good questions after cleaning).
 */
function hasEnoughContent(text?: string, minChars: number = 50): boolean {
  const t = (text || '').trim();
  return t.length >= minChars;
}

function isReadableContent(text?: string, minChars: number = 150): boolean {
  const t = (text || '').trim();
  if (t.length < minChars) return false;
  return assessContentQuality(t).readable;
}

/**
 * Represents a selectable file from a module
 */
export interface SelectableModuleFile {
  id: string;
  fileId: string; // unique identifier for the file within the module
  fileName: string;
  displayName: string;
  fileType: 'pdf' | 'docx' | 'txt' | 'pptx' | 'video' | 'file';
  moduleId: string;
  moduleTitle: string;
  fileSize?: number;
  hasContent: boolean; // whether file content was successfully extracted
  contentPreview?: string; // first 100 chars of content
}

/**
 * Get all selectable files from modules
 * Returns individual files, not grouped by module
 * Falls back to subcollection if module.items is empty
 */
export function getAllSelectableModuleFiles(modules: CourseModule[]): SelectableModuleFile[] {
  const files: SelectableModuleFile[] = [];

  for (const module of modules) {
    // Include modules with items OR modules with _hasExtractedContent flag (from Firestore)
    const items = module.items || [];
    const hasContentFlag = module._hasExtractedContent === true || 
                           (module._contentLength && module._contentLength > 50);
    
    // Skip only if there are truly no items AND no content metadata
    if (items.length === 0 && !hasContentFlag) {
      continue;
    }

    // Process all items that exist
    for (const item of items) {
      const hasContent = hasEnoughContent(item.fileContent, 50);
      
      files.push({
        id: `${module.id}-${item.id}`,
        fileId: item.id,
        fileName: item.fileName || item.title,
        displayName: item.title || item.fileName || `File ${files.length + 1}`,
        fileType: item.type || 'file',
        moduleId: module.id,
        moduleTitle: module.displayName || module.title,
        fileSize: item.fileSize,
        hasContent,
        contentPreview: hasContent 
          ? item.fileContent!.substring(0, 100).replace(/\n/g, ' ') + '...'
          : undefined,
      });
    }
  }

  return files;
}

/**
 * Get files from a specific module
 */
export function getModuleFiles(
  modules: CourseModule[],
  moduleId: string
): SelectableModuleFile[] {
  const module = modules.find((m) => m.id === moduleId);
  if (!module) return [];

  return (module.items || []).map((item, index) => {
    const hasContent = hasEnoughContent(item.fileContent, 50);
    
    return {
      id: `${moduleId}-${item.id}`,
      fileId: item.id,
      fileName: item.fileName || item.title,
      displayName: item.title || item.fileName || `File ${index + 1}`,
      fileType: item.type || 'file',
      moduleId,
      moduleTitle: module.displayName || module.title,
      fileSize: item.fileSize,
      hasContent,
      contentPreview: hasContent
        ? item.fileContent!.substring(0, 100).replace(/\n/g, ' ') + '...'
        : undefined,
    };
  });
}

/**
 * Get module items that have actual content extracted
 */
export function getModuleItemsWithContent(module: CourseModule): ModuleItem[] {
  return (module.items || []).filter(
    (item) => hasEnoughContent(item.fileContent, 50)
  );
}

/**
 * Get combined content from multiple files
 */
export function getCombinedModuleContent(
  modules: CourseModule[],
  fileIds: string[]
): string {
  const contents: string[] = [];

  for (const module of modules) {
    for (const item of module.items || []) {
      if (fileIds.includes(`${module.id}-${item.id}`) && item.fileContent) {
        contents.push(item.fileContent);
      }
    }
  }

  return contents.filter(Boolean).join('\n\n---\n\n');
}

/**
 * Get content from a specific file
 */
export function getFileContent(
  modules: CourseModule[],
  fileId: string
): string {
  for (const module of modules) {
    for (const item of module.items || []) {
      if (`${module.id}-${item.id}` === fileId && item.fileContent) {
        return item.fileContent;
      }
    }
  }
  return '';
}

/**
 * Check if files have valid content for question generation
 * Validates that extracted content is sufficient for AI-based question generation
 */
export function validateFilesHaveContent(
  modules: CourseModule[],
  fileIds: string[]
): { valid: boolean; emptyCount: number; totalCount: number; details: string[] } {
  const minContentLength = 150; // Require at least 150 chars
  let validCount = 0;
  const totalCount = fileIds.length;
  const details: string[] = [];

  for (const module of modules) {
    for (const item of module.items || []) {
      const fullId = `${module.id}-${item.id}`;
      if (fileIds.includes(fullId)) {
        const contentLength = item.fileContent?.trim().length || 0;
        const readable = isReadableContent(item.fileContent, minContentLength);
        const hasEnoughLength = contentLength > minContentLength;
        
        if (hasEnoughLength) {
          // Allow generation as long as we have enough extracted characters.
          // If quality is low, we still allow but surface a warning instead of blocking the user.
          validCount++;
          details.push(
            readable
              ? `✓ ${item.fileName}: ${contentLength} chars (sufficient)`
              : `⚠ ${item.fileName}: ${contentLength} chars (low-quality extraction; OCR/searchable PDF recommended)`
          );
          console.log(
            `[Validation] ✓ File ${item.fileName} has sufficient content: ${contentLength} chars`
          );
        } else {
          details.push(
            !hasEnoughLength
              ? `✗ ${item.fileName}: ${contentLength}/${minContentLength} chars (insufficient)`
              : `⚠ ${item.fileName}: extracted text is low-quality (may need OCR / re-export as searchable PDF)`
          );
          console.warn(
            `[Validation] ✗ File ${item.fileName} failed content validation (len=${contentLength}, readable=${readable})`
          );
        }
      }
    }
  }

  console.log(
    `[Validation] Result: ${validCount}/${totalCount} files have sufficient content`
  );
  details.forEach((d) => console.log(`[Validation] ${d}`));

  return {
    valid: validCount > 0,
    emptyCount: totalCount - validCount,
    totalCount,
    details,
  };
}

/**
 * Format file size for display (e.g., "1.5 MB")
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get icon for file type
 */
export function getFileTypeIcon(
  fileType: 'pdf' | 'docx' | 'txt' | 'pptx' | 'video' | 'file'
): string {
  const icons: Record<string, string> = {
    pdf: '📄',
    docx: '📝',
    txt: '📋',
    pptx: '🎯',
    video: '🎬',
    file: '📦',
  };
  return icons[fileType] || '📦';
}
