import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function cryptoClassSource() {
    const source = read("gestia-terminal.js");
    const start = source.indexOf("class CryptoEngine {");
    const end = source.indexOf("/* =====================================================================================\n   CLASE CENTRAL - GESTIA TERMINAL V15", start);
    assert.ok(start >= 0, "CryptoEngine start must exist");
    assert.ok(end > start, "CryptoEngine end must exist");
    return source.slice(start, end);
}

function instantiateCryptoEngine(subtle, logs = []) {
    const classSource = cryptoClassSource();
    const factory = new Function(
        "window",
        "logCore",
        `${classSource}\nreturn CryptoEngine;`
    );
    const CryptoEngine = factory(
        { crypto: { subtle } },
        label => logs.push(label)
    );
    return { CryptoEngine, instance: new CryptoEngine(), logs };
}

test("secure session v117 removes blocking PBKDF2 from authenticated boot", () => {
    const source = cryptoClassSource();
    assert.doesNotMatch(source, /PBKDF2/);
    assert.doesNotMatch(source, /subtle\.deriveKey/);
    assert.match(source, /SESSION_KEY_IMPORT_TIMEOUT_MS = 4000/);
    assert.match(source, /SESSION_KEY_MATERIAL_INVALID/);
    assert.match(source, /SESSION_KEY_IMPORT_TIMEOUT/);
    assert.match(source, /name:\s*"HMAC"/);
    assert.match(source, /hash:\s*"SHA-256"/);
    assert.match(source, /\["sign",\s*"verify"\]/);
});

test("secure session v117 imports a non-extractable HMAC key and reaches CRYPTO_KEY_READY", async () => {
    const calls = [];
    const fakeKey = { type: "secret", algorithm: { name: "HMAC" } };
    const subtle = {
        async importKey(...args) {
            calls.push(args);
            return fakeKey;
        }
    };
    const { instance, logs } = instantiateCryptoEngine(subtle);

    await instance.derivarClaveSesion(
        "uid-heberto",
        `header.payload.${"x".repeat(96)}`
    );

    assert.equal(instance.sessionKey, fakeKey);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "raw");
    assert.equal(calls[0][3], false);
    assert.deepEqual(calls[0][4], ["sign", "verify"]);
    assert.equal(calls[0][2]?.name, "HMAC");
    assert.equal(calls[0][2]?.hash, "SHA-256");
    assert.ok(calls[0][1] instanceof Uint8Array);
    assert.ok(calls[0][1].byteLength >= 32);
    assert.deepEqual(logs, ["CRYPTO_KEY_READY"]);
});

test("secure session v117 fails explicitly instead of hanging forever when WebCrypto stalls", async () => {
    const subtle = {
        importKey() {
            return new Promise(() => {});
        }
    };
    const { CryptoEngine, instance, logs } = instantiateCryptoEngine(subtle);
    CryptoEngine.SESSION_KEY_IMPORT_TIMEOUT_MS = 5;

    await assert.rejects(
        instance.derivarClaveSesion(
            "uid-heberto",
            `header.payload.${"y".repeat(96)}`
        ),
        /SESSION_KEY_IMPORT_TIMEOUT/
    );
    assert.equal(instance.sessionKey, null);
    assert.deepEqual(logs, []);
});

test("authority boot transitions from KEY_DERIVATION to IDLE only after the bounded session key is ready", () => {
    const terminal = read("gestia-terminal.js");
    const start = terminal.indexOf("async inicializarAutoridad()");
    const end = terminal.indexOf("async execute(", start);
    assert.ok(start >= 0 && end > start);
    const authority = terminal.slice(start, end);

    assert.match(
        authority,
        /await this\.setState\(\s*STATES\.KEY_DERIVATION\s*\);[\s\S]*?await this\.crypto\.derivarClaveSesion\([\s\S]*?\);[\s\S]*?await this\.setState\(\s*STATES\.IDLE\s*\);/
    );
    assert.match(authority, /"SECURE SESSION READY"/);
    assert.match(authority, /"CORE_BOOT_FAIL"/);
    assert.match(authority, /STATES\.ERROR/);
});

test("browser shell and media ingestion receive fresh v117 cache identities", () => {
    const html = read("gestia-terminal.html");
    const multitool = read("gestia-core/jarvis/jarvis.multitool.pack.js");

    const shellTokens =
        html.match(/gestia-terminal\.js\?v=v94-[a-z0-9-]+-[0-9]{8}/g) || [];
    assert.equal(shellTokens.length, 2);
    assert.doesNotMatch(
        html,
        /gestia-terminal\.js\?v=v94-runtime-health-truth-v116-20260809/
    );
    assert.match(
        multitool,
        /jarvis\.media\.ingestion\.js\?v=v94-secure-session-v117-20260810/
    );
});
