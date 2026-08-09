/*
 * NEXO Mission Compiler V2
 * Añade dependencias de composición, producción integral de marketing y evidencia
 * de medios reales que el mission orchestrator hidrata con observaciones verificadas.
 */

import {
    compileNexoMission as compileBaseMission,
    NEXO_MISSION_COMPILER_VERSION as BASE_VERSION,
    __test as baseTest
} from "./nexo.mission.compiler.js";

export const NEXO_MISSION_COMPILER_VERSION =
    "2.1.0-real-media-evidence-chain";

function copyCall(call = {}) {
    return {
        ...call,
        args: {
            ...(call.args || {})
        }
    };
}

function normalized(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function firstHttpUrl(value = "") {
    const match = String(value || "")
        .match(/https?:\/\/[^\s<>'"`]+/i);
    if (!match) return "";
    return match[0].replace(/[),.;!?]+$/, "");
}

function realMediaRequest(value = "") {
    const instruction = String(value || "");
    const text = normalized(instruction);
    const sourceUrl = firstHttpUrl(instruction);
    const explicitReal = /\b(real|reales|original|originales|autentica|autenticas|autentico|autenticos|verificada|verificadas|verificado|verificados)\b/.test(text);
    const requireImages = /\b(foto|fotos|fotografia|fotografias|imagen|imagenes)\b/.test(text);
    const requireVideos = /\b(video|videos|reel|reels|tiktok|tik tok)\b/.test(text);

    if (!sourceUrl || !explicitReal || (!requireImages && !requireVideos)) {
        return null;
    }

    let url;
    try {
        url = new URL(sourceUrl);
    } catch {
        return null;
    }

    return {
        sourceUrl: url.toString(),
        allowedDomain: url.hostname,
        requireImages,
        requireVideos,
        syntheticMediaSubstitutionAllowed: false,
        sourceBytesRequired: true,
        sha256Required: true
    };
}

function wantsFullMarketingProduction(instruction = "", calls = []) {
    const text = normalized(instruction);
    const hasMarketingPlan = calls.some(call => call?.name === "marketing.plan");
    if (!hasMarketingPlan) return false;

    return /\b(?:marketing|mercadotecnia)\b/.test(text) && (
        /\b(?:completo|completa|integral|integrales)\b/.test(text) ||
        /\bprincipio a fin\b/.test(text) ||
        /\bpunta a punta\b/.test(text) ||
        /\bend[ -]?to[ -]?end\b/.test(text) ||
        /\bllave en mano\b/.test(text) ||
        /\btodo el paquete\b/.test(text)
    );
}

function addUniqueAvailable(target, names, call) {
    if (!call?.name || !names.has(call.name)) return;
    const key = `${call.name}:${JSON.stringify(call.args || {})}`;
    if (target.some(item => `${item.name}:${JSON.stringify(item.args || {})}` === key)) return;
    target.push(call);
}

function fullPackagePresentationSlides(marketingArgs = {}) {
    const brand = String(marketingArgs.brandName || "NEXO").trim();
    const objective = String(marketingArgs.campaignObjective || "Convertir demanda en oportunidades calificadas").trim();
    const audience = String(marketingArgs.audience || "Audiencia prioritaria").trim();
    const offer = String(marketingArgs.offer || "Oferta principal").trim();
    const differentiator = String(marketingArgs.differentiator || "Diferenciador verificable").trim();
    const cta = String(marketingArgs.cta || "Solicitar información").trim();
    return [
        { title: `Plan de marketing — ${brand}`, body: objective },
        { title: "Público y problema", body: `${audience}. ${String(marketingArgs.pain || "").trim()}`.trim() },
        { title: "Oferta y propuesta de valor", body: `${offer}. ${String(marketingArgs.promise || "").trim()}`.trim() },
        { title: "Diferenciador", body: differentiator },
        { title: "Conversión", body: cta }
    ];
}

function augmentFullMarketingProductionChain(calls = [], names = new Set(), instruction = "", context = {}) {
    if (!wantsFullMarketingProduction(instruction, calls)) {
        return {
            calls,
            fullPackage: false
        };
    }

    const marketing = calls.find(call => call?.name === "marketing.plan");
    const marketingArgs = {
        ...(marketing?.args || {})
    };
    const objectiveId = String(context.objectiveId || marketingArgs.objectiveId || "");
    const caseId = String(context.caseId || marketingArgs.caseId || "");
    const brandName = String(marketingArgs.brandName || context.brandName || context.name || "NEXO").trim();
    const reelArgs = typeof baseTest?.reelPayload === "function"
        ? baseTest.reelPayload(instruction, {
            ...context,
            ...marketingArgs,
            brandName
        })
        : null;
    const pageArgs = typeof baseTest?.pagePayload === "function"
        ? baseTest.pagePayload(instruction, {
            ...context,
            ...marketingArgs,
            brandName
        })
        : null;
    const spreadsheetArgs = typeof baseTest?.spreadsheetPayload === "function"
        ? baseTest.spreadsheetPayload(instruction, {
            ...context,
            ...marketingArgs,
            brandName
        })
        : null;
    const imageArgs = typeof baseTest?.argumentsForTool === "function"
        ? baseTest.argumentsForTool("image.generate", instruction, {
            ...context,
            ...marketingArgs,
            brandName
        })
        : null;

    const ordered = calls.map(copyCall);

    if (reelArgs) {
        addUniqueAvailable(ordered, names, {
            name: "reel.plan",
            args: reelArgs,
            reason: "NEXO_COMPLETE_MARKETING_REEL_PLAN"
        });
        addUniqueAvailable(ordered, names, {
            name: "reel.create",
            args: reelArgs,
            reason: "NEXO_COMPLETE_MARKETING_REEL_ARTIFACT"
        });
    }

    if (pageArgs) {
        addUniqueAvailable(ordered, names, {
            name: "page.plan",
            args: pageArgs,
            reason: "NEXO_COMPLETE_MARKETING_LANDING_PLAN"
        });
        addUniqueAvailable(ordered, names, {
            name: "page.create",
            args: pageArgs,
            reason: "NEXO_COMPLETE_MARKETING_LANDING_ARTIFACT"
        });
    }

    if (imageArgs) {
        addUniqueAvailable(ordered, names, {
            name: "image.generate",
            args: imageArgs,
            reason: "NEXO_COMPLETE_MARKETING_CREATIVE_IMAGE"
        });
    }

    if (spreadsheetArgs) {
        addUniqueAvailable(ordered, names, {
            name: "document.create",
            args: {
                ...spreadsheetArgs,
                format: "xlsx",
                title: `Control de marketing — ${brandName}`,
                objectiveId,
                caseId
            },
            reason: "NEXO_COMPLETE_MARKETING_KPI_WORKBOOK"
        });
    }

    addUniqueAvailable(ordered, names, {
        name: "document.create",
        args: {
            format: "pptx",
            title: `Presentación de marketing — ${brandName}`,
            slides: fullPackagePresentationSlides(marketingArgs),
            objectiveId,
            caseId
        },
        reason: "NEXO_COMPLETE_MARKETING_PRESENTATION"
    });

    return {
        calls: ordered,
        fullPackage: true
    };
}

function augmentPageChain(calls = []) {
    const pageCreateIndex = calls.findIndex(call => call.name === "page.create");
    if (pageCreateIndex < 0 || calls.some(call => call.name === "page.compose")) {
        return calls;
    }

    const create = calls[pageCreateIndex];
    const compose = {
        name: "page.compose",
        args: {
            brandName: create.args.brandName,
            title: create.args.title,
            instructions: create.args.prompt || create.args.description || ""
        },
        reason: "NEXO_PAGE_COMPOSITION_BEFORE_ARTIFACT"
    };

    return [
        ...calls.slice(0, pageCreateIndex),
        compose,
        ...calls.slice(pageCreateIndex)
    ];
}

function augmentWordChain(calls = []) {
    const composeIndex = calls.findIndex(call =>
        call.name === "document.compose" &&
        String(call.args?.format || "").toLowerCase() === "docx"
    );
    if (composeIndex < 0) return calls;

    const alreadyCreatesWord = calls.some(call =>
        call.name === "document.create" &&
        String(call.args?.format || "").toLowerCase() === "docx"
    );
    if (alreadyCreatesWord) return calls;

    const compose = calls[composeIndex];
    const create = {
        name: "document.create",
        args: {
            format: "docx",
            title: compose.args.title || "Documento NEXO",
            requireDocumentValidation: true,
            objectiveId: compose.args.objectiveId || "",
            caseId: compose.args.caseId || ""
        },
        reason: "NEXO_DOCX_ARTIFACT_AFTER_VALIDATED_COMPOSITION"
    };

    return [
        ...calls.slice(0, composeIndex + 1),
        create,
        ...calls.slice(composeIndex + 1)
    ];
}

function augmentRealMediaChain(calls = [], names = new Set(), instruction = "", context = {}) {
    const contract = realMediaRequest(instruction);
    if (!contract) {
        return {
            calls,
            contract: null
        };
    }

    const objectiveId = String(context.objectiveId || "");
    const caseId = String(context.caseId || "");
    const filtered = calls.filter(call => {
        if (call.name === "image.generate") return false;
        if (contract.requireVideos && call.name === "reel.create") return false;
        return true;
    });
    const ordered = [];
    const add = call => addUniqueAvailable(ordered, names, call);

    add({
        name: "web.research",
        args: {
            query: `${contract.allowedDomain} servicios y propuesta comercial`,
            researchGoal: "RESEARCH_1",
            allowedDomain: contract.allowedDomain,
            objectiveId,
            caseId
        },
        reason: "NEXO_REAL_MEDIA_PRIMARY_DOMAIN_RESEARCH"
    });
    add({
        name: "web.media.collect",
        args: {
            url: contract.sourceUrl,
            requireImages: contract.requireImages,
            requireVideos: contract.requireVideos,
            maxImages: 12,
            maxVideos: 4,
            allowedHosts: [contract.allowedDomain],
            timeoutMs: 45000,
            objectiveId,
            caseId
        },
        reason: "NEXO_REAL_MEDIA_BYTES_REQUIRED"
    });

    for (const call of filtered) {
        add(call);
    }

    const packageCall = {
        name: "marketing.package.real-media",
        args: {
            sourceUrl: contract.sourceUrl,
            title: `Paquete de marketing con medios reales de ${contract.allowedDomain}`,
            requireImages: contract.requireImages,
            requireVideos: contract.requireVideos,
            objectiveId,
            caseId
        },
        reason: "NEXO_REAL_MEDIA_PACKAGE_AFTER_VERIFIED_BYTES"
    };

    if (names.has(packageCall.name)) {
        const optionalTailNames = new Set(["document.create", "page.plan", "reel.plan"]);
        while (ordered.length >= 12) {
            let dropIndex = -1;
            for (let index = ordered.length - 1; index >= 2; index -= 1) {
                if (optionalTailNames.has(ordered[index]?.name)) {
                    dropIndex = index;
                    break;
                }
            }
            if (dropIndex < 0) break;
            ordered.splice(dropIndex, 1);
        }
        add(packageCall);
    }

    return {
        calls: ordered,
        contract
    };
}

function availableNames(catalog = []) {
    return new Set(
        (Array.isArray(catalog) ? catalog : [])
            .map(tool => String(tool?.name || "").trim())
            .filter(Boolean)
    );
}

export function compileNexoMission(input = {}) {
    const base = compileBaseMission(input);
    if (!base || !Array.isArray(base.toolCalls)) return base;

    const names = availableNames(input.catalog);
    let calls = base.toolCalls.map(copyCall);
    const fullProduction = augmentFullMarketingProductionChain(
        calls,
        names,
        input.input || "",
        input.context || {}
    );
    calls = fullProduction.calls;

    if (names.has("page.compose")) {
        calls = augmentPageChain(calls);
    }
    if (names.has("document.create")) {
        calls = augmentWordChain(calls);
    }

    let realMediaContract = null;
    if (base.status === "NEXO_LOCAL_MISSION_READY") {
        const augmented = augmentRealMediaChain(
            calls,
            names,
            input.input || "",
            input.context || {}
        );
        calls = augmented.calls;
        realMediaContract = augmented.contract;
    }

    const missionPolicy = {
        ...(base?.missionPolicy || {}),
        ...(fullProduction.fullPackage
            ? {
                fullMarketingProductionRequired: true,
                requestedCreativeArtifactsBlockCompletion: true,
                marketingPlanOnlyDoesNotSatisfyFullPackage: true
            }
            : {}),
        ...(realMediaContract
            ? {
                syntheticMediaSubstitutionAllowed: false,
                sourceBytesRequired: true,
                sha256Required: true,
                missingRequestedMediaBlocksCompletion: true
            }
            : {})
    };

    return {
        ...base,
        toolCalls: calls.slice(0, 12),
        ...(fullProduction.fullPackage
            ? {
                fullMarketingProduction: {
                    required: true,
                    artifacts: calls
                        .filter(call => ["document.create", "reel.create", "page.create", "image.generate", "marketing.package.real-media"].includes(call.name))
                        .map(call => ({
                            name: call.name,
                            format: call.args?.format || null,
                            title: call.args?.title || null
                        }))
                }
            }
            : {}),
        ...(realMediaContract ? { realMediaContract } : {}),
        ...(Object.keys(missionPolicy).length ? { missionPolicy } : {}),
        compilerBaseVersion: BASE_VERSION,
        version: NEXO_MISSION_COMPILER_VERSION
    };
}

export const __test = {
    ...baseTest,
    normalized,
    firstHttpUrl,
    realMediaRequest,
    wantsFullMarketingProduction,
    augmentFullMarketingProductionChain,
    augmentPageChain,
    augmentWordChain,
    augmentRealMediaChain
};