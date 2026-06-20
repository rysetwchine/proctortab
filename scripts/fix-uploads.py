#!/usr/bin/env python3
"""Fix the upload handlers to not duplicate Firestore saves"""

import re

# Read the file
with open('src/components/dashboard/Coursedetails.tsx', 'r') as f:
    content = f.read()

# Pattern to find and replace - the old pattern with manual Firestore save
old_pattern = r'''// Add to module
                                    addModuleItem\(course\.id, module\.id, moduleItem\);

                                    // Save updated module to Firestore
                                    const updatedModule: CourseModule = \{
                                      \.\.\.module,
                                      items: \[\.\.\.\(module\.items \|\| \[\]\), moduleItem\],
                                      uploadedAt: new Date\(\),
                                    \};

                                    try \{
                                      await saveModuleToFirestore\(course\.id, updatedModule\);
                                    \} catch \(firestoreError\) \{
                                      console\.warn\('\[ModuleUpload\] Firestore save warning:', firestoreError\);
                                      // Continue even if Firestore fails - data is in session
                                    \}'''

new_code = '''// Add to module (this updates state and syncs to Firestore automatically)
                                    addModuleItem(course.id, module.id, moduleItem);'''

# Replace all occurrences
content_fixed = re.sub(
    r'// Add to module\s+addModuleItem\(course\.id, module\.id, moduleItem\);\s+// Save updated module to Firestore\s+const updatedModule: CourseModule = \{[^}]+\};[\s\S]*?} catch \(firestoreError\) \{[^}]+\}',
    new_code,
    content
)

# Write back
with open('src/components/dashboard/Coursedetails.tsx', 'w') as f:
    f.write(content_fixed)

print("Fixed upload handlers!")
