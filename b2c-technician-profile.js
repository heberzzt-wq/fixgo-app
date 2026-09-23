/**
 * Adaptador browser del contrato canónico de plataforma B2C.
 * La semántica vive exclusivamente en gestia-core/contracts/b2c-platform-contract.js.
 */

import "./gestia-core/contracts/b2c-platform-contract.js";

const contract = globalThis.GestiaB2CPlatformContract;
if (!contract) throw new Error("B2C_PLATFORM_CONTRACT_UNAVAILABLE");

export const TECHNICIAN_KYC_STATES = contract.TECHNICIAN_STATES;
export const TECHNICIAN_IDENTITY_VERSION = "b2c-bank-identity-v1";
export const MEXICAN_CLABE_VERSION = contract.MEXICAN_CLABE_VERSION;
export const inspectMexicanClabe = contract.inspectMexicanClabe;
export const normalizeMexicanClabe = contract.normalizeMexicanClabe;
export const calculateMexicanClabeCheckDigit = contract.calculateMexicanClabeCheckDigit;

function text(value, fallback = "") {
    const normalized = String(value ?? "").trim();
    return normalized || fallback;
}

export const normalizeTechnicianProfile = contract.normalizeTechnicianProfile;
export const getTechnicianKycRequirements = contract.technicianKycRequirements;
export const normalizeTechnicianSkill = contract.normalizeSkillKey;
export const normalizeServiceCategory = contract.normalizeCategoryKey;
export const isTechnicianSkillCompatible = contract.isSkillCompatible;

export function dispatchMarketplaceEventForTechnician(profile, listing, dispatch) {
    if (!isTechnicianSkillCompatible(profile, listing)) return false;
    if (typeof dispatch !== "function") throw new Error("MARKETPLACE_EVENT_DISPATCH_REQUIRED");
    dispatch();
    return true;
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
            identity_required: true,
            identity_verified: false,
            identity_version: TECHNICIAN_IDENTITY_VERSION,
            faltantes: ["foto_perfil", "ine", "ine_reverso", "csf", "banco", "clabe", "vehiculo_tipo"]
        },
        vehiculo: { tipo: "", placas: "" },
        documentos: { ine: null, ine_reverso: null, selfie_liveness_left: null, selfie_liveness_right: null, csf: null, licencia: null, certificados: [] },
        datos_bancarios: {
            banco: "",
            clabe: "",
            titular: text(nombre, "Usuario Nuevo"),
            banking_version: MEXICAN_CLABE_VERSION,
            institucion_clave: "",
            institucion_key: "",
            institucion_nombre: "",
            catalog_source: contract.MEXICAN_CLABE_CATALOG_SOURCE
        },
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

export function assertTechnicianCanOperate(raw = {}, options = {}) {
    return contract.technicianEligibility(raw, options);
}

export function storagePathForTechnicianDocument(uid, kind, fileName = "document") {
    const safeUid = text(uid).replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeKind = text(kind, "document").replace(/[^a-zA-Z0-9_-]/g, "_");
    const extension = text(fileName).toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] || "";
    if (!safeUid) throw new Error("TECHNICIAN_UID_REQUIRED");
    return `expedientes/${safeUid}/${safeKind}/current${extension}`;
}
