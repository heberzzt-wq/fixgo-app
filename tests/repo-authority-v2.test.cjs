"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const repoWriteAuthFactory = require("../functions/repo-write-auth");
const {
    describeRepoSyntaxValidator,
    validateRepoWriteSyntax
} = require("../functions/repo-syntax-validator");

const {
    normalizeSemanticToolPlan
} = require("../functions/repo-semantic-tool-planner");

function stripBrowserImports(source) {
    const lines =
        source.split(/\r?\n/);

    const kept =
        [];

    let skippingImport =
        false;

    for (const line of lines) {
        const trimmed =
            line.trim();

        if (skippingImport) {
            if (trimmed.endsWith(";")) {
                skippingImport =
                    false;
            }

            continue;
        }

        if (trimmed.startsWith("import ")) {
            if (!trimmed.endsWith(";")) {
                skippingImport =
                    true;
            }

            continue;
        }

        kept.push(line);
    }

    return kept.join("\n");
}

function loadGestiaCoreAgentLoopHelpers(options = {}) {
    const sourcePath =
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "gestia-core.js"
        );

    const source =
        stripBrowserImports(
            fs.readFileSync(sourcePath, "utf8")
        )
            .replace(
                "export const GestiaCore =",
                "const GestiaCore ="
            );

    const sandbox = {
        module: {
            exports: {}
        },
        exports: {},
        window: {
            dispatchEvent() {},
            JarvisAutonomyEngine:
                options.autonomyEngine || null
        },
        CustomEvent: function CustomEvent(type, init) {
            return {
                type,
                detail:
                    init?.detail || null
            };
        },
        console: {
            info() {},
            warn() {},
            error() {},
            log() {}
        },
        crypto: {
            randomUUID() {
                return "00000000-0000-4000-8000-000000000000";
            }
        }
    };

    vm.runInNewContext(
        `${source}
module.exports = {
    assessPrimaryCandidateConfidence,
    buildObservationDrivenFollowUpToolCalls,
    composeObservationDrivenFinalResponse,
    buildCompactLayoutReplacement,
    validatePatchPreviewRewrite,
    recallAgentLoopLearningHints,
    recordAgentLoopLearningIncident
};`,
        sandbox,
        {
            filename:
                sourcePath
        }
    );

    return sandbox.module.exports;
}

function makeAuthGate(decodedToken) {
    const admin = {
        auth() {
            return {
                async verifyIdToken() {
                    return decodedToken;
                }
            };
        }
    };

    const db = {
        collection() {
            return {
                doc() {
                    return {
                        async get() {
                            return {
                                exists: false,
                                data: () => ({})
                            };
                        }
                    };
                }
            };
        }
    };

    return repoWriteAuthFactory({
        admin,
        db
    });
}

test("repo write auth V2 describes private owner full repo policy", () => {
    const gate =
        makeAuthGate({
            uid: "u1",
            role: "owner"
        });

    const description =
        gate.describeRepoWriteAuthorityGate();

    assert.equal(description.ok, true);
    assert.equal(description.version, "2.0.0-private-owner-gate");
    assert.equal(description.policy.authority, "full_repo_private_owner");
    assert.equal(description.policy.safeZone, "advisory");
    assert.ok(description.policy.allowedRoles.includes("owner"));
});

test("repo write auth V2 blocks missing bearer token with contract metadata", async () => {
    const gate =
        makeAuthGate({
            uid: "u1",
            role: "owner"
        });

    const result =
        await gate.authorizeRepoWriteRequest({
            headers: {}
        });

    assert.equal(result.ok, false);
    assert.equal(result.authorized, false);
    assert.equal(result.httpStatus, 401);
    assert.equal(result.version, "2.0.0-private-owner-gate");
    assert.equal(result.policy.failureMode, "closed");
});

test("repo write auth V2 allows owner role", async () => {
    const gate =
        makeAuthGate({
            uid: "owner-uid",
            role: "owner",
            email: "owner@example.test"
        });

    const result =
        await gate.authorizeRepoWriteRequest({
            headers: {
                authorization: "Bearer valid"
            }
        });

    assert.equal(result.ok, true);
    assert.equal(result.authorized, true);
    assert.equal(result.role, "owner");
    assert.equal(result.version, "2.0.0-private-owner-gate");
});

test("repo syntax validator V2 validates JS and blocks empty content", () => {
    const description =
        describeRepoSyntaxValidator();

    assert.equal(description.ok, true);
    assert.equal(description.validatorVersion, "2.0.0-server-repo-write");
    assert.equal(description.policy.executesReceivedCode, false);

    const valid =
        validateRepoWriteSyntax({
            file: "gestia-core/example.js",
            content: "export const ok = true;\n"
        });

    assert.equal(valid.ok, true);
    assert.equal(valid.validatorVersion, "2.0.0-server-repo-write");
    assert.equal(valid.sourceType, "module");

    const empty =
        validateRepoWriteSyntax({
            file: "gestia-core/empty.js",
            content: "   "
        });

    assert.equal(empty.ok, false);
    assert.equal(empty.reason, "EMPTY_CONTENT_BLOCKED");

    const skipped =
        validateRepoWriteSyntax({
            file: "index.html",
            content: "<main></main>"
        });

    assert.equal(skipped.ok, true);
    assert.equal(skipped.status, "skipped");
});

