/**
 * File Content Extractor
 * Extracts text content from various file formats: PDF, DOCX, TXT, PPTX
 * Uses pdfjs-dist for professional PDF parsing with ultra-aggressive cleaning
 */

// pdfjs-dist will be dynamically imported
let pdfjsLib: any = null;
let pdfJsAvailable = true;

// Worker path cache
let cachedWorkerUrl: string | null = null;

// Initialize pdfjs dynamically using ES module import
async function initializePdfJs() {
  if (pdfjsLib) return pdfjsLib;
  
  try {
    console.log("[PDF] Initializing pdfjs-dist...");
    
    // Construct module name dynamically to avoid Vite static analysis
    // This way Vite can't see "pdfjs-dist" as a string literal
    const moduleName = 'pdf' + 'js' + '-' + 'dist';
    const pdfjsModule: any = await import(moduleName);
    
    // pdfjs-dist can be published in different module shapes depending on version/bundler:
    // - ESM named exports: { getDocument, GlobalWorkerOptions, ... }
    // - default export containing the API: { default: { getDocument, GlobalWorkerOptions, ... } }
    // Normalize so downstream code can always call pdfjsLib.getDocument(...)
    const normalized =
      pdfjsModule?.getDocument
        ? pdfjsModule
        : pdfjsModule?.default?.getDocument
          ? pdfjsModule.default
          : pdfjsModule?.pdfjsLib?.getDocument
            ? pdfjsModule.pdfjsLib
            : pdfjsModule;
    
    pdfjsLib = normalized;
    
    // Set worker source with simple fallback strategy
    if (!cachedWorkerUrl) {
      // Try CDN first (most reliable)
      // Keep this in sync with package.json's pdfjs-dist major version.
      // Use an ESM worker build so modern bundlers/browsers can load it reliably.
      cachedWorkerUrl = "https://unpkg.com/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs";
      
      console.log("[PDF] Setting worker URL to CDN");
    }
    
    // Guard for unexpected module shapes
    if (!pdfjsLib?.GlobalWorkerOptions) {
      throw new Error('pdfjs-dist loaded but GlobalWorkerOptions is missing (unexpected module shape)');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = cachedWorkerUrl;
    console.log("[PDF] ✅ pdfjs-dist initialized");
    console.log("[PDF]   Worker URL:", cachedWorkerUrl);
    pdfJsAvailable = true;
    
    return pdfjsLib;
  } catch (error) {
    console.error("[PDF] ❌ Failed to initialize pdfjs-dist:", error instanceof Error ? error.message : error);
    pdfJsAvailable = false;
    throw error;
  }
}

/**
 * Extract text from a file based on its type
 * @param file - File to extract from
 * @param mimeType - MIME type of the file
 * @returns Promise<string> - Extracted text content
 */
export async function extractFileContent(
  file: File | Blob,
  mimeType?: string
): Promise<string> {
  const type = mimeType || (file as File).type || '';
  const fileName = (file as File).name || 'unknown';

  console.log(`[FileExtractor] Starting extraction for: ${fileName}, MIME: ${type}`);

  try {
    if (type.includes('pdf')) {
      return await extractPdfText(file, fileName);
    } else if (
      type.includes('word') ||
      type.includes('document') ||
      type.includes('officedocument.wordprocessingml')
    ) {
      return extractDocxText(file, fileName);
    } else if (
      type.includes('presentation') ||
      type.includes('officedocument.presentationml')
    ) {
      return extractPptxText(file, fileName);
    } else if (type.includes('text') || type.includes('plain')) {
      return extractTxtText(file, fileName);
    } else {
      // Fallback: try to read as text
      return extractTxtText(file, fileName);
    }
  } catch (error) {
    console.error(`[FileExtractor] Extraction failed for ${fileName}:`, error);
    return '';
  }
}

/**
 * NUCLEAR-LEVEL aggressive cleaning for extracted content
 * This is the ultimate fix - removes ALL PDF corruption at source
 */
function aggressivelyCleanExtractedContent(rawText: string, source: string): string {
  let processed = rawText;
  
  // PHASE 0: Initial ASCII normalization
  processed = processed.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ');
  
  // PHASE 1: REMOVE ALL PDF OPERATORS AND METADATA - EXHAUSTIVE LIST
  const pdfOperators = [
    'MediaBox', 'Contents', 'Filter', 'Resources', 'Font', 'ExtGState',
    'ProcSet', 'ImageB', 'ImageC', 'ImageI', 'Type', 'Group',
    'Transparency', 'DeviceRGB', 'Tabs', 'StructParents', 'stream',
    'endstream', 'obj', 'endobj', 'xref', 'trailer', 'startxref',
    'FlateDecode', 'Length', 'Tf', 'Tj', 'TJ', 'ET', 'BT', 'RG',
    'rg', 're', 'gsave', 'grestore', 'Tm', 'Td', 'TD', 'T\*',
    'Parent', 'Kids', 'Count', 'Pages', 'Page', 'Catalog',
    'Info', 'Root', 'Size', 'Encrypt', 'Prev', 'XRefStm',
    'W', 'Index', 'DecodeParms', 'DL', 'ID', 'OP', 'op',
    'ca', 'CA', 'BM', 'SMask', 'AIS', 'Blend', 'UseBlackPtComp',
    // Font descriptors
    'BaseFont', 'FontDescriptor', 'FontName', 'Encoding', 'WinAnsiEncoding',
    'ItalicAngle', 'Ascent', 'CapHeight', 'FontWeight', 'Leading', 'FontFile2',
    'Subtype', 'TrueType', 'Flags', 'FontFamily', 'Descent', 'StemV', 'StemH'
  ];
  
  for (const op of pdfOperators) {
    processed = processed.replace(new RegExp(`\\b${op}\\b`, 'gi'), ' ');
  }
  
  // EXTRA: Remove PDF path syntax patterns like "/BaseFont/", "/Subtype/", etc.
  processed = processed.replace(/\/\w+\//g, ' ');
  
  // PHASE 2: Remove hexadecimal and binary garbage patterns
  processed = processed
    .replace(/[0-9a-fA-F]{6,}/g, ' ')  // Long hex strings
    .replace(/[\[\]<>(){}]/g, ' ')     // PDF delimiters
    .replace(/<<[^>]*>>/g, ' ')        // PDF dict syntax
    .replace(/\[[^\]]*\]/g, ' ')       // PDF array syntax
    .replace(/\([^)]*\)/g, ' ');       // PDF string syntax
  
  // PHASE 3: Remove isolated single characters and garbage sequences
  processed = processed
    .replace(/\s[A-Z0-9]\s/g, ' ')
    .replace(/\s[a-z]\s/g, ' ')
    .replace(/[A-Za-z][\`\"\'\$\@\#\^\&\*%]/g, ' ')
    .replace(/[\`\"\'\$\@\#\^\&\*%`~!|\\;:,?/]{2,}/g, ' ');
  
  // PHASE 4: EXTREMELY STRICT word filtering
  processed = processed
    .split(/\s+/)
    .filter(word => {
      if (!word || word.length === 0) return false;
      
      // Count vowels - this is the core validation
      const vowelCount = (word.match(/[aeiouAEIOU]/g) || []).length;
      const letterCount = (word.match(/[a-zA-Z]/g) || []).length;
      const wordLength = word.length;
      
      // Must have at least some letters
      if (letterCount === 0) return false;
      
      // SHORT WORDS (< 4 chars)
      if (wordLength < 4) {
        const validShort = ['a', 'i', 'is', 'to', 'in', 'on', 'at', 'as', 'of', 'or', 'an', 'by', 'be', 'we', 'he', 'it', 'up', 'so', 'if', 'no', 'go', 'do', 'me', 'my', 'us', 'are', 'and', 'but', 'for', 'the', 'you', 'not', 'all', 'can', 'may', 'has', 'was', 'are', 'out', 'now', 'how'];
        return validShort.includes(word.toLowerCase()) || vowelCount >= 1;
      }
      
      // MEDIUM WORDS (4-8 chars): STRICT - must have 40%+ vowels
      if (wordLength < 9) {
        return vowelCount >= 2 && vowelCount >= wordLength * 0.4;
      }
      
      // LONG WORDS (9-15 chars): must have 35%+ vowels
      if (wordLength < 16) {
        return vowelCount >= 3 && vowelCount >= wordLength * 0.35;
      }
      
      // VERY LONG WORDS (16+ chars): must have 30%+ vowels
      return vowelCount >= 3 && vowelCount >= wordLength * 0.3;
    })
    .filter(word => {
      // SECONDARY REJECTION - catch any remaining PDF garbage
      
      if (!/[a-zA-Z]/.test(word)) return false;
      
      // Reject words with too many special chars
      const specialCharCount = (word.match(/[^a-zA-Z0-9\-\']/g) || []).length;
      if (specialCharCount > word.length * 0.2) return false;
      
      // COMPREHENSIVE PDF KEYWORD REJECTION
      const pdfKeywordsList = [
        'type', 'resources', 'font', 'extgstate', 'procset', 'mediabox',
        'contents', 'group', 'transparency', 'devicergb', 'tabs',
        'structparents', 'filter', 'length', 'stream', 'endstream',
        'obj', 'endobj', 'xref', 'trailer', 'startxref', 'parent',
        'kids', 'count', 'pages', 'page', 'catalog', 'info', 'root',
        'size', 'encrypt', 'prev', 'xrefstm', 'decodeparms',
        'flatedecode', 'asciihhexdecode', 'lzwdecode'
      ];
      
      if (pdfKeywordsList.includes(word.toLowerCase())) return false;
      
      // Reject pure consonant clusters (OCR garbage like "nK", "Sw", "Jq")
      if (word.length < 6 && (word.match(/[aeiouAEIOU]/g) || []).length === 0) return false;
      
      return true;
    })
    .join(' ');
  
  // PHASE 5: Line-by-line cleaning
  const lines = processed.split('\n');
  const cleanedLines = lines
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => {
      if (!line || line.length === 0) return false;
      
      // Skip metadata patterns
      if (/^[A-Z]:\d{4}/.test(line)) return false;
      if (/^Page\s*\d+/i.test(line)) return false;
      if (/^\d+\s*$/.test(line)) return false;
      
      // Skip pure symbol lines
      if (/^[%&^$*\-_\s`"';:?/<>|\\]{3,}$/.test(line)) return false;
      
      // Skip lines with excessive special characters
      if (line.length < 20) {
        const charCount = (line.match(/[%&^$*\-_`"';:?/<>|\\]/g) || []).length;
        if (charCount > line.length * 0.25) return false;
      }
      
      // Skip spaced-out letter patterns (OCR)
      if (/^[a-z]\s+[a-z](\s+[a-z])+$/i.test(line)) return false;
      
      // Skip lines with low vowel percentage
      const vowelPercent = (line.match(/[aeiouAEIOU]/g) || []).length / line.length;
      if (vowelPercent < 0.08) return false;  // Less than 8% vowels = trash
      
      return true;
    });
  
  processed = cleanedLines.join('\n');
  
  // PHASE 6: Final whitespace normalization
  processed = processed
    .replace(/\n\n\n+/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  
  // PHASE 7: Logging
  const originalLength = rawText.length;
  const finalLength = processed.length;
  const removalPct = Math.round((1 - finalLength / originalLength) * 100);
  
  if (!processed || finalLength < 30) {
    console.warn(`[ExtractClean] ⚠️ WARNING from ${source}: Output too short!`);
    console.warn(`[ExtractClean]   Original: ${originalLength} chars → Final: ${finalLength} chars (${removalPct}% removed)`);
    console.warn(`[ExtractClean]   Preview: ${processed.substring(0, 100)}`);
  } else {
    console.log(`[ExtractClean] ✓ ${source}: ${originalLength} → ${finalLength} chars (${removalPct}% removed)`);
  }

  return processed;
}

/**
 * Extract text from PDF file using pdfjs-dist
 */
async function extractPdfText(file: File | Blob, fileName: string): Promise<string> {
  if (!pdfJsAvailable) {
    console.warn(`[PDF] pdfjs-dist not available, using fallback extraction for: ${fileName}`);
    return extractPdfTextFallback(file, fileName);
  }

  try {
    console.log(`[PDF] Starting extraction from: ${fileName}`);
    const arrayBuffer = await file.arrayBuffer();
    
    try {
      const pdfjs = await initializePdfJs();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      console.log(`[PDF] Document loaded, page count: ${pdf.numPages}`);

      let fullText = '';
      const maxPages = Math.min(pdf.numPages, 100); // Limit to first 100 pages

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => (item.str ? item.str : ''))
            .join(' ');
          fullText += pageText + '\n';
        } catch (pageError) {
          console.warn(`[PDF] Error extracting page ${pageNum}:`, pageError);
          // Continue with next page
        }
      }

      const cleanedText = fullText
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ') // Remove non-printable, keep whitespace
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\b(endstream|endobj|stream|obj|FlateDecode|Length|Tf|Tj|TJ|ET|BT|RG|rg|re|w|S|f|F|n|i|j|J|M|d|gs|Tm|Tz|TL|Tc|Tw|Tr|Ts|Td|T\*)\b/g, '') // Remove PDF operators
        .replace(/<[A-Fa-f0-9]*>/g, '') // Remove hex strings
        .replace(/[\[\](){}/<>%]/g, ' ') // Remove PDF syntax
        .trim();

      console.log(
        `[PDF] Extraction complete. Text length: ${cleanedText.length} chars`
      );
      console.log(
        `[PDF] Content preview (before aggressive clean): ${cleanedText.substring(0, 200)}...`
      );

      // APPLY ULTRA-AGGRESSIVE CLEANING HERE
      const fullyCleanedText = aggressivelyCleanExtractedContent(cleanedText, 'PDF');

      if (fullyCleanedText.length > 0) {
        return fullyCleanedText.substring(0, 50000);
      } else {
        console.warn('[PDF] Extraction returned empty after cleaning, trying fallback');
        return extractPdfTextFallback(file, fileName);
      }
    } catch (pdfError) {
      console.error('[PDF] pdfjs parsing failed:', pdfError);
      return extractPdfTextFallback(file, fileName);
    }
  } catch (error) {
    console.error('[PDF] Extraction failed, trying fallback:', error);
    // Fallback to regex-based extraction
    return extractPdfTextFallback(file, fileName);
  }
}

