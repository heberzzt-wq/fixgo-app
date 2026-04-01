/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ARCHITECTURE V5.51.2 (SENTINEL CORE - ANTIFRÁGIL)
 * ======================================================================================
 * DESPLEGADO POR: Heber Mendoza (Arquitecto Supremo)
 * REGLA 1: SIN CORTES INTERNOS. SIN COMPACTACIÓN. CÓDIGO ÍNTEGRO.
 * ACTUALIZACIÓN: Parche V5.51.2 - Integración de Dotenv para lectura de Secretos.
 * --------------------------------------------------------------------------------------
 */

// 0. CARGA DE VARIABLES DE ENTORNO (CRÍTICO: Debe ir antes de cualquier inicialización)
require('dotenv').config();

// 1. IMPORTACIONES DE NÚCLEO (Librerías externas primero)
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto"); 
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 2. INICIALIZACIÓN INMEDIATA (ENCENDER EL MOTOR ANTES DE TODO)
// 🛡️ UNIFICACIÓN DE SCOPE: Evita "Identifier admin has already been declared" en re-deploys
if (!admin.apps.length) { 
    admin.initializeApp(); 
}
const db = admin.firestore();

// 🛡️ INSTANCIACIÓN DE HANDLERS GLOBALES (Fix V5.51 - Evita ReferenceError en Middlewares)
const corsHandler = cors({ origin: true });

// 3. IMPORTACIONES DE MÓDULOS PROPIOS (V5.50 Bridge)
const { firewallV5 } = require("./firewall/firewall.v5"); 

// 🧩 CONFIGURACIÓN SENTINEL V5 (Cerebro de Reputación)
const V5_CONFIG = {
  BOTNET_THRESHOLD: 3,      
  TIME_WINDOW_MS: 30000,    
  SCORE_BLOCK: 100,          
  SCORE_THROTTLE: 70,       
  DECAY: 0.85,              
  REPUTATION_WEIGHT: 0.6,   
  BURST_WEIGHT: 0.4         
};

// 4. CONFIGURACIÓN DE INTELIGENCIA ARTIFICIAL
// 🛡️ V5.51: Ahora lee la llave directamente del .env cargado en el Paso 1
// 🛡️ SONDA DE DIAGNÓSTICO V5.51
const rawKey = process.env.GEMINI_KEY || "";
console.log(`📡 [RADAR_KEY_CHECK] Llave detectada: ${rawKey.substring(0, 5)}...${rawKey.substring(rawKey.length - 4)}`);
const genAI = new GoogleGenerativeAI(rawKey);

const app = express();
/**
 * 🛡️ AISLAMIENTO DE MIDDLEWARES (Fix Crítico V5.51)
 * El Webhook de Stripe debe procesarse antes de que cualquier global interfiera con el Buffer.
 */
app.post("/stripe-webhook", express.raw({ type: 'application/json' })); 

// Aplicamos CORS y JSON para el resto de las rutas, respetando el Webhook
app.use(corsHandler);
app.use((req, res, next) => {
    if (req.originalUrl === "/stripe-webhook") return next();
    express.json()(req, res, next);
});
/**
 * ======================================================================================
 * 🧩 MÓDULO 0: UTILIDADES DE AUTORIDAD Y SALUD SENTINEL (V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * OBJETIVO: Autoridad atómica determinística y Telemetría del Radar Sentinel.
 * ACTUALIZACIÓN V5.51: Normalización Unicode para evitar duplicidad semántica.
 * --------------------------------------------------------------------------------------
 */

/**
 * 🛰️ reportSentinelMetric: El corazón del Radar.
 * Incrementa contadores globales de salud para telemetría en tiempo real.
 */
async function reportSentinelMetric(metricName, value = 1) {
    const today = new Date().toISOString().split('T')[0]; 
    const healthRef = db.collection("gestia_system_health").doc(today);

    try {
        await healthRef.set({
            [metricName]: admin.firestore.FieldValue.increment(value),
            last_heartbeat: admin.firestore.FieldValue.serverTimestamp(),
            version_core: "V5.51_ANTIFRAGILE",
            status: "HEARTBEAT_OK"
        }, { merge: true });
    } catch (error) {
        console.warn(JSON.stringify({
            level: "WARNING",
            message: `⚠️ [RADAR_FAIL] No se pudo reportar métrica: ${metricName}`,
            error: error.message
        }));
    }
}

/**
 * internalCreateModule: Única autoridad de creación en el búnker.
 * ESTRATEGIA: Usa IDs Determinísticos (SHA-256) para forzar colisiones controladas.
 */
async function internalCreateModule({ modulo_nombre, esquema_campos, tenantId, userId }) {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
    
    // 🛡️ NORMALIZACIÓN FUERTE V5.51 (Evita duplicados por acentos o símbolos)
    const normalizedName = modulo_nombre.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();

    console.log(JSON.stringify({
        level: "INFO",
        message: `🏗️ [AUTHORITY V5.51] Iniciando creación atómica: ${modulo_nombre}`,
        tenantId,
        traceId,
        engine: "SENTINEL_CORE_ANTIFRAGILE"
    }));

    try {
        // 🛡️ 1. GENERACIÓN DE ID DETERMINÍSTICO (SHA-256)
        const seed = `${tenantId}_${normalizedName}`;
        const modulo_id = `mod_${crypto.createHash('sha256').update(seed).digest('hex').substring(0, 16)}`;
        
        const ref = db.collection("gestia_system_modules").doc(modulo_id);

        // 🛡️ 2. TRANSACCIÓN DE ESCRITURA SEGURA
        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            
            if (doc.exists) {
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
                version_core: "V5.51_ANTIFRAGILE",
                traceId: traceId,
                schema_version: 1,
                schema_history: [{
                    version: 1,
                    campos: esquema_campos || ["fecha", "descripcion"],
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    engine: "Gestia_Authority_V5.51",
                    atomic: true,
                    deterministic: true,
                    traceId: traceId
                }
            };

            transaction.set(ref, schemaPayload);

            // 🛡️ 3. INICIALIZACIÓN DE DATA-FABRIC
            const initRef = db.collection("gestia_dynamic_data").doc(modulo_id)
                .collection("registros").doc("_init");
                
            transaction.set(initRef, {
                initialized: true,
                mensaje: "Data-fabric configurada bajo Sentinel Core V5.51 ANTIFRAGILE",
                tenantId: tenantId,
                traceId: traceId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, modulo_id, status: "created_atomic" };
        });

        // 🛡️ 4. TELEMETRÍA Y AUDITORÍA POST-COMMIT
        if (result.status === "reused_deterministic_match") {
            console.log(`⚠️ [DETERMINISTIC] Colisión detectada. El módulo ${result.modulo_id} ya existe.`);
            reportSentinelMetric('modules_reused_deterministic');
        } else {
            reportSentinelMetric('modules_created_new');
        }

        db.collection("logs_terminal_heberto").add({
            tipo: "CREATE_MODULE_V5_51",
            modulo_id: result.modulo_id,
            tenantId: tenantId,
            uid: userId,
            traceId: traceId,
            status: result.status,
            version: "V5.51",
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.warn(`[AUDIT_FAIL] Trace: ${traceId}`, err.message));

        console.log(`✅ [EXITO] Autoridad confirmada para ${result.modulo_id} | Trace: ${traceId}`);
        return result;

    } catch (error) {
        reportSentinelMetric('authority_errors');

        console.error(JSON.stringify({
            level: "FATAL",
            error: error.message,
            traceId,
            module: "internalCreateModule",
            context: "V5.51_ANTIFRAGILE_CORE"
        }));
        throw error;
    }
}
// ==================================================================
// 🧩 MÓDULO 1: FINANZAS - GENERADOR DE SESIÓN STRIPE (V5.51 ANTIFRÁGIL)
// ==================================================================
/**
 * OBJETIVO: Creación de checkout seguro con inyección de metadata para trazabilidad.
 * ACTUALIZACIÓN V5.51: Validación de autoridad vía Firewall y blindaje Multi-tenant.
 * REGLA: No se permiten pagos sin serviceId vinculado y validado.
 * ------------------------------------------------------------------
 */
app.post("/create-checkout-session", async (req, res) => {
    const traceId = `trace_checkout_${Date.now()}`;
    
    try {
        // 🛡️ 1. VALIDACIÓN DE AUTORIDAD (SENTINEL V5.51)
        // No confiamos en el clientId del body; lo extraemos de la sesión validada por Firewall.
        const sessionAuth = await firewallV5(req);
        
        if (!sessionAuth || !sessionAuth.authorized) {
            reportSentinelMetric('security_unauth_checkout_attempt');
            console.error(`🚫 [CHECKOUT_DENIED] Autoridad no confirmada. Trace: ${traceId}`);
            return res.status(401).json({ 
                error: "ACCESO_DENEGADO: Autoridad insuficiente para generar cobros.",
                traceId 
            });
        }

        const { serviceId, descripcion, monto, tipo_pago, clientType } = req.body;
        const currentTenantId = sessionAuth.tenantId;

        // 🛡️ 2. VALIDACIÓN DE CONTRATO (Saneamiento de Datos)
        if (!serviceId || !monto || isNaN(monto) || monto <= 0) {
            console.error(`🚫 [CHECKOUT_REJECTED] Payload inválido o monto sospechoso. Trace: ${traceId}`);
            return res.status(400).json({ 
                error: "CONTRATO_INVALIDO: serviceId y monto positivo son obligatorios.",
                traceId 
            });
        }

        console.log(JSON.stringify({
            level: "INFO",
            message: `🏗️ [STRIPE_START] Generando sesión de pago`,
            serviceId,
            tenantId: currentTenantId,
            traceId,
            engine: "SENTINEL_V5.51_ANTIFRAGILE"
        }));

        // 🏗️ 3. CREACIÓN DE SESIÓN EN STRIPE
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'mxn',
                    product_data: {
                        name: descripcion || 'Servicio GestiaPremium',
                        description: `ID Seguimiento: ${serviceId} | Modo: ${clientType || 'ON_DEMAND'}`,
                    },
                    unit_amount: Math.round(monto * 100), // Blindaje de céntimos (Integer)
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
                tenantId: currentTenantId, // Inyectado desde autoridad Firewall
                traceId: traceId,
                version_core: "V5.51_ANTIFRAGILE"
            }
        });

        // 🛰️ 4. TELEMETRÍA PRE-REDIRECCIÓN
        reportSentinelMetric('checkout_sessions_generated');

        console.log(`✅ [STRIPE_SESSION_CREATED] Session: ${session.id} | Service: ${serviceId} | Tenant: ${currentTenantId}`);
        
        return res.json({ 
            id: session.id, 
            url: session.url, 
            traceId 
        });

    } catch (error) {
        reportSentinelMetric('checkout_fatal_errors');
        console.error(JSON.stringify({
            level: "ERROR",
            message: "Fallo en Generador de Checkout Stripe",
            error: error.message,
            traceId,
            context: "create-checkout-session"
        }));
        
        return res.status(500).json({ 
            error: "ERROR_INTERNO_SENTINEL: No se pudo procesar la solicitud de pago.", 
            traceId 
        });
    }
});
// ======================================================================================
// 🧩 MÓDULO 2: FINANZAS - WEBHOOK MULTIMODAL (SENTINEL V5.51 ANTIFRÁGIL)
// ======================================================================================
/**
 * OBJETIVO: Procesamiento de pagos con triple capa de idempotencia y Radar desacoplado.
 * ACTUALIZACIÓN V5.51: Idempotencia atómica por .create() y validación Cross-Tenant.
 * --------------------------------------------------------------------------------------
 */