test("semantic tool planner keeps repo plans read-only and filters unsafe tools", () => {
    const plan =
        normalizeSemanticToolPlan(
            {
                intent: "REPO_INVESTIGATION",
                objective: "Find terminal render path",
                confidence: 0.91,
                toolCalls: [
                    {
                        name: "repo.grep",
                        args: {
                            term: "render terminal",
                            maxMatches: 80,
                            nested: {
                                drop: true
                            }
                        }
                    },
                    {
                        name: "repo.write",
                        args: {
                            file: "gestia-terminal.html",
                            content: "bad"
                        }
                    },
                    {
                        name: "tests.run",
                        args: {
                            command: "ci:test"
                        }
                    },
                    {
                        name: "repo.read",
                        args: {
                            file: "gestia-terminal.html",
                            maxBytes: 300000
                        }
                    }
                ]
            },
            {
                fallbackObjective: "fallback"
            }
        );

    assert.equal(plan.intent, "REPO_INVESTIGATION");
    assert.equal(plan.writeAllowed, false);
    assert.equal(plan.requiresApprovalForWrite, true);
    assert.deepEqual(
        plan.toolCalls.map(call => call.name),
        [
            "repo.grep",
            "repo.read"
        ]
    );
    assert.equal(plan.toolCalls[0].mutates, false);
    assert.equal(plan.toolCalls[0].approved, false);
    assert.equal(plan.toolCalls[0].args.term, "render terminal");
    assert.equal(plan.toolCalls[0].args.nested, undefined);
});

test("semantic tool planner replaces audit-only plans with focused discovery", () => {
    const plan =
        normalizeSemanticToolPlan(
            {
                intent: "REPO_INVESTIGATION",
                objective: "Jarvis, las tarjetas ocupan mucho espacio en movil, revisa donde esta el problema sin modificar nada.",
                confidence: 0.88,
                toolCalls: [
                    {
                        name: "repo.audit",
                        args: {}
                    }
                ]
            },
            {
                fallbackObjective: "fallback",
                maxToolCalls: 4
            }
        );

    assert.equal(plan.intent, "REPO_INVESTIGATION");
    assert.equal(plan.writeAllowed, false);
    assert.equal(plan.requiresApprovalForWrite, true);
    assert.equal(
        plan.toolCalls.some(call => call.name === "repo.audit"),
        false
    );
    assert.deepEqual(
        plan.toolCalls.map(call => call.name).slice(0, 2),
        [
            "repo.search",
            "repo.grep"
        ]
    );
    assert.equal(plan.toolCalls[0].args.term, "tarjetas");
    assert.equal(plan.toolCalls[1].args.term, "tarjetas");
    assert.equal(plan.toolCalls[0].mutates, false);
    assert.equal(plan.toolCalls[0].approved, false);
});

test("semantic tool planner replaces scan-only plans with focused discovery", () => {
    const plan =
        normalizeSemanticToolPlan(
            {
                intent: "REPO_INVESTIGATION",
                objective: "Checa que parte del repo toca el render del terminal",
                toolCalls: [
                    {
                        name: "repo.scan",
                        args: {}
                    }
                ]
            },
            {
                fallbackObjective: "fallback",
                maxToolCalls: 3
            }
        );

    assert.deepEqual(
        plan.toolCalls.map(call => call.name),
        [
            "repo.search",
            "repo.grep",
            "repo.grep"
        ]
    );
    assert.equal(plan.toolCalls[0].args.term, "render");
    assert.equal(plan.toolCalls[1].args.term, "render");
});

test("semantic tool planner falls back to general response without tool calls", () => {
    const plan =
        normalizeSemanticToolPlan(
            {
                objective: "",
                toolCalls: [
                    {
                        name: "repo.write",
                        args: {
                            file: "x.js"
                        }
                    }
                ]
            },
            {
                fallbackObjective: "hello"
            }
        );

    assert.equal(plan.intent, "GENERAL_RESPONSE");
    assert.equal(plan.objective, "hello");
    assert.deepEqual(plan.toolCalls, []);
    assert.equal(plan.writeAllowed, false);
    assert.equal(plan.requiresApprovalForWrite, true);
});

