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

function compactCell(value) {
    const direct = scalar(value);
    if (direct) return direct.slice(0, 32000);
    if (value == null) return "";
    try {
        return JSON.stringify(value).slice(0, 32000);
    }
    catch {
        return "";
    }
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
        "image.edit",
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

function normalizedRequirements(marketing = {}) {
    const source = Array.isArray(marketing?.observation?.requiredArtifacts)
        ? marketing.observation.requiredArtifacts
        : [];
    const requirements = source.map((item, index) => ({
        id: String(item?.id || `artifact-${index + 1}`).trim(),
        type: String(item?.type || ""),
        toolName: String(item?.toolName || ""),
        format: String(item?.format || "").toLowerCase(),
        label: String(item?.label || "")
    })).filter(item => item.toolName);
    const counts = requirements.reduce((map, item) => {
        const key = `${item.toolName}\u0000${item.format}`;
        map.set(key, (map.get(key) || 0) + 1);
        return map;
    }, new Map());
    return requirements.map(item => ({
        ...item,
        identityRequired: (counts.get(`${item.toolName}\u0000${item.format}`) || 0) > 1
    }));
}

function matchingMarketingRequirement(marketing = {}, requestedArgs = {}) {
    const requirements = normalizedRequirements(marketing);
    const format = String(requestedArgs?.format || "").trim().toLowerCase();
    const requestedId = String(
        requestedArgs?.marketingRequirementId ||
        requestedArgs?.variantId ||
        ""
    ).trim();
    return requirements.find(item =>
        item.toolName === "document.create" &&
        (!format || !item.format || item.format === format) &&
        (!requestedId || item.id === requestedId)
    ) || null;
}

function marketingWorkbookSheets(marketing = {}) {
    const observation = marketing?.observation || {};
    const evidence = observation?.evidence && typeof observation.evidence === "object"
        ? observation.evidence
        : {};
    const plan = observation?.deliverable && typeof observation.deliverable === "object"
        ? observation.deliverable
        : evidence?.plan && typeof evidence.plan === "object"
            ? evidence.plan
            : {};
    const brand = evidence?.brand && typeof evidence.brand === "object" ? evidence.brand : {};
    const campaign = evidence?.campaign && typeof evidence.campaign === "object" ? evidence.campaign : {};
    const copies = Array.isArray(evidence?.copies)
        ? evidence.copies
        : Array.isArray(plan?.campaignExamples)
            ? plan.campaignExamples
            : [];
    const calendar = Array.isArray(evidence?.calendar)
        ? evidence.calendar
        : Array.isArray(plan?.executionCalendar)
            ? plan.executionCalendar
            : [];
    const kpis = Array.isArray(plan?.kpisAndMeasurement) ? plan.kpisAndMeasurement : [];
    const actionPlan = plan?.actionPlan306090 && typeof plan.actionPlan306090 === "object"
        ? plan.actionPlan306090
        : {};

    const summaryRows = [
        ["Campo", "Valor"],
        ["Marca", compactCell(brand?.name || campaign?.brandName || "")],
        ["Mercado", compactCell(brand?.market || "")],
        ["Campaña", compactCell(campaign?.name || "")],
        ["Objetivo", compactCell(campaign?.objective || "")],
        ["Audiencia", compactCell(campaign?.audience || plan?.targetAudience || "")],
        ["Oferta", compactCell(campaign?.offer || plan?.offerStrategy || "")],
        ["CTA", compactCell(campaign?.cta || plan?.conversionAndCta || "")],
        ["Propuesta de valor", compactCell(plan?.valueProposition || campaign?.promise || "")]
    ];
    const kpiRows = [
        ["Indicador", "Meta / criterio", "Frecuencia", "Fuente"],
        ...kpis.map(item => [
            compactCell(item?.metric || item?.indicator || item),
            compactCell(item?.target || item?.meta || ""),
            compactCell(item?.cadence || item?.frequency || ""),
            compactCell(item?.source || "")
        ])
    ];
    const calendarRows = [
        ["Día", "Etapa", "Formato", "Tema", "Canales"],
        ...calendar.map(item => [
            compactCell(item?.day),
            compactCell(item?.stage),
            compactCell(item?.format),
            compactCell(item?.topic),
            compactCell(item?.channels)
        ])
    ];
    const copyRows = [
        ["Canal", "Hook", "Cuerpo", "CTA"],
        ...copies.map(item => [
            compactCell(item?.channel),
            compactCell(item?.hook),
            compactCell(item?.body),
            compactCell(item?.cta)
        ])
    ];
    const actionRows = [
        ["Horizonte", "Acción"],
        ...Object.entries(actionPlan).flatMap(([period, actions]) =>
            (Array.isArray(actions) ? actions : [actions])
                .filter(Boolean)
                .map(action => [compactCell(period), compactCell(action)])
        )
    ];
    const planRows = [
        ["Sección", "Contenido"],
        ...SECTION_DEFINITIONS.map(([key, heading]) => [heading, compactCell(plan?.[key])])
    ];

    return [
        { name: "Resumen", rows: summaryRows },
        { name: "Plan", rows: planRows },
        { name: "KPIs", rows: kpiRows },
        { name: "Calendario", rows: calendarRows },
        { name: "Copys", rows: copyRows },
        { name: "30-60-90", rows: actionRows }
    ].filter(sheet => sheet.rows.length > 1);
}

export function marketingArtifactArgsFromCompletedTasks(completedTasks = [], requestedArgs = {}) {
    const format = String(requestedArgs?.format || "").trim().toLowerCase();
    if (!["md", "pdf", "xlsx"].includes(format)) return null;
    const marketing = completedMarketingTask(completedTasks);
    if (!marketing) return null;
    const requirement = matchingMarketingRequirement(marketing, requestedArgs);
    const explicitlyMarketing = requestedArgs?.contentSource === "marketing.plan";
    const declaredRequirements = normalizedRequirements(marketing);
    if (!requirement && !explicitlyMarketing && declaredRequirements.length > 0) return null;

    const base = {
        ...(requestedArgs || {}),
        format,
        contentSource: "marketing.plan",
        content: marketing.observation.userVisible,
        ...(requirement?.id && !requestedArgs?.marketingRequirementId
            ? { marketingRequirementId: requirement.id }
            : {})
    };
    if (format === "xlsx") {
        return {
            ...base,
            sheets: marketingWorkbookSheets(marketing),
            requireFormulas: false
        };
    }
    return base;
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

function artifactFingerprint(item = {}) {
    const hash = String(
        item?.observation?.outputSha256 ||
        item?.observation?.sha256 ||
        item?.observation?.evidence?.outputSha256 ||
        item?.observation?.evidence?.sha256 ||
        item?.observation?.evidence?.artifact?.sha256 ||
        ""
    ).trim().toLowerCase();
    if (hash) return `sha256:${hash}`;
    const output = String(artifactOutput(item) || "").trim();
    return output ? `output:${output.replaceAll("\\", "/").toLowerCase()}` : "";
}

function requirementLabel(requirement = {}) {
    const explicit = String(requirement?.label || requirement?.type || "").trim();
    if (explicit) return explicit.toUpperCase();
    const toolName = String(requirement?.toolName || "");
    if (toolName === "reel.create") return "REEL 9:16";
    if (toolName === "page.create") return "LANDING HTML";
    if (toolName === "image.generate" || toolName === "image.edit") return "IMAGEN PUBLICITARIA";
    if (toolName === "document.create") return `DOCUMENTO ${(requirement?.format || "").toUpperCase()}`.trim();
    if (toolName === "marketing.package.real-media") return "PAQUETE DE MEDIOS REALES";
    return toolName.toUpperCase() || "ARTEFACTO";
}

function taskRequirementIdentity(item = {}) {
    return String(
        item?.args?.marketingRequirementId ||
        item?.args?.variantId ||
        ""
    ).trim();
}

function taskMatchesRequirement(item = {}, requirement = {}) {
    if (String(item?.name || "") !== requirement.toolName) return false;
    if (requirement.toolName === "document.create") {
        const format = String(requirement.format || "").toLowerCase();
        if (format && String(item?.args?.format || "").toLowerCase() !== format) return false;
    }
    const identity = taskRequirementIdentity(item);
    if (requirement.identityRequired) {
        return Boolean(identity) && identity === requirement.id;
    }
    if (identity && requirement.id) {
        return identity === requirement.id;
    }
    return true;
}

function renderCompletedReelPlans(completedTasks = []) {
    const plans = (Array.isArray(completedTasks) ? completedTasks : [])
        .filter(item =>
            item?.name === "reel.plan" &&
            item?.observation?.objectiveSatisfied === true &&
            item?.observation?.status === "REEL_PLAN_READY" &&
            item?.observation?.preparedArtifact?.kind === "reel"
        )
        .map(item => item.observation.preparedArtifact);
    if (plans.length === 0) return [];
    return [
        "",
        "## Propuestas de reels planificadas",
        ...plans.flatMap((plan, index) => [
            `### Reel ${index + 1}: ${plan.title || "Propuesta"}`,
            `- Duración: ${Number(plan.durationSeconds) || 0} segundos`,
            `- CTA: ${plan.cta || "Pendiente"}`,
            ...(Array.isArray(plan.scenes)
                ? plan.scenes.slice(0, 18).map((scene, sceneIndex) =>
                    `- Escena ${sceneIndex + 1}: ${scene?.overlay || scene?.visual || "Escena planificada"}`
                )
                : [])
        ])
    ];
}

function legacyRequirementsFromMission(missionResult = {}) {
    const tasks = [
        ...(Array.isArray(missionResult?.completedTasks) ? missionResult.completedTasks : []),
        ...(Array.isArray(missionResult?.blockedTasks) ? missionResult.blockedTasks : []),
        ...(Array.isArray(missionResult?.pendingTasks) ? missionResult.pendingTasks : [])
    ].filter(item =>
        item?.name === "document.create" ||
        isMarketingArtifactTask(item)
    );
    const seen = new Set();
    return tasks.map((item, index) => {
        const toolName = String(item?.name || "").trim();
        const format = toolName === "document.create"
            ? String(item?.args?.format || "").trim().toLowerCase()
            : "";
        const explicitIdentity = taskRequirementIdentity(item);
        const key = explicitIdentity || [toolName, format, String(item?.args?.title || item?.args?.output || index)].join("::");
        if (!toolName || seen.has(key)) return null;
        seen.add(key);
        return {
            id: explicitIdentity || "legacy-" + toolName.replaceAll(".", "-") + "-" + (format || index + 1),
            type: toolName === "document.create" ? "document" : "artifact",
            toolName,
            format,
            label: toolName === "document.create" ? "Documento " + format.toUpperCase() : toolName,
            identityRequired: false,
            legacy: true
        };
    }).filter(Boolean).slice(0, 12);
}

export function marketingFinalResponseFromMission(missionResult = {}) {
    const completed = Array.isArray(missionResult?.completedTasks) ? missionResult.completedTasks : [];
    const marketing = completedMarketingTask(completed);
    if (!marketing) return null;

    const declaredRequirements = normalizedRequirements(marketing);
    const legacyRequirements = declaredRequirements.length === 0
        ? legacyRequirementsFromMission(missionResult)
        : [];
    const requirements = declaredRequirements.length > 0
        ? declaredRequirements
        : legacyRequirements;
    const productionRequested =
        marketing.observation.productionRequested === true ||
        requirements.length > 0;
    const blockedOrPending = [
        ...(Array.isArray(missionResult?.blockedTasks) ? missionResult.blockedTasks : []),
        ...(Array.isArray(missionResult?.pendingTasks) ? missionResult.pendingTasks : [])
    ];
    const unresolved = [];
    const produced = [];

    if (productionRequested && requirements.length === 0) {
        unresolved.push({ label: "ALCANCE DE PRODUCCIÓN", reason: "CONTRATO_DE_ARTEFACTOS_AUSENTE" });
    }

    const consumedFingerprints = new Set();
    for (const requirement of requirements) {
        const completedCandidates = completed.filter(item =>
            taskMatchesRequirement(item, requirement) && artifactOutput(item)
        );
        const completedTask = completedCandidates.find(item => {
            const fingerprint = artifactFingerprint(item);
            return fingerprint && !consumedFingerprints.has(fingerprint);
        }) || null;
        const blockedTask = blockedOrPending.find(item => taskMatchesRequirement(item, requirement));
        const output = completedTask ? artifactOutput(completedTask) : "";
        if (completedTask && output) {
            consumedFingerprints.add(artifactFingerprint(completedTask));
            produced.push({ id: requirement.id, label: requirementLabel(requirement), output });
            continue;
        }
        unresolved.push({
            id: requirement.id,
            label: requirementLabel(requirement),
            reason: blockedTask
                ? "PENDIENTE_O_BLOQUEADO"
                : completedCandidates.length > 0
                    ? "ARTEFACTO_FISICO_DUPLICADO"
                    : "NO_EJECUTADO"
        });
    }

    const otherCompletedArtifacts = completed
        .filter(isMarketingArtifactTask)
        .filter(item => !requirements.some(requirement => taskMatchesRequirement(item, requirement)))
        .map(item => ({ label: String(item.name || "ARTEFACTO").toUpperCase(), output: artifactOutput(item) }))
        .filter(item => item.output);

    const plannedReelLines = renderCompletedReelPlans(completed);
    const artifactLines = productionRequested
        ? unresolved.length
            ? [
                "",
                "## Producción pendiente",
                "El plan estratégico está preparado, pero la entrega de archivos todavía no terminó.",
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
        text: [marketing.observation.userVisible, ...plannedReelLines, ...artifactLines].join("\n"),
        source: "MARKETING_DELIVERABLE_DIRECT",
        productionRequested,
        requiredArtifacts: requirements,
        unresolvedArtifacts: unresolved,
        producedArtifacts: produced
    };
}

export const MARKETING_PLAN_SECTIONS = SECTION_DEFINITIONS.map(([key, heading]) => ({ key, heading }));

export const __test = {
    completedMarketingTask,
    normalizedRequirements,
    taskMatchesRequirement,
    marketingWorkbookSheets
};
