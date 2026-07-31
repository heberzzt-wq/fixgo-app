"use strict";

/**
 * Entrada final de Functions.
 * Mantiene el nombre histórico `stripewebhook` para que clientes ya publicados
 * lleguen al mismo API autoritativo de secure-entry.js mediante un export distinto.
 */

const functions = require("firebase-functions/v1");
const secureExports = require("./secure-entry.js");

const stripeWebhookProxy = functions.https.onRequest((req, res) => {
    return secureExports.api(req, res);
});

module.exports = {
    ...secureExports,
    stripewebhook: stripeWebhookProxy
};
