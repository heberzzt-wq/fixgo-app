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

const requiredFiles = [
    "security/b2c-evidence-authz-inventory.json",
    "security/b2c-evidence-firestore.fragment.rules.txt",
    "security/b2c-evidence-storage.fragment.rules.txt",
    "b2c-customer-dispute-service-scope.js",
    "app-panel.js",
    "firebase.json"
];

for (const relativePath of requiredFiles) {
    if (!fs.existsSync(path.join(root, relativePath))) {
        fail(`Falta ${relativePath}`);
    } else {
        pass(`Existe ${relativePath}`);
    }
}

if (process.exitCode) process.exit(process.exitCode);

const firebaseConfig = JSON.parse(read("firebase.json"));
const inventory = JSON.parse(read("security/b2c-evidence-authz-inventory.json"));
const firestoreFragment = read("security/b2c-evidence-firestore.fragment.rules.txt");
const storageFragment = read("security/b2c-evidence-storage.fragment.rules.txt");
const customerModule = read("b2c-customer-dispute-service-scope.js");
const appPanel = read("app-panel.js");

if (Object.prototype.hasOwnProperty.call(firebaseConfig, "firestore")) {
    fail("firebase.json enlaza reglas de Firestore antes de recuperar el ruleset productivo.");
} else {
    pass("firebase.json no enlaza reglas de Firestore por accidente.");
}

if (Object.prototype.hasOwnProperty.call(firebaseConfig, "storage")) {
    fail("firebase.json enlaza reglas de Storage antes de recuperar el ruleset productivo.");
} else {
    pass("firebase.json no enlaza reglas de Storage por accidente.");
}

if (inventory.status !== "draft_only_not_deployed") {
    fail("El inventario no está marcado como draft_only_not_deployed.");
} else {
    pass("Inventario marcado como borrador no desplegado.");
}

if (inventory.firebase_configuration?.safe_to_deploy_rules !== false) {
    fail("El inventario debe mantener safe_to_deploy_rules=false.");
} else {
    pass("Despliegue de reglas permanece bloqueado.");
}

for (const [name, content] of [
    ["Firestore", firestoreFragment],
    ["Storage", storageFragment]
]) {
    if (!content.includes("DO NOT DEPLOY AS A COMPLETE RULESET")) {
        fail(`El fragmento ${name} perdió su advertencia de no despliegue.`);
    } else {
        pass(`Fragmento ${name} protegido contra uso como ruleset completo.`);
    }
}

const forbiddenGlobalCollections = [
    "b2c_evidence_hashes",
    "b2c_evidence_fingerprints",
    "b2c_evidence_audit"
];

for (const collectionName of forbiddenGlobalCollections) {
    if (customerModule.includes(`\"${collectionName}\"`)) {
        fail(`El módulo cliente vuelve a tocar la colección global ${collectionName}.`);
    }
}

if (!process.exitCode) {
    pass("El módulo cliente no referencia registros antifraude globales.");
}

if (!customerModule.includes("dedup_backend_pending")) {
    fail("La evidencia cliente no marca deduplicación backend pendiente.");
} else {
    pass("La evidencia cliente declara deduplicación backend pendiente.");
}

if (!customerModule.includes("customer_evidence_hashes")) {
    fail("Falta la reserva SHA-256 confinada al folio.");
} else {
    pass("La reserva SHA-256 del cliente está confinada al folio.");
}

if (!appPanel.includes("instalarDisputaClienteConfinadaAlServicioB2C")) {
    fail("app-panel.js no activa el flujo cliente service-scoped.");
} else {
    pass("app-panel.js activa el flujo cliente service-scoped.");
}

for (const retiredClientActivation of [
    "instalarEvidenciaDisputaLlegadaClienteB2C(user)",
    "instalarRecuperacionUIDisputaClienteB2C()",
    'actorRole: "cliente"\n    });\n    instalarVideoReforzadoB2C'
]) {
    if (appPanel.includes(retiredClientActivation)) {
        fail(`Sigue activa una ruta cliente retirada: ${retiredClientActivation}`);
    }
}

if (!process.exitCode) {
    pass("Las rutas cliente que cruzaban el registro global quedaron retiradas.");
    console.log("\n🛡️ B2C AUTHZ CHECK: PASS — reglas aún no desplegables; frontera cliente confinada al servicio.");
}
