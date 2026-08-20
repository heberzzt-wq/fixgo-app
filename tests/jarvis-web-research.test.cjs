"use strict";

const assert =
    require("node:assert/strict");
const fs =
    require("node:fs");
const path =
    require("node:path");
const { test } =
    require("node:test");

const {
    normalizeResearchQuery,
    lexicalTokens,
    requestedDomainFromQuery,
    requestedHostsFromQuery,
    sourceMatchesDomain,
    sourceMatchesExactEntity,
    extractRankedHtmlLinks,
    researchLinkRelevance,
    extractGroundingSources,
    extractGroundingSupports,
    runJarvisDirectDomainResearch,
    runJarvisWebResearch
} = require(
    "../functions/jarvis-web-research"
);

function groundedResponse() {
    return {
        text:
            "La funcion jarvisWebResearch esta desplegada y usa fuentes verificables.",
        candidates: [
            {
                groundingMetadata: {
                    webSearchQueries: [
                        "Firebase callable functions documentation"
                    ],
                    groundingChunks: [
                        {
                            web: {
                                uri: "https://firebase.google.com/docs/functions/callable",
                                title: "Firebase callable functions"
                            }
                        },
                        {
                            web: {
                                uri: "http://insecure.example.com",
                                title: "Insecure source"
                            }
                        },
                        {
                            web: {
                                uri: "https://firebase.google.com/docs/functions/callable",
                                title: "Duplicate"
                            }
                        }
                    ],
                    groundingSupports: [
                        {
                            segment: {
                                text: "La funcion jarvisWebResearch esta desplegada"
                            },
                            groundingChunkIndices: [
                                0
                            ]
                        }
                    ]
                }
            }
        ]
    };
}

test("grounded web research keeps bounded HTTPS sources and citation supports", () => {
    const response =
        groundedResponse();
    const sources =
        extractGroundingSources(response);
    const supports =
        extractGroundingSupports(response);

    assert.deepEqual(sources, [
        {
            id: 1,
            title:
                "Firebase callable functions",
            url:
                "https://firebase.google.com/docs/functions/callable"
        }
    ]);
    assert.deepEqual(supports, [
        {
            text:
                "La funcion jarvisWebResearch esta desplegada",
            sourceIds: [
                1
            ]
        }
    ]);
});

test("grounded web research sends Google Search configuration and returns evidence", async () => {
    let request = null;
    const ai = {
        models: {
            async generateContent(value) {
                request = value;
                return groundedResponse();
            }
        }
    };

    const result =
        await runJarvisWebResearch({
            ai,
            query:
                "  Investiga   Firebase callable functions  ",
            objectiveId: "OBJ-WEB-1",
            caseId: "CASE-WEB-1"
        });

    assert.equal(
        request.model,
        "gemini-2.5-flash"
    );
    assert.deepEqual(
        request.config.tools,
        [
            {
                googleSearch: {}
            }
        ]
    );
    assert.equal(
        normalizeResearchQuery(
            "  Investiga   Firebase callable functions  "
        ),
        "Investiga Firebase callable functions"
    );
    assert.equal(result.ok, true);
    assert.equal(result.grounded, true);
    assert.equal(result.sourceCount, 1);
    assert.equal(result.facts.length, 1);
    assert.equal(result.facts[0].type, "VERIFIED_FACT");
    assert.equal(result.inferences[0].type, "MODEL_SYNTHESIS");
    assert.equal(result.objectiveId, "OBJ-WEB-1");
    assert.equal(result.caseId, "CASE-WEB-1");
    assert.ok(Date.parse(result.researchedAt));
    assert.equal(result.policy.consultedSourcesOnly, true);
    assert.equal(result.policy.factsSeparatedFromInference, true);
    assert.equal(result.readOnly, true);
    assert.equal(result.policy.citationsRequired, true);
    assert.equal(result.policy.externalSideEffects, false);
});

test("grounding maps duplicate chunks to one canonical source id", () => {
    const response = groundedResponse();
    response.candidates[0].groundingMetadata.groundingSupports.push({
        segment: { text: "La documentación oficial describe funciones callable" },
        groundingChunkIndices: [2]
    });
    const sources = extractGroundingSources(response);
    const supports = extractGroundingSupports(response);
    assert.equal(sources.length, 1);
    assert.deepEqual(supports[1].sourceIds, [1]);
});

test("web research fails closed when no verifiable source is returned", async () => {
    const ai = {
        models: {
            async generateContent() {
                return {
                    text:
                        "Respuesta sin evidencia",
                    candidates: [
                        {
                            groundingMetadata: {
                                groundingChunks: []
                            }
                        }
                    ]
                };
            }
        }
    };

    const result =
        await runJarvisWebResearch({
            ai,
            query:
                "Busca informacion actual"
        });

    assert.equal(result.ok, false);
    assert.equal(result.grounded, false);
    assert.deepEqual(result.sources, []);
});

