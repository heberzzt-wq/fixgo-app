/**
 * ======================================================
 * FIXGO CORE - GESTIAPREMIUM v5.66 (SINGLETON ARMOR)
 * ======================================================
 * Integración: B2B SaaS + Marketplace + App Check
 * REPARACIÓN: Singleton check para evitar Error 401 en FCM
 * REGLA 1: NO COMPACTAR. NO CORTAR. CÓDIGO COMPLETO.
 * AUTOR: Heber (CEO & Lead Architect)
 * ======================================================
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import {
    isGestiaMasterIdentity,
    resolveGestiaRouteDecision
} from "./gestia-core/auth/role-authority.js?v=role-authority-v4-master-session-20260818";
import {
    createTechnicianRegistrationProfile
} from "./b2c-technician-profile.js";

import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { 
    getFirestore, 
    doc, 
    setDoc, 
    updateDoc, 
    getDoc, 
    collection,      
    onSnapshot,      
    query,            
    where,            
    addDoc,          
    orderBy,          
    serverTimestamp,
    limit,
    deleteDoc,
    getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


// ======================================================
// 1. CONFIG FIREBASE
// ======================================================

const firebaseConfig = {
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0",
    authDomain: "fixgo-44e4d.web.app", 
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.firebasestorage.app",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
};


// ======================================================
// 2. INICIALIZACIÓN (MODO SINGLETON V5.66)
// ======================================================

// 🛡️ REGLA: Si ya existe una app, úsala. Si no, inicialízala.
// Esto evita que Jessica cree una "app paralela" y pierda sus credenciales de radio (401).
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();


// 🛡️ APP CHECK (DESACTIVADO TEMPORALMENTE - BYPASS 24H)
// const appCheck = initializeAppCheck(app, {
//     provider: new ReCaptchaV3Provider('6LcJ8rAsAAAAAE4wO4XQSXBSLsw9WUnc3_WdwDgq'),
//     isTokenAutoRefreshEnabled: true
// });


const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const cloudFunctions = getFunctions(app);

export async function aprobarTecnicoB2C(technicianId) {
    const approve = httpsCallable(cloudFunctions, "approveB2cTechnician");
    const result = await approve({ technicianId });
    return result.data;
}

export async function reclamarServicioB2C(serviceId) {
    const claim = httpsCallable(cloudFunctions, "claimB2cService");
    const result = await claim({ serviceId });
    return result.data;
}

export async function crearServicioB2C(payload) {
    const createService = httpsCallable(cloudFunctions, "createB2cService");
    const result = await createService(payload);
    return result.data;
}

export async function actualizarPermisosPagoB2C(customerId, stripe_autorizado, efectivo_autorizado) {
    const updatePermissions = httpsCallable(cloudFunctions, "setB2cCustomerPaymentPermissions");
    const result = await updatePermissions({ customerId, stripe_autorizado, efectivo_autorizado });
    return result.data;
}

export async function migrarPerfilTecnicoB2C(technicianId, options = {}) {
    const migrate = httpsCallable(cloudFunctions, "migrateB2cTechnicianProfile");
    const result = await migrate({ technicianId, ...options });
    return result.data;
}

export async function enviarCotizacionB2C(serviceId, diagnostic, items, factor) {
    const submit = httpsCallable(cloudFunctions, "submitB2cQuote");
    const result = await submit({ serviceId, diagnostic, items, factor });
    return result.data;
}

export async function responderCotizacionB2C(serviceId, accepted) {
    const respond = httpsCallable(cloudFunctions, "respondB2cQuote");
    const result = await respond({ serviceId, accepted });
    return result.data;
}

window.app = app;
window.auth = auth;
window.db = db;
window.storage = storage;
// ======================================================
// 🧠 OBSERVADOR DE SESIÓN (MANTENIENDO LÓGICA DE MIGRACIÓN)
// ======================================================

export function verificarYRedireccionar(user) {
    if (
        !user ||
        typeof window === "undefined"
    ) {
        return {
            redirect: false,
            target: null,
            reason: "missing_user_or_window"
        };
    }

    const decision =
        resolveGestiaRouteDecision({
            user,
            metadata: user,
            pathname: window.location.pathname,
            search: window.location.search
        });

    if (
        decision.redirect &&
        decision.target
    ) {
        console.log(
            "[ROLE_AUTHORITY_REDIRECT]",
            {
                role: decision.role,
                from: decision.page,
                to: decision.target,
                reason: decision.reason
            }
        );

        window.location.replace(
            decision.target
        );
    }

    return decision;
}

export function observarAuth(callback) {

    return onAuthStateChanged(auth, async (user) => {

        if (!user) {

            callback(null);
            return;

        }

        // La sesión Firebase firmada es la prueba de identidad. Para la cuenta
        // maestra no existe un segundo candado de perfil/claim: el correo maestro
        // es la autoridad primaria declarada en role-authority.js.
        if (isGestiaMasterIdentity(user)) {
            try {
                user.rol = "admin";
                user.role = "admin";
            }
            catch {}

            console.log("💎 Identidad Maestra autenticada por Firebase.");
            callback(user);
            return;
        }

        try {

            let snap = await getDoc(doc(db, "users", user.uid));


            // users/{uid} es la única autoridad. Las migraciones legacy se ejecutan
            // exclusivamente en backend bajo autoridad administrativa.


            if (snap.exists()) {

                const data = snap.data();

                const finalUser = {
                    ...user,
                    ...data
                };

                console.log("💎 Perfil Identificado:", finalUser.rol);

                callback(finalUser);

            } else {

                console.warn("⚠️ Usuario autenticado sin documento en Firestore.");

                callback(user);

            }

        } catch (e) {

            console.error("❌ Error Crítico en observarAuth:", e);

            callback(user);

        }

    });

}



// ======================================================
// 🔐 VALIDACIÓN CLAVE B2B
// ======================================================

export async function validarClaveB2B(clave) {

    if (!clave) return null;

    try {

        const q = query(
            collection(db, "b2b_keys"),
            where("key", "==", clave),
            limit(1)
        );

        const snap = await getDocs(q);

        if (snap.empty) return null;

        return { ...snap.docs[0].data(), _keyId: snap.docs[0].id };

    } catch (e) {

        console.error("Error validando clave B2B:", e);

        return null;

    }

}



// ======================================================
// 📝 REGISTRO BLINDADO (ATÓMICO V5.30 - NO CORTAR)
// ======================================================

export async function registrarUsuario(
    email,
    password,
    rol,
    nombre,
    subType = "marketplace",
    empresaId = null,
    b2bData = null 
) {

    try {

        console.log("🚀 Iniciando registro atómico para:", email);

        const cred = await createUserWithEmailAndPassword(auth, email, password);

        const uid = cred.user.uid;


        const perfilBase = {

            uid: uid,
            email: email.toLowerCase(),
            rol: rol,
            sub_type: subType,
            nombre: nombre || "Usuario Nuevo",
            creadoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp(), 
            empresa_id: empresaId || null,
            tipo_cuenta: (subType === "saas" || b2bData) ? "B2B" : "B2C",
            status: "activo",
            estado: "activo"

        };

        const perfil = rol === "tecnico"
            ? {
                ...perfilBase,
                ...createTechnicianRegistrationProfile({
                    uid,
                    email,
                    nombre,
                    provider: "password"
                }),
                creadoEn: perfilBase.creadoEn,
                actualizadoEn: perfilBase.actualizadoEn
            }
            : perfilBase;

        if (rol === "cliente" && perfilBase.tipo_cuenta === "B2C") {
            perfil.pagos = {
                stripe_autorizado: false,
                efectivo_autorizado: false
            };
        }


        // Inyección de ADN B2B si aplica
        if (b2bData) {
            perfil.edificioId = b2bData.edificioId;
            perfil.edificioNombre = b2bData.edificioNombre;
            perfil.b2b_key_id = b2bData._keyId || null;
            console.log("🏢 Perfil vinculado a edificio:", b2bData.edificioNombre);
        }


        // Configuración de Billetera para Marketplace
        if (subType === "marketplace") {

            perfil.wallet = 0;
            perfil.currency = "MXN";

            console.log("💰 Wallet generado para Marketplace");

        }


        // Escritura en Colección Maestra
        await setDoc(doc(db, "users", uid), perfil);


        // users/{uid} es la única fuente de verdad para altas nuevas. Las colecciones
        // legacy sólo se conservan como origen de lectura/migración en observarAuth().


        // Actualización de Perfil de Firebase Auth
        await updateProfile(cred.user, { displayName: nombre });


        console.log("✅ Registro completado con éxito.");

        return cred.user;

    } catch (error) {

        console.error("❌ Error en Proceso de Registro:", error);

        throw error;

    }

}



// ======================================================
// 📦 EXPORTS MAESTROS (SIN MODIFICACIONES)
// ======================================================

export {
    app, 
    auth,
    db,
    storage,
    //appCheck,

    signOut,
    signInWithEmailAndPassword,
    onAuthStateChanged,

    doc,
    setDoc,
    updateDoc,
    getDoc,
    collection,
    onSnapshot,
    getDocs,

    query,
    where,
    addDoc,
    orderBy,
    serverTimestamp,
    limit,
    deleteDoc

};

// ======================================================
// FIN DEL CORE GESTIAPREMIUM v5.66
// ======================================================
