/**
 * Integration layer between Advanced PDF Extractor and existing systems
 * Allows seamless replacement or augmentation of existing PDF extraction
 */

import { extractPdfWithOcr, detectPdfType } from './advancedPdfExtractor';
import { extractFileContent } from './fileContentExtractor';

/**
 * Enhanced file content extraction that uses advanced PDF extractor for PDFs
 * Falls back to original extraction for other file types
 */
export async function extractFileContentEnhanced(
  file: File | Blob,
  mimeType?: string
): Promise<{ content: string; source: 'advanced-pdf' | 'original' | 'hybrid' }> {
  const type = mimeType || (file as File).type || '';
  const fileName = (file as File).name || 'unknown';

  // Use advanced PDF extractor for PDF files
  if (type.includes('pdf')) {
    try {
      console.log(`[Integration] Using advanced PDF extractor for: ${fileName}`);
      const result = await extractPdfWithOcr(file);
      console.log(
        `[Integration] Advanced extraction complete: ${result.metadata.totalExtractedChars} chars using ${result.method}`
      );
      return {
        content: result.text,
        source: 'advanced-pdf',
      };
    } catch (error) {
      console.warn('[Integration] Advanced extractor failed, falling back:', error);
      // Fall back to original extraction
      const content = await extractFileContent(file, mimeType);
      return {
        content,
        source: 'original',
      };
    }
  }

  // Use original extraction for other file types
  console.log(`[Integration] Using original extractor for: ${fileName}`);
  const content = await extractFileContent(file, mimeType);
  return {
    content,
    source: 'original',
  };
}

/**
 * Intelligent extraction that compares both methods for PDFs
 * Useful for testing and optimization
 */
export async function extractFileContentComparative(
  file: File | Blob,
  mimeType?: string
): Promise<{
  content: string;
  advanced: { text: string; chars: number; method: string };
  original: { text: string; chars: number };
  recommended: 'advanced' | 'original' | 'both';
  analysis: string;
}> {
  const type = mimeType || (file as File).type || '';
  const fileName = (file as File).name || 'unknown';

  if (!type.includes('pdf')) {
    // Non-PDF files use original only
    const content = await extractFileContent(file, mimeType);
    return {
      content,
      advanced: { text: '', chars: 0, method: 'n/a' },
      original: { text: content, chars: content.length },
      recommended: 'original',
      analysis: 'Not a PDF file',
    };
  }

  console.log(`[Integration] Comparative analysis for: ${fileName}`);

  try {
    // Run both extraction methods in parallel
    const [advancedResult, originalContent] = await Promise.all([
      extractPdfWithOcr(file),
      extractFileContent(file, mimeType),
    ]);

    const charDifference = advancedResult.metadata.totalExtractedChars - originalContent.length;
    let recommended: 'advanced' | 'original' | 'both' = 'advanced';
    let analysis = '';

    if (charDifference > 1000) {
      recommended = 'advanced';
      analysis = `Advanced method extracted ${charDifference} more characters`;
    } else if (charDifference < -1000) {
      recommended = 'original';
      analysis = `Original method extracted ${Math.abs(charDifference)} more characters`;
    } else {
      recommended = 'both';
      analysis = 'Both methods produced similar results';
    }

    return {
      content: advancedResult.text,
      advanced: {
        text: advancedResult.text,
        chars: advancedResult.metadata.totalExtractedChars,
        method: advancedResult.method,
      },
      original: {
        text: originalContent,
        chars: originalContent.length,
      },
      recommended,
      analysis: `${analysis}. Advanced: ${advancedResult.method}, Original: direct extraction`,
    };
  } catch (error) {
    console.error('[Integration] Comparative analysis failed:', error);
    // Fall back to original only
    const content = await extractFileContent(file, mimeType);
    return {
      content,
      advanced: { text: '', chars: 0, method: 'error' },
      original: { text: content, chars: content.length },
      recommended: 'original',
      analysis: 'Advanced extraction failed, using original only',
    };
  }
}

/**
 * Diagnostic function to analyze a PDF file
 */
export async function analyzePdfFile(
  file: File | Blob
): Promise<{
  fileName: string;
  type: 'text' | 'scanned' | 'mixed';
  confidence: number;
  pageCount: number;
  estimatedSize: string;
  recommendation: string;
  extractionEstimate: {
    method: string;
    expectedChars: number;
    estimatedTime: string;
  };
}> {
  const fileName = (file as File).name || 'unknown';
  const fileSize = file.size;

  try {
    const pdfBytes = await file.arrayBuffer();
    const metadata = await detectPdfType(pdfBytes);

    let method = '';
    let estimatedChars = 0;
    let estimatedTime = '';
    let recommendation = '';

    if (metadata.type === 'text') {
      method = 'Text Extraction (pdfjs-dist)';
      estimatedChars = metadata.textContentLength * (metadata.pageCount / 5); // Extrapolate from sample
      estimatedTime = '<1 second';
      recommendation = 'Fast extraction recommended. PDF contains selectable text.';
    } else if (metadata.type === 'scanned') {
      method = 'OCR (tesseract.js)';
      estimatedChars = Math.min(metadata.pageCount * 2000, 500000); // Rough estimate
      estimatedTime = `${Math.ceil(metadata.pageCount / 2)} seconds`;
      recommendation = 'Slower extraction needed. PDF is scanned/image-based. OCR will be used.';
    } else {
      method = 'Hybrid (Text + OCR)';
      estimatedChars = metadata.textContentLength + Math.min((metadata.pageCount - 5) * 1000, 400000);
      estimatedTime = `${Math.ceil(metadata.pageCount / 3)} seconds`;
      recommendation = 'Mixed content detected. Hybrid approach will extract both text and OCR data.';
    }

    return {
      fileName,
      type: metadata.type,
      confidence: metadata.confidence,
      pageCount: metadata.pageCount,
      estimatedSize: formatBytes(fileSize),
      recommendation,
      extractionEstimate: {
        method,
        expectedChars: estimatedChars,
        estimatedTime,
      },
    };
  } catch (error) {
    console.error('[Integration] PDF analysis failed:', error);
    return {
      fileName,
      type: 'mixed',
      confidence: 0,
      pageCount: 0,
      estimatedSize: formatBytes(fileSize),
      recommendation: 'Analysis failed. Using fallback extraction.',
      extractionEstimate: {
        method: 'Fallback',
        expectedChars: 0,
        estimatedTime: '<1 second',
      },
    };
  }
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Batch extraction for multiple files
 */
export async function extractMultipleFilesEnhanced(
  files: File[],
  options?: {
    onProgress?: (current: number, total: number) => void;
    skipOcr?: boolean;
    maxConcurrent?: number;
  }
): Promise<
  Array<{
    fileName: string;
    content: string;
    source: 'advanced-pdf' | 'original' | 'hybrid';
    status: 'success' | 'partial' | 'failed';
    error?: string;
  }>
> {
  const maxConcurrent = options?.maxConcurrent || 3;
  const results = [];
  let completed = 0;

  for (let i = 0; i < files.length; i += maxConcurrent) {
    const batch = files.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const result = await extractFileContentEnhanced(file);
          return {
            fileName: file.name,
            content: result.content,
            source: result.source,
            status: result.content.length > 0 ? 'success' : 'partial',
          };
        } catch (error) {
          return {
            fileName: file.name,
            content: '',
            source: 'original' as const,
            status: 'failed' as const,
            error: String(error),
          };
        }
      })
    );

    results.push(...batchResults);
    completed += batch.length;

    if (options?.onProgress) {
      options.onProgress(completed, files.length);
    }
  }

  return results;
}