test("web research enforces the requested domain and discards similar companies", async () => {
    const response = {
        text: "SUMM publica servicios. Otra empresa publica productos distintos.",
        candidates: [{
            groundingMetadata: {
                groundingChunks: [
                    { web: { uri: "https://www.summ.com.mx/servicios", title: "SUMM servicios" } },
                    { web: { uri: "https://summma.com/", title: "Empresa distinta" } },
                    { web: { uri: "https://summ.com/about", title: "Dominio distinto" } },
                    { web: { uri: "https://sumexpress.mx/", title: "Empresa distinta MX" } }
                ],
                groundingSupports: [
                    { segment: { text: "SUMM publica sus servicios" }, groundingChunkIndices: [0] },
                    { segment: { text: "Otra empresa publica productos" }, groundingChunkIndices: [1, 2, 3] }
                ],
                webSearchQueries: ["site:summ.com.mx SUMM"]
            }
        }]
    };
    let request;
    const result = await runJarvisWebResearch({
        ai: { models: { generateContent: async value => { request = value; return response; } } },
        query: "Investiga https://www.summ.com.mx/ para una campana"
    });
    assert.equal(requestedDomainFromQuery("Investiga https://www.summ.com.mx/ para una campana"), "summ.com.mx");
    assert.equal(sourceMatchesDomain({ url: "https://blog.summ.com.mx/post" }, "summ.com.mx"), true);
    assert.ok(request.contents.includes("site:summ.com.mx"));
    assert.deepEqual(result.sources.map(source => source.url), ["https://www.summ.com.mx/servicios"]);
    assert.equal(result.discardedSources.length, 3);
    assert.equal(result.facts.length, 1);
    assert.equal(result.answer, "SUMM publica sus servicios");
    assert.equal(result.inferences.length, 0);
    assert.equal(result.policy.modelSynthesisFiltered, true);
    assert.equal(result.requestedDomain, "summ.com.mx");
    assert.equal(result.policy.requestedDomainEnforced, true);
});

test("exact entity research discards similarly named companies instead of attributing their facts", async () => {
    const response = {
        text:
            "Resultados de empresas con nombres parecidos.",
        candidates: [{
            groundingMetadata: {
                groundingChunks: [
                    {
                        web: {
                            uri:
                                "https://gasolinamexico.com.mx/multiservicio-peninsular",
                            title:
                                "MULTISERVICIO PENINSULAR SA DE CV"
                        }
                    },
                    {
                        web: {
                            uri:
                                "https://multiservicioshym.com/",
                            title:
                                "Multiservicios H&M"
                        }
                    },
                    {
                        web: {
                            uri:
                                "https://peninsularmep.com.mx/",
                            title:
                                "Grupo Peninsular MEP"
                        }
                    }
                ],
                groundingSupports: [
                    {
                        segment: {
                            text:
                                "Una gasolinera tiene un permiso."
                        },
                        groundingChunkIndices: [
                            0
                        ]
                    },
                    {
                        segment: {
                            text:
                                "Otra empresa repara equipos."
                        },
                        groundingChunkIndices: [
                            1,
                            2
                        ]
                    }
                ]
            }
        }]
    };
    const result =
        await runJarvisWebResearch({
            ai: {
                models: {
                    generateContent:
                        async () => response
                }
            },
            query:
                "Multiservicios Peninsulares HMH",
            exactEntity:
                "Multiservicios Peninsulares HMH"
        });

    assert.deepEqual(
        lexicalTokens(
            "Multiservicios Peninsulares HMH"
        ),
        [
            "multiservicios",
            "peninsulares",
            "hmh"
        ]
    );
    assert.equal(
        sourceMatchesExactEntity(
            response.candidates[0]
                .groundingMetadata
                .groundingChunks[0]
                .web,
            "Multiservicios Peninsulares HMH"
        ),
        false
    );
    assert.equal(
        result.status,
        "ENTITY_NOT_VERIFIED"
    );
    assert.equal(result.ok, true);
    assert.equal(result.grounded, false);
    assert.equal(
        result.entityVerification.verified,
        false
    );
    assert.equal(result.sources.length, 0);
    assert.equal(
        result.discardedSources.length,
        3
    );
    assert.equal(result.facts.length, 0);
    assert.match(
        result.answer,
        /No pude verificar la identidad exacta/
    );
    assert.equal(
        result.policy.similarEntitiesDiscarded,
        true
    );
});

