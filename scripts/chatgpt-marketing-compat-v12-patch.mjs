import fs from "node:fs";

function patchFile(path, mutate) {
    const before = fs.readFileSync(path, "utf8");
    const after = mutate(before);
    if (after === before) throw new Error(`NO_PATCH_DELTA:${path}`);
    fs.writeFileSync(path, after, "utf8");
}

function replaceOnce(source, before, after, label) {
    const index = source.indexOf(before);
    if (index < 0) throw new Error(`PATCH_MARKER_NOT_FOUND:${label}`);
    if (source.indexOf(before, index + before.length) >= 0) throw new Error(`PATCH_MARKER_NOT_UNIQUE:${label}`);
    return source.slice(0, index) + after + source.slice(index + before.length);
}

patchFile("gestia-core/jarvis/jarvis.marketing.presenter.js", source => {
    source = replaceOnce(
        source,
        `    const requirement = matchingMarketingRequirement(marketing, requestedArgs);\n    const explicitlyMarketing = requestedArgs?.contentSource === "marketing.plan";\n    if (!requirement && !explicitlyMarketing) return null;`,
        `    const requirement = matchingMarketingRequirement(marketing, requestedArgs);\n    const explicitlyMarketing = requestedArgs?.contentSource === "marketing.plan";\n    const declaredRequirements = normalizedRequirements(marketing);\n    if (!requirement && !explicitlyMarketing && declaredRequirements.length > 0) return null;`,
        "presenter-legacy-hydration"
    );

    source = replaceOnce(
        source,
        `function taskMatchesRequirement(item = {}, requirement = {}) {\n    if (String(item?.name || "") !== requirement.toolName) return false;\n    if (requirement.toolName === "document.create") {\n        const format = String(requirement.format || "").toLowerCase();\n        if (format && String(item?.args?.format || "").toLowerCase() !== format) return false;\n        if (["md", "pdf", "xlsx"].includes(format) && item?.args?.contentSource !== "marketing.plan") return false;\n    }`,
        `function taskMatchesRequirement(item = {}, requirement = {}) {\n    if (String(item?.name || "") !== requirement.toolName) return false;\n    if (requirement.toolName === "document.create") {\n        const format = String(requirement.format || "").toLowerCase();\n        if (format && String(item?.args?.format || "").toLowerCase() !== format) return false;\n        if (requirement.legacy !== true && ["md", "pdf", "xlsx"].includes(format) && item?.args?.contentSource !== "marketing.plan") return false;\n    }`,
        "presenter-legacy-task-match"
    );

    const finalMarker = `export function marketingFinalResponseFromMission(missionResult = {}) {`;
    const legacyHelper = `function legacyRequirementsFromMission(missionResult = {}) {\n    const tasks = [\n        ...(Array.isArray(missionResult?.completedTasks) ? missionResult.completedTasks : []),\n        ...(Array.isArray(missionResult?.blockedTasks) ? missionResult.blockedTasks : []),\n        ...(Array.isArray(missionResult?.pendingTasks) ? missionResult.pendingTasks : [])\n    ].filter(item => isMarketingArtifactTask(item));\n    const seen = new Set();\n    return tasks.map((item, index) => {\n        const toolName = String(item?.name || "").trim();\n        const format = toolName === "document.create"\n            ? String(item?.args?.format || "").trim().toLowerCase()\n            : "";\n        const explicitIdentity = taskRequirementIdentity(item);\n        const key = explicitIdentity || [toolName, format, String(item?.args?.title || item?.args?.output || index)].join("::");\n        if (!toolName || seen.has(key)) return null;\n        seen.add(key);\n        return {\n            id: explicitIdentity || "legacy-" + toolName.replaceAll(".", "-") + "-" + (format || index + 1),\n            type: toolName === "document.create" ? "document" : "artifact",\n            toolName,\n            format,\n            label: toolName === "document.create" ? "Documento " + format.toUpperCase() : toolName,\n            identityRequired: false,\n            legacy: true\n        };\n    }).filter(Boolean).slice(0, 12);\n}\n\n`;
    source = replaceOnce(source, finalMarker, legacyHelper + finalMarker, "presenter-legacy-requirements-helper");

    source = replaceOnce(
        source,
        `    const productionRequested = marketing.observation.productionRequested === true;\n    const requirements = normalizedRequirements(marketing);\n    const blockedOrPending = [`,
        `    const declaredRequirements = normalizedRequirements(marketing);\n    const legacyRequirements = declaredRequirements.length === 0\n        ? legacyRequirementsFromMission(missionResult)\n        : [];\n    const requirements = declaredRequirements.length > 0\n        ? declaredRequirements\n        : legacyRequirements;\n    const productionRequested =\n        marketing.observation.productionRequested === true ||\n        requirements.length > 0;\n    const blockedOrPending = [`,
        "presenter-production-request-fallback"
    );

    source = source.replace(
        `                "El plan estratégico está preparado, pero la misión de producción todavía no está completa.",`,
        `                "El plan estratégico está preparado, pero la entrega de archivos todavía no terminó.",`
    );
    return source;
});

