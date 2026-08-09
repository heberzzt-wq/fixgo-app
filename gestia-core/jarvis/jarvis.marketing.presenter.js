const SECTION_DEFINITIONS = [
    ["executiveSummary", "1. Resumen ejecutivo"],
    ["assumptions", "2. Suposiciones"],
    ["businessDiagnosis", "3. Diagnóstico"],
    ["smartObjectives", "4. Objetivos SMART"],
    ["targetAudience", "5. Público objetivo"],
    ["customerProblem", "6. Problema principal"],
    ["valueProposition", "7. Propuesta de valor"],
    ["positioningAndMessages", "8. Posicionamiento y mensajes"],
    ["offerStrategy", "9. Oferta y enfoque comercial"],
    ["competitiveAnalysis", "10. Competencia y alternativas"],
    ["customerJourneyAndFunnel", "11. Recorrido del cliente y embudo"],
    ["acquisitionStrategy", "12. Estrategia de adquisición"],
    ["priorityChannels", "13. Canales prioritarios"],
    ["contentStrategy", "14. Estrategia de contenido"],
    ["contentPillars", "15. Pilares de contenido"],
    ["campaignExamples", "16. Ejemplos de campañas"],
    ["executionCalendar", "17. Calendario inicial"],
    ["conversionAndCta", "18. Conversión y llamadas a la acción"],
    ["retentionAndReferrals", "19. Retención y referidos"],
    ["budgetScenarios", "20. Presupuesto bajo y medio"],
    ["kpisAndMeasurement", "21. KPIs y medición"],
    ["experiments", "22. Experimentos y pruebas A/B"],
    ["actionPlan306090", "23. Plan de acción 30/60/90"],
    ["risksAndMitigations", "24. Riesgos y mitigaciones"],
    ["prioritizedNextSteps", "25. Próximos pasos priorizados"]
];

