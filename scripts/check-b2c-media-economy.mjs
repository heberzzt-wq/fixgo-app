import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
}

function pass(message) {
    console.log(`✅ ${message}`);
}

function requireIncludes(content, marker, description) {
    if (!content.includes(marker)) fail(`${description}: falta ${marker}`);
    else pass(description);
}

function requireExcludes(content, marker, description) {
    if (content.includes(marker)) fail(`${description}: ${marker}`);
    else pass(description);
}

/**
 * Retira comentarios JavaScript sin alterar cadenas ni template literals.
 * Evita falsos positivos cuando una prohibición aparece solo en documentación.
 */
function stripJavaScriptComments(source) {
    let output = "";
    let index = 0;
    let state = "code";
    let quote = null;

    while (index < source.length) {
        const current = source[index];
        const next = source[index + 1];

        if (state === "line-comment") {
            if (current === "\n") {
                output += current;
                state = "code";
            }
            index += 1;
            continue;
        }

        if (state === "block-comment") {
            if (current === "*" && next === "/") {
                state = "code";
                index += 2;
                continue;
            }
            if (current === "\n") output += "\n";
            index += 1;
            continue;
        }

        if (state === "string") {
            output += current;
            if (current === "\\") {
                if (next !== undefined) {
                    output += next;
                    index += 2;
                    continue;
                }
            } else if (current === quote) {
                state = "code";
                quote = null;
            }
            index += 1;
            continue;
        }

        if (current === "/" && next === "/") {
            state = "line-comment";
            index += 2;
            continue;
        }

        if (current === "/" && next === "*") {
            state = "block-comment";
            index += 2;
            continue;
        }

        if (current === '"' || current === "'" || current === "`") {
            state = "string";
            quote = current;
            output += current;
            index += 1;
            continue;
        }

        output += current;
        index += 1;
    }

    return output;
}

const files = {
    appPanel: "app-panel.js",
    economyGuard: "b2c-media-economy-guard.js",
    signatureBridge: "b2c-signature-storage-bridge.js",
    workClose: "b2c-work-close-chronology-bridge.js",
    customerDispute: "b2c-customer-dispute-service-scope.js",
    orchestrator: "b2c-evidence-orchestrator.js",
    storageCandidate: "security/storage-hardening-candidate.rules.txt",
    storageFragment: "security/b2c-evidence-storage.fragment.rules.txt",
    b2bOffline: "app-tecnico-b2b.js",
    firebaseConfig: "firebase.json"
};

for (const relativePath of Object.values(files)) {
    if (!fs.existsSync(path.join(root, relativePath))) {
        fail(`Falta ${relativePath}`);
    } else {
        pass(`Existe ${relativePath}`);
    }
}

if (process.exitCode) process.exit(process.exitCode);

const appPanel = read(files.appPanel);
const economyGuard = read(files.economyGuard);
const signatureBridge = read(files.signatureBridge);
const workClose = read(files.workClose);
const customerDispute = read(files.customerDispute);
const orchestrator = read(files.orchestrator);
const storageCandidate = read(files.storageCandidate);
const storageFragment = read(files.storageFragment);
const b2bOffline = read(files.b2bOffline);
const firebaseConfig = JSON.parse(read(files.firebaseConfig));

const signatureBridgeExecutable = stripJavaScriptComments(signatureBridge);
const customerDisputeExecutable = stripJavaScriptComments(customerDispute);
const orchestratorExecutable = stripJavaScriptComments(orchestrator);

// Activación y límites del compresor B2C.
requireIncludes(
    appPanel,
    'import "./b2c-media-economy-guard.js";',
    "app-panel activa compresión económica B2C"
);
requireIncludes(
    economyGuard,
    "targetImageBytes: 900 * 1024",
    "Objetivo de fotografía fijado en 900 KB"
);
requireIncludes(
    economyGuard,
    "hardImageBytes: 1800 * 1024",
    "Límite duro de fotografía fijado en 1.8 MB"
);
requireIncludes(
    economyGuard,
    "maxLongEdgePx: 1600",
    "Lado mayor limitado a 1600 px"
);
requireIncludes(
    economyGuard,
    "callback(null);",
    "Fallo de compresión bloquea la captura pesada"
);
requireExcludes(
    economyGuard,
    "nativeToBlob.call(this, callback, type, quality);\n        });",
    "No existe fallback pesado después de fallar la optimización"
);
requireIncludes(
    economyGuard,
    "base64Used: false",
    "Compresor declara salida binaria sin Base64"
);

