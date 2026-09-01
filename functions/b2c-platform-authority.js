"use strict";

const platformContract = require("./b2c-platform-contract");

function clean(value, maxLength = 500) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function callableError(functions, code, message) {
    return new functions.https.HttpsError(code, message);
}

function isAuthorizedAdmin(context, actorProfile = {}) {
    const email = clean(context?.auth?.token?.email, 240).toLowerCase();
    const role = platformContract.normalizeToken(actorProfile.rol || actorProfile.role);
    return context?.auth?.token?.admin === true ||
        email === "hebertoh-m@hotmail.com" ||
        ["admin", "ceo"].includes(role);
}

async function requireAdmin({ db, functions, context }) {
    if (!context?.auth?.uid) {
        throw callableError(functions, "unauthenticated", "Se requiere sesión administrativa.");
    }
    const actorSnapshot = await db.collection("users").doc(context.auth.uid).get();
    if (!isAuthorizedAdmin(context, actorSnapshot.data() || {})) {
        throw callableError(functions, "permission-denied", "Sólo administración puede ejecutar esta operación.");
    }
    return context.auth.uid;
}

function createB2cServiceHandler({ admin, db, functions }) {
    if (!admin || !db || !functions) throw new Error("B2C_CREATE_SERVICE_DEPENDENCIES_REQUIRED");
    return async (data, context) => {
        const customerId = context?.auth?.uid;
        if (!customerId) throw callableError(functions, "unauthenticated", "Se requiere sesión de cliente.");
        const serviceId = clean(data?.serviceId, 160);
        if (!/^[A-Za-z0-9_-]{8,160}$/.test(serviceId)) {
            throw callableError(functions, "invalid-argument", "serviceId inválido.");
        }
        const method = platformContract.normalizeToken(data?.metodo_pago);
        if (method === platformContract.PAYMENT_METHODS.B2B) {
            throw callableError(functions, "failed-precondition", "B2B conserva su autoridad contractual independiente.");
        }

        const customerRef = db.collection("users").doc(customerId);
        const configRef = db.collection("configuracion").doc("pagos");
        const [customerSnapshot, configSnapshot] = await Promise.all([
            customerRef.get(),
            configRef.get()
        ]);
        if (!customerSnapshot.exists) throw callableError(functions, "failed-precondition", "Perfil de cliente no disponible.");
        const customer = customerSnapshot.data() || {};
        if (platformContract.normalizeToken(customer.rol || customer.role) !== "cliente" || customer.tipo_cuenta === "B2B") {
            throw callableError(functions, "permission-denied", "La identidad no corresponde a un cliente B2C.");
        }
        const config = configSnapshot.exists ? configSnapshot.data() || {} : {};
        const payment = platformContract.assertPaymentMethodAllowed(method, config, customer);
        if (!payment.ok) {
            throw callableError(functions, "failed-precondition", payment.reason);
        }
        const destination = platformContract.normalizeDestination(data?.destino);
        if (!destination) throw callableError(functions, "invalid-argument", "DESTINATION_CONFIRMATION_REQUIRED");
        const categoryId = platformContract.normalizeCategoryKey({
            categoria_id: data?.categoria_id,
            categoria: data?.categoria,
            sub_servicio: data?.sub_servicio
        });
        if (!categoryId || !categoryId.includes("_")) {
            throw callableError(functions, "invalid-argument", "SERVICE_CATEGORY_INVALID");
        }
        const category = categoryId.split("_")[0];
        const subService = categoryId.split("_").slice(1).join("_");
        const authority = {
            method,
            global_enabled: true,
            individual_authorized: true,
            effective: true,
            contract_version: platformContract.CONTRACT_VERSION,
            checked_at: admin.firestore.FieldValue.serverTimestamp()
        };
        const serviceRef = db.collection("services").doc(serviceId);
        const state = method === platformContract.PAYMENT_METHODS.STRIPE
            ? platformContract.SERVICE_STATES.STRIPE_STARTED
            : platformContract.SERVICE_STATES.PENDING;
        const payload = {
            cliente_id: customerId,
            cliente_nombre: clean(customer.nombre || context.auth.token?.name || "Cliente", 160),
            cliente_telefono: clean(customer.telefono, 40),
            categoria: category,
            categoria_id: categoryId,
            sub_servicio: subService,
            tipo: "b2c",
            destino: {
                ...destination,
                confirmado_at: admin.firestore.FieldValue.serverTimestamp()
            },
            direccion: destination.direccion,
            coords: destination.coords,
            descripcion: clean(data?.descripcion, 4000),
            estado: state,
            metodo_pago: method,
            payment_authority: authority,
            zona: clean(data?.zona, 100) || "Cancún",
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            actualizado_at: admin.firestore.FieldValue.serverTimestamp(),
            retencion_inicial: method === platformContract.PAYMENT_METHODS.STRIPE ? 550 : 0,
            costo_final: 0,
            factura_requerida: data?.factura_requerida === true,
            datos_facturacion: data?.factura_requerida === true && data?.datos_facturacion && typeof data.datos_facturacion === "object"
                ? data.datos_facturacion
                : null,
            factura_enviada: false,
            urgencia: data?.urgencia === true,
            es_privada: data?.es_privada === true,
            foto_problema: clean(data?.foto_problema, 2500) || null,
            foto_problema_estado: clean(data?.foto_problema_estado, 60) || "no_proporcionada",
            link_waze_cliente: clean(data?.link_waze_cliente, 2500),
            auditoria: {
                create_authority: "createB2cService",
                contract_version: platformContract.CONTRACT_VERSION
            }
        };

        const result = await db.runTransaction(async transaction => {
            const current = await transaction.get(serviceRef);
            if (current.exists) {
                const existing = current.data() || {};
                if (existing.cliente_id !== customerId || existing.metodo_pago !== method) {
                    throw callableError(functions, "already-exists", "El serviceId ya pertenece a otra solicitud.");
                }
                return { created: false, estado: existing.estado };
            }
            transaction.create(serviceRef, payload);
            return { created: true, estado: state };
        });
        return {
            ok: true,
            serviceId,
            estado: result.estado,
            metodo_pago: method,
            created: result.created,
            contractVersion: platformContract.CONTRACT_VERSION
        };
    };
}

