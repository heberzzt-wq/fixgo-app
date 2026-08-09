from pathlib import Path

path = Path('tools/v94_single_brain_quality_patch.py')
text = path.read_text(encoding='utf-8')
start_marker = "old_reference_test_end = 'test(\"semantic planner treats search as discovery rather than completed inspection\", async () => {'"
start = text.find(start_marker)
if start < 0:
    raise SystemExit('QUALITY_HELPER_TAIL_START_NOT_FOUND')
end = text.find('write(path, text)', start)
if end < 0:
    raise SystemExit('QUALITY_HELPER_TAIL_END_NOT_FOUND')
replacement = '''reference_start_index = text.find(old_reference_test_start)\nif reference_start_index < 0:\n    raise SystemExit('QUALITY_START_NOT_FOUND:multifunction-primary-identity-owned-by-semantic-plan')\ntext = text[:reference_start_index] + new_reference_test\n'''
text = text[:start] + replacement + text[end:]
path.write_text(text, encoding='utf-8')
print('V94_QUALITY_HELPER_TAIL_EOF_SAFE')
