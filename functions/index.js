/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ARCHITECTURE V5.45 (SENTINEL CORE - ANTI-FRAGILE)
 * ======================================================================================
 * DESPLEGADO POR: Heber Mendoza (Arquitecto Supremo)
 * REGLA 1: SIN CORTES INTERNOS. SIN COMPACTACIÓN. CÓDIGO ÍNTEGRO.
 * ACTUALIZACIÓN: Implementación de V5_CONFIG y Puente Firewall V5.
 * --------------------------------------------------------------------------------------
 */

// 1. IMPORTACIONES DE NÚCLEO (Librerías externas primero)
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto"); // Inyectado para IDs Determinísticos V5.45 (IA Authority)
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 2. INICIALIZACIÓN INMEDIATA (ENCENDER EL MOTOR ANTES DE TODO)
if (!admin.apps.length) { 
    admin.initializeApp(); 
}
const db = admin.firestore();
const corsHandler = require("cors")({ origin: true });

// 3. IMPORTACIONES DE MÓDULOS PROPIOS (V5.45 Bridge)
// Upgrade: Migración de V4 reactivo a V5 adaptativo con memoria.
const { firewallV5 } = require("./firewall/firewall.v5"); 

// 🧩 CONFIGURACIÓN SENTINEL V5 (Cerebro de Reputación)
// Estos valores controlan la agresividad del escudo directamente en el index.js
const V5_CONFIG = {
  BOTNET_THRESHOLD: 3,      // Tenants distintos para marcar botnet
  TIME_WINDOW_MS: 30000,    // Ventana de 30 segundos para ráfagas
  SCORE_BLOCK: 100,         // Puntaje para Blacklist automática
  SCORE_THROTTLE: 70,       // Puntaje para degradación de velocidad
  DECAY: 0.85,              // Enfriamiento de sospecha por petición
  REPUTATION_WEIGHT: 0.6,   // Peso del historial
  BURST_WEIGHT: 0.4         // Peso del ataque reciente
};

// 4. CONFIGURACIÓN DE INTELIGENCIA ARTIFICIAL
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");

const app = express();
app.use(cors({ origin: true }));
/**
 * ======================================================================================
 * 🧩 MÓDULO 0: UTILIDADES DE AUTORIDAD Y SALUD SENTINEL (V5.45)
 * ======================================================================================
 * OBJETIVO: Autoridad atómica determinística y Telemetría del Radar Sentinel.
 * --------------------------------------------------------------------------------------
 */

/**
 * 🛰️ reportSentinelMetric: El corazón del Radar.
 * Incrementa contadores globales de salud para telemetría en tiempo real.
 */
async function reportSentinelMetric(metricName, value = 1) {
    const today = new Date().toISOString().split('T')[0]; // Agrupación diaria para métricas
    const healthRef = db.collection("gestia_system_health").doc(today);

    try {
        await healthRef.set({
            [metricName]: admin.firestore.FieldValue.increment(value),
            last_heartbeat: admin.firestore.FieldValue.serverTimestamp(),
            version_core: "V5.45_SENTINEL"
        }, { merge: true });
    } catch (error) {
        // Fallback silencioso para no interrumpir el flujo principal
        console.error(`⚠️ [SENTINEL_RADAR_ERROR] Fallo al reportar ${metricName}:`, error.message);
    }
}

/**
 * internalCreateModule: Única autoridad de creación en el búnker.
 * EVOLUCIÓN V5.45: Usa IDs Determinísticos (SHA-256) e integra el Radar Sentinel.
 */
