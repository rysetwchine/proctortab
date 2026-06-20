/**
 * Advanced PDF Extractor with OCR Support
 * Handles both text-based and scanned PDFs with comprehensive error handling
 * Uses pdfjs-dist for text extraction and tesseract.js for OCR on scanned PDFs
 */

// Both modules will be dynamically imported at runtime
let pdfjsLib: any = null;
let TesseractLib: any = null;

// Worker path cache
let cachedWorkerUrl: string | null = null;

// Initialize pdfjs dynamically - handles loading at runtime to avoid build-time issues
async function initializePdfJs() {
  if (pdfjsLib) return pdfjsLib;
  
  try {
    console.log("[AdvancedPDF] Initializing pdfjs-dist...");
    
    // Use string concatenation to build module name - completely bypasses Vite's static analysis
    // Vite's regex can't detect this pattern
    const moduleName = 'pdf' + 'js' + '-' + 'dist';
    const pdfjsModule: any = await import(moduleName as any);
    
    // Normalize module shape across pdfjs-dist versions/bundlers (see fileContentExtractor.ts)
    const normalized =
      pdfjsModule?.getDocument
        ? pdfjsModule
        : pdfjsModule?.default?.getDocument
          ? pdfjsModule.default
          : pdfjsModule?.pdfjsLib?.getDocument
            ? pdfjsModule.pdfjsLib
            : pdfjsModule;
    
    pdfjsLib = normalized;
    
    // Set worker source with CDN fallback
    if (!cachedWorkerUrl) {
      // Keep this in sync with package.json's pdfjs-dist major version.
      cachedWorkerUrl = "https://unpkg.com/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs";
      console.log("[AdvancedPDF] Setting worker URL to CDN");
    }
    
    if (!pdfjsLib?.GlobalWorkerOptions) {
      throw new Error('pdfjs-dist loaded but GlobalWorkerOptions is missing (unexpected module shape)');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = cachedWorkerUrl;
    console.log("[AdvancedPDF] ✅ pdfjs-dist initialized");
    console.log("[AdvancedPDF]   Worker URL:", cachedWorkerUrl);
    
    return pdfjsLib;
  } catch (error) {
    console.error("[AdvancedPDF] ❌ Failed to initialize pdfjs-dist:", error instanceof Error ? error.message : error);
    throw error;
  }
}

// Initialize tesseract dynamically
let ocrAvailable = true;
async function initializeTesseract() {
  if (TesseractLib) return TesseractLib;
  
  try {
    console.log("[AdvancedPDF] Initializing tesseract.js...");
    // Use string concatenation to bypass Vite's static import analysis.
    // This keeps OCR OPTIONAL: if tesseract.js isn't installed, the app should still run
    // (OCR will be unavailable, but text-based PDFs will continue to work).
    const moduleName = 'tes' + 'ser' + 'act.js';
    const tesseract = await import(moduleName as any);
    TesseractLib = tesseract.default || tesseract;
    ocrAvailable = true;
    console.log("[AdvancedPDF] ✅ tesseract.js initialized");
    return TesseractLib;
  } catch (error) {
    console.error("[AdvancedPDF] Failed to initialize tesseract.js (OCR disabled):", error);
    // Do NOT throw: allow app to continue without OCR.
    ocrAvailable = false;
    return null as any;
  }
}

interface ExtractionResult {
  text: string;
  method: 'text-extraction' | 'ocr' | 'hybrid' | 'fallback';
  pageCount: number;
  type: 'text' | 'scanned' | 'mixed';
  metadata: {
    textCharsExtracted: number;
    ocrPagesProcessed?: number;
    totalExtractedChars: number;
    confidence?: number;
  };
}

interface PdfExtractionMetadata {
  type: 'text' | 'scanned' | 'mixed';
  textContentLength: number;
  pageCount: number;
  confidence: number;
}

// OCR result cache to avoid reprocessing the same images
const ocrCache = new Map<string, string>();

/**
 * Clean corrupted PDF text by removing non-printable characters and PDF artifacts
 * Fixes issues where raw PDF binary content like 'endstream obj /FlateDecode' gets included
 */
function cleanPdfText(text: string): string {
  return text
    // Remove broken unicode / binary garbage - keep only printable ASCII and common whitespace
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    // Remove repeated spaces
    .replace(/\s+/g, ' ')
    // Remove PDF stream operators and markers
    .replace(/\b(endstream|endobj|stream|obj|FlateDecode|Length|Tf|Tj|TJ|ET|BT|RG|rg|re|w|S|f|F|n|i|j|J|M|d|gs|Tm|Tz|TL|Tc|Tw|Tr|Ts|Td|T\*)\b/g, '')
    // Remove hex strings and encoded content
    .replace(/<[A-Fa-f0-9]*>/g, '')
    // Remove remaining PDF-specific syntax
    .replace(/[\[\](){}/<>%]/g, ' ')
    .trim();
}

/**
 * Detect PDF type by analyzing text content
 * Returns 'text' if mostly extractable text, 'scanned' if mostly images, 'mixed' if both
 */
export async function detectPdfType(
  pdfBytes: ArrayBuffer
): Promise<PdfExtractionMetadata> {
  try {
    const pdfjs = await initializePdfJs();
    const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
    const pageCount = Math.min(pdf.numPages, 5); // Sample first 5 pages
    let totalTextLength = 0;
    let pagesWithText = 0;

    for (let i = 1; i <= pageCount; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => (item.str ? item.str : ''))
          .join(' ');

        if (pageText.trim().length > 0) {
          totalTextLength += pageText.length;
          pagesWithText++;
        }
      } catch (e) {
        console.warn(`[AdvancedPDF] Error sampling page ${i}:`, e);
      }
    }

    // Determine type based on text content percentage
    const textPercentage = (pagesWithText / pageCount) * 100;
    let type: 'text' | 'scanned' | 'mixed';
    let confidence: number;

    if (textPercentage >= 80) {
      type = 'text';
      confidence = 0.95;
    } else if (textPercentage <= 20) {
      type = 'scanned';
      confidence = 0.85;
    } else {
      type = 'mixed';
      confidence = 0.75;
    }

    console.log(
      `[AdvancedPDF] Detected type: ${type} (${textPercentage.toFixed(0)}% pages with text, ${totalTextLength} chars total)`
    );

    return {
      type,
      textContentLength: totalTextLength,
      pageCount: pdf.numPages,
      confidence,
    };
  } catch (error) {
    console.error('[AdvancedPDF] Error detecting PDF type:', error);
    return {
      type: 'mixed',
      textContentLength: 0,
      pageCount: 1,
      confidence: 0.2,
    };
  }
}

