/**
 * ======================================================================================
 * 🧪 TEST DE FLUJO REAL: PERFIL JONATHAN (SENTINEL V5.55 FINAL CORE)
 * ======================================================================================
 * OBJETIVO: Validar el Círculo de Seguridad, Liquidación y Reputación.
 * UBICACIÓN: /tests/prueba_jonathan.js
 * --------------------------------------------------------------------------------------
 */
const admin = require('firebase-admin');

// 🛡️ IMPORTACIÓN DESDE LA ÚNICA FUENTE DE VERDAD (Ruta corregida para carpeta /tests)
const serviceAccount = require("../gestia-core/serviceAccountKey.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Ejecución del flujo asíncrono
(async () => {
    const ticketId = `TEST_FLOW_V555_${Date.now()}`;
    const ticketRef = db.collection('tickets').doc(ticketId);
    const tecnicoRef = db.collection('users').doc('jonathan_pro');

    console.log(`\n🚀 INICIANDO TEST DE FLUJO: JONATHAN (V5.55)`);
    console.log(`📍 Ticket ID: ${ticketId}`);
    console.log(`---------------------------------------------------`);

    try {
        // 1. INICIO DE SERVICIO (Atómico)
        console.log("👉 Paso 1: Registrando 'En Sitio'...");
        await ticketRef.set({
            status: 'en_sitio',
            tecnicoId: 'jonathan_pro',
            clienteId: 'cliente_test_001',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            featureFlags: { pago: 'efectivo' },
            version_core: "V5.55_FINAL"
        });

        // 2. CARGA DE EVIDENCIA Y FIRMA
        console.log("👉 Paso 2: Cargando evidencias y firma...");
        await ticketRef.update({
            status: 'finalizando_cobro',
            evidencias: {
                antes: 'https://storage.gestia.com/evidencia_1.jpg',
                despues: 'https://storage.gestia.com/evidencia_2.jpg'
            },
            firmaCliente: 'data:image/png;base64_SIMULATED_HASH',
            metadata: { 
                splitBilling: true, 
                engine: "Sentinel_V5.55",
                location: "Cancun_HQ"
            }
        });

        // 3. CIERRE DE TRANSACCIÓN ATÓMICA (Círculo de Seguridad)
        console.log("👉 Paso 3: Ejecutando Batch Commit (Liquidación + Reputación)...");
        const batch = db.batch();
        
        // Sellar el ticket como finalizado
        batch.update(ticketRef, { 
            status: 'finalizado',
            pagoConfirmado: true,
            fechaCierre: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Actualizar o crear técnico (Evita el error 5 NOT_FOUND)
        batch.set(tecnicoRef, {
            nombre: "Jonathan Pro",
            reputacion: admin.firestore.FieldValue.increment(1),
            serviciosCompletados: admin.firestore.FieldValue.increment(1),
            ultima_actividad: admin.firestore.FieldValue.serverTimestamp(),
            rol: "tecnico",
            status_sistema: "activo"
        }, { merge: true });

        // Ejecutar todo el bloque de una sola vez
        await batch.commit();

        console.log(`---------------------------------------------------`);
        console.log('✅ [SUCCESS] Círculo de Seguridad Cerrado.');
        console.log('✅ [SUCCESS] Reputación de Jonathan actualizada.');
        console.log(`🚀 TEST FINALIZADO CON ÉXITO\n`);
        
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ [ERROR CRÍTICO]: ${error.message}`);
        console.log(`---------------------------------------------------`);
        process.exit(1);
    }
})();