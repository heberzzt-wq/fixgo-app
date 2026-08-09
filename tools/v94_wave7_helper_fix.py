from pathlib import Path

path = Path('tools/v94_single_brain_prune_wave7.py')
text = path.read_text(encoding='utf-8')
old = '''    new_rank_tool + rank_end,\n    'tools-runtime-structural-ranking'\n)'''
new = '''    new_rank_tool,\n    'tools-runtime-structural-ranking'\n)'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'WAVE7_TOOL_BOUNDARY_FIX_NOT_FOUND:{count}')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('V94_WAVE7_TOOL_BOUNDARY_FIXED')
