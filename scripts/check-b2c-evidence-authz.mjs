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
    if (!content.includes(marker)) {
        fail(`Falta ${description}: ${marker}`);
    } else {
        pass(description);
    }
}

function requireExcludes(content, marker, description) {
    if (content.includes(marker)) {
        fail(`${description}: ${marker}`);
    } else {
        pass(description);
    }
}

const snapshotPath = "security/firestore-console-snapshot-2026-07-30.rules.txt";
const requiredFiles = [
    snapshotPath,
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
const snapshot = read(snapshotPath);
const firestoreFragment = read("security/b2c-evidence-firestore.fragment.rules.txt");
const storageFragment = read("security/b2c-evidence-storage.fragment.rules.txt");
const customerModule = read("b2c-customer-dispute-service-scope.js");
const appPanel = read("app-panel.js");

if (Object.prototype.hasOwnProperty.call(firebaseConfig, "firestore")) {
    fail("firebase.json enlaza reglas de Firestore sin autorización de publicación.");
} else {
    pass("firebase.json no enlaza reglas de Firestore por accidente.");
}

if (Object.prototype.hasOwnProperty.call(firebaseConfig, "storage")) {
    fail("firebase.json enlaza reglas de Storage sin recuperar su ruleset actual.");
} else {
    pass("firebase.json no enlaza reglas de Storage por accidente.");
}

if (inventory.status !== "firestore_console_recovered_storage_pending_not_deployed") {
    fail("El inventario no refleja Firestore recuperado y Storage pendiente.");
} else {
    pass("Inventario reconciliado con las reglas de Firestore suministradas.");
}

if (
    inventory.firebase_configuration?.authoritative_firestore_rules_recovered_from_user_console !== true ||
    inventory.firebase_configuration?.authoritative_storage_rules_recovered !== false
) {
    fail("Estado de recuperación Firestore/Storage inconsistente.");
} else {
    pass("Firestore recuperado; Storage continúa pendiente.");
}

if (
    inventory.firebase_configuration?.safe_to_deploy_firestore_rules !== false ||
    inventory.firebase_configuration?.safe_to_deploy_storage_rules !== false
) {
    fail("El inventario debe mantener bloqueada cualquier publicación de reglas.");
} else {
    pass("Publicación de reglas permanece bloqueada.");
}

requireIncludes(snapshot, "rules_version = '2';", "Snapshot contiene rules_version 2");
requireIncludes(snapshot, "match /services/{serviceId}", "Snapshot contiene services/{serviceId}");
requireIncludes(snapshot, "allow read: if isAuth();", "Snapshot conserva lectura autenticada legacy");
requireIncludes(snapshot, "request.auth.uid == 'nNhwy3Mx4pTvc8TZVh1tyTMFwhC2'", "Snapshot conserva UID maestro");
requireIncludes(snapshot, "match /gestia_records/{tenantId}", "Snapshot conserva bloque Gestia Records");
requireIncludes(snapshot, "match /packages/{tenantId}/{docId}", "Snapshot conserva bloque Packages");

// Prueba del bloqueo actual: estos matches B2C no existen todavía en las reglas del panel.
for (const missingCurrentRule of [
    "match /evidence_events/{eventId}",
    "match /time_sync/{actorId}",
    "match /capture_consents/{consentId}",
    "match /video_consents/{consentId}",
    "match /customer_evidence_hashes/{hashId}",
    "match /b2c_evidence_hashes/{hashId}",
    "match /b2c_evidence_fingerprints/{fingerprintId}",
    "match /b2c_evidence_audit/{auditId}"
]) {
    requireExcludes(
        snapshot,
        missingCurrentRule,
        `Snapshot confirma ausencia actual de ${missingCurrentRule}`
    );
}

for (const [name, content] of [
    ["Firestore", firestoreFragment],
    ["Storage", storageFragment]
]) {
    requireIncludes(
        content,
        "DO NOT DEPLOY AS A COMPLETE RULESET",
        `Fragmento ${name} protegido contra uso como ruleset completo`
    );
}

// El fragmento Firestore debe reutilizar la autoridad maestra real, no un rol editable.
requireIncludes(
    firestoreFragment,
    "Reutiliza deliberadamente isAuth(), isAdmin() e isTecnico()",
    "Fragmento Firestore reutiliza helpers reales"
);
requireExcludes(
    firestoreFragment,
    "function b2cIsAdmin()",
    "Fragmento Firestore no redefine administración por rol"
);
requireExcludes(
    storageFragment,
    'b2cUser().rol == "admin"',
    "Fragmento Storage no confía en rol editable"
);
requireIncludes(
    storageFragment,
    'request.auth.uid == "nNhwy3Mx4pTvc8TZVh1tyTMFwhC2"',
    "Fragmento Storage conserva UID maestro"
);

// Cobertura de rutas realmente usadas por los módulos activos.
for (const requiredMatch of [
    "match /evidence_events/{eventId}",
    "match /time_sync/{actorId}",
    "match /capture_consents/{consentId}",
    "match /video_consents/{consentId}",
    "match /diagnostic_consents/{consentId}",
    "match /work_start_consents/{consentId}",
    "match /work_after_consents/{consentId}",
    "match /work_evidence_consents/{consentId}",
    "match /work_evidence_bindings/{bindingId}",
    "match /customer_evidence_hashes/{hashId}",
    "match /b2c_evidence_hashes/{hashId}",
    "match /b2c_evidence_fingerprints/{fingerprintId}",
    "match /b2c_evidence_audit/{auditId}"
]) {
    requireIncludes(
        firestoreFragment,
        requiredMatch,
        `Fragmento Firestore cubre ${requiredMatch}`
    );
}

requireIncludes(
    firestoreFragment,
    '"serviceId" in data ? data.serviceId : data.service_id',
    "Reglas aceptan serviceId camelCase y service_id snake_case"
);
requireIncludes(
    firestoreFragment,
    '"actor" in data ? data.actor.uid : data.actor_uid',
    "Reglas aceptan actor anidado y actor_uid"
);
requireIncludes(
    firestoreFragment,
    '"eventType" in data ? data.eventType : data.event_type',
    "Reglas aceptan eventType y event_type"
);

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

requireIncludes(
    customerModule,
    "dedup_backend_pending",
    "La evidencia cliente declara deduplicación backend pendiente"
);
requireIncludes(
    customerModule,
    "customer_evidence_hashes",
    "La reserva SHA-256 del cliente está confinada al folio"
);
requireIncludes(
    appPanel,
    "instalarDisputaClienteConfinadaAlServicioB2C",
    "app-panel.js activa el flujo cliente service-scoped"
);

for (const retiredClientActivation of [
    "instalarEvidenciaDisputaLlegadaClienteB2C(user)",
    "instalarRecuperacionUIDisputaClienteB2C()",
    'actorRole: "cliente"\n    });\n    instalarVideoReforzadoB2C'
]) {
    requireExcludes(
        appPanel,
        retiredClientActivation,
        "Ruta cliente anterior permanece retirada"
    );
}

if (!process.exitCode) {
    console.log(
        "\n🛡️ B2C AUTHZ CHECK: PASS — reglas Firestore recuperadas y conciliadas; " +
        "fragmentos aún no publicados; Storage pendiente."
    );
}
