#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, 'src/components/dashboard/Coursedetails.tsx');
console.log('Reading file:', filePath);

let content = fs.readFileSync(filePath, 'utf-8');

// Look for the line with "flex gap-2 pt-2" or "flex gap-2 pt-4"
const lines = content.split('\n');
let foundLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('flex gap-2 pt')) {
    foundLine = i;
    console.log(`Found at line ${i + 1}: ${lines[i]}`);
    break;
  }
}

if (foundLine === -1) {
  console.error('ERROR: Could not find the target line');
  process.exit(1);
}

// Insert the file upload section BEFORE this line
const fileUploadUI = `               <div className="border-t pt-4">
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

`;

// Replace pt-2 with pt-4 for the button div spacing
lines[foundLine] = lines[foundLine].replace('pt-2', 'pt-4');

// Insert the upload UI before the button div
lines.splice(foundLine, 0, ...fileUploadUI.split('\n'));

const updatedContent = lines.join('\n');
fs.writeFileSync(filePath, updatedContent, 'utf-8');

console.log('✓ File updated successfully');
console.log(`✓ Added file upload UI before line ${foundLine + 1}`);
console.log(`✓ Changed pt-2 to pt-4 for button spacing`);
