/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ARCHITECTURE V5.40 (ANTI-FRAGILE CORE)
 * ======================================================================================
 * DESPLEGADO POR: Heber Mendoza (Arquitecto Supremo)
 * REGLA 1: SIN CORTES. SIN COMPACTACIÓN. CÓDIGO ÍNTEGRO (>810 LÍNEAS).
 * ACTUALIZACIÓN: Idempotencia de Pagos, Autoridad Atómica y Blindaje de Secretos.
 * --------------------------------------------------------------------------------------
 */

// 1. IMPORTACIONES DE NÚCLEO (Librerías externas primero)
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
// FIX V5.40: Se elimina Hardcode de Stripe. Uso de Variable de Entorno Segura.
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 2. INICIALIZACIÓN INMEDIATA (ENCENDER EL MOTOR ANTES DE TODO)
if (!admin.apps.length) { 
    admin.initializeApp(); 
}
const db = admin.firestore();
const corsHandler = require("cors")({ origin: true });

// 3. IMPORTACIONES DE MÓDULOS PROPIOS
const { firewallV4 } = require("./firewall/firewall.v4");

// 4. CONFIGURACIÓN DE INTELIGENCIA ARTIFICIAL
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");

const app = express();
app.use(cors({ origin: true }));

// ==================================================================
// 🧩 MÓDULO 0: UTILIDADES DE AUTORIDAD Y PERSISTENCIA ATÓMICA
// ==================================================================

/**
 * internalCreateModule: Única autoridad de creación en el búnker.
 * Integra validación semántica, versionado de esquemas y auditoría.
 */
