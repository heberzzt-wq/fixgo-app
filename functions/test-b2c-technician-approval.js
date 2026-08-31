"use strict";

const assert = require("node:assert/strict");
const { isAuthorizedAdmin, validateTechnicianKyc } = require("./b2c-technician-approval");

const complete = {
    foto_perfil: "profile",
    vehiculo: { tipo: "auto", placas: "ABC123" },
    documentos: { ine: "ine", csf: "csf", licencia: "license", certificados: [] },
    datos_bancarios: { banco: "Bank", clabe: "123456789012345678" }
};

assert.equal(validateTechnicianKyc(complete).complete, true);
assert.equal(validateTechnicianKyc({
    ...complete,
    vehiculo: { tipo: "peaton", placas: "" },
    documentos: { ...complete.documentos, licencia: null }
}).complete, true);
assert.deepEqual(validateTechnicianKyc({ ...complete, documentos: { ...complete.documentos, ine: null } }).missing, ["ine"]);
assert.equal(isAuthorizedAdmin({ auth: { token: { admin: true } } }, {}), true);
assert.equal(isAuthorizedAdmin({ auth: { token: {} } }, { rol: "tecnico" }), false);

console.log("B2C technician approval tests passed");