function scalar(value) {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

function internalPresentationKey(key = "") {
    return key === "source" ||
        key === "editable" ||
        key === "factualClaim" ||
        key === "evidencePolicy" ||
        key === "status" ||
        key === "publishStatus" ||
        key === "approvalRequired";
}

function lines(value, depth = 0) {
    if (depth > 5 || value == null) return [];
    const direct = scalar(value);
    if (direct) return [direct];
    if (Array.isArray(value)) {
        return value.flatMap(item => {
            const rendered = lines(item, depth + 1);
            if (rendered.length === 0) return [];
            return [`- ${rendered[0]}`, ...rendered.slice(1).map(line => `  ${line}`)];
        });
    }
    if (typeof value === "object") {
        return Object.entries(value).flatMap(([key, item]) => {
            if (internalPresentationKey(key)) return [];
            const rendered = lines(item, depth + 1);
            if (rendered.length === 0) return [];
            const label = key.replaceAll("_", " ");
            return [`- ${label}: ${rendered[0]}`, ...rendered.slice(1).map(line => `  ${line}`)];
        });
    }
    return [];
}

function assumptionLines(value = []) {
    const fields = (Array.isArray(value) ? value : [])
        .map(item => String(item?.field || "").trim())
        .filter(Boolean);
    if (fields.length === 0 || (fields.length === 1 && fields[0] === "none")) {
        return ["- No se introdujeron supuestos estratégicos locales como hechos verificados."];
    }
    return [
        `- Propuestas editables que deben validarse antes de publicar: ${[...new Set(fields)].join(", ")}.`,
        "- Estas propuestas no cuentan como evidencia factual ni como resultados ya obtenidos."
    ];
}

export function hasCompleteMarketingPlan(plan = null) {
    return Boolean(
        plan &&
        typeof plan === "object" &&
        SECTION_DEFINITIONS.every(([key]) => {
            const value = plan[key];
            return value != null && (!Array.isArray(value) || value.length > 0);
        })
    );
}

function renderCreativePreparation(result = {}) {
    const video = result?.videoPackage;
    const deliverables = Array.isArray(result?.deliverables) ? result.deliverables : [];
    const copies = Array.isArray(result?.copies) ? result.copies : [];
    if (!video && deliverables.length === 0 && copies.length === 0) return [];
    const output = [
        "## Piezas preparadas para producción",
        "Esta sección contiene briefs, guiones y especificaciones. No significa que los archivos finales ya hayan sido creados.",
        ""
    ];
    if (video) {
        const width = video?.dimensions?.width || 1080;
        const height = video?.dimensions?.height || 1920;
        output.push(
            "### Reel vertical — storyboard",
            `- Duración objetivo: ${video.durationSeconds || 30} segundos`,
            `- Formato: ${video.aspectRatio || "9:16"} (${width}×${height})`,
            `- Subtítulos: ${video?.subtitles?.required === true ? "obligatorios" : "opcionales"}`,
            "- Storyboard y texto en pantalla:"
        );
        for (const scene of Array.isArray(video.storyboard) ? video.storyboard : []) {
            output.push(`  - Escena ${scene.scene || ""} (${scene.range || "duración definida"} s): ${scene.purpose || "escena"} — ${scene.overlay || ""}`.trim());
        }
        output.push("");
    }
    if (copies.length) {
        output.push("### Copys propuestos");
        for (const copy of copies.slice(0, 8)) {
            output.push(`- ${copy.channel || "canal"}: ${copy.hook || ""} ${copy.body || ""} CTA: ${copy.cta || ""}`.trim());
        }
        output.push("");
    }
    if (deliverables.length) {
        output.push("### Archivos que el contrato puede requerir producir");
        for (const item of deliverables) {
            const sizes = Array.isArray(item.dimensions)
                ? item.dimensions.map(size => size.aspectRatio || `${size.width}×${size.height}`).filter(Boolean).join(", ")
                : "";
            output.push(`- ${item.type || "activo"}: ${item.format || "formato de producción"}${sizes ? ` — ${sizes}` : ""}`);
        }
        output.push("");
    }
    output.push(
        "### Regla de evidencia",
        "Los conceptos creativos pueden proponerse, pero los hechos, cifras, testimonios, resultados y atributos verificables sólo deben publicarse cuando estén respaldados por evidencia suministrada o verificada."
    );
    return output;
}

export function renderCompleteMarketingPlan(result = {}) {
    if (result?.status !== "MARKETING_PACKAGE_READY" || !hasCompleteMarketingPlan(result?.plan)) return "";
    const brand = result?.brand?.name || result?.campaign?.name || "el negocio";
    return [
        `# Plan de marketing — ${brand}`,
        "",
        ...SECTION_DEFINITIONS.flatMap(([key, heading]) => [
            `## ${heading}`,
            ...(key === "assumptions" ? assumptionLines(result.plan[key]) : lines(result.plan[key])),
            ""
        ]),
        ...renderCreativePreparation(result)
    ].join("\n").trim();
}

function isMarketingDocumentTask(item = {}) {
    return item?.name === "document.create" && item?.args?.contentSource === "marketing.plan";
}

function isMarketingArtifactTask(item = {}) {
    if (isMarketingDocumentTask(item)) return true;
    return [
        "reel.create",
        "page.create",
        "image.generate",
        "marketing.package.real-media"
    ].includes(String(item?.name || ""));
}

function completedMarketingTask(tasks = []) {
    return [...(Array.isArray(tasks) ? tasks : [])].reverse().find(item =>
        item?.name === "marketing.plan" &&
        item?.observation?.status === "MARKETING_PACKAGE_READY" &&
        item?.observation?.planReady !== false &&
        typeof item?.observation?.userVisible === "string" &&
        item.observation.userVisible.trim()
    ) || null;
}

export function marketingArtifactArgsFromCompletedTasks(completedTasks = [], requestedArgs = {}) {
    const format = String(requestedArgs?.format || "").trim().toLowerCase();
    if (!["md", "pdf"].includes(format) || requestedArgs?.contentSource !== "marketing.plan") return null;
    const marketing = completedMarketingTask(completedTasks);
    if (!marketing) return null;
    return {
        ...(requestedArgs || {}),
        format,
        content: marketing.observation.userVisible
    };
}

function artifactOutput(item = {}) {
    return item?.observation?.artifact ||
        item?.observation?.output ||
        item?.observation?.evidence?.output ||
        item?.observation?.evidence?.artifact?.output ||
        item?.observation?.artifact?.output ||
        item?.observation?.result?.output ||
        item?.observation?.file ||
        "";
}

function requirementLabel(requirement = {}) {
    const explicit = String(requirement?.label || requirement?.type || "").trim();
    if (explicit) return explicit.toUpperCase();
    const toolName = String(requirement?.toolName || "");
    if (toolName === "reel.create") return "REEL 9:16";
    if (toolName === "page.create") return "LANDING HTML";
    if (toolName === "image.generate") return "IMAGEN PUBLICITARIA";
    if (toolName === "document.create") return `DOCUMENTO ${(requirement?.format || "").toUpperCase()}`.trim();
    if (toolName === "marketing.package.real-media") return "PAQUETE DE MEDIOS REALES";
    return toolName.toUpperCase() || "ARTEFACTO";
}

function normalizedRequirements(marketing = {}) {
    const source = Array.isArray(marketing?.observation?.requiredArtifacts)
        ? marketing.observation.requiredArtifacts
        : [];
    return source.map((item, index) => ({
        id: String(item?.id || `artifact-${index + 1}`),
        type: String(item?.type || ""),
        toolName: String(item?.toolName || ""),
        format: String(item?.format || "").toLowerCase(),
        label: String(item?.label || "")
    })).filter(item => item.toolName);
}

function taskMatchesRequirement(item = {}, requirement = {}) {
    if (String(item?.name || "") !== requirement.toolName) return false;
    if (requirement.toolName === "document.create") {
        const format = String(requirement.format || "").toLowerCase();
        if (format && String(item?.args?.format || "").toLowerCase() !== format) return false;
        if (["md", "pdf"].includes(format) && item?.args?.contentSource !== "marketing.plan") return false;
    }
    return true;
}

export function marketingFinalResponseFromMission(missionResult = {}) {
    const completed = Array.isArray(missionResult?.completedTasks) ? missionResult.completedTasks : [];
    const marketing = completedMarketingTask(completed);
    if (!marketing) return null;

    const productionRequested = marketing.observation.productionRequested === true;
    const requirements = normalizedRequirements(marketing);
    const blockedOrPending = [
        ...(Array.isArray(missionResult?.blockedTasks) ? missionResult.blockedTasks : []),
        ...(Array.isArray(missionResult?.pendingTasks) ? missionResult.pendingTasks : [])
    ];
    const unresolved = [];
    const produced = [];

    if (productionRequested && requirements.length === 0) {
        unresolved.push({ label: "ALCANCE DE PRODUCCIÓN", reason: "CONTRATO_DE_ARTEFACTOS_AUSENTE" });
    }

    for (const requirement of requirements) {
        const completedTask = completed.find(item => taskMatchesRequirement(item, requirement));
        const blockedTask = blockedOrPending.find(item => taskMatchesRequirement(item, requirement));
        const output = completedTask ? artifactOutput(completedTask) : "";
        if (completedTask && output) {
            produced.push({ label: requirementLabel(requirement), output });
            continue;
        }
        unresolved.push({
            label: requirementLabel(requirement),
            reason: blockedTask ? "PENDIENTE_O_BLOQUEADO" : completedTask ? "SIN_ARCHIVO_VERIFICABLE" : "NO_EJECUTADO"
        });
    }

    const otherCompletedArtifacts = completed
        .filter(isMarketingArtifactTask)
        .filter(item => !requirements.some(requirement => taskMatchesRequirement(item, requirement)))
        .map(item => ({ label: String(item.name || "ARTEFACTO").toUpperCase(), output: artifactOutput(item) }))
        .filter(item => item.output);

    const artifactLines = productionRequested
        ? unresolved.length
            ? [
                "",
                "## Producción pendiente",
                "El plan estratégico está preparado, pero la misión de producción todavía no está completa.",
                `Pendientes: ${[...new Set(unresolved.map(item => item.label))].join(", ")}.`,
                "No se declara producción de punta a punta hasta que cada archivo requerido exista y tenga una salida verificable."
            ]
            : [
                "",
                "## Archivos producidos y verificados",
                ...[...produced, ...otherCompletedArtifacts].map(item => `- ${item.label}: ${item.output}`)
            ]
        : [];

    return {
        ok: marketing.observation.objectiveSatisfied === true && (!productionRequested || unresolved.length === 0),
        title: productionRequested && unresolved.length ? "Plan de marketing — producción incompleta" : "Plan de marketing",
        text: [marketing.observation.userVisible, ...artifactLines].join("\n"),
        source: "MARKETING_DELIVERABLE_DIRECT",
        productionRequested,
        requiredArtifacts: requirements,
        unresolvedArtifacts: unresolved,
        producedArtifacts: produced
    };
}

export const MARKETING_PLAN_SECTIONS = SECTION_DEFINITIONS.map(([key, heading]) => ({ key, heading }));
