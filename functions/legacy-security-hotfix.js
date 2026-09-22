"use strict";

// One withdrawal authority. Closure stays disabled until its verified backend is supplied.
function createLegacySecurityExports({ functions, admin, requestWithdrawal, completeService }) {
    if (typeof requestWithdrawal !== "function") throw new Error("CANONICAL_WITHDRAWAL_REQUIRED");
    const unavailableClosure = functions.https.onCall(async (_data, context) => {
        if (!context?.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "Se requiere sesión.");
        throw new functions.https.HttpsError("failed-precondition", "El cierre verificado requiere el release B2C completo.", { code: "VERIFIED_CLOSURE_RELEASE_REQUIRED" });
    });
    return {
        requestPayout: requestWithdrawal,
        procesarCierreServicio: completeService || unavailableClosure,
        generarModulo: functions.https.onRequest(async (req, res) => {
            const authorization = String(req.headers.authorization || "");
            if (!authorization.startsWith("Bearer ")) return res.status(401).json({ error: "AUTH_REQUIRED" });
            try { await admin.auth().verifyIdToken(authorization.slice(7).trim(), true); }
            catch { return res.status(401).json({ error: "AUTH_REQUIRED" }); }
            return res.status(410).json({ error: "LEGACY_MODULE_GENERATION_RETIRED", migrationRequired: true });
        })
    };
}

module.exports = { createLegacySecurityExports };