/**
 * Fallback PDF text extraction (regex-based)
 * Used when pdfjs fails. This uses a more comprehensive approach.
 */
async function extractPdfTextFallback(
  file: File | Blob,
  fileName: string
): Promise<string> {
  try {
    console.log(`[PDF-Fallback] Using fallback extraction for: ${fileName}`);
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Try UTF-8 first
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let text = decoder.decode(uint8Array);

    // Remove null bytes and control characters but preserve readable text
    text = text
      .replace(/[\x00]/g, '') // Remove null bytes
      .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F]/g, ' '); // Replace other control chars with space

    // Extract text between PDF text markers (BT...ET)
    const matches = text.match(/BT(.+?)ET/gs) || [];
    let extractedText = matches
      .map((match) => {
        // Extract strings in parentheses
        const textMatches = match.match(/\(([^)]*)\)/g) || [];
        return textMatches
          .map((m) => {
            // Remove parentheses and unescape
            return m.slice(1, -1)
              .replace(/\\(.)/g, '$1')
              .replace(/\\n/g, ' ')
              .replace(/\\r/g, ' ');
          })
          .join(' ')
          .trim();
      })
      .filter(Boolean)
      .join(' ');

    // If BT/ET extraction didn't yield much, try alternative patterns
    if (!extractedText || extractedText.length < 100) {
      console.log('[PDF-Fallback] BT/ET extraction yielded', extractedText.length, 'chars, trying alternatives');
      
      // Try to extract from stream data
      const streamMatches = text.match(/stream\n(.+?)\nendstream/gs) || [];
      const streamText = streamMatches
        .map((match) => {
          // Remove PDF operators and keep readable text
          return match
            .replace(/stream\n/, '')
            .replace(/\nendstream/, '')
            .replace(/\/F\d+[\s\d.]+Tf/g, ' ') // Font operators
            .replace(/Tj|TJ|\'|"/g, ' ') // Text operators
            .replace(/[\[\](){}]/g, ' ') // Brackets
            .replace(/\d+\s+m|l|h|f|S|re/g, ' ') // Path operators
            .replace(/[^\x20-\x7E\n]/g, ' '); // Keep only printable ASCII
        })
        .join(' ');
      
      if (streamText.length > extractedText.length) {
        extractedText = streamText;
      }
    }

    // Clean up the extracted text
    extractedText = extractedText
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ') // Remove non-printable, keep whitespace
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\b(endstream|endobj|stream|obj|FlateDecode|Length|Tf|Tj|TJ|ET|BT|RG|rg|re|w|S|f|F|n|i|j|J|M|d|gs|Tm|Tz|TL|Tc|Tw|Tr|Ts|Td|T\*)\b/g, '') // Remove PDF operators
      .replace(/<[A-Fa-f0-9]*>/g, '') // Remove hex strings
      .replace(/[\[\](){}/<>%]/g, ' ') // Remove PDF syntax
      .trim();

    console.log(
      `[PDF-Fallback] Initial cleanup: ${extractedText.length} chars`
    );
    
    // APPLY ULTRA-AGGRESSIVE CLEANING HERE
    extractedText = aggressivelyCleanExtractedContent(extractedText, 'PDF-Fallback');
    
    const finalText = extractedText.substring(0, 50000);

    console.log(
      `[PDF-Fallback] Final text length: ${finalText.length} chars`
    );
    
    if (finalText.length > 0) {
      console.log(
        `[PDF-Fallback] Content preview: ${finalText.substring(0, 200)}...`
      );
      return finalText;
    } else {
      console.warn('[PDF-Fallback] Fallback extraction returned empty text');
      return '';
    }
  } catch (error) {
    console.error('[PDF-Fallback] Fallback extraction also failed:', error);
    return '';
  }
}

