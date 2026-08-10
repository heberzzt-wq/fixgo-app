from pathlib import Path

RELEASE = "v94-generalist-production-integrity-v121-20260810"
V119 = "v94-current-turn-freshness-v119-20260810"
V118 = "v94-page-request-contract-v118-20260810"
V120 = "v94-generalist-page-integrity-v120-20260810"
V121 = "v94-page-factual-integrity-v121-20260810"


def replace_exact(path, old, new, expected=1):
    target = Path(path)
    source = target.read_text(encoding="utf-8")
    count = source.count(old)
    if count != expected:
        raise SystemExit(f"FINAL_CACHE_REPLACEMENT_COUNT:{path}:{count}:{old}")
    target.write_text(source.replace(old, new), encoding="utf-8")


# Shell: v119 staging already rewrites all four active shell entrypoints.
replace_exact(
    "gestia-terminal.html",
    V119,
    RELEASE,
    expected=4,
)

# Core entrypoints: planner and tool runtime must both resolve the final bytes.
replace_exact(
    "gestia-core/gestia-core.js",
    f"/gestia-core/jarvis/jarvis.multifunction.planner.js?v={V118}",
    f"/gestia-core/jarvis/jarvis.multifunction.planner.js?v={RELEASE}",
)
replace_exact(
    "gestia-core/gestia-core.js",
    f"/gestia-core/tools.runtime.js?v={V118}",
    f"/gestia-core/tools.runtime.js?v={RELEASE}",
)

# Tool runtime must load the final multitool and actuator packs.
replace_exact(
    "gestia-core/tools.runtime.js",
    f'./jarvis/jarvis.multitool.pack.js?v={V118}',
    f'./jarvis/jarvis.multitool.pack.js?v={RELEASE}',
)
replace_exact(
    "gestia-core/tools.runtime.js",
    f'./jarvis/jarvis.actuator.pack.js?v={V118}',
    f'./jarvis/jarvis.actuator.pack.js?v={RELEASE}',
)

# Multitool dependencies changed by v120/v121 need their own cache boundary.
replace_exact(
    "gestia-core/jarvis/jarvis.multitool.pack.js",
    f'./jarvis.identity.integrity.js?v={V120}',
    f'./jarvis.identity.integrity.js?v={RELEASE}',
)
replace_exact(
    "gestia-core/jarvis/jarvis.multitool.pack.js",
    f'./jarvis.page.factual.integrity.js?v={V121}',
    f'./jarvis.page.factual.integrity.js?v={RELEASE}',
)
replace_exact(
    "gestia-core/jarvis/jarvis.multitool.pack.js",
    'from "./jarvis.page.creator.js";',
    f'from "./jarvis.page.creator.js?v={RELEASE}";',
)
replace_exact(
    "gestia-core/jarvis/jarvis.multitool.pack.js",
    'from "./jarvis.multifunction.planner.js?v=sia7-multimodal-batch-integrity-v95-20260727";',
    f'from "./jarvis.multifunction.planner.js?v={RELEASE}";',
)

# Actuator must resolve the already-certified v118 page artifact bytes through final release.
replace_exact(
    "gestia-core/jarvis/jarvis.actuator.pack.js",
    f'../../jarvis-page-artifact.js?v={V118}',
    f'../../jarvis-page-artifact.js?v={RELEASE}',
)

# Permanent source-level tests should assert the final release, not stale intermediate cache tokens.
replace_exact(
    "tests/jarvis-current-turn-freshness-v119.test.mjs",
    'const release = "v94-current-turn-freshness-v119-20260810";',
    f'const release = "{RELEASE}";',
)
replace_exact(
    "tests/jarvis-semantic-memory-integrity.test.mjs",
    'assert.match(core, /tools\\.runtime\\.js\\?v=v94-page-request-contract-v118-20260810/);',
    f'assert.match(core, /tools\\.runtime\\.js\\?v={RELEASE}/);',
)

# Fail closed if an active entrypoint still points to an intermediate release.
checks = {
    "gestia-terminal.html": [V119],
    "gestia-core/gestia-core.js": [V118],
    "gestia-core/tools.runtime.js": [V118],
    "gestia-core/jarvis/jarvis.multitool.pack.js": [V120, V121, "sia7-multimodal-batch-integrity-v95-20260727"],
    "gestia-core/jarvis/jarvis.actuator.pack.js": [V118],
}
for path, residues in checks.items():
    source = Path(path).read_text(encoding="utf-8")
    for residue in residues:
        if residue in source:
            raise SystemExit(f"FINAL_CACHE_RESIDUE:{path}:{residue}")

required_counts = {
    "gestia-terminal.html": 4,
    "gestia-core/gestia-core.js": 2,
    "gestia-core/tools.runtime.js": 2,
    "gestia-core/jarvis/jarvis.multitool.pack.js": 4,
    "gestia-core/jarvis/jarvis.actuator.pack.js": 1,
}
for path, minimum in required_counts.items():
    count = Path(path).read_text(encoding="utf-8").count(RELEASE)
    if count < minimum:
        raise SystemExit(f"FINAL_CACHE_RELEASE_COUNT:{path}:{count}:{minimum}")

print(f"FINAL_CACHE_CHAIN_READY={RELEASE}")
