// ==========================================
// 🧠 GESTIA CORE: TENANT RESOLVER V2 (SELF-HEALING)
// ==========================================

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../firebase.js";

let TENANT_CACHE = null;
let CACHE_TIME = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// 🔹 Normalizador universal estricto
export function normalizeTenantId(tenantId) {
    if (!tenantId) return null;
    return tenantId.toString().trim().toLowerCase();
}

// 🔹 Resolver principal
export async function resolveTenantV2(rawTenantId, options = {}) {
    const now = Date.now();

    // 🧠 CACHE LAYER
    if (!options.forceRefresh && TENANT_CACHE && (now - CACHE_TIME) < CACHE_TTL && TENANT_CACHE.originalRaw === rawTenantId) {
        console.warn("⚠️ [TENANT CACHE HIT]", TENANT_CACHE.id);
        return TENANT_CACHE;
    }

    let tenantId = normalizeTenantId(rawTenantId);

    if (!tenantId) {
        throw new Error("TENANT_ID_INVALIDO");
    }

    console.log("🧠 [TENANT RESOLVER] Buscando:", tenantId);

    let tenantRef = doc(db, "tenants", tenantId);
    let tenantSnap = await getDoc(tenantRef);

    // ==========================================
    // 🧬 SELF-HEALING LAYER
    // ==========================================
    if (!tenantSnap.exists()) {
        console.warn("⚠️ Tenant no encontrado, intentando autocorrección...");

        // 🔹 Intento 1: uppercase fallback
        const upperId = tenantId.toUpperCase();
        const upperRef = doc(db, "tenants", upperId);
        const upperSnap = await getDoc(upperRef);

        if (upperSnap.exists()) {
            console.warn("🛠️ Reparando casing automáticamente (Migración)...");
            await setDoc(tenantRef, upperSnap.data());
            tenantSnap = await getDoc(tenantRef);
        }

        // 🔹 Intento 2: crear tenant (modo bootstrap)
        if (!tenantSnap.exists() && options.allowCreate) {
            console.warn("🧬 Creando tenant automáticamente (Bootstrap)...");
            const newTenant = {
                id: tenantId,
                createdAt: new Date().toISOString(),
                status: "active",
                plan: "pro",
                selfHealing: true
            };
            await setDoc(tenantRef, newTenant);
            tenantSnap = await getDoc(tenantRef);
        }
    }

    // ==========================================
    // ❌ FALLA REAL
    // ==========================================
    if (!tenantSnap.exists()) {
        TENANT_CACHE = null;
        throw new Error(`TENANT_NO_ENCONTRADO: ${tenantId}`);
    }

    const tenantData = {
        id: tenantId,
        originalRaw: rawTenantId,
        ...tenantSnap.data()
    };

    // 🧠 Guardar cache
    TENANT_CACHE = tenantData;
    CACHE_TIME = now;

    console.log("✅ [TENANT RESUELTO]", tenantId);

    return tenantData;
}
