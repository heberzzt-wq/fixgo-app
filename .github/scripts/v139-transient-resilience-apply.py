from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


orchestrator = "gestia-core/jarvis/jarvis.mission.orchestrator.js"
replace_once(
    orchestrator,
    'const VERSION =\n    "1.15.0-reel-speech-dependency-v137";',
    'const VERSION =\n    "1.16.0-transient-resilience-v139";'
)
replace_once(
    orchestrator,
    '''            } catch (error) {\n                mission.reason = "PLANNER_UNAVAILABLE";\n                mission.errors.push({\n                    tool: "semantic.planner",\n                    status: text(error?.message || "PLANNER_UNAVAILABLE", 500),\n                    retryable: true,\n                    at: now()\n                });\n                break;\n            }\n            const additions = trustedCalls(plan?.toolCalls || plan || [], mission);''',
    '''            } catch (error) {\n                const plannerFailureStreak =\n                    Math.max(0, Number(mission.plannerFailureStreak || 0)) + 1;\n                mission.plannerFailureStreak = plannerFailureStreak;\n                const retryablePlannerFailure =\n                    plannerFailureStreak <= maximumRetries;\n                mission.errors.push({\n                    tool: "semantic.planner",\n                    status: text(error?.message || "PLANNER_UNAVAILABLE", 500),\n                    retryable: retryablePlannerFailure,\n                    at: now()\n                });\n                mission.updatedAt = now();\n                saveMission(persistence, mission);\n                if (retryablePlannerFailure) {\n                    await new Promise(resolve =>\n                        setTimeout(resolve, Math.min(2500, 500 * plannerFailureStreak))\n                    );\n                    continue;\n                }\n                mission.reason = "PLANNER_UNAVAILABLE";\n                break;\n            }\n            mission.plannerFailureStreak = 0;\n            const additions = trustedCalls(plan?.toolCalls || plan || [], mission);'''
)
replace_once(
    orchestrator,
    '''        if (observation.objectiveSatisfied) {\n            if (task.name === "web.media.collect") {\n                archiveRecoveredMediaSourceAttempts(mission, now);\n            }\n            mission.completedTasks.push(record);\n        } else if (observation.blocked) {''',
    '''        if (observation.objectiveSatisfied) {\n            if (task.name === "web.media.collect") {\n                archiveRecoveredMediaSourceAttempts(mission, now);\n            }\n            mission.completedTasks.push(record);\n        } else if (\n            observation.retryable &&\n            !observation.requiresInput &&\n            !observation.requiresApproval &&\n            task.attempts <= maximumRetries\n        ) {\n            mission.pendingTasks.push({\n                ...task,\n                status: "RETRY_PENDING"\n            });\n            mission.errors.push({\n                tool: task.name,\n                status: observation.status,\n                retryable: true,\n                at: now()\n            });\n        } else if (observation.blocked) {'''
)
replace_once(
    orchestrator,
    '''        } else if (\n            observation.retryable &&\n            task.attempts <= maximumRetries\n        ) {\n            mission.pendingTasks.push({\n                ...task,\n                status: "RETRY_PENDING"\n            });\n            mission.errors.push({\n                tool: task.name,\n                status: observation.status,\n                retryable: true,\n                at: now()\n            });\n        } else {''',
    '''        } else {'''
)

nexo = "gestia-core/nexo/nexo.real-media.tools.js"
replace_once(
    nexo,
    '    "1.7.0-local-speech-v137";',
    '    "1.8.0-transient-media-resilience-v139";'
)
replace_once(
    nexo,
    '''                    requirementsMet: browserResult?.requirementsMet === true,\n                    candidateCount: Number(browserResult?.browserNetwork?.candidateCount || 0)\n                };''',
    '''                    requirementsMet: browserResult?.requirementsMet === true,\n                    candidateCount: Number(browserResult?.browserNetwork?.candidateCount || 0),\n                    error: String(browserResult?.error || "").slice(0, 1000) || null\n                };'''
)
replace_once(
    nexo,
    '''            return {\n                ...result,\n                ...(browserFallback ? { browserFallback } : {}),\n                objectiveSatisfied: result?.ok === true && result?.requirementsMet === true,\n                blocked: result?.ok !== true || result?.requirementsMet !== true,\n                requiresInput: false,\n                retryable: result?.status === "LOCAL_BRIDGE_REQUIRED"\n            };''',
    '''            const transientBrowserFallback =\n                browserFallback?.attempted === true &&\n                browserFallback?.requirementsMet !== true &&\n                [\n                    "BROWSER_NETWORK_MEDIA_FAILED",\n                    "BROWSER_NETWORK_MEDIA_EMPTY"\n                ].includes(browserFallback?.status);\n            return {\n                ...result,\n                ...(browserFallback ? { browserFallback } : {}),\n                objectiveSatisfied: result?.ok === true && result?.requirementsMet === true,\n                blocked: result?.ok !== true || result?.requirementsMet !== true,\n                requiresInput: false,\n                retryable:\n                    result?.status === "LOCAL_BRIDGE_REQUIRED" ||\n                    transientBrowserFallback\n            };'''
)

