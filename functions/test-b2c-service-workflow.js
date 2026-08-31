"use strict";

const assert = require("node:assert/strict");
const { normalizeQuote } = require("./b2c-service-workflow");

const quote = normalizeQuote({
    diagnostic: "Fuga visible en la unión principal.",
    factor: 1.25,
    items: [
        { cantidad: 2, unidad: "pz", descripcion: "Conector", precio: 125.555 },
        { cantidad: 1, unidad: "serv", descripcion: "Mano de obra", precio: 300 }
    ]
});
assert.equal(quote.total, 551.12);
assert.equal(quote.items[0].precio, 125.56);
assert.equal(quote.factor, 1.25);
assert.throws(() => normalizeQuote({ diagnostic: "corto", items: [] }), /DIAGNOSTIC_TOO_SHORT/);
assert.throws(() => normalizeQuote({ diagnostic: "Diagnóstico suficientemente largo", items: [{ cantidad: 0, descripcion: "x", precio: 1 }] }), /QUOTE_QUANTITY_INVALID/);

console.log("PASS b2c-service-workflow");
