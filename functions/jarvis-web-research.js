"use strict";

const DEFAULT_MODEL =
    "gemini-2.5-flash";

const MAX_QUERY_LENGTH = 600;
const MAX_SOURCES = 8;
const MAX_SUPPORTS = 24;

function collapseWhitespace(value = "") {
    let output = "";
    let separating = false;
    for (const character of String(value || "")) {
        if (character.charCodeAt(0) <= 32) {
            separating = Boolean(output);
            continue;
        }
        if (separating && output) output += " ";
        output += character;
        separating = false;
        if (output.length >= MAX_QUERY_LENGTH) break;
    }
    return output.trim();
}

function normalizeResearchQuery(value = "") {
    return collapseWhitespace(value);
}

function extractGroundingMetadata(response = {}) {
    return response?.candidates?.[0]
        ?.groundingMetadata || {};
}

function buildGroundingIndex(response = {}) {
    const metadata =
        extractGroundingMetadata(response);
    const chunks =
        Array.isArray(metadata?.groundingChunks)
            ? metadata.groundingChunks
            : [];
    const sourceIdByUrl = new Map();
    const sourceIdByChunkIndex = new Map();
    const sources = [];
    chunks.forEach((chunk, index) => {
            const web = chunk?.web;
            const uri =
                String(web?.uri || "").trim();
            let valid = false;
            try {
                valid = new URL(uri).protocol === "https:";
            } catch {
                valid = false;
            }
            if (!valid) return;
            let id = sourceIdByUrl.get(uri);
            if (!id && sources.length < MAX_SOURCES) {
                id = sources.length + 1;
                sourceIdByUrl.set(uri, id);
                sources.push({
                id,
                title:
                    String(web?.title || "Fuente web")
                        .trim()
                        .slice(0, 180),
                url: uri
                });
            }
            if (id) sourceIdByChunkIndex.set(index, id);
        });
    return { sources, sourceIdByChunkIndex };
}

function extractGroundingSources(response = {}) {
    return buildGroundingIndex(response).sources;
}

function extractGroundingSupports(response = {}) {
    const metadata =
        extractGroundingMetadata(response);
    const supports =
        Array.isArray(metadata?.groundingSupports)
            ? metadata.groundingSupports
            : [];

    const { sourceIdByChunkIndex } = buildGroundingIndex(response);
    const seen = new Set();
    return supports
        .map(support => ({
            text:
                String(
                    support?.segment?.text ||
                    ""
                )
                    .trim()
                    .slice(0, 320),
            sourceIds:
                Array.isArray(
                    support?.groundingChunkIndices
                )
                    ? support.groundingChunkIndices
                        .filter(index => Number.isInteger(index) && sourceIdByChunkIndex.has(index))
                        .map(index => sourceIdByChunkIndex.get(index))
                        .filter((id, index, ids) => ids.indexOf(id) === index)
                        .slice(0, 8)
                    : []
        }))
        .filter(support => {
            if (!support.text || support.sourceIds.length === 0) return false;
            const key = `${support.text}|${support.sourceIds.join(",")}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, MAX_SUPPORTS);
}

async function runJarvisWebResearch({
    ai,
    query,
    model = DEFAULT_MODEL,
    objectiveId = "",
    caseId = ""
} = {}) {
    if (!ai?.models?.generateContent) {
        throw new Error(
            "JARVIS_WEB_RESEARCH_AI_REQUIRED"
        );
    }

    const normalizedQuery =
        normalizeResearchQuery(query);

    if (normalizedQuery.length < 5) {
        throw new Error(
            "JARVIS_WEB_RESEARCH_QUERY_REQUIRED"
        );
    }

    const response =
        await ai.models.generateContent({
            model,
            contents: [
                "Investiga la solicitud usando Google Search.",
                "Responde en espanol con hechos concretos y separa claramente cualquier incertidumbre.",
                "Distingue hechos consultados de inferencias o recomendaciones del modelo.",
                "No inventes fuentes ni afirmes haber consultado una pagina que no aparezca en groundingMetadata.",
                `Solicitud: ${normalizedQuery}`
            ].join("\n"),
            config: {
                tools: [
                    {
                        googleSearch: {}
                    }
                ],
                temperature: 0.2,
                maxOutputTokens: 1400
            }
        });

    const answer =
        String(response?.text || "")
            .trim()
            .slice(0, 12000);
    const metadata =
        extractGroundingMetadata(response);
    const allSources =
        extractGroundingSources(response);
    const supports =
        extractGroundingSupports(response);
    const relevantSourceIds = new Set(supports.flatMap(support => support.sourceIds));
    const sources = allSources.filter(source => relevantSourceIds.has(source.id));
    const searchQueries =
        Array.isArray(metadata?.webSearchQueries)
            ? metadata.webSearchQueries
                .map(item =>
                    String(item || "")
                        .trim()
                        .slice(0, 240)
                )
                .filter(Boolean)
                .slice(0, 8)
            : [];

    const researchedAt = new Date().toISOString();
    const facts = supports.map((support, index) => ({
        id: index + 1,
        type: "VERIFIED_FACT",
        claim: support.text,
        sourceIds: support.sourceIds
    }));
    const inferences = answer ? [{
        type: "MODEL_SYNTHESIS",
        text: answer,
        basisFactIds: facts.map(fact => fact.id),
        warning: "Síntesis del modelo; verificar contra los hechos y fuentes vinculados."
    }] : [];

    return {
        ok:
            Boolean(answer) &&
            sources.length > 0 &&
            facts.length > 0,
        grounded:
            sources.length > 0 && facts.length > 0,
        engine:
            "jarvis_grounded_web_research",
        model,
        query:
            normalizedQuery,
        objectiveId: String(objectiveId || ""),
        caseId: String(caseId || ""),
        researchedAt,
        provider: "google_search_grounding",
        answer,
        sources,
        supports,
        facts,
        inferences,
        searchQueries,
        sourceCount:
            sources.length,
        readOnly: true,
        policy: {
            citationsRequired: true,
            consultedSourcesOnly: true,
            factsSeparatedFromInference: true,
            duplicatesRemoved: true,
            codeWrite: false,
            externalSideEffects: false
        }
    };
}

module.exports = {
    DEFAULT_MODEL,
    MAX_QUERY_LENGTH,
    collapseWhitespace,
    normalizeResearchQuery,
    extractGroundingSources,
    extractGroundingSupports,
    runJarvisWebResearch
};