/**
 * Extract text from DOCX file
 * DOCX is a ZIP archive containing XML files
 */
async function extractDocxText(file: File | Blob, fileName: string): Promise<string> {
  try {
    console.log(`[DOCX] Starting extraction from: ${fileName}`);
    const arrayBuffer = await file.arrayBuffer();
    let text = extractBasicTextFromZip(arrayBuffer, 'DOCX');
    console.log(`[DOCX] Initial extraction: ${text.length} chars`);
    
    // APPLY ULTRA-AGGRESSIVE CLEANING HERE
    text = aggressivelyCleanExtractedContent(text, 'DOCX');
    
    console.log(`[DOCX] Final extraction: ${text.length} chars`);
    console.log(`[DOCX] Content preview: ${text.substring(0, 200)}...`);
    return text;
  } catch (error) {
    console.error('[DOCX] Error extracting DOCX text:', error);
    return '';
  }
}

/**
 * Extract text from PPTX file
 * PPTX is a ZIP archive containing XML files
 */
async function extractPptxText(file: File | Blob, fileName: string): Promise<string> {
  try {
    console.log(`[PPTX] Starting extraction from: ${fileName}`);
    const arrayBuffer = await file.arrayBuffer();
    let text = extractBasicTextFromZip(arrayBuffer, 'PPTX');
    console.log(`[PPTX] Initial extraction: ${text.length} chars`);
    
    // APPLY ULTRA-AGGRESSIVE CLEANING HERE
    text = aggressivelyCleanExtractedContent(text, 'PPTX');
    
    console.log(`[PPTX] Final extraction: ${text.length} chars`);
    console.log(`[PPTX] Content preview: ${text.substring(0, 200)}...`);
    return text;
  } catch (error) {
    console.error('[PPTX] Error extracting PPTX text:', error);
    return '';
  }
}

