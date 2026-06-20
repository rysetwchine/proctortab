#!/usr/bin/env python3
"""Fix the duplicate code in aiQuestionGenerator.ts"""

filepath = r'C:\Users\Userr\Desktop\proctortab\src\utils\aiQuestionGenerator.ts'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the problematic section by looking for the orphaned code
# Starting from line 523, we need to remove the old duplicate code
new_lines = []
skip_until = -1

for i, line in enumerate(lines):
    # Skip lines 523-538 (indices 522-537)
    if i >= 522 and i <= 537:
        continue
    new_lines.append(line)

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Fixed file - removed {len(lines) - len(new_lines)} duplicate lines")
print(f"Original: {len(lines)} lines")
print(f"Fixed: {len(new_lines)} lines")
