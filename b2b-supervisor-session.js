import { resolveB2bProfileAuthority } from './gestia-core/auth/role-authority.js';

export function watchB2bSupervisor({ subscribeProfile, subscribeOrders, onProfile, onOrders, onError }) {
    let stopOrders = null;
    let tenantId = null;
    let disposed = false;
    const resetOrders = () => { stopOrders?.(); stopOrders = null; tenantId = null; onOrders([]); };
    const fail = error => { if (disposed) return; resetOrders(); onError(error); };
    const stopProfile = subscribeProfile(profile => {
        if (disposed) return;
        const authority = resolveB2bProfileAuthority(profile, { roles: ['supervisor'] });
        if (!authority.authorized) { fail(new Error('Tu acceso de supervisión no está activo.')); return; }
        onProfile(profile);
        if (tenantId === authority.tenantId) return;
        resetOrders(); tenantId = authority.tenantId;
        const subscribedTenant = tenantId;
        stopOrders = subscribeOrders(tenantId, rows => {
            if (disposed || tenantId !== subscribedTenant) return;
            onOrders(rows.filter(row => row.edificioId === subscribedTenant));
        }, error => { if (tenantId === subscribedTenant) fail(error); });
    }, fail);
    return () => { disposed = true; stopProfile?.(); resetOrders(); };
}
