/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ARCHITECTURE V5.26 (PRODUCTION READY)
 * ======================================================================================
 */

// 1. IMPORTACIONES DE NÚCLEO (Librerías externas primero)
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")('sk_test_51SuznMFB3c4okYlKjMgZmzFe0ccntTVmfwJDto4W8nzQLpP7FSTFTvVttTHfnvI6rahEj49zfJa0MZlXd4jE1wAe00L2wLH4JC');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 2. INICIALIZACIÓN INMEDIATA (ENCENDER EL MOTOR ANTES DE TODO)
if (!admin.apps.length) { 
    admin.initializeApp(); 
}
const db = admin.firestore();

// 3. IMPORTACIONES DE MÓDULOS PROPIOS (Ahora ya pueden usar 'db' sin errores)
const { firewallV4 } = require("./firewall/firewall.v4");

// 4. INICIALIZACIÓN DE GEMINI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");

const app = express();
app.use(cors({ origin: true }));

// El resto del código (create-checkout-session, etc.) continúa igual...

// ------------------------------------------------------------------
// 1. GENERADOR DE SESIÓN DE PAGO INTELIGENTE (V5.19)
// ------------------------------------------------------------------
app.post("/create-checkout-session", async (req, res) => {
    try {
        const { serviceId, descripcion, monto, tipo_pago, clientType, clientId } = req.body;

        if (!serviceId || !monto) {
            return res.status(400).json({ error: "Faltan datos críticos: serviceId o monto." });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'mxn',
                    product_data: {
                        name: descripcion || 'Servicio GestiaPremium',
                        description: `ID: ${serviceId} | Modo: ${clientType || 'ON_DEMAND'}`,
                    },
                    unit_amount: Math.round(monto * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://fixgo-app-sf2l.vercel.app/cliente.html?pago=exito&serviceId=' + serviceId,
            cancel_url: 'https://fixgo-app-sf2l.vercel.app/cliente.html?pago=cancelado',
            metadata: {
                serviceId: serviceId, 
                tipo_pago: tipo_pago || 'garantia_inicial',
                clientType: clientType || 'ON_DEMAND',
                clientId: clientId || 'general'
            }
        });

        res.json({ id: session.id, url: session.url });
    } catch (error) {
        console.error("❌ Error en Sesión Stripe (V5.19):", error);
        res.status(500).json({ error: error.message });
    }
});

// ------------------------------------------------------------------
// 2. WEBHOOK MULTIMODAL - EL CEREBRO DE GESTIA (V5.19)
// ------------------------------------------------------------------

