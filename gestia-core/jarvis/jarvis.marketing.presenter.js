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
        return value.flatMap((item, index) => {
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
        ])
    ].join("\n").trim();
}

export function marketingFinalResponseFromMission(missionResult = {}) {
    const completed = Array.isArray(missionResult?.completedTasks)
        ? missionResult.completedTasks
        : [];
    const marketing = [...completed].reverse().find(item =>
        item?.name === "marketing.plan" &&
        item?.observation?.status === "MARKETING_PACKAGE_READY" &&
        typeof item?.observation?.userVisible === "string" &&
        item.observation.userVisible.trim()
    );
    if (!marketing) return null;
    return {
        ok: marketing.observation.objectiveSatisfied === true,
        title: "Plan de marketing completo",
        text: marketing.observation.userVisible,
        source: "MARKETING_DELIVERABLE_DIRECT"
    };
}

export const MARKETING_PLAN_SECTIONS = SECTION_DEFINITIONS.map(([key, heading]) => ({ key, heading }));
