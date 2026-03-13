// ======================================================
// MOTOR PREVENTIVO GESTIA PREMIUM B2B
// Archivo: scheduler_rutinas.js
// Propósito: Generación automática de OT preventivas
// ======================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Inicializamos la app si no ha sido inicializada previamente
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Seteamos la zona horaria de Cancún / CDMX para que el 
// robot no trabaje a deshoras.
const TZ = "America/Mexico_City";

// Exportamos las variables para usarlas en los siguientes pasos si es necesario
module.exports = { admin, db, TZ };
