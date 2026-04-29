/**
 * =====================================================================================
 * ARCHIVO:
 * /gestia-core/jarvis/jarvis.language.core.v5.js
 * =====================================================================================
 * JARVIS LANGUAGE CORE V5.93 - NATIVE PROTECTED + SMART PARSER
 * FIX CRÍTICO: Re-mapeo de "cerrar sesión" de LOCK a REPAIR::admin.logout
 * * Lead Architect: Heberto Mendoza (Senior Software Architect & CEO)
 * * REGLA 1: NO CORTAR. NO COMPACTAR. CÓDIGO COMPLETO.
 * REGLA 2: PASO A PASO.
 * * SISTEMA: GestiaPremium V5.66
 * MÓDULO: Procesamiento de Lenguaje Natural (NLP) para Agentes Autónomos.
 * =====================================================================================
 */

/**
 * Sistema de Logs de Jarvis para depuración en Cabina de Mando.
 * @param {string} label - Etiqueta del módulo.
 * @param {any} data - Información a registrar.
 */
function logV5(label, data = "") {
    console.log(`🧠 [LANG_V5:${label}]`, data);
}


/* =====================================================================================
   SECCIÓN 1: UTILIDADES DE LIMPIEZA Y NORMALIZACIÓN
   ===================================================================================== */

/**
 * Limpia el texto de entrada, elimina acentos y normaliza a minúsculas.
 * @param {string} text - Texto bruto.
 * @returns {string} Texto normalizado.
 */
function clean(text = "") {
    if (!text) return "";
    
    return String(text)
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ""); // Limpieza extra de puntuación
}


/**
 * Divide comandos complejos en acciones individuales basadas en conectores lógicos.
 * @param {string} text - Entrada humana.
 * @returns {Array} Lista de acciones separadas.
 */
function splitActions(text = "") {
    if (!text) return [];

    const regexSeparadores = /\s+y luego\s+|\s+y\s+|\s+despues\s+|\s+después\s+|\s+luego\s+|\s+ademas\s+|\s+además\s+/i;
    
    return String(text)
        .split(regexSeparadores)
        .map(action => action.trim())
        .filter(Boolean);
}


/* =====================================================================================
   SECCIÓN 2: COMANDOS NATIVOS DE JARVIS (CORE STATUS)
   ===================================================================================== */

/**
 * Identifica si el comando es una instrucción directa al núcleo de Jarvis.
 * @param {string} text - Comando limpio.
 */
function isNativeJarvis(text = "") {

    const t = clean(text);

    const match = (
        t.includes("jarvis estado") ||
        t.includes("jarvis resumen") ||
        t.includes("jarvis salud") ||
        t.includes("jarvis status") ||
        t.includes("jarvis anom") ||
        t.includes("jarvis despierta")
    );

    return match;
}


/* =====================================================================================
   SECCIÓN 3: DETECCIÓN DE INTENCIONES (INTENT DETECTOR)
   ===================================================================================== */

/**
 * Mapea verbos humanos a intenciones del sistema.
 * @param {string} t - Texto normalizado.
 */
function detectIntent(t = "") {

    // 🔥 FIX V5.93: Prioridad absoluta para cierre de sesión (Evita caída en LOCK)
    if (/cerrar sesión|logout|sign out|salir del sistema|desconectar/.test(t)) {
        return "REPAIR";
    }

    // Análisis de Auditoría y Consulta
    if (/revisa|analiza|consulta|verifica|checa|inspecciona/.test(t)) {
        return "ANALYZE";
    }

    // Análisis de Visualización
    if (/abre|abrir|mostrar|ver|despliega/.test(t)) {
        return "OPEN";
    }

    // Análisis de Reparación y Parcheo
    if (/corrige|repara|arregla|fix|parchea|cerrar|logout/.test(t)) {
        return "REPAIR";
    }

    // Análisis de Modificación
    if (/actualiza|modifica|cambia|patch|edita/.test(t)) {
        return "UPDATE";
    }

    // Análisis de Creación
    if (/crea|genera|alta|nuevo|instancia/.test(t)) {
        return "CREATE";
    }

    // Análisis de Destrucción
    if (/borra|elimina|quita|suprime|trash/.test(t)) {
        return "DELETE";
    }

    // Análisis de Seguridad
    if (/bloquea|suspende|corta/.test(t)) {
        return "LOCK";
    }

    return "ANALYZE";
}
/* =====================================================================================
   SECCIÓN 4: DETECCIÓN DE ENTIDADES (ENTITY DETECTOR)
   ===================================================================================== */

