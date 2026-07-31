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

const firestoreSnapshotPath =
    "security/firestore-console-snapshot-2026-07-30.rules.txt";
const storageSnapshotPath =
    "security/storage-console-snapshot-2026-07-30.rules.txt";
const storagePathInventoryPath =
    "security/storage-path-inventory-2026-07-30.json";
const storageCandidatePath =
    "security/storage-hardening-candidate.rules.txt";

const requiredFiles = [
    firestoreSnapshotPath,
    storageSnapshotPath,
    storagePathInventoryPath,
    storageCandidatePath,
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
const inventory = JSON.parse(
    read("security/b2c-evidence-authz-inventory.json")
);
const storagePathInventory = JSON.parse(read(storagePathInventoryPath));
const firestoreSnapshot = read(firestoreSnapshotPath);
const storageSnapshot = read(storageSnapshotPath);
const firestoreFragment = read(
    "security/b2c-evidence-firestore.fragment.rules.txt"
);
const storageFragment = read(
    "security/b2c-evidence-storage.fragment.rules.txt"
);
const storageCandidate = read(storageCandidatePath);
const customerModule = read("b2c-customer-dispute-service-scope.js");
const appPanel = read("app-panel.js");

if (Object.prototype.hasOwnProperty.call(firebaseConfig, "firestore")) {
    fail("firebase.json enlaza reglas de Firestore sin autorización de publicación.");
} else {
    pass("firebase.json no enlaza reglas de Firestore por accidente.");
}

if (Object.prototype.hasOwnProperty.call(firebaseConfig, "storage")) {
    fail("firebase.json enlaza reglas de Storage sin autorización de publicación.");
} else {
    pass("firebase.json no enlaza reglas de Storage por accidente.");
}

if (
    inventory.status !==
    "firestore_and_storage_console_recovered_candidates_not_deployed"
) {
    fail("El inventario no refleja Firestore y Storage recuperados.");
} else {
    pass("Inventario reconciliado con ambas consolas Firebase.");
}

if (
    inventory.firebase_configuration
        ?.authoritative_firestore_rules_recovered_from_user_console !== true ||
    inventory.firebase_configuration
        ?.authoritative_storage_rules_recovered_from_user_console !== true
) {
    fail("Estado de recuperación Firestore/Storage inconsistente.");
} else {
    pass("Firestore y Storage fueron recuperados desde la consola mostrada.");
}

if (
    inventory.firebase_configuration?.safe_to_deploy_firestore_rules !== false ||
    inventory.firebase_configuration?.safe_to_deploy_storage_rules !== false
) {
    fail("El inventario debe mantener bloqueada cualquier publicación de reglas.");
} else {
    pass("Publicación de reglas permanece bloqueada.");
}

// -----------------------------------------------------------------------------
// Snapshot Firestore real.
// -----------------------------------------------------------------------------
requireIncludes(
    firestoreSnapshot,
    "rules_version = '2';",
    "Snapshot Firestore contiene rules_version 2"
);
requireIncludes(
    firestoreSnapshot,
    "match /services/{serviceId}",
    "Snapshot Firestore contiene services/{serviceId}"
);
requireIncludes(
    firestoreSnapshot,
    "allow read: if isAuth();",
    "Snapshot Firestore conserva lectura autenticada legacy"
);
requireIncludes(
    firestoreSnapshot,
    "request.auth.uid == 'nNhwy3Mx4pTvc8TZVh1tyTMFwhC2'",
    "Snapshot Firestore conserva UID maestro"
);
requireIncludes(
    firestoreSnapshot,
    "match /gestia_records/{tenantId}",
    "Snapshot Firestore conserva Gestia Records"
);
requireIncludes(
    firestoreSnapshot,
    "match /packages/{tenantId}/{docId}",
    "Snapshot Firestore conserva Packages"
);

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
        firestoreSnapshot,
        missingCurrentRule,
        `Snapshot Firestore confirma ausencia actual de ${missingCurrentRule}`
    );
}

// -----------------------------------------------------------------------------
// Snapshot Storage real: confirma el riesgo actual, no lo normaliza ni lo oculta.
// -----------------------------------------------------------------------------
requireIncludes(
    storageSnapshot,
    "service firebase.storage",
    "Snapshot Storage contiene service firebase.storage"
);
requireIncludes(
    storageSnapshot,
    "match /{allPaths=**}",
    "Snapshot Storage conserva el catch-all real"
);
requireIncludes(
    storageSnapshot,
    "allow read, write: if request.auth != null;",
    "Snapshot Storage confirma acceso global para autenticados"
);

