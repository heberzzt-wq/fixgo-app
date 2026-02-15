/**
 * ======================================================================================
 * FIXGO 2026 - CORE FINANCIERO & SEGURIDAD (BACKEND ENGINE)
 * ======================================================================================
 * Este archivo contiene la lógica que NADIE puede tocar desde el navegador.
 * Aquí se definen las reglas de dinero, impuestos y comisiones.
 */

import { db, admin } from "./firebase-admin-config.js"; // Referencia a admin SDK

/**
 * ENGINE: CIERRE DE SERVICIO Y CÁLCULO FISCAL RESTRICCIONADO
 * Calcula: 32% FixGo, 8% IVA, 10% ISR.
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
            const comisionFixGo = costoTotal * 0.32; // 32%
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
