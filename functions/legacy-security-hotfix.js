"use strict";

/**
 * Reclaims historical Cloud Function names that can survive outside the
 * current package entrypoint. They must never keep independent authority.
 */
function createLegacySecurityHotfix({ functions, canonicalExports } = {}) {
    if (!functions?.https || !canonicalExports) {
        throw new Error("LEGACY_SECURITY_HOTFIX_DEPENDENCIES_REQUIRED");
    }
    if (typeof canonicalExports.solicitarRetiro !== "function") {
        throw new Error("CANONICAL_WITHDRAWAL_EXPORT_REQUIRED");
    }

    // Same trigger object: requestPayout cannot retain a separate wallet engine.
    const requestPayout = canonicalExports.solicitarRetiro;

    // Historical public AI generator is retired. No provider is initialized or called.
    const generarModulo = functions.https.onRequest((_req, res) => {
        const body = JSON.stringify({
            ok: false,
            error: "LEGACY_GENERATOR_RETIRED",
            authority: "secure-entry"
        });
        res.statusCode = 410;
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(body);
    });

    // Prefer the physically verified B2C close when it exists. Until that
    // release is present, fail closed instead of returning a fictitious success.
    const procesarCierreServicio =
        typeof canonicalExports.completeB2cService === "function"
            ? canonicalExports.completeB2cService
            : functions.https.onCall(async () => {
                throw new functions.https.HttpsError(
                    "failed-precondition",
                    "LEGACY_CLOSE_RETIRED_USE_CANONICAL_B2C_CLOSE"
                );
            });

    return Object.freeze({ requestPayout, generarModulo, procesarCierreServicio });
}

module.exports = { createLegacySecurityHotfix };
