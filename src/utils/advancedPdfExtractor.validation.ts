/**
 * Advanced PDF Extractor - Comprehensive Test & Validation Suite
 * Use this file to validate the extraction system and test different scenarios
 */

import {
  extractPdfWithOcr,
  detectPdfType,
  clearOcrCache,
  getOcrCacheStats,
} from './advancedPdfExtractor';

import {
  extractFileContentEnhanced,
  extractFileContentComparative,
  analyzePdfFile,
  extractMultipleFilesEnhanced,
} from './advancedPdfExtractor.integration';

/**
 * Test 1: Basic extraction with automatic detection
 */
export async function testBasicExtraction(pdfFile: File | Blob) {
  console.log('\n=== TEST 1: Basic Extraction ===');
  try {
    const result = await extractPdfWithOcr(pdfFile);

    const passed = [
      result.text.length > 0,
      ['text-extraction', 'ocr', 'hybrid', 'fallback'].includes(result.method),
      result.pageCount > 0,
      ['text', 'scanned', 'mixed'].includes(result.type),
    ].every((x) => x);

    console.log(`✓ Text extracted: ${result.metadata.totalExtractedChars} chars`);
    console.log(`✓ Method: ${result.method}`);
    console.log(`✓ Type: ${result.type}`);
    console.log(`✓ Pages: ${result.pageCount}`);
    console.log(`✓ Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%`);
    console.log(`✓ Preview: ${result.text.substring(0, 100)}...`);

    return { passed, result };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Test 2: PDF type detection
 */
export async function testPdfTypeDetection(pdfFile: File | Blob) {
  console.log('\n=== TEST 2: PDF Type Detection ===');
  try {
    const pdfBytes = await pdfFile.arrayBuffer();
    const metadata = await detectPdfType(pdfBytes);

    console.log(`✓ Type detected: ${metadata.type}`);
    console.log(`✓ Confidence: ${(metadata.confidence * 100).toFixed(1)}%`);
    console.log(`✓ Pages: ${metadata.pageCount}`);
    console.log(`✓ Text content in sample: ${metadata.textContentLength} chars`);

    const passed = metadata.confidence > 0;
    return { passed, metadata };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Test 3: Force OCR
 */
export async function testForceOcr(pdfFile: File | Blob) {
  console.log('\n=== TEST 3: Force OCR ===');
  try {
    const result = await extractPdfWithOcr(pdfFile, { forceOcr: true, maxPages: 5 });

    console.log(`✓ Forced OCR: ${result.method}`);
    console.log(`✓ Text extracted: ${result.metadata.totalExtractedChars} chars`);
    console.log(`✓ OCR pages processed: ${result.metadata.ocrPagesProcessed || 'N/A'}`);

    const passed = result.method === 'ocr' || result.metadata.ocrPagesProcessed! > 0;
    return { passed, result };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Test 4: Skip OCR (text only)
 */
export async function testSkipOcr(pdfFile: File | Blob) {
  console.log('\n=== TEST 4: Skip OCR ===');
  try {
    const result = await extractPdfWithOcr(pdfFile, { skipOcr: true });

    console.log(`✓ OCR skipped: ${result.method}`);
    console.log(`✓ Text extracted: ${result.metadata.totalExtractedChars} chars`);

    const passed =
      result.method === 'text-extraction' || result.method === 'fallback';
    return { passed, result };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Test 5: Enhanced extraction (drop-in replacement)
 */
export async function testEnhancedExtraction(pdfFile: File | Blob) {
  console.log('\n=== TEST 5: Enhanced Extraction ===');
  try {
    const { content, source } = await extractFileContentEnhanced(pdfFile);

    console.log(`✓ Content extracted: ${content.length} chars`);
    console.log(`✓ Source: ${source}`);

    const passed = content.length > 0 && ['advanced-pdf', 'original'].includes(source);
    return { passed, content, source };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Test 6: Comparative analysis
 */
export async function testComparativeAnalysis(pdfFile: File | Blob) {
  console.log('\n=== TEST 6: Comparative Analysis ===');
  try {
    const result = await extractFileContentComparative(pdfFile);

    console.log(`✓ Advanced method: ${result.advanced.chars} chars using ${result.advanced.method}`);
    console.log(`✓ Original method: ${result.original.chars} chars`);
    console.log(`✓ Recommended: ${result.recommended}`);
    console.log(`✓ Analysis: ${result.analysis}`);

    const passed = result.content.length > 0;
    return { passed, result };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Test 7: PDF file analysis
 */
export async function testPdfAnalysis(pdfFile: File | Blob) {
  console.log('\n=== TEST 7: PDF Analysis ===');
  try {
    const analysis = await analyzePdfFile(pdfFile);

    console.log(`✓ File: ${analysis.fileName}`);
    console.log(`✓ Type: ${analysis.type}`);
    console.log(`✓ Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
    console.log(`✓ Pages: ${analysis.pageCount}`);
    console.log(`✓ Size: ${analysis.estimatedSize}`);
    console.log(`✓ Method: ${analysis.extractionEstimate.method}`);
    console.log(`✓ Expected chars: ${analysis.extractionEstimate.expectedChars}`);
    console.log(`✓ Time: ${analysis.extractionEstimate.estimatedTime}`);
    console.log(`✓ Recommendation: ${analysis.recommendation}`);

    const passed = analysis.pageCount > 0;
    return { passed, analysis };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Test 8: Batch processing
 */
export async function testBatchProcessing(pdfFiles: File[]) {
  console.log('\n=== TEST 8: Batch Processing ===');
  try {
    let processed = 0;
    const results = await extractMultipleFilesEnhanced(pdfFiles, {
      onProgress: (current, total) => {
        processed = current;
        console.log(`  Progress: ${current}/${total}`);
      },
      maxConcurrent: 2,
    });

    console.log(`✓ Processed: ${results.length} files`);
    console.log(`✓ Success: ${results.filter((r) => r.status === 'success').length}`);
    console.log(`✓ Total content: ${results.reduce((sum, r) => sum + r.content.length, 0)} chars`);

    const passed = results.length === pdfFiles.length;
    return { passed, results };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Test 9: Memory management
 */
export async function testMemoryManagement() {
  console.log('\n=== TEST 9: Memory Management ===');
  try {
    const stats1 = getOcrCacheStats();
    console.log(`✓ Cache entries before clear: ${stats1.entries}`);

    clearOcrCache();
    const stats2 = getOcrCacheStats();
    console.log(`✓ Cache entries after clear: ${stats2.entries}`);

    const passed = stats2.entries === 0;
    return { passed, stats: { before: stats1, after: stats2 } };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Test 10: Large document handling
 */
export async function testLargeDocumentHandling(pdfFile: File | Blob) {
  console.log('\n=== TEST 10: Large Document Handling ===');
  try {
    const start = performance.now();
    const result = await extractPdfWithOcr(pdfFile, { maxPages: 100 });
    const duration = performance.now() - start;

    console.log(`✓ Extracted: ${result.metadata.totalExtractedChars} chars`);
    console.log(`✓ Pages: ${result.pageCount}`);
    console.log(`✓ Duration: ${duration.toFixed(1)}ms`);
    console.log(`✓ Speed: ${(result.metadata.totalExtractedChars / (duration / 1000)).toFixed(0)} chars/sec`);

    const passed = result.metadata.totalExtractedChars > 0;
    return { passed, result, duration };
  } catch (error) {
    console.error('✗ Test failed:', error);
    return { passed: false, error };
  }
}

/**
 * Run all tests
 */
export async function runAllTests(
  pdfFile: File | Blob,
  multipleFiles?: File[]
) {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Advanced PDF Extractor - Test Suite      ║');
  console.log('╚════════════════════════════════════════════╝');

  const results = [];

  // Single file tests
  results.push({
    name: 'Basic Extraction',
    result: await testBasicExtraction(pdfFile),
  });

  results.push({
    name: 'PDF Type Detection',
    result: await testPdfTypeDetection(pdfFile),
  });

  results.push({
    name: 'Force OCR',
    result: await testForceOcr(pdfFile),
  });

  results.push({
    name: 'Skip OCR',
    result: await testSkipOcr(pdfFile),
  });

  results.push({
    name: 'Enhanced Extraction',
    result: await testEnhancedExtraction(pdfFile),
  });

  results.push({
    name: 'Comparative Analysis',
    result: await testComparativeAnalysis(pdfFile),
  });

  results.push({
    name: 'PDF Analysis',
    result: await testPdfAnalysis(pdfFile),
  });

  results.push({
    name: 'Memory Management',
    result: await testMemoryManagement(),
  });

  results.push({
    name: 'Large Document Handling',
    result: await testLargeDocumentHandling(pdfFile),
  });

  // Multiple file tests (if provided)
  if (multipleFiles && multipleFiles.length > 0) {
    results.push({
      name: 'Batch Processing',
      result: await testBatchProcessing(multipleFiles),
    });
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Test Summary                              ║');
  console.log('╚════════════════════════════════════════════╝');

  const passed = results.filter((r) => r.result.passed).length;
  const total = results.length;

  results.forEach((r) => {
    const icon = r.result.passed ? '✓' : '✗';
    console.log(`${icon} ${r.name}`);
  });

  console.log(`\nTotal: ${passed}/${total} tests passed`);
  console.log(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);

  return {
    results,
    summary: {
      passed,
      total,
      successRate: (passed / total) * 100,
    },
  };
}

/**
 * Export for testing
 */
export const TestSuite = {
  testBasicExtraction,
  testPdfTypeDetection,
  testForceOcr,
  testSkipOcr,
  testEnhancedExtraction,
  testComparativeAnalysis,
  testPdfAnalysis,
  testBatchProcessing,
  testMemoryManagement,
  testLargeDocumentHandling,
  runAllTests,
};
