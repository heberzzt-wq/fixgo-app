from pathlib import Path
import re

RELEASE = "v139-transient-resilience-20260813"


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"V139_ANCHOR_MISMATCH:{path}:{count}:{old[:120]}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def regex_once(path, pattern, replacement):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"V139_REGEX_ANCHOR_MISMATCH:{path}:{count}:{pattern}")
    p.write_text(updated, encoding="utf-8")


# Cache chain: force the browser to load the resilience bytes after Hosting is eventually authorized.
regex_once(
    "gestia-terminal.html",
    r"/gestia-core/gestia-core\.js\?v=[A-Za-z0-9._-]+",
    f"/gestia-core/gestia-core.js?v={RELEASE}",
)
regex_once(
    "gestia-core/gestia-core.js",
    r"/gestia-core/jarvis/jarvis\.mission\.orchestrator\.js\?v=[A-Za-z0-9._-]+",
    f"/gestia-core/jarvis/jarvis.mission.orchestrator.js?v={RELEASE}",
)
regex_once(
    "gestia-core/gestia-core.js",
    r"/gestia-core/tools\.runtime\.js\?v=[A-Za-z0-9._-]+",
    f"/gestia-core/tools.runtime.js?v={RELEASE}",
)
regex_once(
    "gestia-core/gestia-core.js",
    r"/gestia-core/tools\.bridge\.js\?v=[A-Za-z0-9._-]+",
    f"/gestia-core/tools.bridge.js?v={RELEASE}",
)
regex_once(
    "gestia-core/tools.runtime.js",
    r"\./jarvis/jarvis\.multitool\.pack\.js\?v=[A-Za-z0-9._-]+",
    f"./jarvis/jarvis.multitool.pack.js?v={RELEASE}",
)

core = Path("gestia-core/gestia-core.js")
text = core.read_text(encoding="utf-8")

planner_retry_helper = '''    const buildMissionToolCallsWithTransientRetry =\n        async (plannerInstruction, plannerOptions) => {\n            let lastPlannerError = null;\n            for (let attempt = 1; attempt <= 3; attempt += 1) {\n                try {\n                    return await buildJarvisMultifunctionToolCalls(\n                        plannerInstruction,\n                        plannerOptions\n                    );\n                }\n                catch (error) {\n                    lastPlannerError = error;\n                    if (attempt >= 3) throw error;\n                    console.warn(\n                        "[MISSION_SEMANTIC_PLANNER_TRANSIENT_RETRY]",\n                        attempt,\n                        error?.message || "SEMANTIC_PLANNER_UNAVAILABLE"\n                    );\n                    await new Promise(resolve =>\n                        setTimeout(resolve, 500 * attempt)\n                    );\n                }\n            }\n            throw lastPlannerError || new Error("SEMANTIC_PLANNER_UNAVAILABLE");\n        };\n\n'''
anchor = "    const missionResult =\n        await runJarvisMission({"
if text.count(anchor) != 1:
    raise SystemExit(f"V139_MISSION_RESULT_ANCHOR:{text.count(anchor)}")
text = text.replace(anchor, planner_retry_helper + anchor, 1)

old = '''                            const completionAuditToolCalls =\n                                await buildJarvisMultifunctionToolCalls(\n                                    originalInstruction.slice(0, 120000),'''
new = '''                            const completionAuditToolCalls =\n                                await buildMissionToolCallsWithTransientRetry(\n                                    originalInstruction.slice(0, 120000),'''
if text.count(old) != 1:
    raise SystemExit(f"V139_COMPLETION_AUDIT_ANCHOR:{text.count(old)}")
text = text.replace(old, new, 1)

old = '''                    const nextToolCalls =\n                        await buildJarvisMultifunctionToolCalls(\n                            originalInstruction.slice(0, 120000),'''
new = '''                    const nextToolCalls =\n                        await buildMissionToolCallsWithTransientRetry(\n                            originalInstruction.slice(0, 120000),'''
if text.count(old) != 1:
    raise SystemExit(f"V139_NEXT_TOOL_ANCHOR:{text.count(old)}")
text = text.replace(old, new, 1)

old = '''            maximumRetries:\n                1,'''
new = '''            maximumRetries:\n                2,'''
if text.count(old) != 1:
    raise SystemExit(f"V139_MAX_RETRIES_ANCHOR:{text.count(old)}")
text = text.replace(old, new, 1)

