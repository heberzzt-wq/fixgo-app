from pathlib import Path
import subprocess


def replace_exact(path: Path, old: str, new: str, expected: int = 1):
    text = path.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path.name}:EXPECTED_{expected}_FOUND_{count}:{old[:80]}')
    path.write_text(text.replace(old, new, expected))


# Historical carrier replay predates the single-semantic-authority retirement of
# these modules. They are compatibility URLs only, never runtime planners. Rebase
# them onto the current branch's already-certified inert canaries after replay so
# old carrier mutations cannot resurrect an alternate lexical/cognitive surface.
legacy_canaries = [
    Path('gestia-core/brain.engine.js'),
    Path('gestia-core/semantic.engine.js'),
    Path('gestia-core/nexo/nexo.mission.compiler.js'),
    Path('gestia-core/nexo/nexo.mission.compiler.v2.js'),
    Path('gestia-core/nexo/nexo.semantic-planner-resilience.js'),
]
for path in legacy_canaries:
    baseline = subprocess.check_output(
        ['git', 'show', f'HEAD:{path.as_posix()}'],
        text=True,
    )
    forbidden = (
        'globalThis.fetch =',
        'compileNexoMission(',
        '.match(',
        '.matchAll(',
        '.test(',
    )
    if 'COMPATIBILITY_CANARY_ONLY' not in baseline:
        raise SystemExit(f'{path}:CURRENT_HEAD_NOT_COMPATIBILITY_CANARY')
    if any(marker in baseline for marker in forbidden):
        raise SystemExit(f'{path}:CURRENT_HEAD_CANARY_HAS_ACTIVE_COGNITION_MARKER')
    path.write_text(baseline)

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

print('CURRENT_POLICY_V5_TWO_PASS_TEST_COMPAT=true')
print('CURRENT_POLICY_V5_LEGACY_CANARIES_REBASED=true')
print('ACTIVE_RUNTIME_UNCHANGED_BY_TEST_COMPAT=true')
