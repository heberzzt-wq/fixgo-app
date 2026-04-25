// ======================================================
// MOTOR PREDICTIVO DE MANTENIMIENTO B2B
// Archivo: scheduler_predictivo.js
// Versión: 2.0 (Enterprise con Score de Criticidad)
// Propósito: Analiza historial de OT correctivas, calcula
//            criticidad de equipos y genera rutinas de
//            forma adaptativa.
// ======================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Inicialización segura del SDK de Firebase
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const TZ = "America/Mexico_City";

// ======================================================
// CONFIGURACIÓN AVANZADA DEL MOTOR IA
// ======================================================
const CONFIG = {
    diasAnalisis: 30,         // Ventana de tiempo histórico a revisar
    umbralFallas: 3,          // Disparador mínimo de fallas para actuar
    frecuenciaSugerida: "mensual",
    loteProcesamiento: 20     // Control de concurrencia de Firestore
};

// ======================================================
// MATRIZ DE CRITICIDAD INDUSTRIAL (NUEVO)
// ======================================================
// Define el peso base de un equipo. Si falla una bomba,
// es más crítico que si falla una puerta.
const MATRIZ_CRITICIDAD = {
    "bomba": 90,
    "elevador": 95,
    "hvac": 85,
    "chiller": 90,
    "extractor": 75,
    "porton": 70,
    "iluminacion": 30,
    "plomeria": 50,
    "default": 50
};


// ======================================================
// UTILIDADES DE TIEMPO
// ======================================================

/**
 * Retorna la fecha exacta de hace X días desde la medianoche.
 * Vital para buscar en Firestore con Timestamps exactos.
 */
function fechaHaceDias(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    d.setHours(0, 0, 0, 0); 
    return d;
}

// ======================================================
// MOTOR DE CÁLCULO DE CRITICIDAD
// ======================================================

/**
 * Calcula un score de 0 a 100 basado en el tipo de equipo
 * y la cantidad de fallas recurrentes.
 */
function calcularScoreCriticidad(nombreEquipo, totalFallas) {
    let scoreBase = MATRIZ_CRITICIDAD["default"];
    
    // Normalizamos el texto para buscar coincidencias en la matriz
    const equipoNormalizado = nombreEquipo.toLowerCase();

    for (const [key, value] of Object.entries(MATRIZ_CRITICIDAD)) {
        if (equipoNormalizado.includes(key)) {
            scoreBase = value;
            break;
        }
    }

    // Aumentamos el score por cada falla extra encima del umbral
    const fallasExtra = totalFallas - CONFIG.umbralFallas;
    const penalizacionFallas = (fallasExtra > 0) ? (fallasExtra * 5) : 0;
    
    let scoreFinal = scoreBase + penalizacionFallas;
    if (scoreFinal > 100) scoreFinal = 100; // Tope máximo

    // Determinamos la prioridad de Gestia basada en el Score
    let prioridadResultante = "media";
    if (scoreFinal >= 80) prioridadResultante = "alta";
    if (scoreFinal < 40) prioridadResultante = "baja";

    return {
        score: scoreFinal,
        prioridad: prioridadResultante
    };
}

// ======================================================
// 1. RECOLECCIÓN Y ANÁLISIS DE FALLAS CORRECTIVAS
// ======================================================

/**
 * Escanea la colección servicios_b2b buscando OTs correctivas
 * y construye un mapa de equipos problemáticos con toda su data.
 */
