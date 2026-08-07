from pathlib import Path
import subprocess

subprocess.run(
    ["python3", ".github/scripts/v94-media-final-grounding-v4j2.py"],
    check=True
)

test_path = Path("tests/jarvis-media-analysis.test.cjs")
tests = test_path.read_text(encoding="utf-8")

old_first = '''    assert.equal(calls, 2);
    assert.equal(result.repairCount, 1);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.doesNotMatch(JSON.stringify(result), /07\\/08\\/2023|2023/);
});'''
new_first = '''    assert.equal(calls, 1);
    assert.equal(result.repairCount, 0);
    assert.equal(result.analysisMode, "COMBINED");
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.doesNotMatch(JSON.stringify(result), /07\\/08\\/2023|2023/);
});'''
if old_first not in tests:
    raise SystemExit("v4j3 first strict regression anchor missing")
tests = tests.replace(old_first, new_first, 1)

old_second = '''    assert.equal(calls, 2);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.deepEqual(result.sources[0].inferences, []);'''
new_second = '''    assert.equal(calls, 1);
    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.analysisMode, "COMBINED");
    assert.deepEqual(result.sources[0].inferences, []);'''
if old_second not in tests:
    raise SystemExit("v4j3 second strict regression anchor missing")
tests = tests.replace(old_second, new_second, 1)

test_path.write_text(tests, encoding="utf-8")