async function internalCreateModule({ modulo_nombre, esquema_campos, tenantId, userId }) {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    console.log(JSON.stringify({
        level: "INFO",
        message: `🏗️ [AUTHORITY V5.45] Iniciando creación atómica: ${modulo_nombre}`,
        tenantId,
        traceId,
        engine: "SENTINEL_CORE"
    }));

    try {
        // 🛡️ 1. GENERACIÓN DE ID DETERMINÍSTICO (SHA-256)
        const seed = `${tenantId}_${modulo_nombre.toLowerCase().trim()}`;
        const modulo_id = `mod_${crypto.createHash('sha256').update(seed).digest('hex').substring(0, 16)}`;
        
        const ref = db.collection("gestia_system_modules").doc(modulo_id);

        // 🛡️ 2. TRANSACCIÓN DE ESCRITURA SEGURA (Check & Set)
        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            
            if (doc.exists) {
                console.log(`⚠️ [DETERMINISTIC] Colisión detectada. El módulo ${modulo_id} ya existe. Reutilizando.`);
                
                // 🛰️ RADAR: Reportamos que el Patch de Determinismo salvó una duplicación
                await reportSentinelMetric('modules_reused_deterministic');
                
                return { 
                    success: true, 
                    modulo_id, 
                    status: "reused_deterministic_match",
                    data: doc.data()
                };
            }

            const schemaPayload = {
                modulo_id: modulo_id,
                nombre_display: modulo_nombre,
                esquema_campos: esquema_campos || ["fecha", "descripcion"],
                status: "activo",
                tenantId: tenantId,
                creado_por: userId,
                version_core: "V5.45_SENTINEL",
                traceId: traceId,
                schema_version: 1,
                schema_history: [{
                    version: 1,
                    campos: esquema_campos || ["fecha", "descripcion"],
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    engine: "Gestia_Authority_V5.45",
                    atomic: true,
                    deterministic: true
                }
            };

            transaction.set(ref, schemaPayload);

            // 🛡️ 3. INICIALIZACIÓN DE DATA-FABRIC
            const initRef = db.collection("gestia_dynamic_data").doc(modulo_id)
                .collection("registros").doc("_init");
                
            transaction.set(initRef, {
                initialized: true,
                mensaje: "Data-fabric configurada bajo Sentinel Core V5.45",
                tenantId: tenantId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 🛰️ RADAR: Reportamos la creación de un nuevo módulo exitoso
            await reportSentinelMetric('modules_created_new');

            return { success: true, modulo_id, status: "created_atomic" };
        });

        // 🛡️ 4. AUDITORÍA DE INFRAESTRUCTURA
        await db.collection("logs_terminal_heberto").add({
            tipo: "CREATE_MODULE_V5",
            modulo_id: result.modulo_id,
            tenantId: tenantId,
            uid: userId,
            traceId: traceId,
            status: result.status,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ [EXITO] Autoridad confirmada para ${result.modulo_id}`);
        return result;

    } catch (error) {
        // 🛰️ RADAR: Reportamos error crítico de autoridad
        await reportSentinelMetric('authority_errors');

        console.error(JSON.stringify({
            level: "FATAL",
            error: error.message,
            traceId,
            module: "internalCreateModule"
        }));
        throw error;
    }
}
// ==================================================================
// 🧩 MÓDULO 1: FINANZAS - GENERADOR DE SESIÓN STRIPE (V5.19 PRO)
// ==================================================================
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

// ==================================================================
// 🧩 MÓDULO 2: FINANZAS - WEBHOOK MULTIMODAL (SENTINEL RADAR V5.45)
// ==================================================================
app.post(["/", "/webhook"], express.raw({ type: 'application/json' }), async (req, res) => {
    const traceId = `trace_webhook_${Date.now()}`;
    let event;

    try {
        const sig = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        // 🛰️ RADAR: Error de firma (posible intento de spoofing)
        await reportSentinelMetric('webhook_signature_errors');
        
        console.error(JSON.stringify({
            level: "ERROR",
            message: "Firma de webhook inválida",
            error: err.message,
            traceId
        }));
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 🛡️ 1. FILTRO DE IDEMPOTENCIA DE EVENTO (Nivel Infraestructura)
    const eventId = event.id;
    const eventLogRef = db.collection("stripe_events").doc(eventId);
    
    try {
        const eventLog = await eventLogRef.get();
        if (eventLog.exists) {
            // 🛰️ RADAR: Evento de Stripe repetido bloqueado
            await reportSentinelMetric('stripe_duplicates_blocked');
            
            console.log(`♻️ [IDEMPOTENCIA] Evento ${eventId} ya registrado. Bloqueando duplicado.`);
            return res.status(200).send({ received: true, status: "event_already_processed" });
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const { serviceId, tipo_pago, clientType, clientId } = session.metadata;
            const montoTotal = Number(session.amount_total || 0) / 100;

            if (!serviceId) throw new Error("CRITICAL: No serviceId in metadata");

            const ticketRef = db.collection("services").doc(serviceId);
            const ticketSnap = await ticketRef.get();

            if (!ticketSnap.exists) {
                // 🛰️ RADAR: Intento de pago a ticket inexistente
                await reportSentinelMetric('revenue_orphan_attempts');
                throw new Error(`Ticket ${serviceId} no localizado en el búnker.`);
            }

            const ticketData = ticketSnap.data();
            
            // 🛡️ 2. FILTRO DE IDEMPOTENCIA DE NEGOCIO (Nivel Aplicación)
            if (ticketData.ultimo_pago_id === session.id) {
                // 🛰️ RADAR: Pago ya impactado (evitamos doble abono)
                await reportSentinelMetric('revenue_double_impact_prevented');
                
                console.warn(`⚠️ [SENTINEL] Pago ${session.id} ya impactó el ticket ${serviceId}. Ignorando.`);
                return res.status(200).send({ received: true, status: "business_already_processed" });
            }

            // 🛡️ 3. GUARDAS DE ESTADO (Sentinel Core)
            const estadosProhibidos = ["finalizado", "cancelado", "archivado"];
            if (estadosProhibidos.includes(ticketData.estado)) {
                // 🛰️ RADAR: Dinero recibido en ticket cerrado (Auditoría requerida)
                await reportSentinelMetric('revenue_terminal_state_blocked', montoTotal);
                
                console.error(`🚫 [BLOQUEO] Intento de pago en ticket con estado terminal: ${ticketData.estado}`);
                return res.status(200).send({ received: true, status: "blocked_terminal_state" });
            }

            // Lógica de transición de estados
            let nuevoEstado = ticketData.estado;
            if (tipo_pago === "garantia_inicial" && (ticketData.estado === "iniciado_stripe" || ticketData.estado === "cotizando")) {
                nuevoEstado = "pendiente";
            } else if (tipo_pago === "liquidacion_saldo" && (ticketData.estado === "procesando_saldo" || ticketData.estado === "cotizando")) {
                nuevoEstado = "trabajando";
            }

            let comisionGestia = (clientType === "ON_DEMAND") ? montoTotal * 0.32 : 0;
            let notaIdempotencia = `Pago: ${tipo_pago} | Event: ${eventId} | Trace: ${traceId}`;

            // ⚡ 4. EJECUCIÓN ATÓMICA (BATCH COMMIT)
            const batch = db.batch();

            batch.set(eventLogRef, { 
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                type: event.type,
                serviceId: serviceId,
                traceId
            });

            batch.update(ticketRef, {
                estado: nuevoEstado,
                metodo_pago: "stripe",
                ultimo_pago_id: session.id,
                fecha_pago: admin.firestore.FieldValue.serverTimestamp(),
                monto_pagado: admin.firestore.FieldValue.increment(montoTotal),
                'auditoria.ultimo_trace': traceId
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
                stripe_event_id: eventId,
                fecha: admin.firestore.FieldValue.serverTimestamp(),
                estado: "completado",
                nota: notaIdempotencia,
                traceId: traceId,
                facturable: clientType === "ON_DEMAND"
            });

            await batch.commit();

            // 🛰️ RADAR: ÉXITO TOTAL - Reportamos flujo de caja
            await reportSentinelMetric('revenue_total_processed', montoTotal);
            await reportSentinelMetric('stripe_webhooks_success');

            console.log(JSON.stringify({
                level: "SUCCESS",
                message: "Flujo financiero procesado",
                serviceId,
                clientType,
                montoTotal,
                traceId
            }));
        }

        res.status(200).send({ received: true });

    } catch (err) {
        // 🛰️ RADAR: Error fatal en flujo financiero
        await reportSentinelMetric('revenue_fatal_errors');

        console.error(JSON.stringify({
            level: "FATAL",
            error: err.message,
            traceId,
            module: "WEBHOOK_FINANCIERO"
        }));
        return res.status(500).send("Internal Sentinel Error");
    }
});

exports.stripeWebhook = functions.https.onRequest(app);
// ==================================================================
// 🧩 MÓDULO 3: TRIGGER - FINALIZACIÓN DE SERVICIO (V5.45 SENTINEL)
// ==================================================================
exports.onServiceCompleted = functions.firestore
    .document('services/{serviceId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();
        const serviceId = context.params.serviceId;
        const traceId = `trace_cierre_${serviceId}_${Date.now()}`;

        // 🛡️ 1. GUARDA DE IDEMPOTENCIA DE NEGOCIO (Sentinel Core)
        // Evita re-procesamiento si el servicio ya fue liquidado o si no es un cambio a 'finalizado'
        if (newData.liquidado === true || oldData.estado === 'finalizado') {
            return null; 
        }

        if (newData.estado === 'finalizado') {
            console.log(JSON.stringify({
                level: "INFO",
                message: `🚀 [CIERRE V5.45] Iniciando liquidación atómica`,
                serviceId,
                traceId
            }));

            try {
                const techId = newData.tecnico_id;
                const montoTotal = parseFloat((newData.monto_total || 0).toFixed(2));
                const clientType = newData.clientType || 'ON_DEMAND';

                // 💸 2. CÁLCULO DETERMINÍSTICO DE COMISIONES
                let comisionTecnico = 0;
                let comisionGestia = 0;

                if (clientType === 'ON_DEMAND') {
                    comisionGestia = parseFloat((montoTotal * 0.32).toFixed(2));
                    comisionTecnico = parseFloat((montoTotal * 0.68).toFixed(2));
                } else if (clientType === 'B2B_UXMAL') {
                    comisionTecnico = parseFloat((newData.monto_tecnico_fijo || (montoTotal * 0.85)).toFixed(2)); 
                    comisionGestia = parseFloat((montoTotal - comisionTecnico).toFixed(2));
                }

                const batch = db.batch();

                // 🛡️ 3. REGISTRO DE TRANSACCIÓN DETERMINÍSTICO (Anti-Duplicados)
                // Usamos un ID basado en el serviceId para que el ledger sea inmutable ante retries
                const transId = `txn_split_${serviceId}`;
                const transRef = db.collection("transacciones").doc(transId);
                
                batch.set(transRef, {
                    payout_id: transId,
                    servicio_id: serviceId,
                    tecnico_id: techId || 'sistema',
                    monto_total: montoTotal,
                    ganancia_tecnico: comisionTecnico,
                    ganancia_gestia: comisionGestia,
                    fecha: admin.firestore.FieldValue.serverTimestamp(),
                    tipo: "cierre_servicio_split",
                    client_type: clientType,
                    estado: "auditado",
                    traceId: traceId,
                    version_patch: "5.45_SENTINEL",
                    nota: `Liquidación automática: ${clientType} | Trace: ${traceId}`
                });

                // ⚡ 4. ACTUALIZACIÓN DE WALLET (Atómica)
                if (techId) {
                    const techRef = db.collection("tecnicos").doc(techId);
                    batch.update(techRef, {
                        'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(comisionTecnico),
                        'wallet.total_ganado': admin.firestore.FieldValue.increment(comisionTecnico),
                        'estadisticas.servicios_completados': admin.firestore.FieldValue.increment(1),
                        'ultimo_servicio': serviceId,
                        'fecha_ultima_ganancia': admin.firestore.FieldValue.serverTimestamp(),
                        'auditoria.ultimo_trace_pago': traceId
                    });
                }

                // ✅ 5. CIERRE DE CICLO EN EL SERVICIO
                const serviceRef = db.collection("services").doc(serviceId);
                batch.update(serviceRef, {
                    liquidado: true,
                    fecha_liquidacion: admin.firestore.FieldValue.serverTimestamp(),
                    comision_aplicada_tecnico: comisionTecnico,
                    trace_liquidacion: traceId
                });

                await batch.commit();
                
                console.log(JSON.stringify({
                    level: "SUCCESS",
                    message: "Wallet y Ledger actualizados correctamente",
                    serviceId,
                    techId,
                    ganancia: comisionTecnico,
                    traceId
                }));

                return null;

            } catch (error) {
                console.error(JSON.stringify({
                    level: "FATAL",
                    message: "Error Crítico en Liquidación",
                    error: error.message,
                    serviceId,
                    traceId
                }));
                // Sentinel no lanza error aquí para evitar bucles infinitos de re-intento de trigger
                // pero deja el rastro FATAL para el dashboard del Arquitecto.
                return null;
            }
        }
        return null;
    });

// ==================================================================
// 🧩 MÓDULO 4: WALLET - SOLICITUD DE RETIRO (V5.45 SENTINEL)
// ==================================================================
exports.solicitarRetiro = functions.https.onCall(async (data, context) => {
    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD SUPREMA
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere sesión activa.');
    }

    const techId = context.auth.uid;
    const traceId = `trace_payout_${techId}_${Date.now()}`;
    const montoARetirar = parseFloat(data.monto);

    console.log(JSON.stringify({
        level: "INFO",
        message: "Iniciando protocolo de retiro seguro",
        techId,
        monto: montoARetirar,
        traceId
    }));

    // 🛡️ 2. VALIDACIÓN DE DATOS DE ENTRADA
    if (isNaN(montoARetirar) || montoARetirar <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Monto inválido para la operación.');
    }

    const montoNormalizado = parseFloat(montoARetirar.toFixed(2));
    const techRef = db.collection("tecnicos").doc(techId);

    try {
        return await db.runTransaction(async (transaction) => {
            const techSnap = await transaction.get(techRef);
            if (!techSnap.exists) throw new Error('EXPEDIENTE_NO_ENCONTRADO: El técnico no existe en el búnker.');

            const techData = techSnap.data();
            const wallet = techData.wallet || { saldo_pendiente: 0, saldo_en_revision: 0 };
            
            const saldoDisponible = parseFloat((wallet.saldo_pendiente || 0).toFixed(2));
            const saldoEnRevision = parseFloat((wallet.saldo_en_revision || 0).toFixed(2));

            // 🛡️ 3. REGLAS DE NEGOCIO SENTINEL (Anti-Abuso)
            // A. Verificación de Fondos
            if (montoNormalizado > saldoDisponible) {
                throw new Error(`SALDO_INSUFICIENTE: Intento de retiro por $${montoNormalizado} superó el disponible de $${saldoDisponible}`);
            }

            // B. Idempotencia de Proceso (Bloqueo de Retiros Concurrentes)
            if (saldoEnRevision > 0) {
                throw new Error('RETIRO_BLOQUEADO: Existe una solicitud previa en fase de auditoría.');
            }

            // C. Verificación de Configuración de Pago (Opcional pero recomendado para V5.45)
            if (!techData.configuracion_pago?.metodo || techData.configuracion_pago?.metodo === 'por_definir') {
                throw new Error('CONFIGURACION_REQUERIDA: Debes configurar un método de pago válido antes de retirar.');
            }

            // 🏗️ 4. GENERACIÓN DE PAYOUT DETERMINÍSTICO
            // Usamos un ID que incluya el UID para evitar colisiones en la colección global
            const payoutId = `pay_${techId.substring(0, 5)}_${Date.now()}`;
            const payoutRef = db.collection("payouts").doc(payoutId);

            transaction.set(payoutRef, {
                payout_id: payoutId,
                tecnico_id: techId,
                tecnico_nombre: techData.nombre || 'Técnico Gestia',
                monto: montoNormalizado,
                fecha_solicitud: admin.firestore.FieldValue.serverTimestamp(),
                estado: "pendiente_aprobacion",
                metodo: techData.configuracion_pago.metodo,
                version_patch: "5.45_SENTINEL",
                traceId: traceId,
                metadata: {
                    ip_solicitud: context.rawRequest?.ip || "unknown",
                    userAgent: context.rawRequest?.headers['user-agent'] || "unknown"
                }
            });

            // ⚡ 5. MOVIMIENTO ATÓMICO DE WALLET (Check-and-Balance)
            transaction.update(techRef, {
                'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(-montoNormalizado),
                'wallet.saldo_en_revision': admin.firestore.FieldValue.increment(montoNormalizado),
                'wallet.ultimo_retiro_fecha': admin.firestore.FieldValue.serverTimestamp(),
                'auditoria.ultimo_trace_retiro': traceId
            });

            return { 
                success: true, 
                payoutId: payoutId, 
                monto: montoNormalizado,
                traceId: traceId 
            };
        });

    } catch (error) {
        console.error(JSON.stringify({
            level: "FATAL",
            message: "Fallo en protocolo de retiro",
            error: error.message,
            techId,
            traceId
        }));
        
        // Retornamos el error limpio al frontend
        throw new functions.https.HttpsError('internal', error.message);
    }
});
// ==================================================================
// 🧩 MÓDULO 5: MOTOR IA - VALIDACIÓN DE CIERRE (V5.19 PRO)
// ==================================================================
exports.validarCierreIA = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado.');

    const { serviceId, notas_cierre, evidencias_urls } = data;
    if (!serviceId || !notas_cierre) throw new functions.https.HttpsError('invalid-argument', 'Faltan datos.');

    try {
        const serviceRef = db.collection("services").doc(serviceId);

        return await db.runTransaction(async (transaction) => {
            const serviceSnap = await transaction.get(serviceRef);
            if (!serviceSnap.exists) throw new Error('Servicio inexistente.');

            const serviceData = serviceSnap.data();
            if (serviceData.estado === 'finalizado') {
                return { aprobado: true, mensaje: "Ya finalizado previamente." };
            }

            if (serviceData.tecnico_id !== context.auth.uid) {
                return { aprobado: false, motivo: "No asignado a este servicio." };
            }

            const palabrasClave = ["reparado", "instalado", "cambio", "mantenimiento", "listo", "corregido"];
            const notaNormalizada = notas_cierre.toLowerCase().trim().replace(/\s+/g, ' ');
            const tienePalabrasClave = palabrasClave.some(p => notaNormalizada.includes(p));

            if (notaNormalizada.length < 20 || !tienePalabrasClave) {
                return { aprobado: false, motivo: "Descripción insuficiente. Detalla la reparación." };
            }

            const token = `IA-OK-${serviceId}-${Date.now()}`;

            transaction.update(serviceRef, {
                'auditoria_ia.validacion_previa': true,
                'auditoria_ia.fecha_revision': admin.firestore.FieldValue.serverTimestamp(),
                'auditoria_ia.token_validacion': token,
                'notas_tecnico_cierre': notaNormalizada,
                'evidencias_finales': evidencias_urls || []
            });

            return { aprobado: true, token_validacion: token };
        });
    } catch (error) {
        console.error("❌ Error en Motor IA:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// 🛠️ HELPER DE IDEMPOTENCIA IA (PATCH 5)
function generateOperationId(prompt, tenantId) {
    // Normalizamos el prompt para evitar duplicados por espacios o mayúsculas
    const normalized = prompt.trim().toLowerCase().replace(/\s+/g, " ");
    return crypto
        .createHash("sha256")
        .update(`${tenantId}_${normalized}`)
        .digest("hex")
        .slice(0, 32);
}

// ==================================================================
// 🧩 MÓDULO 6: TERMINAL HEBERTO - ARCHITECT ENGINE (SENTINEL RADAR V5.45)
// ==================================================================
exports.gestiaArchitectV5 = functions
    .runWith({ 
        secrets: ["GEMINI_KEY", "STRIPE_SECRET_KEY"], 
        timeoutSeconds: 540, 
        memory: "1GB"        
    })
    .https.onRequest((req, res) => {
        return corsHandler(req, res, async () => {
            const traceId = `trace_ia_${Date.now()}`;
            console.log(`🚀 [INICIO] Architect V5.45 (Sentinel Core - Radar Active) | Trace: ${traceId}`);

            try {
                // 🛡️ 1. Firewall & Autoridad V5 (Reputación)
                const session = await firewallV5(req);
                if (!session || !session.authorized) {
                    // 🛰️ RADAR: Intento de acceso a la IA bloqueado por firewall
                    await reportSentinelMetric('ia_firewall_rejections');
                    throw new Error("BLOQUEO_FIREWALL: Autoridad no confirmada.");
                }
                
                const currentTenantId = session.tenantId || "UXMAL39";

                // 📦 2. Validación de Payload
                const bodyData = req.body.data || req.body;
                let prompt = bodyData.prompt || (typeof bodyData === 'string' ? bodyData : "");
                if (!prompt) throw new Error("PROMPT_VACIO");

                // 🔒 3. IDEMPOTENCIA POR INTENCIÓN (PATCH 5 + RADAR)
                const operationId = generateOperationId(prompt, currentTenantId);
                const opRef = db.collection("gestia_operations").doc(operationId);

                const existingOp = await opRef.get();
                if (existingOp.exists) {
                    // 🛰️ RADAR: Reportamos ahorro de tokens (Idempotencia IA)
                    await reportSentinelMetric('ia_tokens_saved');
                    
                    console.log(`♻️ [PATCH 5 AI] Reutilizando operación: ${operationId}`);
                    return res.status(200).json({
                        data: {
                            success: true,
                            modulo_generado: existingOp.data().result,
                            reused: true,
                            operationId: operationId
                        }
                    });
                }

                // 🏗️ 4. Memoria Semántica (Contexto de Infraestructura)
                let modulosExistentes = [];
                const modulesSnap = await db.collection("gestia_system_modules")
                    .where("tenantId", "==", currentTenantId)
                    .limit(50) 
                    .get();
                
                modulesSnap.forEach(doc => modulosExistentes.push(doc.id));

                // 📜 5. Instrucción Maestra (Sentinel Logic)
                const systemInstruction = `
Eres la TERMINAL HEBERTO V5.45. Identidad: Orquestador de Infraestructura Autónoma.
Decisión requerida: USE_MODULE (si hay match) o CREATE_MODULE (si es nuevo).

MODULOS_DETECTADOS: [${modulosExistentes.join(", ")}]

CONTRATO JSON OBLIGATORIO:
{
  "action": "USE_MODULE" | "CREATE_MODULE",
  "modulo_id": "string",
  "modulo_nombre": "string",
  "esquema_campos": ["campo1", "campo2"],
  "conciencia": { "mensaje_ceo": "Confirmación estilo Heberto 🍻" },
  "ejecucion": { 
    "payload": { "html": "...", "css": "...", "javascript": "..." } 
  }
}

REGLAS DURAS:
- Si coincide con MODULOS_DETECTADOS -> USE_MODULE.
- Si es algo nuevo o no hay match -> CREATE_MODULE.
- El JavaScript no debe exceder los 8000 caracteres.
`;

                const model = genAI.getGenerativeModel({ 
                    model: "gemini-2.0-flash",
                    generationConfig: { temperature: 0.15, maxOutputTokens: 3200 }
                });

                // ⚡ 6. Invocación al Cerebro (Llamada Real a la IA)
                const result = await model.generateContent(`${systemInstruction}\n\nSOLICITUD:\n${prompt}`);
                let responseText = result.response.text();
                let cleaned = responseText.replace(/```json|```/g, "").trim();
                let jsonParsed = JSON.parse(cleaned);

                // --- 🛡️ BLINDAJE POST-IA ---
                const validActions = ["USE_MODULE", "CREATE_MODULE"];
                if (!validActions.includes(jsonParsed.action)) throw new Error("INVALID_ACTION_FROM_IA");

                const jsPayload = jsonParsed.ejecucion?.payload?.javascript || "";
                if (jsPayload.length > 8000) throw new Error("JS_EXCESIVO_PREVENCION_DE_BUCLE");

                // --- 🚀 7. ORQUESTACIÓN AUTÓNOMA (Sincronización Atómica) ---
                if (jsonParsed.action === "CREATE_MODULE") {
                    console.log(`🏗️ [ATOMIC] Creando módulo vía Authority SHA-256...`);
                    
                    const creation = await internalCreateModule({
                        modulo_nombre: jsonParsed.modulo_nombre || "Módulo Sin Nombre",
                        esquema_campos: jsonParsed.esquema_campos || ["fecha", "descripcion"],
                        tenantId: currentTenantId,
                        userId: session.uid
                    });

                    jsonParsed.modulo_id = creation.modulo_id;
                    jsonParsed.conciencia.mensaje_ceo += `\n(ID Autorizado: ${creation.modulo_id})`;
                }

                // 🔒 8. REGISTRO ATÓMICO DE OPERACIÓN IA (Cierre de Ciclo)
                await opRef.set({
                    operationId,
                    type: "ai_module_generation",
                    tenantId: currentTenantId,
                    prompt: prompt,
                    result: jsonParsed,
                    status: "completed",
                    traceId: traceId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // 🛰️ RADAR: Reportamos éxito de generación IA
                await reportSentinelMetric('ia_architect_success');

                return res.status(200).json({
                    data: {
                        success: true,
                        modulo_generado: jsonParsed, 
                        status: "Arre con la que barre! 🍻"
                    }
                });

            } catch (error) {
                // 🛰️ RADAR: Reportamos fallo en el motor de IA
                await reportSentinelMetric('ia_architect_errors');

                console.error(`🔥 [FATAL ARCHITECT]: ${error.message} | Trace: ${traceId}`);
                return res.status(200).json({ data: { success: false, error: error.message } });
            }
        });
    });

exports.generarModuloIA = exports.gestiaArchitectV5;
// ==================================================================
// 🧩 MÓDULO 7: TERMINAL - ENDPOINT DE CREACIÓN (MODO AUTORIDAD V5)
// ==================================================================
exports.createGestiaModule = functions
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onRequest((req, res) => {
    return corsHandler(req, res, async () => {
      const traceId = `trace_direct_create_${Date.now()}`;
      
      try {
        // 🛡️ 1. BLOQUE DE AUTORIDAD V5 (Sentinel Adaptive Firewall)
        // Validamos reputación y obtenemos la sesión autorizada
        const session = await firewallV5(req);
        if (!session || !session.authorized) {
            throw new Error("ACCESO_DENEGADO: Reputación insuficiente para creación directa.");
        }

        // 📦 2. EXTRACCIÓN Y VALIDACIÓN DE CONTRATO
        const data = req.body.data || req.body;
        
        if (!data.modulo_nombre) {
            throw new Error("CONTRATO_INVALIDO: El nombre del módulo es obligatorio.");
        }

        console.log(JSON.stringify({
            level: "INFO",
            message: `🏗️ [DIRECT_CREATE] Solicitud de creación manual detectada`,
            modulo: data.modulo_nombre,
            tenantId: session.tenantId,
            uid: session.uid,
            traceId
        }));

        // 🏗️ 3. INVOCACIÓN A LA AUTORIDAD ATÓMICA SHA-256
        // Forzamos el tenantId desde la sesión para evitar inyección de datos cruzados
        const result = await internalCreateModule({
            modulo_nombre: data.modulo_nombre,
            esquema_campos: data.esquema_campos || ["fecha", "descripcion"],
            tenantId: session.tenantId || "UXMAL39",
            userId: session.uid
        });

        // 📊 4. RESPUESTA DE ÉXITO SENTINEL
        return res.status(200).json({ 
            data: {
                ...result,
                traceId: traceId,
                engine: "SENTINEL_CORE_V5.45"
            }
        });

      } catch (e) {
        // Log estructurado para auditoría de fallos en el Búnker
        console.error(JSON.stringify({
            level: "ERROR",
            message: "Fallo en Endpoint de Creación Directa",
            error: e.message,
            traceId
        }));

        return res.status(200).json({ 
            data: { 
                success: false, 
                error: e.message,
                traceId: traceId
            } 
        });
      }
    });
  });
// ==================================================================
// 🧩 MÓDULO 8: SCHEDULERS - MANTENIMIENTO PREVENTIVO (V5.19 PRO)
// ==================================================================
exports.onScheduleMantenimiento = functions.pubsub
    .schedule('0 0 * * *')
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        const hoy = admin.firestore.Timestamp.now();
        console.log("🕒 [Scheduler] Revisando preventivos pendientes...");

        try {
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
                    descripcion: `[PREVENTIVO] ${prog.descripcion_equipo || 'Mantenimiento Técnico'}`,
                    monto_total: prog.costo_fijo || 0,
                    estado: "pendiente",
                    tipo_servicio: "preventivo",
                    clientType: prog.clientType || "B2B_UXMAL",
                    fecha_creacion: hoy,
                    generado_por_scheduler: true,
                    version: "v5.19_pro"
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
            console.log(`🚀 [Scheduler] Éxito: ${preventivosQuery.size} servicios generados.`);
            return null;
        } catch (error) {
            console.error("❌ Error en Scheduler Preventivo:", error);
            return null;
        }
    });

// ==================================================================
// 🧩 MÓDULO 9: OPERACIONES - AMENIDADES Y RESERVAS (V5.19 PRO)
// ==================================================================
exports.reservarCancha = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sin sesión.');

    const { amenityId, fecha, horaInicio, horaFin, condominioId } = data;

    return await db.runTransaction(async (transaction) => {
        const reservasRef = db.collection("reservas");
        
        const traslapeSnap = await transaction.get(
            reservasRef.where("amenityId", "==", amenityId)
                        .where("fecha", "==", fecha)
                        .where("estado", "==", "confirmado")
        );

        const hayTraslape = traslapeSnap.docs.some(doc => {
            const r = doc.data();
            return (horaInicio < r.horaFin && horaFin > r.horaInicio);
        });

        if (hayTraslape) {
            return { success: false, message: "Este horario ya ha sido reservado." };
        }

        const nuevaReservaRef = reservasRef.doc();
        transaction.set(nuevaReservaRef, {
            residente_id: context.auth.uid,
            amenityId, fecha, horaInicio, horaFin,
            condominioId: condominioId || "general",
            estado: "confirmado",
            fecha_creacion: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, reservaId: nuevaReservaRef.id };
    });
});

// ==================================================================
// 🧩 MÓDULO 10: CONTROL DE ACCESOS DINÁMICOS (V5.19 PRO)
// ==================================================================
exports.crearAcceso = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');
    const { condominioId, moduloId, payload } = data;

    try {
        const registroRef = db.collection("gestia_records")
                            .doc(condominioId).collection(moduloId).doc();
                            
        await registroRef.set({
            ...payload,
            registro_id: registroRef.id,
            creado_por_uid: context.auth.uid,
            creado_en: admin.firestore.FieldValue.serverTimestamp(),
            status: "activo"
        });
        
        return { status: 'success', id: registroRef.id };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.registrarSalida = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');
    const { condominioId, moduloId, registroId } = data;

    try {
        const registroRef = db.collection("gestia_records")
                            .doc(condominioId).collection(moduloId).doc(registroId);
                            
        await registroRef.update({
            status: "salida",
            fecha_salida: admin.firestore.FieldValue.serverTimestamp(),
            cerrado_por_uid: context.auth.uid
        });
        
        return { status: 'success' };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==================================================================
// 🧩 MÓDULO 11: SEGURIDAD - PAQUETERÍA E INCIDENCIAS (V5.19 PRO)
// ==================================================================
exports.registrarIngresoPaquete = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado.');
    const { condominioId, residenteId, empresa_paqueteria, descripcion } = data;

    try {
        const paqueteRef = db.collection("packages").doc(condominioId).collection("items").doc();
        
        await paqueteRef.set({
            paquete_id: paqueteRef.id,
            residente_id: residenteId,
            guardia_id: context.auth.uid,
            empresa: empresa_paqueteria,
            descripcion: descripcion || "",
            estado: "en_caseta",
            fecha_ingreso: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, id: paqueteRef.id };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.registrarSalidaPaquete = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');
    const { condominioId, paqueteId, firma_url } = data;

    try {
        await db.collection("packages").doc(condominioId).collection("items").doc(paqueteId).update({
            estado: "entregado",
            fecha_entrega: admin.firestore.FieldValue.serverTimestamp(),
            firma_recibido_url: firma_url,
            guardia_entrega_id: context.auth.uid
        });
        
        return { success: true };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.registrarIncidenciaAcceso = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');
    const { condominioId, tipo_incidencia, descripcion, severidad } = data;

    try {
        const ref = db.collection("security_logs").doc();
        
        await ref.set({
            log_id: ref.id,
            condominioId,
            guardia_id: context.auth.uid,
            tipo: tipo_incidencia,
            descripcion,
            severidad: severidad || "baja",
            fecha: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, id: ref.id };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.onPackageReceived = functions.firestore
    .document('packages/{condominioId}/items/{paqueteId}')
    .onCreate(async (snap, context) => {
        const paquete = snap.data();
        try {
            const userSnap = await db.collection("users").doc(paquete.residente_id).get();
            if (userSnap.exists && userSnap.data().fcmToken) {
                const payload = {
                    notification: {
                        title: "📦 ¡Llegó un paquete para ti!",
                        body: `Empresa: ${paquete.empresa}. Recógelo en caseta.`
                    }
                };
                await admin.messaging().sendToDevice(userSnap.data().fcmToken, payload);
            }
        } catch (e) {
            console.error("FCM Delivery Error:", e);
        }
    });

// ==================================================================
// 🧩 MÓDULO 12: AUTOMATIZACIÓN - LIMPIEZA DE SESIONES (COST CONTROL)
// ==================================================================
exports.limpiarSesionesHuerfanas = functions.pubsub
    .schedule('every 12 hours')
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        const hace24Horas = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 86400000));
        console.log("🧹 [Cleanup] Ejecutando limpieza de sesiones Stripe huérfanas...");

        try {
            const snapshot = await db.collection("services")
                .where("estado", "==", "iniciado_stripe")
                .where("fecha_creacion", "<=", hace24Horas)
                .limit(200).get();

            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, { 
                    estado: "cancelado_por_timeout",
                    fecha_cancelacion: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();
            console.log(`🧹 [Cleanup] Finalizado: ${snapshot.size} sesiones procesadas.`);
            return null;
        } catch (e) {
            console.error("❌ Error en Cleanup Job:", e);
            return null;
        }
    });

/**
 * ======================================================================================
 * 🧩 MÓDULO 13: SENTINEL HEALTH ENGINE (EL RADAR V5.45)
 * ======================================================================================
 * OBJETIVO: Telemetría en tiempo real de ataques, ahorros y colisiones de IA.
 * UBICACIÓN: utils/sentinel.health.js o bloque final de index.js
 * --------------------------------------------------------------------------------------
 */

const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * reportSentinelMetric: Incrementa contadores globales de salud del sistema.
 * @param {string} metricName - El nombre de la métrica (ej: 'firewall_blocks', 'double_payment_prevented')
 * @param {number} value - Valor a incrementar (default 1)
 */
async function reportSentinelMetric(metricName, value = 1) {
    const today = new Date().toISOString().split('T')[0]; // Agrupamos por día para gráficas
    const healthRef = db.collection("gestia_system_health").doc(today);

    try {
        await healthRef.set({
            [metricName]: admin.firestore.FieldValue.increment(value),
            last_heartbeat: admin.firestore.FieldValue.serverTimestamp(),
            version_core: "V5.45_SENTINEL"
        }, { merge: true });
    } catch (error) {
        // Fallback silencioso para no detener la operación principal por un log
        console.error(`⚠️ [HEALTH_ERROR] No se pudo reportar métrica ${metricName}:`, error.message);
    }
}

module.exports = { reportSentinelMetric };

// FIN DEL NÚCLEO GESTIAPREMIUM V5.45 (SENTINEL CORE)
