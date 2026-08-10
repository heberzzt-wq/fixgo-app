import fs from "node:fs";

const terminalPath = "gestia-terminal.js";
let terminal = fs.readFileSync(terminalPath, "utf8");

const oldCrypto = `class CryptoEngine {\n\n    constructor() {\n        this.sessionKey = null;\n    }\n\n    /**\n     * Deriva llave efímera desde UID + token sesión.\n     */\n    async derivarClaveSesion(uid, token) {\n\n        const encoder = new TextEncoder();\n\n        const seed = String(token || \"\").slice(-32);\n\n        const baseKey = await window.crypto.subtle.importKey(\n            \"raw\",\n            encoder.encode(seed),\n            \"PBKDF2\",\n            false,\n            [\"deriveKey\"]\n        );\n\n        this.sessionKey = await window.crypto.subtle.deriveKey(\n            {\n                name: \"PBKDF2\",\n                salt: encoder.encode(uid),\n                iterations: 100000,\n                hash: \"SHA-256\"\n            },\n            baseKey,\n            {\n                name: \"HMAC\",\n                hash: \"SHA-256\",\n                length: 256\n            },\n            false,\n            [\"sign\", \"verify\"]\n        );\n\n        logCore(\"CRYPTO_KEY_READY\");\n    }`;

const newCrypto = `class CryptoEngine {\n\n    static SESSION_KEY_IMPORT_TIMEOUT_MS = 4000;\n\n    constructor() {\n        this.sessionKey = null;\n    }\n\n    /**\n     * Construye una llave HMAC efímera desde la identidad autenticada.\n     * El ID token ya es material de alta entropía; no se usa una KDF de contraseña\n     * en el camino crítico de arranque para evitar bloqueos indefinidos del navegador.\n     */\n    async derivarClaveSesion(uid, token) {\n\n        const encoder = new TextEncoder();\n        const tokenTail = String(token || \"\").slice(-64);\n\n        if (!uid || tokenTail.length < 32) {\n            throw new Error(\"SESSION_KEY_MATERIAL_INVALID\");\n        }\n\n        const keyMaterial =\n            encoder.encode(\`${'${uid}'}:${'${tokenTail}'}\`);\n\n        let timeoutId = null;\n\n        try {\n            const importPromise =\n                window.crypto.subtle.importKey(\n                    \"raw\",\n                    keyMaterial,\n                    {\n                        name: \"HMAC\",\n                        hash: \"SHA-256\"\n                    },\n                    false,\n                    [\"sign\", \"verify\"]\n                );\n\n            const timeoutPromise =\n                new Promise((_, reject) => {\n                    timeoutId = setTimeout(() => {\n                        reject(\n                            new Error(\"SESSION_KEY_IMPORT_TIMEOUT\")\n                        );\n                    }, CryptoEngine.SESSION_KEY_IMPORT_TIMEOUT_MS);\n                });\n\n            this.sessionKey =\n                await Promise.race([\n                    importPromise,\n                    timeoutPromise\n                ]);\n        } finally {\n            if (timeoutId !== null) {\n                clearTimeout(timeoutId);\n            }\n        }\n\n        logCore(\"CRYPTO_KEY_READY\");\n    }`;

if (!terminal.includes(oldCrypto)) {
    throw new Error("V117_CRYPTO_ENGINE_ANCHOR_MISSING");
}
terminal = terminal.replace(oldCrypto, newCrypto);
fs.writeFileSync(terminalPath, terminal, "utf8");

const multitoolPath = "gestia-core/jarvis/jarvis.multitool.pack.js";
let multitool = fs.readFileSync(multitoolPath, "utf8");
const oldMediaImport = `} from \"./jarvis.media.ingestion.js\";`;
const newMediaImport = `} from \"./jarvis.media.ingestion.js?v=v94-secure-session-v117-20260810\";`;
if ((multitool.split(oldMediaImport).length - 1) !== 1) {
    throw new Error("V117_MEDIA_IMPORT_ANCHOR_COUNT_INVALID");
}
multitool = multitool.replace(oldMediaImport, newMediaImport);
fs.writeFileSync(multitoolPath, multitool, "utf8");

const htmlPath = "gestia-terminal.html";
let html = fs.readFileSync(htmlPath, "utf8");
const oldTerminalToken = "gestia-terminal.js?v=v94-runtime-health-truth-v116-20260809";
const newTerminalToken = "gestia-terminal.js?v=v94-secure-session-v117-20260810";
const terminalTokenCount = html.split(oldTerminalToken).length - 1;
if (terminalTokenCount !== 2) {
    throw new Error(`V117_TERMINAL_CACHE_TOKEN_COUNT_${terminalTokenCount}`);
}
html = html.split(oldTerminalToken).join(newTerminalToken);
fs.writeFileSync(htmlPath, html, "utf8");

console.log("V117_SECURE_SESSION_PATCH_APPLIED");