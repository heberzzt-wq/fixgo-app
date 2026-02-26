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
 * MOTOR DE CIERRE FINANCIERO BLINDADO Y DINÁMICO
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

        // 2. CONSULTA DINÁMICA DEL PERFIL DEL TÉCNICO (GAMIFICACIÓN)
        const tecnicoRef = doc(db, "users", tecnicoId);
        const tecnicoSnap = await getDoc(tecnicoRef);
        
        let TASA_COMISION_DINAMICA = 0.32; // Default (Bronce / Penalizado)
        let nivelTecnico = "BRONCE";

        if (tecnicoSnap.exists()) {
            const tecnicoData = tecnicoSnap.data();
            // Si el motor de BI le asignó una comisión mejor (Oro 0.27 o Plata 0.30), la respetamos
            if (tecnicoData.comision_asignada && !isNaN(tecnicoData.comision_asignada)) {
                TASA_COMISION_DINAMICA = parseFloat(tecnicoData.comision_asignada);
            }
            nivelTecnico = tecnicoData.nivel || "BRONCE";
        }

        console.log(`🎖️ Nivel del Técnico: ${nivelTecnico} | Tasa Aplicada: ${(TASA_COMISION_DINAMICA * 100)}%`);

        // 3. REGLAS FISCALES INALTERABLES
        const RETENCION_IVA_TASA  = 0.08; // 8%
        const RETENCION_ISR_TASA  = 0.10; // 10%

        // 4. MATEMÁTICA MAESTRA (AHORA DINÁMICA)
        const montoComisionFixGo = costoTotal * TASA_COMISION_DINAMICA;
        const montoIVA           = costoTotal * RETENCION_IVA_TASA;
        const montoISR           = costoTotal * RETENCION_ISR_TASA;
        
        // El pago neto real que se le depositará al técnico
        const pagoNetoTecnico = costoTotal - (montoComisionFixGo + montoIVA + montoISR);

        console.log(`📊 Desglose: Total $${costoTotal} | FixGo: $${montoComisionFixGo.toFixed(2)} | Neto: $${pagoNetoTecnico.toFixed(2)}`);

        // 5. ACTUALIZACIÓN DE SERVICIO (ESTADO FINAL)
        await updateDoc(servicioRef, {
            estado: "finalizado",
            evidencia: { 
                antes: b64_1, 
                despues: b64_2 
            },
            finalizado_at: serverTimestamp(),
            protocolo_seguridad: "V5-BLINDADO-DINAMICO",
            desglose_fiscal: {
                subtotal: (costoTotal / 1.16).toFixed(2),
                iva_cliente: (costoTotal - (costoTotal / 1.16)).toFixed(2),
                total: costoTotal,
                tasa_comision_aplicada: TASA_COMISION_DINAMICA // Guardamos evidencia para auditoría
            }
        });

        // 6. REGISTRO CONTABLE ATÓMICO (TRANSACCIONES)
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
            metodo: "AUTOMÁTICO_BRIDGE_DINAMICO"
        });

        // 7. WATCHDOG DE FACTURACIÓN DUAL (ÓRDENES PARA EL SAT)
        console.log("🧾 BRIDGE: Generando órdenes de facturación encoladas...");
        await addDoc(collection(db, "ordenes_facturacion"), {
            servicio_id: serviceId,
            tecnico_id: tecnicoId,
            fecha_orden: serverTimestamp(),
            // FACTURA 1: Técnico al Cliente (100% del costo)
            factura_cliente: {
                monto: costoTotal,
                // Si el cliente no dejó datos, se va a Público General por defecto
                receptor: data.datos_facturacion || { rfc: "XAXX010101000", razon_social: "PUBLICO GENERAL", cp: "77500", regimen: "616" },
                estado: "pendiente_timbrado",
                requerida_por_cliente: data.factura_requerida === true
            },
            // FACTURA 2: Gestia al Técnico (Comisión Variable Dinámica)
            factura_comision: {
                monto: montoComisionFixGo,
                receptor_tecnico_id: tecnicoId, 
                estado: "pendiente_timbrado",
                tasa_aplicada: TASA_COMISION_DINAMICA
            }
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
        const response = await fetch("https://stripewebhook-72a7uqnggq-uc.a.run.app/create-checkout-session", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                serviceId: serviceId, 
                descripcion: payloadTicket.descripcion || "Servicio GestiaPremium",
                monto: 550, // Retención de garantía
                tipo_pago: "garantia_inicial" 
            })
        });

        const session = await response.json();

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
                monto: saldoPendiente, 
                tipo_pago: "liquidacion_saldo" 
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
        await updateDoc(doc(db, "services", serviceId), { estado: "cotizando" });
    }
}

// Exponemos las funciones al entorno global
if (typeof window !== "undefined") {
    window.procesarPagoStripe = procesarPagoStripe;
    window.procesarPagoSaldoStripe = procesarPagoSaldoStripe;
}
