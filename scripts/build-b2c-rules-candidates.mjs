import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const writeOutputs = process.argv.includes("--write-temp");

const paths = {
    firestoreSnapshot:
        "security/firestore-console-snapshot-2026-07-30.rules.txt",
    firestoreFragment:
        "security/b2c-evidence-firestore.fragment.rules.txt",
    storageCandidate:
        "security/storage-hardening-candidate.rules.txt",
    firebaseConfig:
        "firebase.json"
};

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sha256(content) {
    return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function countCharacter(content, character) {
    return [...content].filter((item) => item === character).length;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function validateBalancedBraces(name, content) {
    const opens = countCharacter(content, "{");
    const closes = countCharacter(content, "}");
    assert(opens === closes, `${name}: llaves desbalanceadas (${opens}/${closes}).`);
}

function buildFirestoreCandidate(snapshot, fragment) {
    assert(
        snapshot.includes("service cloud.firestore"),
        "Snapshot Firestore inválido."
    );
    assert(
        snapshot.includes("match /databases/{database}/documents"),
        "No se encontró el match principal de documentos."
    );
    assert(
        fragment.includes("B2C EVIDENCE FIRESTORE RULES FRAGMENT"),
        "Fragmento B2C Firestore inválido."
    );

    const normalizedSnapshot = snapshot.trimEnd();
    const closingPattern = /\n\s*}\s*\n\s*}\s*$/;
    const closingMatch = normalizedSnapshot.match(closingPattern);

    assert(
        closingMatch && Number.isInteger(closingMatch.index),
        "No fue posible localizar los cierres finales del ruleset Firestore."
    );

    const insertionIndex = closingMatch.index;
    const prefix = normalizedSnapshot.slice(0, insertionIndex).trimEnd();
    const suffix = normalizedSnapshot.slice(insertionIndex);

    return [
        "// ============================================================================",
        "// FIRESTORE + B2C MERGED CANDIDATE — DO NOT DEPLOY",
        "// Construido desde el snapshot de consola y el fragmento B2C versionados.",
        "// ============================================================================",
        "",
        prefix,
        "",
        fragment.trim(),
        "",
        suffix,
        ""
    ].join("\n");
}

function validateFirestoreCandidate(content) {
    validateBalancedBraces("Firestore candidate", content);

    for (const marker of [
        "service cloud.firestore",
        "match /databases/{database}/documents",
        "match /services/{serviceId}",
        "match /evidence_events/{eventId}",
        "match /time_sync/{actorId}",
        "match /capture_consents/{consentId}",
        "match /video_consents/{consentId}",
        "match /b2c_evidence_hashes/{hashId}",
        "match /b2c_evidence_fingerprints/{fingerprintId}",
        "match /b2c_evidence_audit/{auditId}",
        "request.auth.uid == 'nNhwy3Mx4pTvc8TZVh1tyTMFwhC2'"
    ]) {
        assert(content.includes(marker), `Firestore candidate: falta ${marker}`);
    }
}

function validateStorageCandidate(content) {
    validateBalancedBraces("Storage candidate", content);

    for (const marker of [
        "FIREBASE STORAGE HARDENING CANDIDATE",
        "DO NOT PUBLISH YET",
        "service firebase.storage",
        "match /expedientes/{uid}/{fileName}",
        "match /solicitudes_iniciales/{fileName}",
        "match /servicios/{serviceId}/{fileName}",
        "match /b2c_evidence/{serviceId}/{actorUid}/{eventType}/{fileName}",
        "match /b2c_customer_evidence/{serviceId}/{customerId}/arrival_dispute/{fileName}",
        "match /edificios/{edificioId}/reportes/{fileName}",
        "match /evidencias/{orderId}/{fileName}",
        "function validLegacyImage(maxBytes)",
        "image/(jpeg|png|webp|heic|heif)",
        "allow read, write: if false;"
    ]) {
        assert(content.includes(marker), `Storage candidate: falta ${marker}`);
    }

    assert(
        !content.includes("allow read, write: if request.auth != null;"),
        "Storage candidate conserva el catch-all permisivo."
    );
}

const firebaseConfig = JSON.parse(read(paths.firebaseConfig));
assert(
    !Object.prototype.hasOwnProperty.call(firebaseConfig, "firestore") &&
    !Object.prototype.hasOwnProperty.call(firebaseConfig, "storage"),
    "firebase.json enlaza reglas sin autorización."
);

const firestoreCandidate = buildFirestoreCandidate(
    read(paths.firestoreSnapshot),
    read(paths.firestoreFragment)
);
const storageCandidate = read(paths.storageCandidate);

validateFirestoreCandidate(firestoreCandidate);
validateStorageCandidate(storageCandidate);

console.log("✅ Firestore candidate construido y validado en memoria.");
console.log(`   SHA-256: ${sha256(firestoreCandidate)}`);
console.log("✅ Storage candidate validado en memoria.");
console.log(`   SHA-256: ${sha256(storageCandidate)}`);
console.log("🛑 Ninguna regla fue publicada ni enlazada desde firebase.json.");

if (writeOutputs) {
    const outputDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "fixgo-rules-candidates-")
    );
    const firestoreOutput = path.join(
        outputDir,
        "firestore-b2c-merged-candidate.rules"
    );
    const storageOutput = path.join(
        outputDir,
        "storage-hardening-candidate.rules"
    );

    fs.writeFileSync(firestoreOutput, firestoreCandidate, "utf8");
    fs.writeFileSync(storageOutput, storageCandidate, "utf8");

    console.log(`📁 Copias temporales: ${outputDir}`);
}
