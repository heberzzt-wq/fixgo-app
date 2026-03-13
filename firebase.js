/**
 * ======================================================
 * FIXGO CORE - GESTIAPREMIUM v5.19 (TRAFFIC CONTROL)
 * ======================================================
 * Integración: B2B SaaS + Marketplace + App Check
 * REPARACIÓN: Anti-Bucle de Redirección + Admin Bypass
 * REGLA 1: NO COMPACTAR. NO CORTAR. CÓDIGO COMPLETO.
 * AUTOR: Heber (CEO & Lead Architect)
 * ======================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.firebasestorage.app",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
};


// ======================================================
// 2. INICIALIZACIÓN
// ======================================================

// 🔥 AJUSTE: Renombramos a 'app' para compatibilidad con la creación de cuentas B2B
const app = initializeApp(firebaseConfig);


// 🛡️ DEBUG LOCAL APP CHECK
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}


const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LcEZG4sAAAAAKQQ60dgYGVzXO-Q-ZPPMB9gKNkh'),
    isTokenAutoRefreshEnabled: true
});


const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);


// ======================================================
// 🔥 ENRUTADOR DE TRÁFICO INTELIGENTE
// ======================================================

export function verificarYRedireccionar(user) {

    if (!user || typeof window === "undefined") return;

    const path = window.location.pathname;

    const currentPage =
        path.split('/').pop().split('?')[0].split('#')[0] || "index.html";

    let role = (user.rol || user.role || "").toLowerCase();

    // 🔧 PARCHE B2B
    const subType = (
        user.sub_type ||
        user.subtype ||
        (user.tipo_cuenta === "B2B" ? "saas" : null) ||
        "marketplace"
    ).toLowerCase();

    // ⚡ BYPASS ADMIN (HEBERTO)
    if (user.email && user.email.toLowerCase() === "hebertoh-m@hotmail.com") {
        role = "admin";
    }

    console.log(`🚦 ROUTER FIXGO v5.19 | rol=${role} | tipo=${subType} | page=${currentPage}`);


    // =========================
    // 1. ADMIN MAESTRO (HEBERTO)
    // =========================

    if (role === "admin") {

        if (currentPage !== "admin.html") {

            console.log("🛡️ Admin detectado → Panel Maestro");

            window.location.href = "admin.html";

        }

        return;
    }


    // =========================
    // 2. ADMIN B2B (JORGE / EDIFICIOS)
    // =========================

    if (role === "admin_b2b") {

        if (currentPage !== "panel-b2b-admin.html") {

            console.log("🏢 Admin B2B detectado → Panel NOC Edificio");

            window.location.href = "panel-b2b-admin.html";

        }

        return;
    }


    // =========================
    // 3. TECNICOS
    // =========================

    if (role === "tecnico") {

        const targetTecnico =
            (subType === "saas")
                ? "tecnico-b2b.html"
                : "tecnico.html";

        if (currentPage !== targetTecnico) {

            window.location.href = targetTecnico;

        }

        return;
    }


    // =========================
    // 4. CLIENTES
    // =========================

    if (role === "cliente" || role === "client") {

        if (subType === "saas") {

            if (currentPage !== "panel-b2b-admin.html") {

                window.location.href = "panel-b2b-admin.html";

            }

        } else {

            const forbiddenPages = [
                "login.html",
                "registro.html"
            ];

            if (forbiddenPages.includes(currentPage) || currentPage === "index.html") {

                window.location.href = "cliente.html";

            }

        }

        return;
    }

}



// ======================================================
// 🧠 OBSERVADOR DE SESIÓN
// ======================================================

export function observarAuth(callback) {

    return onAuthStateChanged(auth, async (user) => {

        if (!user) {

            callback(null);
            return;

        }

        try {

            let snap = await getDoc(doc(db, "users", user.uid));


            // ♻️ MIGRACIÓN LEGACY (NO CORTAR)
            if (!snap.exists()) {

                let legacySnap = await getDoc(doc(db, "tecnicos", user.uid));

                if (!legacySnap.exists())
                    legacySnap = await getDoc(doc(db, "clientes", user.uid));

                if (!legacySnap.exists())
                    legacySnap = await getDoc(doc(db, "admins", user.uid));

                if (legacySnap.exists()) {

                    console.log("♻️ Migrando perfil Legacy...");

                    await setDoc(
                        doc(db, "users", user.uid),
                        legacySnap.data(),
                        { merge: true }
                    );

                    snap = await getDoc(doc(db, "users", user.uid));

                }

            }


            if (snap.exists()) {

                const data = snap.data();

                const finalUser = {
                    ...user,
                    ...data
                };

                // RE-APLICAR BYPASS EN OBJETO FINAL
                if (finalUser.email &&
                    finalUser.email.toLowerCase() === "hebertoh-m@hotmail.com") {

                    finalUser.rol = "admin";

                }

                console.log("💎 Perfil Identificado:", finalUser.rol);

                verificarYRedireccionar(finalUser);

                callback(finalUser);

            } else {

                console.warn("⚠️ Usuario autenticado sin documento.");

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

        return snap.docs[0].data();

    } catch (e) {

        console.error("Error validando clave B2B:", e);

        return null;

    }

}



// ======================================================
// 📝 REGISTRO BLINDADO (ATÓMICO V5.19)
// ======================================================

export async function registrarUsuario(
    email,
    password,
    rol,
    nombre,
    subType = "marketplace",
    empresaId = null,
    b2bData = null // 🚀 INYECCIÓN PARA REGISTRO ATÓMICO
) {

    try {

        const cred = await createUserWithEmailAndPassword(auth, email, password);

        const uid = cred.user.uid;


        const perfil = {

            uid: uid,
            email: email.toLowerCase(),
            rol: rol,
            sub_type: subType,
            nombre: nombre || "Usuario Nuevo",
            creadoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp(), // ✨ Línea de auditoría de actualización
            empresa_id: empresaId || null,
            tipo_cuenta: (subType === "saas") ? "B2B" : "B2C",
            status: "activo",
            estado: "activo"

        };

        // 🏢 INYECTAR EDIFICIO SI ES B2B (Evita el "Perfil Incompleto")
        if (b2bData) {
            perfil.edificioId = b2bData.edificioId;
            perfil.edificioNombre = b2bData.edificioNombre;
        }


        // 💰 WALLET SOLO MARKETPLACE

        if (subType === "marketplace") {

            perfil.wallet = 0;
            perfil.currency = "MXN";

            console.log("💰 Wallet generado para Marketplace");

        } else {

            console.log("🏢 Registro SaaS detectado, sin wallet");

        }


        // ESCRITURA MAESTRA (SSoT)
        await setDoc(doc(db, "users", uid), perfil);


        // ESPEJOS LEGACY (COMPATIBILIDAD V4)
        if (rol === "tecnico") {

            await setDoc(
                doc(db, "tecnicos", uid),
                { ...perfil, disponible: false }
            );

        } else {

            await setDoc(
                doc(db, "clientes", uid),
                { ...perfil, pedidos: 0 }
            );

        }


        await updateProfile(cred.user, { displayName: nombre });


        return cred.user;

    } catch (error) {

        console.error("Error en Registro:", error);

        throw error;

    }

}



// ======================================================
// 📦 EXPORTS MAESTROS
// ======================================================

export {
    app, 
    auth,
    db,
    storage,
    appCheck,

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
