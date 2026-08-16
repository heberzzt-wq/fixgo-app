from pathlib import Path
import os
import subprocess


def replace_exact(path: Path, old: str, new: str, expected: int = 1):
    text = path.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path.name}:EXPECTED_{expected}_FOUND_{count}:{old[:80]}')
    path.write_text(text.replace(old, new, expected))


def source_text(source_sha: str, path: Path) -> str:
    return subprocess.check_output(
        ['git', 'show', f'{source_sha}:{path.as_posix()}'],
        text=True,
    )


# The deterministic contract reconstruction detaches HEAD onto a historical base.
# GITHUB_SHA remains the exact branch revision that triggered the workflow, so it
# is the only safe source for semantic-authority retirements that are newer than
# that historical carrier chain.
source_sha = str(os.environ.get('GITHUB_SHA') or '').strip()
if not source_sha:
    raise SystemExit('CURRENT_POLICY_V5_SOURCE_SHA_MISSING')
subprocess.run(
    ['git', 'cat-file', '-e', f'{source_sha}^{{commit}}'],
    check=True,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)

# These compatibility URLs are never runtime planners. Rebase their certified
# inert-canary state from the workflow source revision after historical replay.
legacy_canaries = [
    Path('gestia-core/brain.engine.js'),
    Path('gestia-core/semantic.engine.js'),
    Path('gestia-core/nexo/nexo.mission.compiler.js'),
    Path('gestia-core/nexo/nexo.mission.compiler.v2.js'),
    Path('gestia-core/nexo/nexo.semantic-planner-resilience.js'),
]
for path in legacy_canaries:
    baseline = source_text(source_sha, path)
    forbidden = (
        'globalThis.fetch =',
        'compileNexoMission(',
        '.match(',
        '.matchAll(',
        '.test(',
    )
    if 'COMPATIBILITY_CANARY_ONLY' not in baseline:
        raise SystemExit(f'{path}:SOURCE_NOT_COMPATIBILITY_CANARY')
    if any(marker in baseline for marker in forbidden):
        raise SystemExit(f'{path}:SOURCE_CANARY_HAS_ACTIVE_COGNITION_MARKER')
    path.write_text(baseline)

# V5 intentionally mutates only planner/core/orchestrator/terminal HTML policy
# surfaces. The files below are independent single-semantic-authority retirements;
# old carrier replay must not resurrect their lexical/adaptive runtimes.
semantic_authority_passthrough = [
    Path('modules/terminal/nexo-bootstrap.js'),
    Path('gestia-core/jarvis/jarvis.marketing.engine.js'),
    Path('gestia-terminal.js'),
    Path('gestia-core/jarvis/jarvis.conversation.composer.js'),
    Path('gestia-core/nexo/nexo.ui.branding.js'),
]
for path in semantic_authority_passthrough:
    path.write_text(source_text(source_sha, path))

# This alternate runtime is deliberately absent at the current authority source.
retired_runtime = Path('modules/terminal/runtime-intelligence.js')
source_runtime = subprocess.run(
    ['git', 'cat-file', '-e', f'{source_sha}:{retired_runtime.as_posix()}'],
    check=False,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
if source_runtime.returncode == 0:
    raise SystemExit('CURRENT_POLICY_V5_SOURCE_RUNTIME_INTELLIGENCE_PRESENT')
if retired_runtime.exists():
    retired_runtime.unlink()

# The runtime now requires two same-provider semantic passes for mission-contract
# coverage. These changes update only generated regressions; semantic policy and
# active runtime behavior are intentionally untouched.
policy = Path('tests/jarvis-mission-contract-policy-compat-v3.test.mjs')
replace_exact(policy, '    assert.equal(cloudAuditCalls,1);', '    assert.equal(cloudAuditCalls,2);')
replace_exact(policy, '    assert.equal(auditCalls,1);', '    assert.equal(auditCalls,2);')
replace_exact(
    policy,
    "    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v1');",
    "    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v2');",
)

provider = Path('tests/jarvis-mission-contract-provider-resilience-v1.test.mjs')
replace_exact(
    provider,
    "    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v1');",
    "    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v2');",
)

no_self = Path('tests/jarvis-mission-contract-no-self-certification-v3.test.mjs')
replace_exact(no_self, '    assert.equal(auditCalls,1);', '    assert.equal(auditCalls,2);')
replace_exact(
    no_self,
    "    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v1');",
    "    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v2');",
)

legacy = Path('tests/jarvis-mission-contract-authority-closeout-v2.test.mjs')
replace_exact(
    legacy,
    "    assert.equal(urls.filter(url=>url.includes('jarvisSemanticRespond')).length,1);",
    "    assert.equal(urls.filter(url=>url.includes('jarvisSemanticRespond')).length,2);",
)
replace_exact(
    legacy,
    "    assert.equal(plan.missionContractCapabilities?.policySource,'cloud-semantic-response-audit-v1');",
    "    assert.equal(plan.missionContractCapabilities?.policySource,'cloud-semantic-response-audit-v2');",
)

print(f'CURRENT_POLICY_V5_SEMANTIC_SOURCE_SHA={source_sha}')
print('CURRENT_POLICY_V5_TWO_PASS_TEST_COMPAT=true')
print('CURRENT_POLICY_V5_LEGACY_CANARIES_REBASED=true')
print('CURRENT_POLICY_V5_SEMANTIC_AUTHORITY_REBASED=true')
print('ACTIVE_RUNTIME_UNCHANGED_BY_TEST_COMPAT=true')
