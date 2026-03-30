/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - SEMANTIC ENGINE V5.28 (INFINITY CORE)
 * ======================================================================================
 * Función: Mapear lenguaje natural a la estructura real de Firestore (B2B/B2C Aware).
 * Regla 1: Código completo. Sin compactar.
 * ======================================================================================
 */

import { db } from '../firebase.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    limit,
    where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 🛡️ MEMORIA DE CORTO PLAZO (Cache Tacaño)
// ==========================================
let SEMANTIC_CACHE = {
    modulos: null,
    lastSync: 0
};
const TTL_SEMANTICO = 10 * 60 * 1000; // 10 minutos (Ahorro de lecturas 💰)

// ==========================================
// 🗺️ MAPA MAESTRO DE COLECCIONES (Infinity Core)
// ==========================================
const MASTER_COLLECTIONS = [
    "activos", "b2b_keys", "bitacora_edificios", "clientes", "config_rutinas",
    "config_services", "configuracion", "gestia_dynamic_data", "gestia_firewall",
    "gestia_operations", "gestia_records", "gestia_system_modules", "log_rutinas",
    "logs_ia_mantenimiento", "logs_terminal_heberto", "notificaciones_pendientes",
    "packages", "panicAlerts", "rastreo", "residenciales", "services",
    "servicios_b2b", "support_tickets", "tareas", "tecnicos", "transacciones", "users"
];

/**
 * EXTRAER KEYWORDS PRO (V5.28)
 */
export function extraerKeywords(input) {
    if (!input) return [];
    return input
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(-10); // Ampliamos a 10 para capturar nombres compuestos (ej. Lucia Hernandez)
}

/**
 * SINCRONIZAR CORRAL SEMÁNTICO
 * Inyecta en el prompt de la IA el conocimiento de la DB y los esquemas de usuario.
 */
export async function sincronizarCorralSemantico(inputCEO = "") {
    const ahora = Date.now();
    const keywords = extraerKeywords(inputCEO);

    try {
        // 🧠 1. GESTIÓN DE CACHÉ (MODO TACAÑO)
        if (!SEMANTIC_CACHE.modulos || (ahora - SEMANTIC_CACHE.lastSync) > TTL_SEMANTICO) {
            console.log("🏗️ [Semantic] Sincronizando Diccionario desde Firestore...");
            const q = query(
                collection(db, "gestia_system_modules"),
                where("status", "==", "activo"),
                limit(40)
            );
            const snap = await getDocs(q);
            SEMANTIC_CACHE.modulos = snap.docs.map(d => ({
                id: d.id,
                n: d.data().nombre_display || d.id,
                campos: d.data().esquema_campos || []
            }));
            SEMANTIC_CACHE.lastSync = ahora;
        }

        // 🔍 2. FILTRADO DE RELEVANCIA
        let modulosFiltrados = SEMANTIC_CACHE.modulos;
        if (keywords.length > 0) {
            modulosFiltrados = SEMANTIC_CACHE.modulos.filter(m => 
                keywords.some(k => m.n.toLowerCase().includes(k) || m.id.includes(k))
            ).slice(0, 5); // Solo los 5 más probables para no inflar el prompt
        }

        // 🎭 3. INYECCIÓN DE ESQUEMAS B2B/B2C (ADN REVELADO)
        const schemaB2C = "B2C_FIELDS: [email, estado, metodo_pago(map), nombre, rol, telefono, uid]";
        const schemaB2B = "B2B_FIELDS: [edificioId, edificioNombre, email, estado, nombre, rol, sub_type, tipo_cuenta, uid]";

        // 🏗️ 4. CONSTRUCCIÓN DEL CONTEXTO PARA LA IA
        let context = `--- CORRAL SEMÁNTICO V5.28 ---\n`;
        context += `ESTRUCTURAS_CLIENTES:\n- ${schemaB2C}\n- ${schemaB2B}\n\n`;
        context += `MODULOS_DETECTADOS:\n`;
        
        if (modulosFiltrados.length > 0) {
            modulosFiltrados.forEach(m => {
                context += `- ID: ${m.id} | NOMBRE: ${m.n} | CAMPOS: ${m.campos.join(",")}\n`;
            });
        } else {
            context += `- (Sin coincidencia directa. Usar colección 'users' para búsqueda general)\n`;
        }

        context += `\nCOLECCIONES_SISTEMA_DISPONIBLES: [${MASTER_COLLECTIONS.join(", ")}]\n`;
        context += `RUTA_REGISTROS: gestia_dynamic_data/{moduloId}/registros/\n`;
        context += `--- FIN DEL CORRAL ---\n`;

        return context;

    } catch (e) {
        console.error("🚨 Fallo Crítico en Semantic Engine:", e);
        return "ERROR_SEMANTICO: El sistema opera en modo ciego (Local Only).";
    }
}