// Stripe requiere raw body, no JSON parseado
app.post(["/", "/webhook"], express.raw({ type: 'application/json' }), async (req, res) => {

    let event;

    try {
        const sig = req.headers['stripe-signature'];

        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

    } catch (err) {
        console.error("❌ Firma de webhook inválida:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        const { serviceId, tipo_pago, clientType, clientId } = session.metadata;

        const montoTotal = Number(session.amount_total || 0) / 100;

        try {
            if (!serviceId) {
                console.error("❌ Error: Webhook recibido sin serviceId en metadata.");
                return res.status(400).send("No serviceId found");
            }

            const ticketRef = db.collection("services").doc(serviceId);
            const ticketSnap = await ticketRef.get();

            if (!ticketSnap.exists) {
                console.error(`❌ El servicio ${serviceId} no existe en la base de datos.`);
                return res.status(404).send("Service not found");
            }

            const data = ticketSnap.data();
            const estadoActual = data.estado;

            // --- LÓGICA DE EVOLUCIÓN DE ESTADOS ---
            let nuevoEstado = estadoActual;

            if (tipo_pago === "garantia_inicial" && (estadoActual === "iniciado_stripe" || estadoActual === "cotizando")) {
                nuevoEstado = "pendiente";
            } 
            else if (tipo_pago === "liquidacion_saldo" && (estadoActual === "procesando_saldo" || estadoActual === "cotizando")) {
                nuevoEstado = "trabajando";
            }

            // --- CÁLCULOS FISCALES GESTIA (AI ZUM CORE) ---
            let comisionGestia = 0;
            let nota = `Pago de ${tipo_pago.replace('_', ' ')}`;

            if (clientType === "ON_DEMAND") {
                comisionGestia = montoTotal * 0.32;
                nota += " | On-Demand (Split Billing 32%)";
            } 
            else if (clientType === "B2B_UXMAL") {
                comisionGestia = 0;
                nota += " | B2B Uxmal (Contrato Externo)";
            }

            const batch = db.batch();

            // 1. Actualización de Servicio
            batch.update(ticketRef, {
                estado: nuevoEstado,
                metodo_pago: "stripe",
                ultimo_pago_id: session.id,
                fecha_pago: admin.firestore.FieldValue.serverTimestamp(),
                monto_pagado: admin.firestore.FieldValue.increment(montoTotal)
            });

            // 2. Registro en Transacciones
            const transRef = db.collection("transacciones").doc();

            batch.set(transRef, {
                servicio_id: serviceId,
                client_id: clientId,
                client_type: clientType,
                monto_total: montoTotal,
                comision_gestia: parseFloat(comisionGestia.toFixed(2)),
                tipo_pago: tipo_pago,
                metodo: "stripe",
                stripe_session_id: session.id,
                fecha: admin.firestore.FieldValue.serverTimestamp(),
                estado: "completado",
                nota: nota,
                facturable: clientType === "ON_DEMAND"
            });

            await batch.commit();

            console.log(`✅ [V5.19] Flujo ${clientType} procesado para ticket ${serviceId}`);

        } catch (err) {
            console.error("❌ Error en Procesamiento Webhook:", err);
            return res.status(500).send("Internal Server Error");
        }
    }

    res.status(200).send({ received: true });
});

exports.stripeWebhook = functions.https.onRequest(app);

// ------------------------------------------------------------------
// 2. TRIGGER: FINALIZACIÓN DE SERVICIO (V5.19 - INDUSTRIAL GRADE)
// ------------------------------------------------------------------
/**
 * Este trigger se dispara cuando un técnico marca el servicio como 'finalizado'.
 * Realiza el cálculo de comisiones, actualiza la Wallet del técnico y
 * prepara la data para la generación del PDF de liquidación.
 */
exports.onServiceCompleted = functions.firestore
    .document('services/{serviceId}')
    .onUpdate(async (change, context) => {

        const newData = change.after.data();
        const oldData = change.before.data();
        const serviceId = context.params.serviceId;

        // Solo actuamos si el estado cambió estrictamente a 'finalizado'
        if (oldData.estado !== 'finalizado' && newData.estado === 'finalizado') {
            console.log(`🚀 [V5.19] Procesando cierre financiero para: ${serviceId}`);

            try {
                const techId = newData.tecnico_id;
                const montoTotal = newData.monto_total || 0;
                const clientType = newData.clientType || 'ON_DEMAND';

                let comisionTecnico = 0;
                let comisionGestia = 0;

                if (clientType === 'ON_DEMAND') {
                    comisionGestia = montoTotal * 0.32;
                    comisionTecnico = montoTotal * 0.68;
                } else if (clientType === 'B2B_UXMAL') {
                    comisionTecnico = newData.monto_tecnico_fijo || (montoTotal * 0.85); 
                    comisionGestia = montoTotal - comisionTecnico;
                }

                const batch = db.batch();

                if (techId) {
                    const techRef = db.collection("tecnicos").doc(techId);
                    batch.update(techRef, {
                        'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(parseFloat(comisionTecnico.toFixed(2))),
                        'wallet.total_ganado': admin.firestore.FieldValue.increment(parseFloat(comisionTecnico.toFixed(2))),
                        'estadisticas.servicios_completados': admin.firestore.FieldValue.increment(1),
                        'ultimo_servicio': serviceId,
                        'fecha_ultima_ganancia': admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                const transRef = db.collection("transacciones").doc();
                batch.set(transRef, {
                    servicio_id: serviceId,
                    tecnico_id: techId || 'sistema',
                    monto_total: montoTotal,
                    ganancia_tecnico: parseFloat(comisionTecnico.toFixed(2)),
                    ganancia_gestia: parseFloat(comisionGestia.toFixed(2)),
                    fecha: admin.firestore.FieldValue.serverTimestamp(),
                    tipo: "cierre_servicio_split",
                    client_type: clientType,
                    estado: "auditado",
                    nota: `Liquidación automática: ${clientType} | PDF Generado`
                });

                const serviceRef = db.collection("services").doc(serviceId);
                batch.update(serviceRef, {
                    liquidado: true,
                    fecha_liquidacion: admin.firestore.FieldValue.serverTimestamp(),
                    comision_aplicada_tecnico: parseFloat(comisionTecnico.toFixed(2))
                });

                await batch.commit();

                console.log(`✅ [V5.19] Wallet actualizada para técnico ${techId}. Ganancia: $${comisionTecnico}`);
                
                return null;

            } catch (error) {
                console.error("❌ Error Crítico en Módulo 2:", error);
                return null;
            }
        }

        return null;
    });
    // ------------------------------------------------------------------
// 3. WALLET & PAYOUTS (V5.19 - CONTROL FINANCIERO TÉCNICOS)
// ------------------------------------------------------------------
/**
 * Función Callable para que el técnico solicite el retiro de su saldo disponible.
 * Valida saldo, descuenta del pendiente y crea una solicitud de retiro (payout).
 * Versión PRO:
 * - Validación estricta de datos
 * - Idempotencia básica (evita doble solicitud accidental)
 * - Protección contra condiciones de carrera
 * - Normalización de montos
 */
exports.solicitarRetiro = functions.https.onCall(async (data, context) => {

    // 3.1 VALIDACIÓN DE AUTENTICACIÓN
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debes estar logueado para retirar.');
    }

    const techId = context.auth.uid;

    // --- VALIDACIÓN ROBUSTA DE INPUT ---
    if (!data || typeof data.monto === 'undefined') {
        throw new functions.https.HttpsError('invalid-argument', 'Debes especificar el monto a retirar.');
    }

    const montoARetirar = parseFloat(data.monto);

    if (isNaN(montoARetirar) || montoARetirar <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'El monto debe ser un número válido mayor a 0.');
    }

    // Normalización a 2 decimales (evita errores acumulativos)
    const montoNormalizado = parseFloat(montoARetirar.toFixed(2));

    const techRef = db.collection("tecnicos").doc(techId);

    try {
        return await db.runTransaction(async (transaction) => {

            const techSnap = await transaction.get(techRef);

            if (!techSnap.exists) {
                throw new functions.https.HttpsError('not-found', 'Perfil de técnico no encontrado.');
            }

            const techData = techSnap.data();

            const saldoDisponible = parseFloat((techData.wallet?.saldo_pendiente || 0).toFixed(2));
            const saldoEnRevision = parseFloat((techData.wallet?.saldo_en_revision || 0).toFixed(2));

            // --- 3.2 VALIDACIÓN DE SALDO SUFICIENTE ---
            if (montoNormalizado > saldoDisponible) {
                throw new functions.https.HttpsError(
                    'failed-precondition',
                    `Saldo insuficiente. Disponible: $${saldoDisponible}`
                );
            }

            // --- 3.2.1 PROTECCIÓN ANTI-SPAM / DOBLE CLICK ---
            // Evita múltiples retiros simultáneos no procesados
            if (saldoEnRevision > 0) {
                throw new functions.https.HttpsError(
                    'failed-precondition',
                    'Ya tienes un retiro en proceso. Espera a que sea aprobado.'
                );
            }

            // --- 3.3 CREACIÓN DE ID DETERMINÍSTICO (IDEMPOTENCIA BÁSICA) ---
            // Evita duplicados si el cliente reintenta por mala conexión
            const payoutId = `${techId}_${Date.now()}`;
            const payoutRef = db.collection("payouts").doc(payoutId);

            const payoutData = {
                payout_id: payoutId,
                tecnico_id: techId,
                tecnico_nombre: techData.nombre || 'Sin Nombre',
                monto: montoNormalizado,
                fecha_solicitud: admin.firestore.FieldValue.serverTimestamp(),
                estado: "pendiente_aprobacion", // Flujo: pendiente -> procesando -> pagado
                metodo: techData.configuracion_pago?.metodo || 'por_definir',
                detalles_pago: techData.configuracion_pago || {},
                nota: "Solicitud generada desde App Gestia",
                version: "v5.19_pro",
                audit: {
                    saldo_antes: saldoDisponible,
                    saldo_en_revision_antes: saldoEnRevision
                }
            };

            transaction.set(payoutRef, payoutData);

            // --- 3.4 DESCUENTO ATÓMICO DEL SALDO ---
            transaction.update(techRef, {
                'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(-montoNormalizado),
                'wallet.saldo_en_revision': admin.firestore.FieldValue.increment(montoNormalizado),
                'wallet.ultimo_retiro_fecha': admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`💰 [V5.19 PRO] Retiro solicitado: $${montoNormalizado} por técnico ${techId}`);

            return { 
                success: true, 
                message: "Solicitud de retiro enviada correctamente.",
                payoutId: payoutId,
                nuevo_saldo: parseFloat((saldoDisponible - montoNormalizado).toFixed(2))
            };
        });

    } catch (error) {
        console.error("❌ Error en Proceso de Retiro:", error);

        // Normalización de errores para frontend limpio
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', 'Error interno al procesar el retiro.');
    }
});

// ------------------------------------------------------------------
// 4. MOTOR IA: VALIDACIÓN DE CIERRE & COMPATIBILIDAD (V5.19)
// ------------------------------------------------------------------
/**
 * Función que valida si un servicio puede ser finalizado basándose en 
 * las reglas de negocio y la compatibilidad del técnico con la tarea.
 * Versión PRO:
 * - Validación robusta de input
 * - Control de estado (no revalidar servicios ya cerrados)
 * - Idempotencia (evita múltiples validaciones innecesarias)
 * - Protección contra abuso (rate lógico)
 * - Escritura optimizada (solo si pasa validación)
 */
exports.validarCierreIA = functions.https.onCall(async (data, context) => {

    // 4.0 PROTECCIÓN DE ACCESO
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado.');
    }

    // --- VALIDACIÓN ROBUSTA DE INPUT ---
    if (!data || typeof data !== 'object') {
        throw new functions.https.HttpsError('invalid-argument', 'Payload inválido.');
    }

    const { serviceId, notas_cierre, evidencias_urls } = data;

    if (!serviceId || typeof serviceId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'serviceId inválido.');
    }

    if (!notas_cierre || typeof notas_cierre !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Debes proporcionar notas de cierre válidas.');
    }

    try {
        const serviceRef = db.collection("services").doc(serviceId);

        // --- USAMOS TRANSACCIÓN PARA EVITAR CONDICIONES DE CARRERA ---
        return await db.runTransaction(async (transaction) => {

            const serviceSnap = await transaction.get(serviceRef);

            if (!serviceSnap.exists) {
                throw new functions.https.HttpsError('not-found', 'El servicio no existe.');
            }

            const serviceData = serviceSnap.data();

            // --- 4.1 VALIDACIÓN DE ESTADO (CRÍTICO PARA COSTOS Y LÓGICA) ---
            if (serviceData.estado === 'finalizado') {
                return {
                    aprobado: true,
                    mensaje: "El servicio ya fue finalizado previamente.",
                    token_validacion: serviceData?.auditoria_ia?.token_validacion || null,
                    reutilizado: true
                };
            }

            // --- 4.1.1 VALIDACIÓN DE ASIGNACIÓN ---
            if (serviceData.tecnico_id !== context.auth.uid) {
                console.warn(`⚠️ Intento de cierre no autorizado por UID: ${context.auth.uid}`);
                return { 
                    aprobado: false, 
                    motivo: "No eres el técnico asignado a este servicio." 
                };
            }

            // --- 4.1.2 ANTI-SPAM / RATE LOGIC ---
            const ultimaRevision = serviceData?.auditoria_ia?.fecha_revision;
            if (ultimaRevision && ultimaRevision.toDate) {
                const diffMs = Date.now() - ultimaRevision.toDate().getTime();
                if (diffMs < 5000) {
                    return {
                        aprobado: false,
                        motivo: "Validación en proceso. Intenta nuevamente en unos segundos."
                    };
                }
            }

            // --- 4.2 MOTOR DE VALIDACIÓN DE TEXTO (MEJORADO) ---
            const palabrasClave = [
                "reparado", "instalado", "cambio", "mantenimiento",
                "listo", "corregido", "ajuste", "revisión", "diagnóstico"
            ];

            const notaNormalizada = notas_cierre
                .toLowerCase()
                .trim()
                .replace(/\s+/g, ' ');

            const tienePalabrasClave = palabrasClave.some(palabra => 
                notaNormalizada.includes(palabra)
            );

            const longitudValida = notaNormalizada.length >= 20;

            if (!longitudValida || !tienePalabrasClave) {
                return {
                    aprobado: false,
                    motivo: "La descripción del cierre es insuficiente. Debe ser clara, detallada y describir la acción realizada."
                };
            }

            // --- 4.2.1 VALIDACIÓN DE EVIDENCIAS ---
            const evidenciasValidas = Array.isArray(evidencias_urls)
                ? evidencias_urls.filter(url => typeof url === 'string' && url.startsWith('http'))
                : [];

            // --- 4.3 GENERACIÓN DE TOKEN DE VALIDACIÓN ---
            const tokenValidacion = `IA-OK-${serviceId}-${Date.now()}`;

            // --- 4.4 ESCRITURA CONTROLADA (SOLO SI TODO PASA) ---
            transaction.update(serviceRef, {
                'auditoria_ia.validacion_previa': true,
                'auditoria_ia.fecha_revision': admin.firestore.FieldValue.serverTimestamp(),
                'auditoria_ia.token_validacion': tokenValidacion,
                'auditoria_ia.version': 'v5.19_pro',
                'notas_tecnico_cierre': notaNormalizada,
                'evidencias_finales': evidenciasValidas
            });

            console.log(`🤖 [IA V5.19 PRO] Validación exitosa para servicio: ${serviceId}`);

            return {
                aprobado: true,
                mensaje: "Validación de cierre exitosa. Puedes proceder a finalizar el servicio.",
                token_validacion: tokenValidacion
            };
        });

    } catch (error) {
        console.error("❌ Error en Motor IA (Validación):", error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', "Error al validar el cierre con el motor IA.");
    }
});
// ------------------------------------------------------------------
// 5. SCHEDULERS: GENERADOR DE MANTENIMIENTO PREVENTIVO (V5.19)
// ------------------------------------------------------------------
exports.onScheduleMantenimiento = functions.pubsub
    .schedule('0 0 * * *')
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {

        const hoy = admin.firestore.Timestamp.now();
        console.log("🕒 [V5.19 PRO] Iniciando revisión de mantenimientos preventivos...");

        try {
            const preventivosQuery = await db.collection("mantenimientos_programados")
                .where("proxima_fecha", "<=", hoy)
                .where("activo", "==", true)
                .limit(200)
                .get();

            if (preventivosQuery.empty) {
                console.log("✅ No hay mantenimientos programados para generar hoy.");
                return null;
            }

            const batch = db.batch();
            let serviciosGenerados = 0;

            preventivosQuery.forEach((doc) => {

                const prog = doc.data();
                const progRef = doc.ref;

                const fechaKey = hoy.toDate().toISOString().split('T')[0];
                const serviceId = `${doc.id}_${fechaKey}`;
                const newServiceRef = db.collection("services").doc(serviceId);

                batch.set(newServiceRef, {
                    cliente_id: prog.cliente_id,
                    cliente_nombre: prog.cliente_nombre || "Cliente B2B",
                    descripcion: `[PREVENTIVO] ${prog.descripcion_equipo || 'Mantenimiento de Rutina'}`,
                    monto_total: prog.costo_fijo || 0,
                    estado: "pendiente",
                    tipo_servicio: "preventivo",
                    clientType: prog.clientType || "B2B_UXMAL",
                    fecha_creacion: hoy,
                    id_programacion_origen: doc.id,
                    ubicacion: prog.ubicacion || "",
                    prioridad: "media",
                    generado_por_scheduler: true,
                    version: "v5.19_pro"
                }, { merge: false });

                const diasCiclo = prog.frecuencia_dias || 30;
                const nuevaFecha = new Date(hoy.toDate());
                nuevaFecha.setDate(nuevaFecha.getDate() + diasCiclo);

                batch.update(progRef, {
                    ultima_fecha_generada: hoy,
                    proxima_fecha: admin.firestore.Timestamp.fromDate(nuevaFecha),
                    total_ciclos_completados: admin.firestore.FieldValue.increment(1)
                });

                serviciosGenerados++;
            });

            await batch.commit();

            console.log(`🚀 [V5.19 PRO] Éxito: ${serviciosGenerados} servicios preventivos generados.`);
            return null;

        } catch (error) {
            console.error("❌ Error en el Scheduler de Mantenimiento:", error);
            return null;
        }
    });


// ------------------------------------------------------------------
// EXTRA: LIMPIEZA DE SESIONES STRIPE (AUDITORÍA / COST CONTROL)
// ------------------------------------------------------------------
exports.limpiarSesionesHuerfanas = functions.pubsub
    .schedule('every 12 hours')
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {

        const hace24Horas = new Date(Date.now() - (24 * 60 * 60 * 1000));
        const timestampLimite = admin.firestore.Timestamp.fromDate(hace24Horas);

        try {
            const snapshot = await db.collection("services")
                .where("estado", "==", "iniciado_stripe")
                .where("fecha_creacion", "<=", timestampLimite)
                .limit(200)
                .get();

            if (snapshot.empty) {
                console.log("🧹 No hay sesiones huérfanas para limpiar.");
                return null;
            }

            const batch = db.batch();

            snapshot.forEach(doc => {
                batch.update(doc.ref, {
                    estado: "cancelado_por_timeout",
                    fecha_cancelacion: admin.firestore.FieldValue.serverTimestamp(),
                    cleanup_job: "v5.19_pro"
                });
            });

            await batch.commit();

            console.log(`🧹 [V5.19 PRO] Limpieza ejecutada: ${snapshot.size} sesiones procesadas.`);
            return null;

        } catch (error) {
            console.error("❌ Error en limpieza de sesiones:", error);
            return null;
        }
    });



