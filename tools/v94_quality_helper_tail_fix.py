from pathlib import Path

path = Path('tools/v94_single_brain_quality_patch.py')
text = path.read_text(encoding='utf-8')

def swap_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}:{count}')
    text = text.replace(old, new, 1)

swap_once(
'''text = replace_between(
    text,
    'function verifiedVisibleData(',
    'function constrainCompactEvidence(',
    'function constrainCompactEvidence(',
    'composer-remove-deterministic-media-mini-brain'
)
''',
'''text = replace_between(
    text,
    'function verifiedVisibleData(',
    'function constrainCompactEvidence(',
    '',
    'composer-remove-deterministic-media-mini-brain'
)
''',
'QUALITY_HELPER_COMPOSER_BOUNDARY'
)

swap_once(
"text = replace_between(text, start, end, replacement + end, 'conversation-replace-regex-renderer-tests')",
"text = replace_between(text, start, end, replacement, 'conversation-replace-regex-renderer-tests')",
'QUALITY_HELPER_CONVERSATION_TEST_BOUNDARY'
)

swap_once(
'''    new_brain_test + old_brain_test_end,
    'multifunction-replace-old-brain-contract'
''',
'''    new_brain_test,
    'multifunction-replace-old-brain-contract'
''',
'QUALITY_HELPER_BRAIN_TEST_BOUNDARY'
)

swap_once(
'''    new_identity_test + old_identity_test_end,
    'multifunction-image-semantic-authority-tests'
''',
'''    new_identity_test,
    'multifunction-image-semantic-authority-tests'
''',
'QUALITY_HELPER_IDENTITY_TEST_BOUNDARY'
)

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
replacement = '''reference_start_index = text.find(old_reference_test_start)\nif reference_start_index < 0:\n    raise SystemExit('QUALITY_START_NOT_FOUND:multifunction-primary-identity-owned-by-semantic-plan')\ntext = text[:reference_start_index] + new_reference_test.rstrip() + "\\n"\n'''
text = text[:start] + replacement + text[start + len(start_marker):]
path.write_text(text, encoding='utf-8')
print('V94_QUALITY_HELPER_ALL_BOUNDARIES_SAFE')
