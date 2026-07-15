/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ARCHITECTURE V5.56 (HYBRID CORE)
 * ======================================================================================
 * DESPLEGADO POR: Heber Mendoza (Arquitecto Supremo)
 * REGLA 1: SIN CORTES INTERNOS. SIN COMPACTACIÓN. CÓDIGO ÍNTEGRO.
 * ESTRATEGIA: Inicialización Global de Firebase y Lazy-Load para Singletons.
 * --------------------------------------------------------------------------------------
 */

// ======================================================================================
// 0. ENV
// ======================================================================================
require('dotenv').config();

// ======================================================================================
// 1. IMPORTACIONES
// ======================================================================================
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const Stripe = require("stripe");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleGenAI } = require("@google/genai");

const {
    validateRepoWriteSyntax
} = require("./repo-syntax-validator");

const {
    normalizeSemanticToolPlan
} = require("./repo-semantic-tool-planner");

const {
    understandServerIntentV7,
    toPublicIntentContract
} = require("./jarvis-intent-runtime-v7.cjs");

const {
    runDailyJarvisSupervision,
    getLatestJarvisSupervisionReport
} = require("./jarvis-daily-supervisor");

const {
    runJarvisWebResearch,
    runJarvisDirectDomainResearch,
    normalizeResearchQuery
} = require("./jarvis-web-research");

const {
    runJarvisImageGeneration,
    runJarvisImageFallback
} = require("./jarvis-image-generation");

const {
    runJarvisMediaAnalysis
} = require("./jarvis-media-analysis");

const {
    runJarvisSemanticPlanner,
    runJarvisSemanticResponse
} = require("./jarvis-semantic-planner");

const {
    createJarvisGenAIProviderChain
} = require("./jarvis-genai-provider-chain");

/**
 * 🛡️ SELLADO DE INFRAESTRUCTURA (GLOBAL SCOPE)
 * Fix Crítico: initializeApp debe ocurrir al cargar el archivo para evitar 'app/no-app'.
 */
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "fixgo-44e4d"
    });
}

// FACTORIES
const firewallFactory = require("./firewall/firewall.v5");


const repoWriteAuthFactory =
    require("./repo-write-auth");

const repoWriteIdempotencyFactory =
    require("./repo-write-idempotency");



// ======================================================================================
// 2. EXPRESS (INSTANCIACIÓN ANTES DE INIT)
// ======================================================================================
const app = express();
const corsHandler = cors({ origin: true });

function applyArchitectCorsHeaders(req, res) {
    const origin =
        req.headers.origin ||
        "https://fixgo-44e4d.web.app";

    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, X-Requested-With"
    );
    res.set("Access-Control-Max-Age", "3600");
}

// Webhook primero para preservar el rawBody necesario para la firma de Stripe
app.post("/stripe-webhook", express.raw({ type: 'application/json' }));

app.use(corsHandler);

app.use((req, res, next) => {
    if (req.originalUrl === "/stripe-webhook") return next();
    express.json()(req, res, next);
});

// ======================================================================================
// 3. SINGLETONS (CONTENEDORES DE ESTADO)
// ======================================================================================
let db = admin.firestore(); // Sello inmediato de base de datos

const {
    authorizeRepoWriteRequest
} = repoWriteAuthFactory({
    admin,
    db
});



const {
    claimRepoWrite,
    completeRepoWrite,
    failRepoWrite
} = repoWriteIdempotencyFactory({
    admin,
    db,
    crypto
});


let stripe;
let genAI;
let groundedGenAI;
let vertexGenAI;
let plannerGenAI;
let firewallV5;
let initialized = false;

// ======================================================================================
// 4. INIT CORE (SISTEMA DE ARRANQUE PEREZOSO)
// ======================================================================================
function initCore() {
    if (initialized) return;

    // Firebase ya está inicializado arriba, solo poblamos singletons de servicios externos
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

    const rawKey = process.env.GEMINI_KEY || "";
    genAI = new GoogleGenerativeAI(rawKey);

    

    const firewall = firewallFactory({ admin, db });

    if (!firewall || !firewall.firewallV5) {
        throw new Error("FIREWALL_INIT_FAILED: El factory no devolvió el motor V5.");
    }

    firewallV5 = firewall.firewallV5;
    initialized = true;

    console.log("🛡️ [MOTOR] Sentinel V5.56: IGNICIÓN_CONFIRMADA");
}

function getGroundedGenAI() {
    if (groundedGenAI) {
        return groundedGenAI;
    }

    let runtimeConfig = {};

    try {
        runtimeConfig =
            functions.config?.() || {};
    }
    catch(error) {}

    const apiKey =
        String(
            process.env.GEMINI_KEY ||
            process.env.GEMINI_API_KEY ||
            runtimeConfig?.gemini?.key ||
            runtimeConfig?.gemini?.api_key ||
            runtimeConfig?.google?.gemini_key ||
            ""
        )
            .trim();

    if (!apiKey) {
        throw new Error(
            "GEMINI_KEY_MISSING"
        );
    }

    groundedGenAI =
        new GoogleGenAI({ apiKey });

    return groundedGenAI;
}

function getVertexGenAI() {
    if (!vertexGenAI) {
        vertexGenAI = new GoogleGenAI({
            vertexai: true,
            project:
                process.env.GCLOUD_PROJECT ||
                process.env.GOOGLE_CLOUD_PROJECT ||
                "fixgo-44e4d",
            location: "global",
            apiVersion: "v1"
        });
    }

    return vertexGenAI;
}

function getPlannerGenAI() {
    if (plannerGenAI) {
        return plannerGenAI;
    }

    const providers = [];

    try {
        providers.push({
            name: "gemini-developer",
            ai: getGroundedGenAI()
        });
    }
    catch(error) {
        console.warn(JSON.stringify({
            level: "WARNING",
            message: "JARVIS_GEMINI_DEVELOPER_UNAVAILABLE",
            error: error?.message || String(error)
        }));
    }

    providers.push({
        name: "vertex-adc",
        ai: getVertexGenAI()
    });

    plannerGenAI = createJarvisGenAIProviderChain({ providers });
    return plannerGenAI;
}

// ======================================================================================
// 🧠 MÓDULO 0.5: ENDPOINT IA: INTENT PARSER (KERNEL BRIDGE) - BLINDADO V5.56
// ======================================================================================
// Declarado temprano en el stack de ruteo de Express para evitar 404s en Firebase
app.post(["/ai-intent", "/api/ai-intent", "*/ai-intent"], async (req, res) => {
    console.log(`⚡ [KERNEL BRIDGE] Endpoint alcanzado. Path detectado: ${req.path}`);
    
    initCore();

    const traceId = `trace_intent_${Date.now()}`;
    let fallbackInput = "";
    let fallbackIntentContext = {};

    try {
        const session = await firewallV5(req);
        if (!session?.authorized) {
            await reportSentinelMetric('ai_intent_firewall_rejections');
            return res.status(401).json({
                error: "AUTH_REQUIRED",
                traceId
            });
        }

        const payload = req.body?.input;

const input =
    typeof payload === "object"
        ? payload.input
        : payload;

const intentContext =
    req.body?.context ||
    (
        typeof payload === "object"
            ? payload.context
            : null
    ) ||
    {};

fallbackInput =
    typeof input === "string"
        ? input
        : "";

fallbackIntentContext =
    intentContext;

        console.log(
    "🔥 REQUEST_BODY",
    req.body
);

console.log(
    "🔥 INPUT_TYPE",
    typeof input
);

        if (typeof input !== "string" || input.trim().length < 2) {
            const emptyIntent =
                understandServerIntentV7(
                    "",
                    intentContext
                );

            const emptyContract =
                {
                    ...toPublicIntentContract(
                        emptyIntent
                    ),
                    intent:
                        "analyze",
                    target:
                        "system",
                    confidence:
                        0
                };

            return res.json({
                output:
                    JSON.stringify(
                        emptyContract
                    ),
                intentV7:
                    emptyIntent,
                traceId
            });
        }

        if (input.length > 1000) {
            return res.status(413).json({
                error: "INPUT_TOO_LARGE",
                traceId
            });
        }

        const localIntentV7 =
            understandServerIntentV7(
                input,
                intentContext
            );

        const localContractV7 =
            toPublicIntentContract(
                localIntentV7
            );

        if (
            localIntentV7.needsClarification === true ||
            localIntentV7.confidence >= 0.86
        ) {

            return res.json({
                output:
                    JSON.stringify(
                        localContractV7
                    ),
                intentV7:
                    localIntentV7,
                traceId,
                source:
                    "jarvis_intent_runtime_v7_server"
            });
        }

        const prompt = `
Eres el núcleo de interpretación de un sistema operativo.

Responde SOLO con JSON válido:

{
  "intent": string,
  "target": string,
  "confidence": number
}

Reglas:
- intent ∈ ["logout","analyze","open","repair","create","update","delete"]

- target puede ser:
  - admin
  - system
  - auth
  - user
  - payments
  - archivo específico
  - módulo específico
  - nombre de archivo

Ejemplos:

Input: "analiza tecnico-b2b.html"
{
  "intent":"analyze",
  "target":"tecnico-b2b.html",
  "confidence":0.95
}

Input: "revisa admin-panel.js"
{
  "intent":"analyze",
  "target":"admin-panel.js",
  "confidence":0.95
}

Input: "revisa pagos"
{
  "intent":"analyze",
  "target":"payments",
  "confidence":0.95
}

- confidence entre 0 y 1
- NO texto extra

Input: "${input}"
`;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        });


            console.log(
    "🔥 SERVER_V7_CONTRACT_ACTIVE"
);
        const result = await model.generateContent(prompt);

        let raw = result.response.text();

        // 🔥 limpieza defensiva ajustada
        raw = raw
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        let parsed;

        // 🔥 VALIDACIÓN ESTRICTA DEL SCHEMA
        try {
            const temp = JSON.parse(raw);


            console.log(
    "🔥 SERVER_TEMP",
    temp
); 
            console.log(
            "🔥 GEMINI RAW:",
             temp
            );

            if (
         temp &&
        typeof temp === "object" &&
         typeof temp.intent === "string"
            ) {

             parsed = {
              ...localContractV7,
              intent: temp.intent,
              target: temp.target || localContractV7.target || "system",
               confidence:
            typeof temp.confidence === "number"
                ? Math.max(
                    temp.confidence,
                    localContractV7.confidence || 0
                )
                : (localContractV7.confidence || 0.5),

            externalAI:
                temp,
            aiFallback:
                "gemini_secondary_classifier"
         };

          } else {

          throw new Error("INVALID_SCHEMA");
}

        } catch {
            // Fallback seguro si el LLM alucina o el esquema no hace match
            parsed = {
                ...localContractV7,
                aiFallback:
                    "local_v7_after_invalid_llm_schema"
            };
        }

        return res.json({
            output: JSON.stringify(parsed),
            intentV7:
                localIntentV7,
            traceId
        });

    } catch (error) {
        console.error("🔥 AI INTENT ERROR:", error.message);

        const fallbackIntentV7 =
            understandServerIntentV7(
                fallbackInput,
                fallbackIntentContext
            );

        return res.status(200).json({
            output:
                JSON.stringify({
                    ...toPublicIntentContract(
                        fallbackIntentV7
                    ),
                    aiFallback:
                        "local_v7_after_endpoint_error"
                }),
            intentV7:
                fallbackIntentV7,
            error: error.message,
            traceId
        });
    }
});


// ======================================================================================
// 5. HELPERS DE AUTORIDAD Y SALUD SENTINEL (V5.55 FINAL CORE)
// ======================================================================================

/**
 * 🛡️ IS_VALID_ID: El Cadenero Estricto. (V5.55 HARDENED)
 * No modifica nada, solo dictamina si el ID que envía la Terminal es legal.
 * FIX V5.55: Bloqueo explícito de literales corruptos y strings 'undefined'.
 */
function isValidId(id) {
    const regex = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
    return (
        typeof id === "string" &&
        id !== "modulo_id" && 
        id !== "undefined" && // 🛡️ Evita que el rastro de un error anterior se vuelva ID
        id.length >= 3 && 
        id.length <= 50 &&
        regex.test(id)
    );
}

/**
 * 🛰️ reportSentinelMetric: El corazón del Radar.
 * Incrementa contadores globales de salud para telemetría en tiempo real.
 */
