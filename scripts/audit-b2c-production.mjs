import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = require(path.join(root, "functions", "b2c-platform-contract.js"));
const token = process.env.FIREBASE_ACCESS_TOKEN;
const project = process.argv.find(value => value.startsWith("--project="))?.split("=")[1] || "fixgo-44e4d";
if (!token) throw new Error("FIREBASE_ACCESS_TOKEN_REQUIRED");

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
