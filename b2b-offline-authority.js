// Private browser persistence is scoped to both authenticated account and exact tenant.
// The legacy database is retained: unidentified queued work is never replayed or erased.
export function b2bCacheDatabaseName(uid, tenantId) {
    if (typeof uid !== 'string' || !uid.trim() || typeof tenantId !== 'string' || !tenantId.trim()) throw new Error('B2B_CACHE_AUTHORITY_REQUIRED');
    return `gestia_b2b_${encodeURIComponent(JSON.stringify([uid, tenantId]))}`;
}

export function canRecoverB2bQueue(value, uid, tenantId, order) {
    return Boolean(value && value.actorUid === uid && order && order.edificioId === tenantId &&
        order.tecnicoId === uid && (!value.collection || value.collection === 'servicios_b2b'));
}

export async function recoverLegacyB2bQueues(indexedDB, destination, { uid, tenantId, readOrder }) {
    if (typeof indexedDB.databases !== 'function') return { imported: 0, retained: 0 };
    const databases = await indexedDB.databases();
    if (!databases.some(database => database.name === 'gestia_cache')) return { imported: 0, retained: 0 };
    const legacy = await new Promise((resolve, reject) => {
        const request = indexedDB.open('gestia_cache');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const result = { imported: 0, retained: 0 };
    try {
        for (const store of ['sync_queue', 'fotos_pendientes']) {
            if (!legacy.objectStoreNames.contains(store)) continue;
            const rows = await new Promise((resolve, reject) => {
                const tx = legacy.transaction(store, 'readonly'); const source = tx.objectStore(store);
                const keys = source.getAllKeys(); const values = source.getAll();
                tx.oncomplete = () => resolve(values.result.map((value, i) => ({ key: keys.result[i], value })));
                tx.onerror = () => reject(tx.error);
            });
            for (const { key, value } of rows) {
                if (value.actorUid !== uid) continue;
                const orderId = value.ordenId || value.id;
                let order;
                try { order = await readOrder(orderId); } catch { result.retained++; continue; }
                if (!canRecoverB2bQueue(value, uid, tenantId, order)) { result.retained++; continue; }
                const imported = await new Promise((resolve, reject) => {
                    const tx = destination.transaction([store, 'legacy_imports'], 'readwrite');
                    const ledger = tx.objectStore('legacy_imports'); const marker = `${store}:${key}`;
                    let added = false; const seen = ledger.get(marker);
                    seen.onsuccess = () => { if (seen.result) return;
                        tx.objectStore(store).add({ ...value, tenantId }); ledger.put({ id: marker }); added = true;
                    };
                    tx.oncomplete = () => resolve(added); tx.onerror = () => reject(tx.error);
                });
                if (imported) result.imported++;
            }
        }
    } finally { legacy.close(); }
    return result;
}
