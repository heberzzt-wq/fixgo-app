/*
 * NEXO Mission Compiler V2
 * Añade dependencias de composición y evidencia de medios reales que el mission
 * orchestrator hidrata con observaciones verificadas.
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
    const add = call => {
        if (!names.has(call.name)) return;
        const key = `${call.name}:${JSON.stringify(call.args || {})}`;
        if (ordered.some(item => `${item.name}:${JSON.stringify(item.args || {})}` === key)) return;
        ordered.push(call);
    };

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

    add({
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
    });

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

    return {
        ...base,
        toolCalls: calls.slice(0, 12),
        ...(realMediaContract
            ? {
                realMediaContract,
                missionPolicy: {
                    syntheticMediaSubstitutionAllowed: false,
                    sourceBytesRequired: true,
                    sha256Required: true,
                    missingRequestedMediaBlocksCompletion: true
                }
            }
            : {}),
        compilerBaseVersion: BASE_VERSION,
        version: NEXO_MISSION_COMPILER_VERSION
    };
}

export const __test = {
    ...baseTest,
    normalized,
    firstHttpUrl,
    realMediaRequest,
    augmentPageChain,
    augmentWordChain,
    augmentRealMediaChain
};
