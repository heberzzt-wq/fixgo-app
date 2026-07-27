const MAX_EVIDENCE_ITEMS = 12;
const MAX_EVIDENCE_LENGTH = 24000;

function normalizedText(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

export function isExplicitJsonResponseRequest(instruction = "") {
    const normalized = normalizedText(instruction);
    return (
        normalized.includes("json") &&
        (
            normalized.includes("devuelve") ||
            normalized.includes("responde") ||
            normalized.includes("formato") ||
            normalized.includes("salida")
        )
    );
}

export function prepareEvidenceGroundedConversationPlan({
    instruction = "",
    toolCalls = [],
    toolCatalog = []
} = {}) {
    const explicitJson = isExplicitJsonResponseRequest(instruction);
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
        "system.health"
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

export function buildBoundedConversationEvidence(evidenceItems = []) {
    const bounded = (Array.isArray(evidenceItems) ? evidenceItems : [])
        .slice(0, MAX_EVIDENCE_ITEMS)
        .map(item => ({
            tool: String(item?.name || item?.tool || "unknown").slice(0, 120),
            observation: boundedEvidenceValue(
                item?.observation ??
                item?.response ??
                item?.data ??
                item
            )
        }));

    const serialized = JSON.stringify(bounded);
    if (serialized.length <= MAX_EVIDENCE_LENGTH) {
        return serialized;
    }

    const compact = bounded.map(item => {
        const observation =
            item.observation &&
            typeof item.observation === "object" &&
            !Array.isArray(item.observation)
                ? item.observation
                : {};
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
                readinessScore: observation.readinessScore,
                parity: observation.parity,
                gaps: observation.gaps,
                policy: observation.policy
            })
        };
    });

    while (
        compact.length > 1 &&
        JSON.stringify(compact).length > MAX_EVIDENCE_LENGTH
    ) {
        compact.pop();
    }

    return JSON.stringify(compact);
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

export async function composeEvidenceGroundedConversation({
    instruction = "",
    evidenceItems = [],
    executeConversation
} = {}) {
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
    const capabilityBriefing =
        buildCapabilityEvidenceBriefing(evidenceItems);
    const prompt = [
        "Responde al usuario como Jarvis en lenguaje natural y directo.",
        "Usa exclusivamente la evidencia estructurada incluida; no inventes capacidades, estados ni ejecuciones.",
        "Conserva saludos y todos los objetivos de la solicitud.",
        "Resume resultados y limitaciones reales. No muestres JSON, nombres de campos internos, telemetria ni payloads de herramientas.",
        "Cuando existan dominios de capacidades, conviértelos en funciones humanas concretas: conversación, investigación web, análisis de archivos o medios, documentos, hojas de cálculo, páginas, imágenes y trabajo controlado de repositorio, únicamente si aparecen en la evidencia.",
        "No reduzcas el resumen a decir que puedes verificar capacidades o hacer forensics; esas son fuentes de evidencia, no el alcance útil para el usuario.",
        "Si una herramienta fallo o falta evidencia, dilo una sola vez y no marques la mision como completada.",
        `SOLICITUD_USUARIO=${String(instruction || "").slice(0, 12000)}`,
        `RESUMEN_CAPACIDADES_Y_LIMITES=${capabilityBriefing}`,
        `EVIDENCIA_ESTRUCTURADA=${evidence}`
    ].join("\n\n");

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
