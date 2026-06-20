#!/usr/bin/env python3
"""
Final cleanup for aiQuestionGenerator.ts - removes orphaned duplicate code
This script safely removes lines 523-538 which are duplicate/orphaned code
"""

import re

filepath = r'C:\Users\Userr\Desktop\proctortab\src\utils\aiQuestionGenerator.ts'

try:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find and remove the orphaned code block
    # Pattern: closing brace, then orphaned statements, then "function escapeRegex"
    pattern = r'}\n\s+const phrases = Array\.from.*?return distractors\.slice\(0, count\);\n}\n'
    
    # Use DOTALL flag to match across lines
    fixed_content = re.sub(pattern, '}\n\n', content, flags=re.DOTALL)
    
    if fixed_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        print("✓ Removed orphaned code from aiQuestionGenerator.ts")
        print(f"  Content size: {len(content)} → {len(fixed_content)} bytes")
    else:
        print("✓ No orphaned code found or already clean")
        
except Exception as e:
    print(f"✗ Error: {e}")
    exit(1)
