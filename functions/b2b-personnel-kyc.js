"use strict";

const contract = require('./b2c-platform-contract');
const PERSONNEL_ROLES = new Set(['supervisor', 'tecnico', 'tecnico_gp', 'tecnico_interno', 'seguridad_24_7', 'seguridad_interna', 'inquilino_b2b', 'recepcion']);

function createB2bPersonnelKycHandlers({ admin, db, functions, bucket }) {
    const error = (code, message) => { throw new functions.https.HttpsError(code, message); };
    const userRef = uid => db.collection('users').doc(uid);
    function personnel(profile) {
        if (profile?.tipo_cuenta !== 'B2B' || !PERSONNEL_ROLES.has(profile.rol) ||
            typeof profile.edificioId !== 'string' || !profile.edificioId.trim() || profile.suspendido === true) {
            error('permission-denied', 'Expediente de personal B2B requerido.');
        }
    }
    function pending(profile, state) {
        personnel(profile);
        if (profile.estado !== state || profile.status !== state) error('failed-precondition', 'El expediente ya no está en esta etapa.');
    }
    async function evidence(uid, kind, path, expectedGeneration) {
        const prefix = `expedientes/${uid}/b2b/${kind}/`;
        if (typeof path !== 'string' || !path.startsWith(prefix) || !/^[0-9]+_[a-z0-9-]+\.(pdf|jpg|png)$/.test(path.slice(prefix.length))) {
            error('invalid-argument', 'Documento fuera de tu expediente.');
        }
        let metadata;
        try { [metadata] = await bucket.file(path).getMetadata(); }
        catch { error('failed-precondition', 'Documento no disponible en Storage; vuelve a subirlo.'); }
        const allowed = kind === 'foto_perfil' ? ['image/jpeg', 'image/png'] : ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowed.includes(metadata.contentType) || !(Number(metadata.size) > 0 && Number(metadata.size) <= 10 * 1024 * 1024) ||
            (expectedGeneration && String(metadata.generation) !== String(expectedGeneration))) {
            error('failed-precondition', 'Documento vacío, cambiado o con formato inválido.');
        }
        const token = String(metadata.metadata?.firebaseStorageDownloadTokens || '').split(',')[0];
        if (!token) error('failed-precondition', 'Falta confirmar la descarga del documento; vuelve a subirlo.');
        return { path, generation: String(metadata.generation), contentType: metadata.contentType,
            size: Number(metadata.size), url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}` };
    }
    async function verifyAll(uid, profile) {
        const validation = contract.personnelKycRequirements(profile);
        if (!validation.complete) error('failed-precondition', `Falta: ${validation.missing.join(', ')}`);
        for (const kind of ['ine', 'foto_perfil']) {
            const saved = profile.kyc?.evidencias?.[kind];
            if (!saved?.generation) error('failed-precondition', 'Falta verificar los documentos guardados.');
            await evidence(uid, kind, saved.path, saved.generation);
        }
    }
    const submitB2bPersonnelKyc = async (data, context) => {
        const uid = context?.auth?.uid;
        if (!uid) error('unauthenticated', 'Inicia sesión.');
        const target = userRef(uid);
        return db.runTransaction(async tx => {
            const profile = (await tx.get(target)).data();
            pending(profile, 'documentos_pendientes');
            const now = admin.firestore.FieldValue.serverTimestamp();
            if (data?.action === 'save_document') {
                const kind = data.kind;
                if (!['ine', 'foto_perfil'].includes(kind)) error('invalid-argument', 'Tipo de documento inválido.');
                const verified = await evidence(uid, kind, data.path);
                tx.update(target, {
                    [kind === 'ine' ? 'documentos.ine' : 'foto_perfil']: verified.url,
                    [`kyc.evidencias.${kind}`]: verified,
                    'kyc.aprobado': false, 'kyc.estado': 'documentos_pendientes', actualizadoEn: now
                });
                return { ok: true, kind, estado: 'documentos_pendientes' };
            }
            if (data?.action !== 'submit') error('invalid-argument', 'Acción inválida.');
            await verifyAll(uid, profile);
            tx.update(target, { estado: 'pendiente_revision', status: 'pendiente_revision',
                disponible: false, expediente_completo: true, 'kyc.estado': 'pendiente_revision',
                'kyc.aprobado': false, 'kyc.enviado_at': now, actualizadoEn: now });
            return { ok: true, estado: 'pendiente_revision' };
        });
    };
    const reviewB2bPersonnelKyc = async (data, context) => {
        const uid = context?.auth?.uid;
        if (!uid) error('unauthenticated', 'Inicia sesión.');
        const targetId = data?.personnelId;
        if (typeof targetId !== 'string' || !targetId || targetId.includes('/') || targetId === uid) error('invalid-argument', 'Personal inválido.');
        if (!['approve', 'return'].includes(data?.decision)) error('invalid-argument', 'Decisión inválida.');
        const reason = String(data.reason || '').trim().slice(0, 500);
        if (data.decision === 'return' && reason.length < 8) error('invalid-argument', 'Explica qué debe corregirse.');
        return db.runTransaction(async tx => {
            const actor = (await tx.get(userRef(uid))).data();
            const target = userRef(targetId);
            const profile = (await tx.get(target)).data();
            pending(profile, 'pendiente_revision');
            if (actor?.tipo_cuenta !== 'B2B' || actor.rol !== 'admin_b2b' || actor.status !== 'activo' ||
                (actor.estado && actor.estado !== 'activo') || actor.suspendido === true || actor.edificioId !== profile.edificioId) {
                error('permission-denied', 'Sólo el administrador activo de este edificio puede revisar.');
            }
            if (data.decision === 'approve') await verifyAll(targetId, profile);
            const approved = data.decision === 'approve';
            const state = approved ? 'activo' : 'documentos_pendientes';
            const now = admin.firestore.FieldValue.serverTimestamp();
            tx.update(target, { estado: state, status: state, disponible: false, verificado: approved,
                aprobado: approved, expediente_completo: approved, 'kyc.aprobado': approved,
                'kyc.estado': state, 'kyc.revisado_por': uid, 'kyc.revisado_at': now,
                'kyc.aprobado_por': approved ? uid : null, 'kyc.aprobado_at': approved ? now : null,
                'kyc.observaciones': approved ? '' : reason, actualizadoEn: now });
            return { ok: true, estado: state };
        });
    };
    return { submitB2bPersonnelKyc, reviewB2bPersonnelKyc };
}
module.exports = { createB2bPersonnelKycHandlers };
