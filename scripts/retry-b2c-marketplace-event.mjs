import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { applicationDefault, deleteApp, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const contract = require(path.join(root, "functions", "b2c-platform-contract.js"));
const { recipientFingerprint } = require(path.join(root, "functions", "b2c-service-marketplace.js"));

const projectId = process.argv.find(value => value.startsWith("--project="))?.split("=")[1] || "fixgo-44e4d";
const serviceId = process.argv.find(value => value.startsWith("--service-id="))?.split("=")[1] || "";
const category = contract.normalizeCategoryKey(
    process.argv.find(value => value.startsWith("--category="))?.split("=")[1] || "fix_plomeria"
);
const attempt = contract.normalizeToken(
    process.argv.find(value => value.startsWith("--attempt="))?.split("=")[1] || ""
);
const apply = process.argv.includes("--apply");

if (!attempt) throw new Error("B2C_RETRY_ATTEMPT_REQUIRED");
if (!category || !category.includes("_")) throw new Error("B2C_RETRY_CATEGORY_INVALID");

function auditId(value) {
    return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

function hasToken(profile) {
    return typeof profile?.fcmToken === "string" && profile.fcmToken.trim().length > 0;
}

const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);

try {
    let candidates;
    if (serviceId) {
        const snapshot = await db.collection("services").doc(serviceId).get();
        candidates = snapshot.exists ? [snapshot] : [];
    } else {
        const snapshot = await db.collection("services").where("estado", "==", "pendiente").get();
        candidates = snapshot.docs.filter(item => contract.normalizeCategoryKey(item.data() || {}) === category);
    }
    candidates = candidates.filter(item => {
        const service = item.data() || {};
        return contract.normalizeToken(service.estado) === contract.SERVICE_STATES.PENDING &&
            !String(service.tecnico_id || "").trim() &&
            contract.normalizeCategoryKey(service) === category;
    });
    if (candidates.length !== 1) throw new Error(`B2C_RETRY_SERVICE_CARDINALITY:${candidates.length}`);

    const serviceSnapshot = candidates[0];
    const selectedServiceId = serviceSnapshot.id;
    const listingRef = db.collection("service_marketplace").doc(selectedServiceId);
    const originalEventId = contract.marketplaceEventId(selectedServiceId);
    const retryEventId = `${originalEventId}_retry_${attempt}`;
    const originalEventRef = db.collection("platform_events").doc(originalEventId);
    const retryEventRef = db.collection("platform_events").doc(retryEventId);
    const [listingSnapshot, originalEventSnapshot, retryEventSnapshot, technicianSnapshot] = await Promise.all([
        listingRef.get(),
        originalEventRef.get(),
        retryEventRef.get(),
        db.collection("users").where("rol", "==", "tecnico").where("disponible", "==", true).get()
    ]);

    if (!listingSnapshot.exists) throw new Error("B2C_RETRY_LISTING_MISSING");
    const listing = listingSnapshot.data() || {};
    if (contract.normalizeToken(listing.estado) !== "disponible") throw new Error("B2C_RETRY_LISTING_NOT_AVAILABLE");
    if (contract.normalizeCategoryKey(listing) !== category) throw new Error("B2C_RETRY_LISTING_CATEGORY_MISMATCH");
    if (!originalEventSnapshot.exists) throw new Error("B2C_RETRY_ORIGINAL_EVENT_MISSING");
    if (contract.normalizeToken(originalEventSnapshot.data()?.estado) !== "no_matching_recipients") {
        throw new Error("B2C_RETRY_ORIGINAL_EVENT_STATE_INVALID");
    }

    const recipients = technicianSnapshot.docs
        .filter(item => {
            const profile = item.data() || {};
            return hasToken(profile) &&
                contract.technicianEligibility(profile, { requireAvailable: true }).ok &&
                contract.isSkillCompatible(profile, listing);
        })
        .map(item => recipientFingerprint(item.id))
        .sort();
    if (recipients.length === 0) throw new Error("B2C_RETRY_NO_COMPATIBLE_RECIPIENTS");

    const summary = {
        ok: true,
        mode: apply ? "APPLY" : "DRY_RUN",
        service_audit_id: auditId(selectedServiceId),
        retry_event_audit_id: auditId(retryEventId),
        category,
        original_event_state: originalEventSnapshot.data()?.estado,
        recipient_count: recipients.length,
        recipient_fingerprints: recipients,
        already_exists: retryEventSnapshot.exists
    };

    if (!apply || retryEventSnapshot.exists) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
        await db.runTransaction(async transaction => {
            const [freshService, freshListing, freshOriginal, freshRetry] = await Promise.all([
                transaction.get(serviceSnapshot.ref),
                transaction.get(listingRef),
                transaction.get(originalEventRef),
                transaction.get(retryEventRef)
            ]);
            if (freshRetry.exists) return;
            const service = freshService.data() || {};
            if (!freshService.exists || contract.normalizeToken(service.estado) !== contract.SERVICE_STATES.PENDING || service.tecnico_id) {
                throw new Error("B2C_RETRY_SERVICE_CHANGED");
            }
            if (!freshListing.exists || contract.normalizeToken(freshListing.data()?.estado) !== "disponible") {
                throw new Error("B2C_RETRY_LISTING_CHANGED");
            }
            if (!freshOriginal.exists || contract.normalizeToken(freshOriginal.data()?.estado) !== "no_matching_recipients") {
                throw new Error("B2C_RETRY_ORIGINAL_EVENT_CHANGED");
            }
            transaction.create(retryEventRef, {
                event_type: contract.EVENT_MARKETPLACE_SERVICE_AVAILABLE,
                message_id: retryEventId,
                service_id: selectedServiceId,
                categoria_id: category,
                estado: "pending_delivery",
                retry_of: originalEventId,
                retry_attempt: attempt,
                retry_reason: "canonical_vertical_skill_compatibility",
                contract_version: contract.CONTRACT_VERSION,
                created_at: FieldValue.serverTimestamp()
            });
        });
        process.stdout.write(`${JSON.stringify({ ...summary, created: true }, null, 2)}\n`);
    }
} finally {
    await deleteApp(app);
}
