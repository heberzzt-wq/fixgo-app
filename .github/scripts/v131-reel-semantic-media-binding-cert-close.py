from pathlib import Path

TEST_FILE = Path("tests/jarvis-multifunction-tools.test.mjs")
CERT_FILE = Path(".github/workflows/v131-reel-semantic-media-binding-cert.yml")

old_version = '"1.54.0-marketing-actuator-bridge-v126"'
new_version = '"1.55.0-reel-semantic-media-binding-v131"'

test_source = TEST_FILE.read_text(encoding="utf-8")
if test_source.count(old_version) != 1:
    raise SystemExit(f"V131_STALE_HEALTH_VERSION_MATCH_COUNT={test_source.count(old_version)}")
TEST_FILE.write_text(test_source.replace(old_version, new_version, 1), encoding="utf-8")

cert_source = CERT_FILE.read_text(encoding="utf-8")
old_paths = """    paths:\n      - .github/workflows/v131-reel-semantic-media-binding-cert.yml\n"""
new_paths = """    paths:\n      - .github/workflows/v131-reel-semantic-media-binding-cert.yml\n      - .github/workflows/v131-reel-semantic-media-binding-cert-close.yml\n      - .github/scripts/v131-reel-semantic-media-binding-cert-close.py\n      - gestia-core/jarvis/jarvis.reel.media-binder.js\n      - gestia-core/jarvis/jarvis.multitool.pack.js\n      - gestia-core/nexo/nexo.real-media.runtime-guard-v128.js\n      - modules/terminal/nexo-bootstrap.js\n      - gestia-core/jarvis/jarvis.reel.presenter.js\n      - gestia-core/jarvis/jarvis.actuator.pack.js\n      - jarvis-reel-artifact.js\n      - jarvis-fs-bridge.js\n      - nexo-web-media-bridge.js\n      - tests/jarvis-reel-media-binder-v131.test.mjs\n      - tests/nexo-real-media-semantic-binding-v131.test.mjs\n      - tests/nexo-real-media-runtime-guard-v128.test.mjs\n      - tests/jarvis-real-media-reel-hydration-v127.test.mjs\n      - tests/jarvis-reel-artifact.test.mjs\n      - tests/nexo-real-media-tools.test.mjs\n      - tests/nexo-web-media-bridge.test.mjs\n      - tests/jarvis-fs-bridge-v2.test.mjs\n      - tests/jarvis-multifunction-tools.test.mjs\n      - package.json\n"""
if cert_source.count(old_paths) != 1:
    raise SystemExit(f"V131_CERT_PATH_BLOCK_MATCH_COUNT={cert_source.count(old_paths)}")
CERT_FILE.write_text(cert_source.replace(old_paths, new_paths, 1), encoding="utf-8")

print("V131_STALE_HEALTH_VERSION_FIXED=true")
print("V131_CERT_SCOPE_EXPANDED=true")
