#!/usr/bin/env python3
import re

file_path = r'src\components\assessment\CreateCourseAssessmentDialog.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the condition line
old_condition = '{!overrideTab && !overrideCopyPaste && !overrideFullscreen'
new_condition = '{!overrideTab && !overrideCopyPaste && !overrideFullscreen && !overrideScreenshot && !overrideAlarm'

if old_condition in content:
    content = content.replace(old_condition, new_condition)
    print(f"Replaced condition: {old_condition} -> {new_condition}")
else:
    print("Condition not found")

# Now insert the two new toggle sections before the Mode paragraph
# Find the last switch before the Mode paragraph
old_toggle_section = '''               </div>
               <p className="text-xs text-muted-foreground rounded-md bg-background/60 p-2 border">'''

new_toggle_section = '''               </div>
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
               <p className="text-xs text-muted-foreground rounded-md bg-background/60 p-2 border">'''

if old_toggle_section in content:
    content = content.replace(old_toggle_section, new_toggle_section)
    print("Added new toggles")
else:
    print("Toggle section not found")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("File updated successfully")
