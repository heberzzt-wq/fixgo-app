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
    extractGroundingSources,
    extractGroundingSupports,
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
    assert.match(workflow, /Deploy Hosting\s*\n\s*run:\s*firebase deploy --only hosting/);
    assert.match(workflow, /Deploy Jarvis multifunction services/);
    assert.match(workflow, /if:\s*steps\.changes\.outputs\.functions_changed == 'true'/);
    assert.doesNotMatch(workflow, /--only hosting,functions:/);
});
