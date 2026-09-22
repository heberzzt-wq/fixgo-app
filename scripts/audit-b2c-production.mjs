import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = require(path.join(root, "functions", "b2c-platform-contract.js"));
const token = process.env.FIREBASE_ACCESS_TOKEN;
const project = process.argv.find(value => value.startsWith("--project="))?.split("=")[1] || "fixgo-44e4d";

// Inspection only. Keep B2B deployment separate from V142's audiovisual deploy input.
export const B2B_DEPLOY_FUNCTIONS = Object.freeze([
    "completeB2bRegistration", "provisionB2bPersonnel", "completeB2bService",
    "submitB2bPersonnelKyc", "reviewB2bPersonnelKyc",
    "reservarCancha", "crearAcceso", "registrarSalida", "registrarIngresoPaquete",
    "registrarSalidaPaquete", "registrarIncidenciaAcceso", "despachoTaticoB2B"
]);

export function buildB2bDeploymentCandidate({ branch, head, readFile = name => fs.readFileSync(path.join(root, name)) } = {}) {
    if (branch !== "v94-media-v4n-negative-claims" || !/^[a-f0-9]{40}$/.test(head || "")) {
        throw new Error("B2B_CANDIDATE_BRANCH_OR_HEAD_INVALID");
    }
    const config = JSON.parse(readFile("firebase.json").toString());
    const aliases = JSON.parse(readFile(".firebaserc").toString());
    if (aliases.projects?.default !== "fixgo-44e4d" ||
        config.firestore?.rules !== "security/firestore-console-snapshot-2026-07-30.rules.txt" ||
        config.storage?.rules !== "security/storage-hardening-candidate.rules.txt" ||
        !config.functions?.some(item => item.source === "functions" && item.codebase === "default")) {
        throw new Error("B2B_CANDIDATE_CONFIG_DRIFT");
    }
    const source = readFile("functions/index.js").toString();
    for (const name of B2B_DEPLOY_FUNCTIONS) {
        if (!source.includes(`exports.${name} =`)) throw new Error(`B2B_EXPORT_MISSING:${name}`);
    }
    const files = ["firebase.json", ".firebaserc", "functions/package.json", "functions/package-lock.json",
        "functions/index.js", "functions/secure-entry.js", "functions/secure-entry-alias.js",
        "functions/b2b-personnel-kyc.js", "functions/generated/b2c-platform-contract.cjs",
        config.firestore.rules, config.storage.rules];
    const sha256 = Object.fromEntries(files.map(file => [file, createHash("sha256").update(readFile(file)).digest("hex")]));
    return {
        project: "fixgo-44e4d", branch, head, readOnly: true, deployAuthorized: false,
        sha256,
        orderedCommandsAfterExplicitAuthorization: [
            ["firebase", "deploy", "--project", "fixgo-44e4d", "--only", B2B_DEPLOY_FUNCTIONS.map(name => `functions:${name}`).join(",")],
            ["firebase", "deploy", "--project", "fixgo-44e4d", "--only", "firestore:rules,storage"]
        ],
        excluded: ["hosting", "multiservicios", "api", "stripewebhook", "jarvisVideoGenerate", "RunPod", "AppCheck", "API keys"],
        sharedRulesScope: "Firestore rules deploy as a complete file. The canonical file also includes existing B2C evidence/consent bindings absent from the September 1 live release; certify both B2B and B2C fixtures before approval.",
        preconditions: ["Exact HEAD and clean tracked tree", "Fresh V142 Linux/Windows/Full CI and emulator PASS",
            "Recompare production hashes and exports immediately before deploy", "Explicit user deployment authorization"],
        postDeploy: ["All declared exports ACTIVE and correct entrypoints", "Deployed rule bytes match candidate",
            "Rerun emulator negative/positive fixtures using downloaded deployed rules",
            "Unauthenticated callable denial without data mutation", "Single-use key and evidence closure fixtures pass"],
        rollback: "Stop on partial failure. Preserve receipts and release IDs; do not automatically restore insecure rules or delete accounts."
    };
}

