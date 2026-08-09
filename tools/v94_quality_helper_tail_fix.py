from pathlib import Path

path = Path('tools/v94_single_brain_quality_patch.py')
text = path.read_text(encoding='utf-8')
start_marker = '''text = replace_between(
    text,
    old_reference_test_start,
    old_reference_test_end,
    new_reference_test + old_reference_test_end,
    'multifunction-primary-identity-owned-by-semantic-plan'
)
'''
start = text.find(start_marker)
if start < 0:
    raise SystemExit('QUALITY_HELPER_TAIL_CALL_NOT_FOUND')
replacement = '''reference_start_index = text.find(old_reference_test_start)\nif reference_start_index < 0:\n    raise SystemExit('QUALITY_START_NOT_FOUND:multifunction-primary-identity-owned-by-semantic-plan')\ntext = text[:reference_start_index] + new_reference_test\n'''
text = text[:start] + replacement + text[start + len(start_marker):]
path.write_text(text, encoding='utf-8')
print('V94_QUALITY_HELPER_TAIL_EOF_SAFE')
