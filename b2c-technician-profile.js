/**
 * Contrato canónico B2C del expediente técnico en users/{uid}.
 * Las lecturas legacy viven únicamente aquí durante la transición.
 */

export const TECHNICIAN_KYC_STATES = Object.freeze({
    REGISTRATION_STARTED: "registro_iniciado",
    DOCUMENTS_PENDING: "documentos_pendientes",
    DOCUMENTS_UPLOADED: "documentos_subidos",
    PENDING_REVIEW: "pendiente_revision",
    ACTIVE: "activo",
    REJECTED: "rechazado",
    SUSPENDED: "suspendido"
});

const LEGACY_PENDING_STATES = new Set(["pendiente", "registro_iniciado"]);

function text(value, fallback = "") {
    const normalized = String(value ?? "").trim();
    return normalized || fallback;
}

function list(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
}

function isDocumentReference(value) {
    if (typeof value === "string") return value.trim().length > 0;
    return Boolean(value && typeof value === "object" && (value.url || value.storage_path));
}

export function normalizeTechnicianProfile(raw = {}) {
    const vehicleType = text(
        raw.vehiculo?.tipo ?? raw.vehiculo_tipo ?? raw.logistica?.vehiculo
    ).toLowerCase();
    const pedestrian = vehicleType === "peaton" || vehicleType === "peatón";
    const certificates = list(raw.documentos?.certificados);
    const legacyCertificate = raw.documentos?.certificado ?? raw.certificado;
    const rawState = text(raw.kyc?.estado ?? raw.estado ?? raw.status, TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING);
    const state = LEGACY_PENDING_STATES.has(rawState)
        ? TECHNICIAN_KYC_STATES.PENDING_REVIEW
        : rawState;

    return {
        ...raw,
        rol: text(raw.rol, "tecnico"),
        estado: state,
        status: state,
        disponible: raw.disponible === true,
        suspendido: raw.suspendido === true || state === TECHNICIAN_KYC_STATES.SUSPENDED,
        foto_perfil: raw.foto_perfil ?? raw.fotoPerfil ?? raw.foto ?? null,
        vehiculo: {
            tipo: pedestrian ? "peaton" : vehicleType,
            placas: pedestrian
                ? ""
                : text(raw.vehiculo?.placas ?? raw.placas ?? raw.logistica?.placas).toUpperCase()
        },
        documentos: {
            ine: raw.documentos?.ine ?? raw.ine ?? raw.ine_url ?? raw.identificacion ?? null,
            csf: raw.documentos?.csf ?? raw.csf ?? raw.csf_url ?? raw.constancia ?? null,
            licencia: raw.documentos?.licencia ?? raw.licencia ?? null,
            certificados: certificates.length > 0
                ? certificates
                : (isDocumentReference(legacyCertificate) ? [legacyCertificate] : []),
            fecha_subida: raw.documentos?.fecha_subida ?? null,
            fecha_actualizacion: raw.documentos?.fecha_actualizacion ?? null
        },
        datos_bancarios: {
            banco: text(raw.datos_bancarios?.banco ?? raw.banco ?? raw.banco_nombre),
            clabe: text(raw.datos_bancarios?.clabe ?? raw.clabe ?? raw.clabe_interbancaria),
            titular: text(raw.datos_bancarios?.titular ?? raw.nombre)
        },
        kyc: {
            ...(raw.kyc || {}),
            estado: state,
            aprobado: raw.kyc?.aprobado === true || raw.verificado === true || state === TECHNICIAN_KYC_STATES.ACTIVE
        }
    };
}

export function getTechnicianKycRequirements(raw = {}) {
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

export function createTechnicianRegistrationProfile({ uid, email, nombre, provider = "password" } = {}) {
    const safeEmail = text(email).toLowerCase();
    return {
        uid: text(uid),
        email: safeEmail,
        rol: "tecnico",
        sub_type: "marketplace",
        tipo_cuenta: "B2C",
        nombre: text(nombre, "Usuario Nuevo"),
        estado: TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING,
        status: TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING,
        disponible: false,
        suspendido: false,
        kyc: {
            estado: TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING,
            aprobado: false,
            provider,
            intentos_upload: 0,
            faltantes: ["foto_perfil", "ine", "csf", "banco", "clabe", "vehiculo_tipo"]
        },
        vehiculo: { tipo: "", placas: "" },
        documentos: { ine: null, csf: null, licencia: null, certificados: [] },
        datos_bancarios: { banco: "", clabe: "", titular: text(nombre, "Usuario Nuevo") },
        skills: [],
        nivel: "BRONCE",
        reputacion: 5,
        servicios_completados: 0,
        wallet: 0,
        currency: "MXN"
    };
}

export function buildTechnicianReviewPatch(raw = {}) {
    const result = getTechnicianKycRequirements(raw);
    const state = result.complete
        ? TECHNICIAN_KYC_STATES.PENDING_REVIEW
        : TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING;
    return {
        estado: state,
        status: state,
        disponible: false,
        "kyc.estado": state,
        "kyc.aprobado": false,
        "kyc.faltantes": result.missing
    };
}

export function assertTechnicianCanOperate(raw = {}) {
    const { profile, complete } = getTechnicianKycRequirements(raw);
    if (profile.rol !== "tecnico") return { ok: false, reason: "TECHNICIAN_ROLE_REQUIRED" };
    if (!complete) return { ok: false, reason: "KYC_INCOMPLETE" };
    if (profile.suspendido) return { ok: false, reason: "TECHNICIAN_SUSPENDED" };
    if (profile.estado !== TECHNICIAN_KYC_STATES.ACTIVE || profile.kyc.aprobado !== true) {
        return { ok: false, reason: "KYC_APPROVAL_REQUIRED" };
    }
    return { ok: true, profile };
}

export function storagePathForTechnicianDocument(uid, kind, fileName = "document") {
    const safeUid = text(uid).replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeKind = text(kind, "document").replace(/[^a-zA-Z0-9_-]/g, "_");
    const extension = text(fileName).toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] || "";
    if (!safeUid) throw new Error("TECHNICIAN_UID_REQUIRED");
    return `expedientes/${safeUid}/${safeKind}/current${extension}`;
}
