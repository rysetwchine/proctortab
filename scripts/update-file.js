const fs = require('fs');
const path = require('path');

const filePath = 'src/components/assessment/CreateCourseAssessmentDialog.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Find the section with the fullscreen toggle and Mode display
const oldPattern = `                 />
               </div>
               <p className="text-xs text-muted-foreground rounded-md bg-background/60 p-2 border">
                 Mode:{' '}
                 <span className="font-medium">
                   {!overrideTab && !overrideCopyPaste && !overrideFullscreen
                     ? 'Use global detector settings'
                     : 'Custom — only switches turned ON apply'}
                 </span>
               </p>
             </div>`;

const newPattern = `                 />
               </div>
               <div className="flex items-center justify-between gap-2">
                 <Label htmlFor="exam-det-screenshot" className="font-normal">
                   Screenshot protection
                 </Label>
                 <Switch
                   id="exam-det-screenshot"
                   checked={overrideScreenshot}
                   onCheckedChange={setOverrideScreenshot}
                 />
               </div>
               <div className="flex items-center justify-between gap-2">
                 <Label htmlFor="exam-det-alarm" className="font-normal">
                   Alarm device detection
                 </Label>
                 <Switch
                   id="exam-det-alarm"
                   checked={overrideAlarm}
                   onCheckedChange={setOverrideAlarm}
                 />
               </div>
               <p className="text-xs text-muted-foreground rounded-md bg-background/60 p-2 border">
                 Mode:{' '}
                 <span className="font-medium">
                   {!overrideTab && !overrideCopyPaste && !overrideFullscreen && !overrideScreenshot && !overrideAlarm
                     ? 'Use global detector settings'
                     : 'Custom — only switches turned ON apply'}
                 </span>
               </p>
             </div>`;

if (content.includes(oldPattern)) {
  content = content.replace(oldPattern, newPattern);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('File updated successfully');
} else {
  console.log('Pattern not found');
}
