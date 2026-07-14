"use strict";

const DEFAULT_MODEL =
    "gemini-2.5-flash";

const MAX_QUERY_LENGTH = 600;
const MAX_SOURCES = 8;
const MAX_SUPPORTS = 24;

function normalizeResearchQuery(value = "") {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_QUERY_LENGTH);
}

function extractGroundingMetadata(response = {}) {
    return response?.candidates?.[0]
        ?.groundingMetadata || {};
}

function extractGroundingSources(response = {}) {
    const metadata =
        extractGroundingMetadata(response);
    const chunks =
        Array.isArray(metadata?.groundingChunks)
            ? metadata.groundingChunks
            : [];
    const seen = new Set();

    return chunks
        .map((chunk, index) => {
            const web = chunk?.web;
            const uri =
                String(web?.uri || "").trim();

            if (
                !uri ||
                !/^https:\/\//i.test(uri) ||
                seen.has(uri)
            ) {
                return null;
            }

            seen.add(uri);

            return {
                id: index + 1,
                title:
                    String(web?.title || "Fuente web")
                        .trim()
                        .slice(0, 180),
                url: uri
            };
        })
        .filter(Boolean)
        .slice(0, MAX_SOURCES);
}

function extractGroundingSupports(response = {}) {
    const metadata =
        extractGroundingMetadata(response);
    const supports =
        Array.isArray(metadata?.groundingSupports)
            ? metadata.groundingSupports
            : [];

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
                        .filter(index =>
                            Number.isInteger(index) &&
                            index >= 0
                        )
                        .map(index => index + 1)
                        .slice(0, 8)
                    : []
        }))
        .filter(support =>
            support.text &&
            support.sourceIds.length > 0
        )
        .slice(0, MAX_SUPPORTS);
}

async function runJarvisWebResearch({
    ai,
    query,
    model = DEFAULT_MODEL
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
    const sources =
        extractGroundingSources(response);
    const supports =
        extractGroundingSupports(response);
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

    return {
        ok:
            Boolean(answer) &&
            sources.length > 0,
        grounded:
            sources.length > 0,
        engine:
            "jarvis_grounded_web_research",
        model,
        query:
            normalizedQuery,
        answer,
        sources,
        supports,
        searchQueries,
        sourceCount:
            sources.length,
        readOnly: true,
        policy: {
            citationsRequired: true,
            codeWrite: false,
            externalSideEffects: false
        }
    };
}

module.exports = {
    DEFAULT_MODEL,
    MAX_QUERY_LENGTH,
    normalizeResearchQuery,
    extractGroundingSources,
    extractGroundingSupports,
    runJarvisWebResearch
};
