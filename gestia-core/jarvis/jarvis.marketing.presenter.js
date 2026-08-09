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
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return "";
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
            const rendered = lines(item, depth + 1);
            if (rendered.length === 0) return [];
            const label = key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
            return [`- ${label}: ${rendered[0]}`, ...rendered.slice(1).map(line => `  ${line}`)];
        });
    }
    return [];
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

function renderCreativeProduction(result = {}) {
    const video = result?.videoPackage;
    const deliverables = Array.isArray(result?.deliverables) ? result.deliverables : [];
    const copies = Array.isArray(result?.copies) ? result.copies : [];
    if (!video && deliverables.length === 0 && copies.length === 0) return [];

    const output = [
        "## Producción creativa incluida",
        "El paquete no termina en la estrategia: deja especificados los activos que deben producirse y su contrato de entrega.",
        ""
    ];

    if (video) {
        const width = video?.dimensions?.width || 1080;
        const height = video?.dimensions?.height || 1920;
        output.push(
            "### Reel vertical",
            `- Duración objetivo: ${video.durationSeconds || 30} segundos`,
            `- Formato: ${video.aspectRatio || "9:16"} (${width}×${height})`,
            `- Subtítulos: ${video?.subtitles?.required === true ? "obligatorios" : "opcionales"}`,
            `- Exportación: ${video?.export?.webm === true ? "WebM verificable" : "preview"}`,
            "- Storyboard y texto en pantalla:"
        );
        for (const scene of Array.isArray(video.storyboard) ? video.storyboard : []) {
            output.push(
                `  - Escena ${scene.scene || ""} (${scene.range || "duración definida"} s): ${scene.purpose || "escena"} — ${scene.overlay || ""}`.trim()
            );
        }
        output.push("");
    }

    if (copies.length) {
        output.push("### Copys listos para producción");
        for (const copy of copies.slice(0, 8)) {
            output.push(`- ${copy.channel || "canal"}: ${copy.hook || ""} ${copy.body || ""} CTA: ${copy.cta || ""}`.trim());
        }
        output.push("");
    }

    if (deliverables.length) {
        output.push("### Entregables previstos");
        for (const item of deliverables) {
            const sizes = Array.isArray(item.dimensions)
                ? item.dimensions
                    .map(size => size.aspectRatio || `${size.width}×${size.height}`)
                    .filter(Boolean)
                    .join(", ")
                : "";
            output.push(
                `- ${item.type || "activo"}: ${item.format || "formato de producción"}${sizes ? ` — ${sizes}` : ""}`
            );
        }
        output.push("");
    }

    output.push(
        "### Regla de evidencia",
        "Los conceptos creativos pueden proponerse, pero los hechos, cifras, testimonios, resultados y atributos verificables sólo deben publicarse cuando estén respaldados por la evidencia suministrada o verificada."
    );
    return output;
}

export function renderCompleteMarketingPlan(result = {}) {
    if (result?.status !== "MARKETING_PACKAGE_READY" || !hasCompleteMarketingPlan(result?.plan)) {
        return "";
    }
    const brand = result?.brand?.name || result?.campaign?.name || "el negocio";
    return [
        `# Plan de marketing completo — ${brand}`,
        "",
        ...SECTION_DEFINITIONS.flatMap(([key, heading]) => [
            `## ${heading}`,
            ...lines(result.plan[key]),
            ""
        ]),
        ...renderCreativeProduction(result)
    ].join("\n").trim();
}

function isMarketingDocumentTask(item = {}) {
    return item?.name === "document.create" && (
        /plan de marketing completo/i.test(String(item?.args?.title || "")) ||
        /(?:control|presentaci[oó]n) de marketing/i.test(String(item?.args?.title || ""))
    );
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
        item?.observation?.objectiveSatisfied === true &&
        typeof item?.observation?.userVisible === "string" &&
        item.observation.userVisible.trim()
    ) || null;
}

export function marketingArtifactArgsFromCompletedTasks(completedTasks = [], requestedArgs = {}) {
    const format = String(requestedArgs?.format || "").trim().toLowerCase();
    const title = String(requestedArgs?.title || "").trim();
    if (!["md", "pdf"].includes(format) || !/plan de marketing completo/i.test(title)) return null;
    const marketing = completedMarketingTask(completedTasks);
    if (!marketing) return null;
    return {
        ...(requestedArgs || {}),
        format,
        title,
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

function artifactLabel(item = {}) {
    if (item?.name === "document.create") {
        return String(item?.args?.format || "archivo").toUpperCase();
    }
    if (item?.name === "reel.create") return "REEL 9:16";
    if (item?.name === "page.create") return "LANDING HTML";
    if (item?.name === "image.generate") return "IMAGEN PUBLICITARIA";
    if (item?.name === "marketing.package.real-media") return "PAQUETE DE MEDIOS REALES";
    return String(item?.name || "ARTEFACTO").toUpperCase();
}

export function marketingFinalResponseFromMission(missionResult = {}) {
    const completed = Array.isArray(missionResult?.completedTasks) ? missionResult.completedTasks : [];
    const marketing = completedMarketingTask(completed);
    if (!marketing) return null;

    const completedArtifacts = completed.filter(isMarketingArtifactTask);
    const unresolvedQueued = [
        ...(Array.isArray(missionResult?.blockedTasks) ? missionResult.blockedTasks : []),
        ...(Array.isArray(missionResult?.pendingTasks) ? missionResult.pendingTasks : [])
    ].filter(isMarketingArtifactTask);
    const completedWithoutArtifact = completedArtifacts.filter(item => !artifactOutput(item));
    const unresolvedArtifacts = [...unresolvedQueued, ...completedWithoutArtifact];
    const outputs = completedArtifacts
        .map(item => ({
            label: artifactLabel(item),
            output: artifactOutput(item)
        }))
        .filter(item => item.output);
    const artifactLines = unresolvedArtifacts.length
        ? [
            "",
            "## Entregables de producción",
            "El plan está completo, pero la entrega de archivos todavía no terminó.",
            `Pendientes: ${[...new Set(unresolvedArtifacts.map(artifactLabel))].join(", ")}.`,
            "No se declara el paquete de marketing como producido de punta a punta hasta que esos artefactos existan y puedan abrirse o descargarse."
        ]
        : outputs.length
            ? [
                "",
                "## Entregables de producción",
                ...outputs.map(item => `- ${item.label}: ${item.output}`)
            ]
            : [];
    return {
        ok: marketing.observation.objectiveSatisfied === true && unresolvedArtifacts.length === 0,
        title: "Plan de marketing completo",
        text: [marketing.observation.userVisible, ...artifactLines].join("\n"),
        source: "MARKETING_DELIVERABLE_DIRECT"
    };
}

export const MARKETING_PLAN_SECTIONS = SECTION_DEFINITIONS.map(([key, heading]) => ({ key, heading }));