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
// LÓGICA DE FRECUENCIA Y VALIDACIÓN (V1.1 - Estabilizada)
// ======================================================

/**
 * Calcula la fecha de la siguiente ejecución basada en la frecuencia.
 * Ajuste: Usa 'ultima_generacion' como ancla para evitar el desfase (drift).
 */
function calcularProxima(rutina) {
    // Si ya existe una fecha de generación previa, la usamos como base
    // para que el calendario sea exacto. Si es nueva, usamos el 'hoy' real.
    const baseDate = (rutina.ultima_generacion && rutina.ultima_generacion.toDate) 
        ? rutina.ultima_generacion.toDate() 
        : new Date();

    const d = new Date(baseDate);

    switch (rutina.frecuencia) {
        case "diaria": 
            return addDays(d, 1);
        case "semanal": 
            return addDays(d, 7);
        case "quincenal":
        case "Semanal_Quincenal": 
            return addDays(d, 15);
        case "mensual": 
            return addMonths(d, 1);
        case "anual": 
            return addYears(d, 1);
        default: 
            return addMonths(d, 1); 
    }
}

/**
 * Valida si la rutina debe ejecutarse el día de hoy.
 * Mantiene la lógica de comparación contra el Timestamp de Firestore.
 */
function debeEjecutar(rutina) {
    // Si no hay fecha programada, es una rutina nueva: se ejecuta de inmediato.
    if (!rutina.proxima_ejecucion) return true;

    const hoy = new Date();
    
    // Convertimos el Timestamp de Firestore a Date de JS para comparar.
    const prox = rutina.proxima_ejecucion.toDate 
        ? rutina.proxima_ejecucion.toDate() 
        : new Date(rutina.proxima_ejecucion);

    // Si la fecha programada ya llegó o ya pasó, es hora de trabajar.
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
// ASIGNACIÓN Y CREACIÓN DE OT (V1.3 - Agenda Exacta y Carga Balanceada)
// ======================================================

/**
 * Selecciona al técnico responsable. 
 * Mejora: Si no hay default, busca al técnico con el skill necesario que tenga 
 * la fecha de 'ultima_asignacion' más antigua (Balanceo Round Robin).
 */
async function seleccionarTecnico(rutina) {
    // 1. Prioridad: Técnico asignado fijamente en la rutina
    if (rutina.tecnico_default) return rutina.tecnico_default;

    // 2. Si no, buscamos técnicos activos con el skill, ordenados por quién lleva más tiempo libre
    const snap = await db.collection("tecnicos")
        .where("activo", "==", true)
        .where("skills", "array-contains", rutina.categoria)
        .orderBy("ultima_asignacion", "asc") 
        .limit(1)
        .get();

    if (snap.empty) return null;

    const tecnicoDoc = snap.docs[0];
    const tecnicoId = tecnicoDoc.id;

    // 3. Marcamos al técnico como "recién asignado" para que pase al final de la fila
    await tecnicoDoc.ref.update({
        ultima_asignacion: admin.firestore.FieldValue.serverTimestamp()
    });

    return tecnicoId;
}

/**
 * Genera el documento en servicios_b2b con la estructura de Gestia.
 * Mejora: Sincroniza la fecha_programada con la agenda real de la rutina (Ajuste 4.1).
 */
async function crearServicio(rutinaId, rutina) {
    const tecnico = await seleccionarTecnico(rutina);
    const servicioRef = db.collection("servicios_b2b").doc();
    
    // USAMOS LA FECHA PROGRAMADA DE LA RUTINA. 
    // Si por algo no existe, usamos el momento actual como respaldo.
    const fechaAgenda = rutina.proxima_ejecucion || admin.firestore.Timestamp.fromDate(new Date());

    const nuevaOT = {
        tipo: "preventivo",
        origen: "rutina_auto",
        rutinaId: rutinaId,
        
        // Datos de Ubicación
        edificioId: rutina.edificioId || "sin_id",
        edificioNombre: rutina.edificioNombre || "Edificio General",
        direccion: rutina.direccion || "",

        // Datos del Trabajo
        titulo: rutina.nombre || "Mantenimiento Preventivo",
        descripcion: rutina.descripcion || "Generado automáticamente por sistema",
        sistema: rutina.sistema || "General",
        equipo: rutina.equipo || "N/A",
        categoria: rutina.categoria || "MAINT (B2B)",
        sub_servicio: rutina.sub_servicio || "Preventivo",
        id_tarea: rutina.id_tarea || `TSK-AUTO-${Date.now().toString().slice(-4)}`,

        // Asignación y Estado
        tecnico_asignado: tecnico,
        responsable: "tecnico",
        status: "pendiente",
        estado: "pendiente",
        prioridad: rutina.prioridad || "media",

        // Trazabilidad y Fechas
        creadoPor: "scheduler",
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        
        // AJUSTE 4.1: La OT queda agendada para cuando le tocaba, no cuando corrió el script
        fecha_programada: fechaAgenda
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
// DISPARADOR PRINCIPAL (SCHEDULER V1.4 - BATCHED)
// ======================================================

exports.schedulerRutinasPreventivas = functions.pubsub
    .schedule("0 2 * * *")
    .timeZone(TZ)
    .onRun(async (context) => {
        console.log("⚙️ Ejecutando Motor Preventivo V1.4 (Batched)...");

        try {
            const rutinasSnap = await db.collection("config_rutinas")
                .where("activo", "==", true)
                .get();

            if (rutinasSnap.empty) {
                console.log("ℹ️ No hay rutinas activas.");
                return null;
            }

            const totalRutinas = rutinasSnap.docs;
            const tamanoLote = 20; // Ajuste 5: Control de flujo
            let exitosas = 0;

            // Procesamiento por lotes para evitar saturación
            for (let i = 0; i < totalRutinas.length; i += tamanoLote) {
                const lote = totalRutinas.slice(i, i + tamanoLote);
                
                const promesasLote = lote.map(async (doc) => {
                    try {
                        await procesarRutina(doc);
                        exitosas++;
                    } catch (err) {
                        console.error(`❌ Error en rutina ${doc.id}:`, err);
                        await logScheduler({
                            tipo: "error_individual",
                            rutinaId: doc.id,
                            error: err.message
                        });
                    }
                });

                await Promise.all(promesasLote);
                console.log(`⏳ Lote procesado: ${i + lote.length} de ${totalRutinas.length}`);
            }

            await logScheduler({
                tipo: "resumen_ejecucion",
                total: totalRutinas.length,
                exitosas
            });

            console.log(`✅ Ciclo finalizado exitosamente.`);

        } catch (error) {
            console.error("🚨 ERROR CRÍTICO:", error);
            await logScheduler({ tipo: "error_fatal", error: error.message });
        }

        return null;
    });

// ======================================================
// FIN DEL MÓDULO
// ======================================================
