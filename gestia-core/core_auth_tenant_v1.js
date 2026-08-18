/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - CORE AUTH & SOVEREIGN MANAGER V4.0 (MASTER SESSION AUTHORITY)
 * ======================================================================================
 * Identidad: Guardián de Autoridad Criptográfica.
 * REGLA 1: CÓDIGO COMPLETO. NO PLACEHOLDERS. NO COMPACTAR.
 * --------------------------------------------------------------------------------------
 * AUTORIDAD PRIMARIA:
 * 1. Firebase Auth debe confirmar una sesión real.
 * 2. Si el correo autenticado es la identidad maestra declarada por role-authority.js,
 *    esa sesión recibe soberanía total sin exigir un segundo claim o perfil Firestore.
 * 3. Para cualquier otra cuenta se conservan claims y perfiles como controles normales.
 * 4. Token, fingerprint, SHA-256, caché, tenant y limpieza Zero-Ghost permanecen activos.
 * --------------------------------------------------------------------------------------
 * Autor: Heberto Mendoza (Arquitecto Supremo) & El Abuelo
 * ======================================================================================
 */

import { auth, db } from '/firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { resolveTenantV2 } from '/gestia-core/core_tenant_resolver_v2.js';
import {
    isGestiaMasterIdentity
} from '/gestia-core/auth/role-authority.js?v=role-authority-v4-master-session-20260818';

/**
 * --- 🧠 ESTADO PRIVADO DE SOBERANÍA (BÚNKER DE DATOS) ---
 * SESSION_CACHE: El objeto inmutable de la sesión actual.
 * CACHE_TIME: Marca de tiempo para la expiración del TTL.
 * MAESTRO_TENANT_CACHE: Caché estratégica para el acceso maestro.
 */
let SESSION_CACHE = null;
let CACHE_TIME = 0;
let MAESTRO_TENANT_CACHE = null;
const CACHE_TTL = 5 * 60 * 1000;

const stableStringify = (obj) => {
    if (!obj || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }

    const ordered = Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
        }, {});

    return JSON.stringify(ordered);
};

/**
 * Firebase Auth es el único requisito de identidad previo a resolver autoridad.
 */
const getCurrentUser = () => {
    return new Promise((resolve) => {
        let resolved = false;

        const safeResolve = (user) => {
            if (!resolved) {
                resolved = true;
                resolve(user);
            }
        };

        const timer = setTimeout(() => {
            console.error("🚨 [Auth] Timeout alcanzado en Handshake Determinista.");
            safeResolve(null);
        }, 3500);

        if (auth.currentUser) {
            clearTimeout(timer);
            return safeResolve(auth.currentUser);
        }

        const unsubscribe = auth.onAuthStateChanged((user) => {
            clearTimeout(timer);
            unsubscribe();
            safeResolve(user);
        });
    });
};

