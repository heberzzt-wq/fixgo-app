// Store only an opaque request identifier and payload digest, never form contents.
function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
        .filter(key => value[key] !== undefined).map(key => [key, stable(value[key])]));
    return value;
}

export async function reserveB2cRequest({ uid, payload, newId, storage = globalThis.localStorage, crypto = globalThis.crypto }) {
    if (!uid || !storage || !crypto?.subtle) throw new Error('B2C_RECOVERY_UNAVAILABLE');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable(payload))));
    const digest = [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
    const key = `b2c-request-v1:${encodeURIComponent(uid)}:${digest}`;
    const existing = storage.getItem(key);
    if (existing && /^[A-Za-z0-9_-]{8,160}$/.test(existing)) return { key, serviceId: existing };
    const serviceId = newId();
    if (!/^[A-Za-z0-9_-]{8,160}$/.test(serviceId)) throw new Error('B2C_REQUEST_ID_INVALID');
    storage.setItem(key, serviceId);
    return { key, serviceId };
}

export function completeB2cRequest(receipt, storage = globalThis.localStorage) {
    if (receipt && storage.getItem(receipt.key) === receipt.serviceId) storage.removeItem(receipt.key);
}

export function assertB2cRequestActor(expectedUid, currentUid) {
    if (!expectedUid || expectedUid !== currentUid) throw new Error('B2C_REQUEST_SESSION_CHANGED');
}