async function reportSentinelMetric(metricName, value = 1) {
    try {
        if (!db) return; // 🛡️ Guarda perezosa: No opera si el motor no ha despertado.

        const today = new Date().toISOString().split('T')[0]; 
        const healthRef = db.collection("gestia_system_health").doc(today);

        await healthRef.set({
            [metricName]: admin.firestore.FieldValue.increment(value),
            last_heartbeat: admin.firestore.FieldValue.serverTimestamp(),
            version_core: "V5.55_FINAL",
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
 * ESTRATEGIA V5.55: Búsqueda Multicapa de Identidad.
 * FIX V5.55: Extrae el ID de cualquier llave del contrato para evitar el leak de [undefined].
 */
async function internalCreateModule(params) {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
    
    /**
     * 🛡️ DEEP-SEARCH ID V5.55
     * Si el pipeline perdió la llave original, la rescatamos de los alias posibles.
     */
    const modulo_id = params.modulo_id || params.id || params.opId || params.documentId;
    const modulo_nombre = params.modulo_nombre || params.nombre || modulo_id;
    const { esquema_campos, tenantId, userId } = params;

    console.log(JSON.stringify({
        level: "INFO",
        message: `🏗️ [AUTHORITY V5.55] Validando Identidad Final: [${modulo_id}]`,
        tenantId,
        traceId,
        engine: "SENTINEL_HARDENED_V5.55"
    }));

    // 🛡️ 1. VALIDACIÓN HARDENED (Sincronización con Audit Engine V5.55)
    if (!isValidId(modulo_id)) {
        console.error(`🚨 [ID_FLOW] RECHAZADO: El campo ID llegó como [${modulo_id}]`);
        // 🔥 FIX: Prefijo AUDIT para que el frontend lo procese como error de identidad
        throw new Error(`FALLO_V5_55_AUDIT: ID_CORRUPTO_RECHAZADO [${modulo_id}]`);
    }

    try {
        const ref = db.collection("gestia_system_modules").doc(modulo_id);

        // 🛡️ 2. TRANSACCIÓN DE ESCRITURA SEGURA Y POLÍTICA DE COLISIÓN
        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            
            if (doc.exists) {
                console.warn(`⚠️ [ID_FLOW] COLISIÓN: El módulo ${modulo_id} ya existe.`);
                throw new Error(`FALLO_V5_55_AUDIT: EL_MODULO_YA_EXISTE [${modulo_id}]`);
            }

            const now = new Date();

            const schemaPayload = {
                modulo_id: modulo_id,
                nombre_display: modulo_nombre,
                esquema_campos: esquema_campos || ["fecha", "descripcion"],
                status: "activo",
                tenantId: tenantId,
                creado_por: userId,
                version_core: "V5.55_FINAL",
                traceId: traceId,
                schema_version: 1,

                schema_history: [{
                    version: 1,
                    campos: esquema_campos || ["fecha", "descripcion"],
                    createdAt: now
                }],

                createdAt: admin.firestore.FieldValue.serverTimestamp(),

                metadata: {
                    engine: "Gestia_Authority_V5.55",
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
                mensaje: "Data-fabric configurada bajo Sentinel Core V5.55 FINAL",
                tenantId: tenantId,
                traceId: traceId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, modulo_id, status: "CREADO_CON_EXITO" };
        });

        // 🛡️ 4. TELEMETRÍA Y AUDITORÍA POST-COMMIT
        try { await reportSentinelMetric('modules_created_new'); } catch(e) {}

        db.collection("logs_terminal_heberto").add({
            tipo: "CREATE_MODULE_V5_55",
            modulo_id: result.modulo_id,
            tenantId: tenantId,
            uid: userId,
            traceId: traceId,
            status: result.status,
            version: "V5.55",
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.warn(`[AUDIT_FAIL] Trace: ${traceId}`, err.message));

        console.log(`✅ [EXITO] Autoridad confirmada para ${result.modulo_id} | Trace: ${traceId}`);
        
        return { ...result, traceId };

    } catch (error) {
        try { await reportSentinelMetric('authority_creation_errors'); } catch(e) {}

        console.error(JSON.stringify({
            level: "FATAL",
            error: error.message,
            traceId,
            module: "internalCreateModule",
            context: "V5.55_FINAL_CORE"
        }));
        throw error;
    }
}

// ======================================================================================
// 🧩 MÓDULO 1: FINANZAS - GENERADOR DE SESIÓN STRIPE (V5.55 FINAL CORE)
// ======================================================================================
/**
 * OBJETIVO: Creación de checkout seguro con inyección de metadata para trazabilidad.
 * ACTUALIZACIÓN V5.55: Sincronización con el flujo de autoridad determinística.
 * --------------------------------------------------------------------------------------
 */
app.post("/create-checkout-session", async (req, res) => {
    // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-Load Injection)
    initCore();

    const traceId = `trace_checkout_${Date.now()}`;
    
    try {
        // 🛡️ 1. VALIDACIÓN DE AUTORIDAD (SENTINEL V5.55)
        const sessionAuth = await firewallV5(req);
        
        if (!sessionAuth || !sessionAuth.authorized) {
            await reportSentinelMetric('security_unauth_checkout_attempt');
            console.error(`🚫 [CHECKOUT_DENIED] Autoridad no confirmada. Trace: ${traceId}`);
            return res.status(401).json({ 
                error: "ACCESO_DENEGADO: Autoridad insuficiente para generar cobros.",
                traceId 
            });
        }

        const { serviceId, descripcion, monto, tipo_pago, clientType } = req.body;
        const currentTenantId = sessionAuth.tenantId;

        // 🛡️ 2. VALIDACIÓN DE CONTRATO
        if (!serviceId || !monto || isNaN(monto) || monto <= 0) {
            console.error(`🚫 [CHECKOUT_REJECTED] Payload inválido. Trace: ${traceId}`);
            return res.status(400).json({ 
                error: "CONTRATO_INVALIDO: serviceId y monto positivo son obligatorios.",
                traceId 
            });
        }

        console.log(JSON.stringify({
            level: "INFO",
            message: `🏗️ [STRIPE_START] Generando sesión de pago V5.55`,
            serviceId,
            tenantId: currentTenantId,
            traceId,
            engine: "SENTINEL_CORE"
        }));

        // 🏗️ 3. CREACIÓN DE SESIÓN EN STRIPE (Usando Singleton 'stripe')
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'mxn',
                    product_data: {
                        name: descripcion || 'Servicio GestiaPremium',
                        description: `ID Seguimiento: ${serviceId} | Modo: ${clientType || 'ON_DEMAND'}`,
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
                tenantId: currentTenantId,
                traceId: traceId,
                version_core: "V5.55_FINAL"
            }
        });

        // 🛰️ 4. TELEMETRÍA PRE-REDIRECCIÓN
        await reportSentinelMetric('checkout_sessions_generated');

        return res.json({ 
            id: session.id, 
            url: session.url, 
            traceId 
        });

    } catch (error) {
        await reportSentinelMetric('checkout_fatal_errors');
        console.error(JSON.stringify({
            level: "ERROR",
            message: "Fallo en Generador de Checkout Stripe V5.55",
            error: error.message,
            traceId,
            module: "FINANZAS_V5_55"
        }));
        
        return res.status(500).json({ 
            error: "ERROR_INTERNO_SENTINEL: No se pudo procesar la solicitud de pago.", 
            traceId 
        });
    }
});

// ======================================================================================
// 🧩 MÓDULO 2: FINANZAS - WEBHOOK MULTIMODAL (V5.55 FINAL CORE)
// ======================================================================================
/**
 * OBJETIVO: Procesamiento de pagos con triple capa de idempotencia y Radar desacoplado.
 * ACTUALIZACIÓN V5.55: Sincronización de trazabilidad con Architect Engine y Sentinel Core.
 * --------------------------------------------------------------------------------------
 */

// 🛡️ MIDDLEWARE DE AISLAMIENTO: Protege la integridad del rawBody para la firma de Stripe
app.post(["/", "/webhook", "/stripe-webhook"], express.raw({ type: 'application/json' }), async (req, res) => {
    // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-Load Injection)
    initCore();

    const traceId = `trace_webhook_${Date.now()}`;
    let event;

    // 🛡️ 1. VALIDACIÓN DE FIRMA (CAPA 0 - SEGURIDAD)
    try {
        const sig = req.headers['stripe-signature'];
        // Usamos el singleton 'stripe' inicializado por initCore
        event = stripe.webhooks.constructEvent(
            req.body, // express.raw inyecta el buffer aquí
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        await reportSentinelMetric('webhook_signature_errors');
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
         * ⚡ FIX V5.55: Usamos .create() para evitar Race Conditions.
         * Si el documento ya existe, Firebase detiene el proceso atómicamente.
         */
        await eventLogRef.create({
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            type: event.type,
            traceId: traceId,
            version_core: "V5.55_FINAL"
        });

        // 🧠 3. PROCESAMIENTO DE LÓGICA DE NEGOCIO
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const { serviceId, tipo_pago, clientType, tenantId } = session.metadata;
            const montoTotal = Number(session.amount_total || 0) / 100;

            if (!serviceId) {
                // ⚠️ FASE 5: DEAD-LETTER LOGIC (Captura de huérfanos)
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
                await reportSentinelMetric('revenue_orphan_attempts');
                return res.status(404).send({ error: "Service not found", serviceId, traceId });
            }

            const ticketData = ticketSnap.data();

            // 🛡️ 4. VALIDACIÓN CROSS-TENANT (SENTINEL V5.55)
            if (ticketData.tenantId !== tenantId) {
                await reportSentinelMetric('revenue_cross_tenant_attack');
                console.error(`🚫 [ALERTA] Intento de contaminación Multi-tenant detectado. Service: ${serviceId} | Tenant: ${tenantId}`);
                return res.status(403).send({ error: "SECURITY_VIOLATION: Tenant mismatch", traceId });
            }

            // 🛡️ 5. GUARDAS DE ESTADO TERMINAL (Sentinel Core)
            const estadosProhibidos = ["finalizado", "cancelado", "archivado"];
            if (estadosProhibidos.includes(ticketData.estado)) {
                await reportSentinelMetric('revenue_terminal_state_blocked', montoTotal);
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

            // ⚡ 6. EJECUCIÓN ATÓMICA (BATCH COMMIT V5.55)
            const batch = db.batch();

            batch.update(ticketRef, {
                estado: nuevoEstado,
                metodo_pago: "stripe",
                ultimo_pago_id: session.id,
                fecha_pago: admin.firestore.FieldValue.serverTimestamp(),
                monto_pagado: admin.firestore.FieldValue.increment(montoTotal),
                'auditoria.ultimo_trace_pago': traceId,
                'auditoria.version_core': "V5.55_FINAL"
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
                version: "V5.55_FINAL"
            });

            await batch.commit();

            // 🛰️ 7. TELEMETRÍA POST-COMMIT (RADAR)
            await reportSentinelMetric('revenue_total_processed', montoTotal);
            await reportSentinelMetric('stripe_webhooks_success');

            console.log(JSON.stringify({
                level: "SUCCESS",
                message: "Transacción financiera sellada V5.55",
                serviceId,
                montoTotal,
                traceId
            }));
        }

        return res.status(200).send({ received: true, traceId });

    } catch (err) {
        // Manejo de colisión de idempotencia
        if (err.code === 6 || err.message.includes("already exists")) {
            await reportSentinelMetric('stripe_duplicates_blocked');
            console.log(`♻️ [IDEMPOTENCIA] Evento ${eventId} bloqueado en escritura. Finalizando.`);
            return res.status(200).send({ received: true, status: "event_already_processed", traceId });
        }

        await reportSentinelMetric('revenue_fatal_errors');
        console.error(JSON.stringify({
            level: "FATAL",
            error: err.message,
            traceId,
            module: "WEBHOOK_FINANCIERO_V5_55"
        }));

        return res.status(500).send({ 
            error: "Internal Sentinel Error", 
            traceId,
            retry: true 
        });
    }
});

// 🏁 EXPORTACIÓN CENTRALIZADA (Fix V5.55: Punto de entrada Express)
exports.api = functions.https.onRequest(app);

// ======================================================================================
// 🧩 MÓDULO 3: TRIGGER - FINALIZACIÓN DE SERVICIO (V5.55 FINAL CORE)
// ======================================================================================
/**
 * OBJETIVO: Liquidación atómica de comisiones y actualización de wallet post-servicio.
 * ACTUALIZACIÓN V5.55: Sincronización con el flujo de auditoría Sentinel y Radar.
 * --------------------------------------------------------------------------------------
 */
exports.onServiceCompleted = functions.firestore
    .document('services/{serviceId}')
    .onUpdate(async (change, context) => {
        // 🛡️ 0. DESPERTAR EL MOTOR (Trigger Event Injection)
        initCore();

        const newData = change.after.data();
        const oldData = change.before.data();
        const serviceId = context.params.serviceId;
        const traceId = `trace_cierre_${serviceId}_${Date.now()}`;

        // 🛡️ 1. GUARDA DE IDEMPOTENCIA DE NEGOCIO (Sentinel Core V5.55)
        if (newData.liquidado === true || oldData.estado === 'finalizado' || newData.estado !== 'finalizado') {
            return null; 
        }

        console.log(JSON.stringify({
            level: "INFO",
            message: `🚀 [CIERRE V5.55] Iniciando liquidación atómica`,
            serviceId,
            traceId,
            engine: "SENTINEL_FINAL_CORE"
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
                // Preservamos lógica UXMAL: monto fijo o factor 0.85
                comisionTecnico = parseFloat((newData.monto_tecnico_fijo || (montoTotal * 0.85)).toFixed(2)); 
                comisionGestia = parseFloat((montoTotal - comisionTecnico).toFixed(2));
            }

            const batch = db.batch();

            // 🛡️ 3. REGISTRO DE TRANSACCIÓN DETERMINÍSTICO (V5.55 Hardened)
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
                version_core: "V5.55_FINAL",
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
                    'auditoria.ultimo_trace_pago': traceId,
                    'auditoria.version_core': "V5.55_FINAL"
                });
            }

            // ✅ 5. CIERRE DE CICLO EN EL SERVICIO
            const serviceRef = change.after.ref;
            batch.update(serviceRef, {
                liquidado: true,
                fecha_liquidacion: admin.firestore.FieldValue.serverTimestamp(),
                comision_aplicada_tecnico: comisionTecnico,
                trace_liquidacion: traceId,
                metadata_cierre: {
                    version_core: "V5.55_FINAL",
                    engine: "Sentinel_Final_Core",
                    traceId: traceId
                }
            });

            await batch.commit();

            // 🛰️ 6. TELEMETRÍA POST-COMMIT
            await reportSentinelMetric('service_liquidation_success');
            if (comisionGestia > 0) {
                await reportSentinelMetric('gestia_revenue_collected', comisionGestia);
            }
            
            console.log(JSON.stringify({
                level: "SUCCESS",
                message: "Liquidación sellada V5.55",
                serviceId,
                techId,
                ganancia: comisionTecnico,
                traceId
            }));

            return null;

        } catch (error) {
            await reportSentinelMetric('service_liquidation_fatal');
            console.error(JSON.stringify({
                level: "FATAL",
                message: "Error Crítico en Liquidación V5.55",
                error: error.message,
                serviceId,
                traceId,
                module: "onServiceCompleted_V5_55"
            }));
            
            return null;
        }
    });

// ======================================================================================
// 🧩 MÓDULO 4: WALLET - SOLICITUD DE RETIRO (V5.55 FINAL CORE)
// ======================================================================================
/**
 * OBJETIVO: Protocolo de extracción de capital con bloqueo de concurrencia (MUTEX).
 * ACTUALIZACIÓN V5.55: Sincronización con el Radar de Auditoría y bloqueo Antifragile.
 * --------------------------------------------------------------------------------------
 */
exports.solicitarRetiro = functions.https.onCall(async (data, context) => {
    // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-Load Injection)
    initCore();

    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD SUPREMA
    if (!context.auth) {
        await reportSentinelMetric('security_unauth_payout_attempt');
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere sesión activa.');
    }

    const techId = context.auth.uid;
    const traceId = `trace_payout_${techId}_${Date.now()}`;
    const montoARetirar = parseFloat(parseFloat(data.monto).toFixed(2));

    console.log(JSON.stringify({
        level: "INFO",
        message: "Iniciando protocolo de retiro seguro V5.55",
        techId,
        monto: montoARetirar,
        traceId,
        engine: "SENTINEL_FINAL_CORE"
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

            // --- REGLAS DE NEGOCIO SENTINEL (Antifragile Lock V5.55) ---

            // A. Verificación de Fondos
            if (montoARetirar > saldoDisponible) {
                return { success: false, reason: "INSOLVENCIA", disponible: saldoDisponible };
            }

            // B. MUTEX: Idempotencia de Proceso (Anti-Concurrencia V5.55)
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
                version_core: "V5.55_FINAL",
                traceId: traceId,
                metadata: {
                    ip_solicitud: context.rawRequest?.ip || "unknown",
                    userAgent: context.rawRequest?.headers['user-agent'] || "unknown"
                }
            });

            // ⚡ 5. MOVIMIENTO ATÓMICO Y ACTIVACIÓN DE LOCK (Mutex ON)
            transaction.update(techRef, {
                'wallet.lock_payout': true, 
                'wallet.saldo_pendiente': admin.firestore.FieldValue.increment(-montoARetirar),
                'wallet.saldo_en_revision': admin.firestore.FieldValue.increment(montoARetirar),
                'wallet.ultimo_retiro_fecha': admin.firestore.FieldValue.serverTimestamp(),
                'auditoria.ultimo_trace_retiro': traceId,
                'auditoria.version_core': "V5.55_FINAL"
            });

            return { 
                success: true, 
                payoutId: payoutId, 
                monto: montoARetirar,
                traceId: traceId 
            };
        });

        // 🛰️ 6. TELEMETRÍA POST-COMMIT (RADAR V5.55)
        if (result.success) {
            await reportSentinelMetric('payout_request_success');
            await reportSentinelMetric('payout_volume_pending', result.monto);
            
            return { 
                success: true, 
                payoutId: result.payoutId, 
                monto: result.monto,
                traceId: result.traceId 
            };
        } else {
            await reportSentinelMetric(`payout_denied_${result.reason.toLowerCase()}`);
            console.warn(`⚠️ [RETIRO_RECHAZADO] Motivo: ${result.reason} | Tech: ${techId}`);
            throw new functions.https.HttpsError('failed-precondition', result.reason);
        }

    } catch (error) {
        await reportSentinelMetric('payout_fatal_errors');
        console.error(JSON.stringify({
            level: "FATAL",
            message: "Fallo en protocolo de retiro seguro V5.55",
            error: error.message,
            techId,
            traceId,
            module: "solicitarRetiro_V5_55"
        }));
        
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ======================================================================================
// 🧩 MÓDULO 5: MOTOR IA - VALIDACIÓN DE CIERRE (V5.55 FINAL CORE)
// ======================================================================================
/**
 * OBJETIVO: Validación semántica de evidencias y notas de cierre mediante reglas de autoridad.
 * ACTUALIZACIÓN V5.55: Saneamiento de procesos de idempotencia y sellado de Ledger inmutable.
 * --------------------------------------------------------------------------------------
 */

/**
 * 🛠️ HELPER DE IDEMPOTENCIA IA (V5.55)
 * Genera un ID único basado en el contenido semántico para evitar re-procesamiento innecesario.
 */
function generateOperationId(prompt, tenantId) {
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
    // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-Load Injection)
    initCore();

    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) {
        await reportSentinelMetric('security_unauth_ia_attempt');
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere autenticación activa.');
    }

    const { serviceId, notas_cierre, evidencias_urls, tenantId } = data;
    const userId = context.auth.uid;
    const traceId = `trace_ia_val_${serviceId}_${Date.now()}`;

    if (!serviceId || !notas_cierre) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan datos críticos para la validación.');
    }

    // 🛡️ 2. IDEMPOTENCIA POR INTENCIÓN (V5.55 HARDENED)
    const operationId = generateOperationId(notas_cierre, tenantId || "GLOBAL");
    const opRef = db.collection("gestia_ia_operations").doc(operationId);

    try {
        const existingOp = await opRef.get();
        if (existingOp.exists) {
            console.log(`♻️ [IA_REUSE] Reutilizando validación previa: ${operationId}`);
            return { 
                aprobado: existingOp.data().result.aprobado, 
                token_validacion: existingOp.data().result.token_validacion,
                reused: true,
                status: "REUSED_FROM_SENTINEL_CACHE"
            };
        }

        const serviceRef = db.collection("services").doc(serviceId);

        // ⚡ 3. TRANSACCIÓN DE VALIDACIÓN Y SELLADO ATÓMICO (V5.55)
        const validationResult = await db.runTransaction(async (transaction) => {
            const serviceSnap = await transaction.get(serviceRef);
            if (!serviceSnap.exists) throw new Error('SERVICIO_INEXISTENTE');

            const serviceData = serviceSnap.data();

            // Guarda de Estado Terminal
            const estadosTerminales = ['finalizado', 'cancelado', 'liquidado'];
            if (estadosTerminales.includes(serviceData.estado)) {
                return { aprobado: true, mensaje: "Servicio ya procesado.", status: "ALREADY_TERMINAL" };
            }

            // Guarda de Autoría
            if (serviceData.tecnico_id !== userId) {
                await reportSentinelMetric('ia_auth_mismatch');
                return { aprobado: false, motivo: "No eres el técnico asignado.", status: "AUTH_FAIL" };
            }

            // 🧠 4. MOTOR SEMÁNTICO (V5.55 HARDENED)
            const palabrasClave = ["reparado", "instalado", "cambio", "mantenimiento", "listo", "corregido", "ajuste", "limpieza", "terminado"];
            const notaNormalizada = notas_cierre.toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .trim().replace(/\s+/g, ' ');
                
            const tienePalabrasClave = palabrasClave.some(p => notaNormalizada.includes(p));

            if (notaNormalizada.length < 25 || !tienePalabrasClave) {
                return { 
                    aprobado: false, 
                    motivo: "Evidencia semántica insuficiente. Detalla más el trabajo (mín. 25 caracteres).",
                    status: "CONTENT_REJECTED" 
                };
            }

            // 🏗️ Generación de Token Determinístico Inmutable
            const token = `IA-OK-${serviceId}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

            // 🛡️ 5. ACTUALIZACIÓN DEL LEDGER DE SERVICIO (Sellado V5.55)
            transaction.update(serviceRef, {
                'auditoria_ia.validacion_previa': true,
                'auditoria_ia.fecha_revision': admin.firestore.FieldValue.serverTimestamp(),
                'auditoria_ia.token_validacion': token,
                'auditoria_ia.operationId': operationId,
                'notas_tecnico_cierre': notas_cierre,
                'evidencias_finales': evidencias_urls || [],
                'auditoria_ia.traceId': traceId,
                'auditoria_ia.version_core': "V5.55_FINAL"
            });

            return { aprobado: true, token_validacion: token, status: "SUCCESS" };
        });

        // 🛡️ 6. REGISTRO DE OPERACIÓN (Persistencia de Cache)
        if (validationResult.status === "SUCCESS") {
            await opRef.set({
                operationId,
                type: "closure_validation",
                serviceId,
                userId,
                result: validationResult,
                traceId: traceId,
                version: "V5.55_FINAL",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await reportSentinelMetric('ia_validation_success');
        } else if (validationResult.status === "CONTENT_REJECTED") {
            await reportSentinelMetric('ia_validation_low_quality');
        }

        return validationResult;

    } catch (error) {
        await reportSentinelMetric('ia_engine_fatal_errors');
        console.error(JSON.stringify({
            level: "FATAL",
            message: "Error en Motor IA V5.55",
            error: error.message,
            traceId,
            module: "validarCierreIA_V5_55"
        }));
        throw new functions.https.HttpsError('internal', `Error Crítico Sentinel IA: ${error.message}`);
    }
});

/**
 * ======================================================================================
 * 🧩 MÓDULO 6: TERMINAL HEBERTO - ARCHITECT ENGINE (SENTINEL V5.55 FINAL CORE)
 * ======================================================================================
 * OBJETIVO: Orquestación de infraestructura mediante IA con seguridad y fallback robusto.
 * FIXES V5.55:
 * - 🛡️ DEEP-ID SEARCH: Localización de modulo_id en cualquier capa del payload.
 * - 🛡️ CONTRATO REDUNDANTE: Inyección de ID, modulo_id y opId para evitar [undefined].
 * - Sandbox JS ampliado para evitar SECURITY_VIOLATION.
 * - Fallback seguro si IA falla.
 * - Uso nativo de responseMimeType para JSON.
 * ======================================================================================
 */

exports.gestiaArchitectV5 = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onRequest((req, res) => {
    applyArchitectCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    // 🛡️ 0. Lazy-load core (Despertar motor Sentinel)
    initCore();

    return corsHandler(req, res, async () => {
      const traceId = `trace_ia_${Date.now()}`;
      console.log(`🚀 [INICIO] Architect V5.55 FINAL CORE | Trace: ${traceId}`);

      try {
        // 🛡️ 1. Firewall & autoridad
        const session = await firewallV5(req);
        if (!session?.authorized) {
          await reportSentinelMetric('ia_firewall_rejections');
          throw new Error("BLOQUEO_FIREWALL");
        }

        const tenantId = session.tenantId;
        if (!tenantId) throw new Error("TENANT_ID_REQUIRED");

        // 📦 2. Input & validación
        const bodyData = req.body.data || req.body;
        const prompt = bodyData.prompt || "";
        if (!prompt || prompt.trim().length < 3) throw new Error("PROMPT_INVALIDO");

        const operationMode = String(
          bodyData.modo_operacion ||
          bodyData.mode ||
          bodyData.contexto?.modo_operacion ||
          bodyData.contexto?.plannerMode ||
          bodyData.contexto?.mode ||
          ""
        ).toLowerCase();

        // 🔒 3. Idempotencia (Evitar doble gasto de tokens)
        const operationId = generateOperationId(prompt, tenantId);

        if (operationMode === "tool_planner") {
          const plannerModel = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
              temperature: 0.05,
              maxOutputTokens: 1800,
              responseMimeType: "application/json"
            }
          });

          const plannerInstruction = `
You are Jarvis Codex repo investigation planner.

Return only valid JSON:

{
  "intent": "REPO_INVESTIGATION" | "GENERAL_RESPONSE",
  "objective": string,
  "toolCalls": [
    { "name": "repo.grep", "args": { "term": string, "maxMatches": 80 } },
    { "name": "repo.search", "args": { "query": string, "term": string } },
    { "name": "repo.read", "args": { "file": string, "maxBytes": 300000 } },
    { "name": "repo.diagnose", "args": { "file": string, "mode": "diagnose", "rawInput": string } },
    { "name": "repo.impact", "args": { "file": string } },
    { "name": "repo.graph", "args": { "refresh": boolean } },
    { "name": "repo.rankCandidates", "args": { "query": string, "plannedFiles": [string], "limit": 8 } },
    { "name": "repo.architectReview", "args": { "instruction": string, "plan": object, "authority": { "authorityId": "heberto_mendoza" } } },
    { "name": "repo.scan", "args": {} }
  ],
  "writeAllowed": false,
  "requiresApprovalForWrite": true,
  "confidence": number
}

Rules:
- Plan read-only investigation steps for codebase questions, UI complaints, architecture questions, approval-flow doubts, render tracing, and repair analysis.
- Do not write, patch, approve, delete, deploy, or mutate state.
- If a concrete file is mentioned, include repo.read and repo.diagnose for that file.
- If the exact file is unknown, use repo.search and repo.grep with focused evidence terms from the user's objective.
- For every repository investigation, rank candidates with repo.rankCandidates; include model-selected plannedFiles when evidence identifies them.
- Use repo.graph when the request asks about dependencies, ownership, impact, architecture, routes, listeners, endpoints, or tests.
- Do not use repo.audit in this planner. Full repo audits are handled only by explicit direct commands outside tool_planner.
- Do not answer concrete UI, mobile, layout, render, flow, or code symptoms with repo.scan alone.
- If the user is not asking about code, repo, debugging, UI, architecture, or repair, return GENERAL_RESPONSE with an empty toolCalls array.
- Keep toolCalls short, ordered, and evidence-first.
`;

          const plannerResult = await plannerModel.generateContent(
            `${plannerInstruction}\n\nUSER_INPUT:\n${prompt}`
          );

          let parsedPlan;

          try {
            parsedPlan = JSON.parse(plannerResult.response.text());
          } catch {
            parsedPlan = {
              intent: "GENERAL_RESPONSE",
              objective: prompt,
              toolCalls: [],
              writeAllowed: false,
              requiresApprovalForWrite: true,
              confidence: 0
            };
          }

          const toolPlan =
            normalizeSemanticToolPlan(
              parsedPlan,
              {
                fallbackObjective:
                  prompt,
                maxToolCalls:
                  8
              }
            );

          await reportSentinelMetric("ia_tool_planner_success");

          return res.status(200).json({
            data: {
              success: true,
              toolPlan,
              modulo_generado: toolPlan,
              operationId,
              traceId,
              mode: "TOOL_PLANNER"
            }
          });
        }
        const opRef = db.collection("gestia_operations").doc(operationId);

        const existing = await opRef.get();
        if (existing.exists) {
            await reportSentinelMetric('ia_tokens_saved');
            console.log(`♻️ [V5.55] Hit de Idempotencia: ${operationId}.`);
            return res.status(200).json({
                data: {
                    success: true,
                    modulo_generado: existing.data().result,
                    reused: true,
                    operationId,
                    traceId
                }
            });
        }

        // 🧠 4. Memoria semántica (Módulos existentes para contexto)
        const snap = await db.collection("gestia_system_modules")
          .where("tenantId", "==", tenantId)
          .limit(50)
          .get();

        const modulos = snap.docs.map(d => d.id);

        // 📜 5. System Instruction (Constitución Operativa de Jonathan)
        const systemInstruction = `
Eres la TERMINAL HEBERTO V5.55. Responde SOLO JSON válido.
Reglas:
- JSON parseable con comillas dobles.
- javascript = código puro DOM.
- mensaje_ceo = texto simple estilo norteño.
MODULOS ACTUALES: [${modulos.join(", ")}]
`;

        // 🧠 6. Invocación IA V5.55 (Gemini 2.5 Flash)
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 3200,
            responseMimeType: "application/json"
          }
        });

        const result = await model.generateContent(`${systemInstruction}\n\nSOLICITUD DEL ARQUITECTO:\n${prompt}`);
        let jsonParsed;

        try {
          jsonParsed = JSON.parse(result.response.text());
        } catch (parseError) {
          console.warn("⚠️ IA falló en formato, activando fallback seguro.");
          jsonParsed = {
            action: "CREATE_MODULE",
            modulo_id: "fallback_mod_" + Date.now(),
            modulo_nombre: "Módulo Emergencia",
            esquema_campos: ["fecha", "nota"],
            conciencia: { mensaje_ceo: "Detalle técnico, búnker de repuesto. Arre!" },
            ejecucion: { payload: { html: "<div class='p-4 bg-orange-100 text-orange-800 rounded'>Módulo fallback activo.</div>", css: "", javascript: "" } }
          };
        }

        // 🧹 7. Normalización defensiva (Sanitización)
        jsonParsed.conciencia = jsonParsed.conciencia || {};
        jsonParsed.conciencia.mensaje_ceo = (jsonParsed.conciencia.mensaje_ceo || "Órale, ahí quedó el jale.")
          .replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '');

        // 🛡️ 8. Seguridad de Acción
        if (!["USE_MODULE", "CREATE_MODULE"].includes(jsonParsed.action)) jsonParsed.action = "CREATE_MODULE";
        
        const js = jsonParsed?.ejecucion?.payload?.javascript || "";
        const safeRegex = /^[\x00-\x7F]*$/; 
        if (!safeRegex.test(js)) {
             jsonParsed.ejecucion.payload.javascript = js.replace(/[^\x20-\x7E\n\r\t]/g, '');
        }

        // 🚀 9. Orquestación Atómica (Persistencia de Infraestructura)
        if (jsonParsed.action === "CREATE_MODULE") {
          
          /**
           * 🛡️ DEEP-ID SEARCH V5.55
           * Buscamos la identidad en la raíz del JSON, en el objeto 'data' de la IA,
           * o en el body original del frontend.
           */
          const idExtraido = jsonParsed.modulo_id || 
                             (jsonParsed.data && jsonParsed.data.modulo_id) || 
                             bodyData.modulo_id || 
                             bodyData.id || 
                             bodyData.opId;

          // Saneamiento de literal "modulo_id"
          let moduloIdFinal = idExtraido;
          if (!moduloIdFinal || moduloIdFinal === "modulo_id" || moduloIdFinal === "undefined") {
              moduloIdFinal = "mod_" + Date.now();
              console.log(`⚠️ [IDENTITY_RESCUE] Usando ID determinístico: ${moduloIdFinal}`);
          }

          /**
           * ⚡ INVOCACIÓN AL NOTARIO (CONTRATO EXPANDIDO)
           * Mandamos el ID por múltiples llaves para que internalCreateModule no vea [undefined].
           */
          const creation = await internalCreateModule({
            id: moduloIdFinal,            // Redundancia 1
            modulo_id: moduloIdFinal,     // Redundancia 2 (Principal)
            opId: moduloIdFinal,          // Redundancia 3
            documentId: moduloIdFinal,    // Redundancia 4
            modulo_nombre: jsonParsed.modulo_nombre || "Módulo Autogenerado",
            esquema_campos: jsonParsed.esquema_campos || ["fecha"],
            tenantId,
            userId: session.uid
          });

          // Sincronizamos respuesta
          jsonParsed.modulo_id = creation.modulo_id;
          jsonParsed.conciencia.mensaje_ceo += ` (ID: ${creation.modulo_id})`;
        }

        // 💾 10. Persistencia en Búnker (Cache)
        await opRef.set({
          operationId,
          tenantId,
          result: jsonParsed,
          traceId,
          version: "V5.55_FINAL",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await reportSentinelMetric('ia_architect_success');

        return res.status(200).json({
          data: {
            success: true,
            modulo_generado: jsonParsed,
            operationId,
            traceId
          }
        });

      } catch (error) {
        await reportSentinelMetric('ia_architect_errors');
        console.error(`🔥 ERROR V5.55 ARCHITECT: ${error.message} | Trace: ${traceId}`);

        // 🛡️ Retornamos el error tal cual sale del Auditor (Sin doble prefijo DB)
        return res.status(200).json({
          data: { success: false, error: error.message, traceId }
        });
      }
    });
  });

exports.generarModuloIA = exports.gestiaArchitectV5;

/**
 * ======================================================================================
 * 🧩 MÓDULO 7: TERMINAL - ENDPOINT DE CREACIÓN DIRECTA (SENTINEL V5.55 FINAL CORE)
 * ======================================================================================
 * OBJETIVO: Registro de infraestructura manual bajo protocolo de autoridad estricta.
 * ACTUALIZACIÓN V5.55: Exige ID legal pre-generado desde el frontend (Zero-Trust ID).
 * FIX V5.55: Saneamiento de Identidad (Anti-Literal "modulo_id").
 * --------------------------------------------------------------------------------------
 */
exports.createGestiaModule = functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-load Sentinel)
        initCore();

        return corsHandler(req, res, async () => {
            const traceId = `trace_direct_create_${Date.now()}`;

            try {
                // 🛡️ 1. MÉTODO
                if (req.method !== "POST") {
                    await reportSentinelMetric('security_method_mismatch_creation');
                    return res.status(405).json({
                        data: {
                            success: false,
                            error: "METODO_NO_PERMITIDO",
                            traceId
                        }
                    });
                }

                // 🛡️ 2. FIREWALL (Validación de Autoridad V5.55)
                const session = await firewallV5(req);

                if (!session || !session.authorized) {
                    await reportSentinelMetric('firewall_direct_creation_rejections');
                    throw new Error("ACCESO_DENEGADO: Autoridad no confirmada por Sentinel.");
                }

                // 🛡️ 3. TENANT
                const currentTenantId = session.tenantId;

                if (!currentTenantId) {
                    throw new Error("TENANT_REQUIRED: Contexto de inquilino faltante.");
                }

                // 📦 4. DATA SEGURA (Contrato de Payloads V5.55)
                const data = req.body?.data || req.body || {};

                /**
                 * 🛡️ FIX DE IDENTIDAD V5.55 (ANTI-LITERAL LEAK)
                 * Si el ID es nulo o es el literal "modulo_id", aplicamos saneamiento preventivo.
                 */
                let moduloIdFinal = data.modulo_id;
                if (!moduloIdFinal || moduloIdFinal === "modulo_id") {
                    moduloIdFinal = `mod_direct_${Date.now()}`;
                    console.log(`⚠️ [SENTINEL_FIX] Identidad corrupta en creación directa. Saneando a: ${moduloIdFinal}`);
                }

                // Validación de Contrato Saneado
                if (
                    typeof moduloIdFinal !== "string" ||
                    !data.modulo_nombre ||
                    typeof data.modulo_nombre !== "string" ||
                    data.modulo_nombre.trim().length < 3
                ) {
                    throw new Error("CONTRATO_INVALIDO: Identificadores corruptos o nombre de módulo insuficiente.");
                }

                // 🛡️ 5. RATE LIMIT (V5.55 Atómico Hardened)
                const rateLimitRef = db
                    .collection("gestia_rate_limits")
                    .doc(`${currentTenantId}_creation`);

                const rateLimitSnap = await rateLimitRef.get();
                const now = Date.now();

                if (rateLimitSnap.exists) {
                    const rlData = rateLimitSnap.data();
                    const lastCreation = rlData.timestamp || 0;
                    const creationsInWindow = rlData.count || 0;

                    // Ventana de 60 segundos para 5 creaciones máximo
                    if (now - lastCreation < 60000 && creationsInWindow >= 5) {
                        await reportSentinelMetric('creation_rate_limit_exceeded');
                        throw new Error("RATE_LIMIT_EXCEEDED: Demasiadas creaciones en corto tiempo.");
                    }

                    await rateLimitRef.update({
                        count: (now - lastCreation < 60000)
                            ? admin.firestore.FieldValue.increment(1)
                            : 1,
                        timestamp: now,
                        last_trace: traceId
                    });

                } else {
                    await rateLimitRef.set({
                        count: 1,
                        timestamp: now,
                        tenantId: currentTenantId,
                        version_core: "V5.55_FINAL"
                    });
                }

                // 🏗️ 6. CREACIÓN VÍA AUTHORITY BRIDGE (Llamada al Helper atómico)
                const result = await internalCreateModule({
                    modulo_id: moduloIdFinal.trim(), // 🛡️ INYECCIÓN V5.55: Pasamos el ID saneado
                    modulo_nombre: data.modulo_nombre.trim(),
                    esquema_campos: Array.isArray(data.esquema_campos)
                        ? data.esquema_campos
                        : ["fecha", "descripcion"],
                    tenantId: currentTenantId,
                    userId: session.uid
                });

                await reportSentinelMetric('direct_module_creation_success');

                return res.status(200).json({
                    data: {
                        ...result,
                        traceId,
                        status: "INFRASTRUCTURE_AUTHORIZED",
                        engine: "SENTINEL_V5.55"
                    }
                });

            } catch (e) {
                await reportSentinelMetric('direct_module_creation_errors');

                console.error(JSON.stringify({
                    level: "ERROR",
                    message: "createGestiaModule failure V5.55",
                    error: e.message,
                    traceId,
                    module: "TERMINAL_DIRECT_V5.55"
                }));

                return res.status(200).json({
                    data: {
                        success: false,
                        error: e.message,
                        traceId,
                        code: "AUTHORITY_REJECTION"
                    }
                });
            }
        });
    });

/**
 * ======================================================================================
 * 🧩 MÓDULO 8: SCHEDULERS - MANTENIMIENTO PREVENTIVO (SENTINEL V5.55 FINAL CORE)
 * ======================================================================================
 * OBJETIVO: Generación automática de servicios recurrentes con blindaje de duplicidad.
 * ACTUALIZACIÓN V5.55: Sincronización con el Radar V5.55 y Batch Commit Hardened.
 * REGLA 1: ID de Servicio inmutable (prev_{ID_PROGRAMACION}_{FECHA}).
 * REGLA 2: Telemetría de Ingresos Proyectados en el Radar Sentinel V5.55.
 * --------------------------------------------------------------------------------------
 */
exports.onScheduleMantenimiento = functions.pubsub
    .schedule('0 0 * * *') // Ejecución diaria a medianoche
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-Load Sentinel V5.55)
        initCore();

        const hoy = admin.firestore.Timestamp.now();
        const hoyString = hoy.toDate().toISOString().split('T')[0];
        const traceId = `trace_sched_${hoyString}`;

        console.log(JSON.stringify({
            level: "INFO",
            message: "🕒 [SCHEDULER V5.55] Iniciando barrido de preventivos recurrentes",
            traceId,
            engine: "SENTINEL_FINAL_CORE"
        }));

        try {
            // 🛡️ 1. QUERY DE INFRAESTRUCTURA ACTIVA (V5.55)
            // Buscamos programaciones cuya proxima_fecha sea hoy o anterior y estén activas.
            const preventivosQuery = await db.collection("mantenimientos_programados")
                .where("proxima_fecha", "<=", hoy)
                .where("activo", "==", true)
                .limit(200).get();

            if (preventivosQuery.empty) {
                console.log("✅ [SCHEDULER] Nada pendiente por procesar hoy. Búnker al día.");
                return null;
            }

            const batch = db.batch();
            let ingresosProyectados = 0;
            let serviciosGeneradosCount = 0;

            // 🛡️ 2. PROCESAMIENTO DETERMINÍSTICO (Anti-Duplicidad V5.55)
            for (const doc of preventivosQuery.docs) {
                const prog = doc.data();
                
                // Generamos el ID inmutable para este día específico (Idempotencia de infraestructura).
                const serviceId = `prev_${doc.id}_${hoyString}`;
                const newServiceRef = db.collection("services").doc(serviceId);

                // Validación de integridad financiera
                const costo = parseFloat((prog.costo_fijo || 0).toFixed(2));
                ingresosProyectados += costo;
                serviciosGeneradosCount++;

                // A. Registro del Servicio Preventivo (Sellado V5.55)
                batch.set(newServiceRef, {
                    servicio_id: serviceId,
                    cliente_id: prog.cliente_id,
                    descripcion: `[PREVENTIVO] ${prog.descripcion_equipo || 'Mantenimiento Técnico Programado'}`,
                    monto_total: costo,
                    estado: "pendiente",
                    tipo_servicio: "preventivo",
                    clientType: prog.clientType || "ON_DEMAND",
                    tenantId: prog.tenantId, 
                    fecha_creacion: hoy,
                    generado_por_scheduler: true,
                    version_core: "V5.55_FINAL",
                    traceId: traceId,
                    auditoria_programacion: {
                        source_id: doc.id,
                        ciclo_actual: (prog.total_ciclos_completados || 0) + 1,
                        engine: "SENTINEL_SCHEDULER_V5.55"
                    }
                }, { merge: true }); 

                // B. Actualización del Ciclo de Programación (Salto a la siguiente fecha)
                const frecuenciaDías = parseInt(prog.frecuencia_dias) || 30;
                const proximaFechaDate = new Date(hoy.toDate());
                proximaFechaDate.setDate(proximaFechaDate.getDate() + frecuenciaDías);

                batch.update(doc.ref, {
                    ultima_fecha_generada: hoy,
                    proxima_fecha: admin.firestore.Timestamp.fromDate(proximaFechaDate),
                    total_ciclos_completados: admin.firestore.FieldValue.increment(1),
                    'auditoria.ultimo_trace_scheduler': traceId,
                    'auditoria.version_core': "V5.55_FINAL"
                });
            }

            // ⚡ 3. COMPROMISO ATÓMICO (BATCH COMMIT V5.55)
            await batch.commit();

            // 🛰️ 4. TELEMETRÍA POST-COMMIT (RADAR V5.55)
            await reportSentinelMetric('scheduler_execution_success');
            await reportSentinelMetric('revenue_projected_scheduled', ingresosProyectados);
            await reportSentinelMetric('services_auto_generated', serviciosGeneradosCount);

            console.log(JSON.stringify({
                level: "SUCCESS",
                message: `🚀 [SCHEDULER V5.55] ${serviciosGeneradosCount} servicios sellados.`,
                ingresosProyectados,
                traceId
            }));

            return null;

        } catch (error) {
            // 🛰️ RADAR: Error crítico en la automatización
            await reportSentinelMetric('scheduler_fatal_errors');

            console.error(JSON.stringify({
                level: "FATAL",
                message: "Fallo crítico en Motor de Recurrencia Sentinel V5.55",
                error: error.message,
                traceId,
                module: "onScheduleMantenimiento_V5_55"
            }));
            
            return null; 
        }
    });

/**
 * ======================================================================================
 * 🧩 MÓDULO 9: OPERACIONES - AMENIDADES Y RESERVAS (SENTINEL V5.55 FINAL CORE)
 * ======================================================================================
 * OBJETIVO: Gestión de espacios comunes con prevención de traslapes y auditoría.
 * ACTUALIZACIÓN V5.55: Sincronización con el Radar V5.55 y Batch Commit Hardened.
 * --------------------------------------------------------------------------------------
 */
exports.reservarCancha = functions.https.onCall(async (data, context) => {
    // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-load Sentinel V5.55)
    initCore();

    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere sesión activa.');
    }

    const { amenityId, fecha, horaInicio, horaFin, condominioId } = data;
    const traceId = `trace_reserva_${context.auth.uid}_${Date.now()}`;

    // 🛡️ 1. VALIDACIÓN DE CONTRATO (Integridad de Payload)
    if (!amenityId || !fecha || !horaInicio || !horaFin) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros críticos para procesar la reserva.');
    }

    try {
        return await db.runTransaction(async (transaction) => {
            const reservasRef = db.collection("reservas");
            
            // 🛡️ 2. BÚSQUEDA DE TRASLAPES (Blindaje de Disponibilidad V5.55)
            // Verificamos colisiones de tiempo en el mismo espacio y fecha.
            const traslapeSnap = await transaction.get(
                reservasRef.where("amenityId", "==", amenityId)
                            .where("fecha", "==", fecha)
                            .where("estado", "==", "confirmado")
            );

            const hayTraslape = traslapeSnap.docs.some(doc => {
                const r = doc.data();
                // Lógica de traslapes: (InicioA < FinB) && (FinA > InicioB)
                return (horaInicio < r.horaFin && horaFin > r.horaInicio);
            });

            if (hayTraslape) {
                await reportSentinelMetric('amenity_overlap_blocked');
                return { 
                    success: false, 
                    message: "El horario solicitado no está disponible. Intente otro rango.", 
                    code: "OVERLAP_DETECTED" 
                };
            }

            // 🛡️ 3. GENERACIÓN DETERMINÍSTICA DE RESERVA (Sellado V5.55)
            const nuevaReservaRef = reservasRef.doc();
            transaction.set(nuevaReservaRef, {
                reserva_id: nuevaReservaRef.id,
                residente_id: context.auth.uid,
                amenityId, 
                fecha, 
                horaInicio, 
                horaFin,
                condominioId: condominioId || "general",
                estado: "confirmado",
                traceId: traceId,
                version_core: "V5.55_FINAL",
                engine: "SENTINEL_OPERATIONS_V5.55",
                fecha_creacion: admin.firestore.FieldValue.serverTimestamp()
            });

            // 🛰️ TELEMETRÍA POST-COMMIT (RADAR V5.55)
            await reportSentinelMetric('amenity_reservation_success');

            console.log(JSON.stringify({
                level: "SUCCESS",
                message: `🎾 [RESERVA] Espacio ${amenityId} sellado con éxito.`,
                residente: context.auth.uid,
                traceId
            }));

            return { success: true, reservaId: nuevaReservaRef.id, traceId };
        });
    } catch (error) {
        await reportSentinelMetric('amenity_reservation_fatal');
        console.error(JSON.stringify({
            level: "FATAL",
            message: "Fallo crítico en Motor de Reservas V5.55",
            error: error.message,
            traceId,
            module: "reservarCancha_V5_55"
        }));
        throw new functions.https.HttpsError('internal', `Error en Búnker Operations: ${error.message}`);
    }
});

/**
 * ======================================================================================
 * 🧩 MÓDULO 10: CONTROL DE ACCESOS DINÁMICOS (SENTINEL V5.56 - HYBRID CORE)
 * ======================================================================================
 * OBJETIVO: Registro de entradas y salidas con trazabilidad de autoridad y saneamiento.
 * ACTUALIZACIÓN V5.56: Whitelist Híbrida para soporte dinámico de Uxmal 39.
 * REGLA: Sin compactación. Preserva lógica de auditoría V5.55 y expande capacidad.
 * --------------------------------------------------------------------------------------
 */

/**
 * 🚀 FUNCIÓN: crearAcceso
 * ACTUALIZACIÓN V5.56: Implementación de Inyección Dinámica para Uxmal 39.
 */
exports.crearAcceso = functions.https.onCall(async (data, context) => {
    // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-Load Injection V5.56)
    initCore();

    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) {
        await reportSentinelMetric('security_unauth_access_attempt');
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere sesión activa.');
    }
    
    const { condominioId, moduloId, payload } = data;
    const traceId = `trace_acceso_${Date.now()}`;

    // 🛡️ 2. VALIDACIÓN DE CONTEXTO (Integridad de Búnker)
    if (!condominioId || !moduloId || !payload) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros críticos (condominio/modulo/payload).');
    }

    try {
        /**
         * 🛡️ 3. WHITELIST HÍBRIDA (V5.56 Hardened)
         * PASO A: Aseguramos los campos que tus otros módulos (B2B/B2C) ya usan.
         * Esto garantiza que los reportes de técnicos y clientes no se rompan.
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

        /**
         * PASO B: INYECCIÓN DINÁMICA V5.56 (Solución Uxmal 39)
         * Recorremos el payload para rescatar campos nuevos (recurso, tipo_acceso, cajones, etc.)
         * sin sobreescribir los básicos y sanitizando el contenido para evitar inyecciones.
         */
        Object.keys(payload).forEach(key => {
            if (!(key in safePayload)) {
                const val = payload[key];
                // Sanitización estricta: strings limitados a 500 chars, otros tipos pasan directo.
                if (typeof val === 'string') {
                    safePayload[key] = val.substring(0, 500); 
                } else {
                    safePayload[key] = val;
                }
            }
        });

        /**
         * 🛡️ GUARDA DE CONEXIÓN V5.56
         * Si por alguna razón el motor no despertó a tiempo, lo forzamos aquí antes del registro.
         */
        if (!db) {
             console.error("🚨 [DB_RESCUE] Re-inicializando motor de base de datos.");
             db = admin.firestore();
        }

        // Generamos referencia en la sub-colección dinámica del módulo (gestia_records/{condo}/{modulo})
        const registroRef = db.collection("gestia_records")
                                .doc(condominioId)
                                .collection(moduloId)
                                .doc();
                                
        // ⚡ REGISTRO ATÓMICO DE ENTRADA (Sellado V5.56)
        await registroRef.set({
            ...safePayload,
            registro_id: registroRef.id,
            creado_por_uid: context.auth.uid,
            creado_en: admin.firestore.FieldValue.serverTimestamp(),
            status: "activo",
            traceId: traceId,
            version_core: "V5.56_FINAL",
            metadata_autoridad: {
                engine: "Sentinel_V5.56_Hybrid",
                atomic: true,
                traceId: traceId,
                tenant_origin: condominioId
            }
        });
        
        // 🛰️ Reporte al Radar Sentinel
        await reportSentinelMetric('access_entry_registered');
        
        // 📜 Log de Auditoría Hardened
        console.log(JSON.stringify({
            level: "INFO",
            message: `✅ [ACCESO V5.56] Entrada sellada en Búnker para ${moduloId}`,
            condominioId,
            moduloId,
            traceId
        }));

        return { status: 'success', id: registroRef.id, traceId };

    } catch (error) {
        await reportSentinelMetric('access_entry_error');
        console.error(JSON.stringify({
            level: "ERROR",
            message: "Fallo en Registro de Entrada V5.56",
            error: error.message,
            traceId
        }));
        throw new functions.https.HttpsError('internal', `Error Sentinel Accesos: ${error.message}`);
    }
});

/**
 * 🚀 FUNCIÓN: registrarSalida
 * Cierre de ciclo operativo con marca de tiempo del servidor.
 */
exports.registrarSalida = functions.https.onCall(async (data, context) => {
    // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-Load Injection)
    initCore();

    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');
    
    const { condominioId, moduloId, registroId } = data;
    const traceId = `trace_salida_${Date.now()}`;

    // 🛡️ 2. VALIDACIÓN DE PARÁMETROS
    if (!registroId || !condominioId || !moduloId) {
        throw new functions.https.HttpsError('invalid-argument', 'Parámetros insuficientes para registrar salida.');
    }

    try {
        /**
         * 🛡️ GUARDA DE CONEXIÓN V5.56
         */
        if (!db) db = admin.firestore();

        const registroRef = db.collection("gestia_records")
                                .doc(condominioId).collection(moduloId).doc(registroId);
                                
        /**
         * ⚡ ACTUALIZACIÓN DE SALIDA (Atómica V5.56)
         * Se sella la salida y se vincula con el rastro del auditor.
         */
        await registroRef.update({
            status: "salida",
            fecha_salida: admin.firestore.FieldValue.serverTimestamp(),
            cerrado_por_uid: context.auth.uid,
            'auditoria.ultimo_trace': traceId,
            'auditoria.version_core': "V5.56_FINAL"
        });
        
        await reportSentinelMetric('access_exit_registered');
        
        console.log(JSON.stringify({
            level: "INFO",
            message: "✅ [SALIDA V5.56] Egreso sellado con éxito.",
            registroId,
            traceId
        }));

        return { status: 'success', traceId };

    } catch (error) {
        await reportSentinelMetric('access_exit_error');
        console.error(JSON.stringify({
            level: "ERROR",
            message: "Fallo en Registro de Salida V5.56",
            error: error.message,
            traceId
        }));
        throw new functions.https.HttpsError('internal', `Error Sentinel Salidas V5.56: ${error.message}`);
    }
});

/**
 * ======================================================================================
 * 🧩 MÓDULO 11: SEGURIDAD - PAQUETERÍA E INCIDENCIAS (SENTINEL V5.55 FINAL CORE)
 * ======================================================================================
 * OBJETIVO: Gestión de última milla y logs de seguridad industrial.
 * ACTUALIZACIÓN V5.55: Sincronización con el Radar V5.55 y limpieza de FCM Hardened.
 * --------------------------------------------------------------------------------------
 */

exports.registrarIngresoPaquete = functions.https.onCall(async (data, context) => {
    // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-Load Injection V5.55)
    initCore();

    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) {
        await reportSentinelMetric('security_unauth_package_attempt');
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere sesión activa.');
    }

    const { condominioId, residenteId, empresa_paqueteria, descripcion } = data;
    const traceId = `trace_pkg_in_${Date.now()}`;

    // 🛡️ 2. VALIDACIÓN DE CONTRATO (Saneamiento V5.55)
    if (!condominioId || !residenteId || !empresa_paqueteria) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros críticos (condominio/residente/empresa).');
    }

    try {
        const paqueteRef = db.collection("packages").doc(condominioId).collection("items").doc();
        
        // ⚡ REGISTRO DE PAQUETE (Whitelist Saneada V5.55)
        await paqueteRef.set({
            paquete_id: paqueteRef.id,
            residente_id: residenteId,
            guardia_id: context.auth.uid,
            empresa: empresa_paqueteria.substring(0, 50),
            descripcion: descripcion ? descripcion.substring(0, 200) : "Sin descripción",
            estado: "en_caseta",
            condominioId: condominioId,
            traceId: traceId,
            version_core: "V5.55_FINAL",
            fecha_ingreso: admin.firestore.FieldValue.serverTimestamp(),
            metadata_logistica: {
                engine: "Sentinel_Logistics_V5.55",
                traceId: traceId
            }
        });
        
        await reportSentinelMetric('package_entry_success');
        
        console.log(JSON.stringify({
            level: "INFO",
            message: "📦 [PAQUETERIA V5.55] Ingreso sellado en sistema.",
            paqueteId: paqueteRef.id,
            condominioId,
            traceId
        }));

        return { success: true, id: paqueteRef.id, traceId };
    } catch (error) {
        await reportSentinelMetric('package_entry_fatal');
        console.error(JSON.stringify({
            level: "ERROR",
            message: "Fallo en Registro de Paquete V5.55",
            error: error.message,
            traceId
        }));
        throw new functions.https.HttpsError('internal', `Error Sentinel Paquetería: ${error.message}`);
    }
});

exports.registrarSalidaPaquete = functions.https.onCall(async (data, context) => {
    // 🛡️ 0. DESPERTAR EL MOTOR
    initCore();

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
         * ⚡ ACTUALIZACIÓN DE ENTREGA (Atómica V5.55)
         * Se requiere rastro de firma digital para cerrar el ciclo de custodia.
         */
        await paqueteRef.update({
            estado: "entregado",
            fecha_entrega: admin.firestore.FieldValue.serverTimestamp(),
            firma_recibido_url: firma_url || "RECIBIDO_SIN_FIRMA_DIGITAL",
            guardia_entrega_id: context.auth.uid,
            'auditoria.ultimo_trace': traceId,
            'auditoria.version_core': "V5.55_FINAL"
        });
        
        await reportSentinelMetric('package_delivery_success');
        return { success: true, traceId };

    } catch (error) {
        await reportSentinelMetric('package_delivery_error');
        console.error(JSON.stringify({
            level: "ERROR",
            message: "Fallo en Egreso de Paquete V5.55",
            error: error.message,
            traceId
        }));
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.registrarIncidenciaAcceso = functions.https.onCall(async (data, context) => {
    // 🛡️ 0. DESPERTAR EL MOTOR
    initCore();

    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'No autorizado.');
    
    const { condominioId, tipo_incidencia, descripcion, severidad } = data;
    const traceId = `trace_incidencia_${Date.now()}`;

    if (!condominioId || !tipo_incidencia) {
        throw new functions.https.HttpsError('invalid-argument', 'condominioId y tipo_incidencia son requeridos.');
    }

    try {
        const ref = db.collection("security_logs").doc();
        
        // ⚡ REGISTRO DE INCIDENCIA (Whitelist Saneada V5.55)
        await ref.set({
            log_id: ref.id,
            condominioId,
            guardia_id: context.auth.uid,
            tipo: tipo_incidencia,
            descripcion: descripcion ? descripcion.substring(0, 500) : "Sin detalles adicionales",
            severidad: ["baja", "media", "alta", "critica"].includes(severidad) ? severidad : "baja",
            traceId: traceId,
            version_core: "V5.55_FINAL",
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            audit_hash: crypto.createHash('md5').update(`${traceId}_${tipo_incidencia}`).digest('hex')
        });
        
        await reportSentinelMetric(`security_incident_${severidad || 'baja'}`);
        return { success: true, id: ref.id, traceId };

    } catch (error) {
        await reportSentinelMetric('security_incident_error');
        console.error(JSON.stringify({
            level: "WARNING",
            message: "Fallo en Registro de Incidencia V5.55",
            error: error.message,
            traceId
        }));
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * ⚡ TRIGGER: Notificación de Paquetería (FCM Delivery Hardened V5.55)
 * Automatización de alerta al residente cuando el paquete toca el búnker.
 */
exports.onPackageReceived = functions.firestore
    .document('packages/{condominioId}/items/{paqueteId}')
    .onCreate(async (snap, context) => {
        // 🛡️ 0. DESPERTAR EL MOTOR (Trigger Lazy-load)
        initCore();

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

                // 🛡️ LIMPIEZA DE TOKENS (V5.55 SANEAMIENTO)
                // Si el token ya no es válido, se remueve para evitar errores en futuros envíos.
                if (response.results[0].error) {
                    const error = response.results[0].error.code;
                    if (error === 'messaging/invalid-registration-token' || error === 'messaging/registration-token-not-registered') {
                        console.log(`🧹 [FCM_CLEANUP] Removiendo token inválido del usuario: ${paquete.residente_id}`);
                        await db.collection("users").doc(paquete.residente_id).update({
                            fcmToken: admin.firestore.FieldValue.delete(),
                            'auditoria.fcm_cleanup': admin.firestore.FieldValue.serverTimestamp(),
                            'auditoria.last_fcm_error': error
                        });
                    }
                }

                await reportSentinelMetric('fcm_notification_sent');
            }
        } catch (e) {
            console.error(JSON.stringify({
                level: "ERROR",
                message: "Fallo en Trigger de Notificación FCM V5.55",
                error: e.message,
                traceId
            }));
            await reportSentinelMetric('fcm_notification_fail');
        }
    });

/**
 * ======================================================================================
 * 🧩 MÓDULO 12: AUTOMATIZACIÓN - LIMPIEZA DE SESIONES (COST CONTROL V5.55 FINAL)
 * ======================================================================================
 * OBJETIVO: Limpieza de sesiones Stripe huérfanas para mantener la DB ligera y eficiente.
 * ACTUALIZACIÓN V5.55: Sincronización con el Radar V5.55 y validación de Integridad.
 * --------------------------------------------------------------------------------------
 */
exports.limpiarSesionesHuerfanas = functions.pubsub
    .schedule('every 12 hours')
    .timeZone('America/Mexico_City')
    .onRun(async (context) => {
        // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-Load Sentinel V5.55)
        initCore();

        const hace24Horas = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 86400000));
        const traceId = `trace_cleanup_${Date.now()}`;

        console.log(`🧹 [CLEANUP V5.55] Iniciando barrido de sesiones huérfanas... Trace: ${traceId}`);

        try {
            // 🛡️ 1. QUERY DE SESIONES EN RIESGO (V5.55)
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
                 * 🛡️ 2. GUARDA DE INTEGRIDAD FINANCIERA (V5.55 FINAL)
                 * Si existe un ID de pago, la sesión no es huérfana, está en proceso.
                 */
                if (data.ultimo_pago_id) {
                    console.log(`⚠️ [CLEANUP_SKIP] Saltando ${doc.id}: Intento de pago vinculado detectado.`);
                    return;
                }

                montoRecuperadoPotencial += (data.monto_total || 0);
                sesionesCanceladasCount++;

                // ⚡ ACTUALIZACIÓN ATÓMICA DE ESTADO (Sellado V5.55)
                batch.update(doc.ref, { 
                    estado: "cancelado_por_timeout",
                    fecha_cancelacion: admin.firestore.FieldValue.serverTimestamp(),
                    'auditoria.cleanup_trace': traceId,
                    'auditoria.version_core': "V5.55_FINAL",
                    'auditoria.motivo': "Sesión huérfana > 24h detectada por Garbage Collector"
                });
            });

            if (sesionesCanceladasCount === 0) return null;

            await batch.commit();

            // 🛰️ 3. TELEMETRÍA POST-COMMIT (RADAR V5.55)
            await reportSentinelMetric('cleanup_sessions_processed', sesionesCanceladasCount);
            await reportSentinelMetric('cleanup_potential_revenue_lost', montoRecuperadoPotencial);

            console.log(JSON.stringify({
                level: "SUCCESS",
                message: `🧹 [CLEANUP_FINISH] Protocolo completado V5.55`,
                procesados: sesionesCanceladasCount,
                monto_total: montoRecuperadoPotencial,
                traceId
            }));

            return null;
        } catch (e) {
            await reportSentinelMetric('cleanup_fatal_errors');
            console.error(JSON.stringify({
                level: "FATAL",
                message: "Fallo en protocolo de limpieza V5.55",
                error: e.message,
                traceId,
                module: "limpiarSesionesHuerfanas_V5_55"
            }));
            return null;
        }
    });

async function assertJarvisAdminContext(
    context,
    action = "usar Jarvis"
) {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            `Se requiere sesion para ${action}.`
        );
    }

    const email =
        String(
            context.auth.token?.email ||
            ""
        ).toLowerCase();
    const profileSnap =
        await db
            .collection("users")
            .doc(context.auth.uid)
            .get();
    const role =
        String(
            profileSnap.data()?.rol ||
            profileSnap.data()?.role ||
            ""
        ).toLowerCase();

    if (
        email !== "hebertoh-m@hotmail.com" &&
        role !== "admin"
    ) {
        throw new functions.https.HttpsError(
            "permission-denied",
            `Solo administracion puede ${action}.`
        );
    }

    return {
        uid: context.auth.uid,
        email,
        role
    };
}

/**
 * JARVIS DAILY SUPERVISOR
 * Auditoria diaria read-only de contratos criticos desplegados.
 * No repara, no escribe codigo y no autoriza parches.
 */
exports.jarvisDailySupervisor = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub
    .schedule("15 4 * * *")
    .timeZone("America/Cancun")
    .onRun(async () => {
        const report = await runDailyJarvisSupervision({
            db,
            admin
        });

        console.log(JSON.stringify({
            level: report.status === "HEALTHY" ? "INFO" : "WARNING",
            message: "JARVIS_DAILY_SUPERVISION_COMPLETE",
            traceId: report.traceId,
            status: report.status,
            score: report.score,
            failed: report.summary.failed
        }));

        return null;
    });

exports.jarvisSupervisionStatus = functions
    .runWith({ timeoutSeconds: 20, memory: "128MB" })
    .https
    .onCall(async (_data, context) => {
        await assertJarvisAdminContext(
            context,
            "consultar supervision"
        );

        const report = await getLatestJarvisSupervisionReport({ db });

        if (!report) {
            return {
                ok: true,
                status: "PENDING_FIRST_RUN",
                scheduledAt: "04:15 America/Cancun",
                report: null
            };
        }

        return {
            ok: true,
            status: report.status,
            score: report.score,
            summary: report.summary,
            findings: report.findings || [],
            failureDomains: report.failureDomains || [],
            recommendations: report.recommendations || [],
            checks: report.checks || [],
            reportId: report.reportId || report.id,
            traceId: report.traceId,
            startedAtIso: report.startedAtIso,
            policy: report.policy
        };
    });

exports.jarvisSupervisionRunNow = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .https
    .onCall(async (_data, context) => {
        const actor = await assertJarvisAdminContext(
            context,
            "ejecutar supervision"
        );
        const report = await runDailyJarvisSupervision({
            db,
            admin
        });

        console.log(JSON.stringify({
            level: report.status === "HEALTHY" ? "INFO" : "WARNING",
            message: "JARVIS_SUPERVISION_RUN_NOW_COMPLETE",
            uid: actor.uid,
            traceId: report.traceId,
            status: report.status,
            score: report.score
        }));

        return {
            ok: true,
            status: report.status,
            score: report.score,
            summary: report.summary,
            findings: report.findings || [],
            failureDomains: report.failureDomains || [],
            recommendations: report.recommendations || [],
            checks: report.checks || [],
            reportId: report.reportId || report.id,
            traceId: report.traceId,
            startedAtIso: report.startedAtIso,
            source: "JARVIS_SUPERVISION_RUN_NOW",
            policy: report.policy
        };
    });

/**
 * JARVIS GROUNDED WEB RESEARCH
 * Investigacion web actual con fuentes estructuradas.
 * Solo lectura, administracion autenticada y sin acciones externas.
 */
exports.jarvisWebResearch = functions
    .runWith({
        timeoutSeconds: 60,
        memory: "256MB",
        secrets: ["GEMINI_KEY"]
    })
    .https
    .onCall(async (data = {}, context) => {
        const actor =
            await assertJarvisAdminContext(
                context,
                "investigar en la web"
            );
        const query =
            normalizeResearchQuery(
                data?.query ||
                data?.prompt ||
                ""
            );

        if (
            query.length < 5 ||
            query.length > 600
        ) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "La consulta web debe tener entre 5 y 600 caracteres."
            );
        }

        try {
            let result;
            try {
                result = await runJarvisWebResearch({
                    ai: getGroundedGenAI(),
                    query,
                    objectiveId: data?.objectiveId || "",
                    caseId: data?.caseId || "",
                    allowedDomain: data?.allowedDomain || ""
                });
            } catch (primaryError) {
                const primaryMessage = primaryError?.message || String(primaryError);
                const credentialFailure =
                    primaryMessage.includes("GEMINI_KEY_MISSING") ||
                    primaryMessage.includes("API key not valid") ||
                    primaryMessage.includes("API_KEY_INVALID");
                if (!credentialFailure) throw primaryError;
                result = await runJarvisDirectDomainResearch({
                    fetchImpl: fetch,
                    query,
                    objectiveId: data?.objectiveId || "",
                    caseId: data?.caseId || "",
                    allowedDomain: data?.allowedDomain || ""
                });
            }

            console.log(JSON.stringify({
                level:
                    result.grounded
                        ? "INFO"
                        : "WARNING",
                message:
                    "JARVIS_WEB_RESEARCH_COMPLETE",
                uid:
                    actor.uid,
                grounded:
                    result.grounded,
                sourceCount:
                    result.sourceCount,
                searchQueryCount:
                    result.searchQueries.length,
                factCount: result.facts.length,
                objectiveId: result.objectiveId || null,
                caseId: result.caseId || null
            }));

            if (!result.grounded) {
                throw new functions.https.HttpsError(
                    "failed-precondition",
                    "La investigacion no devolvio fuentes verificables."
                );
            }

            return result;
        }
        catch(error) {
            if (
                error instanceof
                    functions.https.HttpsError
            ) {
                throw error;
            }

            console.error(JSON.stringify({
                level: "ERROR",
                message:
                    "JARVIS_WEB_RESEARCH_FAILED",
                uid:
                    actor.uid,
                error:
                    error?.message ||
                    String(error)
            }));

            const missingKey =
                error?.message ===
                    "GEMINI_KEY_MISSING";

            throw new functions.https.HttpsError(
                missingKey
                    ? "failed-precondition"
                    : "internal",
                missingKey
                    ? "La investigacion web no tiene credencial Gemini configurada."
                    : "No fue posible completar la investigacion web con fuentes."
            );
        }
    });

/**
 * JARVIS SEMANTIC TOOL PLANNER
 * Planeacion mediante un modelo real y catalogo runtime; no clasifica con regex ni diccionarios.
 */
exports.jarvisSemanticPlan = functions
    .runWith({ timeoutSeconds: 120, memory: "512MB", secrets: ["GEMINI_KEY"] })
    .https
    .onCall(async (data = {}, context) => {
        const actor = await assertJarvisAdminContext(
            context,
            "planificar herramientas"
        );

        try {
            const result = await runJarvisSemanticPlanner({
                fetchImpl: fetch,
                simpleFetchImpl: fetch,
                ai: getPlannerGenAI(),
                input: data?.input,
                catalog: data?.catalog,
                missionState: data?.missionState || null
            });

            console.log(JSON.stringify({
                level: "INFO",
                message: "JARVIS_SEMANTIC_PLAN_COMPLETE",
                uid: actor.uid,
                model: result.model,
                catalogSize: result.catalogSize,
                toolCount: result.toolCalls.length
            }));

            return result;
        } catch (error) {
            console.error(JSON.stringify({
                level: "ERROR",
                message: "JARVIS_SEMANTIC_PLAN_FAILED",
                uid: actor.uid,
                error: error?.message || String(error)
            }));

            throw new functions.https.HttpsError(
                error?.message === "SEMANTIC_PLAN_INPUT_OUT_OF_RANGE" ||
                error?.message === "SEMANTIC_PLAN_CATALOG_REQUIRED"
                    ? "invalid-argument"
                    : "unavailable",
                error?.message || "No fue posible crear el plan semantico."
            );
        }
    });

exports.jarvisSemanticRespond = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https
    .onCall(async (data = {}, context) => {
        const actor = await assertJarvisAdminContext(
            context,
            "conversar con Jarvis"
        );

        try {
            const result = await runJarvisSemanticResponse({
                fetchImpl: fetch,
                input: data?.input || data?.prompt
            });

            console.log(JSON.stringify({
                level: "INFO",
                message: "JARVIS_SEMANTIC_RESPONSE_COMPLETE",
                uid: actor.uid,
                model: result.model
            }));
            return result;
        } catch (error) {
            throw new functions.https.HttpsError(
                error?.message === "SEMANTIC_RESPONSE_INPUT_OUT_OF_RANGE"
                    ? "invalid-argument"
                    : "unavailable",
                error?.message || "Jarvis no pudo responder con el modelo semantico."
            );
        }
    });

/**
 * JARVIS GROUNDED MEDIA ANALYSIS
 * Analisis multimodal autenticado con evidencia e incertidumbre explicita.
 */
exports.jarvisMediaAnalyze = functions
    .runWith({ timeoutSeconds: 180, memory: "1GB", secrets: ["GEMINI_KEY"] })
    .https
    .onCall(async (data = {}, context) => {
        const actor = await assertJarvisAdminContext(context, "analizar documentos e imagenes");
        try {
            const result = await runJarvisMediaAnalysis({
                ai: getGroundedGenAI(),
                input: data
            });
            console.log(JSON.stringify({
                level: "INFO",
                message: "JARVIS_MEDIA_ANALYSIS_COMPLETE",
                uid: actor.uid,
                sources: result.sources.length,
                model: result.model
            }));
            return result;
        } catch (error) {
            console.error(JSON.stringify({ level: "ERROR", message: "JARVIS_MEDIA_ANALYSIS_FAILED", uid: actor.uid, error: error?.message || String(error) }));
            const invalid = /COUNT_INVALID|TYPE_UNSUPPORTED|BASE64_INVALID|SIZE_INVALID|SOURCE_COUNT_MISMATCH/.test(error?.message || "");
            throw new functions.https.HttpsError(invalid ? "invalid-argument" : "internal", error?.message || "No fue posible analizar los archivos.");
        }
    });

/**
 * JARVIS IMAGE GENERATION
 * Generacion multimodal autenticada para administracion.
 */
exports.jarvisImageGenerate = functions
    .runWith({
        timeoutSeconds: 120,
        memory: "1GB",
        secrets: ["GEMINI_KEY"]
    })
    .https
    .onCall(async (data = {}, context) => {
        const actor = await assertJarvisAdminContext(
            context,
            "generar imagenes"
        );

        try {
            let result;

            try {
                result = await runJarvisImageGeneration({
                    ai: getGroundedGenAI(),
                    input: data
                });
            }
            catch(primaryError) {
                const primaryMessage =
                    primaryError?.message || String(primaryError);
                const credentialFailure =
                    primaryMessage.includes("GEMINI_KEY_MISSING") ||
                    primaryMessage.toLowerCase().includes("api key not valid") ||
                    primaryMessage.includes("API_KEY_INVALID");

                if (!credentialFailure) {
                    throw primaryError;
                }

                result = await runJarvisImageFallback({
                    fetchImpl: fetch,
                    input: data
                });
            }

            console.log(JSON.stringify({
                level: "INFO",
                message: "JARVIS_IMAGE_GENERATION_COMPLETE",
                uid: actor.uid,
                model: result.model,
                provider: result.provider || "google",
                action: result.action || "generate",
                bytes: result.bytes,
                aspectRatio: result.aspectRatio,
                objectiveId: result.objectiveId || null,
                sourceOutput: result.sourceOutput || null,
                transformations: result.transformations || []
            }));

            return result;
        }
        catch(error) {
            console.error(JSON.stringify({
                level: "ERROR",
                message: "JARVIS_IMAGE_GENERATION_FAILED",
                uid: actor.uid,
                error: error?.message || String(error)
            }));

            const invalidArgument =
                error?.message === "JARVIS_IMAGE_PROMPT_REQUIRED" ||
                error?.message === "JARVIS_IMAGE_SOURCE_INVALID" ||
                error?.message === "JARVIS_IMAGE_SOURCE_BASE64_INVALID" ||
                error?.message === "JARVIS_IMAGE_TRANSFORMATIONS_REQUIRED";
            throw new functions.https.HttpsError(
                invalidArgument
                    ? "invalid-argument"
                    : error?.message === "GEMINI_KEY_MISSING"
                        ? "failed-precondition"
                        : "internal",
                error?.message || "No fue posible generar la imagen."
            );
        }
    });

/**
 * ======================================================================================
 * 🛰️ MÓDULO 13: SENTINEL HEALTH ENGINE (EL RADAR V5.55 FINAL CORE)
 * ======================================================================================
 * OBJETIVO: Cierre de Scope y Heartbeat de arranque del sistema.
 * ACTUALIZACIÓN V5.55: Verificación de Heartbeat con arranque Lazy inyectado.
 * --------------------------------------------------------------------------------------
 */

// ⛔ BLOQUE AUTOEJECUTABLE ELIMINADO PARA EVITAR TIMEOUTS EN EL DEPLOY ⛔
// Todo el sistema ahora despierta vía Lazy-Loading (initCore) dentro de cada endpoint.

/**
 * ======================================================================================
 * 🧩 MÓDULO 14: RADIO B2B - DESPACHO TÁCTICO (V5.56 HYBRID CORE)
 * ======================================================================================
 * OBJETIVO: Puente seguro para bypass de CORS y despacho de OTs con prioridad alta.
 * REGLA: Uso de Firebase Admin Messaging para despertar dispositivos en reposo (PWA).
 * REGLA 1: SIN CORTES. CÓDIGO ÍNTEGRO. SELLADO POR HEBER MENDOZA.
 * --------------------------------------------------------------------------------------
 */
exports.despachoTaticoB2B = functions.https.onCall(async (data, context) => {
    // 🛡️ 0. DESPERTAR EL MOTOR (Lazy-load Sentinel V5.56)
    initCore();

    // 🛡️ 1. VALIDACIÓN DE IDENTIDAD
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Acceso denegado: Se requiere sesión activa.');
    }

    const { uidDestino, titulo, mensaje, ordenId } = data;
    const traceId = `trace_push_b2b_${Date.now()}`;

    // Validación básica de carga
    if (!uidDestino || !titulo || !mensaje) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros (uidDestino/titulo/mensaje).');
    }

    try {
        // 🛡️ 2. BÚSQUEDA DE RADIO (Token FCM)
        const userSnap = await db.collection("users").doc(uidDestino).get();
        
        if (!userSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Técnico no localizado en la base de datos.');
        }

        const token = userSnap.data()?.fcmToken;

        if (!token) {
            throw new functions.https.HttpsError('failed-precondition', 'El técnico no tiene radio activo (FCM Token ausente).');
        }

        // 🏗️ 3. PAYLOAD TÁCTICO (FCM V1 - WAKE DEVICE)
        const payload = {
            token: token,
            notification: {
                title: titulo.toUpperCase(),
                body: mensaje
            },
            data: {
    tipo: "orden_trabajo",
    prioridad: "alta",
    orderId: ordenId || "",
    url: "/tecnico.html"
},

android: {
    priority: "high",
    notification: {
        sound: "default"
    }
},

apns: {
    payload: {
        aps: {
            sound: "default",
            badge: 1,
            contentAvailable: true
        }
    }
}
        };

        // 🚀 4. DISPARO AL SATÉLITE
        const response = await admin.messaging().send(payload);
        
        // 🛰️ Telemetría Radar
        await reportSentinelMetric('b2b_push_dispatch_success');
        
        console.log(JSON.stringify({
            level: "SUCCESS",
            message: `✅ [RADIO_B2B] Despacho enviado a técnico: ${uidDestino}`,
            messageId: response,
            traceId
        }));

        return { 
            success: true, 
            messageId: response, 
            traceId,
            status: "SIGNAL_SENT" 
        };

    } catch (error) {
        await reportSentinelMetric('b2b_push_dispatch_error');
        console.error(JSON.stringify({
            level: "FATAL",
            message: "Fallo en la antena de despacho B2B",
            error: error.message,
            uid: uidDestino,
            traceId
        }));
        throw new functions.https.HttpsError('internal', `Error Sentinel Radio: ${error.message}`);
    }
});

/**
 * ======================================================================================
 * 🧩 MÓDULO 15: JARVIS - CEREBRO CONVERSACIONAL DE VOZ (SENTINEL V5.56 - ONCALL CORE)
 * ======================================================================================
 * OBJETIVO: Procesamiento de voz fluido, bypass de Auth y blindaje contra respuestas truncas.
 * --------------------------------------------------------------------------------------
 */
exports.jarvisConversacional = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onCall(async (data, context) => {
        // 🛡️ 0. DESPERTAR EL MOTOR
        initCore();

        if (!context.auth?.uid) {
            throw new functions.https.HttpsError(
                'unauthenticated',
                'Jarvis requiere una sesion autenticada.'
            );
        }

        const promptUsuario = data.prompt;
        const traceId = `trace_jarvis_${Date.now()}`;

        // 🛡️ FILTRO ANTI-RUIDO: Si el micro mandó un fragmento vacío o muy corto, lo ignoramos.
        if (!promptUsuario || promptUsuario.trim().length < 3) {
            return { success: true, respuesta: "Te escucho, Arquitecto. ¿Qué necesitas?", traceId };
        }

        try {
            // 📜 CONSTITUCIÓN DE JARVIS (REGLAS ESTRICTAS DE DICCIÓN)
            const systemInstruction = "Eres Jarvis, la IA autónoma de asistencia operativa del Arquitecto Heberto para GestiaPremium. Tus respuestas DEBEN ser completas, directas y sin cortarse. Usa máximo 2 o 3 oraciones. Hablas para ser escuchado por voz: NO uses asteriscos ni markdown. TERMINA SIEMPRE tus ideas con un punto final.";

            // 🧠 INVOCACIÓN IA V5.56 (Gemini 2.5 Flash)
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                systemInstruction: systemInstruction,
                generationConfig: {
                    temperature: 0.6,
                    maxOutputTokens: 300
                }
            });

            // 🚀 DISPARO AL LLM
            const result = await model.generateContent(promptUsuario);
            const respuestaTexto = result.response.text().trim();

            await reportSentinelMetric('jarvis_voice_interactions_success');

            console.log(JSON.stringify({
                level: "INFO",
                message: `🗣️ [JARVIS V5.56] Respuesta generada: ${respuestaTexto.substring(0, 30)}...`,
                traceId
            }));

            // ✅ RETORNO SEGURO
            return { 
                success: true, 
                respuesta: respuestaTexto, 
                traceId 
            };

        } catch (error) {
            await reportSentinelMetric('jarvis_engine_fatal_error');
            console.error(JSON.stringify({
                level: "FATAL",
                message: "Fallo en la corteza frontal de Jarvis",
                error: error.message,
                traceId
            }));
            
            throw new functions.https.HttpsError('internal', 'Pérdida de conexión con el núcleo lógico.');
        }
    });

    // ======================================================================================
// REPO COMMIT ENGINE
// ======================================================================================

let repoCommitEngine = {
    initialized: false
};

function initRepoCommitEngine() {

    if (repoCommitEngine.initialized) {
        return repoCommitEngine;
    }

    repoCommitEngine.github = null;

    repoCommitEngine.provider =
        "github";

    repoCommitEngine.secret =
        "GITHUB_TOKEN";

    repoCommitEngine.tokenPresent =
        !!process.env.GITHUB_TOKEN;

    if (repoCommitEngine.tokenPresent) {

        repoCommitEngine.github =
            new Octokit({
                auth: process.env.GITHUB_TOKEN
            });
    }

    repoCommitEngine.initialized = true;

    console.log(
        "🦾 [REPO_COMMIT_ENGINE_READY]"
    );

    return repoCommitEngine;
}

// ======================================================================================
// REPO COMMIT ENGINE HEALTH
// ======================================================================================

exports.repoCommitEngineHealth = functions
    .runWith({
    timeoutSeconds: 120,
    memory: "512MB"
})
    .https.onRequest(async (req, res) => {

        try {

            initRepoCommitEngine();

            const repoInfo =
                await repoCommitEngine.github.repos.get({
                    owner: "heberzzt-wq",
                    repo: "fixgo-app"
                });

            return res.status(200).json({
                success: true,
                engine: "repo_commit_engine",
                initialized: repoCommitEngine.initialized,
                provider: repoCommitEngine.provider,
                secret: repoCommitEngine.secret,
                tokenPresent: repoCommitEngine.tokenPresent,
                githubClient: !!repoCommitEngine.github,
                repo: repoInfo.data.full_name
            });

        } catch (error) {

            console.error(
                "[REPO_COMMIT_ENGINE_HEALTH]",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

// ======================================================================================
// REPO LIST ROOT
// ======================================================================================

exports.repoCommitListRoot = functions
    .runWith({
    timeoutSeconds: 120,
    memory: "512MB"
})
    .https.onRequest(async (req, res) => {

        try {

            initRepoCommitEngine();

            if (!repoCommitEngine.github) {

                return res.status(500).json({
                    success: false,
                    error: "GITHUB_CLIENT_NOT_AVAILABLE"
                });
            }

            const rootContents =
                await repoCommitEngine.github.repos.getContent({

    owner: "heberzzt-wq",

    repo: "fixgo-app",

    path: "",

    ref: "v5.9-polish"
});

            const items =
                Array.isArray(rootContents.data)
                    ? rootContents.data.map(item => ({
                        name: item.name,
                        path: item.path,
                        type: item.type
                    }))
                    : [];

            return res.status(200).json({
                success: true,
                repo: "heberzzt-wq/fixgo-app",
                count: items.length,
                items
            });

        } catch (error) {

            console.error(
                "[REPO_LIST_ROOT_ERROR]",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message,
                status: error.status || null
            });
        }
    });

// ======================================================================================
// REPO READ FILE
// ======================================================================================

exports.repoCommitReadFile = functions
    .runWith({
    timeoutSeconds: 120,
    memory: "512MB"
})
    .https.onRequest(async (req, res) => {

        try {

            initRepoCommitEngine();

            if (!repoCommitEngine.github) {

                return res.status(500).json({
                    success: false,
                    error: "GITHUB_CLIENT_NOT_AVAILABLE"
                });
            }

            const path =
                req.query.path ||
                req.body?.path;

            if (!path) {

                return res.status(400).json({
                    success: false,
                    error: "PATH_REQUIRED"
                });
            }

            const fileResponse =
                await repoCommitEngine.github.repos.getContent({

    owner: "heberzzt-wq",

    repo: "fixgo-app",

    path,

    ref: "v5.9-polish"
});

            if (Array.isArray(fileResponse.data)) {

                return res.status(400).json({
                    success: false,
                    error: "PATH_IS_DIRECTORY",
                    path
                });
            }

            const content =
                Buffer.from(
                    fileResponse.data.content,
                    "base64"
                ).toString("utf8");

            return res.status(200).json({
                success: true,
                repo: "heberzzt-wq/fixgo-app",
                path,
                sha: fileResponse.data.sha,
                size: fileResponse.data.size,
                encoding: fileResponse.data.encoding,
                content
            });

        } catch (error) {

            console.error(
                "[REPO_READ_FILE_ERROR]",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message,
                status: error.status || null
            });
        }
    });

    // ======================================================================================
// REPO WRITE FILE
// ======================================================================================

exports.repoCommitWriteFile = functions
    .runWith({
    timeoutSeconds: 120,
    memory: "512MB"
})
    .https.onRequest((req, res) => {

        corsHandler(req, res, async () => {

            
try {

    /* ==============================================================================
       FIREBASE AUTHORITY GATE
    ============================================================================== */

    const repoAuthorization =
        await authorizeRepoWriteRequest(
            req
        );

    if (
        repoAuthorization.ok !== true
    ) {

        console.warn(
            "🛑 [REPO_WRITE_AUTH_BLOCKED]",
            {
                status:
                    repoAuthorization.status,

                reason:
                    repoAuthorization.reason,

                uid:
                    repoAuthorization.uid,

                role:
                    repoAuthorization.role
            }
        );

        return res
            .status(
                repoAuthorization.httpStatus ||
                401
            )
            .json({
                success:
                    false,

                blocked:
                    true,

                status:
                    repoAuthorization.status ||
                    "unauthenticated",

                error:
                    repoAuthorization.reason ||
                    "REPO_WRITE_AUTH_BLOCKED",

                reason:
                    repoAuthorization.reason ||
                    "REPO_WRITE_AUTH_BLOCKED",

                message:
                    repoAuthorization.message ||
                    "La escritura fue bloqueada por falta de autoridad.",

                uid:
                    repoAuthorization.uid,

                role:
                    repoAuthorization.role,

                tenantId:
                    repoAuthorization.tenantId,

                surface:
                    "server"
            });
    }

    console.log(
        "🔐 [REPO_WRITE_AUTHORIZED]",
        {
            uid:
                repoAuthorization.uid,

            role:
                repoAuthorization.role,

            tenantId:
                repoAuthorization.tenantId,

            authSource:
                repoAuthorization.authSource
        }
    );

    initRepoCommitEngine();

    if (!repoCommitEngine.github) {



                    return res.status(500).json({
                        success: false,
                        error: "GITHUB_CLIENT_NOT_AVAILABLE"
                    });
                }

                const path =
                    req.body?.path ||
                    req.query?.path;

                const content =
                    req.body?.content;

                const commitMessage =
                    req.body?.message ||
                    `Jarvis update ${Date.now()}`;

                if (!path) {

                    return res.status(400).json({
                        success: false,
                        error: "PATH_REQUIRED"
                    });
                }

                
if (
    typeof content !== "string"
) {

    return res.status(400).json({
        success: false,
        error: "CONTENT_REQUIRED"
    });
}

/* ==================================================================================
   SERVER-SIDE REPO SYNTAX GATE
================================================================================== */

const syntaxValidation =
    validateRepoWriteSyntax({
        file:
            path,

        content
    });

if (
    syntaxValidation.ok !== true
) {

    console.error(
        "🛑 [SERVER_SYNTAX_WRITE_BLOCKED]",
        {
            path,
            status:
                syntaxValidation.status,

            reason:
                syntaxValidation.reason,

            message:
                syntaxValidation.message,

            line:
                syntaxValidation.line,

            column:
                syntaxValidation.column,

            parser:
                syntaxValidation.parser,

            parserVersion:
                syntaxValidation.parserVersion
        }
    );

    return res.status(422).json({
        success:
            false,

        blocked:
            true,

        status:
            syntaxValidation.status,

        error:
            syntaxValidation.reason ||
            "REPO_SYNTAX_VALIDATION_BLOCKED",

        reason:
            syntaxValidation.reason ||
            "REPO_SYNTAX_VALIDATION_BLOCKED",

        message:
            syntaxValidation.message ||
            "La escritura fue bloqueada por validación sintáctica.",

        path:
            syntaxValidation.file ||
            path,

        line:
            syntaxValidation.line,

        column:
            syntaxValidation.column,

        columnZeroBased:
            syntaxValidation.columnZeroBased,

        position:
            syntaxValidation.position,

        parser:
            syntaxValidation.parser,

        parserVersion:
            syntaxValidation.parserVersion,

        validator:
            syntaxValidation.validator,

        validatorVersion:
            syntaxValidation.validatorVersion,

        surface:
            syntaxValidation.surface,

        validation:
            syntaxValidation
    });
}

const safePath =
    syntaxValidation.file ||
    path;

console.log(
    "✅ [SERVER_SYNTAX_VALIDATION_PASSED]",
    {
        path:
            safePath,

        status:
            syntaxValidation.status,

        reason:
            syntaxValidation.reason ||
            null,

        parser:
            syntaxValidation.parser,

        parserVersion:
            syntaxValidation.parserVersion,

        surface:
            syntaxValidation.surface
    }
);

let currentSha = null;



                try {

                    const existingFile =
                        await repoCommitEngine.github.repos.getContent({

    owner: "heberzzt-wq",

    repo: "fixgo-app",

    path:
    safePath,

ref:
    "v5.9-polish"
});

                    currentSha =
                        existingFile.data.sha;

                } catch (readError) {

                    if (
                        readError.status !== 404
                    ) {
                        throw readError;
                    }
                }

                const encodedContent =
                    Buffer
                        .from(content, "utf8")
                        .toString("base64");

                const updatePayload = {
    owner: "heberzzt-wq",
    repo: "fixgo-app",
    branch: "v5.9-polish",
    path:
    safePath,
    message: commitMessage,
    content: encodedContent
};

                if (currentSha) {
                    updatePayload.sha =
                        currentSha;
                }

                const result =
                    await repoCommitEngine.github
                        .repos
                        .createOrUpdateFileContents(
                            updatePayload
                        );

                return res.status(200).json({
                    success: true,
                    repo: "heberzzt-wq/fixgo-app",
                    path:
                        safePath,
                    commit:
                        result.data.commit.sha,
                    fileSha:
                        result.data.content.sha,
                    created:
                        !currentSha,
                    updated:
                        !!currentSha
                });

            } catch (error) {

                console.error(
                    "[REPO_WRITE_FILE_ERROR]",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: error.message,
                    status: error.status || null
                });
            }

        });

    });

    // ======================================================================================
// REPO BACKUP FILE
// ======================================================================================

exports.repoCommitBackupFile = functions
    .runWith({
    timeoutSeconds: 120,
    memory: "512MB"
})
    .https.onRequest(async (req, res) => {

        try {

            initRepoCommitEngine();

            if (!repoCommitEngine.github) {

                return res.status(500).json({
                    success: false,
                    error: "GITHUB_CLIENT_NOT_AVAILABLE"
                });
            }

            const sourcePath =
                req.body?.path ||
                req.query?.path;

            if (!sourcePath) {

                return res.status(400).json({
                    success: false,
                    error: "PATH_REQUIRED"
                });
            }

            const sourceFile =
                await repoCommitEngine.github.repos.getContent({

    owner: "heberzzt-wq",

    repo: "fixgo-app",

    path: sourcePath,

    ref: "v5.9-polish"
});

            if (
                Array.isArray(sourceFile.data)
            ) {

                return res.status(400).json({
                    success: false,
                    error: "PATH_IS_DIRECTORY"
                });
            }

            const originalContent =
                Buffer.from(
                    sourceFile.data.content,
                    "base64"
                ).toString("utf8");

            const timestamp =
                Date.now();

            const backupPath =
                `_jarvis_backups/${timestamp}_${sourcePath.replace(/\//g, "__")}.bak`;

            const encodedBackup =
                Buffer
                    .from(originalContent, "utf8")
                    .toString("base64");

            const result =
                await repoCommitEngine.github.repos.createOrUpdateFileContents({

    owner: "heberzzt-wq",

    repo: "fixgo-app",

    branch: "v5.9-polish",

    path: backupPath,

    message:
        `Jarvis backup: ${sourcePath}`,

    content:
        encodedBackup
});

            return res.status(200).json({
                success: true,
                sourcePath,
                backupPath,
                backupCommit:
                    result.data.commit.sha,
                backupSha:
                    result.data.content.sha
            });

        } catch (error) {

            console.error(
                "[REPO_BACKUP_FILE_ERROR]",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message,
                status: error.status || null
            });
        }
    });

   /**
 * ======================================================================================
 * GESTIAPREMIUM V5.56 - NÚCLEO SIA7 (SENTINEL HYBRID CORE)
 * BRAZO EJECUTOR - GIT BRIDGE
 * ======================================================================================
 */

const { onRequest } = require("firebase-functions/v2/https");
const { Octokit } = require("@octokit/rest");

exports.executeSIA7Commit = onRequest(
    { region: "us-central1" },
    async (req, res) => {
        // Validación de CORS
        res.set("Access-Control-Allow-Origin", "*");
        if (req.method === "OPTIONS") {
            res.set("Access-Control-Allow-Methods", "POST");
            res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
            return res.status(204).send("");
        }

        return res.status(410).json({
            success: false,
            blocked: true,
            status: "deprecated",
            error: "SIA7_COMMIT_ENDPOINT_DEPRECATED",
            reason: "SIA7_COMMIT_ENDPOINT_DEPRECATED",
            message:
                "Este puente legacy fue retirado. Usa repoCommitWriteFile con Firebase Auth, idempotencia y validacion sintactica.",
            surface: "server"
        });
    }
);
/**
 * ======================================================================================
 * FIN DEL NÚCLEO GESTIAPREMIUM V5.56 (SENTINEL HYBRID CORE)
 * ======================================================================================
 * REGLA 1: SIN CORTES. CÓDIGO ÍNTEGRO.
 * REGLA 2: LLEVAR PASO A PASO (NIVEL SIA7)
 * --------------------------------------------------------------------------------------
 */