patchFile("functions/jarvis-semantic-planner.js", source => {
    const oldLine = `        "Para marketing.plan completa brandName, audience, offer, pain, promise, differentiator, cta, channels y assets. Pain, promise y differentiator deben ser propuestas estrategicas sustentadas, no hechos inventados.",`;
    const newLines = `${oldLine}\n        "Para marketing.plan completa tambien market, campaignObjective, horizon, tone y metrics. Si el usuario pide producir archivos o medios reales, productionRequested=true y productionArtifacts debe enumerar UNO POR UNO todos los entregables fisicos solicitados con id unico, type, toolName, format cuando aplique y label. No colapses tres variantes sociales en una sola imagen. MD, PDF y XLSX son requisitos document.create separados; cada pieza social es un requisito visual separado; cada reel es reel.create separado.",\n        "productionArtifacts es el contrato fisico de marketing: no inventes entregables que el usuario no pidio y no omitas ninguno que si pidio. La ejecucion posterior puede convertir piezas sociales de image.generate a image.edit cuando existan medios reales verificados, sin cambiar su id contractual.",`;
    source = replaceOnce(source, oldLine, newLines, "semantic-marketing-physical-contract");

    const contractLine = `                    "Para cada artefacto solicita exactamente una composicion y una creacion; no dupliques variantes del mismo entregable salvo que el usuario pida varias.",`;
    const contractNew = `${contractLine}\n                    "Si el objetivo es una produccion de marketing, marketing.plan es la autoridad contractual: incluye productionRequested=true y en productionArtifacts declara cada salida fisica pedida con id estable y unico. Si el usuario pide tres piezas sociales, deben existir tres objetos distintos aunque usen la misma herramienta; no uses una sola pieza para representar varias plataformas.",`;
    source = replaceOnce(source, contractLine, contractNew, "semantic-mission-contract-marketing-artifacts");

    return source.replace(
        `const VERSION = "1.22.0-mission-isolation";`,
        `const VERSION = "1.23.0-marketing-physical-contract-v12";`
    );
});

patchFile("gestia-core/nexo/nexo.real-media.tools.js", source => {
    const oldSchema = `        productionArtifacts: { type: "array", items: { type: "string" } },`;
    const newSchema = `        productionArtifacts: {\n            type: "array",\n            items: {\n                type: "object",\n                required: ["id", "type", "toolName"],\n                properties: {\n                    id: { type: "string" },\n                    type: { type: "string" },\n                    toolName: { type: "string" },\n                    format: { type: "string" },\n                    label: { type: "string" }\n                },\n                additionalProperties: false\n            }\n        },`;
    source = replaceOnce(source, oldSchema, newSchema, "nexo-marketing-production-artifact-schema");
    return source.replace(
        `"1.7.0-local-speech-v137"`,
        `"1.8.0-marketing-physical-contract-v12"`
    );
});

console.log("CHATGPT_MARKETING_COMPAT_V12_PATCH_APPLIED=true");
