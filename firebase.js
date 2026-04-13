/**
 * ======================================================
 * FIXGO CORE - GESTIAPREMIUM v5.30 (TRAFFIC CONTROL)
 * ======================================================
 * Integración: B2B SaaS + Marketplace + App Check
 * REPARACIÓN: Normalización de extensiones .html + App Check Bypass
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
    authDomain: "fixgo-44e4d.web.app", 
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.firebasestorage.app",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
};


// ======================================================
// 2. INICIALIZACIÓN
// ======================================================

const app = initializeApp(firebaseConfig);


// 🛡️ APP CHECK (DESACTIVADO TEMPORALMENTE - BYPASS 24H)
// const appCheck = initializeAppCheck(app, {
//     provider: new ReCaptchaV3Provider('6LcJ8rAsAAAAAE4wO4XQSXBSLsw9WUnc3_WdwDgq'),
//     isTokenAutoRefreshEnabled: true
// });


const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ======================================================
// 🔥 ENRUTADOR DE TRÁFICO INTELIGENTE (VERSIÓN ROBUSTA V5.30)
// ======================================================

export function verificarYRedireccionar(user) {

    if (!user || typeof window === "undefined") return;

    const path = window.location.pathname;

    // Extraemos la página actual, pero ahora considerando query params para el motor No-Code
    const rawPath = path.split('/').pop();
    const currentPage = rawPath.split('?')[0].split('#')[0] || "index.html";
    const currentQuery = window.location.search; // Capturamos el ?mod=...

    // ✨ NORMALIZACIÓN V5.30: Eliminamos el .html para comparar "limpio"
    const pageClean = currentPage.replace(".html", "").toLowerCase();

    let role = (user.rol || user.role || "").toLowerCase();

    // 🔧 PARCHE B2B / SaaS
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

    console.log(`🚦 ROUTER GESTIA v5.30 | rol=${role} | tipo=${subType} | page=${pageClean} | query=${currentQuery}`);


    // ======================================================
    // 1. ADMIN MAESTRO (HEBERTO / JORGE GLOBAL)
    // ======================================================

    if (role === "admin") {

        if (pageClean !== "admin") {

            console.log("🛡️ Admin detectado → Redirigiendo a admin.html");

            window.location.href = "admin.html";

        }

        return;
    }


    // ======================================================
    // 2.A STAFF OPERATIVO B2B (MÓDULOS NO-CODE)
    // ======================================================
    // Roles que usan Gestia Terminal (Módulos Dinámicos)

    if (role === "seguridad" || role === "recepcion" || role === "seguridad_24_7") {
        
        const targetModule = "gestia-modulo.html";
        const targetQuery = "?mod=seguridad_accesos_b2b";
        
        // Verificamos si NO está en la página base O si los parámetros no coinciden
        if (pageClean !== targetModule.replace(".html", "") || currentQuery !== targetQuery) {
            
            console.log(`🏢 Staff B2B (${role}) detectado → Redirigiendo a Módulo de Seguridad`);
            
            window.location.href = targetModule + targetQuery;
            
        }
        
        return;
    }

    // ======================================================
    // 2.B STAFF ADMINISTRATIVO B2B (PANEL NOC TRADICIONAL)
    // ======================================================
    // Jessica y Administradores de Edificio
    
    const adminB2BRoles = ["admin_b2b", "asistente_admin"];

    if (adminB2BRoles.includes(role)) {

        if (pageClean !== "panel-b2b-admin") {

            console.log("🏢 Admin B2B detectado → Redirigiendo a panel-b2b-admin.html");

            window.location.href = "panel-b2b-admin.html";

        }

        return;
    }


    // ======================================================
    // 3. INQUILINOS VIP (B2B EXCLUSIVO)
    // ======================================================

    if (role === "inquilino_b2b") {

        if (pageClean !== "app-inquilino") {

            console.log("🎟️ Inquilino B2B detectado → Redirigiendo a app-inquilino.html");

            window.location.href = "app-inquilino.html";

        }

        return;
    }


    // ======================================================
    // 4. TECNICOS (B2B vs B2C)
    // ======================================================

    if (role === "tecnico" || role === "tecnico_gp" || role === "tecnico_interno") {

        const targetTecnico = (subType === "saas") ? "tecnico-b2b" : "tecnico";

        if (pageClean !== targetTecnico) {

            console.log(`🔧 Técnico ${subType} detectado → Redirigiendo...`);

            window.location.href = targetTecnico + ".html";

        }

        return;
    }


    // ======================================================
    // 5. CLIENTES B2C (MERCADO ABIERTO)
    // ======================================================

    if (role === "cliente" || role === "client") {

        // Si por error un inquilino cae aquí pero su subType es SaaS, lo corregimos
        if (subType === "saas") {
            
            if (pageClean !== "app-inquilino") {
                window.location.href = "app-inquilino.html";
            }

        } else {

            const forbiddenPages = ["login", "registro", "index"];

            if (forbiddenPages.includes(pageClean)) {

                window.location.href = "cliente.html";

            }

        }

        return;
    }

}



// ======================================================
// 🧠 OBSERVADOR DE SESIÓN (MANTENIENDO LÓGICA DE MIGRACIÓN)
// ======================================================

export function observarAuth(callback) {

    return onAuthStateChanged(auth, async (user) => {

        if (!user) {

            callback(null);
            return;

        }

        try {

            let snap = await getDoc(doc(db, "users", user.uid));


            // ♻️ MIGRACIÓN LEGACY (NO CORTAR - REGLA DE ORO)
            if (!snap.exists()) {

                console.log("🔍 Buscando en colecciones legacy...");

                let legacySnap = await getDoc(doc(db, "tecnicos", user.uid));

                if (!legacySnap.exists())
                    legacySnap = await getDoc(doc(db, "clientes", user.uid));

                if (!legacySnap.exists())
                    legacySnap = await getDoc(doc(db, "admins", user.uid));

                if (legacySnap.exists()) {

                    console.log("♻️ Migrando perfil Legacy a Colección Centralizada...");

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

        return snap.docs[0].data();

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


        const perfil = {

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


        // Inyección de ADN B2B si aplica
        if (b2bData) {
            perfil.edificioId = b2bData.edificioId;
            perfil.edificioNombre = b2bData.edificioNombre;
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


        // Duplicación en Colecciones Legacy para compatibilidad de módulos antiguos
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
// FIN DEL CORE GESTIAPREMIUM v5.30
// ======================================================