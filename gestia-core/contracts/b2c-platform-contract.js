(function exposeGestiaB2CPlatformContract(root, factory) {
    const contract = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = contract;
    }
    if (root) {
        Object.defineProperty(root, "GestiaB2CPlatformContract", {
            configurable: true,
            enumerable: false,
            writable: false,
            value: contract
        });
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function createContract() {
    "use strict";

    const CONTRACT_VERSION = "b2c-platform-contract-v1";
    const EVENT_MARKETPLACE_SERVICE_AVAILABLE = "marketplace_service_available";

    const TECHNICIAN_STATES = Object.freeze({
        REGISTRATION_STARTED: "registro_iniciado",
        DOCUMENTS_PENDING: "documentos_pendientes",
        DOCUMENTS_UPLOADED: "documentos_subidos",
        PENDING_REVIEW: "pendiente_revision",
        ACTIVE: "activo",
        REJECTED: "rechazado",
        SUSPENDED: "suspendido"
    });

    const SERVICE_STATES = Object.freeze({
        STRIPE_STARTED: "iniciado_stripe",
        PENDING: "pendiente",
        ASSIGNED: "asignado",
        EN_ROUTE: "en_camino",
        ON_SITE: "en_sitio",
        QUOTING: "cotizando",
        PROCESSING_BALANCE: "procesando_saldo",
        WORKING: "trabajando",
        COMPLETED: "finalizado",
        CANCELLED: "cancelado"
    });

    const PAYMENT_METHODS = Object.freeze({
        STRIPE: "stripe",
        CASH: "efectivo",
        B2B: "b2b"
    });

    const DESTINATION_SOURCES = Object.freeze([
        "mapa_pin",
        "waze_maps",
        "gps_dispositivo",
        "direccion_manual"
    ]);

    const TECHNICIAN_LEGACY_FIELDS = Object.freeze([
        "role",
        "fotoPerfil",
        "foto",
        "logistica",
        "vehiculo_tipo",
        "placas",
        "certificado",
        "ine",
        "ine_url",
        "csf",
        "csf_url",
        "licencia",
        "banco",
        "banco_nombre",
        "clabe",
        "clabe_interbancaria"
    ]);

    const SERVICE_TRANSITIONS = Object.freeze({
        [SERVICE_STATES.STRIPE_STARTED]: Object.freeze([SERVICE_STATES.PENDING, SERVICE_STATES.CANCELLED]),
        [SERVICE_STATES.PENDING]: Object.freeze([SERVICE_STATES.ASSIGNED, SERVICE_STATES.CANCELLED]),
        [SERVICE_STATES.ASSIGNED]: Object.freeze([SERVICE_STATES.EN_ROUTE, SERVICE_STATES.CANCELLED]),
        [SERVICE_STATES.EN_ROUTE]: Object.freeze([SERVICE_STATES.ON_SITE, SERVICE_STATES.CANCELLED]),
        [SERVICE_STATES.ON_SITE]: Object.freeze([SERVICE_STATES.QUOTING, SERVICE_STATES.CANCELLED]),
        [SERVICE_STATES.QUOTING]: Object.freeze([
            SERVICE_STATES.PROCESSING_BALANCE,
            SERVICE_STATES.WORKING,
            SERVICE_STATES.CANCELLED
        ]),
        [SERVICE_STATES.PROCESSING_BALANCE]: Object.freeze([SERVICE_STATES.WORKING, SERVICE_STATES.CANCELLED]),
        [SERVICE_STATES.WORKING]: Object.freeze([SERVICE_STATES.COMPLETED])
    });

    const CATEGORY_ALIASES = Object.freeze({
        plomeria: "fix_plomeria",
        plomero: "fix_plomeria",
        electricidad: "fix_electricidad",
        electricista: "fix_electricidad",
        jardin: "fix_jardin",
        jardineria: "fix_jardin",
        aire_acondicionado: "fix_ac",
        ac: "fix_ac",
        mecanico: "road_mecanico",
        mecanica: "road_mecanico",
        grua: "road_grua",
        llantera: "road_llanta",
        cerrajero: "road_cerrajero",
        cerrajeria: "road_cerrajero",
        paso_corriente: "road_corriente"
    });

    function text(value, fallback = "") {
        const normalized = String(value ?? "").trim();
        return normalized || fallback;
    }

    function normalizeToken(value) {
        return text(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/&/g, " y ")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .replace(/_+/g, "_");
    }

    function finite(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeCoordinates(value) {
        const lat = finite(value?.lat ?? value?.latitude);
        const lng = finite(value?.lng ?? value?.longitude);
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        return { lat, lng };
    }

    function normalizeDestination(value = {}) {
        const source = normalizeToken(value.fuente);
        if (!DESTINATION_SOURCES.includes(source) || value.confirmado_por_cliente !== true) return null;
        const address = text(value.direccion);
        const coordinates = normalizeCoordinates(value.coords);
        if (!address && !coordinates) return null;
        return {
            direccion: address,
            coords: coordinates,
            fuente: source,
            fuente_direccion: normalizeToken(value.fuente_direccion) || null,
            confirmado_por_cliente: true,
            confirmado_at: value.confirmado_at ?? null,
            discrepancia: value.discrepancia === true,
            discrepancias: Array.isArray(value.discrepancias) ? value.discrepancias : [],
            inputs: value.inputs && typeof value.inputs === "object" ? value.inputs : null
        };
    }

    function isDocumentReference(value) {
        if (typeof value === "string") return value.trim().length > 0;
        return Boolean(value && typeof value === "object" && (value.url || value.storage_path));
    }

    function normalizeVehicleType(value) {
        const token = normalizeToken(value);
        if (["peaton", "sin_vehiculo", "a_pie"].includes(token)) return "peaton";
        return token;
    }

    function normalizeState(raw = {}) {
        const state = normalizeToken(raw.kyc?.estado ?? raw.estado ?? raw.status);
        if (["pendiente", "en_revision"].includes(state)) return TECHNICIAN_STATES.PENDING_REVIEW;
        return state || TECHNICIAN_STATES.DOCUMENTS_PENDING;
    }

    function legacyApprovalEvidence(raw = {}) {
        return raw.kyc?.aprobado === true ||
            raw.verificado === true ||
            Boolean(raw.aprobadoEn || raw.kyc?.aprobado_at);
    }

    function normalizeTechnicianProfile(raw = {}) {
        const state = normalizeState(raw);
        const vehicleType = normalizeVehicleType(
            raw.vehiculo?.tipo ?? raw.vehiculo_tipo ?? raw.logistica?.vehiculo
        );
        const pedestrian = vehicleType === "peaton";
        const canonicalCertificates = Array.isArray(raw.documentos?.certificados)
            ? raw.documentos.certificados.filter(isDocumentReference)
            : [];
        const legacyCertificate = raw.documentos?.certificado ?? raw.certificado;
        const approved = legacyApprovalEvidence(raw);
        const role = normalizeToken(raw.rol ?? raw.role) || "tecnico";

        return {
            ...raw,
            rol: role,
            estado: state,
            status: state,
            disponible: raw.disponible === true,
            suspendido: raw.suspendido === true || state === TECHNICIAN_STATES.SUSPENDED,
            foto_perfil: raw.foto_perfil ?? raw.fotoPerfil ?? raw.foto ?? null,
            skills: Array.isArray(raw.skills)
                ? [...new Set(raw.skills.map(normalizeSkillKey).filter(Boolean))]
                : [],
            vehiculo: {
                tipo: vehicleType,
                placas: pedestrian
                    ? ""
                    : text(raw.vehiculo?.placas ?? raw.placas ?? raw.logistica?.placas).toUpperCase()
            },
            documentos: {
                ine: raw.documentos?.ine ?? raw.ine ?? raw.ine_url ?? raw.identificacion ?? null,
                csf: raw.documentos?.csf ?? raw.csf ?? raw.csf_url ?? raw.constancia ?? null,
                licencia: raw.documentos?.licencia ?? raw.licencia ?? null,
                certificados: canonicalCertificates.length > 0
                    ? canonicalCertificates
                    : (isDocumentReference(legacyCertificate) ? [legacyCertificate] : [])
            },
            datos_bancarios: {
                banco: text(raw.datos_bancarios?.banco ?? raw.banco ?? raw.banco_nombre),
                clabe: text(raw.datos_bancarios?.clabe ?? raw.clabe ?? raw.clabe_interbancaria),
                titular: text(raw.datos_bancarios?.titular ?? raw.nombre)
            },
            kyc: {
                ...(raw.kyc || {}),
                estado: state,
                aprobado: approved
            },
            nivel: text(raw.nivel, "BRONCE").toUpperCase(),
            reputacion: Number.isFinite(Number(raw.reputacion)) ? Number(raw.reputacion) : 5,
            servicios_completados: Number.isFinite(Number(raw.servicios_completados))
                ? Number(raw.servicios_completados)
                : 0
        };
    }

    function technicianKycRequirements(raw = {}) {
        const profile = normalizeTechnicianProfile(raw);
        const pedestrian = profile.vehiculo.tipo === "peaton";
        const required = {
            foto_perfil: isDocumentReference(profile.foto_perfil),
            ine: isDocumentReference(profile.documentos.ine),
            csf: isDocumentReference(profile.documentos.csf),
            banco: Boolean(profile.datos_bancarios.banco),
            clabe: /^\d{18}$/.test(profile.datos_bancarios.clabe),
            vehiculo_tipo: Boolean(profile.vehiculo.tipo),
            placas: pedestrian || Boolean(profile.vehiculo.placas),
            licencia: pedestrian || isDocumentReference(profile.documentos.licencia)
        };
        const missing = Object.entries(required)
            .filter(([, complete]) => !complete)
            .map(([field]) => field);
        return {
            profile,
            pedestrian,
            required,
            missing,
            complete: missing.length === 0,
            certificatesOptional: true
        };
    }

    function technicianEligibility(raw = {}, options = {}) {
        const result = technicianKycRequirements(raw);
        const profile = result.profile;
        if (profile.rol !== "tecnico") return { ok: false, reason: "TECHNICIAN_ROLE_REQUIRED", profile };
        if (!result.complete) return { ok: false, reason: "KYC_INCOMPLETE", missing: result.missing, profile };
        if (profile.suspendido) return { ok: false, reason: "TECHNICIAN_SUSPENDED", profile };
        if (profile.estado !== TECHNICIAN_STATES.ACTIVE || profile.status !== TECHNICIAN_STATES.ACTIVE || profile.kyc.aprobado !== true) {
            return { ok: false, reason: "KYC_APPROVAL_REQUIRED", profile };
        }
        if (options.requireAvailable === true && profile.disponible !== true) {
            return { ok: false, reason: "TECHNICIAN_NOT_AVAILABLE", profile };
        }
        return { ok: true, reason: null, profile };
    }

    function normalizeCategoryKey(input = {}) {
        if (typeof input === "string") {
            const token = normalizeToken(input);
            return CATEGORY_ALIASES[token] || token;
        }
        const categoryId = normalizeToken(input.categoria_id ?? input.categoryId);
        if (categoryId) return CATEGORY_ALIASES[categoryId] || categoryId;
        const vertical = normalizeToken(input.vertical ?? input.categoria ?? input.category);
        const subService = normalizeToken(input.sub_servicio ?? input.subService);
        if (vertical && subService) return `${vertical}_${subService}`;
        const token = subService || vertical;
        return CATEGORY_ALIASES[token] || token;
    }

    function normalizeSkillKey(skill) {
        const token = normalizeToken(skill);
        return CATEGORY_ALIASES[token] || token;
    }

    function isSkillCompatible(profile = {}, service = {}) {
        const required = normalizeCategoryKey(service);
        if (!required || !required.includes("_")) return false;
        const skills = Array.isArray(profile.skills)
            ? profile.skills.map(normalizeSkillKey).filter(Boolean)
            : [];
        return skills.includes(required);
    }

    function hasBoolean(object, key) {
        return object && typeof object === "object" && typeof object[key] === "boolean";
    }

    function resolvePaymentPermissions(globalConfig = {}, customer = {}) {
        const individual = customer.pagos && typeof customer.pagos === "object" ? customer.pagos : {};
        const stripeAuthorized = hasBoolean(individual, "stripe_autorizado")
            ? individual.stripe_autorizado === true
            : false;
        const cashSource = hasBoolean(individual, "efectivo_autorizado")
            ? "canonical"
            : "legacy_fallback";
        const cashAuthorized = cashSource === "canonical"
            ? individual.efectivo_autorizado === true
            : customer.efectivo_autorizado === true;
        const stripeGlobal = globalConfig.stripe_activo === true;
        const cashGlobal = globalConfig.efectivo_activo === true;
        return {
            stripe: stripeGlobal && stripeAuthorized,
            efectivo: cashGlobal && cashAuthorized,
            global: { stripe: stripeGlobal, efectivo: cashGlobal },
            individual: {
                stripe_autorizado: stripeAuthorized,
                efectivo_autorizado: cashAuthorized,
                efectivo_source: cashSource
            },
            allowed: [
                ...(stripeGlobal && stripeAuthorized ? [PAYMENT_METHODS.STRIPE] : []),
                ...(cashGlobal && cashAuthorized ? [PAYMENT_METHODS.CASH] : [])
            ]
        };
    }

    function assertPaymentMethodAllowed(method, globalConfig = {}, customer = {}) {
        const normalized = normalizeToken(method);
        const permissions = resolvePaymentPermissions(globalConfig, customer);
        if (![PAYMENT_METHODS.STRIPE, PAYMENT_METHODS.CASH].includes(normalized)) {
            return { ok: false, reason: "PAYMENT_METHOD_INVALID", method: normalized, permissions };
        }
        if (!permissions.allowed.includes(normalized)) {
            return { ok: false, reason: "PAYMENT_METHOD_NOT_AUTHORIZED", method: normalized, permissions };
        }
        return { ok: true, reason: null, method: normalized, permissions };
    }

    function isServiceTransitionAllowed(from, to) {
        const current = normalizeToken(from);
        const next = normalizeToken(to);
        if (current === next) return true;
        return Boolean(SERVICE_TRANSITIONS[current]?.includes(next));
    }

    function shouldPublishMarketplace(service = {}) {
        if (normalizeToken(service.tipo) === "mantenimiento") return false;
        if (normalizeToken(service.metodo_pago) === PAYMENT_METHODS.B2B) return false;
        if (normalizeToken(service.estado) !== SERVICE_STATES.PENDING || text(service.tecnico_id)) return false;
        if (!normalizeDestination(service.destino)) return false;
        if (service.payment_authority?.effective !== true) return false;
        const method = normalizeToken(service.metodo_pago);
        if (method === PAYMENT_METHODS.CASH) return true;
        return method === PAYMENT_METHODS.STRIPE && Boolean(service.fecha_pago);
    }

    function buildMarketplaceListing(serviceId, service = {}, timestamp = null) {
        if (!shouldPublishMarketplace(service)) return null;
        return {
            service_id: text(serviceId),
            tipo: "b2c_discovery",
            estado: "disponible",
            categoria: normalizeToken(service.categoria) || "general",
            categoria_id: normalizeCategoryKey(service) || "general",
            sub_servicio: text(service.sub_servicio, "Servicio tecnico").slice(0, 120),
            zona: text(service.zona, "Cancun").slice(0, 100),
            urgencia: service.urgencia === true,
            es_privada: service.es_privada === true,
            metodo_pago: normalizeToken(service.metodo_pago),
            created_at: timestamp ?? service.created_at ?? null
        };
    }

    function marketplaceEventId(serviceId) {
        return `${EVENT_MARKETPLACE_SERVICE_AVAILABLE}_${text(serviceId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    }

    function technicianMigration(raw = {}) {
        const normalized = normalizeTechnicianProfile(raw);
        const requirements = technicianKycRequirements(raw);
        const legacyFields = TECHNICIAN_LEGACY_FIELDS.filter(field => Object.hasOwn(raw, field));
        const hasLegacyShape = legacyFields.length > 0 || Object.hasOwn(raw.documentos || {}, "certificado");
        const canonicalShape = Boolean(
            raw.vehiculo && raw.documentos && raw.datos_bancarios && raw.kyc && Array.isArray(raw.skills)
        );
        const approvalConflict = normalizeToken(raw.estado) === TECHNICIAN_STATES.ACTIVE && normalized.kyc.aprobado !== true;
        const classification = approvalConflict || normalizeToken(raw.rol ?? raw.role) !== "tecnico"
            ? "requires_review"
            : canonicalShape && !hasLegacyShape
                ? "canonical"
                : "auto_migratable";
        return {
            classification,
            legacyFields,
            reasons: [
                ...(hasLegacyShape ? ["LEGACY_FIELDS_PRESENT"] : []),
                ...(approvalConflict ? ["ACTIVE_WITHOUT_APPROVAL_EVIDENCE"] : []),
                ...(!requirements.complete ? [`KYC_MISSING:${requirements.missing.join(",")}`] : [])
            ],
            canonical: {
                rol: normalized.rol,
                estado: normalized.estado,
                status: normalized.status,
                kyc: normalized.kyc,
                skills: normalized.skills,
                vehiculo: normalized.vehiculo,
                documentos: normalized.documentos,
                datos_bancarios: normalized.datos_bancarios,
                disponible: normalized.disponible,
                nivel: normalized.nivel,
                reputacion: normalized.reputacion,
                servicios_completados: normalized.servicios_completados
            }
        };
    }

    function paymentMigration(customer = {}) {
        const individual = customer.pagos && typeof customer.pagos === "object" ? customer.pagos : {};
        const stripeKnown = hasBoolean(individual, "stripe_autorizado");
        const cashKnown = hasBoolean(individual, "efectivo_autorizado");
        return {
            classification: stripeKnown && cashKnown ? "canonical" : "requires_review",
            proposed: {
                stripe_autorizado: stripeKnown ? individual.stripe_autorizado : false,
                efectivo_autorizado: cashKnown
                    ? individual.efectivo_autorizado
                    : customer.efectivo_autorizado === true
            },
            reasons: [
                ...(!stripeKnown ? ["STRIPE_ADMIN_DECISION_REQUIRED"] : []),
                ...(!cashKnown && customer.efectivo_autorizado === true ? ["LEGACY_CASH_CAN_MIGRATE"] : []),
                ...(!cashKnown && customer.efectivo_autorizado !== true ? ["CASH_ADMIN_DECISION_REQUIRED"] : [])
            ]
        };
    }

    return Object.freeze({
        CONTRACT_VERSION,
        DESTINATION_SOURCES,
        EVENT_MARKETPLACE_SERVICE_AVAILABLE,
        PAYMENT_METHODS,
        SERVICE_STATES,
        SERVICE_TRANSITIONS,
        TECHNICIAN_LEGACY_FIELDS,
        TECHNICIAN_STATES,
        assertPaymentMethodAllowed,
        buildMarketplaceListing,
        isDocumentReference,
        isServiceTransitionAllowed,
        isSkillCompatible,
        marketplaceEventId,
        normalizeCategoryKey,
        normalizeCoordinates,
        normalizeDestination,
        normalizeSkillKey,
        normalizeTechnicianProfile,
        normalizeToken,
        paymentMigration,
        resolvePaymentPermissions,
        shouldPublishMarketplace,
        technicianEligibility,
        technicianKycRequirements,
        technicianMigration
    });
});
