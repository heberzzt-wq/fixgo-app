const test = require('node:test');
const assert = require('node:assert/strict');

function groundedResponse(url, text = 'grounded') {
    return {
        text,
        candidates: [{
            groundingMetadata: {
                groundingChunks: [{ web: { uri: url, title: url } }],
                groundingSupports: [{
                    segment: { text },
                    groundingChunkIndices: [0]
                }]
            }
        }]
    };
}

function htmlResponse(html, url = 'https://example.com/') {
    return {
        ok: true,
        url,
        headers: {
            get(name) {
                return String(name || '').toLowerCase() === 'content-type'
                    ? 'text/html; charset=utf-8'
                    : null;
            }
        },
        async text() {
            return html;
        }
    };
}

test('provider freshness parser prefers the newest published/modified date', async () => {
    const {
        extractPublicationDatesFromHtml,
        inspectGroundingFreshness
    } = require('../functions/jarvis-genai-provider-chain');

    const html = `
      <script type="application/ld+json">
        {"datePublished":"2026-07-09T10:00:00Z","dateModified":"2026-08-06T12:00:00Z"}
      </script>
    `;
    const dates = extractPublicationDatesFromHtml(html);
    assert.equal(dates[0], '2026-08-06T12:00:00.000Z');

    const inspection = await inspectGroundingFreshness(
        groundedResponse('https://openai.com/example'),
        {
            contents: 'Busca novedades actuales de la API',
            config: { tools: [{ googleSearch: {} }] }
        },
        async () => htmlResponse(html, 'https://openai.com/example'),
        new Date('2026-08-19T12:00:00Z')
    );

    assert.equal(inspection.required, true);
    assert.equal(inspection.verified, true);
    assert.equal(inspection.freshCount, 1);
    assert.equal(inspection.windowDays, 60);
});

test('provider chain retries when grounded sources are stale and accepts a fresh source', async () => {
    const { createJarvisGenAIProviderChain } = require('../functions/jarvis-genai-provider-chain');
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;

    globalThis.fetch = async url => {
        if (String(url).includes('/old')) {
            return htmlResponse(
                '<script type="application/ld+json">{"datePublished":"2026-05-07T00:00:00Z"}</script>',
                String(url)
            );
        }
        return htmlResponse(
            '<script type="application/ld+json">{"datePublished":"2026-08-06T00:00:00Z"}</script>',
            String(url)
        );
    };

    try {
        const chain = createJarvisGenAIProviderChain({
            providers: [{
                name: 'vertex',
                ai: {
                    models: {
                        async generateContent() {
                            providerCalls += 1;
                            return providerCalls === 1
                                ? groundedResponse('https://openai.com/old', 'old')
                                : groundedResponse('https://openai.com/fresh', 'fresh');
                        }
                    }
                }
            }]
        });

        const result = await chain.models.generateContent({
            contents: 'Investiga las novedades actuales de la API de OpenAI',
            config: { tools: [{ googleSearch: {} }] }
        });

        assert.equal(providerCalls, 2);
        assert.equal(result.text, 'fresh');
        assert.equal(result.jarvisFreshness?.verified, true);
        assert.equal(result.jarvisFreshness?.freshCount, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('direct-domain fallback rejects old or undated pages for current requests', async () => {
    const {
        extractHtmlPublicationDate,
        runJarvisDirectDomainResearch
    } = require('../functions/jarvis-web-research');

    assert.equal(
        extractHtmlPublicationDate('<time datetime="2026-08-10T08:00:00Z">Aug 10</time>'),
        '2026-08-10T08:00:00.000Z'
    );

    const pages = new Map([
        ['https://example.com/', `
            <html><head><title>Home</title></head><body>
              <h1>API updates</h1>
              <a href="/old-api-update">old API update</a>
              <a href="/fresh-api-update">fresh API update</a>
            </body></html>
        `],
        ['https://example.com/old-api-update', `
            <html><head><title>Old API update</title>
              <meta property="article:published_time" content="2026-05-07T00:00:00Z">
            </head><body><h1>Old API update</h1><p>${'Old details '.repeat(8)}</p></body></html>
        `],
        ['https://example.com/fresh-api-update', `
            <html><head><title>Fresh API update</title>
              <meta property="article:published_time" content="2026-08-10T00:00:00Z">
            </head><body><h1>Fresh API update</h1><p>${'Fresh details '.repeat(8)}</p></body></html>
        `]
    ]);

    const fetchImpl = async url => {
        const normalized = new URL(String(url));
        normalized.hash = '';
        normalized.search = '';
        const key = normalized.href.endsWith('/') && normalized.pathname !== '/'
            ? normalized.href.slice(0, -1)
            : normalized.href;
        const html = pages.get(key) || pages.get(normalized.href);
        if (!html) return { ok: false, headers: { get: () => 'text/html' }, url: normalized.href, text: async () => '' };
        return htmlResponse(html, normalized.href);
    };

    const originalNow = Date.now;
    Date.now = () => new Date('2026-08-19T12:00:00Z').getTime();
    try {
        const result = await runJarvisDirectDomainResearch({
            fetchImpl,
            query: 'novedades actuales API',
            allowedDomain: 'example.com',
            maximumPages: 3
        });

        assert.equal(result.ok, true);
        assert.equal(result.sources.length, 1);
        assert.match(result.sources[0].url, /fresh-api-update/);
        assert.equal(result.sources[0].publishedAt, '2026-08-10T00:00:00.000Z');
    } finally {
        Date.now = originalNow;
    }
});