/**
 * Extract text from PDF page using canvas rendering
 * Used for OCR processing
 */
async function extractPageImage(
  pdfPage: any,
  scale: number = 2
): Promise<string> {
  try {
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Cannot get canvas context');
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await pdfPage.render(renderContext).promise;
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('[AdvancedPDF] Error extracting page image:', error);
    return '';
  }
}

/**
 * Process a single image with OCR
 */
async function processImageWithOcr(imageDataUrl: string): Promise<string> {
  // Check cache first
  const cacheKey = imageDataUrl.substring(0, 50); // Use first 50 chars as key
  if (ocrCache.has(cacheKey)) {
    console.log('[AdvancedPDF] Using cached OCR result');
    return ocrCache.get(cacheKey) || '';
  }

  try {
    const Tesseract = await initializeTesseract();
    if (!Tesseract || !ocrAvailable) {
      console.warn('[AdvancedPDF] OCR requested but tesseract.js is not available');
      return '';
    }
    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m: any) => {
        if (m.status === 'recognizing') {
          console.log(`[AdvancedPDF] OCR progress: ${(m.progress * 100).toFixed(1)}%`);
        }
      },
    });

    const text = result.data.text || '';
    ocrCache.set(cacheKey, text);
    return text;
  } catch (error) {
    console.error('[AdvancedPDF] OCR processing failed:', error);
    return '';
  }
}

/**
 * Extract text from PDF using pdfjs-dist
 */
