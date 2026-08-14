import test from "node:test";
import assert from "node:assert/strict";

import { registerJarvisMultifunctionTools } from "../gestia-core/jarvis/jarvis.multitool.pack.js";

test("v139 web.research recovers a cloud 500 through the grounded local bridge", async () => {
    const previousAuth = globalThis.auth;
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const previousHealth = globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;

    const registry = new Map();
    const runtime = {
        register(definition) {
            registry.set(definition.name, definition);
            return definition;
        },
        list() {
            return [...registry.values()];
        },
        get(name) {
            return registry.get(name);
        }
    };

    const localSources = [
        {
            title: "Taqueria El Dorado - fuente local verificada",
            url: "https://example.test/taqueria-el-dorado",
            snippet: "Fuente simulada para validar el contrato de recuperacion local."
        }
    ];
    let bridgeCall = null;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () => "test-token"
            }
        };
        globalThis.fetch = async url => {
            assert.match(String(url), /jarvisWebResearch$/);
            return {
                ok: false,
                status: 500,
                json: async () => ({
                    error: {
                        message: "WEB_RESEARCH_HTTP_500"
                    }
                })
            };
        };
        globalThis.JarvisLocalBridge = {
            requestJson: async (path, payload, options) => {
                bridgeCall = { path, payload, options };
                return {
                    ok: true,
                    grounded: true,
                    status: "GROUNDED_LOCAL_SEARCH",
                    query: payload.query,
                    answer: "Investigacion local recuperada con una fuente verificable.",
                    sources: localSources
                };
            }
        };

        registerJarvisMultifunctionTools(runtime);
        const webResearch = registry.get("web.research");
        assert.ok(webResearch, "web.research debe estar registrado");

        const result = await webResearch.execute({
            query: "Taqueria El Dorado Cancun",
            allowedDomain: "example.test",
            exactEntity: "Taqueria El Dorado",
            seedUrl: "https://example.test/taqueria-el-dorado"
        }, {
            objectiveId: "objective-v139",
            caseId: "case-v139"
        });

        assert.equal(result.ok, true);
        assert.equal(result.grounded, true);
        assert.equal(result.status, "GROUNDED_LOCAL_SEARCH");
        assert.equal(result.source, "JARVIS_LOCAL_GROUNDED_WEB_RESEARCH");
        assert.equal(result.cloudError, "WEB_RESEARCH_HTTP_500");
        assert.deepEqual(result.sources, localSources);

        assert.equal(bridgeCall?.path, "/research");
        assert.equal(bridgeCall?.payload?.allowedDomain, "example.test");
        assert.equal(bridgeCall?.payload?.exactEntity, "Taqueria El Dorado");
        assert.equal(bridgeCall?.payload?.seedUrl, "https://example.test/taqueria-el-dorado");
        assert.match(bridgeCall?.payload?.query || "", /Taqueria El Dorado Cancun/);
        assert.equal(bridgeCall?.options?.timeoutMs, 25000);

        assert.equal(globalThis.__JARVIS_WEB_RESEARCH_HEALTH__?.ok, true);
        assert.equal(globalThis.__JARVIS_WEB_RESEARCH_HEALTH__?.grounded, true);
        assert.equal(globalThis.__JARVIS_WEB_RESEARCH_HEALTH__?.status, "GROUNDED_LOCAL_FALLBACK");
    } finally {
        globalThis.auth = previousAuth;
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = previousHealth;
    }
});
