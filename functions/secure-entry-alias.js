"use strict";

/**
 * Entrada final de Functions.
 * Mantiene el nombre histórico `stripewebhook` para que clientes ya publicados
 * lleguen al mismo API autoritativo de secure-entry.js.
 */

const secureExports = require("./secure-entry.js");

module.exports = {
    ...secureExports,
    stripewebhook: secureExports.api
};
