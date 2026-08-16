from pathlib import Path

path = Path('tests/jarvis-mission-contract-policy-compat-v3.test.mjs')
text = path.read_text()
old = "const a=source.indexOf('function cloudMissionContractPolicyCertified');"
new = "const a=source.indexOf('async function callMissionContractCoverageAuthority');"
if text.count(old) != 1:
    raise SystemExit(f'POLICY_TEST_AUTHORITY_START_COUNT:{text.count(old)}')
path.write_text(text.replace(old, new, 1))

print('MISSION_CONTRACT_PROVIDER_RESILIENCE_V2_TEST_SCOPE=true')