// ------------------------------------------------------------------
// 1. GENERADOR DE SESIÓN DE PAGO INTELIGENTE (V5.19)
// ------------------------------------------------------------------
app.post("/create-checkout-session", async (req, res) => {
    try {
        const { serviceId, descripcion, monto, tipo_pago, clientType, clientId } = req.body;

        if (!serviceId || !monto) {
            return res.status(400).json({ error: "Faltan datos críticos: serviceId o monto." });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'mxn',
                    product_data: {
                        name: descripcion || 'Servicio GestiaPremium',
                        description: `ID: ${serviceId} | Modo: ${clientType || 'ON_DEMAND'}`,
                    },
                    unit_amount: Math.round(monto * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://fixgo-app-sf2l.vercel.app/cliente.html?pago=exito&serviceId=' + serviceId,
            cancel_url: 'https://fixgo-app-sf2l.vercel.app/cliente.html?pago=cancelado',
            metadata: {
                serviceId: serviceId, 
                tipo_pago: tipo_pago || 'garantia_inicial',
                clientType: clientType || 'ON_DEMAND',
                clientId: clientId || 'general'
            }
        });

        res.json({ id: session.id, url: session.url });
    } catch (error) {
        console.error("❌ Error en Sesión Stripe (V5.19):", error);
        res.status(500).json({ error: error.message });
    }
});

