// ==========================================
// 📜 GESTIA CORE: HISTORY ENGINE V1.0
// ==========================================
// Gestiona el historial global y la validación de hashes (ADN del sistema).

import { db } from '../firebase.js';
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    limit, 
    doc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Verifica si un Hash (ADN de código) ya existe en la historia global.
 * Previene redundancia y protege la originalidad del búnker.
 */
export async function existeEnHistorial(hash) {
    // Buscamos en la colección global de versiones
    const q = query(
        collection(db, "gestia_module_versions_global"), 
        where("hash_snapshot", "==", hash), 
        limit(1)
    );
    
    const snap = await getDocs(q);
    return !snap.empty;
}

/**
 * Inmortaliza una versión en el historial global.
 */
export async function registrarEnHistorialGlobal({ hash, moduloId, tenantId, userId }) {
    const ref = doc(db, "gestia_module_versions_global", hash);
    
    await setDoc(ref, {
        hash_snapshot: hash,
        modulo_origen: moduloId,
        tenantId: tenantId,
        creado_por: userId,
        fecha_registro: serverTimestamp()
    });
}