test("web research validates Google grounding redirects with their domain attribution", async () => {
    const response = {
        text: "Summit Law Firm ofrece servicios jurídicos en Cancún.",
        candidates: [{
            groundingMetadata: {
                groundingChunks: [
                    {
                        web: {
                            uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/summ-source",
                            title: "www.summ.com.mx"
                        }
                    },
                    {
                        web: {
                            uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/similar-source",
                            title: "summma.com"
                        }
                    }
                ],
                groundingSupports: [
                    {
                        segment: {
                            text: "Summit Law Firm ofrece servicios jurídicos en Cancún."
                        },
                        groundingChunkIndices: [0]
                    },
                    {
                        segment: {
                            text: "Una empresa distinta ofrece productos."
                        },
                        groundingChunkIndices: [1]
                    }
                ],
                webSearchQueries: [
                    "site:summ.com.mx Summit Law Firm"
                ]
            }
        }]
    };
    const result = await runJarvisWebResearch({
        ai: {
            models: {
                generateContent:
                    async () => response
            }
        },
        query:
            "Investiga https://www.summ.com.mx/"
    });

    assert.equal(result.grounded, true);
    assert.equal(result.sources.length, 1);
    assert.equal(
        result.sources[0].title,
        "www.summ.com.mx"
    );
    assert.equal(result.discardedSources.length, 1);
    assert.equal(result.facts.length, 1);
});

test("direct domain fallback crawls only primary pages when Gemini credentials fail", async () => {
    const pages = new Map([
        ["https://www.summ.com.mx/", `
            <html><head><title>SUMM oficial</title></head><body>
            <h1>Soluciones integrales de mantenimiento</h1>
            <p>SUMM presenta servicios empresariales de mantenimiento y atención para instalaciones.</p>
            <a href="/servicios">Servicios</a>
            <a href="https://summma.com/empresa">Empresa parecida</a>
            </body></html>
        `],
        ["https://www.summ.com.mx/servicios", `
            <html><head><title>Servicios SUMM</title></head><body>
            <h1>Servicios especializados</h1>
            <p>La página oficial describe atención preventiva, correctiva y soporte para clientes empresariales.</p>
            </body></html>
        `]
    ]);
    const fetched = [];
    const result = await runJarvisDirectDomainResearch({
        query: "Investiga únicamente https://www.summ.com.mx/",
        fetchImpl: async url => {
            const normalized = String(url);
            fetched.push(normalized);
            const html = pages.get(normalized);
            return {
                ok: Boolean(html),
                url: normalized,
                headers: { get: name => name === "content-type" ? "text/html; charset=utf-8" : "" },
                text: async () => html || ""
            };
        }
    });

    assert.equal(result.provider, "direct_primary_domain_crawl");
    assert.equal(result.grounded, true);
    assert.equal(fetched[0], "https://www.summ.com.mx/");
    assert.deepEqual(
        requestedHostsFromQuery(
            "Investiga únicamente https://www.summ.com.mx/",
            "summ.com.mx"
        ).slice(0, 2),
        ["www.summ.com.mx", "summ.com.mx"]
    );
    assert.equal(result.sources.length, 2);
    assert.ok(result.sources.every(source => new URL(source.url).hostname === "www.summ.com.mx"));
    assert.equal(result.discardedSources.length, 0);
    assert.equal(result.inferences.length, 0);
    assert.equal(result.policy.fallbackReason, "GEMINI_CREDENTIAL_UNAVAILABLE");
});

