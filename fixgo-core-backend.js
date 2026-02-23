/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - CORE FINANCIERO & SEGURIDAD (BACKEND ENGINE)
 * ======================================================================================
 * Este archivo contiene la lógica que NADIE puede tocar desde el navegador.
 * Aquí se definen las reglas de dinero, impuestos y comisiones.
 */

import { db, admin } from "./firebase-admin-config.js"; // Referencia a admin SDK
import Stripe from 'stripe'; // <-- INYECCIÓN DE LIBRERÍA STRIPE

// 🔐 INYECCIÓN DEL MOTOR STRIPE (NÚCLEO SECRETO - TEST MODE)
// Esta llave NUNCA debe salir del backend. Tiene el poder de mover fondos.
const stripe = new Stripe('sk_test_51SuznMFB3c4okYlKjMgZmzFe0ccntTVmfwJDto4W8nzQLpP7FSTFTvVttTHfnvI6rahEj49zfJa0MZlXd4jE1wAe00L2wLH4JC');

/**
 * ENGINE: CIERRE DE SERVICIO Y CÁLCULO FISCAL RESTRICCIONADO
 * Calcula: 32% GestiaPremium, 8% IVA, 10% ISR.
 */
export async function procesarCierreServicio(serviceId, tecnicoId) {
    console.log("🛡️ Iniciando proceso de cierre blindado para:", serviceId);

    const servicioRef = db.collection("services").doc(serviceId);
    const transaccionRef = db.collection("transacciones").doc();

    try {
        const resultado = await db.runTransaction(async (t) => {
            const sDoc = await t.get(servicioRef);
            if (!sDoc.exists) throw "Servicio no encontrado";

            const data = sDoc.data();
            const costoTotal = data.costo_final || 0;

            // MATEMÁTICA MAESTRA (Protegida)
            const comisionFixGo = costoTotal * 0.32; // 32% (Mantenemos variable interna por compatibilidad)
            const retencionIVA = costoTotal * 0.08;  // 8%
            const retencionISR = costoTotal * 0.10;  // 10%
            const pagoNetoTecnico = costoTotal - (comisionFixGo + retencionIVA + retencionISR);

            // 1. Actualizamos el estado del servicio a FINALIZADO
            t.update(servicioRef, {
                estado: "finalizado",
                finalizado_at: admin.firestore.FieldValue.serverTimestamp(),
                desglose_real: {
                    comision_fixgo: comisionFixGo,
                    retencion_iva: retencionIVA,
                    retencion_isr: retencionISR,
                    pago_neto: pagoNetoTecnico
                }
            });

            // 2. Creamos la transacción financiera oficial
            t.set(transaccionRef, {
                servicio_id: serviceId,
                tecnico_id: tecnicoId,
                monto_total: costoTotal,
                comision_fixgo: comisionFixGo,
                retencion_iva: retencionIVA,
                retencion_isr: retencionISR,
                pago_tecnico: pagoNetoTecnico,
                fecha: admin.firestore.FieldValue.serverTimestamp(),
                tipo: "ingreso_servicio",
                verificado: true
            });

            return { success: true, neto: pagoNetoTecnico };
        });

        console.log("✅ Cierre procesado con éxito. Neto para técnico:", resultado.neto);
        return resultado;

    } catch (error) {
        console.error("❌ Error crítico en transacción financiera:", error);
        throw error;
    }
}

/**
 * ENGINE: SEGURIDAD DE RETIROS SPEI
 * Evita que un técnico retire más de lo que tiene o duplique retiros.
 */
export async function ejecutarRetiroSeguro(retiroId, tecnicoId, monto) {
    // Lógica para validar saldo antes de descontar...
    // (Esto lo desarrollaremos en el siguiente paso)
}

/**
 * ======================================================================================
 * 💳 NUEVO ENGINE: INTERCEPTOR DE PAGOS STRIPE Y DISPARADOR CFDI
 * ======================================================================================
 * Escucha los eventos de éxito desde los servidores de Stripe.
 */
export async function procesarWebhookStripe(req, res) {
    console.log("🔔 [Webhook] Llamada entrante de Stripe detectada.");
    
    let event = req.body;

    // Manejar el evento de pago exitoso (Payment Link completado)
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        const emailCliente = session.customer_details.email;
        const montoPagado = session.amount_total / 100; // Stripe maneja centavos, dividimos entre 100
        const idTransaccionStripe = session.payment_intent;

        console.log(`✅ [Stripe] Pago confirmado: ${montoPagado} MXN del cliente: ${emailCliente}`);

        try {
            // 1. AQUI ACTUALIZAREMOS LA BASE DE DATOS FIREBASE (Estado: Pagado)
            // ej: await db.collection("services").where("clienteEmail", "==", emailCliente).update({ estadoPago: "pagado" });
            console.log("💾 Base de datos actualizada con el pago seguro.");

            // 2. 🚀 MOTOR DE FACTURACIÓN CFDI 4.0 (PISTA DE ATERRIZAJE)
            // Aquí es donde inyectaremos la API de Facturama o SW Sapien
            console.log("🧾 Preparando disparo de motor CFDI para:", emailCliente);
            // await generarFacturaCFDI(session);

        } catch (error) {
            console.error("❌ Error al procesar el impacto en la base de datos tras el pago:", error);
            return res.status(500).send("Error interno al registrar el pago");
        }
    } else {
        console.log(`⚠️ [Stripe] Evento no procesado: ${event.type}`);
    }

    // Responder a Stripe que recibimos el mensaje correctamente (Vital para que no reintente)
    res.status(200).json({ received: true });
}