/**
 * Identifica sobre qué objeto o módulo se desea actuar.
 * @param {string} t - Texto normalizado.
 */
function detectEntity(t = "") {

    // 🔥 FIX V5.93: Validación explícita de autenticación/sesión
    if (/sesion|sesión|login|auth/.test(t)) {
        return "auth";
    }

    const map = {
        // Finanzas y Pagos
        pagos: "payments",
        cobros: "payments",
        facturas: "payments",
        dinero: "payments",

        // Autenticación y Usuarios
        login: "auth",
        acceso: "auth",
        usuario: "auth",
        usuarios: "auth",
        sesion: "auth",

        // Infraestructura SIA7
        camara: "camaras",
        camaras: "camaras",
        cctv: "camaras",
        video: "camaras",

        // Personal Técnico
        tecnico: "technicians",
        tecnicos: "technicians",
        especialista: "technicians",

        // Soporte y Operaciones
        ticket: "tickets",
        tickets: "tickets",
        orden: "tickets",
        ot: "tickets",

        // Estructura Inmobiliaria
        tenant: "tenant",
        edificio: "tenant",
        torre: "tenant",
        unidad: "tenant",

        // Seguridad Lógica
        firewall: "security",
        seguridad: "security",
        defensa: "security",

        // Memoria y Logs
        memoria: "memory",
        contexto: "memory",
        historial: "ledger",
        ledger: "ledger",

        // Núcleo del Sistema
        sistema: "system",
        jarvis: "system",
        core: "system"
    };

    for (const key in map) {
        if (t.includes(key)) {
            return map[key];
        }
    }

    return "system";
}


/* =====================================================================================
   SECCIÓN 5: FILTROS DINÁMICOS (CONTEXT FILTERS)
   ===================================================================================== */

/**
 * Extrae parámetros adicionales como fechas, prioridades o ubicaciones.
 */
function detectFilters(t = "") {

    const filters = {};

    // Filtros de estado financiero
    if (/vencido|atrasado|moroso|deuda/.test(t)) {
        filters.status = "late";
    }

    // Filtros temporales
    if (/hoy|ahora|actualmente/.test(t)) {
        filters.date = "today";
    }

    if (/mes|mensual/.test(t)) {
        filters.date = "month";
    }

    // Filtros de urgencia
    if (/critico|urgente|inmediato|ya/.test(t)) {
        filters.priority = "high";
    }

    // Filtros de ubicación (Modo Tacaño / Uxmal)
    if (/uxmal|oficina/.test(t)) {
        filters.scope = "uxmal39";
    }

    if (/lobby|entrada|caseta/.test(t)) {
        filters.target = "lobby";
    }

    return filters;
}


/* =====================================================================================
   SECCIÓN 6: PARSER CENTRAL DE LENGUAJE HUMANO
   ===================================================================================== */

/**
 * Convierte una cadena de texto en un plan de acciones estructurado.
 */
export function parseHumanCommand(input = "") {

    const raw = String(input).trim();
    const actions = splitActions(raw);

    const plan = actions.map(item => {

        const t = clean(item);

        // Si es un comando de salud de Jarvis, devolvemos el comando nativo
        if (isNativeJarvis(t)) {
            return {
                raw: item,
                native: true,
                command: item,
                confidence: 1
            };
        }

        // Si es una acción operativa, detectamos intención y entidad
        return {
            raw: item,
            native: false,
            intent: detectIntent(t),
            entity: detectEntity(t),
            filters: detectFilters(t),
            confidence: 0.91
        };
    });

    logV5("PLAN_ESTRUCTURADO", plan);

    return {
        ok: true,
        source: "LANGUAGE_CORE_V5.92_EXECUTIVE",
        raw,
        actions: plan,
        timestamp: Date.now()
    };
}


