const MAX_EVIDENCE_ITEMS = 12;
const MAX_EVIDENCE_LENGTH = 24000;

export function isExplicitJsonResponseRequest(
    planOrCalls = null
) {
    if (Array.isArray(planOrCalls)) {
        if (
            String(
                planOrCalls.responseFormat ||
                ""
            ).trim().toLowerCase() === "json"
        ) {
            return true;
        }
        return planOrCalls.some(call =>
            String(
                call?.responseFormat ||
                call?.args?.responseFormat ||
                ""
            ).trim().toLowerCase() === "json"
        );
    }

    if (
        planOrCalls &&
        typeof planOrCalls === "object"
    ) {
        return String(
            planOrCalls.responseFormat ||
            ""
        ).trim().toLowerCase() === "json";
    }

    return false;
}

export function prepareEvidenceGroundedConversationPlan({
    instruction = "",
    toolCalls = [],
    toolCatalog = []
} = {}) {
    const explicitJson = isExplicitJsonResponseRequest(toolCalls);
    const operationalCalls = [];
    const seen = new Set();
    let conversationRequested = false;

    for (const call of Array.isArray(toolCalls) ? toolCalls : []) {
        if (!call?.name) continue;
        if (call.name === "conversation.respond") {
            conversationRequested = true;
            continue;
        }
        const signature = `${call.name}:${JSON.stringify(call.args || {})}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        operationalCalls.push(call);
    }

    const hasCapabilities =
        operationalCalls.some(call => call.name === "system.capabilities");
    const hasLimitationEvidence =
        operationalCalls.some(call =>
            call.name === "system.forensics" ||
            call.name === "system.health"
        );
    const forensicsAvailable =
        (Array.isArray(toolCatalog) ? toolCatalog : [])
            .some(tool => tool?.name === "system.forensics");

    if (
        hasCapabilities &&
        !explicitJson &&
        !hasLimitationEvidence &&
        forensicsAvailable
    ) {
        operationalCalls.push({
            name: "system.forensics",
            args: {},
            approved: false,
            reason: "CAPABILITY_LIMITATION_EVIDENCE_REQUIRED"
        });
    }

    return {
        explicitJson,
        conversationRequested,
        operationalCalls,
        requiresFinalConversation:
            operationalCalls.length > 0 &&
            !explicitJson
    };
}

export function mergeEvidenceGroundedToolCalls(...groups) {
    const merged = [];
    const seenSignatures = new Set();
    const singletonEvidenceTools = new Set([
        "system.capabilities",
        "system.forensics",
        "system.health",
        "media.analyze"
    ]);
    const seenSingletons = new Set();

    for (const call of groups.flat()) {
        if (!call?.name || call.name === "conversation.respond") continue;
        if (
            singletonEvidenceTools.has(call.name) &&
            seenSingletons.has(call.name)
        ) {
            continue;
        }
        const signature = `${call.name}:${JSON.stringify(call.args || {})}`;
        if (seenSignatures.has(signature)) continue;
        seenSignatures.add(signature);
        if (singletonEvidenceTools.has(call.name)) {
            seenSingletons.add(call.name);
        }
        merged.push(call);
    }

    return merged;
}

function boundedEvidenceValue(value, depth = 0) {
    if (depth > 5 || value == null) return value ?? null;
    if (typeof value === "string") return value.slice(0, 1600);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) {
        return value
            .slice(0, 30)
            .map(item => boundedEvidenceValue(item, depth + 1));
    }
    if (typeof value !== "object") return String(value).slice(0, 500);

    const allowed = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
        if (
            [
                "raw",
                "bytes",
                "base64",
                "blob",
                "html",
                "content",
                "numberedContent"
            ].includes(key)
        ) {
            continue;
        }
        allowed[key] = boundedEvidenceValue(item, depth + 1);
    }
    return allowed;
}


function compactEvidenceText(value = "", maximum = 800) {
    return String(value ?? "").slice(0, maximum);
}

function compactEvidenceTextArray(
    values = [],
    maximumItems = 8,
    maximumLength = 320
) {
    return (Array.isArray(values) ? values : [])
        .slice(0, maximumItems)
        .map(value =>
            compactEvidenceText(
                typeof value === "string"
                    ? value
                    : JSON.stringify(value),
                maximumLength
            )
        );
}

function compactMediaAnalysisPage(page = {}) {
    return {
        page:
            page?.page ??
            page?.pageNumber ??
            null,
        summary:
            compactEvidenceText(
                page?.summary || "",
                700
            ),
        evidence:
            compactEvidenceTextArray(
                page?.evidence,
                6,
                320
            ),
        uncertainty:
            compactEvidenceTextArray(
                page?.uncertainty,
                4,
                320
            )
    };
}

function compactMediaAnalysisSource(source = {}) {
    return {
        sourceId:
            compactEvidenceText(
                source?.sourceId || "",
                120
            ),
        fileName:
            compactEvidenceText(
                source?.fileName ||
                source?.name ||
                "",
                300
            ),
        mimeType:
            compactEvidenceText(
                source?.mimeType || "",
                120
            ),
        description:
            compactEvidenceText(
                source?.description || "",
                1600
            ),
        observations:
            compactEvidenceTextArray(
                source?.observations,
                8,
                320
            ),
        inferences:
            compactEvidenceTextArray(
                source?.inferences,
                6,
                320
            ),
        visibleData:
            (Array.isArray(source?.visibleData)
                ? source.visibleData
                : [])
                .slice(0, 10)
                .map(item => ({
                    kind:
                        compactEvidenceText(
                            item?.kind || "text",
                            40
                        ),
                    value:
                        compactEvidenceText(
                            item?.value || "",
                            300
                        ),
                    page:
                        item?.page ??
                        null,
                    confidence:
                        item?.confidence ??
                        null,
                    evidence:
                        compactEvidenceText(
                            item?.evidence || "",
                            500
                        ),
                    legibility:
                        compactEvidenceText(
                            item?.legibility || "",
                            40
                        )
                })),
        pages:
            (Array.isArray(source?.pages)
                ? source.pages
                : [])
                .slice(0, 12)
                .map(compactMediaAnalysisPage),
        uncertainty:
            compactEvidenceTextArray(
                source?.uncertainty,
                6,
                320
            ),
        evidence:
            compactEvidenceTextArray(
                source?.evidence,
                10,
                320
            )
    };
}

function compactMediaAnalysisObservation(observation = {}) {
    const sources =
        Array.isArray(
            observation?.sources
        )
            ? observation.sources
            : Array.isArray(
                observation?.validSources
            )
                ? observation.validSources
                : [];

    return {
        ok:
            observation?.ok,
        status:
            observation?.status,
        engine:
            observation?.engine,
        version:
            observation?.version,
        expectedSources:
            observation?.expectedSources,
        receivedSources:
            observation?.receivedSources,
        sources:
            sources
                .slice(0, 12)
                .map(compactMediaAnalysisSource),
        comparison:
            boundedEvidenceValue(
                observation?.comparison
            ),
        recommendations:
            compactEvidenceTextArray(
                observation?.recommendations,
                8,
                320
            ),
        policy:
            boundedEvidenceValue(
                observation?.policy
            ),
        precisionAudit:
            boundedEvidenceValue(
                observation?.precisionAudit
            )
    };
}

function findPrecisionVerifiedMediaObservation(evidenceItems = []) {
    const operational = (Array.isArray(evidenceItems) ? evidenceItems : [])
        .filter(item =>
            String(item?.name || item?.tool || "") !==
            "conversation.respond"
        );

    const mediaItems = operational.filter(item =>
        String(item?.name || item?.tool || "") === "media.analyze"
    );
    const allowedCompanionTools = new Set([
        "system.certify"
    ]);
    const unsupportedCompanions = operational.filter(item => {
        const toolName = String(item?.name || item?.tool || "");
        return toolName !== "media.analyze" &&
            !allowedCompanionTools.has(toolName);
    });

    if (
        mediaItems.length !== 1 ||
        unsupportedCompanions.length > 0
    ) {
        return null;
    }

    const item = mediaItems[0];

    const observation =
        item?.observation ??
        item?.response ??
        item?.data ??
        null;
    const nestedEvidence =
        observation?.evidence &&
        typeof observation.evidence === "object" &&
        !Array.isArray(observation.evidence)
            ? observation.evidence
            : {};
    const sources =
        Array.isArray(observation?.validSources) &&
        observation.validSources.length > 0
            ? observation.validSources
            : Array.isArray(observation?.sources) &&
                observation.sources.length > 0
                ? observation.sources
                : Array.isArray(nestedEvidence?.sources)
                    ? nestedEvidence.sources
                    : [];
    const precisionAudit =
        observation?.precisionAudit ||
        nestedEvidence?.precisionAudit ||
        null;
    const providerVersion = String(
        observation?.version ||
        nestedEvidence?.version ||
        ""
    ).trim();
    const expectedSources = Number(
        observation?.expectedSources ??
        nestedEvidence?.expectedSources
    );
    const receivedSources = Number(
        observation?.receivedSources ??
        nestedEvidence?.receivedSources
    );

    if (
        observation?.ok !== true ||
        observation?.status !== "MEDIA_ANALYSIS_GROUNDED" ||
        providerVersion !== "1.4.0-verified-visual-claims" ||
        precisionAudit?.ok !== true ||
        precisionAudit?.status !==
            "MEDIA_ANALYSIS_PRECISION_VERIFIED" ||
        precisionAudit?.sourceIdentityVerified !== true ||
        precisionAudit?.effectiveToolExecutions !== 1 ||
        sources.length < 1 ||
        expectedSources !== sources.length ||
        receivedSources !== sources.length
    ) {
        return null;
    }

    const identitiesAreComplete = sources.every((source, index) =>
        String(source?.sourceId || "") === `SOURCE_${index + 1}` &&
        Boolean(String(source?.fileName || source?.name || "").trim()) &&
        Boolean(String(source?.sha256 || "").trim())
    );

    return identitiesAreComplete
        ? {
            ...nestedEvidence,
            ...observation,
            sources,
            expectedSources,
            receivedSources,
            precisionAudit
        }
        : null;
}

function constrainCompactEvidence(
    value,
    {
        stringLimit = 800,
        arrayLimit = 12
    } = {},
    depth = 0
) {
    if (
        value == null ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }

    if (typeof value === "string") {
        return value.slice(0, stringLimit);
    }

    if (depth > 8) {
        return null;
    }

    if (Array.isArray(value)) {
        return value
            .slice(0, arrayLimit)
            .map(item =>
                constrainCompactEvidence(
                    item,
                    {
                        stringLimit,
                        arrayLimit
                    },
                    depth + 1
                )
            );
    }

    if (typeof value !== "object") {
        return String(value)
            .slice(0, stringLimit);
    }

    return Object.fromEntries(
        Object.entries(value)
            .slice(0, 40)
            .map(([key, item]) => [
                key,
                constrainCompactEvidence(
                    item,
                    {
                        stringLimit,
                        arrayLimit
                    },
                    depth + 1
                )
            ])
            .filter(([, item]) =>
                item !== null
            )
    );
}

function compactRepositoryObservation(
    observation = {},
    {
        readLimit = 8000,
        stringLimit = 1200,
        arrayLimit = 16
    } = {}
) {
    const source =
        observation &&
        typeof observation === "object" &&
        !Array.isArray(observation)
            ? observation
            : {};
    const verifiedRead =
        source?.verifiedRead &&
        typeof source.verifiedRead === "object" &&
        !Array.isArray(source.verifiedRead)
            ? source.verifiedRead
            : null;

    return {
        ok: source?.ok,
        executionOk: source?.executionOk,
        objectiveSatisfied: source?.objectiveSatisfied,
        status: source?.status,
        summary:
            compactEvidenceText(
                source?.summary ||
                "",
                stringLimit
            ),
        error:
            compactEvidenceText(
                source?.error ||
                "",
                Math.min(stringLimit, 800)
            ),
        verifiedRead: verifiedRead
            ? {
                tool: "repo.read",
                file: compactEvidenceText(
                    verifiedRead?.file ||
                    "",
                    500
                ),
                path: compactEvidenceText(
                    verifiedRead?.path ||
                    "",
                    500
                ),
                partial:
                    verifiedRead?.partial === true,
                startLine:
                    verifiedRead?.startLine ?? null,
                endLine:
                    verifiedRead?.endLine ?? null,
                totalLines:
                    verifiedRead?.totalLines ?? null,
                numberedContent:
                    String(
                        verifiedRead?.numberedContent ||
                        ""
                    ).slice(0, readLimit),
                sourceStructure:
                    constrainCompactEvidence(
                        verifiedRead?.sourceStructure || {},
                        {
                            stringLimit:
                                Math.min(
                                    stringLimit,
                                    700
                                ),
                            arrayLimit:
                                Math.min(
                                    arrayLimit,
                                    10
                                )
                        }
                    )
            }
            : null,
        repositoryEvidence:
            constrainCompactEvidence(
                {
                    file: source?.file,
                    path: source?.path,
                    requestedFile:
                        source?.requestedFile,
                    resolvedFile:
                        source?.resolvedFile,
                    totalMatches:
                        source?.totalMatches,
                    matches: source?.matches,
                    results: source?.results,
                    sourceDefinitions:
                        source?.sourceDefinitions,
                    definitionFiles:
                        source?.definitionFiles,
                    findings: source?.findings,
                    references: source?.references,
                    dependents: source?.dependents,
                    dependencies:
                        source?.dependencies,
                    totalDependents:
                        source?.totalDependents,
                    sourceStructure:
                        source?.sourceStructure,
                    evidence: source?.evidence
                },
                {
                    stringLimit,
                    arrayLimit
                }
            )
    };
}

export function buildBoundedConversationEvidence(evidenceItems = []) {
    const bounded = (Array.isArray(evidenceItems) ? evidenceItems : [])
        .slice(0, MAX_EVIDENCE_ITEMS)
        .map(item => {
            const tool = String(
                item?.name ||
                item?.tool ||
                "unknown"
            ).slice(0, 120);
            const observation =
                item?.observation ??
                item?.response ??
                item?.data ??
                item;
            return {
                tool,
                observation:
                    tool.startsWith("repo.")
                        ? compactRepositoryObservation(
                            observation
                        )
                        : boundedEvidenceValue(
                            observation
                        )
            };
        });

    const serialized = JSON.stringify(bounded);
    if (serialized.length <= MAX_EVIDENCE_LENGTH) {
        return serialized;
    }

    let compact = bounded.map(item => {
        const observation =
            item.observation &&
            typeof item.observation === "object" &&
            !Array.isArray(item.observation)
                ? item.observation
                : {};

        if (item.tool.startsWith("repo.")) {
            return {
                tool: item.tool,
                observation:
                    compactRepositoryObservation(
                        observation,
                        {
                            readLimit: 6000,
                            stringLimit: 800,
                            arrayLimit: 12
                        }
                    )
            };
        }

        const isMediaAnalysis =
            item.tool === "media.analyze" ||
            observation.status ===
                "MEDIA_ANALYSIS_GROUNDED" ||
            (
                Array.isArray(
                    observation.sources
                ) &&
                observation.sources.some(
                    source =>
                        String(
                            source?.mimeType ||
                            ""
                        ).startsWith(
                            "application/pdf"
                        ) ||
                        String(
                            source?.mimeType ||
                            ""
                        ).startsWith(
                            "image/"
                        )
                )
            );

        if (isMediaAnalysis) {
            return {
                tool: item.tool,
                observation:
                    compactMediaAnalysisObservation(
                        observation
                    )
            };
        }

        return {
            tool: item.tool,
            observation: boundedEvidenceValue({
                ok: observation.ok,
                status: observation.status,
                summary: observation.summary,
                error: observation.error,
                version: observation.version,
                totalTools: observation.totalTools,
                groups: observation.groups,
                readiness: observation.readiness,
                readinessScore:
                    observation.readinessScore,
                parity: observation.parity,
                gaps: observation.gaps,
                policy: observation.policy
            })
        };
    });

    const limits = [
        {
            stringLimit: 1200,
            arrayLimit: 16
        },
        {
            stringLimit: 800,
            arrayLimit: 12
        },
        {
            stringLimit: 500,
            arrayLimit: 8
        },
        {
            stringLimit: 320,
            arrayLimit: 6
        },
        {
            stringLimit: 220,
            arrayLimit: 4
        },
        {
            stringLimit: 160,
            arrayLimit: 3
        },
        {
            stringLimit: 120,
            arrayLimit: 2
        },
        {
            stringLimit: 80,
            arrayLimit: 1
        }
    ];

    let compactSerialized =
        JSON.stringify(compact);

    for (const limit of limits) {
        if (
            compactSerialized.length <=
            MAX_EVIDENCE_LENGTH
        ) {
            break;
        }

        compact =
            compact.map(item => ({
                tool: item.tool,
                observation:
                    constrainCompactEvidence(
                        item.observation,
                        limit
                    )
            }));

        compactSerialized =
            JSON.stringify(compact);
    }

    if (
        compactSerialized.length >
        MAX_EVIDENCE_LENGTH
    ) {
        compact =
            compact.map(item => {
                const observation =
                    item.observation &&
                    typeof item.observation ===
                        "object" &&
                    !Array.isArray(
                        item.observation
                    )
                        ? item.observation
                        : {};

                if (item.tool.startsWith("repo.")) {
                    return {
                        tool: item.tool,
                        observation:
                            compactRepositoryObservation(
                                observation,
                                {
                                    readLimit: 900,
                                    stringLimit: 180,
                                    arrayLimit: 3
                                }
                            )
                    };
                }

                return {
                    tool: item.tool,
                    observation: {
                        ok:
                            observation.ok,
                        status:
                            observation.status,
                        version:
                            observation.version,
                        sources:
                            (
                                Array.isArray(
                                    observation.sources
                                )
                                    ? observation.sources
                                    : []
                            )
                                .slice(0, 12)
                                .map(source => ({
                                    sourceId:
                                        compactEvidenceText(
                                            source?.sourceId ||
                                            "",
                                            120
                                        ),
                                    fileName:
                                        compactEvidenceText(
                                            source?.fileName ||
                                            "",
                                            240
                                        ),
                                    mimeType:
                                        compactEvidenceText(
                                            source?.mimeType ||
                                            "",
                                            100
                                        ),
                                    description:
                                        compactEvidenceText(
                                            source?.description ||
                                            "",
                                            240
                                        ),
                                    pages:
                                        (
                                            Array.isArray(
                                                source?.pages
                                            )
                                                ? source.pages
                                                : []
                                        )
                                            .slice(0, 2)
                                            .map(page => ({
                                                page:
                                                    page?.page ??
                                                    null,
                                                summary:
                                                    compactEvidenceText(
                                                        page?.summary ||
                                                        "",
                                                        240
                                                    ),
                                                evidence:
                                                    compactEvidenceTextArray(
                                                        page?.evidence,
                                                        2,
                                                        180
                                                    )
                                            }))
                                }))
                    }
                };
            });

        compactSerialized =
            JSON.stringify(compact);
    }

    return compactSerialized;
}

function findEvidenceField(value, field, depth = 0) {
    if (!value || typeof value !== "object" || depth > 6) return null;
    if (Object.prototype.hasOwnProperty.call(value, field)) {
        return value[field];
    }
    for (const nested of Object.values(value)) {
        const found = findEvidenceField(nested, field, depth + 1);
        if (found != null) return found;
    }
    return null;
}

export function buildCapabilityEvidenceBriefing(evidenceItems = []) {
    const items = Array.isArray(evidenceItems) ? evidenceItems : [];
    const capabilities = items.find(item =>
        (item?.name || item?.tool) === "system.capabilities"
    );
    const forensics = items.find(item =>
        (item?.name || item?.tool) === "system.forensics"
    );
    const groups =
        findEvidenceField(capabilities, "groups") ||
        {};
    const policy =
        findEvidenceField(capabilities, "policy") ||
        {};
    const gaps =
        findEvidenceField(forensics, "gaps") ||
        findEvidenceField(capabilities, "gaps") ||
        [];
    const readiness =
        findEvidenceField(forensics, "readinessScore") ??
        findEvidenceField(capabilities, "readiness") ??
        null;

    return JSON.stringify({
        capabilityDomains:
            Object.entries(groups)
                .slice(0, 20)
                .map(([domain, tools]) => ({
                    domain,
                    tools:
                        Array.isArray(tools)
                            ? tools.slice(0, 20)
                            : []
                })),
        policy: boundedEvidenceValue(policy),
        limitations:
            Array.isArray(gaps)
                ? gaps.slice(0, 20)
                : [],
        readiness: boundedEvidenceValue(readiness)
    });
}


export function buildAuthoritativeToolOutcomeMatrix(evidenceItems = []) {
    return (Array.isArray(evidenceItems) ? evidenceItems : [])
        .filter(item => String(item?.name || item?.tool || "") !== "conversation.respond")
        .slice(0, 30)
        .map(item => {
            const observation =
                item?.observation ||
                item?.response ||
                item?.data ||
                {};
            return {
                tool: String(item?.name || item?.tool || "").slice(0, 120),
                status: String(observation?.status || "").slice(0, 160),
                ok: observation?.ok === true,
                executionOk: observation?.executionOk !== false,
                objectiveSatisfied: observation?.objectiveSatisfied === true,
                blocked: observation?.blocked === true,
                requiresInput: observation?.requiresInput === true,
                retryable: observation?.retryable === true,
                error: String(observation?.error || "").slice(0, 500)
            };
        });
}

export async function composeEvidenceGroundedConversation({
    instruction = "",
    evidenceItems = [],
    executeConversation
} = {}) {
    const precisionVerifiedMedia =
        findPrecisionVerifiedMediaObservation(evidenceItems);

    if (typeof executeConversation !== "function") {
        return {
            ok: false,
            status: "CONVERSATIONAL_COMPOSER_REQUIRED",
            text: "",
            prompt: "",
            evidence: ""
        };
    }

    const evidence = buildBoundedConversationEvidence(evidenceItems);
    const authoritativeOutcomes =
        buildAuthoritativeToolOutcomeMatrix(evidenceItems);
    const capabilityBriefing =
        buildCapabilityEvidenceBriefing(evidenceItems);
    const precisionGroundingInstruction =
        precisionVerifiedMedia
            ? [
                "La evidencia incluye un análisis visual con auditoría de precisión aprobada.",
                "Trata al analizador visual únicamente como herramienta de evidencia; tú eres la única autoridad que compone la respuesta final.",
                "Conserva exactamente los valores de visibleData marcados VERIFIED cuando los menciones; no inventes, corrijas ni completes nombres, URLs, fechas, horas o etiquetas que no estén verificados.",
                "Las observaciones, incertidumbres y comparaciones son evidencia auxiliar: sintetízalas sólo cuando estén respaldadas por la evidencia estructurada y mantén como incierto lo que la propia evidencia marque incierto.",
                "No conviertas ausencia visual en hecho si la evidencia no la demuestra y no agregues recomendaciones cuando la política estructurada las suprima."
            ].join(" ")
            : "";
    const pendingCreativeAcceptance =
        (Array.isArray(evidenceItems) ? evidenceItems : [])
            .some(item => {
                const observation =
                    item?.observation || item?.response || item?.data || {};
                return observation?.creativeAcceptanceRequired === true &&
                    observation?.identityFidelityVerified !== true;
            });
    const creativeAcceptanceInstruction = pendingCreativeAcceptance
        ? "Un MP4 fisicamente verificado prueba entrega tecnica, no fidelidad facial ni aceptacion creativa. Como identityFidelityVerified no es true, no afirmes fidelidad facial, que las fotos quedaron aplicadas correctamente ni que la produccion fue aceptada; informa que la revision humana sigue pendiente."
        : "";
    const missionOutcomeObservation =
        (Array.isArray(evidenceItems) ? evidenceItems : [])
            .find(item => String(item?.name || item?.tool || "") === "mission.outcome")
            ?.observation;
    const missionOutcomeInstruction =
        missionOutcomeObservation && missionOutcomeObservation.status !== "COMPLETED"
            ? `El estado canonico de la mision es ${String(missionOutcomeObservation.status || "INCOMPLETE")} con razon ${String(missionOutcomeObservation.reason || "UNRESOLVED")}; no declares la mision completada aunque una herramienta individual haya entregado un artefacto.`
            : "";
    const prompt = [
        "Responde al usuario como Jarvis en lenguaje natural y directo.",
        "Usa exclusivamente la evidencia estructurada incluida; no inventes capacidades, estados ni ejecuciones.",
        "Conserva saludos y todos los objetivos de la solicitud.",
        "Resume resultados y limitaciones reales. No muestres JSON, nombres de campos internos, telemetria ni payloads de herramientas.",
        "La interpretación de la intención ya fue resuelta por el planner semántico; no reclasifiques la solicitud con palabras clave ni patrones locales.",
        "Cuando la evidencia sea de repo.*, usa rutas, sourceDefinitions, coincidencias, lecturas numeradas, diagnósticos y dependencias preservadas. Si esos datos existen, no afirmes que faltan resultados del repositorio.",
        "Cuando existan dominios de capacidades, conviértelos en funciones humanas concretas: conversación, investigación web, análisis de archivos o medios, documentos, hojas de cálculo, páginas, imágenes y trabajo controlado de repositorio, únicamente si aparecen en la evidencia.",
        "No reduzcas el resumen a decir que puedes verificar capacidades o hacer forensics; esas son fuentes de evidencia, no el alcance útil para el usuario.",
        "Si una herramienta fallo o falta evidencia, dilo una sola vez y no marques la mision como completada.",
        "RESULTADOS_HERRAMIENTAS_AUTORITATIVOS es el estado operativo definitivo: nunca describas como bloqueada una herramienta con objectiveSatisfied=true ni como completada una herramienta marcada blocked=true o requiresInput=true.",
        "La falta de un dato factual no bloquea entregables independientes que si tienen evidencia suficiente. Despues de agotar la investigacion disponible, enumera solamente los datos realmente faltantes que impiden una parte solicitada y pregunta al usuario si puede proporcionarlos o si prefiere continuar sin ellos; conserva todo lo ya verificado.",
        precisionGroundingInstruction,
        creativeAcceptanceInstruction,
        missionOutcomeInstruction,
        `SOLICITUD_USUARIO=${String(instruction || "").slice(0, 12000)}`,
        `RESUMEN_CAPACIDADES_Y_LIMITES=${capabilityBriefing}`,
        `RESULTADOS_HERRAMIENTAS_AUTORITATIVOS=${JSON.stringify(authoritativeOutcomes)}`,
        `EVIDENCIA_ESTRUCTURADA=${evidence}`
    ].filter(Boolean).join("\n\n");

    try {
        const result = await executeConversation(prompt);
        const payload =
            result?.response?.data ||
            result?.response ||
            result?.data?.response?.data ||
            result?.data?.response ||
            result?.data ||
            result ||
            {};
        const text = String(
            payload?.message ||
            payload?.text ||
            payload?.report ||
            ""
        ).trim();
        const rawJson =
            text.startsWith("{") ||
            text.startsWith("[");

        if (result?.ok === false || payload?.ok === false || !text || rawJson) {
            return {
                ok: false,
                status:
                    rawJson
                        ? "RAW_TOOL_PAYLOAD_REJECTED"
                        : payload?.status ||
                            result?.status ||
                            payload?.error ||
                            result?.error ||
                            "CONVERSATIONAL_COMPOSITION_FAILED",
                text: "",
                prompt,
                evidence,
                observation: result
            };
        }

        return {
            ok: true,
            status: "CONVERSATIONAL_COMPOSITION_COMPLETED",
            text,
            prompt,
            evidence,
            provider: payload?.provider || null,
            model: payload?.model || null,
            observation: result
        };
    }
    catch (error) {
        return {
            ok: false,
            status:
                error?.message ||
                "CONVERSATIONAL_COMPOSITION_FAILED",
            text: "",
            prompt,
            evidence,
            observation: null
        };
    }
}
