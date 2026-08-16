from pathlib import Path


def replace_exact(path: Path, old: str, new: str, expected: int = 1):
    text = path.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path.name}:EXPECTED_{expected}_FOUND_{count}:{old[:80]}')
    path.write_text(text.replace(old, new, expected))

# The runtime now requires two same-provider semantic passes for mission-contract
# coverage. These changes update only generated regressions; runtime behavior is
# intentionally untouched.
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
print('RUNTIME_UNCHANGED_BY_TEST_COMPAT=true')
