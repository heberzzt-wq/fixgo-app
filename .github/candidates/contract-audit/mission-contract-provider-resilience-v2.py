from pathlib import Path

path = Path('tests/jarvis-mission-contract-policy-compat-v3.test.mjs')
text = path.read_text()
old = "const a=source.indexOf('function cloudMissionContractPolicyCertified');"
new = "const a=source.indexOf('async function callMissionContractCoverageAuthority');"
if text.count(old) != 1:
    raise SystemExit(f'POLICY_TEST_AUTHORITY_START_COUNT:{text.count(old)}')
path.write_text(text.replace(old, new, 1))

planner = Path('gestia-core/jarvis/jarvis.multifunction.planner.js')
planner_text = planner.read_text()
old_status = '''function browserMissionContractHttpStatus(error = null) {
    const match = String(error?.message || "")
        .match(/CLIENT_MISSION_CONTRACT_HTTP_(\\d{3})/);
    return match ? Number(match[1]) : null;
}'''
new_status = '''function browserMissionContractHttpStatus(error = null) {
    const message = String(error?.message || "");
    const prefix = "CLIENT_MISSION_CONTRACT_HTTP_";
    const start = message.indexOf(prefix);
    if (start < 0) return null;

    const raw = message.slice(
        start + prefix.length,
        start + prefix.length + 3
    );
    if (raw.length !== 3) return null;

    for (const character of raw) {
        const code = character.charCodeAt(0);
        if (code < 48 || code > 57) return null;
    }

    return Number(raw);
}'''
if planner_text.count(old_status) != 1:
    raise SystemExit(f'PROVIDER_HTTP_STATUS_MATCH_COUNT:{planner_text.count(old_status)}')
planner.write_text(planner_text.replace(old_status, new_status, 1))

print('MISSION_CONTRACT_PROVIDER_RESILIENCE_V2_TEST_SCOPE=true')
print('MISSION_CONTRACT_PROVIDER_RESILIENCE_NO_LEXICAL_REGEX=true')
