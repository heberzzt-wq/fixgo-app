from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def remove_between(text, start, end, replacement, label):
    first = text.find(start)
    if first < 0:
        raise SystemExit(f'WAVE5_START_NOT_FOUND:{label}')
    last = text.find(end, first + len(start))
    if last < 0:
        raise SystemExit(f'WAVE5_END_NOT_FOUND:{label}')
    return text[:first] + replacement + text[last:]


path = 'gestia-terminal.js'
text = read(path)

# Remove the dead local natural-language dependency-repair classifier. The
# semantic planner must select the appropriate repo tool and structured args.
dependency_start = '''/* =====================================================\n   DEPENDENCY REPAIR INTERCEPTOR\n===================================================== */\n'''
dependency_end = '''/* =====================================================\n   REPO AUDIT INTERCEPTORS\n===================================================== */\n'''
text = remove_between(
    text,
    dependency_start,
    dependency_end,
    '''/* =====================================================\n   DEPENDENCY REPAIR IS SEMANTIC-PLANNER OWNED\n===================================================== */\n\n''' + dependency_end,
    'remove-local-dependency-language-router'
)

# Remove the alternate adaptive/predictive cognition boot import entirely.
intelligence_start = '''/* =====================================================================================\n   RUNTIME INTELLIGENCE MODULE\n===================================================================================== */\n'''
intelligence_end = '''/* =====================================================================================\n   RUNTIME PLATFORM MODULE\n===================================================================================== */\n'''
text = remove_between(
    text,
    intelligence_start,
    intelligence_end,
    '''/* =====================================================================================\n   RUNTIME PLATFORM MODULE\n===================================================================================== */\n''',
    'remove-runtime-intelligence-boot'
)

# No stale string registration survives in Terminal.
text = text.replace('"runtime_intelligence",', '"retired_runtime_tool",')
text = text.replace('"runtime_intelligence"', '"retired_runtime_tool"')

write(path, text)
print('V94_SINGLE_BRAIN_PRUNE_WAVE5_APPLIED')