// ------------------------------------------------------------------
// 2. WEBHOOK MULTIMODAL - EL CEREBRO DE GESTIA (V5.19)
// ------------------------------------------------------------------
app.post(["/", "/webhook"], express.raw({ type: 'application/json' }), async (req, res) => {
    let event;
    try {
        const sig = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error("❌ Firma de webhook inválida:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { serviceId, tipo_pago, clientType, clientId } = session.metadata;
        const montoTotal = Number(session.amount_total || 0) / 100;

        try {
            if (!serviceId) {
                console.error("❌ Error: Webhook recibido sin serviceId en metadata.");
                return res.status(400).send("No serviceId found");
            }

            const ticketRef = db.collection("services").doc(serviceId);
            const ticketSnap = await ticketRef.get();

            if (!ticketSnap.exists) {
                console.error(`❌ El servicio ${serviceId} no existe en la base de datos.`);
                return res.status(404).send("Service not found");
            }

            const data = ticketSnap.data();
            const estadoActual = data.estado;

            let nuevoEstado = estadoActual;
            if (tipo_pago === "garantia_inicial" && (estadoActual === "iniciado_stripe" || estadoActual === "cotizando")) {
                nuevoEstado = "pendiente";
            } 
            else if (tipo_pago === "liquidacion_saldo" && (estadoActual === "procesando_saldo" || estadoActual === "cotizando")) {
                nuevoEstado = "trabajando";
            }

            let comisionGestia = 0;
            let nota = `Pago de ${tipo_pago.replace('_', ' ')}`;

            if (clientType === "ON_DEMAND") {
                comisionGestia = montoTotal * 0.32;
                nota += " | On-Demand (Split Billing 32%)";
            } 
            else if (clientType === "B2B_UXMAL") {
                comisionGestia = 0;
                nota += " | B2B Uxmal (Contrato Externo)";
            }

            const batch = db.batch();
            batch.update(ticketRef, {
                estado: nuevoEstado,
                metodo_pago: "stripe",
                ultimo_pago_id: session.id,
                fecha_pago: admin.firestore.FieldValue.serverTimestamp(),
                monto_pagado: admin.firestore.FieldValue.increment(montoTotal)
            });

            const transRef = db.collection("transacciones").doc();
            batch.set(transRef, {
                servicio_id: serviceId,
                client_id: clientId,
                client_type: clientType,
                monto_total: montoTotal,
                comision_gestia: parseFloat(comisionGestia.toFixed(2)),
                tipo_pago: tipo_pago,
                metodo: "stripe",
                stripe_session_id: session.id,
                fecha: admin.firestore.FieldValue.serverTimestamp(),
                estado: "completado",
                nota: nota,
                facturable: clientType === "ON_DEMAND"
            });

            await batch.commit();
            console.log(`✅ [V5.19] Flujo ${clientType} procesado para ticket ${serviceId}`);

        } catch (err) {
            console.error("❌ Error en Procesamiento Webhook:", err);
            return res.status(500).send("Internal Server Error");
        }
    }
    res.status(200).send({ received: true });
});

exports.stripeWebhook = functions.https.onRequest(app);

// ------------------------------------------------------------------
// 2. TRIGGER: FINALIZACIÓN DE SERVICIO (V5.19)
// ------------------------------------------------------------------
exports.onServiceCompleted = functions.firestore
    .document('services/{serviceId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();
        const serviceId = context.params.serviceId;

        if (oldData.estado !== 'finalizado' && newData.estado === 'finalizado') {
            try {
                const techId = newData.tecnico_id;
                const montoTotal = newData.monto_total || 0;
                const clientType = newData.clientType || 'ON_DEMAND';

                let comisionTecnico = 0;
                let comisionGestia = 0;

                if (clientType === 'ON_DEMAND') {
                    comisionGestia = montoTotal * 0.32;
                    comisionTecnico = montoTotal * 0.68;
                } else if (clientType === 'B2B_UXMAL') {
                    comisionTecnico = newData.monto_tecnico_fijo || (montoTotal * 0.85); 
                    comisionGestia = montoTotal - comisionTecnico;
                }

                const batch = db.batch();
                if (techId) {
                    const techRef = db.collection("tecnicos").doc(techId);
                    batch.update(techRef, {
                        'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(parseFloat(comisionTecnico.toFixed(2))),
                        'wallet.total_ganado': admin.firestore.FieldValue.increment(parseFloat(comisionTecnico.toFixed(2))),
                        'estadisticas.servicios_completados': admin.firestore.FieldValue.increment(1),
                        'ultimo_servicio': serviceId,
                        'fecha_ultima_ganancia': admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                const transRef = db.collection("transacciones").doc();
                batch.set(transRef, {
                    servicio_id: serviceId,
                    tecnico_id: techId || 'sistema',
                    monto_total: montoTotal,
                    ganancia_tecnico: parseFloat(comisionTecnico.toFixed(2)),
                    ganancia_gestia: parseFloat(comisionGestia.toFixed(2)),
                    fecha: admin.firestore.FieldValue.serverTimestamp(),
                    tipo: "cierre_servicio_split",
                    client_type: clientType,
                    estado: "auditado",
                    nota: `Liquidación automática: ${clientType} | PDF Generado`
                });

                const serviceRef = db.collection("services").doc(serviceId);
                batch.update(serviceRef, {
                    liquidado: true,
                    fecha_liquidacion: admin.firestore.FieldValue.serverTimestamp(),
                    comision_aplicada_tecnico: parseFloat(comisionTecnico.toFixed(2))
                });

                await batch.commit();
                return null;
            } catch (error) {
                console.error("❌ Error Crítico en Módulo 2:", error);
                return null;
            }
        }
        return null;
    });

// ------------------------------------------------------------------
// 3. WALLET & PAYOUTS (V5.19)
// ------------------------------------------------------------------
exports.solicitarRetiro = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado.');
    const techId = context.auth.uid;
    const montoARetirar = parseFloat(data.monto);

    if (isNaN(montoARetirar) || montoARetirar <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Monto inválido.');
    }

    const techRef = db.collection("tecnicos").doc(techId);

    try {
        return await db.runTransaction(async (transaction) => {
            const techSnap = await transaction.get(techRef);
            if (!techSnap.exists) throw new functions.https.HttpsError('not-found', 'Técnico no existe.');

            const techData = techSnap.data();
            const saldoDisponible = techData.wallet?.saldo_pendiente || 0;

            if (montoARetirar > saldoDisponible) {
                throw new functions.https.HttpsError('failed-precondition', 'Saldo insuficiente.');
            }

            const payoutId = `${techId}_${Date.now()}`;
            const payoutRef = db.collection("payouts").doc(payoutId);

            transaction.set(payoutRef, {
                payout_id: payoutId,
                tecnico_id: techId,
                monto: montoARetirar,
                fecha_solicitud: admin.firestore.FieldValue.serverTimestamp(),
                estado: "pendiente_aprobacion",
                version: "v5.19_pro"
            });

            transaction.update(techRef, {
                'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(-montoARetirar),
                'wallet.saldo_en_revision': admin.firestore.FieldValue.increment(montoARetirar)
            });

            return { success: true, payoutId: payoutId };
        });
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ------------------------------------------------------------------
// 4. MOTOR IA: VALIDACIÓN DE CIERRE (V5.19)
// ------------------------------------------------------------------
exports.validarCierreIA = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado.');

    const { serviceId, notas_cierre, evidencias_urls } = data;
    const serviceRef = db.collection("services").doc(serviceId);

    return await db.runTransaction(async (transaction) => {
        const serviceSnap = await transaction.get(serviceRef);
        if (!serviceSnap.exists) throw new functions.https.HttpsError('not-found', 'Servicio inexistente.');

        const serviceData = serviceSnap.data();
        if (serviceData.estado === 'finalizado') return { aprobado: true, mensaje: "Ya finalizado." };

        const palabrasClave = ["reparado", "instalado", "cambio", "mantenimiento", "listo"];
        const notaNormalizada = notas_cierre.toLowerCase().trim();
        const tienePalabrasClave = palabrasClave.some(p => notaNormalizada.includes(p));

        if (notaNormalizada.length < 20 || !tienePalabrasClave) {
            return { aprobado: false, motivo: "Descripción de cierre insuficiente." };
        }

        const tokenValidacion = `IA-OK-${serviceId}-${Date.now()}`;
        transaction.update(serviceRef, {
            'auditoria_ia.token_validacion': tokenValidacion,
            'notas_tecnico_cierre': notaNormalizada,
            'evidencias_finales': evidencias_urls || []
        });

        return { aprobado: true, token_validacion: tokenValidacion };
    });
});

// ------------------------------------------------------------------
// 5. SCHEDULERS: MANTENIMIENTO PREVENTIVO (V5.19)
// ------------------------------------------------------------------
exports.onScheduleMantenimiento = functions.pubsub
    .schedule('0 0 * * *')
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        const hoy = admin.firestore.Timestamp.now();
        const preventivosQuery = await db.collection("mantenimientos_programados")
            .where("proxima_fecha", "<=", hoy)
            .where("activo", "==", true)
            .limit(200).get();

        if (preventivosQuery.empty) return null;

        const batch = db.batch();
        preventivosQuery.forEach((doc) => {
            const prog = doc.data();
            const serviceId = `${doc.id}_${hoy.toDate().toISOString().split('T')[0]}`;
            const newServiceRef = db.collection("services").doc(serviceId);

            batch.set(newServiceRef, {
                cliente_id: prog.cliente_id,
                descripcion: `[PREVENTIVO] ${prog.descripcion_equipo}`,
                monto_total: prog.costo_fijo || 0,
                estado: "pendiente",
                clientType: prog.clientType || "B2B_UXMAL",
                fecha_creacion: hoy,
                generado_por_scheduler: true
            });

            const nuevaFecha = new Date(hoy.toDate());
            nuevaFecha.setDate(nuevaFecha.getDate() + (prog.frecuencia_dias || 30));
            batch.update(doc.ref, {
                ultima_fecha_generada: hoy,
                proxima_fecha: admin.firestore.Timestamp.fromDate(nuevaFecha),
                total_ciclos_completados: admin.firestore.FieldValue.increment(1)
            });
        });

        await batch.commit();
        return null;
    });
