/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ARCHITECTURE V5.18 (PRODUCTION READY)
 * ======================================================================================
 * Soporte Multi-Cliente: On-Demand (Uber), B2B (Uxmal 39), SaaS (Puerto Cancún)
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")('sk_test_51SuznMFB3c4okYlKjMgZmzFe0ccntTVmfwJDto4W8nzQLpP7FSTFTvVttTHfnvI6rahEj49zfJa0MZlXd4jE1wAe00L2wLH4JC');

if (!admin.apps.length) { admin.initializeApp(); }
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));

// ------------------------------------------------------------------
// 1. GENERADOR DE SESIÓN DE PAGO INTELIGENTE
// ------------------------------------------------------------------
app.post("/create-checkout-session", async (req, res) => {
    try {
        const { serviceId, descripcion, monto, tipo_pago, clientType, clientId } = req.body;

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
            success_url: 'https://fixgo-app-sf2l.vercel.app/cliente.html?pago=exito',
            cancel_url: 'https://fixgo-app-sf2l.vercel.app/cliente.html?pago=cancelado',
            metadata: {
                serviceId: serviceId, 
                tipo_pago: tipo_pago || 'garantia_inicial',
                clientType: clientType || 'ON_DEMAND', // ON_DEMAND, B2B_UXMAL, SAAS_RENTA
                clientId: clientId || 'general'
            }
        });

        res.json({ id: session.id, url: session.url });
    } catch (error) {
        console.error("❌ AI ZUM Error (Session):", error);
        res.status(500).json({ error: error.message });
    }
});

// ------------------------------------------------------------------
// 2. WEBHOOK MULTIMODAL (EL CEREBRO DE GESTIA)
// ------------------------------------------------------------------
app.post(["/", "/webhook"], async (req, res) => {
    const event = req.body;

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { serviceId, tipo_pago, clientType, clientId } = session.metadata;
        const montoTotal = session.amount_total / 100;

        try {
            if (!serviceId) return res.status(400).send("No serviceId found");

            const ticketRef = db.collection("services").doc(serviceId);
            const ticketSnap = await ticketRef.get();

            if (!ticketSnap.exists) {
                console.error(`❌ El servicio ${serviceId} no existe en la BD.`);
                return res.status(404).send("Service not found");
            }

            const data = ticketSnap.data();
            const estadoActual = data.estado;

            // --- LÓGICA DE ACTUALIZACIÓN DE ESTADO ---
            let nuevoEstado = estadoActual;
            if (tipo_pago === "garantia_inicial" && estadoActual === "iniciado_stripe") {
                nuevoEstado = "pendiente";
            } else if (tipo_pago === "liquidacion_saldo" && (estadoActual === "procesando_saldo" || estadoActual === "cotizando")) {
                nuevoEstado = "trabajando";
            }

            // --- CÁLCULOS FISCALES SEGÚN CLIENTE (AI ZUM CORE) ---
            let comisionGestia = 0;
            let nota = `Pago de ${tipo_pago.replace('_', ' ')}`;

            if (clientType === "ON_DEMAND") {
                // El 32% mágico que cubre tu 15%, impuestos y Stripe
                comisionGestia = montoTotal * 0.32;
                nota += " | On-Demand (Split Billing 32%)";
            } else if (clientType === "B2B_UXMAL") {
                // Caso Jorge: Aquí puedes decidir si cobrar comisión o no
                comisionGestia = 0; // Se asume cobro por contrato externo
                nota += " | Edificio Uxmal (Mantenimiento Bajo Contrato)";
            }

            // --- ATOMIZACIÓN DE LA BASE DE DATOS ---
            const batch = db.batch();

            // 1. Actualizamos el Servicio
            batch.update(ticketRef, {
                estado: nuevoEstado,
                metodo_pago: "stripe",
                ultimo_pago_id: session.id,
                fecha_pago: admin.firestore.FieldValue.serverTimestamp()
            });

            // 2. Creamos la Transacción Blindada para Facturama
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
                facturable: clientType === "ON_DEMAND" // Solo On-Demand dispara Facturama de inmediato
            });

            await batch.commit();
            console.log(`✅ [AI ZUM] Flujo ${clientType} completado con éxito para ticket ${serviceId}`);

        } catch (err) {
            console.error("❌ Error en el motor Webhook AI ZUM:", err);
        }
    }
    res.status(200).send({ received: true });
});

exports.stripeWebhook = functions.https.onRequest(app);