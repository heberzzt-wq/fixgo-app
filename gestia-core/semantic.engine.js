// ==========================================
// 🧠 GESTIA CORE: SEMANTIC ENGINE V1.0
// ==========================================
// Gestión de contexto inteligente y priorización de módulos (El Corral).

import { db } from '../firebase.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * EXTRAER KEYWORDS:
 * Limpia el input del CEO para quedarse con la esencia de la búsqueda.
 */
export function extraerKeywords(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(-7); // Las últimas 7 palabras suelen ser las más relevantes
}

/**
 * INYECTAR CONTEXTO INTELIGENTE:
 * Busca en Firestore los módulos más recientes y los prioriza según keywords.
 */
export async function sincronizarCorralSemantico(inputCEO = "") {
    try {
        const q = query(
            collection(db, "gestia_system_modules"),
            orderBy("fecha_actualizacion", "desc"),
            limit(35) // Límite de exploración
        );

        const snap = await getDocs(q);
        let modulos = [];
        const keywords = extraerKeywords(inputCEO);

        snap.forEach(docu => {
            const m = docu.data();
            modulos.push({ 
                id: docu.id, 
                nombre: m.nombre_display || "Sin nombre",
                v: m.version_core || "legacy"
            });
        });

        // Algoritmo de Priorización Semántica (Nivel Dios)
        if (keywords.length > 0) {
            modulos.sort((a, b) => {
                const matchA = keywords.some(k => a.nombre.toLowerCase().includes(k) || a.id.includes(k));
                const matchB = keywords.some(k => b.nombre.toLowerCase().includes(k) || b.id.includes(k));
                return (matchB ? 1 : 0) - (matchA ? 1 : 0);
            });
        }

        // Retornamos el esquema listo para la IA
        return `CORRAL_V5.26_SEMANTIC_CONTEXT:\n${JSON.stringify(modulos.slice(0, 20))}`;

    } catch (e) {
        console.error("🚨 Fallo en Sincronización de Corral:", e);
        return "CORRAL_OFFLINE_SAFETY_MODE: Fallo en la lectura de módulos.";
    }
}