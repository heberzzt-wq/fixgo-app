import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const firestore = fs.readFileSync(new URL("../security/firestore-console-snapshot-2026-07-30.rules.txt", import.meta.url), "utf8");
const storage = fs.readFileSync(new URL("../security/storage-hardening-candidate.rules.txt", import.meta.url), "utf8");

test("users no permite lectura indiscriminada ni autoaprobación", () => {
    const usersBlock = firestore.slice(firestore.indexOf("match /users/{userId}"), firestore.indexOf("match /tecnicos/{userId}"));
    assert.doesNotMatch(usersBlock, /allow read:\s*if isAuth\(\)\s*;/);
    assert.match(usersBlock, /request\.auth\.uid == userId/);
    assert.match(usersBlock, /userAuthorityFieldsUnchanged\(\)/);
    assert.match(firestore, /aprobado_por/);
    assert.match(firestore, /request\.resource\.data\.estado == 'pendiente_revision'/);
});

test("services reserva la creación B2C al backend y conserva B2B", () => {
    const servicesBlock = firestore.slice(firestore.indexOf("match /services/{serviceId}"), firestore.indexOf("match /notificaciones_pendientes"));
    assert.match(servicesBlock, /cliente_id == request\.auth\.uid/);
    assert.match(servicesBlock, /B2C se crea sólo mediante createB2cService/);
    assert.match(servicesBlock, /metodo_pago', ''\) == 'b2b'/);
    assert.match(servicesBlock, /userTipo\(\) == 'B2B'/);
    assert.match(servicesBlock, /categoria_id', ''\) == 'maint_general'/);
    assert.match(servicesBlock, /tipo', ''\) == 'mantenimiento'/);
    assert.match(servicesBlock, /serviceFinancialFieldsUnchanged\(\)/);
    assert.doesNotMatch(servicesBlock, /allow read:\s*if isAuth\(\)\s*;/);
    assert.doesNotMatch(servicesBlock, /isOperationalTechnician\(\) && resource\.data\.estado in \['pendiente', 'pagado'\]/);
});

test("la bolsa B2C publica una proyección y el claim no se autoriza desde reglas cliente", () => {
    const marketplaceBlock = firestore.slice(firestore.indexOf("match /service_marketplace/{serviceId}"), firestore.indexOf("match /technician_active_services"));
    assert.match(marketplaceBlock, /allow read: if isOperationalTechnician\(\) \|\| isAdmin\(\)/);
    assert.doesNotMatch(marketplaceBlock, /allow create: if isAuth/);
    assert.match(firestore, /El expediente completo permanece en services/);
});

test("retiros y transacciones financieras sólo se escriben desde backend", () => {
    const financeBlock = firestore.slice(firestore.indexOf("match /transacciones/{txId}"), firestore.indexOf("match /rastreo/{userId}"));
    assert.match(financeBlock, /allow create, update, delete: if false/);
    assert.doesNotMatch(financeBlock, /allow create: if isAuth/);
});

test("Storage protege expedientes y niega rutas no inventariadas", () => {
    const expedienteBlock = storage.slice(storage.indexOf("match /expedientes"), storage.indexOf("match /solicitudes_iniciales"));
    assert.match(expedienteBlock, /request\.auth\.uid == uid/);
    assert.match(expedienteBlock, /authorizedAdmin\(\)/);
    assert.match(expedienteBlock, /validDocument/);
    assert.match(storage, /match \/service_initial\/\{serviceId\}\/\{customerId\}/);
    assert.match(storage, /match \/firmas\/\{orderId\}\/\{fileName\}/);
    assert.match(storage, /match \/perfiles_tecnicos\/\{fileName\}/);
    assert.match(storage, /match \/pases_digitales\/\{edificioId\}\/\{fileName\}/);
    assert.match(storage, /b2bTechnicianForOrder\(orderId\)/);
    assert.match(storage, /b2bManagerForTenant\(edificioId\)/);
    assert.match(storage, /match \/\{allPaths=\*\*\}/);
    assert.match(storage, /allow read, write: if false/);
    assert.doesNotMatch(storage, /match \/b\/\{bucket\}\/o\s*\{\s*allow read, write: if request\.auth != null/);
});