function createSetCustomerPaymentPermissionsHandler({ admin, db, functions }) {
    if (!admin || !db || !functions) throw new Error("B2C_PAYMENT_ADMIN_DEPENDENCIES_REQUIRED");
    return async (data, context) => {
        const actorId = await requireAdmin({ db, functions, context });
        const customerId = clean(data?.customerId, 160);
        if (!customerId) throw callableError(functions, "invalid-argument", "customerId es obligatorio.");
        if (typeof data?.stripe_autorizado !== "boolean" || typeof data?.efectivo_autorizado !== "boolean") {
            throw callableError(functions, "invalid-argument", "Ambas autorizaciones booleanas son obligatorias.");
        }
        const customerRef = db.collection("users").doc(customerId);
        return db.runTransaction(async transaction => {
            const snapshot = await transaction.get(customerRef);
            if (!snapshot.exists) throw callableError(functions, "not-found", "Cliente no encontrado.");
            const customer = snapshot.data() || {};
            if (platformContract.normalizeToken(customer.rol || customer.role) !== "cliente" || customer.tipo_cuenta === "B2B") {
                throw callableError(functions, "failed-precondition", "El perfil no corresponde a un cliente B2C.");
            }
            const now = admin.firestore.FieldValue.serverTimestamp();
            transaction.update(customerRef, {
                "pagos.stripe_autorizado": data.stripe_autorizado,
                "pagos.efectivo_autorizado": data.efectivo_autorizado,
                "pagos.actualizado_at": now,
                "pagos.actualizado_por": actorId,
                "pagos.contract_version": platformContract.CONTRACT_VERSION,
                actualizadoEn: now
            });
            return {
                ok: true,
                customerId,
                pagos: {
                    stripe_autorizado: data.stripe_autorizado,
                    efectivo_autorizado: data.efectivo_autorizado
                }
            };
        });
    };
}

function createMigrateTechnicianProfileHandler({ admin, db, functions }) {
    if (!admin || !db || !functions) throw new Error("B2C_TECHNICIAN_MIGRATION_DEPENDENCIES_REQUIRED");
    return async (data, context) => {
        const actorId = await requireAdmin({ db, functions, context });
        const technicianId = clean(data?.technicianId, 160);
        if (!technicianId) throw callableError(functions, "invalid-argument", "technicianId es obligatorio.");
        const apply = data?.apply === true;
        const ref = db.collection("users").doc(technicianId);
        const snapshot = await ref.get();
        if (!snapshot.exists) throw callableError(functions, "not-found", "Técnico no encontrado.");
        const raw = snapshot.data() || {};
        const migration = platformContract.technicianMigration(raw);
        if (!apply) return { ok: true, applied: false, technicianId, ...migration };
        if (migration.classification === "requires_review" && data?.reviewConfirmed !== true) {
            throw callableError(functions, "failed-precondition", "MIGRATION_REVIEW_CONFIRMATION_REQUIRED");
        }
        const now = admin.firestore.FieldValue.serverTimestamp();
        const legacyDeletes = Object.fromEntries(
            migration.legacyFields.map(field => [field, admin.firestore.FieldValue.delete()])
        );
        await ref.set({
            ...migration.canonical,
            ...legacyDeletes,
            migration: {
                ...(raw.migration || {}),
                b2c_contract_v1: {
                    applied: true,
                    applied_at: now,
                    applied_by: actorId,
                    source_classification: migration.classification,
                    source_reasons: migration.reasons
                }
            },
            actualizadoEn: now
        }, { merge: true });
        return { ok: true, applied: true, technicianId, classification: migration.classification };
    };
}

module.exports = {
    createB2cServiceHandler,
    createMigrateTechnicianProfileHandler,
    createSetCustomerPaymentPermissionsHandler,
    isAuthorizedAdmin
};