/* =====================================================================================
   SECCIÓN 7: CONVERSOR A COMANDOS LEGACY (DSL)
   ===================================================================================== */

/**
 * Traduce el plan a formato INTENT::ENTITY para el motor de ejecución.
 */
export function toLegacyCommands(parsed) {

    if (!parsed?.actions?.length) return [];

    /**
     * Mapeador interno para corregir salidas inválidas y forzar comandos críticos.
     */
    function mapToCommand(intent, entity, raw = "") {
        const text = String(raw).toLowerCase();

        // 🔥 FIX FINAL (CRÍTICO): RE-MAPEO DE LOGOUT
        // Aseguramos que REPAIR + AUTH + KEYWORDS resulte en el comando exacto.
        if (
            intent === "REPAIR" &&
            entity === "auth" &&
            /cerrar sesión|logout|sign out/.test(text)
        ) {
            return "REPAIR::admin.logout";
        }

        // Fallback estándar: ANALYZE::payments, CREATE::tickets, etc.
        return `${intent}::${entity}`;
    }

    return parsed.actions.map(a => {

        if (a.native) {
            return a.command;
        }

        /* ----------------------------------------------------
           EJECUCIÓN DEL MAPEO ESTRATÉGICO (V5.93)
           ---------------------------------------------------- */
        return mapToCommand(a.intent, a.entity, a.raw);
    });
}

/* =====================================================================================
   SECCIÓN 8: MODO DE TRADUCCIÓN DIRECTA (BRIDGE)
   ===================================================================================== */

/**
 * Función puente para el Kernel de Heberto.
 */
export async function translate(input = "") {

    const parsed = parseHumanCommand(input);
    return toLegacyCommands(parsed);
}


/* =====================================================================================
   SECCIÓN 9: INTERFAZ GLOBAL DE JARVIS (OBJECT INTERFACE)
   ===================================================================================== */