test("agent loop follow-up focuses a strong product UI primary candidate", () => {
    const helpers =
        loadGestiaCoreAgentLoopHelpers();

    const objective =
        "Jarvis, las tarjetas ocupan mucho espacio en movil, revisa donde esta el problema sin modificar nada.";

    const followUpPlan =
        helpers.buildObservationDrivenFollowUpToolCalls({
            rawInput:
                objective,
            toolCalls: [
                {
                    name:
                        "repo.grep",
                    args: {
                        term:
                            "tarjetas"
                    }
                }
            ],
            observations: [
                {
                    meta: {
                        tool:
                            "repo.grep"
                    },
                    response: {
                        data: {
                            tool:
                                "repo.grep",
                            term:
                                "tarjetas",
                            matches: [
                                {
                                    file:
                                        "app-bi.js",
                                    line:
                                        188,
                                    snippet:
                                        '<p class="text-[10px] text-zinc-500 font-bold mt-1">Tarjetas y Retenciones</p>'
                                },
                                {
                                    file:
                                        "app-tecnico-b2b.js",
                                    line:
                                        1054,
                                    snippet:
                                        "RENDER TARJETAS TAREAS (V5.32 - B2B TENANT UPGRADE)"
                                },
                                {
                                    file:
                                        "app-tecnico-b2b.js",
                                    line:
                                        1093,
                                    snippet:
                                        "// 3. GENERACION DINAMICA DE TARJETAS"
                                },
                                {
                                    file:
                                        "cliente.html",
                                    line:
                                        29,
                                    snippet:
                                        "/* NUEVO: ESTILOS PARA TARJETAS EXPANSIBLES */"
                                }
                            ]
                        }
                    }
                },
                {
                    meta: {
                        tool:
                            "repo.grep"
                    },
                    response: {
                        data: {
                            tool:
                                "repo.grep",
                            term:
                                "espacio",
                            matches: [
                                {
                                    file:
                                        "app-tecnico-b2b.js",
                                    line:
                                        713,
                                    snippet:
                                        "Garantizamos match con el despacho del Admin y sin espacios"
                                },
                                {
                                    file:
                                        "functions/index.js",
                                    line:
                                        1859,
                                    snippet:
                                        "Gestion de espacios comunes con prevencion de traslapes"
                                }
                            ]
                        }
                    }
                }
            ]
        });

    assert.equal(followUpPlan.candidates[0].file, "app-tecnico-b2b.js");
    assert.equal(followUpPlan.primaryConfidence.mode, "PRIMARY_CONFIDENT");
    assert.deepEqual(
        Array.from(
            followUpPlan.followUpCandidates,
            candidate => candidate.file
        ),
        [
            "app-tecnico-b2b.js"
        ]
    );
    assert.deepEqual(
        Array.from(
            followUpPlan.followUpToolCalls,
            call => `${call.name}:${call.args.file}`
        ),
        [
            "repo.read:app-tecnico-b2b.js",
            "repo.diagnose:app-tecnico-b2b.js",
            "repo.impact:app-tecnico-b2b.js"
        ]
    );
});

test("agent loop learning hints are advisory and do not authorize writes", () => {
    const events =
        [];

    const helpers =
        loadGestiaCoreAgentLoopHelpers({
            autonomyEngine: {
                recall() {
                    return {
                        ok:
                            true,
                        total:
                            1,
                        lessons: [
                            {
                                category:
                                    "candidate_ranking",
                                reason:
                                    "PRIMARY_CONFIDENT_PRODUCT_UI_EVIDENCE",
                                lesson: {
                                    diagnosis:
                                        "candidate_ranking_product_ui",
                                    avoid:
                                        "No promover archivos meta como UI real."
                                }
                            }
                        ]
                    };
                },
                record(event) {
                    events.push(event);
                    return {
                        ok:
                            true,
                        learned:
                            true
                    };
                }
            }
        });

    const hints =
        helpers.recallAgentLoopLearningHints({
            rawInput:
                "Jarvis revisa un problema visual sin modificar nada",
            category:
                "CANDIDATE_RANKING",
            stage:
                "agent_loop_preplan",
            operation:
                "REPO_INVESTIGATION"
        });

    assert.equal(hints.ok, true);
    assert.equal(hints.proposalAutonomy, true);
    assert.equal(hints.writeAllowed, false);
    assert.equal(hints.writeAuthorization, false);
    assert.equal(hints.approvalRequiredForWrite, true);
    assert.equal(hints.lessons.length, 1);

    const recorded =
        helpers.recordAgentLoopLearningIncident({
            category:
                "PATCH_PREVIEW_SAFETY",
            status:
                "success",
            stage:
                "agent_loop_patch_preview",
            operation:
                "PATCH_PREVIEW_PROPOSAL",
            file:
                "app-tecnico-b2b.js",
            reason:
                "EXACT_BLOCK_PATCH_PREVIEW_CANDIDATE"
        });

    assert.equal(recorded.ok, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].context.learningPolicy.writeAllowed, false);
    assert.equal(events[0].context.learningPolicy.writeAuthorization, false);
    assert.equal(events[0].context.learningPolicy.approvalRequiredForWrite, true);
});

