/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - SEMANTIC ENGINE V5.55 (INFINITY CORE - SANITIZED)
 * ======================================================================================
 * Función: Mapear lenguaje natural a la estructura real de Firestore (B2B/B2C Aware).
 * Regla 1: Código completo. Sin compactar.
 * Actualización: Validación Alfanumérica Estricta para evitar ID_CORRUPTO en V5.51+.
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
 * NORMALIZAR ID (V5.55)
 * Fuerza que cualquier ID generado sea alfanumérico con guiones bajos.
 * Mata el error ID_CORRUPTO.
 */
function normalizarID(texto) {
    return texto
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')           // Espacios a guiones bajos
        .replace(/[^a-z0-9_]/g, '')     // Eliminar todo lo que no sea alfanumérico o _
        .substring(0, 50);              // Limitar longitud
}

/**
 * EXTRAER KEYWORDS PRO (V5.55)
 */
export function extraerKeywords(input) {
    if (!input) return [];
    // Limpiamos el input para que la IA no reciba basura
    return input
        .toLowerCase()
        .replace(/[^a-z0-9\s_]/g, "") 
        .split(/\s+/)
        .filter(w => w.length > 2)      // Bajamos a 2 para capturar IDs cortos
        .map(w => normalizarID(w))      // Normalizamos cada keyword
        .slice(-15);                    // Ampliamos rango de búsqueda
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
            console.log("🏗️ [Semantic] Sincronizando Diccionario desde Firestore (V5.55)...");
            
            const q = query(
                collection(db, "gestia_system_modules"),
                where("status", "==", "activo"),
                limit(50) // Ampliamos el rango de módulos detectables
            );
            
            const snap = await getDocs(q);
            SEMANTIC_CACHE.modulos = snap.docs.map(d => ({
                id: normalizarID(d.id), // Aseguramos ID limpio desde la DB
                n: d.data().nombre_display || d.id,
                campos: d.data().esquema_campos || []
            }));
            
            SEMANTIC_CACHE.lastSync = ahora;
        }

        // 🔍 2. FILTRADO DE RELEVANCIA (Búsqueda por ID o Nombre)
        let modulosFiltrados = SEMANTIC_CACHE.modulos;
        if (keywords.length > 0) {
            modulosFiltrados = SEMANTIC_CACHE.modulos.filter(m => 
                keywords.some(k => 
                    m.n.toLowerCase().includes(k) || 
                    m.id.includes(k)
                )
            ).slice(0, 8); // Aumentamos a 8 para dar más contexto al Cerebro
        }

        // 🎭 3. INYECCIÓN DE ESQUEMAS B2B/B2C (ADN REVELADO)
        const schemaB2C = "B2C_FIELDS: [email, estado, metodo_pago(map), nombre, rol, telefono, uid, reputacion]";
        const schemaB2B = "B2B_FIELDS: [edificioId, edificioNombre, email, estado, nombre, rol, sub_type, tipo_cuenta, uid]";

        // 🏗 *NUEVO:* INYECCIÓN DE REGLAS DE NOMENCLATURA (Para educar a la IA)
        const reglasID = "REGLA_NOMBRAMIENTO: Solo usar minúsculas y guiones bajos (ej: modulo_test_01). PROHIBIDO espacios y puntos.";

        // 🏗️ 4. CONSTRUCCIÓN DEL CONTEXTO PARA LA IA
        let context = `--- CORRAL SEMÁNTICO V5.55 (STRICT_MODE) ---\n`;
        context += `${reglasID}\n`;
        context += `ESTRUCTURAS_CLIENTES:\n- ${schemaB2C}\n- ${schemaB2B}\n\n`;
        context += `MODULOS_DETECTADOS:\n`;
        
        if (modulosFiltrados.length > 0) {
            modulosFiltrados.forEach(m => {
                // Sanitizamos la salida de campos para que la IA no se confunda
                const camposLimpios = Array.isArray(m.campos) ? m.campos.join(", ") : "genérico";
                context += `- ID: ${m.id} | NOMBRE: ${m.n} | CAMPOS: [${camposLimpios}]\n`;
            });
        } else {
            context += `- (Sin coincidencia directa. Usar colección 'users' o 'tecnicos' para búsqueda general)\n`;
        }

        context += `\nCOLECCIONES_SISTEMA_DISPONIBLES: [${MASTER_COLLECTIONS.join(", ")}]\n`;
        context += `RUTA_REGISTROS: gestia_dynamic_data/{moduloId}/registros/\n`;
        context += `--- FIN DEL CORRAL ---\n`;

        return context;

    } catch (e) {
        console.error("🚨 Fallo Crítico en Semantic Engine V5.55:", e);
        return "ERROR_SEMANTICO: El sistema opera en modo ciego. Notificar al Arquitecto Supremo.";
    }
}