old = '''                    const results = await window.ToolsBridge.executeMany(\n                        [\n                            executionCall\n                        ],\n                        {\n                            ...context,\n                            ...missionContext,\n                            tenantId,\n                            analysisId,\n                            rol,\n                            authorityId:\n                                verifiedAuthorityId,\n                            learningHints:\n                                agentLearningHints,\n                            reasoning:\n                                propuesta.cognition ||\n                                propuesta.reasoning ||\n                                null,\n                            approved:\n                                false\n                        }\n                    );\n                    const result =\n                        results[0] ||'''
new = '''                    const executeMissionToolOnce =\n                        async () =>\n                            window.ToolsBridge.executeMany(\n                                [\n                                    executionCall\n                                ],\n                                {\n                                    ...context,\n                                    ...missionContext,\n                                    tenantId,\n                                    analysisId,\n                                    rol,\n                                    authorityId:\n                                        verifiedAuthorityId,\n                                    learningHints:\n                                        agentLearningHints,\n                                    reasoning:\n                                        propuesta.cognition ||\n                                        propuesta.reasoning ||\n                                        null,\n                                    approved:\n                                        false\n                                }\n                            );\n                    let results =\n                        await executeMissionToolOnce();\n\n                    if (call?.name === "web.media.collect") {\n                        for (let attempt = 1; attempt <= 2; attempt += 1) {\n                            const mediaResult = results?.[0] || {};\n                            const browserFallback =\n                                mediaResult?.browserFallback ||\n                                mediaResult?.evidence?.browserFallback ||\n                                mediaResult?.result?.browserFallback ||\n                                null;\n                            const browserStatus =\n                                String(browserFallback?.status || "");\n                            const transientMediaFailure =\n                                mediaResult?.objectiveSatisfied !== true &&\n                                browserFallback?.attempted === true &&\n                                [\n                                    "BROWSER_NETWORK_MEDIA_FAILED",\n                                    "BROWSER_NETWORK_MEDIA_EMPTY"\n                                ].includes(browserStatus);\n                            if (!transientMediaFailure) break;\n                            console.warn(\n                                "[WEB_MEDIA_TRANSIENT_RETRY]",\n                                attempt,\n                                browserStatus\n                            );\n                            await new Promise(resolve =>\n                                setTimeout(resolve, 500 * attempt)\n                            );\n                            results =\n                                await executeMissionToolOnce();\n                        }\n                    }\n\n                    const result =\n                        results[0] ||'''
if text.count(old) != 1:
    raise SystemExit(f"V139_EXECUTE_ANCHOR:{text.count(old)}")
text = text.replace(old, new, 1)
core.write_text(text, encoding="utf-8")

# Keep the existing workflow's exact five-file patch surface while upgrading its assertions.
media_test = Path("tests/jarvis-reel-media-source-recovery-v136.test.mjs")
media_text = media_test.read_text(encoding="utf-8")
marker = f"// V139_TRANSIENT_RESILIENCE_CACHE={RELEASE}\n"
if marker not in media_text:
    media_test.write_text(media_text.rstrip() + "\n" + marker, encoding="utf-8")

Path("tests/jarvis-reel-live-cache-v139.test.mjs").write_text(
    f'''import test from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\n\nconst terminal = fs.readFileSync("gestia-terminal.html", "utf8");\nconst core = fs.readFileSync("gestia-core/gestia-core.js", "utf8");\nconst runtime = fs.readFileSync("gestia-core/tools.runtime.js", "utf8");\nconst RELEASE = "{RELEASE}";\n\ntest("v139 browser cache chain points to transient-resilience bytes", () => {{\n  assert.match(terminal, new RegExp(`/gestia-core/gestia-core\\\\.js\\\\?v=${{RELEASE}}`));\n  assert.match(core, new RegExp(`/gestia-core/jarvis/jarvis\\\\.mission\\\\.orchestrator\\\\.js\\\\?v=${{RELEASE}}`));\n  assert.match(core, new RegExp(`/gestia-core/tools\\\\.runtime\\\\.js\\\\?v=${{RELEASE}}`));\n  assert.match(runtime, new RegExp(`jarvis/jarvis\\\\.multitool\\\\.pack\\\\.js\\\\?v=${{RELEASE}}`));\n}});\n\ntest("v139 retries transient semantic planner failures without introducing a lexical brain", () => {{\n  assert.match(core, /buildMissionToolCallsWithTransientRetry/);\n  assert.match(core, /MISSION_SEMANTIC_PLANNER_TRANSIENT_RETRY/);\n  assert.match(core, /attempt <= 3/);\n  assert.doesNotMatch(core, /TRANSIENT_LEXICAL_ROUTER/);\n}});\n\ntest("v139 retries only verified transient browser-media transport failures", () => {{\n  assert.match(core, /WEB_MEDIA_TRANSIENT_RETRY/);\n  assert.match(core, /BROWSER_NETWORK_MEDIA_FAILED/);\n  assert.match(core, /BROWSER_NETWORK_MEDIA_EMPTY/);\n  assert.match(core, /browserFallback\\?\\.attempted === true/);\n  assert.match(core, /mediaResult\\?\\.objectiveSatisfied !== true/);\n}});\n''',
    encoding="utf-8",
)

print("V139_TRANSIENT_RESILIENCE_PATCH_APPLIED=true")