async function generateSecureSignature(uid, tenantId, role, fingerprint = "") {
    const message = `${uid}:${tenantId}:${role}:${fingerprint}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const emitSia7 = (opId, step, details, severity = "INFO") => {
    const event = new CustomEvent('gestia-terminal-state', {
        detail: {
            step: `CORE_AUTH:${step}`,
            details: details,
            opId: opId,
            severity: severity,
            modulo: "AUTH_MANAGER"
        }
    });
    window.dispatchEvent(event);
};

/**
 * resolveTenantContext: Motor único de autoridad de la Terminal Heberto.
 */
export async function resolveTenantContext(options = { forceRefresh: false }) {
    const now = Date.now();
    const OP_ID = `AUTH_GATE_${now.toString(36).toUpperCase()}`;

    if (!options.forceRefresh && SESSION_CACHE && (now - CACHE_TIME) < CACHE_TTL) {
        const user = auth.currentUser;
        if (user) {
            try {
                if (
                    SESSION_CACHE.authoritySource === "master_authenticated_email" &&
                    isGestiaMasterIdentity(user)
                ) {
                    emitSia7(
                        OP_ID,
                        "MASTER_CACHE_HIT",
                        "Sesión Firebase maestra vigente. Autoridad conservada.",
                        "SUCCESS"
                    );
                    return SESSION_CACHE;
                }

                const tokenCheck = await user.getIdTokenResult(false);
                const currentFingerprint = stableStringify(tokenCheck.claims);

                if (currentFingerprint === SESSION_CACHE.claimsFingerprint) {
                    emitSia7(OP_ID, "CACHE_HIT", "Integridad y Sincronía validadas. Cache activa.", "SUCCESS");
                    return SESSION_CACHE;
                }

                emitSia7(OP_ID, "SYNC_DRIFT", "Cambio detectado en privilegios. Forzando re-validación...", "WARN");
            } catch (e) {
                emitSia7(OP_ID, "SYNC_ERROR", "Error en check de sincronía. Continuando a validación completa.", "LIGHT");
            }
        } else {
            emitSia7(OP_ID, "INTEGRITY_ALERT", "SDK desincronizado con caché. Purgando...", "ERROR");
            invalidateAuthority();
        }
    }

    emitSia7(OP_ID, "INIT", "Iniciando autoridad de sesión Firebase...", "INFO");

    try {
        const user = await getCurrentUser();

        if (!user) {
            emitSia7(OP_ID, "AUTH_FAIL", "No se detectó usuario activo tras handshake.", "ERROR");
            throw {
                code: "AUTH_REQUIRED",
                message: "Soberanía denegada: Inicie sesión para continuar."
            };
        }

        if (SESSION_CACHE && SESSION_CACHE.uid !== user.uid) {
            emitSia7(OP_ID, "USER_SHIFT", "Conflicto de identidad detectado. Purga en curso...", "WARN");
            invalidateAuthority();
        }

        emitSia7(OP_ID, "TOKEN_SYNC", "Validando token Firebase y fingerprint criptográfico...", "INFO");

        const tokenResult = await user.getIdTokenResult(options.forceRefresh);
        const claimsFingerprint = stableStringify(tokenResult.claims);
        const isMasterEmail = isGestiaMasterIdentity(user);
        const isAdminClaim = tokenResult.claims.admin === true;
        const isGod = isMasterEmail || isAdminClaim;

        if (isGod) {
            const authoritySource =
                isMasterEmail
                    ? "master_authenticated_email"
                    : "admin_claim";

            emitSia7(
                OP_ID,
                "GOD_MODE",
                isMasterEmail
                    ? "Identidad maestra confirmada directamente por la sesión Firebase."
                    : "Autoridad administrativa confirmada por Custom Claim.",
                "SUCCESS"
            );

            if (!MAESTRO_TENANT_CACHE) {
                emitSia7(OP_ID, "TENANT_MASTER", "Resolviendo búnker maestro por primera vez...", "INFO");
                MAESTRO_TENANT_CACHE = await resolveTenantV2("uxmal39", { allowCreate: true });
            }

            const tenantGod = MAESTRO_TENANT_CACHE;

            const sigGod = await generateSecureSignature(
                user.uid,
                tenantGod.id,
                "arquitecto_supremo",
                claimsFingerprint
            );

            const GOD_SESSION = Object.freeze({
                authorized: true,
                uid: user.uid,
                email: user.email,
                tenantId: tenantGod.id,
                role: "arquitecto_supremo",
                clearance: 10,
                authoritySource,
                limits: {
                    maxReads: 99999,
                    maxTokens: 99999,
                    godMode: true
                },
                timestamp: now,
                claimsFingerprint: claimsFingerprint,
                integrityHash: sigGod,
                metadata: {
                    arch: "SIA7_MASTER_SESSION",
                    engine: "MASTER_AUTH_V4",
                    authoritySource
                }
            });

            SESSION_CACHE = GOD_SESSION;
            CACHE_TIME = now;
            syncGlobalBridges(GOD_SESSION);

            emitSia7(OP_ID, "READY", `Soberanía absoluta sobre: ${tenantGod.id}`, "SUCCESS");
            return GOD_SESSION;
        }

        // Cuentas distintas a la identidad maestra conservan el control de perfiles.
        emitSia7(OP_ID, "DB_FETCH", "Buscando rango en búnker local...", "INFO");

        const tenantIdBase = "uxmal39";
        let userData = null;
        let finalRole = "tecnico";

        const adminRef = doc(db, "tenants", tenantIdBase, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists()) {
            emitSia7(OP_ID, "AUTH_SUCCESS", "Autoridad confirmada en subcolección 'admins'.", "SUCCESS");
            userData = adminSnap.data();
            finalRole = userData.rol || "arquitecto_supremo";
        } else {
            const techRef = doc(db, "tenants", tenantIdBase, "technicians", user.uid);
            const techSnap = await getDoc(techRef);

            if (!techSnap.exists()) {
                emitSia7(OP_ID, "DB_ERROR", "Identidad no encontrada en uxmal39.", "ERROR");
                throw { code: "USER_UNKNOWN", message: "Perfil no existe en el búnker." };
            }
            userData = techSnap.data();
        }

        const tenantResuelto = await resolveTenantV2(tenantIdBase, { allowCreate: false });

        const sigStandard = await generateSecureSignature(
            user.uid,
            tenantResuelto.id,
            finalRole,
            claimsFingerprint
        );

        const SESSION = Object.freeze({
            authorized: true,
            uid: user.uid,
            email: user.email,
            tenantId: tenantResuelto.id,
            role: finalRole,
            authoritySource: "profile",
            displayName: userData.nombre || "Operador Gestia",
            limits: {
                maxReads: finalRole === "arquitecto_supremo" ? 99999 : 50,
                maxTokens: finalRole === "arquitecto_supremo" ? 99999 : 5000,
                godMode: finalRole === "arquitecto_supremo"
            },
            timestamp: now,
            claimsFingerprint: claimsFingerprint,
            integrityHash: sigStandard,
            context: {
                edificio: userData.edificio || "Uxmal 39",
                cluster: tenantResuelto.cluster || "A"
            }
        });

        SESSION_CACHE = SESSION;
        CACHE_TIME = now;
        syncGlobalBridges(SESSION);

        emitSia7(OP_ID, "SUCCESS", `Soberanía establecida para ${SESSION.tenantId} (${SESSION.role})`, "SUCCESS");
        return SESSION;

    } catch (err) {
        emitSia7(OP_ID, "CRASH", `Fallo crítico en el Gate: ${err.code || "UNKNOWN"}`, "ERROR");
        invalidateAuthority();
        throw err;
    }
}

function syncGlobalBridges(session) {
    const properties = [
        { name: 'CURRENT_TENANT_ID', value: session.tenantId },
        { name: 'CURRENT_USER_ROLE', value: session.role }
    ];

    properties.forEach((prop) => {
        Object.defineProperty(window, prop.name, {
            value: prop.value,
            writable: false,
            configurable: true
        });
    });
}

export function invalidateAuthority() {
    SESSION_CACHE = null;
    CACHE_TIME = 0;
    MAESTRO_TENANT_CACHE = null;

    const clearBridge = (name) => {
        try {
            Object.defineProperty(window, name, {
                value: null,
                writable: true,
                configurable: true
            });
            window[name] = null;
        } catch (e) {
            console.warn(`⚠️ [Auth] No se pudo limpiar el puente global ${name}:`, e.message);
        }
    };

    clearBridge('CURRENT_TENANT_ID');
    clearBridge('CURRENT_USER_ROLE');

    emitSia7("SYS", "PURGE", "Soberanía invalidada. Contexto limpio de datos fantasma.", "WARN");
}

export function getSovereignStatus() {
    const hasCache = SESSION_CACHE !== null;

    return {
        active: hasCache,
        uid: SESSION_CACHE?.uid || null,
        tenant: SESSION_CACHE?.tenantId || null,
        role: SESSION_CACHE?.role || "GUEST",
        authoritySource: SESSION_CACHE?.authoritySource || null,
        integrity: hasCache && SESSION_CACHE.integrityHash ? "CRITICAL_VALIDATED" : "NONE",
        version: "MASTER_SESSION_AUTH_V4"
    };
}

console.log("%c🔐 [CORE_AUTH]: V4.0 MASTER SESSION AUTHORITY ONLINE", "color: #fff; background: #111; border: 1px solid #d4af37; padding: 2px 10px; font-family: monospace;");