function decode(value) {
    if (!value || typeof value !== "object") return null;
    if (Object.hasOwn(value, "nullValue")) return null;
    if (Object.hasOwn(value, "stringValue")) return value.stringValue;
    if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
    if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
    if (Object.hasOwn(value, "doubleValue")) return value.doubleValue;
    if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
    if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
    if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, decode(entry)]));
    return null;
}

async function listCollection(collectionId) {
    const documents = [];
    let pageToken = "";
    do {
        const query = new URLSearchParams({ pageSize: "300" });
        if (pageToken) query.set("pageToken", pageToken);
        const response = await fetch(
            `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collectionId}?${query}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) throw new Error(`FIRESTORE_AUDIT_HTTP_${response.status}:${collectionId}`);
        const body = await response.json();
        for (const document of body.documents || []) {
            documents.push({ id: document.name.split("/").pop(), data: decode({ mapValue: { fields: document.fields || {} } }) });
        }
        pageToken = body.nextPageToken || "";
    } while (pageToken);
    return documents;
}

async function auditAccounts() {
if (!token) throw new Error("FIREBASE_ACCESS_TOKEN_REQUIRED");
const [users, services] = await Promise.all([listCollection("users"), listCollection("services")]);
const cashHistory = new Set(services
    .filter(item => contract.normalizeToken(item.data.metodo_pago) === contract.PAYMENT_METHODS.CASH)
    .map(item => item.data.cliente_id)
    .filter(Boolean));

const technicians = users
    .filter(item => contract.normalizeToken(item.data.rol || item.data.role) === "tecnico" && item.data.tipo_cuenta !== "B2B")
    .map(item => {
        const migration = contract.technicianMigration(item.data);
        const eligibility = contract.technicianEligibility(item.data, { requireAvailable: false });
        return {
            uid: item.id,
            account_type: item.data.tipo_cuenta || "legacy_unspecified",
            classification: migration.classification,
            reasons: migration.reasons,
            eligibility: eligibility.ok ? "eligible" : eligibility.reason,
            has_canonical_vehicle: Boolean(item.data.vehiculo),
            has_legacy_vehicle: Boolean(item.data.logistica || item.data.vehiculo_tipo || item.data.placas),
            has_approval_evidence: item.data.kyc?.aprobado === true || item.data.verificado === true || Boolean(item.data.aprobadoEn)
        };
    });

const customers = users
    .filter(item => contract.normalizeToken(item.data.rol || item.data.role) === "cliente" && item.data.tipo_cuenta !== "B2B")
    .map(item => {
        const migration = contract.paymentMigration(item.data);
        return {
            uid: item.id,
            classification: migration.classification,
            reasons: migration.reasons,
            proposed: migration.proposed,
            has_cash_service_history: cashHistory.has(item.id),
            has_card_metadata: Boolean(item.data.stripeCustomerId || item.data.paymentMethodId || item.data.stripe_payment_method_id)
        };
    });

const countBy = (items, key) => Object.fromEntries([...new Set(items.map(item => item[key]))]
    .sort()
    .map(value => [value, items.filter(item => item[key] === value).length]));

process.stdout.write(`${JSON.stringify({
    project,
    read_only: true,
    totals: { users: users.length, services: services.length, technicians: technicians.length, customers: customers.length },
    technician_classifications: countBy(technicians, "classification"),
    customer_classifications: countBy(customers, "classification"),
    technicians,
    customers
}, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes("--b2b-candidate")) {
        const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 20000, windowsHide: true }).trim();
        console.log(JSON.stringify(buildB2bDeploymentCandidate({ branch: git("branch", "--show-current"), head: git("rev-parse", "HEAD") }), null, 2));
    } else {
        await auditAccounts();
    }
}