async function extractTextViaTextExtraction(
  pdfBytes: ArrayBuffer,
  maxPages: number = 100
): Promise<{ text: string; pageCount: number; successfulPages: number }> {
  try {
    const pdfjs = await initializePdfJs();
    const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
    const pagesToProcess = Math.min(pdf.numPages, maxPages);
    let fullText = '';
    let successfulPages = 0;

    console.log(`[AdvancedPDF] Text extraction: processing ${pagesToProcess} pages`);

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => (item.str ? item.str : ''))
          .join(' ');

        if (pageText.trim().length > 0) {
          fullText += pageText + '\n';
          successfulPages++;
        }
      } catch (pageError) {
        console.warn(`[AdvancedPDF] Error on page ${pageNum}:`, pageError);
      }
    }

    const cleanedText = fullText.replace(/\s+/g, ' ').trim();
    return {
      text: cleanedText,
      pageCount: pdf.numPages,
      successfulPages,
    };
  } catch (error) {
    console.error('[AdvancedPDF] Text extraction failed:', error);
    return { text: '', pageCount: 0, successfulPages: 0 };
  }
}

/**
 * Extract text from PDF using OCR on canvas-rendered images
 */
async function extractTextViaOcr(
  pdfBytes: ArrayBuffer,
  maxPages: number = 20 // OCR is slower, so limit pages
): Promise<{ text: string; pageCount: number; ocrPagesProcessed: number }> {
  try {
    // Check if canvas is available (won't work in Node.js)
    if (typeof document === 'undefined') {
      console.warn('[AdvancedPDF] Canvas not available, skipping OCR');
      return { text: '', pageCount: 0, ocrPagesProcessed: 0 };
    }

    const pdfjs = await initializePdfJs();
    const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
    const pagesToProcess = Math.min(pdf.numPages, maxPages);
    let fullText = '';
    let ocrPagesProcessed = 0;

    console.log(`[AdvancedPDF] OCR extraction: processing ${pagesToProcess} pages`);

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      try {
        console.log(`[AdvancedPDF] OCR processing page ${pageNum}/${pagesToProcess}`);
        const page = await pdf.getPage(pageNum);
        const imageDataUrl = await extractPageImage(page);

        if (imageDataUrl) {
          const pageText = await processImageWithOcr(imageDataUrl);
          if (pageText.trim().length > 0) {
            fullText += pageText + '\n';
            ocrPagesProcessed++;
          }
        }
      } catch (pageError) {
        console.warn(`[AdvancedPDF] OCR error on page ${pageNum}:`, pageError);
      }
    }

    const cleanedText = fullText.replace(/\s+/g, ' ').trim();
    return {
      text: cleanedText,
      pageCount: pdf.numPages,
      ocrPagesProcessed,
    };
  } catch (error) {
    console.error('[AdvancedPDF] OCR extraction failed:', error);
    return { text: '', pageCount: 0, ocrPagesProcessed: 0 };
  }
}

/**
 * Fallback extraction using regex on raw PDF bytes
 */
function extractTextViaFallback(pdfBytes: ArrayBuffer): { text: string; successfulPages: number } {
  try {
    const uint8Array = new Uint8Array(pdfBytes);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let text = decoder.decode(uint8Array);

    // Remove null bytes and control characters
    text = text
      .replace(/[\x00]/g, '')
      .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F]/g, ' ');

    // Extract text between PDF text markers
    const btMatches = text.match(/BT(.+?)ET/gs) || [];
    let extractedText = btMatches
      .map((match) => {
        const textMatches = match.match(/\(([^)]*)\)/g) || [];
        return textMatches
          .map((m) =>
            m
              .slice(1, -1)
              .replace(/\\(.)/g, '$1')
              .replace(/\\n/g, ' ')
              .replace(/\\r/g, ' ')
          )
          .join(' ')
          .trim();
      })
      .filter(Boolean)
      .join(' ');

    // If BT/ET extraction didn't yield much, try stream data
    if (!extractedText || extractedText.length < 100) {
      const streamMatches = text.match(/stream\n(.+?)\nendstream/gs) || [];
      const streamText = streamMatches
        .map((match) =>
          match
            .replace(/stream\n/, '')
            .replace(/\nendstream/, '')
            .replace(/\/F\d+[\s\d.]+Tf/g, ' ')
            .replace(/Tj|TJ|\'|"/g, ' ')
            .replace(/[\[\](){}]/g, ' ')
            .replace(/\d+\s+m|l|h|f|S|re/g, ' ')
            .replace(/[^\x20-\x7E\n]/g, ' ')
        )
        .join(' ');

      if (streamText.length > extractedText.length) {
        extractedText = streamText;
      }
    }

    extractedText = extractedText.replace(/\s+/g, ' ').trim();
    console.log(`[AdvancedPDF] Fallback extraction: ${extractedText.length} chars`);

    return {
      text: extractedText,
      successfulPages: extractedText.length > 0 ? 1 : 0,
    };
  } catch (error) {
    console.error('[AdvancedPDF] Fallback extraction failed:', error);
    return { text: '', successfulPages: 0 };
  }
}

