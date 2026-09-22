import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolveB2bProfileAuthority } from '../gestia-core/auth/role-authority.js';
const source = fs.readFileSync(new URL('../gestia-render.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export async function initGestiaRender'), source.indexOf('export function renderizarUIBase')).replace('export async', 'async');
async function harness(authority) {
    let authNext; let profileNext; let rendered = 0; let destroyed = 0; const tenants = [];
    const container = { innerHTML: '', replaceChildren() {}, textContent: '' };
    const user = { uid: 'user' };
    const scope = { auth: { currentUser: user }, db: {}, document: { getElementById: () => container },
        window: { location: { replace() {}, reload() {} } }, Lifecycle: { register() {}, destroy() { destroyed++; } },
        emitirPulsoHUD() {}, onAuthStateChanged: (_, next) => { authNext = next; return () => {}; },
        resolveTenantContext: async options => { assert.equal(options.forceRefresh, true); if (authority instanceof Error) throw authority; return authority; },
        resolveB2bProfileAuthority, doc: (_, ...parts) => parts.join('/'),
        getDoc: async () => ({ exists: () => true, data: () => ({ nombre_display: 'Security' }) }),
        onSnapshot: (_, next) => { profileNext = next; return () => {}; },
        renderizarUIBase() { rendered++; }, conectarDatosEnVivo: (_, __, tenant) => tenants.push(tenant), inyectarWidgetsSeguridad() {}
    };
    vm.runInNewContext('let condominioIdActual, rolUsuarioActual;\n' + code + '\nglobalThis.init=initGestiaRender;', scope);
    await scope.init('seguridad_accesos_b2b', 'container'); await authNext(user);
    return { tenants, rendered: () => rendered, destroyed: () => destroyed, profileNext };
}
test('render uses canonical tenant for standard and master sessions without default profile tenant', async () => {
    for (const authoritySource of ['profile', 'master_authenticated_email']) {
        const h = await harness({ authorized: true, uid: 'user', tenantId: 'CaseSensitive', role: 'recepcion', authoritySource });
        assert.equal(h.rendered(), 1); assert.deepEqual(h.tenants, ['CaseSensitive']);
        if (authoritySource === 'profile') { h.profileNext({ data: () => ({ tipo_cuenta: 'B2B', rol: 'recepcion', edificioId: 'other', status: 'activo' }) }); assert.equal(h.destroyed(), 1); }
    }
});
test('denied canonical authority never starts tenant listeners', async () => {
    const h = await harness(new Error('TENANT_AUTHORITY_REQUIRED'));
    assert.equal(h.rendered(), 0); assert.deepEqual(h.tenants, []);
});
