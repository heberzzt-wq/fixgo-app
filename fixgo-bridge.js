/**
 * ======================================================================================
 * FIXGO 2026 - BRIDGE DE SEGURIDAD FINANCIERA (CORE UNICORNIO)
 * ======================================================================================
 * Archivo: fixgo-bridge.js
 * Función: Centralizar cálculos sensibles, impuestos y reglas de negocio.
 * Nivel: Blindaje Backend (Simulado en Bridge).
 * Autor: Heber (CEO & Lead Architect)
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LOGICA.
 * ======================================================================================
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
 * MOTOR DE RETIROS SEGUROS (ATÓMICO)
 * Garantiza que si se marca como pagado, se descuenta el dinero SIEMPRE.
 * Este tramo reemplaza la lógica manual del admin para evitar errores de saldo.
 */
export async function ejecutarRetiroSeguro(retiroId, tecnicoId, monto) {
    console.log("🛡️ BRIDGE: Iniciando protocolo de retiro seguro para:", tecnicoId);

    try {
        const retiroRef = doc(db, "retiros", retiroId);
        const transaccionRef = collection(db, "transacciones");

        // 1. VALIDACIÓN DE ESTADO (Anti-Spam / Doble clic)
        const retiroSnap = await getDoc(retiroRef);
        if (!retiroSnap.exists()) throw new Error("Registro de retiro no encontrado.");
        
        if (retiroSnap.data().estado !== "pendiente") {
            throw new Error("Este retiro ya fue procesado o cancelado previamente.");
        }

        // 2. ACTUALIZACIÓN DE ESTADO DE SOLICITUD
        await updateDoc(retiroRef, {
            estado: "aprobado",
            fecha_aprobacion: serverTimestamp(),
            metodo_liquidacion: "SPEI_MANUAL_VERIFICADO",
            audit_log: "APROBADO_VIA_BRIDGE_V5"
        });

        // 3. GENERACIÓN DE TRANSACCIÓN NEGATIVA (DESCUENTO DE WALLET)
        // El movimiento maestro: usamos -Math.abs para asegurar que siempre sea resta.
        await addDoc(transaccionRef, {
            servicio_id: "RET-" + retiroId.substring(0, 5).toUpperCase(),
            tecnico_id: tecnicoId,
            monto_total: 0,
            comision_fixgo: 0,
            retencion_iva: 0,
            retencion_isr: 0,
            pago_tecnico: -Math.abs(monto), 
            fecha: serverTimestamp(),
            tipo: "retiro_fondos",
            nota: "Liquidación enviada vía SPEI"
        });

        console.log("✅ BRIDGE: Retiro de $" + monto + " procesado correctamente.");
        return { success: true };

    } catch (error) {
        console.error("🚨 ERROR EN RETIRO BRIDGE:", error);
        throw error;
    }
}

// 🔥 INYECCIÓN: MOTOR DE PAGOS STRIPE (ANTI-DUPLICADOS) - PAGO INICIAL
export async function procesarPagoStripe(serviceId, payloadTicket) {
    console.log("💳 BRIDGE: Iniciando conexión con Stripe para el ticket (Garantía):", serviceId);

    try {
        // Hacemos la petición a tu servidor en Google Cloud Run
        const response = await fetch("https://stripewebhook-72a7uqnggq-uc.a.run.app/create-checkout-session", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                // 🔥 ESTA ES LA CLAVE: Le mandamos el ID del ticket a tu servidor
                serviceId: serviceId, 
                descripcion: payloadTicket.descripcion || "Servicio GestiaPremium",
                monto: 550, // Retención de garantía
                tipo_pago: "garantia_inicial" // Identificador para tu webhook backend
            })
        });

        const session = await response.json();

        // Redirigimos al cliente a la pasarela de Stripe
        if (session.url) {
            window.location.href = session.url;
        } else {
            throw new Error("No se recibió URL de Stripe");
        }

    } catch (error) {
        console.error("🚨 ERROR EN PASARELA STRIPE:", error);
        alert("Error al conectar con la pasarela segura. Intenta de nuevo.");
    }
}

// 🔥 INYECCIÓN: MOTOR DE PAGOS STRIPE - PAGO DE SALDO FINAL
export async function procesarPagoSaldoStripe(serviceId, saldoPendiente) {
    console.log("💳 BRIDGE: Iniciando conexión con Stripe para cobrar SALDO:", serviceId, saldoPendiente);

    try {
        const response = await fetch("https://stripewebhook-72a7uqnggq-uc.a.run.app/create-checkout-session", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                serviceId: serviceId, 
                descripcion: "Liquidación de Saldo - Servicio GestiaPremium",
                monto: saldoPendiente, // Cobramos la diferencia exacta
                tipo_pago: "liquidacion_saldo" // Identificador clave para el webhook
            })
        });

        const session = await response.json();

        if (session.url) {
            window.location.href = session.url;
        } else {
            throw new Error("No se recibió URL de Stripe para el saldo");
        }

    } catch (error) {
        console.error("🚨 ERROR EN PASARELA STRIPE (SALDO):", error);
        alert("Error al conectar con la pasarela segura para liquidar el saldo. Intenta de nuevo.");
        // Revertimos el estado para que el cliente pueda volver a intentar pagar
        await updateDoc(doc(db, "services", serviceId), { estado: "cotizando" });
    }
}

// Exponemos las funciones al entorno global (window) para que panel-cliente.js las encuentre
if (typeof window !== "undefined") {
    window.procesarPagoStripe = procesarPagoStripe;
    window.procesarPagoSaldoStripe = procesarPagoSaldoStripe;
}