async function analizarEquipos() {
    const fechaInicio = fechaHaceDias(CONFIG.diasAnalisis);

    const snap = await db.collection("servicios_b2b")
        .where("tipo", "==", "correctivo")
        .where("creadoEn", ">=", admin.firestore.Timestamp.fromDate(fechaInicio))
        .get();

    const contador = {};

    snap.docs.forEach(doc => {
        const s = doc.data();

        // Filtro estricto: Si falta data clave, ignoramos para no crear basura
        if (!s.edificioId || !s.equipo) return;

        // Llave única compuesta para identificar un equipo específico en un edificio específico
        const key = `${s.edificioId}_${s.equipo}`;

        if (!contador[key]) {
            contador[key] = {
                // Identificadores
                edificioId: s.edificioId,
                edificioNombre: s.edificioNombre || "Edificio B2B General",
                direccion: s.direccion || "Dirección no especificada",
                
                // Datos del activo
                equipo: s.equipo,
                sistema: s.sistema || "Sistema General",
                categoria: s.categoria || "MAINT (B2B)",
                sub_servicio: "Predictivo Automático",
                
                // Métricas
                totalFallas: 0,
                ultimasFallas: [] // Guardamos los IDs de las OTs que originaron esto
            };
        }

        contador[key].totalFallas++;
        contador[key].ultimasFallas.push(doc.id);
    });

    return contador;
}

// ======================================================
// 2. ESCUDO ANTI-DUPLICADOS E INTERFERENCIA MANUAL
// ======================================================

/**
 * Verifica si ya existe una rutina activa para este equipo.
 * Protege contra sobre-generación y respeta si un admin ya creó una manualmente.
 */
async function rutinaActivaExiste(edificioId, equipo) {
    const snap = await db.collection("config_rutinas")
        .where("edificioId", "==", edificioId)
        .where("equipo", "==", equipo)
        .where("activo", "==", true)
        .limit(1)
        .get();

    return !snap.empty;
}

// ======================================================
// 3. GENERADOR DE RUTINA (PLANTILLA COMPLETA GESTIA)
// ======================================================

/**
 * Inserta el documento en config_rutinas con todos los campos necesarios
 * para que el scheduler_rutinas.js lo procese a la perfección.
 */
async function crearRutinaAutomatica(dataEquipo) {
    const ref = db.collection("config_rutinas").doc();

    // Calculamos el nivel de emergencia y prioridad
    const analisisCriticidad = calcularScoreCriticidad(dataEquipo.equipo, dataEquipo.totalFallas);

    const nuevaRutina = {
        // Información General
        nombre: `Auto-Preventivo: ${dataEquipo.equipo}`,
        descripcion: `IA Gestia: Se detectaron ${dataEquipo.totalFallas} fallas correctivas en ${CONFIG.diasAnalisis} días. Score de criticidad asignado: ${analisisCriticidad.score}/100.`,
        
        // Ubicación
        edificioId: dataEquipo.edificioId,
        edificioNombre: dataEquipo.edificioNombre,
        direccion: dataEquipo.direccion,
        
        // Categorización B2B
        equipo: dataEquipo.equipo,
        sistema: dataEquipo.sistema,
        categoria: dataEquipo.categoria,
        sub_servicio: dataEquipo.sub_servicio,
        id_tarea: `IA-PREV-${Date.now().toString().slice(-6)}`,
        
        // Configuración Operativa
        frecuencia: CONFIG.frecuenciaSugerida,
        prioridad: analisisCriticidad.prioridad, // Dinámico según el score
        score_criticidad: analisisCriticidad.score, // Dato analítico guardado en BD
        activo: true,
        origen: "auto_predictivo",
        
        // Asignación
        tecnico_default: null, // Que el Round Robin del otro motor se encargue
        responsable: "tecnico",
        
        // Fechas y Auditoría
        creadoPor: "motor_predictivo_ia",
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
        ultima_generacion: null, // Para que el motor preventivo lo ejecute hoy mismo
        proxima_ejecucion: null, 
        
        // Trazabilidad de origen
        fallas_origen: dataEquipo.ultimasFallas.slice(0, 5) // Guardamos máximo 5 referencias
    };

    await ref.set(nuevaRutina);
    return ref.id;
}

// ======================================================
// 4. SISTEMA DE LOGS Y AUDITORÍA
// ======================================================