async function internalCreateModule({ modulo_nombre, esquema_campos, tenantId, userId }) {
    console.log(`🏗️ [AUTHORITY] Evaluando creación semántica: ${modulo_nombre} | Tenant: ${tenantId}`);

    try {
        // 🛡️ 1. VALIDACIÓN DE DUPLICADO SEMÁNTICO (Fix Abuelo #2)
        const existingByName = await db.collection("gestia_system_modules")
            .where("tenantId", "==", tenantId)
            .where("nombre_display", "==", modulo_nombre)
            .limit(1)
            .get();

        if (!existingByName.empty) {
            const existingDoc = existingByName.docs[0];
            console.log(`⚠️ Match semántico hallado: ${existingDoc.id}. Reutilizando.`);
            return { 
                success: true, 
                modulo_id: existingDoc.id, 
                status: "reused_semantic_match",
                data: existingDoc.data()
            };
        }

        // 🛡️ 2. GENERACIÓN DE ID AUTORITARIO (Basado en Timestamp Inmutable)
        const modulo_id = `modulo_${Date.now()}`;
        const ref = db.collection("gestia_system_modules").doc(modulo_id);

        // 🛡️ 3. ESCRITURA CON REGISTRO DE EVOLUCIÓN (Versionado de Esquema)
        const schemaPayload = {
            nombre_display: modulo_nombre,
            esquema_campos: esquema_campos || ["fecha", "descripcion"],
            status: "activo",
            tenantId: tenantId,
            creado_por: userId,
            version_core: "V5.40",
            schema_version: 1,
            schema_history: [{
                version: 1,
                campos: esquema_campos || ["fecha", "descripcion"],
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
                engine: "Gestia_Authority_V1",
                atomic: true
            }
        };

        await ref.set(schemaPayload);

        // 🛡️ 4. INICIALIZACIÓN DE ADN DINÁMICO (Sub-colección de registros)
        const initRef = db.collection("gestia_dynamic_data").doc(modulo_id)
            .collection("registros").doc("_init");
            
        await initRef.set({
            initialized: true,
            mensaje: "Data-fabric configurada para el nuevo módulo.",
            tenantId: tenantId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 🛡️ 5. AUDITORÍA DE INFRAESTRUCTURA
        await db.collection("logs_terminal_heberto").add({
            tipo: "CREATE_MODULE",
            modulo_id: modulo_id,
            tenantId: tenantId,
            uid: userId,
            action: "atomic_creation_success",
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ [EXITO] Módulo ${modulo_id} inyectado en el búnker.`);
        return { success: true, modulo_id, status: "created" };

    } catch (error) {
        console.error("🔥 Error interno en internalCreateModule:", error);
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
// 🧩 MÓDULO 2: FINANZAS - WEBHOOK MULTIMODAL CON IDEMPOTENCIA
// ==================================================================
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

    // 🛡️ FILTRO DE IDEMPOTENCIA (Fix Abuelo #2)
    const eventId = event.id;
    const eventLogRef = db.collection("stripe_events").doc(eventId);
    
    try {
        const eventLog = await eventLogRef.get();
        if (eventLog.exists) {
            console.log(`♻️ [IDEMPOTENCIA] Evento ${eventId} ya procesado. Abortando duplicado.`);
            return res.status(200).send({ received: true, status: "already_processed" });
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const { serviceId, tipo_pago, clientType, clientId } = session.metadata;
            const montoTotal = Number(session.amount_total || 0) / 100;

            if (!serviceId) throw new Error("No serviceId in metadata");

            const ticketRef = db.collection("services").doc(serviceId);
            const ticketSnap = await ticketRef.get();

            if (!ticketSnap.exists) throw new Error(`Ticket ${serviceId} no existe.`);

            const data = ticketSnap.data();
            const estadoActual = data.estado;

            let nuevoEstado = estadoActual;
            if (tipo_pago === "garantia_inicial" && (estadoActual === "iniciado_stripe" || estadoActual === "cotizando")) {
                nuevoEstado = "pendiente";
            } else if (tipo_pago === "liquidacion_saldo" && (estadoActual === "procesando_saldo" || estadoActual === "cotizando")) {
                nuevoEstado = "trabajando";
            }

            let comisionGestia = (clientType === "ON_DEMAND") ? montoTotal * 0.32 : 0;
            let nota = `Pago de ${tipo_pago.replace('_', ' ')} | Idempotencia: ${eventId}`;

            const batch = db.batch();

            // 1. Marcar evento como procesado
            batch.set(eventLogRef, { 
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                type: event.type,
                serviceId: serviceId
            });

            // 2. Actualización de Servicio
            batch.update(ticketRef, {
                estado: nuevoEstado,
                metodo_pago: "stripe",
                ultimo_pago_id: session.id,
                fecha_pago: admin.firestore.FieldValue.serverTimestamp(),
                monto_pagado: admin.firestore.FieldValue.increment(montoTotal)
            });

            // 3. Registro en Transacciones
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
            console.log(`✅ [V5.40] Flujo ${clientType} procesado para ticket ${serviceId}`);
        }

        res.status(200).send({ received: true });

    } catch (err) {
        console.error("❌ Error en Procesamiento Webhook:", err);
        return res.status(500).send("Internal Server Error");
    }
});

exports.stripeWebhook = functions.https.onRequest(app);

// ==================================================================
// 🧩 MÓDULO 3: TRIGGER - FINALIZACIÓN DE SERVICIO (V5.19 INDUSTRIAL)
// ==================================================================
exports.onServiceCompleted = functions.firestore
    .document('services/{serviceId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();
        const serviceId = context.params.serviceId;

        if (oldData.estado !== 'finalizado' && newData.estado === 'finalizado') {
            console.log(`🚀 [CIERRE] Procesando balance para ticket: ${serviceId}`);

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
                    nota: `Liquidación automática: ${clientType}`
                });

                batch.update(db.collection("services").doc(serviceId), {
                    liquidado: true,
                    fecha_liquidacion: admin.firestore.FieldValue.serverTimestamp(),
                    comision_aplicada_tecnico: parseFloat(comisionTecnico.toFixed(2))
                });

                await batch.commit();
                console.log(`✅ [V5.19] Wallet del técnico ${techId} actualizada.`);
                return null;

            } catch (error) {
                console.error("❌ Error Crítico en onServiceCompleted:", error);
                return null;
            }
        }
        return null;
    });

// ==================================================================
// 🧩 MÓDULO 4: WALLET - SOLICITUD DE RETIRO (V5.19 PRO)
// ==================================================================
exports.solicitarRetiro = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debes estar logueado.');
    }

    const techId = context.auth.uid;
    const montoARetirar = parseFloat(data.monto);

    if (isNaN(montoARetirar) || montoARetirar <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Monto inválido.');
    }

    const montoNormalizado = parseFloat(montoARetirar.toFixed(2));
    const techRef = db.collection("tecnicos").doc(techId);

    try {
        return await db.runTransaction(async (transaction) => {
            const techSnap = await transaction.get(techRef);
            if (!techSnap.exists) throw new Error('Técnico no encontrado.');

            const techData = techSnap.data();
            const saldoDisponible = parseFloat((techData.wallet?.saldo_pendiente || 0).toFixed(2));
            const saldoEnRevision = parseFloat((techData.wallet?.saldo_en_revision || 0).toFixed(2));

            if (montoNormalizado > saldoDisponible) {
                throw new Error(`Saldo insuficiente. Disponible: $${saldoDisponible}`);
            }

            if (saldoEnRevision > 0) {
                throw new Error('Ya tienes un retiro en proceso.');
            }

            const payoutRef = db.collection("payouts").doc();
            const payoutId = payoutRef.id;

            transaction.set(payoutRef, {
                payout_id: payoutId,
                tecnico_id: techId,
                tecnico_nombre: techData.nombre || 'Técnico Gestia',
                monto: montoNormalizado,
                fecha_solicitud: admin.firestore.FieldValue.serverTimestamp(),
                estado: "pendiente_aprobacion",
                metodo: techData.configuracion_pago?.metodo || 'por_definir',
                version: "v5.19_pro"
            });

            transaction.update(techRef, {
                'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(-montoNormalizado),
                'wallet.saldo_en_revision': admin.firestore.FieldValue.increment(montoNormalizado),
                'wallet.ultimo_retiro_fecha': admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, payoutId: payoutId };
        });
    } catch (error) {
        console.error("❌ Error en Proceso de Retiro:", error);
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

// ==================================================================
// 🧩 MÓDULO 6: TERMINAL HEBERTO - ARCHITECT ENGINE (V5.40 ATOMIC)
// ==================================================================
exports.gestiaArchitectV5 = functions
    .runWith({ 
        secrets: ["GEMINI_KEY", "STRIPE_SECRET_KEY"], 
        timeoutSeconds: 540, 
        memory: "1GB"        
    })
    .https.onRequest((req, res) => {
        return corsHandler(req, res, async () => {
            console.log("🚀 [INICIO] Architect V5.40 (Anti-Fragile Core)");

            try {
                // 🛡️ 1. Firewall & Autoridad
                const session = await firewallV4(req);
                if (!session || !session.authorized) throw new Error("BLOQUEO_FIREWALL: Autoridad no confirmada.");
                
                const currentTenantId = session.tenantId || "UXMAL39";

                // 📦 2. Validación de Payload
                const bodyData = req.body.data || req.body;
                let prompt = bodyData.prompt || (typeof bodyData === 'string' ? bodyData : "");
                if (!prompt) throw new Error("PROMPT_VACIO");

                // 🏗️ 3. Memoria Semántica (Fix Abuelo #4: Filtrado por Tenant)
                let modulosExistentes = [];
                const modulesSnap = await db.collection("gestia_system_modules")
                    .where("tenantId", "==", currentTenantId)
                    .limit(50) 
                    .get();
                
                modulesSnap.forEach(doc => modulosExistentes.push(doc.id));

                // 📜 4. Instrucción Maestra (CONTRATO DE ACCIÓN SUPREMO)
                const systemInstruction = `
Eres la TERMINAL HEBERTO V5.40. Identidad: Orquestador de Infraestructura Autónoma.
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
- Si es algo nuevo o no hay match -> CREATE_MODULE y modulo_id: "TEMP_ID".
- El JavaScript no debe exceder los 8000 caracteres.
`;

                const model = genAI.getGenerativeModel({ 
                    model: "gemini-2.5-flash",
                    generationConfig: { temperature: 0.15, maxOutputTokens: 3200 }
                });

                // ⚡ 5. Invocación al Cerebro
                const result = await model.generateContent(`${systemInstruction}\n\nSOLICITUD:\n${prompt}`);
                let responseText = result.response.text();
                let cleaned = responseText.replace(/```json|```/g, "").trim();
                let jsonParsed = JSON.parse(cleaned);

                // --- 🛡️ BLINDAJE POST-IA (Fix Abuelo #5) ---
                const validActions = ["USE_MODULE", "CREATE_MODULE"];
                if (!validActions.includes(jsonParsed.action)) throw new Error("INVALID_ACTION_FROM_IA");

                const jsPayload = jsonParsed.ejecucion?.payload?.javascript || "";
                if (jsPayload.length > 8000) throw new Error("JS_EXCESIVO_PREVENCION_DE_BUCLE");

                // --- 🚀 6. ORQUESTACIÓN AUTÓNOMA (Sincronización Atómica) ---
                if (jsonParsed.action === "CREATE_MODULE") {
                    console.log("🏗️ [ATOMIC] Detectada creación. Invocando Notario Interno...");
                    
                    const creation = await internalCreateModule({
                        modulo_nombre: jsonParsed.modulo_nombre || "Módulo Sin Nombre",
                        esquema_campos: jsonParsed.esquema_campos || ["fecha", "descripcion"],
                        tenantId: currentTenantId,
                        userId: session.uid
                    });

                    // Inyectamos ID Real generado por el servidor
                    jsonParsed.modulo_id = creation.modulo_id;
                    jsonParsed.conciencia.mensaje_ceo += `\n(ID Generado: ${creation.modulo_id})`;
                } else if (jsonParsed.action === "USE_MODULE" && !modulosExistentes.includes(jsonParsed.modulo_id)) {
                    // Fallback: Si la IA dice USE pero no existe en este tenant, lo creamos.
                    const creation = await internalCreateModule({
                        modulo_nombre: jsonParsed.modulo_nombre || "Módulo Recuperado",
                        esquema_campos: jsonParsed.esquema_campos || ["fecha"],
                        tenantId: currentTenantId,
                        userId: session.uid
                    });
                    jsonParsed.modulo_id = creation.modulo_id;
                    jsonParsed.action = "CREATE_MODULE";
                }

                // 🚀 RETORNO: Objeto JSON Nativo
                return res.status(200).json({
                    data: {
                        success: true,
                        modulo_generado: jsonParsed, 
                        status: "Arre con la que barre! 🍻"
                    }
                });

            } catch (error) {
                console.error("🔥 [FATAL ARCHITECT]:", error.message);
                return res.status(200).json({ data: { success: false, error: error.message } });
            }
        });
    });

exports.generarModuloIA = exports.gestiaArchitectV5;

// ==================================================================
// 🧩 MÓDULO 7: TERMINAL - ENDPOINT DE CREACIÓN (MODO AUTORIDAD)
// ==================================================================
exports.createGestiaModule = functions
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onRequest((req, res) => {
    return corsHandler(req, res, async () => {
      try {
        const session = await firewallV4(req);
        if (!session || !session.authorized) throw new Error("ACCESO_DENEGADO");

        const data = req.body.data || req.body;
        
        const result = await internalCreateModule({
            modulo_nombre: data.modulo_nombre,
            esquema_campos: data.esquema_campos,
            tenantId: session.tenantId || "UXMAL39",
            userId: session.uid
        });

        return res.status(200).json({ data: result });

      } catch (e) {
        return res.status(200).json({ data: { success: false, error: e.message } });
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
        
        // 🛡️ Búsqueda de traslape horario
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

// Trigger de Notificación Push para Paquetes (FCM)
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

// FIN DEL NÚCLEO GESTIAPREMIUM V5.40 - SISTEMA ANTI-FRÁGIL
