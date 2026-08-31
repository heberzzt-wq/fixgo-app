import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = require(path.join(root, "functions", "b2c-platform-contract.js"));

function option(name, fallback = "") {
    const prefix = `--${name}=`;
    return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const token = process.env.FIREBASE_ACCESS_TOKEN;
const project = option("project", "fixgo-44e4d");
const technicianId = option("technician");
const expectedClassification = option("expected-classification", "auto_migratable");
const actor = option("actor", "firebase-cli-project-admin");
const apply = process.argv.includes("--apply");

if (!token) throw new Error("FIREBASE_ACCESS_TOKEN_REQUIRED");
if (!/^[A-Za-z0-9_-]{8,160}$/.test(technicianId)) throw new Error("TECHNICIAN_ID_REQUIRED");

function decode(value) {
    if (!value || typeof value !== "object") return null;
    if (Object.hasOwn(value, "nullValue")) return null;
    if (Object.hasOwn(value, "stringValue")) return value.stringValue;
    if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
    if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
    if (Object.hasOwn(value, "doubleValue")) return value.doubleValue;
    if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
    if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
    if (value.mapValue) {
        return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, decode(entry)]));
    }
    return null;
}

function encode(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("NON_FINITE_FIRESTORE_NUMBER");
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    if (typeof value === "object") {
        return {
            mapValue: {
                fields: Object.fromEntries(Object.entries(value)
                    .filter(([, entry]) => entry !== undefined)
                    .map(([key, entry]) => [key, encode(entry)]))
            }
        };
    }
    throw new Error(`UNSUPPORTED_FIRESTORE_VALUE:${typeof value}`);
}

const documentUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/users/${encodeURIComponent(technicianId)}`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const response = await fetch(documentUrl, { headers });
if (!response.ok) throw new Error(`FIRESTORE_READ_HTTP_${response.status}`);
const sourceDocument = await response.json();
const raw = decode({ mapValue: { fields: sourceDocument.fields || {} } });
const migration = contract.technicianMigration(raw);
const summary = {
    project,
    technician_id: technicianId,
    dry_run: !apply,
    classification: migration.classification,
    reasons: migration.reasons,
    contract_version: contract.CONTRACT_VERSION,
    source_update_time: sourceDocument.updateTime
};

if (migration.classification !== expectedClassification) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    throw new Error(`MIGRATION_CLASSIFICATION_CHANGED:${migration.classification}`);
}

if (!apply) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} else {
    const appliedAt = new Date().toISOString();
    const fields = {
        ...migration.canonical,
        migration: {
            ...(raw.migration || {}),
            b2c_contract_v1: {
                applied: true,
                applied_at: appliedAt,
                applied_by: actor,
                source_classification: migration.classification,
                source_reasons: migration.reasons,
                contract_version: contract.CONTRACT_VERSION
            }
        },
        actualizadoEn: appliedAt
    };
    const query = new URLSearchParams();
    for (const field of Object.keys(fields)) query.append("updateMask.fieldPaths", field);
    query.set("currentDocument.updateTime", sourceDocument.updateTime);
    const updateResponse = await fetch(`${documentUrl}?${query}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])) })
    });
    if (!updateResponse.ok) throw new Error(`FIRESTORE_WRITE_HTTP_${updateResponse.status}`);
    const updated = await updateResponse.json();
    process.stdout.write(`${JSON.stringify({
        ...summary,
        dry_run: false,
        applied: true,
        update_time: updated.updateTime
    }, null, 2)}\n`);
}
