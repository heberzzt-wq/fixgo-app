import assert from "node:assert/strict";
import { test } from "node:test";

import {
    __test,
    runResilientLocalWebResearch
} from "../jarvis-local-web-research.js";

function response({
    status = 200,
    body = "",
    url = "https://example.test/"
} = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        url,
        async text() {
            return body;
        }
    };
}

test("local research falls through from DuckDuckGo HTML to Lite and returns canonical URLs", async () => {
    const calls = [];
    const canonical = "https://anthropic.com/news/test";
    const redirect = `https://duckduckgo.com/l/?uddg=${encodeURIComponent(canonical)}`;

    const fetchImpl = async url => {
        calls.push(String(url));
        if (String(url).includes("html.duckduckgo.com")) {
            return response({ body: "<html><body>No results</body></html>", url: String(url) });
        }
        if (String(url).includes("lite.duckduckgo.com")) {
            return response({
                body: `<html><body><a rel="nofollow" href="${redirect}">Anthropic API documentation update</a></body></html>`,
                url: String(url)
            });
        }
        throw new Error("UNEXPECTED_FETCH");
    };

    const result = await runResilientLocalWebResearch(
        "Anthropic API novedades",
        5000,
        { exactEntity: "Anthropic" },
        fetchImpl
    );

    assert.equal(result.ok, true);
    assert.equal(result.grounded, true);
    assert.equal(result.engine, "jarvis_local_duckduckgo_lite_research");
    assert.equal(result.sources[0].url, canonical);
    assert.equal(result.sourceCount, 1);
    assert.equal(calls.length, 2);
});

test("local research keeps domain restrictions during fallback", async () => {
    const fetchImpl = async url => {
        if (String(url).includes("html.duckduckgo.com")) {
            return response({
                body: [
                    '<div class="result results_links"><a class="result__a" href="https://example.com/nope">Wrong domain</a><a class="result__snippet">ignore</a></div>',
                    '<div class="result results_links"><a class="result__a" href="https://openai.com/api/">OpenAI API</a><a class="result__snippet">Official API platform.</a></div>'
                ].join(""),
                url: String(url)
            });
        }
        throw new Error("UNEXPECTED_FETCH");
    };

    const result = await runResilientLocalWebResearch(
        "OpenAI API",
        5000,
        { allowedDomain: "openai.com", exactEntity: "OpenAI" },
        fetchImpl
    );

    assert.equal(result.sourceCount, 1);
    assert.equal(result.sources[0].url, "https://openai.com/api/");
    assert.match(result.query, /site:openai\.com/);
});

test("local research uses a direct-domain source only after search providers fail", async () => {
    const calls = [];
    const fetchImpl = async url => {
        calls.push(String(url));
        if (String(url).includes("duckduckgo.com") || String(url).includes("bing.com")) {
            throw new Error("UPSTREAM_BLOCKED");
        }
        if (String(url) === "https://openai.com/") {
            return response({
                body: '<html><head><title>OpenAI</title><meta name="description" content="Official OpenAI site"></head></html>',
                url: "https://openai.com/"
            });
        }
        throw new Error("UNEXPECTED_FETCH");
    };

    const result = await runResilientLocalWebResearch(
        "OpenAI API",
        5000,
        {
            allowedDomain: "openai.com",
            seedUrl: "https://openai.com/"
        },
        fetchImpl
    );

    assert.equal(result.engine, "jarvis_local_direct_domain_research");
    assert.equal(result.sources[0].url, "https://openai.com/");
    assert.equal(result.attempts.at(-1).ok, true);
    assert.equal(calls.length, 4);
});

test("research query quotes an exact entity and preserves the site constraint", () => {
    const query = __test.buildResearchQuery(
        "compare API pricing",
        {
            exactEntity: "Anthropic",
            allowedDomain: "anthropic.com"
        }
    );

    assert.match(query, /"Anthropic"/);
    assert.match(query, /site:anthropic\.com/);
});