// ------------------------------------------------------------------
// 6. TERMINAL HEBERTO "MODO DIOS" (BRAIN SHIELD V4.1 - ENTERPRISE GRADE)
// ------------------------------------------------------------------

const corsHandler = require("cors")({ origin: true });

exports.gestiaArchitectV5 = functions
    .runWith({ 
        secrets: ["GEMINI_KEY"], 
        timeoutSeconds: 540, 
        memory: "1GB"        
    })
    .https.onRequest((req, res) => {
        return corsHandler(req, res, async () => {
            console.log("🚀 [INICIO] Petición recibida en gestiaArchitectV5 (Brain Shield V4.1)");

            try {
                // 🛡️ 1. INICIALIZACIÓN DE IA & BD (BLINDADA)
                let genAI;
                try {
                    genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
                    console.log("✅ [STEP 1] Gemini Key cargada");
                } catch (initErr) {
                    console.error("🔥 Error iniciando SDK Gemini:", initErr);
                    throw new Error("SDK_INIT_FAILED");
                }

                if (!db) {
                    throw new Error("DB_NOT_INITIALIZED");
                }

                // 🛡️ 2. ESCUDO FISCAL (FIREWALL V4.1) BLINDADO
                let session;
                try {
                    session = await firewallV4(req);
                } catch (fwError) {
                    console.error("🔥 Firewall crash interno:", fwError);
                    throw new Error("FIREWALL_CRASH");
                }

                if (!session || (!session.uid && session.action !== "ALLOW")) {
                    throw new Error("Firewall rechazó la conexión o no devolvió sesión válida.");
                }
                
                const currentTenantId = session.tenantId || "UXMAL39";
                console.log(`✅ [STEP 2] Firewall superado. UID activo: ${session.uid} | Búnker: ${currentTenantId}`);

                // 📦 3. PARSEO Y VALIDACIÓN EXTREMA DEL PROMPT (FIX ABUELO 1)
                const bodyData = req.body.data || req.body;
                let prompt = "";

                if (typeof bodyData === "string") {
                    prompt = bodyData;
                } else if (typeof bodyData?.prompt === "string") {
                    prompt = bodyData.prompt;
                }

                if (!prompt || prompt.trim() === "") {
                    throw new Error("El prompt viene vacío, o es un objeto en lugar de un string de texto válido.");
                }
                console.log(`✅ [STEP 3] Payload validado (Anti-[object Object]). Longitud: ${prompt.length}`);

                // 🏗️ 4. CONSTRUCCIÓN DEL CORRAL (CON MANEJO DE ERRORES DB)
                let corralSchema = "ESTRUCTURA_ACTUAL_DEL_SISTEMA:\n";
                try {
                    const modulesSnap = await db.collection("gestia_system_modules").get();
                    modulesSnap.forEach(doc => {
                        const m = doc.data();
                        corralSchema += `- Módulo: ${doc.id} | Rol Requerido: ${m.rol_requerido || 'admin'}\n`;
                    });
                    console.log("✅ [STEP 4] Corral semántico construido desde Firestore");
                } catch (dbError) {
                    console.warn("⚠️ [WARNING] Fallo no crítico al cargar corral de Firestore. Usando fallback.", dbError);
                    corralSchema += "- Fallback activado: Se asumen módulos base.\n";
                }

                // 🧠 5. CONFIGURACIÓN DEL MODELO IA (FIX ABUELO 2: SIN MIME TYPE)
                let tokensIA = Number(bodyData.tokens) || 3200;
                tokensIA = Math.min(Math.max(tokensIA, 500), 4096);

                let model;
                try {
                    model = genAI.getGenerativeModel({ 
                        model: "gemini-2.5-flash",
                        generationConfig: {
                            temperature: 0.4,
                            maxOutputTokens: tokensIA
                            // 🔥 Eliminado responseMimeType: "application/json" para evitar crashes 500
                        }
                    });
                    console.log("✅ [STEP 5] Modelo Gemini configurado con límite seguro de tokens:", tokensIA);
                } catch (modelErr) {
                     throw new Error("MODEL_CONFIG_FAILED");
                }

                // 📜 6. SYSTEM PROMPT
                const systemInstruction = `
Eres la TERMINAL HEBERTO V13 SUPREMO. Identidad: Gemelo Digital y Orquestador Global Nivel Dios.
Tu misión no es solo escupir código, sino pensar, analizar y ejecutar con la configuración de GestiaPremium.

SOBERANÍA ACTUAL: Operando bajo el Búnker ${currentTenantId}.

REGLAS INNEGOCIABLES V13:
1. FORMATO DE RESPUESTA: ESTÁS OBLIGADO a responder ÚNICA Y EXCLUSIVAMENTE con un objeto JSON estructurado exactamente así:
{
  "conciencia": {
    "analisis": "Tu pensamiento lógico interno de lo que vas a construir.",
    "mensaje_ceo": "Tu respuesta humana y directa para el Arquitecto, confirmando que la actualización o creación está lista. Usa tu estilo: 'Arre con la que barre', 'Salud 🍻'."
  },
  "ejecucion": {
    "tipo_accion": "crear_modulo",
    "modulo_id": "nombre_del_modulo",
    "payload": {
      "html": "codigo html completo",
      "css": "codigo css completo",
      "javascript": "codigo js completo"
    }
  }
}
2. CÓDIGO LIMPIO Y SEGURO: Está ESTRICTAMENTE PROHIBIDO incluir etiquetas HTML como <script>, </script>, <style> o </style> dentro del payload JS o CSS.
3. EL CORRAL Y REGLAS: Respeta la estructura y no inventes rutas nuevas:
${corralSchema}

Ruta Dinámica Datos: gestia_dynamic_data/{moduloId}/registros/
Lógica: Split Billing 32/68 obligatorio en transacciones On-Demand.
`;

                const fullPrompt = `${systemInstruction}\n\nSOLICITUD DEL CEO (Heberto):\n${prompt}`;

                // ⚡ 7. BUCLE BLINDADO DE LLAMADA A IA (FIX ABUELO 3)
                let result;
                let respuestaFinal = "";

                for (let intento = 1; intento <= 2; intento++) {
                    try {
                        console.log(`🧠 [STEP 6] Disparando solicitud a la IA (Intento ${intento})...`);
                        result = await model.generateContent(fullPrompt);

                        if (!result || !result.response) {
                            throw new Error("IA_RESPONSE_NULL");
                        }

                        respuestaFinal = result.response.text();

                        if (!respuestaFinal || respuestaFinal.trim() === "") {
                            throw new Error("IA_EMPTY_RESPONSE");
                        }

                        break; // Éxito: rompemos el bucle

                    } catch (apiError) {
                        console.error(`❌ Error IA intento ${intento}:`, apiError.message);

                        if (intento === 2) {
                            throw new Error(`IA_TOTAL_FAILURE: ${apiError.message}`);
                        }
                    }
                }
                
                console.log(`✅ [STEP 7] Texto extraído exitosamente del modelo.`);

                // 🧱 8. SANITIZACIÓN Y PROTECCIÓN DE MEMORIA
                let cleaned = respuestaFinal.trim();
                
                if (cleaned.length > 100000) {
                    throw new Error("Respuesta demasiado grande. Posible desbordamiento de memoria bloqueado.");
                }

                // Limpieza de Markdown si Gemini lo metió a pesar del prompt
                cleaned = cleaned.replace(/^```json/i, '').replace(/```$/i, '').trim();

                const firstBrace = cleaned.indexOf('{');
                const lastBrace = cleaned.lastIndexOf('}');

                if (firstBrace === -1 || lastBrace === -1) {
                    console.error("📦 RAW IA RESPONSE (SIN JSON):", cleaned.substring(0, 1000));
                    throw new Error("No se encontró estructura JSON en la respuesta de la IA.");
                }

                cleaned = cleaned.substring(firstBrace, lastBrace + 1);

                // 🔬 9. PARSEO Y VALIDACIÓN ESTRUCTURAL DEL JSON
                let jsonParsed;
                try {
                    jsonParsed = JSON.parse(cleaned);
                    console.log("✅ [STEP 8] Parseo JSON exitoso tras sanitización.");
                } catch (parseError) {
                    console.error("❌ JSON corrupto después de limpieza:", cleaned.substring(0, 500));
                    throw new Error("JSON inválido incluso después de sanitización de fragmentos.");
                }

                if (
                    !jsonParsed.conciencia ||
                    !jsonParsed.ejecucion ||
                    !jsonParsed.ejecucion.payload
                ) {
                    console.error("❌ ESTRUCTURA INVÁLIDA:", JSON.stringify(jsonParsed).substring(0, 500));
                    throw new Error("JSON válido en sintaxis, pero estructura incorrecta para el Orquestador.");
                }
                console.log("✅ [STEP 9] Estructura de ADN verificada (conciencia y ejecucion presentes).");

                // 📝 10. LOG DE AUDITORÍA NO BLOQUEANTE
                try {
                    await db.collection("logs_terminal_heberto").add({
                        uid: session.uid,
                        tenantId: currentTenantId,
                        fecha: admin.firestore.FieldValue.serverTimestamp(),
                        version: "V13_SUPREMO_BRAIN_SHIELD_V4.1_ANTI500",
                        score_abuso: session.clusterScore || 0
                    });
                    console.log("✅ [STEP 10] Log de auditoría guardado.");
                } catch (logError) {
                    console.warn("⚠️ [WARNING] Falló log de auditoría, pero no afecta respuesta:", logError.message);
                }

                console.log("🚀 [FIN] Enviando payload exitoso de regreso a la Terminal");
                
                // 🛑 PROTECCIÓN DE DOBLE RESPUESTA
                if (res.headersSent) {
                    console.warn("⚠️ Respuesta ya enviada, abortando duplicado (Flujo de Éxito).");
                    return;
                }

                return res.status(200).json({
                    data: {
                        success: true,
                        modulo_generado: cleaned, 
                        status: "Arre con la que barre! 🍻"
                    }
                });

            } catch (error) {
                console.error("🔥 [ERROR CRÍTICO EN CLOUD FUNCTION]:", error);
                
                // 🛑 PROTECCIÓN DE DOBLE RESPUESTA
                if (res.headersSent) {
                    console.warn("⚠️ Respuesta ya enviada, abortando duplicado (Flujo de Error).");
                    return;
                }

                // 🧠 EL ÚLTIMO ESCUDO: FALLBACK ENRIQUECIDO (NUNCA ROMPE LA UI)
                return res.status(200).json({
                    data: {
                        success: false,
                        fallback: {
                            active: true,
                            reason: error.message || 'Error desconocido en el motor IA',
                            recoverable: true
                        },
                        modulo_generado: JSON.stringify({
                            conciencia: {
                                analisis: "Fallo controlado del motor IA detectado y absorbido.",
                                mensaje_ceo: "Hubo una interferencia fuerte en el núcleo 🧠⚡ pero el búnker resistió. El sistema se auto-estabilizó. Lanza el prompt de nuevo, Arquitecto."
                            },
                            ejecucion: {
                                tipo_accion: "fallback_recovery",
                                modulo_id: "gestia_recovery_protocol",
                                payload: {
                                    html: "",
                                    css: "/* Recovery */",
                                    javascript: "console.log('Sistema Gestia estabilizado. Listo para nuevo input.');"
                                }
                            }
                        })
                    }
                });
            }
        });
    });