/**
 * Basic text extraction from ZIP archive without JSZip
 * Searches for text in the binary data
 */
function extractBasicTextFromZip(arrayBuffer: ArrayBuffer, fileType: string): string {
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let text = decoder.decode(uint8Array);

    // Remove binary control characters
    text = text.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');

    // Extract text between XML tags more comprehensively
    const xmlPatterns = [
      />([^<]+)</g,  // Content between tags
      /<a:t>([^<]*)<\/a:t>/g,  // PowerPoint text
      /<w:t>([^<]*)<\/w:t>/g,  // Word text
      /<text>([^<]*)<\/text>/g,  // Generic XML text tags
    ];

    const allMatches: string[] = [];
    for (const pattern of xmlPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 0) {
          allMatches.push(match[1].trim());
        }
      }
    }

    const extractedText = allMatches
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const finalText = extractedText.substring(0, 50000) || text.replace(/<[^>]+>/g, ' ').substring(0, 25000);
    console.log(`[${fileType}] ZIP extraction yielded ${finalText.length} chars`);
    return finalText;
  } catch (error) {
    console.error(`[${fileType}] ZIP extraction failed:`, error);
    return '';
  }
}

/**
 * Extract text from TXT file
 */
async function extractTxtText(file: File | Blob, fileName: string): Promise<string> {
  try {
    console.log(`[TXT] Starting extraction from: ${fileName}`);
    let text = await file.text();
    console.log(`[TXT] Initial extraction: ${text.length} chars`);
    
    // APPLY ULTRA-AGGRESSIVE CLEANING HERE
    text = aggressivelyCleanExtractedContent(text, 'TXT');
    
    console.log(`[TXT] Final extraction: ${text.length} chars`);
    console.log(`[TXT] Content preview: ${text.substring(0, 200)}...`);
    return text;
  } catch (error) {
    console.error('[TXT] Error extracting TXT text:', error);
    return '';
  }
}