test("direct domain fallback prioritizes claim-specific official pages over generic navigation", async () => {
    const rootUrl =
        "https://firebase.google.com/";
    const relevantUrl =
        "https://firebase.google.com/docs/auth/admin/custom-claims";
    const genericLinks =
        Array.from(
            {
                length: 30
            },
            (_, index) =>
                `<a href="/products/generic-${index}">Producto ${index}</a>`
        )
            .join("\n");
    const pages =
        new Map([
            [
                rootUrl,
                `
                    <html>
                        <head><title>Firebase</title></head>
                        <body>
                            <h1>Firebase</h1>
                            <p>Plataforma oficial para crear y operar aplicaciones modernas con servicios administrados.</p>
                            ${genericLinks}
                            <a href="/docs/auth/admin/custom-claims">Control de acceso con custom claims</a>
                        </body>
                    </html>
                `
            ],
            [
                relevantUrl,
                `
                    <html>
                        <head><title>Control Access with Custom Claims</title></head>
                        <body>
                            <h1>Define roles via Firebase Auth custom claims</h1>
                            <p>La documentacion oficial explica como aplicar control de acceso basado en roles mediante custom claims.</p>
                        </body>
                    </html>
                `
            ]
        ]);
    const fetched =
        [];
    const result =
        await runJarvisDirectDomainResearch({
            query:
                "Firebase Auth custom claims control de acceso por roles",
            allowedDomain:
                "firebase.google.com",
            maximumPages:
                2,
            fetchImpl:
                async url => {
                    const normalized =
                        String(url);
                    fetched.push(
                        normalized
                    );
                    const html =
                        pages.get(
                            normalized
                        );
                    return {
                        ok:
                            Boolean(html),
                        url:
                            normalized,
                        headers: {
                            get:
                                name =>
                                    name ===
                                    "content-type"
                                        ? "text/html; charset=utf-8"
                                        : ""
                        },
                        text:
                            async () =>
                                html ||
                                ""
                    };
                }
        });
    const ranked =
        extractRankedHtmlLinks(
            pages.get(rootUrl),
            rootUrl,
            "firebase.google.com",
            "Firebase Auth custom claims control de acceso por roles"
        );

    assert.equal(
        fetched[0],
        rootUrl
    );
    assert.equal(
        fetched[1],
        relevantUrl
    );
    assert.equal(
        ranked[0].url,
        relevantUrl
    );
    assert.ok(
        researchLinkRelevance(
            ranked[0],
            "Firebase Auth custom claims control de acceso por roles"
        ) >
        researchLinkRelevance(
            {
                url:
                    "https://firebase.google.com/products/generic-1",
                label:
                    "Producto 1"
            },
            "Firebase Auth custom claims control de acceso por roles"
        )
    );
    assert.deepEqual(
        result.sources.map(
            source =>
                source.url
        ),
        [
            rootUrl,
            relevantUrl
        ]
    );
});

test("Firebase deploys grounded web research on the supported Node runtime", () => {
    const root =
        path.join(__dirname, "..");
    const functionsIndex =
        fs.readFileSync(
            path.join(root, "functions", "index.js"),
            "utf8"
        );
    const functionsPackage =
        JSON.parse(
            fs.readFileSync(
                path.join(root, "functions", "package.json"),
                "utf8"
            )
        );
    const workflow =
        fs.readFileSync(
            path.join(root, ".github", "workflows", "deploy.yml"),
            "utf8"
        );
    const webStart =
        functionsIndex.indexOf(
            "exports.jarvisWebResearch"
        );
    const nextSection =
        functionsIndex.indexOf(
            "exports.despachoTaticoB2B",
            webStart
        );
    const webSection =
        functionsIndex.slice(
            webStart,
            nextSection > webStart
                ? nextSection
                : undefined
        );

    assert.ok(webStart >= 0);
    assert.match(functionsIndex, /const \{ GoogleGenAI \} = require\("@google\/genai"\)/);
    assert.match(functionsIndex, /process\.env\.GEMINI_API_KEY/);
    assert.match(functionsIndex, /functions\.config\?\.\(\)/);
    assert.match(functionsIndex, /runtimeConfig\?\.gemini\?\.api_key/);
    assert.match(webSection, /runJarvisWebResearch\(\{/);
    assert.match(webSection, /PRIMARY_RESEARCH_NOT_GROUNDED/);
    assert.match(webSection, /requestedDomainFromQuery/);
    assert.match(webSection, /runJarvisDirectDomainResearch\(\{/);
    assert.match(webSection, /assertJarvisAdminContext/);
    assert.doesNotMatch(webSection, /initCore\(\)/);
    assert.equal(functionsPackage.engines.node, "22");
    assert.ok(functionsPackage.dependencies["@google/genai"]);
    assert.match(workflow, /node-version:\s*22/);
    assert.match(workflow, /functions:jarvisWebResearch/);
    assert.match(
        functionsIndex,
        /exports\.jarvisWebResearch[\s\S]{0,240}secrets:\s*\["GEMINI_KEY"\]/
    );
    assert.match(workflow, /fetch-depth:\s*0/);
    assert.match(workflow, /group:\s*deploy-gestia-\$\{\{ github\.ref \}\}/);
    assert.match(workflow, /cancel-in-progress:\s*true/);
    assert.match(workflow, /before="\$\{\{ github\.event\.before \}\}"/);
    assert.match(workflow, /id:\s*changes/);
    assert.match(workflow, /functions_changed=true/);
    assert.match(workflow, /Install functions dependencies\s*\n\s*run:\s*npm ci --prefix functions/);
    assert.match(workflow, /Deploy Hosting[\s\S]{0,160}?if:\s*steps\.changes\.outputs\.hosting_changed == 'true'[\s\S]{0,200}?run:\s*firebase deploy --only hosting/);
    assert.match(workflow, /Deploy Jarvis multifunction services/);
    assert.match(workflow, /if:\s*steps\.changes\.outputs\.functions_changed == 'true'/);
    assert.doesNotMatch(workflow, /--only hosting,functions:/);
});