/**
 * Main extraction function - automatically chooses the best method
 */
export async function extractPdfWithOcr(
  file: File | Blob,
  options?: {
    maxPages?: number;
    forceOcr?: boolean;
    skipOcr?: boolean;
  }
): Promise<ExtractionResult> {
  const maxPages = options?.maxPages || 100;
  const forceOcr = options?.forceOcr || false;
  const skipOcr = options?.skipOcr || false;

  const fileName = (file as File).name || 'unknown';
  console.log(`[AdvancedPDF] 🚀 Starting extraction for: ${fileName}`);
  console.log(`[AdvancedPDF]   📏 Max pages: ${maxPages}, ForceOCR: ${forceOcr}, SkipOCR: ${skipOcr}`);

  try {
    // Convert to ArrayBuffer
    const pdfBytes = await file.arrayBuffer();
    console.log(`[AdvancedPDF] 📦 File loaded: ${pdfBytes.byteLength} bytes`);

    // Step 1: Detect PDF type
    const metadata = await detectPdfType(pdfBytes);
    console.log(`[AdvancedPDF] 🔍 PDF Type detected: ${metadata.type}`);
    console.log(`[AdvancedPDF]   📄 Pages: ${metadata.pageCount}, Initial text: ${metadata.textContentLength} chars`);

    let finalText = '';
    let method: ExtractionResult['method'] = 'fallback';
    let totalExtractedChars = 0;
    let textCharsExtracted = 0;
    let ocrPagesProcessed = 0;

    // Step 2: Choose extraction strategy
    if (forceOcr && !skipOcr) {
      // Force OCR only
      const ocrResult = await extractTextViaOcr(pdfBytes, maxPages);
      finalText = ocrResult.text;
      method = 'ocr';
      ocrPagesProcessed = ocrResult.ocrPagesProcessed;
      totalExtractedChars = ocrResult.text.length;
    } else if (metadata.type === 'text' && !forceOcr) {
      // Use text extraction for text-based PDFs
      const textResult = await extractTextViaTextExtraction(pdfBytes, maxPages);
      if (textResult.text.length > 100) {
        finalText = textResult.text;
        method = 'text-extraction';
        textCharsExtracted = textResult.text.length;
        totalExtractedChars = textResult.text.length;
      } else {
        // Fallback to OCR if text extraction yielded little
        if (!skipOcr) {
          console.log('[AdvancedPDF] Text extraction minimal, trying OCR');
          const ocrResult = await extractTextViaOcr(pdfBytes, maxPages);
          if (ocrResult.text.length > textResult.text.length) {
            finalText = ocrResult.text;
            method = 'hybrid';
            ocrPagesProcessed = ocrResult.ocrPagesProcessed;
            textCharsExtracted = textResult.text.length;
            totalExtractedChars = ocrResult.text.length;
          } else {
            finalText = textResult.text;
            method = 'text-extraction';
            textCharsExtracted = textResult.text.length;
            totalExtractedChars = textResult.text.length;
          }
        } else {
          finalText = textResult.text;
          method = 'text-extraction';
          textCharsExtracted = textResult.text.length;
          totalExtractedChars = textResult.text.length;
        }
      }
    } else if ((metadata.type === 'scanned' || metadata.type === 'mixed') && !skipOcr) {
      // Use OCR for scanned or mixed PDFs
      const ocrResult = await extractTextViaOcr(pdfBytes, maxPages);
      if (ocrResult.text.length > 0) {
        finalText = ocrResult.text;
        method = 'ocr';
        ocrPagesProcessed = ocrResult.ocrPagesProcessed;
      } else {
        // Fallback if OCR fails
        const textResult = await extractTextViaTextExtraction(pdfBytes, maxPages);
        if (textResult.text.length > 0) {
          finalText = textResult.text;
          method = 'text-extraction';
          textCharsExtracted = textResult.text.length;
        } else {
          const fallbackResult = extractTextViaFallback(pdfBytes);
          finalText = fallbackResult.text;
          method = 'fallback';
        }
      }
      totalExtractedChars = finalText.length;
    } else {
      // skipOcr or text type without OCR
      const textResult = await extractTextViaTextExtraction(pdfBytes, maxPages);
      if (textResult.text.length > 0) {
        finalText = textResult.text;
        method = 'text-extraction';
        textCharsExtracted = textResult.text.length;
        totalExtractedChars = textResult.text.length;
      } else {
        const fallbackResult = extractTextViaFallback(pdfBytes);
        finalText = fallbackResult.text;
        method = 'fallback';
        totalExtractedChars = finalText.length;
      }
    }

    // Step 3: If still no text, try fallback
    if (!finalText || finalText.length < 50) {
      console.log('[AdvancedPDF] Final text too short, trying fallback');
      const fallbackResult = extractTextViaFallback(pdfBytes);
      if (fallbackResult.text.length > finalText.length) {
        finalText = fallbackResult.text;
        method = 'fallback';
        totalExtractedChars = finalText.length;
      }
    }

    // Limit text size but keep it substantial
    const maxTextLength = 500000; // Allow up to 500KB of text
    if (finalText.length > maxTextLength) {
      finalText = finalText.substring(0, maxTextLength);
    }

    // STEP 4: Clean corrupted PDF text (remove binary artifacts)
    const beforeClean = finalText.length;
    if (finalText.includes('endobj') || finalText.includes('stream') || finalText.includes('FlateDecode')) {
      console.log('[AdvancedPDF] 🧹 Detected PDF artifacts in extracted text, cleaning...');
      finalText = cleanPdfText(finalText);
      console.log(`[AdvancedPDF]    Text cleaned: ${beforeClean} → ${finalText.length} chars`);
    }

    console.log(`[AdvancedPDF] ✅ Extraction complete`);
    console.log(`[AdvancedPDF]   📊 Method: ${method}`);
    console.log(`[AdvancedPDF]   📝 Text length: ${finalText.length} chars`);
    console.log(`[AdvancedPDF]   📄 PDF type: ${metadata.type}, Pages: ${metadata.pageCount}`);
    console.log(`[AdvancedPDF]   🎯 Confidence: ${(metadata.confidence * 100).toFixed(0)}%`);
    console.log(`[AdvancedPDF]   📋 Preview: "${finalText.substring(0, 200).replace(/\n/g, ' ')}..."`);

    return {
      text: finalText,
      method,
      pageCount: metadata.pageCount,
      type: metadata.type,
      metadata: {
        textCharsExtracted,
        ocrPagesProcessed: ocrPagesProcessed || undefined,
        totalExtractedChars,
        confidence: metadata.confidence,
      },
    };
  } catch (error) {
    console.error('[AdvancedPDF] ❌ Extraction error:', error instanceof Error ? error.message : error);

    // Emergency fallback
    try {
      const pdfBytes = await file.arrayBuffer();
      const fallbackResult = extractTextViaFallback(pdfBytes);
      console.log(`[AdvancedPDF] ⚠️  Using emergency fallback: ${fallbackResult.text.length} chars`);
      return {
        text: fallbackResult.text,
        method: 'fallback',
        pageCount: 1,
        type: 'mixed',
        metadata: {
          textCharsExtracted: fallbackResult.text.length,
          totalExtractedChars: fallbackResult.text.length,
          confidence: 0.3,
        },
      };
    } catch {
      console.error('[AdvancedPDF] ❌ Emergency fallback also failed');
      return {
        text: '',
        method: 'fallback',
        pageCount: 0,
        type: 'mixed',
        metadata: {
          textCharsExtracted: 0,
          totalExtractedChars: 0,
          confidence: 0,
        },
      };
    }
  }
}

/**
 * Clear OCR cache to free memory
 */
export function clearOcrCache(): void {
  ocrCache.clear();
  console.log('[AdvancedPDF] OCR cache cleared');
}

/**
 * Get OCR cache statistics
 */
export function getOcrCacheStats(): { size: number; entries: number } {
  return {
    size: ocrCache.size,
    entries: ocrCache.size,
  };
}
