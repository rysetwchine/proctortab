const fs = require('fs');
const path = require('path');

const filePath = 'src/components/dashboard/Coursedetails.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the button section with file upload section included
// Use unique patterns to identify the location
const searchFor = `               </div>
               <div className="flex gap-2 pt-2">`;

const replacementWith = `               </div>

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

               <div className="flex gap-2 pt-4">`;

if (content.includes(searchFor)) {
  console.log('✓ Found the section to update');
  content = content.replaceAll(searchFor, replacementWith);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ File updated successfully');
  process.exit(0);
} else {
  console.error('✗ Search pattern not found. Trying to debug...');
  // Look for components of the pattern
  if (content.includes('pt-2">')) {
    const idx = content.indexOf('pt-2">');
    console.log('Found "pt-2">', 'context:');
    console.log(content.substring(Math.max(0, idx - 100), idx + 200));
  }
  process.exit(1);
}
