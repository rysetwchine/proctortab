#!/usr/bin/env python3
import re

file_path = r'src\components\dashboard\Coursedetails.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

print("File read successfully")

# Find the section with the buttons and insert the upload section before it
old_section = '''              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" onClick={() => void handleAddModule()} className="flex-1">
                  Add module
                </Button>'''

new_section = '''              </div>

              <div className="border-t pt-4">
                <label className="text-sm font-medium mb-3 block">Upload PDF/Files (Optional)</label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer relative group">
                  <input
                    ref={addModuleFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,application/pdf,application/msword,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                    onChange={handleAddModuleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload PDF, Word, Text, or PowerPoint files
                  </p>
                </div>

                {newModuleFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium">Selected Files ({newModuleFiles.length}):</p>
                    {newModuleFiles.map((file, index) => (
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
                          onClick={() => handleRemoveAddModuleFile(index)}
                          className="flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="button" onClick={() => void handleAddModule()} className="flex-1">
                  Add module {newModuleFiles.length > 0 && `with ${newModuleFiles.length} file(s)`}
                </Button>'''

if old_section in content:
    content = content.replace(old_section, new_section)
    print("✓ Added file upload section")
else:
    print("✗ Old section not found. Searching for components...")
    if "Add module" in content:
        print("✓ Found 'Add module' in file")
    if "flex gap-2 pt-2" in content:
        print("✓ Found 'flex gap-2 pt-2' in file")
    if "flex gap-2" in content and "pt-2" in content:
        print("! Found both parts but not together")

# Update the button text to include file count (second part)
old_button_text = '''                  Add module
                </Button>'''

new_button_text = '''                  Add module {newModuleFiles.length > 0 && `with ${newModuleFiles.length} file(s)`}
                </Button>'''

# Update pt-2 to pt-4 for button spacing
if "pt-2" in content:
    # Be careful - only replace in the buttons div
    if 'className="flex gap-2 pt-2"' in content:
        content = content.replace('className="flex gap-2 pt-2"', 'className="flex gap-2 pt-4"')
        print("✓ Updated button spacing from pt-2 to pt-4")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("File updated successfully")
