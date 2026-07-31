/*
 * NEXO Mission Compiler V2
 * Añade dependencias de composición que el mission orchestrator hidrata con evidencia.
 */

import {
    compileNexoMission as compileBaseMission,
    NEXO_MISSION_COMPILER_VERSION as BASE_VERSION,
    __test as baseTest
} from "./nexo.mission.compiler.js";

export const NEXO_MISSION_COMPILER_VERSION =
    "2.0.0-composition-to-artifact-chain";

function copyCall(call = {}) {
    return {
        ...call,
        args: {
            ...(call.args || {})
        }
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

    return {
        ...base,
        toolCalls: calls.slice(0, 12),
        compilerBaseVersion: BASE_VERSION,
        version: NEXO_MISSION_COMPILER_VERSION
    };
}

export const __test = {
    ...baseTest,
    augmentPageChain,
    augmentWordChain
};
