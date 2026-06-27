import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronDown, AlertCircle } from 'lucide-react';
import type { CourseModule } from '@/context/SessionContext';
import {
  getAllSelectableModuleFiles,
  validateFilesHaveContent,
  getFileTypeIcon,
  formatFileSize,
  type SelectableModuleFile,
} from '@/utils/moduleListingService';

interface ModuleFileSelectorProps {
  modules: CourseModule[];
  selectedFileIds: string[];
  onSelectionChange: (fileIds: string[]) => void;
  singleSelect?: boolean;
}

export function ModuleFileSelector({
  modules,
  selectedFileIds,
  onSelectionChange,
  singleSelect = false,
}: ModuleFileSelectorProps) {
  const [open, setOpen] = useState(false);

  const availableFiles = useMemo(
    () => getAllSelectableModuleFiles(modules),
    [modules]
  );

  const selectedFiles = useMemo(
    () => availableFiles.filter((f) => selectedFileIds.includes(f.id)),
    [availableFiles, selectedFileIds]
  );

  const validation = useMemo(
    () => validateFilesHaveContent(modules, selectedFileIds),
    [modules, selectedFileIds]
  );

  const handleSelectFile = (fileId: string) => {
    if (singleSelect) {
      onSelectionChange([fileId]);
      setOpen(false);
    } else {
      if (selectedFileIds.includes(fileId)) {
        onSelectionChange(selectedFileIds.filter((id) => id !== fileId));
      } else {
        onSelectionChange([...selectedFileIds, fileId]);
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedFileIds.length === availableFiles.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(availableFiles.map((f) => f.id));
    }
  };

  const displayText =
    selectedFiles.length === 0
      ? 'Select module files...'
      : singleSelect
        ? selectedFiles[0]?.displayName
        : `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''} selected`;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-12 bg-[#0b0e27] border-white/[0.07] text-slate-200 hover:bg-white/[0.04]"
          >
            <span className="truncate text-left">{displayText}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[400px] overflow-y-auto bg-[#0b0e27] border-white/[0.07]" align="start">
          <Command className="bg-[#0b0e27]">
            <CommandEmpty className="text-slate-400 py-6">No module files found.</CommandEmpty>
            <CommandList className="max-h-[350px] overflow-y-auto">
              {!singleSelect && availableFiles.length > 0 && (
                <div className="border-b border-white/[0.07] px-2 py-1.5 bg-[#070a1f]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs text-slate-300 hover:bg-white/[0.04]"
                    onClick={handleSelectAll}
                  >
                    <Checkbox
                      checked={
                        selectedFileIds.length === availableFiles.length &&
                        availableFiles.length > 0
                      }
                      className="mr-2"
                    />
                    {selectedFileIds.length === availableFiles.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>
                </div>
              )}

              {availableFiles.length > 0 && (
                <CommandGroup className="p-1">
                  {availableFiles.map((file) => (
                    <CommandItem
                      key={file.id}
                      value={file.id}
                      onSelect={() => handleSelectFile(file.id)}
                      className="cursor-pointer hover:bg-white/[0.04] text-slate-200"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0 py-2">
                        {!singleSelect && (
                          <Checkbox
                            checked={selectedFileIds.includes(file.id)}
                            className="mr-1 shrink-0"
                          />
                        )}
                        {singleSelect && (
                          <Check
                            className={`mr-2 h-4 w-4 shrink-0 ${
                              selectedFileIds.includes(file.id)
                                ? 'opacity-100 text-violet-400'
                                : 'opacity-0'
                            }`}
                          />
                        )}
                        <span className="text-lg shrink-0">{getFileTypeIcon(file.fileType)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate text-slate-200">
                            {file.displayName}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {file.moduleTitle}
                          </div>
                          {file.fileSize && (
                            <div className="text-xs text-slate-600">
                              {formatFileSize(file.fileSize)}
                            </div>
                          )}
                        </div>
                        {file.hasContent && (
                          <Badge variant="secondary" className="ml-2 shrink-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            Ready
                          </Badge>
                        )}
                        {!file.hasContent && (
                          <Badge variant="outline" className="ml-2 shrink-0 border-amber-500/30 text-amber-400 bg-amber-500/5">
                            Empty
                          </Badge>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Validation message */}
      {selectedFileIds.length > 0 && !validation.valid && (
        <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">
              {validation.emptyCount} file{validation.emptyCount !== 1 ? 's' : ''} without extractable content
            </p>
            <p className="text-xs">
              {validation.details && validation.details.length > 0
                ? `Issue: ${validation.details.filter(d => d.includes('✗')).map(d => d.replace('✗ ', '')).join(', ')}`
                : 'Questions will be generated from files with content only.'}
            </p>
            <p className="text-xs mt-1">
              <strong>Note:</strong> PDFs may be scanned images without extractable text. Try text-based PDFs or DOCX files instead.
            </p>
          </div>
        </div>
      )}

      {/* Selected files display */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
          {selectedFiles.map((file) => (
            <Badge 
              key={file.id} 
              variant="secondary" 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 text-slate-200 border-violet-500/20 hover:bg-violet-500/20"
            >
              <span className="text-sm">{getFileTypeIcon(file.fileType)}</span>
              <span className="text-xs font-medium truncate max-w-[150px]">{file.displayName}</span>
              {!singleSelect && (
                <button
                  onClick={() => handleSelectFile(file.id)}
                  className="ml-1 hover:text-red-400 transition-colors"
                  aria-label="Remove file"
                >
                  ✕
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
