from pathlib import Path

ROOT = Path('.')


def replace_once(path, old, new, label):
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'CACHE_PATCH_ANCHOR_FAILED:{label}:{count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'gestia-terminal.html',
    '/gestia-core/gestia-core.js?v=sia7-identity-fidelity-v106-20260728',
    '/gestia-core/gestia-core.js?v=v94-generalist-followup-v107-20260809',
    'terminal-gestia-core'
)
replace_once(
    'gestia-terminal.html',
    '/gestia-core/tools.runtime.js?v=jarvis-tools-v7-20260728-identity-fidelity-v106',
    '/gestia-core/tools.runtime.js?v=v94-generalist-followup-v107-20260809',
    'terminal-tools-runtime'
)
replace_once(
    'gestia-core/gestia-core.js',
    '/gestia-core/jarvis/jarvis.conversation.composer.js?v=sia7-conversation-evidence-v98-20260727',
    '/gestia-core/jarvis/jarvis.conversation.composer.js?v=v94-repo-evidence-v99-20260809',
    'core-conversation-composer'
)
replace_once(
    'gestia-core/gestia-core.js',
    '/gestia-core/tools.runtime.js?v=jarvis-tools-v7-20260728-identity-fidelity-v106',
    '/gestia-core/tools.runtime.js?v=v94-generalist-followup-v107-20260809',
    'core-tools-runtime'
)
replace_once(
    'gestia-core/tools.runtime.js',
    './jarvis/jarvis.multitool.pack.js?v=sia7-test-outcome-evidence-v100-20260727',
    './jarvis/jarvis.multitool.pack.js?v=v94-generalist-followup-v101-20260809',
    'runtime-multitool'
)
replace_once(
    'gestia-core/jarvis/jarvis.multitool.pack.js',
    './jarvis.marketing.engine.js?v=sia7-marketing-v10-runtime-source-authority-20260724',
    './jarvis.marketing.engine.js?v=v94-generalist-assumptions-v11-20260809',
    'multitool-marketing'
)

print('V94_GENERALIST_FOLLOWUP_CACHE_PATCH_APPLIED')
