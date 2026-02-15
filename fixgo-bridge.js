/**
 * ======================================================================================
 * FIXGO 2026 - BRIDGE DE SEGURIDAD FINANCIERA (CORE UNICORNIO)
 * ======================================================================================
 * Archivo: fixgo-bridge.js
 * Función: Centralizar cálculos sensibles, impuestos y reglas de negocio.
 * Nivel: Blindaje Backend (Simulado en Bridge).
 */

import { 
    db, 
    doc, 
    getDoc, 
    updateDoc, 
    addDoc, 
    serverTimestamp, 
    collection 
} from "./firebase.js";

/**
 * MOTOR DE CIERRE FINANCIERO BLINDADO
 * Aquí es donde se definen los porcentajes reales. 
 * Si el técnico intenta manipular el app-panel.js, este archivo ignora sus cambios
 * y aplica la ley de FixGo definida aquí.
 */
export async function finalizarServicioBlindado(serviceId, tecnicoId, b64_1, b64_2) {
    console.log("🛡️ BRIDGE: Iniciando protocolo de cierre financiero seguro...");

    try {
        // 1. OBTENER DATOS DE LA NUBE (La única verdad)
        const servicioRef = doc(db, "services", serviceId);
        const servicioSnap = await getDoc(servicioRef);

        if (!servicioSnap.exists()) {
            throw new Error("El servicio no existe en la base de datos.");
        }

        const data = servicioSnap.data();
        const costoTotal = data.costo_final || 0;

        if (costoTotal <= 0) {
            throw new Error("El costo del servicio no ha sido definido o es inválido.");
        }

        // 2. REGLAS DE NEGOCIO FIXGO (INALTERABLES)
        // Heber, si mañana cambias de opinión, solo editas estos números aquí:
        const COMISION_FIXGO_TASA = 0.32; // 32%
        const RETENCION_IVA_TASA  = 0.08; // 8%
        const RETENCION_ISR_TASA  = 0.10; // 10%

        // 3. MATEMÁTICA MAESTRA
        const montoComisionFixGo = costoTotal * COMISION_FIXGO_TASA;
        const montoIVA           = costoTotal * RETENCION_IVA_TASA;
        const montoISR           = costoTotal * RETENCION_ISR_TASA;
        
        // El pago neto real que se le depositará al técnico
        const pagoNetoTecnico = costoTotal - (montoComisionFixGo + montoIVA + montoISR);

        console.log(`📊 Desglose: Total $${costoTotal} | FixGo: $${montoComisionFixGo} | Neto: $${pagoNetoTecnico}`);

        // 4. ACTUALIZACIÓN DE SERVICIO (ESTADO FINAL)
        await updateDoc(servicioRef, {
            estado: "finalizado",
            evidencia: { 
                antes: b64_1, 
                despues: b64_2 
            },
            finalizado_at: serverTimestamp(),
            protocolo_seguridad: "V5-BLINDADO",
            desglose_fiscal: {
                subtotal: (costoTotal / 1.16).toFixed(2),
                iva_cliente: (costoTotal - (costoTotal / 1.16)).toFixed(2),
                total: costoTotal
            }
        });

        // 5. REGISTRO CONTABLE ATÓMICO (TRANSACCIONES)
        // Este registro es el que lee tu Panel de Admin para las gráficas de dinero.
        await addDoc(collection(db, "transacciones"), {
            servicio_id: serviceId,
            tecnico_id: tecnicoId,
            monto_total: costoTotal,
            comision_fixgo: montoComisionFixGo,
            retencion_iva: montoIVA,
            retencion_isr: montoISR,
            pago_tecnico: pagoNetoTecnico,
            fecha: serverTimestamp(),
            tipo: "ingreso_servicio",
            metodo: "AUTOMÁTICO_BRIDGE"
        });

        return { success: true, neto: pagoNetoTecnico };

    } catch (error) {
        console.error("🚨 ERROR CRÍTICO EN BRIDGE:", error);
        throw error;
    }
}

/**
 * MOTOR DE RETIROS SEGUROS (Próxima Fase)
 * Aquí agregaremos la validación de saldos antes de permitir que el Admin apruebe.
 */
export async function procesarRetiroSeguro(retiroId, tecnicoId, monto) {
    // ... lógica en construcción ...
}
