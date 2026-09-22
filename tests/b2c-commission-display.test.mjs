import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { technicianCommissionReference, COMMISSION_REFERENCE_NOTICE } from '../b2c-commission-display.js';
const require = createRequire(import.meta.url);
const { calculateSettlement } = require('../functions/b2c-service-settlement.js');

test('profile reference agrees with settlement including zero commission and missing default', () => {
    for (const commission of [undefined, null, 0, 0.30, '0.27', '']) {
        const actual = calculateSettlement({ costo_final: 100, metodo_pago: 'stripe', comision_asignada: commission });
        assert.equal(technicianCommissionReference(commission), actual.technicianAmount);
    }
    for (const invalid of ['bad', Infinity, -0.2, 1.2]) assert.equal(technicianCommissionReference(invalid), null);
});

test('service overrides can differ from profile reference and UI discloses this limitation', () => {
    const profileReference = technicianCommissionReference(0.30);
    const settlement = calculateSettlement({ costo_final: 100, metodo_pago: 'stripe', comision_asignada: 0.30, tasa_comision_aplicada: 0.27 });
    assert.equal(profileReference, 70);
    assert.equal(settlement.technicianAmount, 73);
    assert.notEqual(profileReference, settlement.technicianAmount);
    assert.match(COMMISSION_REFERENCE_NOTICE, /importe final.*tarifa aplicada a cada servicio/);
});
