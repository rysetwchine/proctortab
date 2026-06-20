/**
 * Module Storage Service
 * Handles Firebase Storage uploads and Firestore persistence for course modules
 * Stores extracted content in Firestore for question generation
 */

import {
  getStorage,
  ref,
  uploadBytes,
  getBytes,
  deleteObject,
} from 'firebase/storage';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { extractFileContent, generateContentSummary } from './fileContentExtractor';
import { extractPdfWithOcr } from './advancedPdfExtractor';
import { assessContentQuality, stripPdfFontArtifacts } from './contentQuality';
import { analyzeModuleKnowledge, type ModuleKnowledge } from './moduleKnowledge';
import type { CourseModule, ModuleItem } from '@/context/SessionContext';

const storage = getStorage();
const db = getFirestore();

/**
 * Upload a module file to Firebase Storage and extract content
 * Stores extracted content in Firestore for use in question generation
 * Returns both the file metadata and extracted content for use during the session
 */
export async function uploadModuleFile(
  courseId: string,
  moduleId: string,
  file: File,
  displayName?: string
): Promise<ModuleItem> {
  console.log(
    `[UploadModule] 📁 Starting upload for ${file.name} (${file.size} bytes)`
  );
  console.log(`[UploadModule] File MIME type: ${file.type}`);

  try {
    // For PDFs, use advanced extraction with OCR support
    let fileContent = '';
    let extractionMetadata: any = null;

    if (file.type.includes('pdf')) {
      console.log(`[UploadModule] 📄 Using advanced PDF extraction for: ${file.name}`);
      try {
        // First pass: auto strategy (text extraction / OCR / hybrid)
        let pdfResult = await extractPdfWithOcr(file);
        fileContent = cleanExtractedText(stripPdfFontArtifacts(pdfResult.text));
        
        // Safety check: always apply aggressive cleaning to PDF content
        if (fileContent.length > 0) {
          console.log('[UploadModule] 🧹 Applying aggressive PDF artifact cleaning...');
          const beforeLength = fileContent.length;
          fileContent = fileContent
            .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ') // Remove non-printable, keep whitespace
            .replace(/[ \t]+/g, ' ') // Normalize spaces but preserve line breaks
            .replace(/\b(endstream|endobj|stream|obj|FlateDecode|Length|Tf|Tj|TJ|ET|BT|RG|rg|re|w|S|f|F|n|i|j|J|M|d|gs|Tm|Tz|TL|Tc|Tw|Tr|Ts|Td|T\*)\b/g, '') // Remove PDF operators
            .replace(/<[A-Fa-f0-9]*>/g, '') // Remove hex strings
            .replace(/[\[\](){}/<>%]/g, ' ') // Remove PDF syntax
            // Remove common font dictionary artefacts that show up as "question text" later
            .replace(/\b(Subtype|BaseFont|FontDescriptor|DescendantFonts|ToUnicode|CIDFontType2|CIDToGIDMap|CIDSystemInfo|Identity-H|Ordering|Adobe|WinAnsiEncoding|Encoding)\b/gi, ' ')
            .replace(/\b[A-Z]{3,8}\+[A-Za-z0-9-]+\b/g, ' ') // Font subset names like ABCDEF+Arial-BoldMT
            .replace(/[ \t]+/g, ' ') // Final space normalization
            .replace(/\n{3,}/g, '\n\n') // Preserve paragraph structure
            .trim();
          console.log(`[UploadModule]    Content cleaned: ${beforeLength} → ${fileContent.length} chars`);
        }

        // Content quality gate: if output still looks like PDF/font metadata or garbage,
        // retry with forced OCR (this fixes the exact "Subtype BaseFont ..." garbage reported).
        const quality = assessContentQuality(fileContent);
        console.log(`[UploadModule] Content quality score: ${quality.score.toFixed(2)} (${quality.readable ? 'readable' : 'NOT readable'})`);
        if (!quality.readable && pdfResult.method !== 'ocr') {
          console.warn(`[UploadModule] ⚠️  Extracted text looks corrupted, retrying with FORCE OCR... (${quality.reasons.join(', ')})`);
          try {
            pdfResult = await extractPdfWithOcr(file, { forceOcr: true, maxPages: 100 });
            fileContent = cleanExtractedText(stripPdfFontArtifacts(pdfResult.text));
            fileContent = stripPdfFontArtifacts(fileContent);
            const quality2 = assessContentQuality(fileContent);
            console.log(`[UploadModule] OCR retry quality score: ${quality2.score.toFixed(2)} (${quality2.readable ? 'readable' : 'NOT readable'})`);
          } catch (ocrError) {
            console.warn('[UploadModule] Force OCR retry failed:', ocrError instanceof Error ? ocrError.message : ocrError);
          }
        }
        
        extractionMetadata = {
          method: pdfResult.method,
          type: pdfResult.type,
          pageCount: pdfResult.pageCount,
          textChars: pdfResult.metadata.textCharsExtracted,
          ocrPages: pdfResult.metadata.ocrPagesProcessed,
        };
        console.log(
          `[UploadModule] ✅ PDF extraction complete: ${fileContent.length} chars via ${pdfResult.method}`
        );
        console.log(
          `[UploadModule] 📊 Extraction details: Type=${pdfResult.type}, Pages=${pdfResult.pageCount}, Method=${pdfResult.method}`
        );

        if (fileContent.length === 0) {
          console.warn(
            `[UploadModule] ⚠️  PDF extracted 0 chars (may be scanned image PDF without text layer)`
          );
        } else {
          console.log(
            `[UploadModule] 📝 Content preview: "${fileContent.substring(0, 100).replace(/\n/g, ' ')}..."`
          );
        }
      } catch (pdfError) {
        console.warn(
          `[UploadModule] ⚠️  Advanced PDF extraction failed, falling back:`,
          pdfError instanceof Error ? pdfError.message : pdfError
        );
        try {
          fileContent = await extractFileContent(file, file.type);
          console.log(`[UploadModule] ✅ Fallback extraction: ${fileContent.length} chars`);
        } catch (fallbackError) {
          console.error(`[UploadModule] ❌ Both advanced and fallback extraction failed:`, fallbackError);
          fileContent = '';
        }
      }
    } else {
      // For non-PDF files, use standard extraction
      console.log(`[UploadModule] 📋 Using standard extraction for: ${file.name} (${file.type})`);
      try {
        fileContent = await extractFileContent(file, file.type);
        console.log(`[UploadModule] ✅ Extraction complete: ${fileContent.length} chars`);
      } catch (extractError) {
        console.error(`[UploadModule] ❌ Extraction failed:`, extractError);
        fileContent = '';
      }
    }

    if (fileContent.length === 0) {
      console.warn(
        `[UploadModule] ⚠️  No extractable content from ${file.name} (file may be encrypted, corrupted, or an image-only PDF)`
      );
    } else {
      // Final sanity: log quality, but DO NOT force-empty the content.
      // For some PDFs, extraction can be "messy" but still usable after downstream cleaning.
      // Making it empty breaks the UX (file shows as Empty) and prevents module-based generation.
      const finalQuality = assessContentQuality(fileContent);
      if (!finalQuality.readable) {
        console.warn(`[UploadModule] ⚠️  Extracted content flagged as low-quality (${finalQuality.reasons.join(', ')}). Keeping content but marking metadata.`);
        extractionMetadata = {
          ...(extractionMetadata || {}),
          contentQualityScore: finalQuality.score,
          contentQualityReadable: finalQuality.readable,
          contentQualityReasons: finalQuality.reasons,
        };
      } else {
        extractionMetadata = {
          ...(extractionMetadata || {}),
          contentQualityScore: finalQuality.score,
          contentQualityReadable: finalQuality.readable,
          contentQualityReasons: finalQuality.reasons,
        };
      }
      console.log(
        `[UploadModule] ✅ Content sample: "${fileContent.substring(0, 100).replace(/\n/g, ' ')}..."`
      );
    }

    // STEP 2 (NEW FLOW): Analyze cleaned learning knowledge and store it.
    // This prevents feeding raw extracted PDF garbage into the generator.
    let cleanedContentForKnowledge = '';
    let knowledge: ModuleKnowledge | null = null;
    try {
      if (fileContent && fileContent.trim().length > 0) {
        const analysis = analyzeModuleKnowledge(fileContent);
        cleanedContentForKnowledge = analysis.cleanedContent;
        knowledge = analysis.knowledge;
        console.log(
          `[UploadModule] 🧠 Knowledge analysis: cleaned=${cleanedContentForKnowledge.length} chars, keptChunks=${knowledge.stats.keptChunks}, rejectedChunks=${knowledge.stats.rejectedChunks}`
        );
      }
    } catch (analysisError) {
      console.warn('[UploadModule] Knowledge analysis failed (continuing without structured data):', analysisError);
      cleanedContentForKnowledge = '';
      knowledge = null;
    }

    const preferredQuestionContent =
      chooseBestStoredContent({
        fileContent,
        cleanedContent: cleanedContentForKnowledge,
      }) || fileContent;

    // Create module item with extracted content
    const itemId = Date.now().toString();
    const moduleItem: ModuleItem = {
      id: itemId,
      title: displayName || file.name,
      fileName: file.name,
      type: getModuleItemType(file.type),
      mimeType: file.type,
      fileSize: file.size,
      fileContent: preferredQuestionContent, // keep best available extracted content in session
      storageUrl: `courses/${courseId}/modules/${moduleId}/${file.name}`,
      uploadStatus: 'uploaded',
      uploadedAt: new Date(),
      _metadata: {
        ...(extractionMetadata || {}),
        knowledgeKeptChunks: knowledge?.stats?.keptChunks,
        knowledgeRejectedChunks: knowledge?.stats?.rejectedChunks,
        knowledgeCleanedChars: knowledge?.stats?.cleanedChars,
      } as any,
    };

    console.log(`[UploadModule] 🔧 Creating module item: ${itemId}`);

    // 🔥 STORE IN FIRESTORE FIRST (for question generation)
    try {
      const contentDocRef = doc(
        db,
        'courses',
        courseId,
        'modules',
        moduleId,
        'content',
        itemId
      );
      
      // Clean metadata - remove undefined values that Firestore rejects
      const cleanMetadata = extractionMetadata ? {
        method: extractionMetadata.method || 'unknown',
        type: extractionMetadata.type || 'unknown',
        pageCount: extractionMetadata.pageCount || 0,
        textChars: extractionMetadata.textChars || 0,
        ocrPages: extractionMetadata.ocrPages || 0,
      } : null;
      
      console.log(`[UploadModule] 💾 Saving to Firestore...`);
      await setDoc(contentDocRef, {
        title: moduleItem.title,
        fileName: moduleItem.fileName,
        type: moduleItem.type,
        mimeType: moduleItem.mimeType,
        fileSize: moduleItem.fileSize,
        // ⭐ Store the extracted content for question generation
        fileContent: preferredQuestionContent,
        // ⭐ New: Store CLEANED + STRUCTURED knowledge for high-quality exam generation
        cleanedContent: cleanedContentForKnowledge,
        knowledge: knowledge,
        ...(cleanMetadata && { extractionMetadata: cleanMetadata }),
        uploadedAt: serverTimestamp(),
        // Content chunks for semantic search
        contentChunks: chunkContent(cleanExtractedText(preferredQuestionContent)),
      });

      // Also store a SMALL summary on the module document (avoid large content to prevent Firestore doc size issues).
      // The full knowledge remains in the subcollection doc above.
      if (knowledge) {
        const moduleRef = doc(db, `courses/${courseId}/modules`, moduleId);
        await setDoc(
          moduleRef,
          {
            knowledgeUpdatedAt: serverTimestamp(),
            knowledgeSummary: {
              // Keep these small (UI/debug only)
              topics: knowledge.topics.slice(0, 12),
              keyConcepts: knowledge.keyConcepts.slice(0, 12),
              learningObjectives: knowledge.learningObjectives.slice(0, 10),
              definitionsCount: knowledge.definitions.length,
              keptChunks: knowledge.stats.keptChunks,
              cleanedChars: knowledge.stats.cleanedChars,
            },
          },
          { merge: true }
        );
      }
      
      console.log(`[UploadModule] ✅ Firestore save successful for item ${itemId}`);
    } catch (firestoreError) {
      console.error(`[UploadModule] ❌ Firestore storage failed:`, firestoreError instanceof Error ? firestoreError.message : firestoreError);
      // Continue - we have content in session memory
    }

    // 📦 Firebase Storage Upload (optional, non-blocking - content is already in Firestore)
    // Skip storage upload to avoid CORS issues in dev environment
    // Content is safely stored in Firestore and accessible for question generation
    console.log(`[UploadModule] ⏭️  Skipping Firebase Storage upload (content preserved in Firestore)`);
    
    // If you need storage upload in the future, implement it server-side instead
    // to avoid CORS issues with client-side Firebase Storage uploads

    console.log(
      `[UploadModule] ✅ FINAL: Module item created: ${moduleItem.title}`
    );
    console.log(
      `[UploadModule]   📋 File: ${moduleItem.fileName} (${moduleItem.fileSize} bytes)`
    );
    console.log(
      `[UploadModule]   📝 Content: ${moduleItem.fileContent?.length || 0} chars extracted`
    );
    if (extractionMetadata) {
      console.log(
        `[UploadModule]   🔧 Metadata: ${extractionMetadata.method} extraction, ${extractionMetadata.pageCount} pages`
      );
    }

    return moduleItem;
  } catch (error) {
    console.error(
      '[UploadModule] ❌ CRITICAL: Upload failed:',
      error instanceof Error ? error.message : error
    );
    throw new Error(
      `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Chunk content into manageable pieces for semantic search in question generation
 * Breaks content into ~500 character chunks with overlap
 */
function chunkContent(content: string, chunkSize = 500, overlap = 50): string[] {
  if (!content || content.length === 0) return [];
  
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize - overlap) {
    const chunk = content.substring(i, i + chunkSize);
    if (chunk.trim().length > 50) { // Only include meaningful chunks
      chunks.push(chunk);
    }
  }
  return chunks;
}

/**
 * Determine module item type from MIME type
 */
function getModuleItemType(
  mimeType: string
): 'pdf' | 'docx' | 'txt' | 'pptx' | 'video' | 'file' {
  if (mimeType.includes('pdf')) return 'pdf';
  if (
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    mimeType.includes('officedocument.wordprocessingml')
  )
    return 'docx';
  if (mimeType.includes('text') || mimeType.includes('plain')) return 'txt';
  if (
    mimeType.includes('presentation') ||
    mimeType.includes('officedocument.presentationml')
  )
    return 'pptx';
  if (mimeType.includes('video')) return 'video';
  return 'file';
}

/**
 * Save module to Firestore
 * Note: fileContent is preserved in UI state during the session.
 * We store metadata references in items[] but not the large content to keep document sizes small.
 * Content is kept in React state for immediate use and in subcollection for persistence.
 */
export async function saveModuleToFirestore(
  courseId: string,
  module: CourseModule
): Promise<void> {
  try {
    const moduleRef = doc(
      db,
      `courses/${courseId}/modules`,
      module.id
    );

    // Prepare items array: store metadata references only (not fileContent)
    // Each item MUST have an id and reference metadata for hydration
    const itemsForStorage = module.items.map((item) => {
      const { fileContent, ...itemWithoutContent } = item;
      
      // Ensure all required metadata is present
      const processedItem = {
        ...itemWithoutContent,
        // Ensure id is always present
        id: item.id || Date.now().toString(),
        // Store flags indicating content availability
        _hasExtractedContent: !!(fileContent && fileContent.length > 50),
        _contentLength: fileContent?.length || 0,
      };
      
      return processedItem;
    });

    // Prepare data: Keep file content in state, but store metadata in Firestore
    const moduleData = {
      ...module,
      items: itemsForStorage, // Always include items array (even if empty at creation)
      uploadedAt: module.uploadedAt || serverTimestamp(),
      displayName: module.displayName || module.title,
    };

    console.log(
      `[SaveModule] 📦 Saving module "${module.title}" with ${itemsForStorage.length} item(s)`
    );
    
    if (itemsForStorage.length > 0) {
      itemsForStorage.forEach((item, idx) => {
        const hasContent = !!(item._hasExtractedContent || (item._contentLength && item._contentLength > 50));
        console.log(
          `[SaveModule] ├─ Item ${idx + 1}/${itemsForStorage.length}: "${item.title}" (${item.fileName}) - Content: ${item._contentLength || 0} chars, HasExtracted: ${hasContent}`
        );
      });
    } else {
      console.log(`[SaveModule] └─ (no items yet)`);
    }

    await setDoc(moduleRef, moduleData);
    console.log(`[SaveModule] ✅ Module saved to Firestore successfully`);
  } catch (error) {
    console.error('Error saving module to Firestore:', error);
    throw new Error(`Failed to save module: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Module content cache for performance
 * Caches extracted content during a session to avoid repeated Firestore queries
 */
const contentCache = new Map<string, Promise<string | null>>();

function getCacheKey(courseId: string, moduleId: string, itemId: string): string {
  return `${courseId}/${moduleId}/${itemId}`;
}

/**
 * Clear the content cache (useful after bulk operations)
 */
export function clearModuleContentCache(): void {
  contentCache.clear();
  console.log('[Cache] Cleared module content cache');
}

/**
 * Get module item content with caching
 * Reuses Promise to avoid duplicate requests
 */
async function getModuleItemContentWithCache(
  courseId: string,
  moduleId: string,
  itemId: string
): Promise<string | null> {
  const cacheKey = getCacheKey(courseId, moduleId, itemId);
  
  if (contentCache.has(cacheKey)) {
    return contentCache.get(cacheKey)!;
  }
  
  const promise = getModuleItemContent(courseId, moduleId, itemId);
  contentCache.set(cacheKey, promise);
  return promise;
}

/**
 * Load modules from Firestore
 * CRITICAL: Hydrates items[] with extracted content from subcollection
 * 1. Loads module documents from courses/{courseId}/modules
 * 2. For each item with _hasExtractedContent flag, fetches content from subcollection
 * 3. Merges content into item.fileContent before returning
 * Uses caching to avoid duplicate content requests
 */
export async function loadModulesFromFirestore(
  courseId: string
): Promise<CourseModule[]> {
  try {
    const modulesRef = collection(db, `courses/${courseId}/modules`);
    const snapshot = await getDocs(modulesRef);

    const modules: CourseModule[] = [];
    
    console.log(`[LoadModules] 📦 Loading ${snapshot.docs.length} modules from Firestore...`);
    
    for (const moduleDoc of snapshot.docs) {
      const moduleData = moduleDoc.data() as CourseModule;
      
      // Ensure items array exists
      if (!moduleData.items) {
        moduleData.items = [];
      }
      
      console.log(`[LoadModules] ├─ Module: "${moduleData.title}" (${moduleData.id})`);
      console.log(`[LoadModules] │  Items in document: ${moduleData.items.length}`);
      
      // Load extracted content for each item from subcollection
      // This is CRITICAL: items must be hydrated with fileContent before use
      if (moduleData.items.length > 0) {
        const itemsWithContent = await Promise.all(
          moduleData.items.map(async (item) => {
            // If item already has content, keep it (shouldn't happen but be safe)
            if (item.fileContent && item.fileContent.length > 50) {
              console.log(`[LoadModules] │  ├─ "${item.title}" - Already has content (${item.fileContent.length} chars)`);
              return item;
            }
            
            // Check if item has extracted content (has metadata flag)
            const hasContent = !!(item._hasExtractedContent || (item._contentLength && item._contentLength > 50));
            
            if (hasContent) {
              try {
                const content = await getModuleItemContentWithCache(
                  courseId,
                  moduleData.id,
                  item.id
                );
                
                if (content && content.length > 0) {
                  console.log(`[LoadModules] │  ├─ "${item.title}" - Hydrated from subcollection (${content.length} chars)`);
                  return {
                    ...item,
                    fileContent: content,
                  };
                } else {
                  console.warn(`[LoadModules] │  ├─ "${item.title}" - Content subcollection exists but was empty`);
                }
              } catch (error) {
                console.warn(`[LoadModules] │  ├─ "${item.title}" - Failed to load content:`, error);
              }
            } else {
              console.log(`[LoadModules] │  ├─ "${item.title}" - No extracted content (metadata not set)`);
            }
            return item;
          })
        );
        
        moduleData.items = itemsWithContent;
      } else {
        // If items array is empty, check subcollection for content
        // This handles the case where items weren't properly saved to Firestore
        console.log(`[LoadModules] │  └─ (no items in document, checking subcollection...)`);
        try {
          const contentCollRef = collection(
            db,
            'courses',
            courseId,
            'modules',
            moduleData.id,
            'content'
          );
          const contentSnap = await getDocs(contentCollRef);
          
          if (contentSnap.docs.length > 0) {
            console.log(`[LoadModules] │  ✓ Found ${contentSnap.docs.length} items in subcollection, rebuilding items array`);
            const rebuiltItems: ModuleItem[] = [];
            
            for (const contentDoc of contentSnap.docs) {
              const contentData = contentDoc.data();
              const preferredContent = chooseBestStoredContent(contentData) || '';
              const moduleItem: ModuleItem = {
                id: contentDoc.id,
                title: contentData.title || 'Uploaded File',
                fileName: contentData.fileName || 'file',
                type: (contentData.type as any) || 'file',
                fileContent: preferredContent,
                fileSize: contentData.fileSize || 0,
                mimeType: contentData.mimeType,
                uploadedAt: contentData.uploadedAt ? new Date(contentData.uploadedAt.toMillis?.() || contentData.uploadedAt) : new Date(),
                _hasExtractedContent: preferredContent.length > 50,
                _contentLength: preferredContent.length,
                _metadata: contentData.extractionMetadata,
              };
              rebuiltItems.push(moduleItem);
              console.log(`[LoadModules] │  ├─ Rebuilt item "${moduleItem.title}" (${moduleItem.fileContent?.length || 0} chars)`);
            }
            
            moduleData.items = rebuiltItems;
          }
        } catch (error) {
          console.warn(`[LoadModules] │  Failed to check subcollection:`, error);
        }
      }
      
      modules.push(moduleData);
    }

    console.log(`[LoadModules] ✅ Loaded ${modules.length} modules with hydrated content from Firestore`);
    return modules;
  } catch (error) {
    console.error('Error loading modules from Firestore:', error);
    return [];
  }
}

/**
 * Get single module from Firestore
 * CRITICAL: Also loads and hydrates extracted content for items from subcollection
 */
export async function getModuleFromFirestore(
  courseId: string,
  moduleId: string
): Promise<CourseModule | null> {
  try {
    const moduleRef = doc(db, `courses/${courseId}/modules`, moduleId);
    const snapshot = await getDoc(moduleRef);

    if (!snapshot.exists()) {
      console.warn(`[GetModule] Module not found: ${moduleId}`);
      return null;
    }

    const moduleData = snapshot.data() as CourseModule;
    console.log(`[GetModule] 📦 Loading module "${moduleData.title}" (${moduleId})`);
    
    // Load extracted content for each item from subcollection
    if (moduleData.items && moduleData.items.length > 0) {
      console.log(`[GetModule] ├─ Hydrating ${moduleData.items.length} item(s)...`);
      const itemsWithContent = await Promise.all(
        moduleData.items.map(async (item) => {
          const hasContent = !!(item._hasExtractedContent || (item._contentLength && item._contentLength > 50));
          
          if (hasContent) {
            try {
              const content = await getModuleItemContentWithCache(courseId, moduleId, item.id);
              if (content) {
                console.log(`[GetModule] ├─ "${item.title}" hydrated (${content.length} chars)`);
                return {
                  ...item,
                  fileContent: content,
                };
              }
            } catch (error) {
              console.warn(`[GetModule] Failed to load content for ${item.title}:`, error);
            }
          }
          return item;
        })
      );
      
      moduleData.items = itemsWithContent;
    }
    
    console.log(`[GetModule] ✅ Module loaded with hydrated content`);
    return moduleData;
  } catch (error) {
    console.error('Error getting module from Firestore:', error);
    return null;
  }
}

/**
 * Delete module from Firestore and Storage
 */
export async function deleteModuleFromFirestore(
  courseId: string,
  moduleId: string
): Promise<void> {
  try {
    // Delete content subcollection first (critical for storage + to prevent orphaned docs)
    const contentRef = collection(db, 'courses', courseId, 'modules', moduleId, 'content');
    const contentSnap = await getDocs(contentRef);
    if (contentSnap.docs.length > 0) {
      let batch = writeBatch(db);
      let ops = 0;
      for (const d of contentSnap.docs) {
        batch.delete(d.ref);
        ops++;
        if (ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }

    // Delete module document
    const moduleRef = doc(db, `courses/${courseId}/modules`, moduleId);
    await deleteDoc(moduleRef);

    // Delete files from Storage
    const storagePath = `courses/${courseId}/modules/${moduleId}`;
    const folderRef = ref(storage, storagePath);
    // Note: Firebase Storage doesn't support deleting folders, files need to be deleted individually
    // This would need to be handled separately
  } catch (error) {
    console.error('Error deleting module from Firestore:', error);
    throw new Error(`Failed to delete module: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete ALL modules for a course (including each module's content subcollection).
 * This is a destructive operation and should be protected by a confirmation in the UI.
 */
export async function deleteAllModulesFromFirestore(courseId: string): Promise<number> {
  try {
    const modulesRef = collection(db, `courses/${courseId}/modules`);
    const snapshot = await getDocs(modulesRef);

    const moduleIds = snapshot.docs.map((d) => d.id);
    console.log(`[DeleteAllModules] Found ${moduleIds.length} module(s) to delete`);

    for (const moduleId of moduleIds) {
      await deleteModuleFromFirestore(courseId, moduleId);
    }

    clearModuleContentCache();
    console.log(`[DeleteAllModules] ✅ Deleted ${moduleIds.length} module(s)`);
    return moduleIds.length;
  } catch (error) {
    console.error('[DeleteAllModules] Error deleting all modules:', error);
    throw new Error(
      `Failed to delete all modules: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get analyzed knowledge for a module item.
 * Preferred for exam generation (avoids raw extracted PDF garbage).
 */
export async function getModuleItemKnowledge(
  courseId: string,
  moduleId: string,
  itemId: string
): Promise<{ cleanedContent: string; knowledge: ModuleKnowledge | null } | null> {
  try {
    const contentDocRef = doc(
      db,
      'courses',
      courseId,
      'modules',
      moduleId,
      'content',
      itemId
    );
    const snapshot = await getDoc(contentDocRef);
    if (!snapshot.exists()) return null;
    const data: any = snapshot.data();
    return {
      cleanedContent: data.cleanedContent || '',
      knowledge: (data.knowledge as ModuleKnowledge) || null,
    };
  } catch (e) {
    console.warn('[GetContent] Error retrieving module knowledge:', e);
    return null;
  }
}

/**
 * Get file content from Storage
 */
export async function getFileContentFromStorage(
  storagePath: string
): Promise<string> {
  try {
    const fileRef = ref(storage, storagePath);
    const bytes = await getBytes(fileRef);
    const file = new File([bytes], storagePath.split('/').pop() || 'file');
    return extractFileContent(file);
  } catch (error) {
    console.error('Error getting file from storage:', error);
    return '';
  }
}

/**
 * Update module content summary
 */
export async function updateModuleContentSummary(
  courseId: string,
  moduleId: string,
  items: ModuleItem[]
): Promise<string> {
  try {
    // Combine all item content
    const allContent = items
      .map((item) => item.fileContent || '')
      .filter(Boolean)
      .join('\n\n');

    const summary = generateContentSummary(allContent);

    // Update in Firestore
    const moduleRef = doc(db, `courses/${courseId}/modules`, moduleId);
    await setDoc(
      moduleRef,
      { contentSummary: summary },
      { merge: true }
    );

    return summary;
  } catch (error) {
    console.error('Error updating module content summary:', error);
    return '';
  }
}

/**
 * Get extracted content for a module item (for question generation)
 * Retrieves content from Firestore where it was stored during upload
 */
export async function getModuleItemContent(
  courseId: string,
  moduleId: string,
  itemId: string
): Promise<string | null> {
  try {
    const contentDocRef = doc(
      db,
      'courses',
      courseId,
      'modules',
      moduleId,
      'content',
      itemId
    );
    
    const snapshot = await getDoc(contentDocRef);
    if (!snapshot.exists()) {
      console.warn(`[GetContent] Content not found for item ${itemId}`);
      return null;
    }
    
    const data = snapshot.data();
    const preferredContent = chooseBestStoredContent(data);
    console.log(`[GetContent] ✓ Retrieved ${preferredContent?.length || 0} chars for question generation`);
    return preferredContent;
  } catch (error) {
    console.error('[GetContent] Error retrieving module content:', error);
    return null;
  }
}

/**
 * Get all content for a module (for question generation)
 * IMPORTANT: Returns ONLY clean file content without titles or metadata
 */
export async function getModuleContent(
  courseId: string,
  moduleId: string
): Promise<string> {
  try {
    const contentCollRef = collection(
      db,
      'courses',
      courseId,
      'modules',
      moduleId,
      'content'
    );
    
    const snapshot = await getDocs(contentCollRef);
    const contents: string[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const preferredContent = chooseBestStoredContent(data);
      if (preferredContent) {
        // CRITICAL: Push ONLY fileContent, NO title or metadata prefix
        // This prevents polluting AI input with metadata
        contents.push(preferredContent);
      }
    });
    
    // Join with simple newline separation, NO metadata markers
    const combinedContent = contents.filter(Boolean).join('\n\n');
    console.log(`[GetContent] ✓ Retrieved ${combinedContent.length} chars from ${contents.length} items for question generation`);
    return combinedContent;
  } catch (error) {
    console.error('[GetContent] Error retrieving module content:', error);
    return '';
  }
}

/**
 * Sync module from local storage to Firestore
 */
export async function syncModuleToFirestore(
  courseId: string,
  module: CourseModule
): Promise<void> {
  try {
    await saveModuleToFirestore(courseId, module);
  } catch (error) {
    console.error('Error syncing module to Firestore:', error);
    // Continue without throwing - allow offline usage
  }
}

/**
 * Clean extracted text from PDF/Word documents
 * Removes metadata, garbage characters, and normalizes whitespace
 */
function cleanExtractedText(text: string): string {
  return text
    // remove Word/PDF garbage headers
    .replace(/D:\d{14}\+00'00'/g, '')
    .replace(/Un-named Microsoft Word.*?Learning Objectives/gs, '')

    // remove broken unicode symbols
    .replace(/[^\x20-\x7E\n]/g, ' ')

    // normalize spaces while preserving line/paragraph structure
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')

    // trim result
    .trim();
}

function chooseBestStoredContent(data: any): string | null {
  const raw = typeof data?.fileContent === 'string' ? data.fileContent.trim() : '';
  const cleaned = typeof data?.cleanedContent === 'string' ? data.cleanedContent.trim() : '';

  if (!raw && !cleaned) return null;
  if (!raw) return cleaned || null;
  if (!cleaned) return raw || null;

  const rawQuality = assessContentQuality(raw);
  const cleanedQuality = assessContentQuality(cleaned);

  if (!rawQuality.readable && cleanedQuality.readable) return cleaned;
  if (cleanedQuality.score > rawQuality.score + 0.08) return cleaned;
  if (cleaned.length >= raw.length * 0.75) return cleaned;

  return raw;
}