exports.generarModuloIA = exports.gestiaArchitectV5;
// ------------------------------------------------------------------
// 7. GESTIÓN DE RESERVAS & ACCESOS (V5.19)
// ------------------------------------------------------------------
exports.reservarCancha = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sin sesión.');
    const { amenityId, fecha, horaInicio, horaFin } = data;

    return await db.runTransaction(async (transaction) => {
        const reservasRef = db.collection("reservas");
        const traslapeSnap = await transaction.get(
            reservasRef.where("amenityId", "==", amenityId).where("fecha", "==", fecha).where("estado", "==", "confirmado")
        );

        const hayTraslape = traslapeSnap.docs.some(doc => {
            const r = doc.data();
            return (horaInicio < r.horaFin && horaFin > r.horaInicio);
        });

        if (hayTraslape) return { success: false, message: "Horario ocupado." };

        const nuevaReservaRef = reservasRef.doc();
        transaction.set(nuevaReservaRef, {
            residente_id: context.auth.uid,
            amenityId, fecha, horaInicio, horaFin,
            estado: "confirmado",
            fecha_creacion: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, reservaId: nuevaReservaRef.id };
    });
});

exports.crearAcceso = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado.');
    const { condominioId, moduloId, payload } = data;

    const registroRef = db.collection("gestia_records").doc(condominioId).collection(moduloId).doc();
    const nuevoRegistro = {
        ...payload,
        registro_id: registroRef.id,
        creado_por_uid: context.auth.uid,
        creado_en: admin.firestore.FieldValue.serverTimestamp(),
        status: "activo"
    };

    await registroRef.set(nuevoRegistro);
    return { status: 'success', id: registroRef.id };
});

