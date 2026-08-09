from pathlib import Path

path = Path('tools/v94_single_brain_prune_wave7.py')
text = path.read_text(encoding='utf-8')

old = '''    new_rank_tool + rank_end,\n    'tools-runtime-structural-ranking'\n)'''
new = '''    new_rank_tool,\n    'tools-runtime-structural-ranking'\n)'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'WAVE7_TOOL_BOUNDARY_FIX_NOT_FOUND:{count}')
text = text.replace(old, new, 1)

old_route = '''route_end = text.find('\\n\\n    app.post("', route_start + 20)\nif route_end < 0:\n    raise SystemExit('WAVE7_REPO_CANDIDATES_NEXT_ROUTE_NOT_FOUND')'''
new_route = '''route_end = text.find('\\n\\n        app.post("/read", async (req, res) => {', route_start + 20)\nif route_end < 0:\n    raise SystemExit('WAVE7_REPO_READ_BOUNDARY_NOT_FOUND')'''
count = text.count(old_route)
if count != 1:
    raise SystemExit(f'WAVE7_REPO_ROUTE_BOUNDARY_FIX_NOT_FOUND:{count}')
text = text.replace(old_route, new_route, 1)

path.write_text(text, encoding='utf-8')
print('V94_WAVE7_BOUNDARIES_FIXED')
