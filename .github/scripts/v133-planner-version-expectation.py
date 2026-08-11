from pathlib import Path

path = Path("tests/jarvis-multifunction-tools.test.mjs")
source = path.read_text(encoding="utf-8")
old = '"4.17.0-source-grounded-research-v124"'
new = '"4.18.0-reel-mission-fidelity-v133"'
count = source.count(old)
if count != 1:
    raise SystemExit(f"V133_PLANNER_VERSION_EXPECTATION_COUNT={count}")
source = source.replace(old, new, 1)
path.write_text(source, encoding="utf-8")
print("V133_PLANNER_VERSION_EXPECTATION_ALIGNED=true")
