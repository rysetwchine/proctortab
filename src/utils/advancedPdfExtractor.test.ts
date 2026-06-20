/**
 * Test file for Advanced PDF Extractor
 * Demonstrates usage and validates the extraction system
 */

import { extractPdfWithOcr, detectPdfType, clearOcrCache } from './advancedPdfExtractor';

/**
 * Example usage of the advanced PDF extractor
 */
export async function demonstrateUsage() {
  // This is a test/demo function showing how to use the extractor

  // Example 1: Basic extraction with automatic method selection
  // const file = new File([pdfBuffer], 'document.pdf', { type: 'application/pdf' });
  // const result = await extractPdfWithOcr(file);
  // console.log(`Extracted ${result.metadata.totalExtractedChars} characters using ${result.method}`);
  // console.log(`PDF Type: ${result.type}, Pages: ${result.pageCount}`);

  // Example 2: Force OCR processing
  // const ocrResult = await extractPdfWithOcr(file, { forceOcr: true, maxPages: 10 });
  // console.log(`OCR extracted: ${ocrResult.metadata.totalExtractedChars} chars`);

  // Example 3: Skip OCR for text-only PDFs
  // const textOnlyResult = await extractPdfWithOcr(file, { skipOcr: true });
  // console.log(`Text extraction only: ${textOnlyResult.metadata.totalExtractedChars} chars`);

  // Example 4: Detect PDF type before extraction
  // const pdfBytes = await file.arrayBuffer();
  // const typeInfo = await detectPdfType(pdfBytes);
  // console.log(`Detected type: ${typeInfo.type} with ${typeInfo.confidence * 100}% confidence`);

  console.log('Advanced PDF Extractor loaded and ready for use');
}

/**
 * Validate extraction results
 */
export function validateExtractionResult(result: any): boolean {
  const checks = [
    { name: 'Has text content', check: () => result.text && result.text.length > 0 },
    { name: 'Has method info', check: () => result.method && ['text-extraction', 'ocr', 'hybrid', 'fallback'].includes(result.method) },
    { name: 'Has page count', check: () => typeof result.pageCount === 'number' },
    { name: 'Has type', check: () => result.type && ['text', 'scanned', 'mixed'].includes(result.type) },
    { name: 'Has metadata', check: () => result.metadata && result.metadata.totalExtractedChars >= 0 },
  ];

  let allValid = true;
  checks.forEach(({ name, check }) => {
    const valid = check();
    console.log(`  ${valid ? '✓' : '✗'} ${name}`);
    if (!valid) allValid = false;
  });

  return allValid;
}

/**
 * Memory management helper
 */
export function manageMemory() {
  clearOcrCache();
  console.log('OCR cache cleared to free memory');
}