core = "gestia-core/gestia-core.js"
replace_once(
    core,
    "import {\n    runJarvisMission\n} from '/gestia-core/jarvis/jarvis.mission.orchestrator.js?v=v137-local-speech-synthesis-20260812';",
    "import {\n    runJarvisMission\n} from '/gestia-core/jarvis/jarvis.mission.orchestrator.js?v=v139-transient-resilience-20260813';"
)
replace_once(
    core,
    '''            maximumRetries:\n                1,''',
    '''            maximumRetries:\n                2,'''
)

test_path = Path("tests/jarvis-transient-resilience-v139.test.mjs")
test_path.write_text('''import test from "node:test";\nimport assert from "node:assert/strict";\nimport { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";\nimport fs from "node:fs";\n\nfunction storage() {\n    const values = new Map();\n    return {\n        getItem: key => values.has(key) ? values.get(key) : null,\n        setItem: (key, value) => values.set(key, String(value))\n    };\n}\n\ntest("planner transient failure is retried instead of terminating immediately", async () => {\n    let plannerCalls = 0;\n    const result = await runJarvisMission({\n        instruction: "continua la produccion",\n        initialToolCalls: [{ name: "document.create", args: { format: "pdf" } }],\n        requiredToolNames: ["document.create"],\n        storage: storage(),\n        maximumRetries: 2,\n        planner: async () => {\n            plannerCalls += 1;\n            if (plannerCalls === 1) throw new Error("429 Too Many Requests");\n            return { toolCalls: [], missionComplete: true };\n        },\n        execute: async () => ({\n            ok: true, executionOk: true, objectiveSatisfied: true,\n            status: "DOCUMENT_CREATED", output: ".jarvis-artifacts/document.pdf"\n        })\n    });\n    assert.equal(plannerCalls, 2);\n    assert.equal(result.status, "COMPLETED");\n    assert.equal(result.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");\n    assert.equal(result.errors.some(item => item.tool === "semantic.planner" && item.retryable === true), true);\n});\n\ntest("blocked transient tool result is retried before terminal blocking", async () => {\n    let executions = 0;\n    const result = await runJarvisMission({\n        instruction: "recupera medio real",\n        initialToolCalls: [{ name: "web.media.collect", args: { url: "https://example.com/video" } }],\n        requiredToolNames: ["web.media.collect"],\n        storage: storage(),\n        maximumRetries: 2,\n        planner: async () => ({ toolCalls: [], missionComplete: true }),\n        execute: async () => {\n            executions += 1;\n            if (executions === 1) return {\n                ok: false, executionOk: true, objectiveSatisfied: false,\n                blocked: true, retryable: true, requiresInput: false, requiresApproval: false,\n                status: "BROWSER_NETWORK_MEDIA_FAILED"\n            };\n            return {\n                ok: true, executionOk: true, objectiveSatisfied: true,\n                blocked: false, retryable: false, status: "WEB_REAL_MEDIA_COLLECTED"\n            };\n        }\n    });\n    assert.equal(executions, 2);\n    assert.equal(result.status, "COMPLETED");\n    assert.equal(result.completedTasks.some(item => item.name === "web.media.collect"), true);\n    assert.equal(result.blockedTasks.some(item => item.name === "web.media.collect"), false);\n});\n\ntest("input blockers are never auto-retried even when marked retryable", async () => {\n    let executions = 0;\n    const result = await runJarvisMission({\n        instruction: "necesita dato humano",\n        initialToolCalls: [{ name: "document.create", args: {} }],\n        requiredToolNames: ["document.create"],\n        storage: storage(),\n        maximumRetries: 2,\n        planner: async () => ({ toolCalls: [], missionComplete: false }),\n        execute: async () => {\n            executions += 1;\n            return {\n                ok: false, executionOk: true, objectiveSatisfied: false, blocked: true,\n                retryable: true, requiresInput: true, status: "DOCUMENT_INPUT_REQUIRED"\n            };\n        }\n    });\n    assert.equal(executions, 1);\n    assert.equal(result.reason, "MISSION_INPUT_REQUIRED");\n});\n\ntest("real-media transient fallback preserves strict evidence completion", () => {\n    const source = fs.readFileSync(new URL("../gestia-core/nexo/nexo.real-media.tools.js", import.meta.url), "utf8");\n    assert.match(source, /BROWSER_NETWORK_MEDIA_FAILED/);\n    assert.match(source, /BROWSER_NETWORK_MEDIA_EMPTY/);\n    assert.match(source, /transientBrowserFallback/);\n    assert.match(source, /objectiveSatisfied: result\\?\\.ok === true && result\\?\\.requirementsMet === true/);\n    assert.match(source, /error: String\\(browserResult\\?\\.error/);\n});\n''', encoding="utf-8")