async function logMotorPredictivo(data) {
    await db.collection("logs_ia_mantenimiento").add({
        ...data,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        entorno: "produccion_v5_18"
    });
}

// ======================================================
// 5. ORQUESTADOR DE PROCESAMIENTO
// ======================================================

/**
 * Función que maneja un solo equipo. 
 * Separada para poder usarla con Promise.all en lotes.
 */
async function procesarEquipo(key, equipoData) {
    // 1. Validar Umbral
    if (equipoData.totalFallas < CONFIG.umbralFallas) {
        return { operacion: "ignorado_umbral", equipo: equipoData.equipo };
    }

    // 2. Validar Existencia
    const existe = await rutinaActivaExiste(equipoData.edificioId, equipoData.equipo);
    if (existe) {
        return { operacion: "ignorado_existente", equipo: equipoData.equipo };
    }

    // 3. Crear Rutina
    const rutinaId = await crearRutinaAutomatica(equipoData);

    // 4. Logear Éxito
    await logMotorPredictivo({
        tipo: "rutina_creada",
        rutinaId: rutinaId,
        equipo: equipoData.equipo,
        edificioId: equipoData.edificioId,
        fallas: equipoData.totalFallas
    });

    return { operacion: "creada", equipo: equipoData.equipo, id: rutinaId };
}

// ======================================================
// 6. DISPARADOR PRINCIPAL (SCHEDULER BATCHED)
// ======================================================

exports.schedulerAnalisisFallas = functions.pubsub
    .schedule("0 3 * * *") // Se ejecuta a las 3:00 AM CDMX
    .timeZone(TZ)
    .onRun(async (context) => {
        console.log("🧠 Iniciando Motor IA Predictivo V2.0...");

        try {
            // Fase 1: Recolección y Agrupación
            const equiposProblematicos = await analizarEquipos();
            const listaClaves = Object.keys(equiposProblematicos);

            if (listaClaves.length === 0) {
                console.log("ℹ️ No se detectaron correctivos para analizar hoy.");
                return null;
            }

            console.log(`📊 Equipos extraídos para análisis: ${listaClaves.length}`);

            let generadas = 0;
            let ignoradas = 0;

            // Fase 2: Procesamiento por Lotes (Control de Concurrencia)
            // Dividimos el diccionario en arrays más pequeños para no ahogar Firebase
            for (let i = 0; i < listaClaves.length; i += CONFIG.loteProcesamiento) {
                const loteClaves = listaClaves.slice(i, i + CONFIG.loteProcesamiento);
                
                const promesasLote = loteClaves.map(async (key) => {
                    const data = equiposProblematicos[key];
                    try {
                        const resultado = await procesarEquipo(key, data);
                        if (resultado.operacion === "creada") generadas++;
                        else ignoradas++;
                    } catch (err) {
                        console.error(`❌ Error analizando ${key}:`, err);
                        await logMotorPredictivo({
                            tipo: "error_analisis_equipo",
                            equipoKey: key,
                            error: err.message
                        });
                    }
                });

                // Esperamos que termine el lote de 20 antes de seguir
                await Promise.all(promesasLote);
                console.log(`⏳ Analizado lote predictivo: ${i + loteClaves.length} de ${listaClaves.length}`);
            }

            // Fase 3: Reporte Final
            console.log(`✅ Ciclo IA completado. Nuevas rutinas: ${generadas}`);
            await logMotorPredictivo({
                tipo: "analisis_diario_completado",
                equiposEvaluados: listaClaves.length,
                rutinasGeneradas: generadas,
                rutinasIgnoradas: ignoradas
            });

        } catch (error) {
            console.error("🚨 ERROR FATAL MOTOR IA:", error);
            await logMotorPredictivo({
                tipo: "error_fatal_motor",
                error: error.message
            });
        }

        return null;
    });

// ======================================================
// FIN DEL ARCHIVO
// ======================================================
