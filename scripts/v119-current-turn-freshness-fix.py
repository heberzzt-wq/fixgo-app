from pathlib import Path
import re

RELEASE = "v94-current-turn-freshness-v119-20260810"

core_path = Path("gestia-core/gestia-core.js")
core = core_path.read_text(encoding="utf-8")

current_turn_old = '''missionState: {
                        phase: "CURRENT_TURN",
                        semanticMemory,
                        writeAllowed: false
                    }'''
current_turn_new = '''missionState: {
                        phase: "CURRENT_TURN",
                        semanticMemoryAvailable: Boolean(semanticMemory),
                        writeAllowed: false
                    }'''
if core.count(current_turn_old) != 1:
    raise SystemExit(f"V119_CURRENT_TURN_MEMORY_BLOCK_COUNT_{core.count(current_turn_old)}")
core = core.replace(current_turn_old, current_turn_new, 1)

planner_memory_pattern = re.compile(r"semanticMemory\s*:\s*semanticMemoryContext")
planner_memory_count = len(planner_memory_pattern.findall(core))
if planner_memory_count != 4:
    raise SystemExit(f"V119_PLANNER_MEMORY_CONTEXT_COUNT_{planner_memory_count}")
core = planner_memory_pattern.sub(
    "semanticMemoryAvailable: Boolean(semanticMemoryContext)",
    core
)

if planner_memory_pattern.search(core):
    raise SystemExit("V119_PLANNER_MEMORY_CONTEXT_STILL_EXPOSED")
if core.count("semanticMemoryAvailable: Boolean(semanticMemoryContext)") != 4:
    raise SystemExit("V119_PLANNER_MEMORY_AVAILABILITY_COUNT_INVALID")
if core.count("memoryContext: semanticMemoryContext") != 1:
    raise SystemExit("V119_MISSION_ADVISORY_MEMORY_CONTEXT_NOT_PRESERVED")

core_path.write_text(core, encoding="utf-8")

html_path = Path("gestia-terminal.html")
html = html_path.read_text(encoding="utf-8")
replacements = {
    'fetch("/gestia-terminal.js?v=v94-secure-session-v117-20260810")': f'fetch("/gestia-terminal.js?v={RELEASE}")',
    '<script type="module" src="/gestia-core/gestia-core.js?v=v94-runtime-health-truth-v116-20260809"></script>': f'<script type="module" src="/gestia-core/gestia-core.js?v={RELEASE}"></script>',
    '<script type="module" src="/gestia-terminal.js?v=v94-secure-session-v117-20260810"></script>': f'<script type="module" src="/gestia-terminal.js?v={RELEASE}"></script>',
    'src="/gestia-core/gestia.runtime.v7.js?v=v94-runtime-health-truth-v116-20260809"': f'src="/gestia-core/gestia.runtime.v7.js?v={RELEASE}"',
}
for old, new in replacements.items():
    found = html.count(old)
    if found != 1:
        raise SystemExit(f"V119_SHELL_TOKEN_COUNT_{found}:{old}")
    html = html.replace(old, new, 1)

html_path.write_text(html, encoding="utf-8")
print("V119_CURRENT_TURN_FRESHNESS_PATCH_APPLIED")