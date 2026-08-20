import fs from 'node:fs';

const path = 'tests/jarvis-genai-provider-chain.test.cjs';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('__V146_TEST_FRESH_SOURCE_FETCH__')) {
    const marker = '}\n\ntest("provider chain continues from an invalid developer key to Vertex AI", async () => {';
    const replacement = `}

// __V146_TEST_FRESH_SOURCE_FETCH__
const __v146NativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
    const target = String(url || "");
    if (target.startsWith("https://example.com/source")) {
        return {
            ok: true,
            url: target,
            headers: {
                get(name) {
                    return String(name || "").toLowerCase() === "content-type"
                        ? "text/html; charset=utf-8"
                        : null;
                }
            },
            async text() {
                return '<script type="application/ld+json">{"datePublished":"2026-08-19T12:00:00Z"}</script>';
            }
        };
    }
    if (typeof __v146NativeFetch === "function") {
        return __v146NativeFetch(url, options);
    }
    throw new Error("V146_TEST_FETCH_UNAVAILABLE");
};

test("provider chain continues from an invalid developer key to Vertex AI", async () => {`;

    const index = source.indexOf(marker);
    if (index < 0) throw new Error('V146_TEST_COMPAT_MARKER_MISSING');
    source = source.slice(0, index) + replacement + source.slice(index + marker.length);
}

fs.writeFileSync(path, source);
console.log('V146_TEST_FRESHNESS_COMPAT_APPLIED=true');