/**
 * Extract text from XML content
 * Used for DOCX and PPTX files
 */
function extractTextFromXml(xml: string): string {
  try {
    // Remove XML tags but keep content
    let text = xml.replace(/<[^>]+>/g, ' ');

    // Decode XML entities
    text = text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  } catch (error) {
    console.error('Error extracting text from XML:', error);
    return '';
  }
}

/**
 * Generate a content summary from full text
 * @param content - Full text content
 * @param maxLength - Maximum length of summary
 * @returns Shortened summary
 */
export function generateContentSummary(content: string, maxLength = 300): string {
  if (!content) return '';

  // Remove extra whitespace
  const clean = content.replace(/\s+/g, ' ').trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  // Try to break at sentence boundary
  const truncated = clean.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastPeriod > maxLength * 0.7) {
    return truncated.substring(0, lastPeriod + 1);
  }

  return truncated.substring(0, lastSpace) + '...';
}

/**
 * Extract key topics/keywords from content
 * @param content - Text content
 * @param count - Number of keywords to extract
 * @returns Array of keywords
 */
export function extractKeywords(content: string, count = 10): string[] {
  if (!content) return [];

  // Split into words
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 4);

  // Count word frequency
  const frequency = new Map<string, number>();
  words.forEach((word) => {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  });

  // Sort by frequency and return top N
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);
}