test("agent loop extracts exact patchPreview candidate from anchored read", () => {
    const helpers =
        loadGestiaCoreAgentLoopHelpers();

    const candidate =
        {
            file:
                "app-tecnico-b2b.js",
            score:
                300,
            productUiEvidenceHits:
                2,
            isInfrastructure:
                false,
            isTestFixture:
                false,
            evidence: [
                {
                    file:
                        "app-tecnico-b2b.js",
                    line:
                        1054,
                    snippet:
                        "RENDER TARJETAS TAREAS (V5.32 - B2B TENANT UPGRADE)",
                    productUiEvidence:
                        true,
                    uiEvidence:
                        true,
                    evidenceScore:
                        90,
                    directMatches:
                        1,
                    termDirect:
                        true
                },
                {
                    file:
                        "app-tecnico-b2b.js",
                    line:
                        1093,
                    snippet:
                        "// 3. GENERACION DINAMICA DE TARJETAS",
                    productUiEvidence:
                        true,
                    uiEvidence:
                        true,
                    evidenceScore:
                        90,
                    directMatches:
                        1,
                    termDirect:
                        true
                }
            ]
        };

    const secondary =
        {
            file:
                "app-bi.js",
            score:
                120,
            productUiEvidenceHits:
                1,
            isInfrastructure:
                false,
            isTestFixture:
                false,
            evidence: [
                {
                    file:
                        "app-bi.js",
                    line:
                        188,
                    snippet:
                        '<p class="text-[10px] text-zinc-500 font-bold mt-1">Tarjetas y Retenciones</p>',
                    productUiEvidence:
                        true,
                    uiEvidence:
                        true,
                    evidenceScore:
                        50
                }
            ]
        };

    const primaryConfidence =
        helpers.assessPrimaryCandidateConfidence([
            candidate,
            secondary
        ]);

    const finalResponse =
        helpers.composeObservationDrivenFinalResponse({
            objective:
                "Jarvis, las tarjetas ocupan mucho espacio en movil.",
            candidates: [
                candidate,
                secondary
            ],
            primaryConfidence,
            followUpObservations: [
                {
                    response: {
                        data: {
                            tool:
                                "repo.read",
                            file:
                                "app-tecnico-b2b.js",
                            partial:
                                true,
                            startLine:
                                1046,
                            endLine:
                                1134,
                            content:
                                [
                                    "/* RENDER TARJETAS TAREAS */",
                                    "function renderizarTareas(tareas) {",
                                    "    const div = document.createElement(\"div\");",
                                    "    div.className = `mb-1 px-2 py-1.5 rounded-lg w-full max-w-[680px] mx-auto border transition-all active:scale-95 flex justify-between items-center cursor-pointer ${borderClass}`;",
                                    "    div.innerHTML = `<div class=\"flex items-center gap-2\"></div>`;",
                                    "}"
                                ]
                                    .join("\n")
                        }
                    }
                },
                {
                    response: {
                        data: {
                            tool:
                                "repo.diagnose",
                            file:
                                "app-tecnico-b2b.js",
                            risk:
                                "HIGH",
                            recommendations: [
                                "Buscar cards sobredimensionadas revisando clases de padding, grid, flex, min-height y wrappers."
                            ]
                        }
                    }
                }
            ]
        });

    assert.equal(finalResponse.patchPreviewCandidate.file, "app-tecnico-b2b.js");
    assert.match(finalResponse.patchPreviewCandidate.search, /div\.className = `/);
    assert.match(finalResponse.patchPreviewCandidate.replace, /max-w-full sm:max-w-\[680px\]/);
    assert.match(finalResponse.patchPreviewCandidate.replace, /py-1/);
    assert.match(finalResponse.text, /PRIMARY_CONFIDENT/);
    assert.doesNotMatch(finalResponse.text, /<bloque exacto/);
    assert.doesNotMatch(finalResponse.text, /Tarjetas y Retenciones/);
});

test("agent loop does not invent patchPreview when exact block is missing", () => {
    const helpers =
        loadGestiaCoreAgentLoopHelpers();

    const candidate =
        {
            file:
                "app-tecnico-b2b.js",
            score:
                250,
            productUiEvidenceHits:
                1,
            isInfrastructure:
                false,
            isTestFixture:
                false,
            evidence: [
                {
                    file:
                        "app-tecnico-b2b.js",
                    line:
                        1093,
                    snippet:
                        "// 3. GENERACION DINAMICA DE TARJETAS",
                    productUiEvidence:
                        true,
                    uiEvidence:
                        true,
                    evidenceScore:
                        80
                }
            ]
        };

    const finalResponse =
        helpers.composeObservationDrivenFinalResponse({
            objective:
                "Jarvis, revisa tarjetas sin modificar nada.",
            candidates: [
                candidate
            ],
            primaryConfidence: {
                mode:
                    "PRIMARY_CONFIDENT",
                confident:
                    true
            },
            followUpObservations: [
                {
                    response: {
                        data: {
                            tool:
                                "repo.read",
                            file:
                                "app-tecnico-b2b.js",
                            partial:
                                true,
                            startLine:
                                1085,
                            endLine:
                                1173,
                            content:
                                "function renderizarTareas(tareas) {\n    return tareas.length;\n}"
                        }
                    }
                }
            ]
        });

    assert.equal(finalResponse.patchPreviewCandidate, null);
    assert.match(finalResponse.text, /No construyo patchPreview exacto todavia/);
    assert.doesNotMatch(finalResponse.text, /search="<bloque exacto/);
    assert.doesNotMatch(finalResponse.text, /replace="<layout compacto/);
});

test("agent loop patchPreview rewrite validator blocks malformed Tailwind classes", () => {
    const helpers =
        loadGestiaCoreAgentLoopHelpers();

    const invalid =
        helpers.validatePatchPreviewRewrite({
            search:
                "div.className = `py-2.5 active:scale-95 ${borderClass}`;",
            replace:
                "div.className = `py-1.5.5 active:scale-95.5 ${borderClass}`;"
        });

    assert.equal(invalid.ok, false);
    assert.ok(invalid.issues.includes("INVALID_TAILWIND_DECIMAL_CLASS"));
    assert.ok(invalid.issues.includes("INVALID_SCALE_CLASS"));

    const unbalanced =
        helpers.validatePatchPreviewRewrite({
            search:
                "div.className = `max-w-[680px] ${borderClass}`;",
            replace:
                "div.className = `max-w-[680px ${borderClass}`;"
        });

    assert.equal(unbalanced.ok, false);
    assert.ok(unbalanced.issues.includes("UNBALANCED_SQUARE_BRACKETS"));
});

test("agent loop compact replacement does not corrupt decimal Tailwind classes", () => {
    const helpers =
        loadGestiaCoreAgentLoopHelpers();

    const replacement =
        helpers.buildCompactLayoutReplacement(
            'class="flex py-2.5 px-2 rounded-lg active:scale-95 max-w-[680px]"'
        );

    assert.doesNotMatch(replacement, /py-1\.5\.5/);
    assert.match(replacement, /py-2\.5/);
    assert.match(replacement, /rounded-md/);
    assert.match(replacement, /active:scale-\[0\.98\]/);
    assert.match(replacement, /max-w-full sm:max-w-\[680px\]/);
});

test("terminal has natural patchPreview follow-up memory gate before core planner", () => {
    const terminal =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-terminal.html"
            ),
            "utf8"
        );

    const followUpIndex =
        terminal.indexOf("TERMINAL_LAST_PATCH_PREVIEW_FOLLOW_UP_41_34");

    const coreFirstIndex =
        terminal.indexOf("[TERMINAL_CORE_FIRST]");

    assert.ok(followUpIndex > 0);
    assert.ok(coreFirstIndex > followUpIndex);
    assert.match(terminal, /LAST_PATCH_PREVIEW_MEMORY_SAVED_41_34/);
    assert.match(terminal, /TERMINAL_LEARNING_RECORD_FAILED_41_35/);
    assert.match(terminal, /TERMINAL_BRAIN_ROUTER/);
    assert.match(terminal, /CASUAL_NOOP/);
    assert.match(terminal, /BRAIN_DELEGATED/);
    assert.match(terminal, /no_semantic_result_core_delegated/);
    assert.match(terminal, /naturalIntentAuthority:\s*"brain"/);
    assert.match(terminal, /writeAllowed:\s*false/);
    assert.match(terminal, /approvalRequiredForWrite:\s*true/);
    assert.match(terminal, /FOLLOW_UP_MEMORY/);
    assert.match(terminal, /No tengo una propuesta previa activa/);
    assert.match(terminal, /repo\.patchPreview/);
    assert.match(terminal, /approved:\s*false/);
    assert.match(terminal, /agent-loop-v7-20260707-4162/);
    assert.match(terminal, /jarvis-tools-v7-20260707-4158/);
    assert.doesNotMatch(terminal, /TERMINAL_IMMEDIATE_DIAGNOSIS_EXIT/);
    assert.doesNotMatch(terminal, /TERMINAL_SEMANTIC_DIAGNOSIS_BYPASS/);
    assert.doesNotMatch(
        terminal,
        /terminalBrainRoute\?\.mode\s*===\s*"TECHNICAL_DIAGNOSIS"[\s\S]{0,500}"repo\.audit"/
    );
    assert.doesNotMatch(terminal, /TERMINAL_GLOBAL_REPO_AUDIT_41_44/);
    assert.doesNotMatch(terminal, /isExactGlobalRepoAuditCommand/);
    assert.doesNotMatch(terminal, /new Set\(\[\s*"analiza repo"/);
    assert.doesNotMatch(terminal, /if\s*\(\s*signals\.looksCasual\s*\)/);
    assert.doesNotMatch(terminal, /casual_without_active_flow/);
    assert.doesNotMatch(terminal, /signals\.mentionsWrite/);
    assert.doesNotMatch(terminal, /signals\.mentionsRepo/);
    assert.doesNotMatch(terminal, /signals\.mentionsPatch/);
    assert.doesNotMatch(terminal, /signals\.mentionsAdjustment/);
    assert.doesNotMatch(terminal, /secondary_signals_only_core_delegated/);
    assert.match(terminal, /const isExplicitRepoAuditRequest =\s*false;/);
});

test("terminal renders visual patch proposal card without direct write execution", () => {
    const terminal =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-terminal.html"
            ),
            "utf8"
        );

    assert.match(terminal, /SIA7_VISUAL_PATCH_PROPOSAL/);
    assert.match(terminal, /filterSia7ProposalLearningHints/);
    assert.match(terminal, /sia7:activePatchProposal:v1/);
    assert.match(terminal, /__SIA7_ACTIVE_PATCH_PROPOSAL__/);
    assert.match(terminal, /readTerminalActivePatchProposal/);
    assert.match(terminal, /SIA7_ACTIVE_PATCH_PROPOSAL_MAX_AGE_MS/);
    assert.match(terminal, /SIA7_PROPOSAL_ADJUSTMENT_MAX_AGE_MS/);
    assert.match(terminal, /isFreshTerminalActivePatchProposal/);
    assert.match(terminal, /clearTerminalActivePatchProposal/);
    assert.match(terminal, /rememberTerminalProposalAdjustment/);
    assert.match(terminal, /__SIA7_PROPOSAL_ADJUSTMENT_IN_FLIGHT__/);
    assert.match(terminal, /!proposal\?\.search/);
    assert.match(terminal, /!proposal\?\.replace/);
    assert.match(terminal, /buildSia7ProposalAdjustmentInput/);
    assert.match(terminal, /buildSia7ProposalAdjustmentPromptPrefix/);
    assert.match(terminal, /isControlledSia7ProposalAdjustmentInput/);
    assert.match(terminal, /hasProposalAdjustmentRequest/);
    assert.match(terminal, /controlled_adjustment_prompt_from_visual_card/);
    assert.doesNotMatch(
        terminal,
        /if\s*\(\s*state\.hasActivePatchProposal\s*\)\s*\{[\s\S]{0,300}PROPOSAL_ADJUSTMENT/
    );
    assert.match(terminal, /proposalAdjustmentContext/);
    assert.match(terminal, /SIA7_PROPOSAL_ADJUSTMENT_CONTEXT_41_39/);
    assert.match(terminal, /Contexto SIA7 de propuesta activa/);
    assert.match(terminal, /rememberSia7ActivePatchProposal/);
    assert.match(terminal, /readSia7ActivePatchProposal/);
    assert.match(terminal, /isFreshSia7ActivePatchProposal/);
    assert.match(terminal, /clearSia7ActivePatchProposal/);
    assert.match(terminal, /readSia7ProposalAdjustmentInFlight/);
    assert.match(terminal, /Propuesta visual SIA7 ajustada/);
    assert.match(terminal, /Ajuste supervisado aplicado sobre la propuesta activa/);
    assert.match(terminal, /data-sia7-visual-patch-proposal="true"/);
    assert.match(terminal, /data-sia7-adjusted="\$\{adjustmentInFlight \? "true" : "false"\}"/);
    assert.match(terminal, /replacedExistingSia7Proposal/);
    assert.match(terminal, /previousProposal\.replaceWith\(cardElement\)/);
    assert.match(terminal, /seen\.has\(key\)/);
    assert.match(terminal, /diagnosis === "casual_input_noop"/);
    assert.match(terminal, /Propuesta visual SIA7/);
    assert.match(terminal, /dryRun \/ sin escritura/);
    assert.match(terminal, /Riesgo archivo/);
    assert.match(terminal, /Riesgo patch/);
    assert.match(terminal, /Aprendizaje usado/);
    assert.match(terminal, /Search exacto/);
    assert.match(terminal, /Replace candidato/);
    assert.match(terminal, /Comando de aprobación preparado, no ejecutado/);
    assert.match(terminal, /Comando patchPreview/);
    assert.match(terminal, /data-sia7-proposal-action="copy-patch-preview"/);
    assert.match(terminal, /data-sia7-proposal-action="cancel-proposal"/);
    assert.match(terminal, /data-sia7-proposal-action="adjust-proposal"/);
    assert.match(terminal, /data-sia7-proposal-action="prepare-safe-write-approval"/);
    assert.match(terminal, /Jarvis, ajusta la propuesta anterior para/);
    assert.match(terminal, /Puedes ajustar esta propuesta antes de aprobarla/);
    assert.match(terminal, /Propuesta cancelada, no se escribieron archivos/);
    assert.match(terminal, /localStorage\.removeItem\(\s*SIA7_ACTIVE_PATCH_PROPOSAL_STORAGE_KEY\s*\)/);
    assert.match(terminal, /No se ejecuto repo\.safePatchApply ni repo\.write/);
    assert.match(terminal, /repo\.write directo queda bloqueado por cadena de mando SIA7/);
    assert.match(terminal, /Ejecutando repo\.write dryRun/);
    assert.doesNotMatch(terminal, /terminal_direct_repo_write_interceptor_v7[\s\S]{0,500}approved:\s*[\s\S]{0,80}approved\\s\*\=\?\s\*true/);
    assert.match(terminal, /repo\.patchPreview/);
    assert.match(terminal, /dryRun=true/);
    assert.match(terminal, /Aprobar safe write/);
    assert.doesNotMatch(terminal, /Aprobar safe write[^<]*<\/button>\s*<script/i);
    assert.doesNotMatch(terminal, /SIA7_VISUAL_PATCH_PROPOSAL[\s\S]{0,3000}repo\.safePatchApply\s*\(/);
    assert.doesNotMatch(terminal, /SIA7_VISUAL_PATCH_PROPOSAL[\s\S]{0,3000}repo\.write\s*\(/);
    assert.match(terminal, /cloudToolPlan[\s\S]{0,120}patchPreviewAllowed\s*===\s*false/);
    assert.match(terminal, /cloudToolPlan[\s\S]{0,160}renderPatchPreview\s*===\s*false/);
    assert.match(terminal, /cloudToolPlan[\s\S]{0,180}intent\s*===\s*"REPO_GLOBAL_ANALYSIS"/);
    assert.match(terminal, /buildBrainGlobalRepoAnalysisSummary/);
    assert.match(terminal, /Diagnostico global SIA7 read-only/);
    assert.match(terminal, /Que se ve mal o delicado/);
    assert.match(terminal, /Archivos criticos a revisar primero/);
    assert.match(terminal, /suppressPatchSurface/);
    assert.match(terminal, /__SIA7_CLEAR_ACTIVE_PATCH_PROPOSAL__/);
    assert.match(terminal, /SIA7_PATCH_SURFACE_CLEARED_BY_BRAIN_PLAN_41_50/);
    assert.match(terminal, /SIA7_PATCH_SURFACE_CLEARED_BY_BLOCKED_PREVIEW_41_51/);
    assert.match(terminal, /patchPreviewBlocked/);
    assert.match(terminal, /patchPreviewCandidate\s*&&\s*!patchPreviewBlocked/);
    assert.match(terminal, /buildSia7BrainVoiceBriefing/);
    assert.match(terminal, /SIA7_BRAIN_VOICE_BRIEFING_41_60/);
    assert.match(terminal, /speaksScreenText:\s*false/);
    assert.match(terminal, /window\.hablarJarvis\(\s*brainVoiceBriefing\s*\)/);
    assert.match(terminal, /Deje una propuesta visual en modo vista previa/);
    assert.match(terminal, /Termine el analisis global del repositorio/);
    assert.match(terminal, /No escribi archivos/);
    assert.match(terminal, /SIA7_BLOCKED_VISUAL_PROPOSAL_RENDER_SUPPRESSED_41_52/);
    assert.match(terminal, /data-sia7-blocked-patch-proposal="true"/);
    assert.match(terminal, /querySelectorAll\("\[data-sia7-visual-patch-proposal='true'\]"\)/);
    assert.match(terminal, /__SIA7_PENDING_PATCH_APPROVAL__\s*=\s*null/);
});

test("terminal keeps natural repository analysis in the brain route", () => {
    const terminal =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-terminal.html"
            ),
            "utf8"
        );

    const routerIndex =
        terminal.indexOf("routeTerminalNaturalIntent");

    const coreCallIndex =
        terminal.indexOf("await window.GestiaCore.procesarIntencion");

    assert.ok(routerIndex > 0);
    assert.ok(coreCallIndex > routerIndex);
    assert.match(terminal, /GestiaCore\.analizarIntencionLigera/);
    assert.match(terminal, /BRAIN_DELEGATED/);
    assert.match(terminal, /Delegate freeform natural input to GestiaCore cognitive reasoning/);
    assert.doesNotMatch(terminal, /terminal_global_repo_audit_41_44/);
    assert.doesNotMatch(terminal, /isExactGlobalRepoAuditCommand/);
    assert.doesNotMatch(terminal, /ANÁLISIS GLOBAL DEL REPOSITORIO SIA7/);
    assert.doesNotMatch(terminal, /legacyRepoBypassEnabled[\s\S]{0,200}\(\?:analiza\|analizar\)/);
});

test("brain protects repo hub analysis from visual patch proposal drift", () => {
    const brain =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-core",
                "brain.engine.js"
            ),
            "utf8"
        );

    assert.match(brain, /import\s*\{[\s\S]*analyzeIntent[\s\S]*\}\s*from\s*"\.\/jarvis\/jarvis\.vision\.engine\.js\?v=repo-global-analysis-41-59"/);
    assert.match(brain, /resolveRepoHubVisionIntent/);
    assert.match(brain, /buildRepoHubGlobalAnalysisPlan/);
    assert.match(brain, /targetFile:\s*"repo\.hub"/);
    assert.match(brain, /intent:\s*"REPO_GLOBAL_ANALYSIS"/);
    assert.match(brain, /action:\s*"inspect_repo"/);
    assert.match(brain, /patchPreviewAllowed:\s*false/);
    assert.match(brain, /renderPatchPreview:\s*false/);
    assert.match(brain, /writeAllowed:\s*false/);
    assert.match(brain, /writeAuthorization:\s*false/);
    assert.match(brain, /repoHubGlobalPlan\s*\|\|\s*normalizeCloudToolPlan/);
    assert.match(brain, /if\s*\(!repoHubGlobalPlan\)\s*\{[\s\S]{0,180}invocarArquitectoIA/);
    assert.match(brain, /visionIntent:\s*repoHubVisionIntent/);
    assert.match(brain, /shouldUseLegacyRegexToolDetector/);
    assert.match(brain, /contexto\?\.naturalIntentAuthority\s*!==\s*"brain"/);
    assert.match(brain, /shouldUseLegacyRegexToolDetector[\s\S]{0,120}buildToolCallsFromInput/);
    assert.match(brain, /isNonRetryableCloudFetchError/);
    assert.match(brain, /CLOUD_COGNITION_FAIL_FAST/);
    assert.match(brain, /fallback:\s*"local_semantic_tool_planner"/);
    assert.match(brain, /breaker\.openUntil\s*=[\s\S]{0,120}BREAKER_COOLDOWN_MS/);

    const core =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-core",
                "gestia-core.js"
            ),
            "utf8"
    );

    assert.match(core, /patchPreviewAllowedByPlan/);
    assert.match(core, /brain\.engine\.js\?v=cloud-planner-fail-fast-41-62/);
    assert.doesNotMatch(core, /brain\.engine\.js\?v=repo-global-analysis-41-59/);
    assert.doesNotMatch(core, /semantic-tool-fallback-41-32/);
    assert.match(core, /jarvis-tools-v7-20260707-4158/);
    assert.doesNotMatch(core, /jarvis-tools-v7-20260707-4135/);
    assert.match(core, /reasoning:\s*reasoning/);
    assert.match(core, /atomicState\.agentResult\?\.reasoning/);
    assert.match(core, /propuesta\.agentLoop\s*=[\s\S]{0,160}reasoning:\s*[\s\S]{0,120}propuesta\.reasoning/);
    assert.match(core, /cloudToolPlan\?\.patchPreviewAllowed\s*!==\s*false/);
    assert.match(core, /cloudToolPlan\?\.renderPatchPreview\s*!==\s*false/);
    assert.match(core, /cloudToolPlan\?\.intent\s*!==\s*"REPO_GLOBAL_ANALYSIS"/);
    assert.match(core, /patchPreviewAllowed:\s*patchPreviewAllowedByPlan/);
    assert.match(core, /patchPreviewAllowed\s*=\s*true/);
    assert.match(core, /patchPreviewAllowed\s*\?\s*extractPatchPreviewCandidateFromRead/);
    assert.match(core, /PatchPreview deshabilitado por el plan cognitivo/);
});

test("gestiaArchitectV5 exposes CORS preflight before firewall", () => {
    const functionsIndex =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "functions",
                "index.js"
            ),
            "utf8"
        );

    const architectIndex =
        functionsIndex.indexOf("exports.gestiaArchitectV5");

    const initCoreIndex =
        functionsIndex.indexOf("initCore();", architectIndex);

    const firewallIndex =
        functionsIndex.indexOf("firewallV5(req)", architectIndex);

    const corsIndex =
        functionsIndex.indexOf("applyArchitectCorsHeaders(req, res)", architectIndex);

    const optionsIndex =
        functionsIndex.indexOf('req.method === "OPTIONS"', architectIndex);

    assert.ok(architectIndex > 0);
    assert.ok(corsIndex > architectIndex);
    assert.ok(optionsIndex > corsIndex);
    assert.ok(initCoreIndex > optionsIndex);
    assert.ok(firewallIndex > optionsIndex);
    assert.match(functionsIndex, /Access-Control-Allow-Origin/);
    assert.match(functionsIndex, /Authorization, Content-Type, X-Requested-With/);
    assert.match(functionsIndex, /Access-Control-Allow-Methods/);
});