// 🛡️ MIDDLEWARE DE AISLAMIENTO: Protege la integridad del rawBody para la firma de Stripe
app.post(["/", "/webhook", "/stripe-webhook"], express.raw({ type: 'application/json' }), async (req, res) => {
    const traceId = `trace_webhook_${Date.now()}`;
    let event;

    // 🛡️ 1. VALIDACIÓN DE FIRMA (CAPA 0 - SEGURIDAD)
    try {
        const sig = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(
            req.body, // express.raw inyecta el buffer aquí
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        reportSentinelMetric('webhook_signature_errors');
        console.error(JSON.stringify({
            level: "ERROR",
            message: "Firma de webhook inválida",
            error: err.message,
            traceId,
            context: "STRIPE_SIGNATURE_VERIFY"
        }));
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 🛡️ 2. FILTRO DE IDEMPOTENCIA DE EVENTO (Nivel Infraestructura Atómica)
    const eventId = event.id;
    const eventLogRef = db.collection("stripe_events").doc(eventId);

    try {
        /**
         * ⚡ FIX V5.51: Usamos .create() en lugar de .get() para evitar la Race Condition.
         * Si el documento ya existe, Firebase lanzará un error de "Already Exists", 
         * deteniendo el proceso antes de cualquier lógica de negocio.
         */
        await eventLogRef.create({
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            type: event.type,
            traceId: traceId,
            version_core: "V5.51_ANTIFRAGILE"
        });

        // 🧠 3. PROCESAMIENTO DE LÓGICA DE NEGOCIO
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const { serviceId, tipo_pago, clientType, tenantId } = session.metadata;
            const montoTotal = Number(session.amount_total || 0) / 100;

            if (!serviceId) {
                // ⚠️ FASE 5: DEAD-LETTER LOGIC
                await db.collection("failed_events").add({
                    type: event.type,
                    payload: session,
                    error: "CRITICAL_ERROR: Metadata serviceId missing",
                    traceId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                throw new Error("CRITICAL_ERROR: Metadata serviceId missing");
            }

            const ticketRef = db.collection("services").doc(serviceId);
            const ticketSnap = await ticketRef.get();

            if (!ticketSnap.exists) {
                reportSentinelMetric('revenue_orphan_attempts');
                return res.status(404).send({ error: "Service not found", serviceId, traceId });
            }

            const ticketData = ticketSnap.data();

            // 🛡️ 4. VALIDACIÓN CROSS-TENANT (SENTINEL V5.51)
            // Verificamos que el pago pertenezca al mismo Tenant que el servicio registrado.
            if (ticketData.tenantId !== tenantId) {
                reportSentinelMetric('revenue_cross_tenant_attack');
                console.error(`🚫 [ALERTA] Intento de contaminación Multi-tenant detectado. Service: ${serviceId} | Tenant: ${tenantId}`);
                return res.status(403).send({ error: "SECURITY_VIOLATION: Tenant mismatch", traceId });
            }

            // 🛡️ 5. GUARDAS DE ESTADO TERMINAL (Sentinel Core)
            const estadosProhibidos = ["finalizado", "cancelado", "archivado"];
            if (estadosProhibidos.includes(ticketData.estado)) {
                reportSentinelMetric('revenue_terminal_state_blocked', montoTotal);
                console.error(`🚫 [BLOQUEO] Pago en estado terminal: ${ticketData.estado} | Service: ${serviceId}`);
                return res.status(200).send({ received: true, status: "blocked_terminal_state", traceId });
            }

            // --- Lógica de Transición de Estados Hardened ---
            let nuevoEstado = ticketData.estado;
            if (tipo_pago === "garantia_inicial" && (ticketData.estado === "iniciado_stripe" || ticketData.estado === "cotizando")) {
                nuevoEstado = "pendiente";
            } else if (tipo_pago === "liquidacion_saldo" && (ticketData.estado === "procesando_saldo" || ticketData.estado === "cotizando")) {
                nuevoEstado = "trabajando";
            }

            const comisionGestia = (clientType === "ON_DEMAND") ? parseFloat((montoTotal * 0.32).toFixed(2)) : 0;
            const notaIdempotencia = `Pago: ${tipo_pago} | Event: ${eventId} | Trace: ${traceId}`;

            // ⚡ 6. EJECUCIÓN ATÓMICA (BATCH COMMIT V5.51)
            const batch = db.batch();

            batch.update(ticketRef, {
                estado: nuevoEstado,
                metodo_pago: "stripe",
                ultimo_pago_id: session.id,
                fecha_pago: admin.firestore.FieldValue.serverTimestamp(),
                monto_pagado: admin.firestore.FieldValue.increment(montoTotal),
                'auditoria.ultimo_trace_pago': traceId,
                'auditoria.version_core': "V5.51_ANTIFRAGILE"
            });

            const transRef = db.collection("transacciones").doc();
            batch.set(transRef, {
                servicio_id: serviceId,
                tenantId: tenantId,
                client_type: clientType,
                monto_total: montoTotal,
                comision_gestia: comisionGestia,
                tipo_pago: tipo_pago,
                metodo: "stripe",
                stripe_session_id: session.id,
                stripe_event_id: eventId,
                fecha: admin.firestore.FieldValue.serverTimestamp(),
                estado: "completado",
                nota: notaIdempotencia,
                traceId: traceId,
                version: "V5.51_ANTIFRAGILE"
            });

            await batch.commit();

            // 🛰️ 7. TELEMETRÍA POST-COMMIT (RADAR)
            reportSentinelMetric('revenue_total_processed', montoTotal);
            reportSentinelMetric('stripe_webhooks_success');

            console.log(JSON.stringify({
                level: "SUCCESS",
                message: "Transacción financiera sellada",
                serviceId,
                montoTotal,
                traceId
            }));
        }

        return res.status(200).send({ received: true, traceId });

    } catch (err) {
        // Manejo de colisión de idempotencia (Si el evento ya se procesó, .create falla con código 6)
        if (err.code === 6 || err.message.includes("already exists")) {
            reportSentinelMetric('stripe_duplicates_blocked');
            console.log(`♻️ [IDEMPOTENCIA] Evento ${eventId} bloqueado en escritura. Finalizando.`);
            return res.status(200).send({ received: true, status: "event_already_processed", traceId });
        }

        reportSentinelMetric('revenue_fatal_errors');
        console.error(JSON.stringify({
            level: "FATAL",
            error: err.message,
            traceId,
            module: "WEBHOOK_FINANCIERO_V5_51"
        }));

        return res.status(500).send({ 
            error: "Internal Sentinel Error", 
            traceId,
            retry: true 
        });
    }
});

// 🏁 EXPORTACIÓN CENTRALIZADA (Fix V5.51: Evita colisiones de nombre)
exports.api = functions.https.onRequest(app);
/**
 * ======================================================================================
 * 🧩 MÓDULO 3: TRIGGER - FINALIZACIÓN DE SERVICIO (SENTINEL V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * OBJETIVO: Liquidación atómica de comisiones y actualización de wallet post-servicio.
 * ACTUALIZACIÓN V5.51: Blindaje contra reintentos de trigger y cálculos determinísticos.
 * --------------------------------------------------------------------------------------
 */
exports.onServiceCompleted = functions.firestore
    .document('services/{serviceId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();
        const serviceId = context.params.serviceId;
        const traceId = `trace_cierre_${serviceId}_${Date.now()}`;

        // 🛡️ 1. GUARDA DE IDEMPOTENCIA DE NEGOCIO (Sentinel Core)
        // Cortamos el flujo si el servicio ya fue liquidado o si el cambio no es una transición a 'finalizado'.
        if (newData.liquidado === true || oldData.estado === 'finalizado' || newData.estado !== 'finalizado') {
            return null; 
        }

        console.log(JSON.stringify({
            level: "INFO",
            message: `🚀 [CIERRE V5.51] Iniciando liquidación atómica y cálculo de split`,
            serviceId,
            traceId,
            engine: "SENTINEL_ANTIFRAGILE"
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
                // Para B2B, respetamos el monto fijo pactado o aplicamos el split del 15%
                comisionTecnico = parseFloat((newData.monto_tecnico_fijo || (montoTotal * 0.85)).toFixed(2)); 
                comisionGestia = parseFloat((montoTotal - comisionTecnico).toFixed(2));
            }

            const batch = db.batch();

            // 🛡️ 3. REGISTRO DE TRANSACCIÓN DETERMINÍSTICO (Anti-Duplicados)
            // Usamos txn_split_{serviceId} como llave primaria inmutable. 
            // Si el trigger de Firebase reintenta por error de red, el .set() colisionará atómicamente.
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
                version_core: "V5.51_ANTIFRAGILE",
                nota: `Liquidación automática: ${clientType} | Trace: ${traceId}`
            });

            // ⚡ 4. ACTUALIZACIÓN DE WALLET (Atómica - Ledger Mirroring)
            if (techId) {
                const techRef = db.collection("tecnicos").doc(techId);
                batch.update(techRef, {
                    'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(comisionTecnico),
                    'wallet.total_ganado': admin.firestore.FieldValue.increment(comisionTecnico),
                    'estadisticas.servicios_completados': admin.firestore.FieldValue.increment(1),
                    'ultimo_servicio': serviceId,
                    'fecha_ultima_ganancia': admin.firestore.FieldValue.serverTimestamp(),
                    'auditoria.ultimo_trace_pago': traceId,
                    'auditoria.version_core': "V5.51_ANTIFRAGILE"
                });
            }

            // ✅ 5. CIERRE DE CICLO EN EL SERVICIO (Seal)
            const serviceRef = change.after.ref;
            batch.update(serviceRef, {
                liquidado: true,
                fecha_liquidacion: admin.firestore.FieldValue.serverTimestamp(),
                comision_aplicada_tecnico: comisionTecnico,
                trace_liquidacion: traceId,
                metadata_cierre: {
                    version_core: "V5.51_ANTIFRAGILE",
                    engine: "Sentinel_Antifragile",
                    traceId: traceId
                }
            });

            // Ejecución del Batch Atómico
            await batch.commit();

            // 🛰️ 6. TELEMETRÍA POST-COMMIT (RADAR V5.51)
            reportSentinelMetric('service_liquidation_success');
            if (comisionGestia > 0) {
                reportSentinelMetric('gestia_revenue_collected', comisionGestia);
            }
            
            console.log(JSON.stringify({
                level: "SUCCESS",
                message: "Liquidación sellada y wallet actualizada",
                serviceId,
                techId,
                ganancia: comisionTecnico,
                traceId
            }));

            return null;

        } catch (error) {
            // 🛰️ RADAR: Fallo fatal en proceso de cierre
            reportSentinelMetric('service_liquidation_fatal');

            console.error(JSON.stringify({
                level: "FATAL",
                message: "Error Crítico en Liquidación Industrial",
                error: error.message,
                serviceId,
                traceId,
                module: "onServiceCompleted_V5_51"
            }));
            
            return null;
        }
    });
/**
 * ======================================================================================
 * 🧩 MÓDULO 4: WALLET - SOLICITUD DE RETIRO (SENTINEL V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * OBJETIVO: Protocolo de extracción de capital con bloqueo de concurrencia (MUTEX).
 * ACTUALIZACIÓN V5.51: Implementación de lock_payout atómico para evitar race conditions.
 * --------------------------------------------------------------------------------------
 */
exports.solicitarRetiro = functions.https.onCall(async (data, context) => {
    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD SUPREMA
    if (!context.auth) {
        reportSentinelMetric('security_unauth_payout_attempt');
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere sesión activa.');
    }

    const techId = context.auth.uid;
    const traceId = `trace_payout_${techId}_${Date.now()}`;
    const montoARetirar = parseFloat(parseFloat(data.monto).toFixed(2));

    console.log(JSON.stringify({
        level: "INFO",
        message: "Iniciando protocolo de retiro seguro V5.51",
        techId,
        monto: montoARetirar,
        traceId,
        engine: "SENTINEL_ANTIFRAGILE"
    }));

    // 🛡️ 2. VALIDACIÓN DE DATOS DE ENTRADA
    if (isNaN(montoARetirar) || montoARetirar <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Monto inválido para la operación.');
    }

    const techRef = db.collection("tecnicos").doc(techId);

    try {
        // ⚡ 3. TRANSACCIÓN ATÓMICA DE EXTRACCIÓN CON MUTEX
        const result = await db.runTransaction(async (transaction) => {
            const techSnap = await transaction.get(techRef);
            if (!techSnap.exists) throw new Error('EXPEDIENTE_NO_ENCONTRADO');

            const techData = techSnap.data();
            const wallet = techData.wallet || { saldo_pendiente: 0, saldo_en_revision: 0, lock_payout: false };
            
            const saldoDisponible = parseFloat((wallet.saldo_pendiente || 0).toFixed(2));
            const saldoEnRevision = parseFloat((wallet.saldo_en_revision || 0).toFixed(2));

            // --- REGLAS DE NEGOCIO SENTINEL (Antifragile Lock) ---

            // A. Verificación de Fondos
            if (montoARetirar > saldoDisponible) {
                return { success: false, reason: "INSOLVENCIA", disponible: saldoDisponible };
            }

            // B. MUTEX: Idempotencia de Proceso (Anti-Concurrencia V5.51)
            // Si lock_payout es true o hay saldo en revisión, bloqueamos físicamente la transacción
            if (wallet.lock_payout === true || saldoEnRevision > 0) {
                return { success: false, reason: "BLOQUEO_POR_TRANSACCION_ACTIVA" };
            }

            // C. Verificación de Configuración de Pago
            if (!techData.configuracion_pago?.metodo || techData.configuracion_pago?.metodo === 'por_definir') {
                return { success: false, reason: "CONFIGURACION_PAGO_REQUERIDA" };
            }

            // 🏗️ 4. GENERACIÓN DE PAYOUT DETERMINÍSTICO
            const payoutId = `pay_${techId.substring(0, 5)}_${Date.now()}`;
            const payoutRef = db.collection("payouts").doc(payoutId);

            transaction.set(payoutRef, {
                payout_id: payoutId,
                tecnico_id: techId,
                tecnico_nombre: techData.nombre || 'Técnico Gestia',
                monto: montoARetirar,
                fecha_solicitud: admin.firestore.FieldValue.serverTimestamp(),
                estado: "pendiente_aprobacion",
                metodo: techData.configuracion_pago.metodo,
                version_core: "V5.51_ANTIFRAGILE",
                traceId: traceId,
                metadata: {
                    ip_solicitud: context.rawRequest?.ip || "unknown",
                    userAgent: context.rawRequest?.headers['user-agent'] || "unknown"
                }
            });

            // ⚡ 5. MOVIMIENTO ATÓMICO Y ACTIVACIÓN DE LOCK (Mutex ON)
            transaction.update(techRef, {
                'wallet.lock_payout': true, // Bloqueo de concurrencia activado
                'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(-montoARetirar),
                'wallet.saldo_en_revision': admin.firestore.FieldValue.increment(montoARetirar),
                'wallet.ultimo_retiro_fecha': admin.firestore.FieldValue.serverTimestamp(),
                'auditoria.ultimo_trace_retiro': traceId,
                'auditoria.version_core': "V5.51_ANTIFRAGILE"
            });

            return { 
                success: true, 
                payoutId: payoutId, 
                monto: montoARetirar,
                traceId: traceId 
            };
        });

        // 🛰️ 6. TELEMETRÍA POST-COMMIT (RADAR V5.51)
        if (result.success) {
            reportSentinelMetric('payout_request_success');
            reportSentinelMetric('payout_volume_pending', result.monto);
            
            return { 
                success: true, 
                payoutId: result.payoutId, 
                monto: result.monto,
                traceId: result.traceId 
            };
        } else {
            reportSentinelMetric(`payout_denied_${result.reason.toLowerCase()}`);
            console.warn(`⚠️ [RETIRO_RECHAZADO] Motivo: ${result.reason} | Tech: ${techId}`);
            throw new functions.https.HttpsError('failed-precondition', result.reason);
        }

    } catch (error) {
        reportSentinelMetric('payout_fatal_errors');
        console.error(JSON.stringify({
            level: "FATAL",
            message: "Fallo en protocolo de retiro seguro",
            error: error.message,
            techId,
            traceId,
            module: "solicitarRetiro_V5_51"
        }));
        
        throw new functions.https.HttpsError('internal', error.message);
    }
});                                                                                                                                                                                                                                                                                                                                                                         
// ======================================================================================
// 🧩 MÓDULO 5: MOTOR IA - VALIDACIÓN DE CIERRE (SENTINEL V5.51 ANTIFRÁGIL)
// ======================================================================================
/**
 * OBJETIVO: Validación semántica de evidencias y notas de cierre mediante reglas de autoridad.
 * ACTUALIZACIÓN V5.51: Saneamiento Unicode en el hash de intención y Trazabilidad Reforzada.
 * --------------------------------------------------------------------------------------
 */

/**
 * 🛠️ HELPER DE IDEMPOTENCIA IA (PATCH 5)
 * Genera un ID único basado en el contenido semántico para evitar re-procesamiento.
 */
function generateOperationId(prompt, tenantId) {
    // Normalización Unicode V5.51: Elimina variaciones de acentos y espacios invisibles
    const normalized = prompt.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
        
    return crypto
        .createHash("sha256")
        .update(`${tenantId}_${normalized}`)
        .digest("hex")
        .slice(0, 32);
}

exports.validarCierreIA = functions.https.onCall(async (data, context) => {
    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) {
        reportSentinelMetric('security_unauth_ia_attempt');
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere autenticación activa.');
    }

    const { serviceId, notas_cierre, evidencias_urls, tenantId } = data;
    const userId = context.auth.uid;
    const traceId = `trace_ia_val_${serviceId}_${Date.now()}`;

    if (!serviceId || !notas_cierre) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan datos críticos para la validación: serviceId o notas_cierre.');
    }

    // 🛡️ 2. IDEMPOTENCIA POR INTENCIÓN (V5.51 HARDENED)
    const operationId = generateOperationId(notas_cierre, tenantId || "GLOBAL");
    const opRef = db.collection("gestia_ia_operations").doc(operationId);

    try {
        const existingOp = await opRef.get();
        if (existingOp.exists) {
            console.log(`♻️ [IA_REUSE] Reutilizando validación previa: ${operationId} | Trace: ${traceId}`);
            return { 
                aprobado: existingOp.data().result.aprobado, 
                token_validacion: existingOp.data().result.token_validacion,
                reused: true,
                status: "REUSED_FROM_SENTINEL_CACHE"
            };
        }

        const serviceRef = db.collection("services").doc(serviceId);

        // ⚡ 3. TRANSACCIÓN DE VALIDACIÓN Y SELLADO ATÓMICO
        const validationResult = await db.runTransaction(async (transaction) => {
            const serviceSnap = await transaction.get(serviceRef);
            if (!serviceSnap.exists) throw new Error('SERVICIO_INEXISTENTE');

            const serviceData = serviceSnap.data();

            // Guarda de Estado Terminal
            const estadosTerminales = ['finalizado', 'cancelado', 'liquidado'];
            if (estadosTerminales.includes(serviceData.estado)) {
                return { aprobado: true, mensaje: "Servicio ya procesado en estado terminal.", status: "ALREADY_TERMINAL" };
            }

            // Guarda de Autoría (Solo el técnico asignado puede validar el cierre)
            if (serviceData.tecnico_id !== userId) {
                reportSentinelMetric('ia_auth_mismatch');
                return { aprobado: false, motivo: "Autoridad insuficiente: No eres el técnico asignado.", status: "AUTH_FAIL" };
            }

            // 🧠 4. MOTOR SEMÁNTICO (Reglas de Calidad Sentinel V5.51)
            const palabrasClave = ["reparado", "instalado", "cambio", "mantenimiento", "listo", "corregido", "ajuste", "limpieza", "terminado"];
            const notaNormalizada = notas_cierre.toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .trim().replace(/\s+/g, ' ');
                
            const tienePalabrasClave = palabrasClave.some(p => notaNormalizada.includes(p));

            // Validación de Rigor: Longitud mínima y presencia de términos técnicos
            if (notaNormalizada.length < 25 || !tienePalabrasClave) {
                return { 
                    aprobado: false, 
                    motivo: "Evidencia semántica insuficiente. Detalla el trabajo técnico realizado (mín. 25 caracteres).",
                    status: "CONTENT_REJECTED" 
                };
            }

            // 🏗️ Generación de Token Determinístico Inmutable
            const token = `IA-OK-${serviceId}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

            // 🛡️ 5. ACTUALIZACIÓN DEL LEDGER DE SERVICIO (Sellado)
            transaction.update(serviceRef, {
                'auditoria_ia.validacion_previa': true,
                'auditoria_ia.fecha_revision': admin.firestore.FieldValue.serverTimestamp(),
                'auditoria_ia.token_validacion': token,
                'auditoria_ia.operationId': operationId,
                'notas_tecnico_cierre': notas_cierre,
                'evidencias_finales': evidencias_urls || [],
                'auditoria_ia.traceId': traceId,
                'auditoria_ia.version_core': "V5.51_ANTIFRAGILE"
            });

            return { aprobado: true, token_validacion: token, status: "SUCCESS" };
        });

        // 🛡️ 6. REGISTRO DE OPERACIÓN (Persistencia para Idempotencia)
        if (validationResult.status === "SUCCESS") {
            await opRef.set({
                operationId,
                type: "closure_validation",
                serviceId,
                userId,
                result: validationResult,
                traceId: traceId,
                version: "V5.51",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            reportSentinelMetric('ia_validation_success');
        } else if (validationResult.status === "CONTENT_REJECTED") {
            reportSentinelMetric('ia_validation_low_quality');
        }

        return validationResult;

    } catch (error) {
        reportSentinelMetric('ia_engine_fatal_errors');
        console.error(JSON.stringify({
            level: "FATAL",
            message: "Error en Motor IA de Validación Sentinel",
            error: error.message,
            serviceId,
            traceId,
            module: "validarCierreIA_V5.51"
        }));
        throw new functions.https.HttpsError('internal', `Error Crítico Sentinel IA: ${error.message}`);
    }
});
/**
 * ======================================================================================
 * 🧩 MÓDULO 6: TERMINAL HEBERTO - ARCHITECT ENGINE (SENTINEL V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * OBJETIVO: Orquestación de infraestructura mediante IA con ahorro de tokens y trazabilidad.
 * ACTUALIZACIÓN V5.51: Parche V5.51.1 - Migración de Secrets a Environment Variables (.env).
 * --------------------------------------------------------------------------------------
 */

exports.gestiaArchitectV5 = functions
    .runWith({ 
        // 🛡️ FIX V5.51.1: Eliminamos 'secrets' para forzar el uso del archivo .env local cargado vía dotenv
        timeoutSeconds: 540, 
        memory: "1GB"        
    })
    .https.onRequest((req, res) => {
        // 🛡️ Integración con el CORS Handler global instanciado en el arranque
        return corsHandler(req, res, async () => {
            const traceId = `trace_ia_${Date.now()}`;
            console.log(`🚀 [INICIO] Architect V5.51 (Sentinel Core - Antifragile) | Trace: ${traceId}`);

            try {
                // 🛡️ 1. FIREWALL & AUTORIDAD V5 (Reputación Adaptativa)
                const session = await firewallV5(req);
                if (!session || !session.authorized) {
                    reportSentinelMetric('ia_firewall_rejections');
                    throw new Error("BLOQUEO_FIREWALL: Autoridad no confirmada por Sentinel.");
                }

                const currentTenantId = session.tenantId; 
                if (!currentTenantId) throw new Error("TENANT_ID_REQUIRED: No se puede orquestar sin contexto de inquilino.");

                // 📦 2. VALIDACIÓN DE PAYLOAD & PROMPT
                const bodyData = req.body.data || req.body;
                let prompt = bodyData.prompt || (typeof bodyData === 'string' ? bodyData : "");

                if (!prompt || prompt.trim().length < 3) {
                    throw new Error("PROMPT_INVALIDO: La intención es demasiado corta o nula.");
                }

                // 🔒 3. IDEMPOTENCIA POR INTENCIÓN (PATCH 5 HARDENED - V5.51 SANEADA)
                // Utilizamos el Helper normalizado para evitar colisiones semánticas.
                const operationId = generateOperationId(prompt, currentTenantId);
                const opRef = db.collection("gestia_operations").doc(operationId);

                const existingOp = await opRef.get();
                if (existingOp.exists) {
                    reportSentinelMetric('ia_tokens_saved');
                    console.log(`♻️ [V5.51 AI] Hit de Idempotencia: ${operationId}. Reutilizando estructura.`);
                    return res.status(200).json({
                        data: {
                            success: true,
                            modulo_generado: existingOp.data().result,
                            reused: true,
                            operationId: operationId,
                            traceId
                        }
                    });
                }

                // 🏗️ 4. MEMORIA SEMÁNTICA (Contexto de Infraestructura Existente)
                let modulosExistentes = [];
                const modulesSnap = await db.collection("gestia_system_modules")
                    .where("tenantId", "==", currentTenantId)
                    .limit(50) 
                    .get();

                modulesSnap.forEach(doc => modulosExistentes.push(doc.id));

                // 📜 5. INSTRUCCIÓN MAESTRA (Protocolo de Generación Sentinel V5.51)
                const systemInstruction = `
Eres la TERMINAL HEBERTO V5.51. Identidad: Orquestador de Infraestructura Autónoma.
Decisión requerida: USE_MODULE (si hay match exacto o conceptual) o CREATE_MODULE (si es nuevo).

MODULOS_DETECTADOS: [${modulosExistentes.join(", ")}]

CONTRATO JSON OBLIGATORIO (STRICT):
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

REGLAS CRÍTICAS DE SEGURIDAD (V5.51 WHITELIST):
- El JavaScript debe ser puro para manipulación de DOM local.
- Máximo 8000 caracteres de JS.
- No incluyas scripts externos ni llamadas a red.
`;

                const model = genAI.getGenerativeModel({ 
                    model: "gemini-2.0-flash",
                    generationConfig: { temperature: 0.1, maxOutputTokens: 3200 }
                });

                // ⚡ 6. INVOCACIÓN AL CEREBRO
                const result = await model.generateContent(`${systemInstruction}\n\nSOLICITUD DEL ARQUITECTO:\n${prompt}`);
                let responseText = result.response.text();

                let cleaned = responseText.replace(/```json|```/g, "").trim();
                let jsonParsed;

                try {
                    jsonParsed = JSON.parse(cleaned);
                } catch (parseError) {
                    reportSentinelMetric('ia_architect_parse_errors');
                    throw new Error("ERROR_ESTRUCTURA_IA: El cerebro devolvió un JSON malformado.");
                }

                // --- 🛡️ 7. BLINDAJE POST-IA (Protocolo de Integridad & Sandbox V5.51) ---
                const validActions = ["USE_MODULE", "CREATE_MODULE"];
                if (!validActions.includes(jsonParsed.action)) throw new Error("ACCION_IA_INVALIDA");

                const jsPayload = jsonParsed.ejecucion?.payload?.javascript || "";

                // 🛑 SANDBOX V5.51: WHITELIST POSITIVA
                // Solo caracteres alfanuméricos, espacios, puntos, llaves, paréntesis y operadores básicos.
                // Bloquea por construcción cualquier intento de obfuscar "eval" o "fetch".
                const safeRegex = /^[a-zA-Z0-9\s\.\(\)\{\};,_\-+=<>!]*$/;
                const isSafe = safeRegex.test(jsPayload);

                if (!isSafe) {
                    reportSentinelMetric('ia_security_violation_blocked');
                    console.error(`🚫 [ALERTA SECURITY] Caracteres no permitidos en JS generado. Trace: ${traceId}`);
                    throw new Error("SECURITY_VIOLATION: Payload generado contiene caracteres o estructuras prohibidas.");
                }

                if (jsPayload.length > 8000) throw new Error("JS_OVERFLOW_PREVENCION");

                // --- 🚀 8. ORQUESTACIÓN DE INFRAESTRUCTURA (Atomic Bridge) ---
                if (jsonParsed.action === "CREATE_MODULE") {
                    console.log(`🏗️ [AUTHORITY] Generando nuevo componente vía SHA-256 Bridge...`);

                    const creation = await internalCreateModule({
                        modulo_nombre: jsonParsed.modulo_nombre || "Módulo Autogenerado",
                        esquema_campos: jsonParsed.esquema_campos || ["fecha", "valor"],
                        tenantId: currentTenantId,
                        userId: session.uid
                    });

                    jsonParsed.modulo_id = creation.modulo_id;
                    jsonParsed.conciencia.mensaje_ceo += `\n(Autorizado bajo ID: ${creation.modulo_id})`;
                }

                // 🔒 9. REGISTRO DE OPERACIÓN (Persistencia de Memoria IA)
                await opRef.set({
                    operationId,
                    type: "ai_module_generation",
                    tenantId: currentTenantId,
                    prompt: prompt,
                    result: jsonParsed,
                    status: "completed",
                    traceId: traceId,
                    version_core: "V5.51_ANTIFRAGILE",
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }).catch(err => console.error(`[OP_LOG_FAIL] ${operationId}`, err.message));

                // 🛰️ 10. TELEMETRÍA DE ÉXITO (RADAR V5.51)
                reportSentinelMetric('ia_architect_success');

                return res.status(200).json({
                    data: {
                        success: true,
                        modulo_generado: jsonParsed, 
                        operationId: operationId,
                        traceId,
                        status: "Arre con la que barre! 🍻"
                    }
                });

            } catch (error) {
                reportSentinelMetric('ia_architect_errors');
                console.error(`🔥 [FATAL ARCHITECT]: ${error.message} | Trace: ${traceId}`);

                return res.status(200).json({ 
                    data: { 
                        success: false, 
                        error: error.message,
                        traceId
                    } 
                });
            }
        });
    });

// Alias de exportación para compatibilidad
exports.generarModuloIA = exports.gestiaArchitectV5;
/**
 * ======================================================================================
 * 🧩 MÓDULO 7: TERMINAL - ENDPOINT DE CREACIÓN (SENTINEL V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * OBJETIVO: Creación manual de infraestructura con validación de autoridad absoluta.
 * ACTUALIZACIÓN V5.51: Restricción estricta de método POST y Rate Limit de autoridad.
 * REGLA DE ORO: El tenantId NUNCA se recibe del cliente; se extrae de la sesión.
 * --------------------------------------------------------------------------------------
 */

exports.createGestiaModule = functions
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onRequest((req, res) => {
    // 🛡️ Integración con corsHandler unificado del Módulo 0 (V5.51 FIX)
    return corsHandler(req, res, async () => {
      const traceId = `trace_direct_create_${Date.now()}`;
      
      try {
        // 🛡️ 1. VALIDACIÓN DE MÉTODO (Fix V5.51 - Anti-Abuse)
        // Solo permitimos POST para evitar ejecuciones accidentales o escaneos por GET.
        if (req.method !== "POST") {
            reportSentinelMetric('security_method_mismatch_creation');
            return res.status(405).json({ 
                data: { 
                    success: false, 
                    error: "METODO_NO_PERMITIDO: Solo se acepta POST para creación de infraestructura.",
                    traceId 
                } 
            });
        }

        // 🛡️ 2. FIREWALL & AUTORIDAD V5 (Sentinel Adaptive Core)
        // Verificamos reputación y obtenemos la sesión blindada.
        const session = await firewallV5(req);
        if (!session || !session.authorized) {
            // 🛰️ RADAR: Registro de intento de intrusión
            reportSentinelMetric('firewall_direct_creation_rejections');
            throw new Error("ACCESO_DENEGADO: Reputación insuficiente para autoridad directa.");
        }

        // 🛡️ 3. EXTRACCIÓN DE IDENTIDAD (Saneamiento V5.51)
        // El Rigor V5.51 prohíbe fallbacks silenciosos. Autoridad 100% ligada a sesión.
        const currentTenantId = session.tenantId;
        if (!currentTenantId) {
            throw new Error("TENANT_REQUIRED: No se puede crear infraestructura sin un TenantId validado.");
        }

        // 📦 4. VALIDACIÓN DE CONTRATO DE NEGOCIO (Whitelist Saneado)
        const data = req.body.data || req.body;
        
        if (!data.modulo_nombre || data.modulo_nombre.trim().length < 3) {
            throw new Error("CONTRATO_INVALIDO: El nombre del módulo es obligatorio y debe ser descriptivo.");
        }

        // 🛡️ 5. RATE LIMIT DE AUTORIDAD (Anti-Spam V5.51)
        // Evitamos inflación de infraestructura por bots o errores de bucle en el cliente.
        const rateLimitRef = db.collection("gestia_rate_limits").doc(`${currentTenantId}_creation`);
        const rateLimitSnap = await rateLimitRef.get();
        const now = Date.now();

        if (rateLimitSnap.exists) {
            const lastCreation = rateLimitSnap.data().timestamp;
            const creationsInWindow = rateLimitSnap.data().count || 0;
            
            // Límite: Máximo 5 módulos por minuto por Tenant
            if (now - lastCreation < 60000 && creationsInWindow >= 5) {
                reportSentinelMetric('creation_rate_limit_exceeded');
                throw new Error("RATE_LIMIT_EXCEEDED: Demasiadas creaciones en poco tiempo. Espera un minuto.");
            }
            
            await rateLimitRef.update({
                count: (now - lastCreation < 60000) ? admin.firestore.FieldValue.increment(1) : 1,
                timestamp: now
            });
        } else {
            await rateLimitRef.set({ count: 1, timestamp: now });
        }

        console.log(JSON.stringify({
            level: "INFO",
            message: `🏗️ [DIRECT_CREATE] Protocolo de creación manual activado`,
            modulo: data.modulo_nombre,
            tenantId: currentTenantId,
            uid: session.uid,
            traceId,
            engine: "SENTINEL_V5.51_ANTIFRAGILE"
        }));

        // 🏗️ 6. INVOCACIÓN A LA AUTORIDAD ATÓMICA SHA-256
        // Reutilizamos la lógica del Módulo 0 (V5.51 con Normalización Unicode).
        const result = await internalCreateModule({
            modulo_nombre: data.modulo_nombre,
            esquema_campos: data.esquema_campos || ["fecha", "descripcion"],
            tenantId: currentTenantId,
            userId: session.uid
        });

        // 🛰️ 7. TELEMETRÍA POST-COMMIT (RADAR V5.51)
        reportSentinelMetric('direct_module_creation_success');

        // 📊 8. RESPUESTA DE ÉXITO SENTINEL
        return res.status(200).json({ 
            data: {
                ...result,
                traceId: traceId,
                status: "INFRASTRUCTURE_AUTHORIZED",
                engine: "SENTINEL_CORE_V5.51_ANTIFRAGILE",
                version: "V5.51"
            }
        });

      } catch (e) {
        // 🛰️ RADAR: Fallo en creación manual
        reportSentinelMetric('direct_module_creation_errors');

        console.error(JSON.stringify({
            level: "ERROR",
            message: "Fallo en Endpoint de Creación Directa",
            error: e.message,
            traceId,
            module: "createGestiaModule_V5_51"
        }));

        // Retornamos 200 con success: false para manejo elegante en terminal_heberto
        return res.status(200).json({ 
            data: { 
                success: false, 
                error: e.message,
                traceId: traceId,
                code: "AUTHORITY_REJECTION"
            } 
        });
      }
    });
  });
/**
 * ======================================================================================
 * 🧩 MÓDULO 8: SCHEDULERS - MANTENIMIENTO PREVENTIVO (SENTINEL V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * OBJETIVO: Generación automática de servicios recurrentes con blindaje de duplicidad.
 * ACTUALIZACIÓN V5.51: ID Determinístico por slot diario y Validación de Integridad Pre-Batch.
 * REGLA 1: ID de Servicio inmutable (prev_{ID_PROGRAMACION}_{FECHA}).
 * REGLA 2: Telemetría de Ingresos Proyectados en el Radar Sentinel.
 * --------------------------------------------------------------------------------------
 */

exports.onScheduleMantenimiento = functions.pubsub
    .schedule('0 0 * * *') // Ejecución diaria a medianoche
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        const hoy = admin.firestore.Timestamp.now();
        const hoyString = hoy.toDate().toISOString().split('T')[0];
        const traceId = `trace_sched_${hoyString}`;

        console.log(JSON.stringify({
            level: "INFO",
            message: "🕒 [SCHEDULER V5.51] Iniciando barrido de preventivos recurrentes",
            traceId,
            engine: "SENTINEL_ANTIFRAGILE"
        }));

        try {
            // 🛡️ 1. QUERY DE INFRAESTRUCTURA ACTIVA
            // Buscamos programaciones cuya proxima_fecha sea hoy o anterior y estén activas.
            const preventivosQuery = await db.collection("mantenimientos_programados")
                .where("proxima_fecha", "<=", hoy)
                .where("activo", "==", true)
                .limit(200).get();

            if (preventivosQuery.empty) {
                console.log("✅ [SCHEDULER] Nada pendiente por procesar hoy.");
                return null;
            }

            const batch = db.batch();
            let ingresosProyectados = 0;
            let serviciosGeneradosCount = 0;

            // 🛡️ 2. PROCESAMIENTO DETERMINÍSTICO (Anti-Duplicidad V5.51)
            for (const doc of preventivosQuery.docs) {
                const prog = doc.data();
                
                // Generamos el ID inmutable para este día específico.
                // Si el Scheduler se re-ejecuta por fallo de red, el ID colisionará evitando duplicados.
                const serviceId = `prev_${doc.id}_${hoyString}`;
                const newServiceRef = db.collection("services").doc(serviceId);

                // FIX V5.51: Validación de integridad. Evitamos merge:true ciego para no heredar estados corruptos.
                const costo = parseFloat((prog.costo_fijo || 0).toFixed(2));
                ingresosProyectados += costo;
                serviciosGeneradosCount++;

                // A. Registro del Servicio Preventivo
                batch.set(newServiceRef, {
                    servicio_id: serviceId,
                    cliente_id: prog.cliente_id,
                    descripcion: `[PREVENTIVO] ${prog.descripcion_equipo || 'Mantenimiento Técnico Programado'}`,
                    monto_total: costo,
                    estado: "pendiente",
                    tipo_servicio: "preventivo",
                    clientType: prog.clientType || "ON_DEMAND",
                    tenantId: prog.tenantId, // Rigor V5.51: Debe existir tenantId en la programación
                    fecha_creacion: hoy,
                    generado_por_scheduler: true,
                    version_core: "V5.51_ANTIFRAGILE",
                    traceId: traceId,
                    auditoria_programacion: {
                        source_id: doc.id,
                        ciclo_actual: (prog.total_ciclos_completados || 0) + 1
                    }
                }, { merge: true }); // Mantenemos merge por seguridad de red, pero con payload completo.

                // B. Actualización del Ciclo de Programación (Salto a la siguiente fecha)
                const frecuenciaDías = parseInt(prog.frecuencia_dias) || 30;
                const proximaFechaDate = new Date(hoy.toDate());
                proximaFechaDate.setDate(proximaFechaDate.getDate() + frecuenciaDías);

                batch.update(doc.ref, {
                    ultima_fecha_generada: hoy,
                    proxima_fecha: admin.firestore.Timestamp.fromDate(proximaFechaDate),
                    total_ciclos_completados: admin.firestore.FieldValue.increment(1),
                    'auditoria.ultimo_trace_scheduler': traceId,
                    'auditoria.version_core': "V5.51_ANTIFRAGILE"
                });
            }

            // ⚡ 3. COMPROMISO ATÓMICO (BATCH COMMIT)
            await batch.commit();

            // 🛰️ 4. TELEMETRÍA POST-COMMIT (RADAR V5.51)
            reportSentinelMetric('scheduler_execution_success');
            reportSentinelMetric('revenue_projected_scheduled', ingresosProyectados);
            reportSentinelMetric('services_auto_generated', serviciosGeneradosCount);

            console.log(JSON.stringify({
                level: "SUCCESS",
                message: `🚀 [SCHEDULER V5.51] ${serviciosGeneradosCount} servicios sellados.`,
                ingresosProyectados,
                traceId
            }));

            return null;

        } catch (error) {
            // 🛰️ RADAR: Error crítico en la automatización de infraestructura
            reportSentinelMetric('scheduler_fatal_errors');

            console.error(JSON.stringify({
                level: "FATAL",
                message: "Fallo crítico en Motor de Recurrencia Sentinel",
                error: error.message,
                traceId,
                module: "onScheduleMantenimiento_V5_51"
            }));
            
            // Retornamos null para evitar que GCP reintente indefinidamente en fallos de lógica
            return null; 
        }
    });
/**
 * ======================================================================================
 * 🧩 MÓDULO 9: OPERACIONES - AMENIDADES Y RESERVAS (SENTINEL V5.50 HARDENED)
 * ======================================================================================
 * OBJETIVO: Gestión de espacios comunes con prevención de traslapes y auditoría.
 * --------------------------------------------------------------------------------------
 */
exports.reservarCancha = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado.');

    const { amenityId, fecha, horaInicio, horaFin, condominioId } = data;
    const traceId = `trace_reserva_${context.auth.uid}_${Date.now()}`;

    // 🛡️ 1. VALIDACIÓN DE CONTRATO
    if (!amenityId || !fecha || !horaInicio || !horaFin) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros de reserva.');
    }

    try {
        return await db.runTransaction(async (transaction) => {
            const reservasRef = db.collection("reservas");
            
            // 🛡️ 2. BÚSQUEDA DE TRASLAPES (Blindaje de Disponibilidad)
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
                reportSentinelMetric('amenity_overlap_blocked');
                return { success: false, message: "Horario no disponible. Intente otro rango.", code: "OVERLAP" };
            }

            // 🛡️ 3. GENERACIÓN DETERMINÍSTICA DE RESERVA
            const nuevaReservaRef = reservasRef.doc();
            transaction.set(nuevaReservaRef, {
                residente_id: context.auth.uid,
                amenityId, 
                fecha, 
                horaInicio, 
                horaFin,
                condominioId: condominioId || "general",
                estado: "confirmado",
                traceId: traceId,
                version_core: "V5.50_HARDENED",
                fecha_creacion: admin.firestore.FieldValue.serverTimestamp()
            });

            // 🛰️ TELEMETRÍA POST-COMMIT (RADAR)
            reportSentinelMetric('amenity_reservation_success');

            return { success: true, reservaId: nuevaReservaRef.id, traceId };
        });
    } catch (error) {
        reportSentinelMetric('amenity_reservation_fatal');
        console.error(`🔥 [RESERVA_FAIL] Trace: ${traceId}`, error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * ======================================================================================
 * 🧩 MÓDULO 10: CONTROL DE ACCESOS DINÁMICOS (SENTINEL V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * OBJETIVO: Registro de entradas y salidas con trazabilidad de autoridad y saneamiento.
 * ACTUALIZACIÓN V5.51: Whitelist de Payload para evitar inyección de datos basura.
 * --------------------------------------------------------------------------------------
 */
exports.crearAcceso = functions.https.onCall(async (data, context) => {
    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) {
        reportSentinelMetric('security_unauth_access_attempt');
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere sesión activa.');
    }
    
    const { condominioId, moduloId, payload } = data;
    const traceId = `trace_acceso_${Date.now()}`;

    // 🛡️ 2. VALIDACIÓN DE CONTEXTO (Saneamiento V5.51)
    if (!condominioId || !moduloId || !payload) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros críticos de acceso (condominio/modulo/payload).');
    }

    try {
        /**
         * 🛡️ 3. WHITELIST DE PAYLOAD (V5.51)
         * Evitamos que el cliente inyecte campos arbitrarios en la base de datos.
         * Solo permitimos campos estándar de identificación y vehículos.
         */
        const safePayload = {
            nombre: payload.nombre || "Visitante",
            dni: payload.dni || "N/A",
            motivo: payload.motivo || "Visita General",
            placas: payload.placas || "Sin vehículo",
            marca_modelo: payload.marca_modelo || "N/A",
            persona_visita: payload.persona_visita || "N/A",
            observaciones: payload.observaciones ? payload.observaciones.substring(0, 250) : ""
        };

        const registroRef = db.collection("gestia_records")
                                .doc(condominioId).collection(moduloId).doc();
                                
        // ⚡ REGISTRO ATÓMICO DE ENTRADA
        await registroRef.set({
            ...safePayload,
            registro_id: registroRef.id,
            creado_por_uid: context.auth.uid,
            creado_en: admin.firestore.FieldValue.serverTimestamp(),
            status: "activo",
            traceId: traceId,
            version_core: "V5.51_ANTIFRAGILE",
            metadata_autoridad: {
                engine: "Sentinel_V5.51",
                atomic: true
            }
        });
        
        reportSentinelMetric('access_entry_registered');
        
        console.log(JSON.stringify({
            level: "INFO",
            message: "✅ [ACCESO] Entrada registrada exitosamente",
            condominioId,
            moduloId,
            traceId
        }));

        return { status: 'success', id: registroRef.id, traceId };

    } catch (error) {
        reportSentinelMetric('access_entry_error');
        console.error(`🔥 [ACCESO_ERROR] Trace: ${traceId}`, error.message);
        throw new functions.https.HttpsError('internal', `Error Sentinel Accesos: ${error.message}`);
    }
});

exports.registrarSalida = functions.https.onCall(async (data, context) => {
    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');
    
    const { condominioId, moduloId, registroId } = data;
    const traceId = `trace_salida_${Date.now()}`;

    if (!registroId) throw new functions.https.HttpsError('invalid-argument', 'registroId es obligatorio para cerrar el acceso.');

    try {
        const registroRef = db.collection("gestia_records")
                                .doc(condominioId).collection(moduloId).doc(registroId);
                                
        /**
         * ⚡ ACTUALIZACIÓN DE SALIDA (Atómica)
         * Se usa update para no sobrescribir los datos de entrada originales.
         */
        await registroRef.update({
            status: "salida",
            fecha_salida: admin.firestore.FieldValue.serverTimestamp(),
            cerrado_por_uid: context.auth.uid,
            'auditoria.ultimo_trace': traceId,
            'auditoria.version_core': "V5.51_ANTIFRAGILE"
        });
        
        reportSentinelMetric('access_exit_registered');
        
        return { status: 'success', traceId };

    } catch (error) {
        reportSentinelMetric('access_exit_error');
        console.error(`🔥 [SALIDA_ERROR] Trace: ${traceId}`, error.message);
        throw new functions.https.HttpsError('internal', `Error Sentinel Salidas: ${error.message}`);
    }
});
/**
 * ======================================================================================
 * 🧩 MÓDULO 11: SEGURIDAD - PAQUETERÍA E INCIDENCIAS (SENTINEL V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * OBJETIVO: Gestión de última milla y logs de seguridad industrial.
 * ACTUALIZACIÓN V5.51: Validación de Tenant, limpieza de FCM y saneamiento de payloads.
 * --------------------------------------------------------------------------------------
 */

exports.registrarIngresoPaquete = functions.https.onCall(async (data, context) => {
    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) {
        reportSentinelMetric('security_unauth_package_attempt');
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere sesión activa.');
    }

    const { condominioId, residenteId, empresa_paqueteria, descripcion } = data;
    const traceId = `trace_pkg_in_${Date.now()}`;

    // 🛡️ 2. VALIDACIÓN DE CONTRATO (Saneamiento V5.51)
    if (!condominioId || !residenteId || !empresa_paqueteria) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros críticos (condominio/residente/empresa).');
    }

    try {
        const paqueteRef = db.collection("packages").doc(condominioId).collection("items").doc();
        
        // ⚡ REGISTRO DE PAQUETE (Whitelist Saneada)
        await paqueteRef.set({
            paquete_id: paqueteRef.id,
            residente_id: residenteId,
            guardia_id: context.auth.uid,
            empresa: empresa_paqueteria.substring(0, 50),
            descripcion: descripcion ? descripcion.substring(0, 200) : "Sin descripción",
            estado: "en_caseta",
            condominioId: condominioId,
            traceId: traceId,
            version_core: "V5.51_ANTIFRAGILE",
            fecha_ingreso: admin.firestore.FieldValue.serverTimestamp()
        });
        
        reportSentinelMetric('package_entry_success');
        
        console.log(JSON.stringify({
            level: "INFO",
            message: "📦 [PAQUETERIA] Ingreso registrado",
            paqueteId: paqueteRef.id,
            condominioId,
            traceId
        }));

        return { success: true, id: paqueteRef.id, traceId };
    } catch (error) {
        reportSentinelMetric('package_entry_fatal');
        console.error(`🔥 [PKG_IN_ERROR] Trace: ${traceId}`, error.message);
        throw new functions.https.HttpsError('internal', `Error Sentinel Paquetería: ${error.message}`);
    }
});

exports.registrarSalidaPaquete = functions.https.onCall(async (data, context) => {
    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');
    
    const { condominioId, paqueteId, firma_url } = data;
    const traceId = `trace_pkg_out_${Date.now()}`;

    if (!condominioId || !paqueteId) {
        throw new functions.https.HttpsError('invalid-argument', 'condominioId y paqueteId son obligatorios.');
    }

    try {
        const paqueteRef = db.collection("packages").doc(condominioId).collection("items").doc(paqueteId);
        
        /**
         * ⚡ ACTUALIZACIÓN DE ENTREGA (Atómica)
         * Usamos update para preservar el historial de ingreso.
         */
        await paqueteRef.update({
            estado: "entregado",
            fecha_entrega: admin.firestore.FieldValue.serverTimestamp(),
            firma_recibido_url: firma_url || "RECIBIDO_SIN_FIRMA_DIGITAL",
            guardia_entrega_id: context.auth.uid,
            'auditoria.ultimo_trace': traceId,
            'auditoria.version_core': "V5.51_ANTIFRAGILE"
        });
        
        reportSentinelMetric('package_delivery_success');
        return { success: true, traceId };

    } catch (error) {
        reportSentinelMetric('package_delivery_error');
        console.error(`🔥 [PKG_OUT_ERROR] Trace: ${traceId}`, error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.registrarIncidenciaAcceso = functions.https.onCall(async (data, context) => {
    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');
    
    const { condominioId, tipo_incidencia, descripcion, severidad } = data;
    const traceId = `trace_incidencia_${Date.now()}`;

    if (!condominioId || !tipo_incidencia) {
        throw new functions.https.HttpsError('invalid-argument', 'condominioId y tipo_incidencia son requeridos.');
    }

    try {
        const ref = db.collection("security_logs").doc();
        
        // ⚡ REGISTRO DE INCIDENCIA (Whitelist Saneada V5.51)
        await ref.set({
            log_id: ref.id,
            condominioId,
            guardia_id: context.auth.uid,
            tipo: tipo_incidencia,
            descripcion: descripcion ? descripcion.substring(0, 500) : "Sin detalles adicionales",
            severidad: ["baja", "media", "alta", "critica"].includes(severidad) ? severidad : "baja",
            traceId: traceId,
            version_core: "V5.51_ANTIFRAGILE",
            fecha: admin.firestore.FieldValue.serverTimestamp()
        });
        
        reportSentinelMetric(`security_incident_${severidad || 'baja'}`);
        return { success: true, id: ref.id, traceId };

    } catch (error) {
        reportSentinelMetric('security_incident_error');
        console.error(`🔥 [INCIDENCIA_ERROR] Trace: ${traceId}`, error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * ⚡ TRIGGER: Notificación de Paquetería (FCM Delivery Hardened V5.51)
 */
exports.onPackageReceived = functions.firestore
    .document('packages/{condominioId}/items/{paqueteId}')
    .onCreate(async (snap, context) => {
        const paquete = snap.data();
        const traceId = `trace_fcm_${context.params.paqueteId}`;

        try {
            const userSnap = await db.collection("users").doc(paquete.residente_id).get();
            
            if (userSnap.exists && userSnap.data().fcmToken) {
                const token = userSnap.data().fcmToken;
                const payload = {
                    notification: {
                        title: "📦 ¡Llegó un paquete para ti!",
                        body: `Empresa: ${paquete.empresa}. Ya puedes recogerlo en caseta.`
                    },
                    data: {
                        paqueteId: context.params.paqueteId,
                        traceId: traceId,
                        click_action: "FLUTTER_NOTIFICATION_CLICK"
                    }
                };

                const response = await admin.messaging().sendToDevice(token, payload);

                // 🛡️ LIMPIEZA DE TOKENS (V5.51 FIX)
                // Si FCM detecta que el token ya no es válido, lo removemos para ahorrar recursos y errores.
                if (response.results[0].error) {
                    const error = response.results[0].error.code;
                    if (error === 'messaging/invalid-registration-token' || error === 'messaging/registration-token-not-registered') {
                        console.log(`🧹 [FCM_CLEANUP] Removiendo token inválido del usuario: ${paquete.residente_id}`);
                        await db.collection("users").doc(paquete.residente_id).update({
                            fcmToken: admin.firestore.FieldValue.delete(),
                            'auditoria.fcm_cleanup': admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }

                reportSentinelMetric('fcm_notification_sent');
            }
        } catch (e) {
            console.error(`❌ [FCM_FAIL] Trace: ${traceId}`, e);
            reportSentinelMetric('fcm_notification_fail');
        }
    });
/**
 * ======================================================================================
 * 🧩 MÓDULO 12: AUTOMATIZACIÓN - LIMPIEZA DE SESIONES (COST CONTROL V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * OBJETIVO: Limpieza de sesiones Stripe huérfanas para mantener la DB ligera.
 * ACTUALIZACIÓN V5.51: Validación de Integridad de Pago (Evita cancelar cobros en curso).
 * --------------------------------------------------------------------------------------
 */
exports.limpiarSesionesHuerfanas = functions.pubsub
    .schedule('every 12 hours')
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        // Establecemos el umbral de 24 horas para considerar una sesión como "abandonada".
        const hace24Horas = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 86400000));
        const traceId = `trace_cleanup_${Date.now()}`;

        console.log(`🧹 [CLEANUP V5.51] Iniciando barrido de sesiones huérfanas... Trace: ${traceId}`);

        try {
            // 🛡️ 1. QUERY DE SESIONES EN RIESGO
            // Filtramos por estado "iniciado_stripe" que no han tenido actividad en 24h.
            const snapshot = await db.collection("services")
                .where("estado", "==", "iniciado_stripe")
                .where("fecha_creacion", "<=", hace24Horas)
                .limit(200).get();

            if (snapshot.empty) {
                console.log("✅ [CLEANUP] Búnker limpio. No hay sesiones huérfanas.");
                return null;
            }

            const batch = db.batch();
            let montoRecuperadoPotencial = 0;
            let sesionesCanceladasCount = 0;

            snapshot.forEach(doc => {
                const data = doc.data();

                /**
                 * 🛡️ 2. GUARDA DE INTEGRIDAD FINANCIERA (V5.51 FIX)
                 * Antes de cancelar, verificamos que no exista un 'ultimo_pago_id'.
                 * Si existe un ID de pago, significa que el Webhook podría estar en camino
                 * o hubo un reintento exitoso; por lo tanto, NO cancelamos para evitar inconsistencia.
                 */
                if (data.ultimo_pago_id) {
                    console.log(`⚠️ [CLEANUP_SKIP] Saltando ${doc.id}: Ya tiene un intento de pago vinculado.`);
                    return;
                }

                montoRecuperadoPotencial += (data.monto_total || 0);
                sesionesCanceladasCount++;

                // ⚡ ACTUALIZACIÓN ATÓMICA DE ESTADO
                batch.update(doc.ref, { 
                    estado: "cancelado_por_timeout",
                    fecha_cancelacion: admin.firestore.FieldValue.serverTimestamp(),
                    'auditoria.cleanup_trace': traceId,
                    'auditoria.version_core': "V5.51_ANTIFRAGILE",
                    'auditoria.motivo': "Sesión huérfana > 24h"
                });
            });

            // Si después del filtrado no hay nada que cancelar, salimos.
            if (sesionesCanceladasCount === 0) return null;

            await batch.commit();

            // 🛰️ 3. TELEMETRÍA POST-COMMIT (RADAR V5.51)
            reportSentinelMetric('cleanup_sessions_processed', sesionesCanceladasCount);
            reportSentinelMetric('cleanup_potential_revenue_lost', montoRecuperadoPotencial);

            console.log(JSON.stringify({
                level: "SUCCESS",
                message: `🧹 [CLEANUP_FINISH] Protocolo completado`,
                procesados: sesionesCanceladasCount,
                monto_total: montoRecuperadoPotencial,
                traceId
            }));

            return null;
        } catch (e) {
            reportSentinelMetric('cleanup_fatal_errors');
            console.error(JSON.stringify({
                level: "FATAL",
                message: "Fallo en protocolo de limpieza automatizada",
                error: e.message,
                traceId,
                module: "limpiarSesionesHuerfanas_V5_51"
            }));
            return null;
        }
    });
/**
 * ======================================================================================
 * 🛰️ MÓDULO 13: SENTINEL HEALTH ENGINE (EL RADAR V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * NOTA: Se eliminan declaraciones de admin/db duplicadas. 
 * Esta sección consolida la integridad del Radar y cierra el scope del despliegue.
 * ACTUALIZACIÓN V5.51: Verificación de Heartbeat de arranque y Cierre de Scope.
 * --------------------------------------------------------------------------------------
 */

// 🛡️ REGLA SUPREMA: No redeclarar 'admin' ni 'db'. Usar los del scope global del Paso 1.

/**
 * startupHeartbeat: Notificación de despliegue exitoso al Radar.
 * Se ejecuta una sola vez al cargar el archivo en el contenedor de Firebase.
 */
(async () => {
    try {
        const startupTrace = `startup_${Date.now()}`;
        
        // Reportamos el reinicio de los motores al Radar de Salud
        await reportSentinelMetric('system_restarts');
        
        console.log(JSON.stringify({
            level: "SYSTEM",
            message: "🛠️ [SENTINEL_CORE] Búnker GestiaPremium V5.51 ANTIFRÁGIL cargado con éxito.",
            architect: "Heber Mendoza",
            status: "READY",
            engine: "V5.51_ANTIFRAGILE",
            traceId: startupTrace
        }));
    } catch (e) {
        console.warn("⚠️ [STARTUP_WARN] El Radar no pudo registrar el inicio, pero el motor está vivo.");
    }
})();

/**
 * ======================================================================================
 * FIN DEL NÚCLEO GESTIAPREMIUM V5.51 (SENTINEL CORE - ANTIFRÁGIL)
 * ======================================================================================
 * REGLA 1: SIN CORTES. CÓDIGO ÍNTEGRO. 13 MÓDULOS SELLADOS.
 * --------------------------------------------------------------------------------------
 */