// Firma: Storage binario + URL, nunca data URL persistente.
requireIncludes(
    appPanel,
    'import "./b2c-signature-storage-bridge.js";',
    "app-panel activa firma respaldada por Storage"
);
requireIncludes(
    signatureBridge,
    "canvas.toDataURL = () => downloadUrl;",
    "Legacy recibe URL de firma en lugar de Base64"
);
requireIncludes(
    signatureBridge,
    "base64_persisted: false",
    "Binding de firma declara Base64 no persistido"
);
requireIncludes(
    signatureBridge,
    "MAX_SIGNATURE_BYTES = 512 * 1024",
    "Firma limitada a 512 KB"
);
requireIncludes(
    signatureBridge,
    'eventType: "customer_signature"',
    "Firma usa evento Storage específico"
);
requireExcludes(
    signatureBridgeExecutable,
    "data:image/",
    "Puente de firma no construye data URLs en código ejecutable"
);
requireIncludes(
    workClose,
    "const signatureBlob = await canvasABlob(signatureCanvas);",
    "Cierre conserva validación SHA del Blob de firma"
);

// Los flujos B2C activos suben Blob y guardan referencias/metadatos.
for (const [name, source, executable] of [
    ["orquestador técnico", orchestrator, orchestratorExecutable],
    ["disputa cliente", customerDispute, customerDisputeExecutable]
]) {
    requireIncludes(source, "uploadBytes", `${name} sube binario con uploadBytes`);
    requireExcludes(executable, "readAsDataURL", `${name} no convierte evidencia a Base64`);
    requireExcludes(executable, "data:image/", `${name} no persiste data URLs`);
}

// Reglas candidatas económicas; siguen sin publicación.
requireIncludes(
    storageCandidate,
    "DO NOT PUBLISH YET",
    "Candidato Storage continúa bloqueado para publicación"
);
requireIncludes(
    storageCandidate,
    "validImage(2 * 1024 * 1024)",
    "Candidato Storage limita fotografía B2C a 2 MB"
);
requireIncludes(
    storageCandidate,
    "validVideo(6 * 1024 * 1024)",
    "Candidato Storage limita video B2C a 6 MB"
);
requireIncludes(
    storageCandidate,
    "validImage(512 * 1024)",
    "Candidato Storage limita firma a 512 KB"
);
requireIncludes(
    storageFragment,
    "request.resource.size <= 2 * 1024 * 1024",
    "Fragmento Storage limita fotografía B2C a 2 MB"
);
requireIncludes(
    storageFragment,
    "request.resource.size <= 6 * 1024 * 1024",
    "Fragmento Storage limita video B2C a 6 MB"
);
requireIncludes(
    storageFragment,
    "request.resource.size <= 512 * 1024",
    "Fragmento Storage limita firma a 512 KB"
);

// Base64 continúa permitido únicamente como caché offline local B2B.
requireIncludes(
    b2bOffline,
    "reader.readAsDataURL(data.file)",
    "B2B offline conserva Base64 solo para IndexedDB local"
);
requireIncludes(
    b2bOffline,
    "const response = await fetch(foto.base64)",
    "B2B offline reconvierte Base64 a Blob antes de Storage"
);
requireIncludes(
    b2bOffline,
    'localDB.transaction("fotos_pendientes","readwrite")',
    "Base64 offline se guarda en IndexedDB, no en Firestore"
);

if (Object.prototype.hasOwnProperty.call(firebaseConfig, "storage")) {
    fail("firebase.json enlaza reglas Storage sin autorización de publicación.");
} else {
    pass("firebase.json no publica reglas Storage accidentalmente.");
}

if (!process.exitCode) {
    console.log(
        "\n💰 B2C MEDIA ECONOMY CHECK: PASS — fotos como Blob comprimido, " +
        "firma como URL de Storage y Base64 limitado a caché offline local."
    );
}