if (
    storagePathInventory.status !==
    "current_paths_inventoried_candidate_not_deployed"
) {
    fail("El inventario de rutas Storage tiene estado inesperado.");
} else {
    pass("Inventario de rutas Storage marcado como no desplegado.");
}

if (storagePathInventory.paths?.length !== 7) {
    fail("El inventario Storage debe contener exactamente siete familias de rutas.");
} else {
    pass("Inventario Storage contiene siete familias de rutas activas.");
}

for (const expectedPath of [
    "expedientes/{uid}/{fileName}",
    "solicitudes_iniciales/{uid_timestamp}.jpg",
    "servicios/{serviceId}/{fileName}",
    "b2c_evidence/{serviceId}/{actorUid}/{eventType}/{fileName}",
    "b2c_customer_evidence/{serviceId}/{customerId}/arrival_dispute/{fileName}",
    "edificios/{edificioId}/reportes/{fileName}",
    "evidencias/{ordenId}/{fileName}"
]) {
    if (!storagePathInventory.paths.some((item) => item.path === expectedPath)) {
        fail(`Falta la ruta inventariada ${expectedPath}`);
    } else {
        pass(`Ruta inventariada: ${expectedPath}`);
    }
}

// -----------------------------------------------------------------------------
// Fragmentos B2C.
// -----------------------------------------------------------------------------
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

for (const reinforcedVideoEvent of [
    "customer_no_show_video",
    "customer_denied_access_video"
]) {
    requireIncludes(
        firestoreFragment,
        `\"${reinforcedVideoEvent}\"`,
        `Firestore permite ${reinforcedVideoEvent}`
    );
    requireIncludes(
        storageFragment,
        `\"${reinforcedVideoEvent}\"`,
        `Fragmento Storage reconoce ${reinforcedVideoEvent}`
    );
    requireIncludes(
        storageCandidate,
        `\"${reinforcedVideoEvent}\"`,
        `Candidato Storage reconoce ${reinforcedVideoEvent}`
    );
}

// -----------------------------------------------------------------------------
// Candidato completo Storage.
// -----------------------------------------------------------------------------
requireIncludes(
    storageCandidate,
    "DO NOT PUBLISH YET",
    "Candidato Storage conserva bloqueo de publicación"
);
requireExcludes(
    storageCandidate,
    "allow read, write: if request.auth != null;",
    "Candidato Storage elimina el catch-all autenticado"
);
requireIncludes(
    storageCandidate,
    "allow read, write: if false;",
    "Candidato Storage deniega rutas no inventariadas"
);
requireIncludes(
    storageCandidate,
    'request.auth.uid == "nNhwy3Mx4pTvc8TZVh1tyTMFwhC2"',
    "Candidato Storage conserva UID maestro"
);

for (const candidateMatch of [
    "match /expedientes/{uid}/{fileName}",
    "match /solicitudes_iniciales/{fileName}",
    "match /servicios/{serviceId}/{fileName}",
    "match /b2c_evidence/{serviceId}/{actorUid}/{eventType}/{fileName}",
    "match /b2c_customer_evidence/{serviceId}/{customerId}/arrival_dispute/{fileName}",
    "match /edificios/{edificioId}/reportes/{fileName}",
    "match /evidencias/{orderId}/{fileName}"
]) {
    requireIncludes(
        storageCandidate,
        candidateMatch,
        `Candidato Storage cubre ${candidateMatch}`
    );
}

requireIncludes(
    storageCandidate,
    "request.resource.metadata.eventType == eventType",
    "Candidato compara metadata.eventType con la ruta"
);
requireIncludes(
    storageCandidate,
    "technicianPhotoEvent(eventType) && validImage",
    "Candidato limita eventos fotográficos a imágenes"
);
requireIncludes(
    storageCandidate,
    "technicianVideoEvent(eventType) && validVideo",
    "Candidato limita eventos de video a videos"
);

// -----------------------------------------------------------------------------
// Frontera cliente service-scoped.
// -----------------------------------------------------------------------------
for (const collectionName of [
    "b2c_evidence_hashes",
    "b2c_evidence_fingerprints",
    "b2c_evidence_audit"
]) {
    if (customerModule.includes(`\"${collectionName}\"`)) {
        fail(`El módulo cliente vuelve a tocar ${collectionName}.`);
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
        "\n🛡️ B2C AUTHZ CHECK: PASS — snapshots Firestore/Storage conciliados; " +
        "riesgo Storage documentado; candidatos completos aún no publicados."
    );
}