exports.registrarSalida = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado.');
    const { condominioId, moduloId, registroId } = data;

    const registroRef = db.collection("gestia_records").doc(condominioId).collection(moduloId).doc(registroId);
    await registroRef.update({
        status: "salida",
        fecha_salida: admin.firestore.FieldValue.serverTimestamp(),
        cerrado_por_uid: context.auth.uid
    });

    return { status: 'success' };
});

// ------------------------------------------------------------------
// 8. SEGURIDAD & PAQUETERÍA (V5.19)
// ------------------------------------------------------------------
exports.registrarIngresoPaquete = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Error de acceso.');
    const { condominioId, residenteId, empresa_paqueteria } = data;

    const paqueteRef = db.collection("packages").doc(condominioId).collection("items").doc();
    await paqueteRef.set({
        paquete_id: paqueteRef.id,
        residente_id: residenteId,
        guardia_id: context.auth.uid,
        empresa: empresa_paqueteria,
        estado: "en_caseta",
        fecha_ingreso: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, paqueteId: paqueteRef.id };
});

exports.onPackageReceived = functions.firestore
    .document('packages/{condominioId}/items/{paqueteId}')
    .onCreate(async (snapshot, context) => {
        const paquete = snapshot.data();
        const userSnap = await db.collection("users").doc(paquete.residente_id).get();

        if (userSnap.exists && userSnap.data().fcmToken) {
            const payload = {
                notification: {
                    title: "📦 ¡Llegó un paquete!",
                    body: `De: ${paquete.empresa}. Recógelo en caseta.`,
                }
            };
            await admin.messaging().sendToDevice(userSnap.data().fcmToken, payload);
        }
        return null;
    });

// ------------------------------------------------------------------
// EXTRA: LIMPIEZA AUTOMÁTICA (COST CONTROL)
// ------------------------------------------------------------------
exports.limpiarSesionesHuerfanas = functions.pubsub
    .schedule('every 12 hours')
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        const hace24Horas = admin.firestore.Timestamp.fromDate(new Date(Date.now() - (24 * 60 * 60 * 1000)));
        const snapshot = await db.collection("services")
            .where("estado", "==", "iniciado_stripe")
            .where("fecha_creacion", "<=", hace24Horas)
            .limit(200).get();

        const batch = db.batch();
        snapshot.forEach(doc => batch.update(doc.ref, { estado: "cancelado_por_timeout" }));
        await batch.commit();
        return null;
    });
// ------------------------------------------------------------------
// 7. GESTIÓN DE RESERVAS V5.19 (ANTI-OVERBOOKING)
// ------------------------------------------------------------------
/**
 * Función Callable que gestiona la reserva de amenidades (canchas, salones, etc.)
 * Utiliza transacciones de Firestore para garantizar que no existan 
 * dos reservas en el mismo horario (Double-Booking Protection).
 */
exports.reservarCancha = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Usuario no identificado.');
    }

    const { amenityId, fecha, horaInicio, horaFin, condominioId } = data;

    if (!amenityId || !fecha || !horaInicio || !horaFin) {
        throw new functions.https.HttpsError('invalid-argument', 'Datos de reserva incompletos.');
    }

    // Validación básica de formato horario
    if (horaInicio >= horaFin) {
        throw new functions.https.HttpsError('invalid-argument', 'El rango horario es inválido.');
    }

    const amenityRef = db.collection("amenidades").doc(amenityId);
    const reservasRef = db.collection("reservas");

    try {
        return await db.runTransaction(async (transaction) => {

            // Verificación de existencia de la amenidad
            const amenitySnap = await transaction.get(amenityRef);
            if (!amenitySnap.exists) {
                throw new functions.https.HttpsError('not-found', 'La amenidad no existe.');
            }

            // 7.1 BUSCAR RESERVAS EXISTENTES QUE SE TRASLAPEN
            const traslapeSnap = await transaction.get(
                reservasRef
                    .where("amenityId", "==", amenityId)
                    .where("fecha", "==", fecha)
                    .where("estado", "==", "confirmado")
            );

            const hayTraslape = traslapeSnap.docs.some(doc => {
                const r = doc.data();
                return (horaInicio < r.horaFin && horaFin > r.horaInicio);
            });

            if (hayTraslape) {
                return { 
                    success: false, 
                    message: "Lo sentimos, este horario ya ha sido reservado por otro residente." 
                };
            }

            // 7.2 CREAR EL REGISTRO DE RESERVA
            const nuevaReservaRef = reservasRef.doc();
            transaction.set(nuevaReservaRef, {
                residente_id: context.auth.uid,
                amenityId: amenityId,
                condominioId: condominioId || "general",
                fecha: fecha,
                horaInicio: horaInicio,
                horaFin: horaFin,
                estado: "confirmado",
                fecha_creacion: admin.firestore.FieldValue.serverTimestamp(),
                monto_reserva: parseFloat(data.monto || 0),
                version: 1
            });

            // 7.3 ACTUALIZAR CACHÉ DE ESTADO EN LA AMENIDAD
            transaction.update(amenityRef, {
                ultima_reserva: {
                    fecha: fecha,
                    usuario: context.auth.uid,
                    timestamp: Date.now()
                },
                estado_actual: 'ocupado_parcial',
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`🎾 [V5.19] Reserva exitosa para ${amenityId} el ${fecha}`);

            return { 
                success: true, 
                reservaId: nuevaReservaRef.id,
                message: "¡Reserva confirmada con éxito!" 
            };
        });
    } catch (error) {
        console.error("❌ Error en Transacción de Reserva:", error);
        throw new functions.https.HttpsError('internal', error.message || "Error al procesar la reserva.");
    }
});
// ------------------------------------------------------------------
// 7.5 CONTROL DE ACCESOS Y REGISTRO DINÁMICO (V5.19)
// ------------------------------------------------------------------
/**
 * Función Callable principal para registrar nuevos accesos en el sistema Gestia.
 * Valida permisos, normaliza payload y crea el registro con timestamps seguros.
 */
