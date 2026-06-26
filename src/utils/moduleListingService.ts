/**
 * Module Listing Service
 * Handles listing and organizing uploaded module files for selection
 */

import type { CourseModule, ModuleItem } from '@/context/SessionContext';
import { assessContentQuality } from './contentQuality';

function hasEnoughContent(text?: string, minChars: number = 50): boolean {
  const t = (text || '').trim();
  return t.length >= minChars;
}

function isReadableContent(text?: string, minChars: number = 150): boolean {
  const t = (text || '').trim();
  if (t.length < minChars) return false;
  return assessContentQuality(t).readable;
}

export interface SelectableModuleFile {
  id: string;
  fileId: string;
  fileName: string;
  displayName: string;
  fileType: 'pdf' | 'docx' | 'txt' | 'pptx' | 'video' | 'file';
  moduleId: string;
  moduleTitle: string;
  fileSize?: number;
  hasContent: boolean;
  contentPreview?: string;
}

export function getAllSelectableModuleFiles(modules: CourseModule[]): SelectableModuleFile[] {
  const files: SelectableModuleFile[] = [];

  for (const module of modules) {
    const items = module.items || [];
    const hasContentFlag = (module as any)._hasExtractedContent === true ||
                           ((module as any)._contentLength && (module as any)._contentLength > 50);

    if (items.length === 0 && !hasContentFlag) {
      continue;
    }

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

export function getModuleItemsWithContent(module: CourseModule): ModuleItem[] {
  return (module.items || []).filter(
    (item) => hasEnoughContent(item.fileContent, 50)
  );
}

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

export function validateFilesHaveContent(
  modules: CourseModule[],
  fileIds: string[]
): { valid: boolean; emptyCount: number; totalCount: number; details: string[] } {
  const minContentLength = 150;
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
          validCount++;
          details.push(
            readable
              ? `✓ ${item.fileName}: ${contentLength} chars (sufficient)`
              : `⚠ ${item.fileName}: ${contentLength} chars (low-quality extraction; OCR/searchable PDF recommended)`
          );
          console.log(`[Validation] ✓ File ${item.fileName} has sufficient content: ${contentLength} chars`);
        } else {
          details.push(
            !hasEnoughLength
              ? `✗ ${item.fileName}: ${contentLength}/${minContentLength} chars (insufficient)`
              : `⚠ ${item.fileName}: extracted text is low-quality (may need OCR / re-export as searchable PDF)`
          );
          console.warn(`[Validation] ✗ File ${item.fileName} failed content validation (len=${contentLength}, readable=${readable})`);
        }
      }
    }
  }

  console.log(`[Validation] Result: ${validCount}/${totalCount} files have sufficient content`);
  details.forEach((d) => console.log(`[Validation] ${d}`));

  return {
    valid: validCount > 0,
    emptyCount: totalCount - validCount,
    totalCount,
    details,
  };
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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