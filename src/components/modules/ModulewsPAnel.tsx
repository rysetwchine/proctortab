import { useState, useEffect, useRef, useContext } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FolderOpen, Plus, FileText, Video, Link, Download, Trash2, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { extractFileContent, generateContentSummary } from '@/utils/fileContentExtractor';
import { loadModulesFromLocalStorage, saveModulesToLocalStorage } from '@/utils/moduleLocalStorage';
import { deriveCleanTitleFromFilename } from '@/utils/filenameTitle';
import type { CourseModule } from '@/context/SessionContext';
import { SessionContext } from '@/context/SessionContext';
import { toast } from 'sonner';

interface Module extends CourseModule {
  uploadProgress?: number;
}

const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
];

// For the HTML accept attribute - include both MIME types and extensions for broader compatibility
const ACCEPT_ATTRIBUTE = '.pdf,.doc,.docx,.txt,.ppt,.pptx,application/pdf,application/msword,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint';

const FILE_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/msword': 'Word',
  'text/plain': 'Text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/vnd.ms-powerpoint': 'PowerPoint',
};

const STORAGE_KEY = 'proctortab_course_modules';

export const ModulesPanel = () => {
  const sessionContext = useContext(SessionContext);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newModule, setNewModule] = useState({
    title: '',
    displayName: '',
    description: '',
    weekNumber: 1,
    selectedFiles: [] as File[],
  });
  const [uploadingModuleId, setUploadingModuleId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const createFormFileInputRef = useRef<HTMLInputElement | null>(null);
  const createModuleTitleAutoRef = useRef(false);

  // Load modules from localStorage on mount
  // Also syncs with SessionContext if available
  useEffect(() => {
    const loadedModules = loadModulesFromLocalStorage();
    setModules(loadedModules);
    
    // If SessionContext is available and has an active session, sync modules
    if (sessionContext?.sessions && sessionContext.sessions.length > 0) {
      const activeSession = sessionContext.sessions[0];
      if (activeSession.modules && activeSession.modules.length > 0) {
        console.log('[ModulesPanel] Syncing modules from SessionContext:', activeSession.modules);
        setModules(activeSession.modules);
      }
    }
    
    setIsLoading(false);
  }, [sessionContext]);

  // Save modules to localStorage whenever they change
  useEffect(() => {
    if (!isLoading) {
      saveModulesToLocalStorage(modules);
    }
  }, [modules, isLoading]);

  const handleCreateModule = async () => {
    if (!newModule.title.trim() && !newModule.displayName.trim()) {
      toast.error('Please enter a module title');
      return;
    }

    const moduleData = {
      id: `module_${Date.now()}`,
      title: newModule.title || newModule.displayName,
      displayName: newModule.displayName,
      description: newModule.description,
      week: newModule.weekNumber || modules.length + 1,
      items: [] as any[],
      contentSummary: '',
      uploadedAt: new Date(),
    };

    console.log("Saving module:", moduleData);
    console.log("Selected files:", newModule.selectedFiles);

    // If files are selected, process them
    if (newModule.selectedFiles.length > 0) {
      setUploadingModuleId(moduleData.id);
      const uploadedItems = [];

      try {
        for (let i = 0; i < newModule.selectedFiles.length; i++) {
          const file = newModule.selectedFiles[i];
          console.log(`📁 Processing file ${i + 1}/${newModule.selectedFiles.length}: ${file.name}`);

          if (!SUPPORTED_FILE_TYPES.includes(file.type)) {
            console.warn(`⚠️ Skipped unsupported file type: ${file.type} for ${file.name}`);
            toast.warning(`Skipped ${file.name}: Unsupported file type`);
            continue;
          }

          try {
            // Update progress
            const progressKey = `${moduleData.id}-create`;
            setUploadProgress((prev) => ({
              ...prev,
              [progressKey]: Math.round(((i + 1) / newModule.selectedFiles.length) * 100),
            }));

            console.log(`⏳ Extracting content from: ${file.name}`);

            // Extract content
            const fileContent = await extractFileContent(file, file.type);
            console.log(`✅ Content extracted: ${fileContent.length} characters`);

            if (fileContent.length === 0) {
              console.warn(`⚠️ No content extracted from ${file.name}`);
            }

            // Create module item
            const newItem = {
              id: `item_${Date.now()}_${i}`,
              title: file.name.replace(/\.[^.]+$/, ''),
              fileName: file.name,
              type: getFileType(file.type) as 'pdf' | 'docx' | 'txt' | 'pptx' | 'video' | 'file',
              mimeType: file.type,
              fileSize: file.size,
              fileContent: fileContent,
              uploadStatus: 'uploaded' as const,
              uploadedAt: new Date(),
            };

            uploadedItems.push(newItem);
            console.log(`✓ Prepared item: ${newItem.title}`);
          } catch (error) {
            console.error(`❌ Error processing file ${file.name}:`, error);
            toast.error(`Failed to process ${file.name}`);
          }
        }

        // Combine module with uploaded items
        if (uploadedItems.length > 0) {
          const allContent = uploadedItems
            .map((item) => item.fileContent || '')
            .filter(Boolean)
            .join('\n\n');
          const contentSummary = generateContentSummary(allContent, 300);

          moduleData.items = uploadedItems;
          moduleData.contentSummary = contentSummary;

          console.log(`✅ Module created with ${uploadedItems.length} files`);
        }
      } catch (error) {
        console.error('Error during file processing:', error);
        toast.error(`File processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setUploadingModuleId(null);
        return;
      } finally {
        setUploadProgress((prev) => {
          const newProgress = { ...prev };
          delete newProgress[`${moduleData.id}-create`];
          return newProgress;
        });
        setUploadingModuleId(null);
      }
    }

    // Save module to state
    const module: Module = moduleData;
    setModules((prev) => [...prev, module]);
    setNewModule({ title: '', displayName: '', description: '', weekNumber: 1, selectedFiles: [] });
    setShowCreateForm(false);
    createModuleTitleAutoRef.current = false;

    // Sync to SessionContext if available
    if (sessionContext?.addModule && sessionContext.sessions.length > 0) {
      const activeCourse = sessionContext.sessions[0];
      console.log('[ModulesPanel] Syncing new module to SessionContext:', activeCourse.id);
      sessionContext.addModule(activeCourse.id, module);

      // If there are items, sync them too
      if (module.items.length > 0 && sessionContext.addModuleItem) {
        module.items.forEach((item) => {
          sessionContext.addModuleItem(activeCourse.id, module.id, item);
        });
      }
    }

    toast.success(`Module "${module.title}" created${module.items.length > 0 ? ` with ${module.items.length} file(s)` : ''}`);
  };

  const handleFileUpload = async (moduleId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    console.log("🔷 Upload handler triggered");
    console.log("📁 Files selected:", files);
    console.log("📊 Module ID:", moduleId);
    console.log("📚 Current modules:", modules);
    
    if (!files || files.length === 0) {
      console.warn("⚠️ No files selected");
      return;
    }

    setUploadingModuleId(moduleId);
    const progressKey = `${moduleId}-files`;
    const uploadedItems = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`✓ File ${i + 1}/${files.length}:`, file.name, `Type: ${file.type}, Size: ${file.size} bytes`);

        if (!SUPPORTED_FILE_TYPES.includes(file.type)) {
          console.warn(`❌ Skipped unsupported file type: ${file.type} for ${file.name}`);
          toast.warning(`Skipped ${file.name}: Unsupported file type`);
          continue;
        }

        try {
          // Update progress
          setUploadProgress((prev) => ({
            ...prev,
            [progressKey]: Math.round(((i + 1) / files.length) * 100),
          }));

          console.log(`⏳ [Upload] Processing: ${file.name} (${file.type}, ${file.size} bytes)`);

          // Extract content
          const fileContent = await extractFileContent(file, file.type);
          console.log(`✅ [Upload] Extracted content: ${fileContent.length} characters`);

          if (fileContent.length === 0) {
            console.warn(`⚠️ [Upload] No content extracted from ${file.name}`);
          }

          // Create module item
          const newItem = {
            id: `item_${Date.now()}_${i}`,
            title: file.name.replace(/\.[^.]+$/, ''),
            fileName: file.name,
            type: getFileType(file.type) as 'pdf' | 'docx' | 'txt' | 'pptx' | 'video' | 'file',
            mimeType: file.type,
            fileSize: file.size,
            fileContent: fileContent,
            uploadStatus: 'uploaded' as const,
            uploadedAt: new Date(),
          };

          uploadedItems.push(newItem);
          console.log(`✓ Prepared item:`, newItem);
        } catch (error) {
          console.error(`❌ Error processing file ${file.name}:`, error);
          toast.error(`Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Update state with all uploaded items
      if (uploadedItems.length > 0) {
        console.log(`📤 Updating module ${moduleId} with ${uploadedItems.length} items`);
        let updatedModule: Module | undefined;
        
        setModules((prev) => {
          console.log("📊 Previous modules state:", prev);
          
          const updated = prev.map((m) => {
            if (m.id === moduleId) {
              const allItems = [...m.items, ...uploadedItems];
              const allContent = allItems
                .map((item) => item.fileContent || '')
                .filter(Boolean)
                .join('\n\n');
              const newContentSummary = generateContentSummary(allContent, 300);

              console.log(`✅ [Upload] Module "${m.title}" updated with ${uploadedItems.length} files`);
              console.log(`   New items count: ${allItems.length}`);
              console.log(`   New content summary length: ${newContentSummary.length}`);
              
              const updatedM = {
                ...m,
                items: allItems,
                contentSummary: newContentSummary,
              };
              updatedModule = updatedM;
              return updatedM;
            }
            return m;
          });
          
          console.log("📊 New modules state:", updated);
          return updated;
        });

        // Sync to SessionContext if available
        if (updatedModule && sessionContext?.addModuleItem && sessionContext.sessions.length > 0) {
          const activeCourse = sessionContext.sessions[0];
          console.log(`🔄 [SessionSync] Syncing ${uploadedItems.length} items to SessionContext for course ${activeCourse.id}`);
          uploadedItems.forEach((item) => {
            sessionContext.addModuleItem(activeCourse.id, moduleId, item);
          });
        }

        toast.success(`${uploadedItems.length} file(s) uploaded successfully`);
      } else {
        console.warn("⚠️ No supported files to upload");
        toast.error('No supported files to upload. Please check the file types.');
      }
    } catch (error) {
      console.error('Error during upload:', error);
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Reset progress
      setUploadProgress((prev) => {
        const newProgress = { ...prev };
        delete newProgress[progressKey];
        return newProgress;
      });

      setUploadingModuleId(null);
      
      // Reset file input so the same file can be uploaded again
      event.currentTarget.value = '';
    }
  };

  const handleCreateFormFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (files) {
      const selected = Array.from(files);
      console.log("Selected files for new module:", selected.map(f => f.name));

      setNewModule((prev) => {
        const next = {
          ...prev,
          selectedFiles: [...prev.selectedFiles, ...selected],
        };

        // Auto-fill module title from filename when the user hasn't typed a title yet
        // (or when the last title was auto-generated).
        if (selected.length === 1) {
          const derived = deriveCleanTitleFromFilename(selected[0].name);
          const userHasTypedTitle = Boolean(prev.title.trim() || prev.displayName.trim());

          if (derived && (!userHasTypedTitle || createModuleTitleAutoRef.current)) {
            next.title = derived;
            if (!prev.displayName.trim()) next.displayName = derived;
            createModuleTitleAutoRef.current = true;
          }
        }

        return next;
      });

      // Reset input so user can select same file again if needed
      event.currentTarget.value = '';
    }
  };

  const handleRemoveSelectedFile = (index: number) => {
    setNewModule((prev) => ({
      ...prev,
      selectedFiles: prev.selectedFiles.filter((_, i) => i !== index),
    }));
  };

  const handleDeleteModule = (id: string) => {
    if (!confirm('Are you sure you want to delete this module?')) return;

    setModules((prev) => prev.filter((m) => m.id !== id));
    toast.success('Module deleted');
  };

  const handleDeleteItem = (moduleId: string, itemId: string) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id === moduleId) {
          const updatedItems = m.items.filter((item) => item.id !== itemId);
          const allContent = updatedItems
            .map((item) => item.fileContent || '')
            .filter(Boolean)
            .join('\n\n');
          const newContentSummary = generateContentSummary(allContent, 300);

          return {
            ...m,
            items: updatedItems,
            contentSummary: newContentSummary,
          };
        }
        return m;
      })
    );
    toast.success('File removed');
  };

  const getFileType = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'docx';
    if (mimeType.includes('text')) return 'txt';
    if (mimeType.includes('presentation')) return 'pptx';
    return 'file';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="w-5 h-5" />;
      case 'link':
        return <Link className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Learning Modules</h2>
          <p className="text-muted-foreground mt-1">Upload and manage course materials (PDF, DOCX, TXT, PPTX)</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Module
        </Button>
      </div>

      {showCreateForm && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Create New Module</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Module Title</label>
              <Input
                placeholder="e.g., Introduction to Algorithms"
                value={newModule.title}
                onChange={(e) => {
                  createModuleTitleAutoRef.current = false;
                  setNewModule({ ...newModule, title: e.target.value });
                }}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Display Name (Optional)</label>
              <Input
                placeholder="e.g., Chapter 1, Lesson 1, Unit 3"
                value={newModule.displayName}
                onChange={(e) => {
                  createModuleTitleAutoRef.current = false;
                  setNewModule({ ...newModule, displayName: e.target.value });
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">Use friendly names like Chapter 1, Lesson 2, etc.</p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Week Number</label>
              <Input
                type="number"
                min="1"
                value={newModule.weekNumber}
                onChange={(e) => setNewModule({ ...newModule, weekNumber: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Description</label>
              <Textarea
                placeholder="Brief overview of the module content..."
                value={newModule.description}
                onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="border-t pt-4">
              <label className="text-sm font-medium mb-3 block">Upload PDF/Files (Optional)</label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer relative group">
                <input
                  ref={createFormFileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={handleCreateFormFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Click to upload PDF, Word, Text, or PowerPoint files
                </p>
              </div>

              {newModule.selectedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Selected Files ({newModule.selectedFiles.length}):</p>
                  {newModule.selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveSelectedFile(index)}
                        className="flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Alert>
              <Upload className="h-4 w-4" />
              <AlertDescription>
                Files will be processed and content extracted when you click "Add Module". You can add more files to this module later.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button onClick={handleCreateModule} className="flex-1">
                Create Module {newModule.selectedFiles.length > 0 && `with ${newModule.selectedFiles.length} file(s)`}
              </Button>
              <Button variant="outline" onClick={() => {
                setShowCreateForm(false);
                setNewModule({ title: '', displayName: '', description: '', weekNumber: 1, selectedFiles: [] });
                createModuleTitleAutoRef.current = false;
              }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4">
        {modules.map((module) => (
          <Card key={module.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white -mx-6 -mt-6 rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {module.displayName || module.title}
                  </CardTitle>
                  {module.description && (
                    <p className="text-sm text-white/80 mt-1">{module.description}</p>
                  )}
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="bg-white/20">
                    Week {module.week}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {/* Content Summary */}
              {module.contentSummary && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Content Summary</p>
                  <p className="text-sm">{module.contentSummary}</p>
                </div>
              )}

              {/* Uploaded Files */}
              {module.items.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Uploaded Files ({module.items.length})</p>
                  {module.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3 flex-1">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.fileName}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{item.fileSize && `${(item.fileSize / 1024).toFixed(1)} KB`}</span>
                            {item.fileContent && item.fileContent.length > 0 ? (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-3 h-3" />
                                Content extracted ({item.fileContent.length} chars)
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-amber-600">
                                <AlertCircle className="w-3 h-3" />
                                No extractable content
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteItem(module.id, item.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* File Upload */}
              <div>
                <label className="text-sm font-medium block mb-2">
                  {module.items.length === 0 ? 'Upload Module Files' : 'Add More Files'}
                </label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer relative group">
                  <input
                    ref={(el) => {
                      if (el) fileInputRefs.current[module.id] = el;
                    }}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTRIBUTE}
                    onChange={(e) => handleFileUpload(module.id, e)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {uploadingModuleId === module.id ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Processing files...</p>
                      <Progress value={uploadProgress[`${module.id}-files`] || 50} className="h-1" />
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Click to upload PDF, Word, Text, or PowerPoint files
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2">
                  <Download className="w-4 h-4" />
                  Download Content
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDeleteModule(module.id)}
                  className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Module
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {modules.length === 0 && !showCreateForm && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Modules Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by adding your first learning module with uploaded materials
              </p>
              <Button onClick={() => setShowCreateForm(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create First Module
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