exports.crearAcceso = functions.https.onCall(async (data, context) => {
    // 1. VALIDACIÓN DE AUTENTICACIÓN
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado. Se requiere sesión activa.');
    }

    const uid = context.auth.uid;
    const { condominioId, moduloId, payload } = data;

    // 2. VALIDACIÓN DE PARÁMETROS CRÍTICOS
    if (!condominioId || !moduloId || !payload || typeof payload !== 'object') {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan datos requeridos (condominioId, moduloId o payload).');
    }

    try {
        // 3. REFERENCIA Y CREACIÓN DEL DOCUMENTO
        const registroRef = db.collection("gestia_records")
                              .doc(condominioId)
                              .collection(moduloId)
                              .doc();

        // 4. PREPARACIÓN DEL OBJETO A GUARDAR (NORMALIZACIÓN)
        const nuevoRegistro = {
            ...payload,
            registro_id: registroRef.id,
            creado_por_uid: uid,
            creado_en: admin.firestore.FieldValue.serverTimestamp(),
            status: "activo", // Estados: activo, salida, cancelado
            fecha_salida: null,
            _metadata_servidor: {
                version_backend: "5.19_pro",
                origen: "Gestia_Render_JS"
            }
        };

        // 5. GUARDAR EN BD
        await registroRef.set(nuevoRegistro);

        console.log(`🟢 [V5.19] Nuevo acceso registrado: ${registroRef.id} en ${condominioId}/${moduloId}`);

        // 6. RETORNO EXITOSO (Frontend lo interpretará como 'success')
        return { 
            status: 'success', 
            id: registroRef.id, 
            message: 'Registro creado exitosamente.' 
        };

    } catch (error) {
        console.error("❌ Error en crearAcceso:", error);
        throw new functions.https.HttpsError('internal', 'No se pudo guardar el registro en la base de datos.', error.message);
    }
});

/**
 * Función Callable complementaria para marcar la salida de un registro activo.
 */
exports.registrarSalida = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado. Se requiere sesión activa.');
    }

    const { condominioId, moduloId, registroId } = data;

    if (!condominioId || !moduloId || !registroId) {
        throw new functions.https.HttpsError('invalid-argument', 'Datos incompletos para registrar salida.');
    }

    try {
        const registroRef = db.collection("gestia_records")
                              .doc(condominioId)
                              .collection(moduloId)
                              .doc(registroId);

        await registroRef.update({
            status: "salida",
            fecha_salida: admin.firestore.FieldValue.serverTimestamp(),
            cerrado_por_uid: context.auth.uid
        });

        console.log(`🚪 [V5.19] Salida registrada: ${registroId} en ${condominioId}`);

        return { status: 'success', message: 'Salida registrada correctamente.' };

    } catch (error) {
        console.error("❌ Error en registrarSalida:", error);
        throw new functions.https.HttpsError('internal', 'No se pudo registrar la salida.', error.message);
    }
});

// ------------------------------------------------------------------
// 8. SEGURIDAD: GESTIÓN DE ACCESOS Y PAQUETERÍA (V5.19)
// ------------------------------------------------------------------

/**
 * 8.1 REGISTRO DE INGRESO DE PAQUETERÍA
 */
exports.registrarIngresoPaquete = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado a guardias.');
    }

    const { condominioId, residenteId, empresa_paqueteria, descripcion, foto_paquete_url } = data;

    if (!condominioId || !residenteId || !empresa_paqueteria) {
        throw new functions.https.HttpsError('invalid-argument', 'Datos de paquetería incompletos.');
    }

    try {
        const paqueteRef = db.collection("packages").doc(condominioId).collection("items").doc();

        const nuevoPaquete = {
            paquete_id: paqueteRef.id,
            residente_id: residenteId,
            guardia_id: context.auth.uid,
            empresa: empresa_paqueteria,
            descripcion: descripcion || "Sin descripción",
            foto_url: foto_paquete_url || "",
            estado: "en_caseta",
            fecha_ingreso: admin.firestore.FieldValue.serverTimestamp(),
            fecha_entrega: null,
            firma_recibido_url: "",
            created_at: admin.firestore.FieldValue.serverTimestamp()
        };

        await paqueteRef.set(nuevoPaquete);

        console.log(`📦 [V5.19] Paquete registrado: ${paqueteRef.id} para residente ${residenteId}`);

        return { success: true, paqueteId: paqueteRef.id, message: "Paquete registrado y notificación en cola." };
    } catch (error) {
        console.error("❌ Error en Registro de Paquete:", error);
        throw new functions.https.HttpsError('internal', error.message || "No se pudo registrar el paquete.");
    }
});

/**
 * 8.2 ENTREGA DE PAQUETE (SALIDA CON FIRMA)
 */
exports.registrarSalidaPaquete = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');

    const { condominioId, paqueteId, firma_url } = data;

    if (!condominioId || !paqueteId || !firma_url) {
        throw new functions.https.HttpsError('invalid-argument', 'Se requiere la firma digital para la entrega.');
    }

    try {
        const paqueteRef = db.collection("packages").doc(condominioId).collection("items").doc(paqueteId);

        const paqueteSnap = await paqueteRef.get();
        if (!paqueteSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'El paquete no existe.');
        }

        await paqueteRef.update({
            estado: "entregado",
            fecha_entrega: admin.firestore.FieldValue.serverTimestamp(),
            firma_recibido_url: firma_url,
            guardia_entrega_id: context.auth.uid,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, message: "Paquete entregado correctamente." };
    } catch (error) {
        console.error("❌ Error en Salida de Paquete:", error);
        throw new functions.https.HttpsError('internal', error.message || "Error al procesar la entrega.");
    }
});

/**
 * 8.3 BITÁCORA DE INCIDENCIAS DE SEGURIDAD
 */
exports.registrarIncidenciaAcceso = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Solo personal de seguridad.');

    const { condominioId, tipo_incidencia, descripcion, severidad } = data;

    if (!condominioId || !tipo_incidencia || !descripcion) {
        throw new functions.https.HttpsError('invalid-argument', 'Datos de incidencia incompletos.');
    }

    try {
        const incidenciaRef = db.collection("security_logs").doc();

        await incidenciaRef.set({
            log_id: incidenciaRef.id,
            condominioId: condominioId,
            guardia_id: context.auth.uid,
            tipo: tipo_incidencia,
            descripcion: descripcion,
            severidad: severidad || "baja",
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            coordenadas: data.coords || null,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, logId: incidenciaRef.id };
    } catch (error) {
        console.error("❌ Error en Bitácora de Seguridad:", error);
        throw new functions.https.HttpsError('internal', error.message || "Error al guardar el log de seguridad.");
    }
});

/**
 * 8.4 TRIGGER: NOTIFICACIÓN AUTOMÁTICA AL RESIDENTE
 */
exports.onPackageReceived = functions.firestore
    .document('packages/{condominioId}/items/{paqueteId}')
    .onCreate(async (snapshot, context) => {

        const paquete = snapshot.data();
        const residenteId = paquete.residente_id;

        console.log(`🔔 [V5.19] Notificando a residente ${residenteId} sobre nuevo paquete de ${paquete.empresa}`);

        try {
            const userRef = db.collection("users").doc(residenteId);
            const userSnap = await userRef.get();

            if (!userSnap.exists || !userSnap.data().fcmToken) {
                console.log("⚠️ Residente no tiene token de notificación activo.");
                return null;
            }

            const token = userSnap.data().fcmToken;

            const payload = {
                notification: {
                    title: "📦 ¡Llegó un paquete para ti!",
                    body: `Empresa: ${paquete.empresa}. Puedes recogerlo en caseta con tu firma digital.`,
                },
                data: {
                    type: "package_arrival",
                    paqueteId: context.params.paqueteId,
                    condominioId: context.params.condominioId
                }
            };

            await admin.messaging().sendToDevice(token, payload);

            console.log("✅ Notificación enviada con éxito.");

        } catch (error) {
            console.error("❌ Error al enviar notificación de paquete:", error);
        }

        return null;
    });
