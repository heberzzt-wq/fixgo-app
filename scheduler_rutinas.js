// ======================================================
// MOTOR PREVENTIVO GESTIA PREMIUM B2B
// Archivo: scheduler_rutinas.js
// Versión: 1.0 (Integrado en Gestia V5.18)
// Propósito: Generación automática de OT preventivas
// ======================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Inicialización de Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Configuración Regional
const TZ = "America/Mexico_City";

// ======================================================
// UTILIDADES DE FECHA
// ======================================================

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

function addYears(date, years) {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() + years);
    return d;
}

// ======================================================
// LÓGICA DE FRECUENCIA Y VALIDACIÓN
// ======================================================

/**
 * Calcula la fecha de la siguiente ejecución basada en la frecuencia
 */
function calcularProxima(rutina) {
    const hoy = new Date();
    switch (rutina.frecuencia) {
        case "diaria": return addDays(hoy, 1);
        case "semanal": return addDays(hoy, 7);
        case "quincenal":
        case "Semanal_Quincenal": return addDays(hoy, 15);
        case "mensual": return addMonths(hoy, 1);
        case "anual": return addYears(hoy, 1);
        default: return addMonths(hoy, 1); 
    }
}

/**
 * Valida si la rutina debe ejecutarse el día de hoy
 */
function debeEjecutar(rutina) {
    if (!rutina.proxima_ejecucion) return true;
    const hoy = new Date();
    const prox = rutina.proxima_ejecucion.toDate ? rutina.proxima_ejecucion.toDate() : new Date(rutina.proxima_ejecucion);
    return prox <= hoy;
}

// ======================================================
// PROTECCIÓN ANTI-DUPLICADOS
// ======================================================

/**
 * Revisa si ya existe una OT para esta rutina programada para hoy.
 */
async function existeServicioHoy(rutinaId) {
    const inicio = startOfDay(new Date());
    const fin = endOfDay(new Date());
    const snap = await db.collection("servicios_b2b")
        .where("rutinaId", "==", rutinaId)
        .where("fecha_programada", ">=", admin.firestore.Timestamp.fromDate(inicio))
        .where("fecha_programada", "<=", admin.firestore.Timestamp.fromDate(fin))
        .limit(1).get();
    return !snap.empty;
}

// ======================================================
// ASIGNACIÓN Y CREACIÓN DE OT
// ======================================================

/**
 * Selecciona al técnico responsable (Skill Match)
 */
async function seleccionarTecnico(rutina) {
    if (rutina.tecnico_default) return rutina.tecnico_default;
    const snap = await db.collection("tecnicos")
        .where("activo", "==", true)
        .where("skills", "array-contains", rutina.categoria)
        .limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
}

/**
 * Genera el documento en servicios_b2b con la estructura de Gestia
 */
async function crearServicio(rutinaId, rutina) {
    const tecnico = await seleccionarTecnico(rutina);
    const servicioRef = db.collection("servicios_b2b").doc();
    const nuevaOT = {
        tipo: "preventivo",
        origen: "rutina_auto",
        rutinaId: rutinaId,
        edificioId: rutina.edificioId || "sin_id",
        edificioNombre: rutina.edificioNombre || "Edificio General",
        direccion: rutina.direccion || "",
        titulo: rutina.nombre || "Mantenimiento Preventivo",
        descripcion: rutina.descripcion || "Generado automáticamente por sistema",
        sistema: rutina.sistema || "General",
        equipo: rutina.equipo || "N/A",
        categoria: rutina.categoria || "MAINT (B2B)",
        sub_servicio: rutina.sub_servicio || "Preventivo",
        id_tarea: rutina.id_tarea || `TSK-AUTO-${Date.now().toString().slice(-4)}`,
        tecnico_asignado: tecnico,
        responsable: "tecnico",
        status: "pendiente",
        estado: "pendiente",
        prioridad: rutina.prioridad || "media",
        creadoPor: "scheduler",
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        fecha_programada: admin.firestore.Timestamp.fromDate(new Date())
    };
    await servicioRef.set(nuevaOT);
    return servicioRef.id;
}

// ======================================================
// GESTIÓN DE AUDITORÍA Y ACTUALIZACIÓN
// ======================================================

async function logScheduler(data) {
    await db.collection("logs_scheduler").add({
        ...data,
        creadoEn: admin.firestore.FieldValue.serverTimestamp()
    });
}

async function actualizarRutina(rutinaRef, rutina) {
    const proxima = calcularProxima(rutina);
    await rutinaRef.update({
        ultima_generacion: admin.firestore.FieldValue.serverTimestamp(),
        proxima_ejecucion: admin.firestore.Timestamp.fromDate(proxima)
    });
}

async function procesarRutina(doc) {
    const rutina = doc.data();
    if (!rutina.activo) return;
    if (!debeEjecutar(rutina)) return;

    const duplicado = await existeServicioHoy(doc.id);
    if (duplicado) {
        await logScheduler({
            tipo: "duplicado_evitado",
            rutinaId: doc.id,
            edificioId: rutina.edificioId
        });
        return;
    }

    const servicioId = await crearServicio(doc.id, rutina);
    await actualizarRutina(doc.ref, rutina);
    await logScheduler({
        tipo: "rutina_generada",
        rutinaId: doc.id,
        servicioId: servicioId,
        edificioId: rutina.edificioId
    });
}

// ======================================================
// DISPARADOR PRINCIPAL (SCHEDULER)
// ======================================================

/**
 * Función que corre cada día a las 2:00 AM hora CDMX
 */
exports.schedulerRutinasPreventivas = functions.pubsub
    .schedule("0 2 * * *")
    .timeZone(TZ)
    .onRun(async (context) => {
        console.log("⚙️ Iniciando ejecución diaria de rutinas preventivas...");

        try {
            // Buscamos solo rutinas activas para ahorrar capacidad de cómputo
            const rutinasSnap = await db.collection("config_rutinas")
                .where("activo", "==", true)
                .get();

            if (rutinasSnap.empty) {
                console.log("ℹ️ No hay rutinas activas para procesar.");
                return null;
            }

            let procesadas = 0;

            // Procesamos cada rutina una por una para evitar timeouts masivos
            for (const doc of rutinasSnap.docs) {
                try {
                    await procesarRutina(doc);
                    procesadas++;
                } catch (error) {
                    console.error(`❌ Error procesando rutina ${doc.id}:`, error);
                    await logScheduler({
                        tipo: "error_critico_rutina",
                        rutinaId: doc.id,
                        error: error.message
                    });
                }
            }

            console.log(`✅ Proceso finalizado. Rutinas evaluadas: ${procesadas}`);
            await logScheduler({
                tipo: "ciclo_completo_exitoso",
                totalEvaluadas: procesadas
            });

        } catch (error) {
            console.error("🚨 ERROR GENERAL EN EL SCHEDULER:", error);
            await logScheduler({
                tipo: "error_fatal_sistema",
                error: error.message
            });
        }

        return null;
    });

// ======================================================
// FIN DEL MÓDULO
// ======================================================