window.JarvisLanguageCore = {

    parseHumanCommand,
    toLegacyCommands,
    translate,

    /* ----------------------------------------------------
       CAPA EJECUTIVA: DETECCIÓN DE PARÁMETROS DE EJECUCIÓN
       ---------------------------------------------------- */

    detectMode(text = "") {

        const t = String(text || "").toLowerCase();

        if (
            t.includes("no ejecutes") ||
            t.includes("solo analiza") ||
            t.includes("sin ejecutar") ||
            t.includes("dime que harias")
        ) {
            return "ANALYSIS_ONLY";
        }

        if (
            t.includes("automatico") ||
            t.includes("automático") ||
            t.includes("sin permiso")
        ) {
            return "AUTONOMOUS";
        }

        return "SUPERVISED";
    },

    detectPriority(text = "") {

        const t = String(text || "").toLowerCase();

        if (
            t.includes("urgente") ||
            t.includes("crítico") ||
            t.includes("critico") ||
            t.includes("ya") ||
            t.includes("asap")
        ) {
            return "HIGH";
        }

        if (
            t.includes("después") ||
            t.includes("luego") ||
            t.includes("con calma")
        ) {
            return "LOW";
        }

        return "NORMAL";
    },

    detectDomain(text = "") {

        const t = String(text || "").toLowerCase();

        if (
            t.includes("admin") ||
            t.includes("administrador") ||
            t.includes("heberto") ||
            t.includes("ceo")
        ) {
            return "ADMIN_PANEL";
        }

        if (
            t.includes("tecnico") ||
            t.includes("técnico") ||
            t.includes("b2b") ||
            t.includes("flotilla")
        ) {
            return "B2B_PANEL";
        }

        if (
            t.includes("cliente") ||
            t.includes("usuario") ||
            t.includes("inquilino")
        ) {
            return "CLIENT_PANEL";
        }

        if (
            t.includes("movil") ||
            t.includes("móvil") ||
            t.includes("celular")
        ) {
            return "MOBILE_UI";
        }

        return "GENERAL";
    },

    /* ----------------------------------------------------
       INTERPRETACIÓN EJECUTIVA (EL CEREBRO DE JARVIS)
       ---------------------------------------------------- */

    async interpretExecutive(text = "") {

        const raw = String(text || "").trim();
        const low = raw.toLowerCase();

        // Variables de estado de la interpretación
        let commands = [];
        let proposal = null;
        let mode = this.detectMode(raw);
        let priority = this.detectPriority(raw);
        let domain = this.detectDomain(raw);

        /* =========================================================================
           🛠️ PARCHE CRÍTICO: REGLA EXPLÍCITA DE LOGOUT (V5.92)
           Esta sección tiene prioridad absoluta sobre cualquier otro procesamiento.
           ========================================================================= */
        
        if (/cerrar sesión|logout|sign out|salir del sistema|desconectar/i.test(raw)) {
            
            console.warn("🛡️ Jarvis: Activando secuencia de cierre de sesión forzada.");
            
            // Inyectamos el comando de reparación específico del logout
            commands = ["REPAIR::admin.logout"];
            
            // Forzamos parámetros de alta seguridad
            priority = "HIGH";
            mode = "AUTONOMOUS";
            domain = "ADMIN_PANEL";

            // Generamos la propuesta de acción inmediata
            proposal = {
                type: "REPAIR",
                title: "Desconexión de Seguridad (Logout)",
                target: "auth_core",
                reason: "Comando explícito de cierre de sesión detectado.",
                risk: "LOW"
            };

            // Salida temprana para evitar que otros filtros lo confundan
            return {
                raw,
                commands,
                mode,
                priority,
                domain,
                supervised: false,
                proposal,
                executive_fix: true
            };
        }


        /* =========================================================================
           MAPEOS TÁCTICOS (HARD MAPS)
           ========================================================================= */

        // Caso: Fallo en botón de logout administrativo
        if (
            low.includes("boton") &&
            low.includes("admin") &&
            low.includes("no funciona")
        ) {
            commands = ["REPAIR::admin"];
            priority = "HIGH";
            proposal = {
                type: "REPAIR",
                title: "Corrección de interfaz administrativa",
                target: "./panel-admin.js",
                risk: "LOW"
            };
        }

        // Caso: Fallo en el acceso del técnico
        else if (
            low.includes("tecnico") &&
            low.includes("login") &&
            low.includes("falla")
        ) {
            commands = ["REPAIR::tecnico"];
            priority = "HIGH";
            domain = "B2B_PANEL";
        }

        // Caso: Panel de cliente con errores visuales
        else if (
            low.includes("cliente") &&
            low.includes("panel") &&
            low.includes("roto")
        ) {
            commands = ["REPAIR::cliente"];
            priority = "HIGH";
            domain = "CLIENT_PANEL";
        }

        // Caso: Solicitud de resumen de estado de Jarvis
        else if (
            low.includes("resumen") ||
            low.includes("estado") ||
            low.includes("como vas")
        ) {
            commands = ["jarvis resumen"];
            mode = "STANDARD";
        }

        // Caso: Fallas en el SIA7 (Cámaras)
        else if (
            low.includes("camara") ||
            low.includes("sia7") ||
            low.includes("vigilancia")
        ) {
            commands = ["ANALYZE::camaras"];
            domain = "GENERAL";
        }

        // Si no es un caso especial, usamos la traducción estándar del Parser
        else {
            const baseTraduccion = await translate(raw);
            commands = Array.isArray(baseTraduccion) ? baseTraduccion : [baseTraduccion];
        }

        // Estructura final de respuesta para el Kernel
        return {
            raw,
            commands,
            mode,
            priority,
            domain,
            supervised: mode === "SUPERVISED",
            proposal,
            timestamp_exec: new Date().toISOString()
        };
    },

    /**
     * Punto de entrada principal para traducciones inteligentes.
     */
    async smartTranslate(text = "") {
        return await this.interpretExecutive(text);
    }
};


/* =====================================================================================
   SECCIÓN 10: INICIALIZACIÓN Y CONFIRMACIÓN DE CARGA
   ===================================================================================== */

logV5(
    "ONLINE",
    "Language Core V5.92 Executive Ready - Logout Patch Active & Full Stack Loaded"
);

// Marcador de integridad del archivo para el sistema de auditoría
const _JARVIS_CORE_INTEGRITY_ = true;
const _JARVIS_VERSION_ = "5.92";