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

    const CONTRACT_VERSION = "b2c-platform-contract-v2";
    const EVENT_MARKETPLACE_SERVICE_AVAILABLE = "marketplace_service_available";
    const B2C_SKILL_VERTICALS = Object.freeze(["fix", "road", "tech"]);
    const B2C_PROVIDER_PROFILE_VERSION = "b2c-provider-v1";
    const B2C_PROVIDER_MAX_MEMBERS = 20;
    const B2C_PROVIDER_MODES = Object.freeze({
        INDEPENDENT: "independiente",
        CREW: "cuadrilla",
        CONTRACTOR: "contratista",
        COMPANY: "empresa"
    });
    const SERVICE_VERTICAL_LABELS = Object.freeze({
        road: "ROAD (Auxilio Vial)",
        fix: "FIX (Hogar)",
        maint: "MAINT (B2B)",
        tech: "TECH (Sistemas)"
    });
    const SERVICE_CATALOG = Object.freeze({
        road: Object.freeze([
            Object.freeze({ id: "road_llanta", label: "Llantera Móvil", icon: "fa-car-crash" }),
            Object.freeze({ id: "road_cerrajero", label: "Cerrajería", icon: "fa-key" }),
            Object.freeze({ id: "road_grua", label: "Grúas", icon: "fa-truck-pickup" }),
            Object.freeze({ id: "road_mecanico", label: "Mecánico Gral.", icon: "fa-wrench" }),
            Object.freeze({ id: "road_corriente", label: "Paso Corriente", icon: "fa-car-battery" })
        ]),
        fix: Object.freeze([
            Object.freeze({ id: "fix_electricidad", label: "Electricidad", icon: "fa-plug" }),
            Object.freeze({ id: "fix_plomeria", label: "Plomería", icon: "fa-faucet" }),
            Object.freeze({ id: "fix_ac", label: "Aires Acondicionad.", icon: "fa-snowflake" }),
            Object.freeze({ id: "fix_jardin", label: "Jardinería", icon: "fa-leaf" }),
            Object.freeze({ id: "fix_pintura", label: "Pintura", icon: "fa-paint-roller" }),
            Object.freeze({ id: "fix_alberca", label: "Albercas", icon: "fa-swimming-pool" }),
            Object.freeze({ id: "fix_fumigacion", label: "Fumigación", icon: "fa-bug" })
        ]),
        maint: Object.freeze([
            Object.freeze({ id: "maint_general", label: "Mantenimiento Gral.", icon: "fa-building" })
        ]),
        tech: Object.freeze([
            Object.freeze({ id: "tech_cctv", label: "CCTV", icon: "fa-video" }),
            Object.freeze({ id: "tech_alarma", label: "Alarmas", icon: "fa-bell" }),
            Object.freeze({ id: "tech_acceso", label: "Accesos", icon: "fa-id-card" }),
            Object.freeze({ id: "tech_elevador", label: "Elevadores", icon: "fa-elevator" }),
            Object.freeze({ id: "tech_planta", label: "Plantas Eléc.", icon: "fa-charging-station" }),
            Object.freeze({ id: "tech_solar", label: "Paneles Solares", icon: "fa-solar-panel" })
        ])
    });

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

    const MEXICAN_CLABE_VERSION = "mx-clabe-v1";
    const MEXICAN_PAYOUT_DESTINATION_VERSION = "mx-payout-destination-v1";
    const MEXICAN_CLABE_CATALOG_SOURCE = "BANXICO_CEP_SCL_2026-09-22";
    const CLABE_INSTITUTIONS = Object.freeze({
        "001": Object.freeze({ key: "2001", name: "BANXICO" }),
        "002": Object.freeze({ key: "40002", name: "BANAMEX" }),
        "006": Object.freeze({ key: "37006", name: "BANCOMEXT" }),
        "009": Object.freeze({ key: "37009", name: "BANOBRAS" }),
        "012": Object.freeze({ key: "40012", name: "BBVA MEXICO" }),
        "014": Object.freeze({ key: "40014", name: "SANTANDER" }),
        "019": Object.freeze({ key: "37019", name: "BANJERCITO" }),
        "021": Object.freeze({ key: "40021", name: "HSBC" }),
        "030": Object.freeze({ key: "40030", name: "BAJIO" }),
        "036": Object.freeze({ key: "40036", name: "INBURSA" }),
        "042": Object.freeze({ key: "40042", name: "MIFEL" }),
        "044": Object.freeze({ key: "40044", name: "SCOTIABANK" }),
        "058": Object.freeze({ key: "40058", name: "BANREGIO" }),
        "059": Object.freeze({ key: "40059", name: "INVEX" }),
        "060": Object.freeze({ key: "40060", name: "BANSI" }),
        "062": Object.freeze({ key: "40062", name: "AFIRME" }),
        "072": Object.freeze({ key: "40072", name: "BANORTE" }),
        "106": Object.freeze({ key: "40106", name: "BANK OF AMERICA" }),
        "108": Object.freeze({ key: "40108", name: "MUFG" }),
        "110": Object.freeze({ key: "40110", name: "JP MORGAN" }),
        "112": Object.freeze({ key: "40112", name: "BMONEX" }),
        "113": Object.freeze({ key: "40113", name: "VE POR MAS" }),
        "124": Object.freeze({ key: "40124", name: "CITI MEXICO" }),
        "127": Object.freeze({ key: "40127", name: "AZTECA" }),
        "128": Object.freeze({ key: "40128", name: "KAPITAL" }),
        "129": Object.freeze({ key: "40129", name: "BARCLAYS" }),
        "130": Object.freeze({ key: "40130", name: "COMPARTAMOS" }),
        "132": Object.freeze({ key: "40132", name: "MULTIVA BANCO" }),
        "133": Object.freeze({ key: "40133", name: "ACTINVER" }),
        "135": Object.freeze({ key: "37135", name: "NAFIN" }),
        "136": Object.freeze({ key: "40136", name: "INTERCAM BANCO" }),
        "137": Object.freeze({ key: "40137", name: "BANCOPPEL" }),
        "138": Object.freeze({ key: "40138", name: "UALA" }),
        "140": Object.freeze({ key: "40140", name: "CONSUBANCO" }),
        "141": Object.freeze({ key: "40141", name: "VOLKSWAGEN" }),
        "145": Object.freeze({ key: "40145", name: "BBASE" }),
        "147": Object.freeze({ key: "40147", name: "BANKAOOL" }),
        "148": Object.freeze({ key: "40148", name: "PAGATODO" }),
        "150": Object.freeze({ key: "40150", name: "INMOBILIARIO" }),
        "151": Object.freeze({ key: "40151", name: "DONDE" }),
        "152": Object.freeze({ key: "40152", name: "BANCREA" }),
        "154": Object.freeze({ key: "40154", name: "BANCO COVALTO" }),
        "155": Object.freeze({ key: "40155", name: "ICBC" }),
        "156": Object.freeze({ key: "40156", name: "SABADELL" }),
        "157": Object.freeze({ key: "40157", name: "SHINHAN" }),
        "158": Object.freeze({ key: "40158", name: "MIZUHO BANK" }),
        "159": Object.freeze({ key: "40159", name: "BANK OF CHINA" }),
        "160": Object.freeze({ key: "40160", name: "BANCO S3" }),
        "166": Object.freeze({ key: "37166", name: "BaBien" }),
        "167": Object.freeze({ key: "40167", name: "HEY BANCO" }),
        "168": Object.freeze({ key: "37168", name: "HIPOTECARIA FED" }),
        "170": Object.freeze({ key: "40170", name: "REVOLUT BANK" }),
        "600": Object.freeze({ key: "90600", name: "MONEXCB" }),
        "601": Object.freeze({ key: "90601", name: "GBM" }),
        "602": Object.freeze({ key: "90602", name: "MASARI" }),
        "605": Object.freeze({ key: "90605", name: "VALUE" }),
        "616": Object.freeze({ key: "90616", name: "FINAMEX" }),
        "617": Object.freeze({ key: "90617", name: "VALMEX" }),
        "620": Object.freeze({ key: "90620", name: "PROFUTURO" }),
        "631": Object.freeze({ key: "90631", name: "TRF" }),
        "634": Object.freeze({ key: "90634", name: "FINCOMUN" }),
        "638": Object.freeze({ key: "40638", name: "NUBANK" }),
        "646": Object.freeze({ key: "90646", name: "STP" }),
        "652": Object.freeze({ key: "90652", name: "CREDICAPITAL" }),
        "653": Object.freeze({ key: "90653", name: "KUSPIT" }),
        "656": Object.freeze({ key: "90656", name: "UNAGRA" }),
        "659": Object.freeze({ key: "90659", name: "ASP INTEGRA OPC" }),
        "660": Object.freeze({ key: "90660", name: "Altor" }),
        "661": Object.freeze({ key: "90661", name: "KLAR" }),
        "670": Object.freeze({ key: "90670", name: "LIBERTAD" }),
        "677": Object.freeze({ key: "90677", name: "CAJA POP MEXICA" }),
        "680": Object.freeze({ key: "90680", name: "CRISTOBAL COLON" }),
        "683": Object.freeze({ key: "90683", name: "CAJA TELEFONIST" }),
        "684": Object.freeze({ key: "90684", name: "TRANSFER" }),
        "685": Object.freeze({ key: "90685", name: "FONDO (FIRA)" }),
        "688": Object.freeze({ key: "90688", name: "CREDICLUB" }),
        "699": Object.freeze({ key: "90699", name: "FONDEADORA" }),
        "703": Object.freeze({ key: "90703", name: "TESORED" }),
        "706": Object.freeze({ key: "90706", name: "ARCUS FI" }),
        "710": Object.freeze({ key: "90710", name: "NVIO" }),
        "714": Object.freeze({ key: "90714", name: "PPBALANCEMX" }),
        "715": Object.freeze({ key: "90715", name: "CASHI CUENTA" }),
        "720": Object.freeze({ key: "90720", name: "MexPago" }),
        "721": Object.freeze({ key: "90721", name: "albo" }),
        "722": Object.freeze({ key: "90722", name: "Mercado Pago W" }),
        "723": Object.freeze({ key: "90723", name: "Cuenca" }),
        "725": Object.freeze({ key: "90725", name: "COOPDESARROLLO" }),
        "727": Object.freeze({ key: "90727", name: "TRANSFER DIRECT" }),
        "728": Object.freeze({ key: "90728", name: "SPIN BY OXXO" }),
        "729": Object.freeze({ key: "90729", name: "Dep y Pag Dig" }),
        "730": Object.freeze({ key: "90730", name: "Clip" }),
        "732": Object.freeze({ key: "90732", name: "Peibo" }),
        "734": Object.freeze({ key: "90734", name: "FINCO PAY" }),
        "738": Object.freeze({ key: "90738", name: "FINTOC" }),
        "901": Object.freeze({ key: "90901", name: "CLS" }),
        "902": Object.freeze({ key: "90902", name: "INDEVAL" }),
        "903": Object.freeze({ key: "90903", name: "CoDi Valida" })
    });

    function normalizeMexicanClabe(value) {
        return String(value ?? "").replace(/\s+/g, "");
    }

    function calculateMexicanClabeCheckDigit(first17) {
        const digits = normalizeMexicanClabe(first17);
        if (!/^\d{17}$/.test(digits)) return null;
        const weights = [3, 7, 1];
        let sum = 0;
        for (let index = 0; index < 17; index += 1) {
            sum += (Number(digits[index]) * weights[index % 3]) % 10;
        }
        return (10 - (sum % 10)) % 10;
    }

    function inspectMexicanClabe(value) {
        const digits = normalizeMexicanClabe(value);
        const formatValid = /^\d{18}$/.test(digits);
        const institutionCode = digits.slice(0, 3);
        const institution = CLABE_INSTITUTIONS[institutionCode] || null;
        const expectedCheckDigit = /^\d{17}/.test(digits)
            ? calculateMexicanClabeCheckDigit(digits.slice(0, 17))
            : null;
        const actualCheckDigit = formatValid ? Number(digits[17]) : null;
        const checksumValid = formatValid && expectedCheckDigit === actualCheckDigit;
        return Object.freeze({
            digits,
            masked: formatValid ? `${digits.slice(0, 3)} ••• •••••••${digits.slice(-4)}` : "",
            formatValid,
            checksumValid,
            valid: formatValid && checksumValid && Boolean(institution),
            institutionCode,
            institutionKey: institution?.key || null,
            institutionName: institution?.name || null,
            catalogSource: MEXICAN_CLABE_CATALOG_SOURCE,
            expectedCheckDigit,
            actualCheckDigit
        });
    }

    function normalizeMexicanPayoutDestination(value) {
        return String(value ?? "").replace(/\D+/g, "").slice(0, 20);
    }

    function validLuhn(value) {
        const digits = normalizeMexicanPayoutDestination(value);
        if (!/^\d{16}$/.test(digits)) return false;
        let sum = 0;
        let doubleDigit = false;
        for (let index = digits.length - 1; index >= 0; index -= 1) {
            let digit = Number(digits[index]);
            if (doubleDigit) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
            doubleDigit = !doubleDigit;
        }
        return sum % 10 === 0;
    }

    function payoutDestinationType(value, typeHint = "auto") {
        const digits = normalizeMexicanPayoutDestination(value);
        const hint = normalizeToken(typeHint || "auto");
        if (["clabe", "cuenta", "tarjeta", "celular"].includes(hint)) return hint;
        if (digits.length === 18) return "clabe";
        if (digits.length === 16) return "tarjeta";
        if (digits.length === 10) return "celular";
        if (digits.length >= 6 && digits.length <= 20) return "cuenta";
        return "desconocido";
    }

    function inspectMexicanPayoutDestination(value, { typeHint = "auto", bankName = "" } = {}) {
        const digits = normalizeMexicanPayoutDestination(value);
        const type = payoutDestinationType(digits, typeHint);
        const manualBank = text(bankName);
        const clabe = type === "clabe" ? inspectMexicanClabe(digits) : null;
        const institutionName = clabe?.institutionName || manualBank || null;
        const autoBankResolved = Boolean(clabe?.institutionName);
        let formatValid = false;
        let checksumValid = true;

        if (type === "clabe") {
            formatValid = clabe?.formatValid === true;
            checksumValid = clabe?.checksumValid === true;
        } else if (type === "tarjeta") {
            formatValid = /^\d{16}$/.test(digits);
            checksumValid = validLuhn(digits);
        } else if (type === "celular") {
            formatValid = /^\d{10}$/.test(digits);
        } else if (type === "cuenta") {
            formatValid = /^\d{6,20}$/.test(digits);
        }

        const bankRequired = !autoBankResolved;
        const valid = formatValid && checksumValid && (autoBankResolved || Boolean(manualBank));
        return Object.freeze({
            version: MEXICAN_PAYOUT_DESTINATION_VERSION,
            digits,
            type,
            masked: digits ? (digits.length <= 6 ? digits : `${digits.slice(0, 3)} •••• ${digits.slice(-4)}`) : "",
            formatValid,
            checksumValid,
            valid,
            bankRequired,
            autoBankResolved,
            institutionName,
            institutionCode: clabe?.institutionCode || null,
            institutionKey: clabe?.institutionKey || null,
            catalogSource: clabe?.catalogSource || null
        });
    }


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
        const state = normalizeToken(raw.estado ?? raw.status ?? raw.kyc?.estado);
        if (["pendiente", "en_revision"].includes(state)) return TECHNICIAN_STATES.PENDING_REVIEW;
        return state || TECHNICIAN_STATES.DOCUMENTS_PENDING;
    }

    function normalizeB2cProviderProfile(raw = {}) {
        const source = raw.provider_profile && typeof raw.provider_profile === "object"
            ? raw.provider_profile
            : {};
        const allowedModes = new Set(Object.values(B2C_PROVIDER_MODES));
        const requestedMode = normalizeToken(
            source.mode ??
            raw.provider_mode ??
            raw.modalidad_proveedor ??
            B2C_PROVIDER_MODES.INDEPENDENT
        );
        const mode = allowedModes.has(requestedMode)
            ? requestedMode
            : B2C_PROVIDER_MODES.INDEPENDENT;
        const responsibleUid = text(source.responsible_uid ?? raw.uid);
        const rawDisplayName = text(
            source.display_name ??
            source.nombre_comercial ??
            raw.nombre_comercial ??
            raw.nombre
        );
        const displayName = rawDisplayName || (mode === B2C_PROVIDER_MODES.INDEPENDENT
            ? "Profesional independiente"
            : "Proveedor B2C");
        const rawPlannedCount = Number(
            source.planned_member_count ??
            source.tamano_planeado ??
            source.team_size ??
            (mode === B2C_PROVIDER_MODES.INDEPENDENT ? 1 : 2)
        );
        const plannedMemberCount = mode === B2C_PROVIDER_MODES.INDEPENDENT
            ? 1
            : Math.min(
                B2C_PROVIDER_MAX_MEMBERS,
                Math.max(2, Number.isFinite(rawPlannedCount) ? Math.trunc(rawPlannedCount) : 2)
            );
        const rawActiveCount = Number(source.active_member_count ?? 0);
        const activeMemberCount = Math.min(
            B2C_PROVIDER_MAX_MEMBERS - 1,
            Math.max(0, Number.isFinite(rawActiveCount) ? Math.trunc(rawActiveCount) : 0)
        );
        return Object.freeze({
            version: B2C_PROVIDER_PROFILE_VERSION,
            mode,
            display_name: displayName,
            responsible_uid: responsibleUid,
            planned_member_count: plannedMemberCount,
            max_member_count: B2C_PROVIDER_MAX_MEMBERS,
            active_member_count: activeMemberCount,
            crew_enabled: mode !== B2C_PROVIDER_MODES.INDEPENDENT,
            verification_status: text(source.verification_status) ||
                (raw.kyc?.aprobado === true ? "responsible_verified" : "responsible_pending_admin")
        });
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
        // Legacy flags remain readable for audit, never an approval authority.
        const approved = raw.kyc?.aprobado === true;
        const role = normalizeToken(raw.rol ?? raw.role);
        const providerProfile = normalizeB2cProviderProfile(raw);

        return {
            ...raw,
            rol: role,
            estado: state,
            status: raw.status ? normalizeState({ estado: raw.status }) : state,
            disponible: raw.disponible === true,
            suspendido: raw.suspendido === true || state === TECHNICIAN_STATES.SUSPENDED,
            foto_perfil: raw.foto_perfil ?? raw.fotoPerfil ?? raw.foto ?? null,
            provider_profile: providerProfile,
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
                ine_reverso: raw.documentos?.ine_reverso ?? null,
                selfie_liveness_left: raw.documentos?.selfie_liveness_left ?? null,
                selfie_liveness_right: raw.documentos?.selfie_liveness_right ?? null,
                csf: raw.documentos?.csf ?? raw.csf ?? raw.csf_url ?? raw.constancia ?? null,
                licencia: raw.documentos?.licencia ?? raw.licencia ?? null,
                certificados: canonicalCertificates.length > 0
                    ? canonicalCertificates
                    : (isDocumentReference(legacyCertificate) ? [legacyCertificate] : [])
            },
            datos_bancarios: {
                banco: text(raw.datos_bancarios?.banco ?? raw.banco ?? raw.banco_nombre),
                clabe: normalizeMexicanClabe(raw.datos_bancarios?.clabe ?? raw.clabe ?? raw.clabe_interbancaria),
                destino_tipo: normalizeToken(raw.datos_bancarios?.destino_tipo || (raw.datos_bancarios?.clabe ? "clabe" : "")),
                destino: normalizeMexicanPayoutDestination(raw.datos_bancarios?.destino ?? raw.datos_bancarios?.clabe ?? raw.clabe ?? raw.clabe_interbancaria),
                destino_confirmado: raw.datos_bancarios?.destino_confirmado === true ||
                    (!raw.datos_bancarios?.payout_version && Boolean(raw.datos_bancarios?.clabe ?? raw.clabe ?? raw.clabe_interbancaria)),
                titular: text(raw.datos_bancarios?.titular ?? raw.nombre),
                banking_version: text(raw.datos_bancarios?.banking_version),
                payout_version: text(raw.datos_bancarios?.payout_version),
                banco_resolucion: normalizeToken(raw.datos_bancarios?.banco_resolucion),
                institucion_clave: text(raw.datos_bancarios?.institucion_clave),
                institucion_key: text(raw.datos_bancarios?.institucion_key),
                institucion_nombre: text(raw.datos_bancarios?.institucion_nombre),
                catalog_source: text(raw.datos_bancarios?.catalog_source)
            },
            kyc: {
                ...(raw.kyc || {}),
                estado: raw.kyc?.estado ? normalizeState({ estado: raw.kyc.estado }) : state,
                aprobado: approved
            },
            nivel: text(raw.nivel, "BRONCE").toUpperCase(),
            reputacion: Number.isFinite(Number(raw.reputacion)) ? Number(raw.reputacion) : 5,
            servicios_completados: Number.isFinite(Number(raw.servicios_completados))
                ? Number(raw.servicios_completados)
                : 0
        };
    }

    // Building personnel use the same expediente and states, without marketplace vehicle/payroll requirements.
    function personnelKycRequirements(raw = {}) {
        const required = {
            foto_perfil: isDocumentReference(raw.foto_perfil),
            ine: isDocumentReference(raw.documentos?.ine)
        };
        const missing = Object.keys(required).filter(key => !required[key]);
        return { required, missing, complete: missing.length === 0 };
    }

    function technicianKycRequirements(raw = {}) {
        const profile = normalizeTechnicianProfile(raw);
        const pedestrian = profile.vehiculo.tipo === "peaton";
        const identityRequired = profile.kyc?.identity_required === true;
        const clabeInspection = inspectMexicanClabe(profile.datos_bancarios.clabe);
        const payoutInspection = inspectMexicanPayoutDestination(
            profile.datos_bancarios.destino || profile.datos_bancarios.clabe,
            { typeHint: profile.datos_bancarios.destino_tipo || "auto", bankName: profile.datos_bancarios.banco }
        );
        const modernPayout =
            profile.datos_bancarios.payout_version === MEXICAN_PAYOUT_DESTINATION_VERSION;
        const legacySmartBanking =
            profile.datos_bancarios.banking_version === MEXICAN_CLABE_VERSION;
        const smartBanking = modernPayout || legacySmartBanking;
        const legacySmartMatches =
            clabeInspection.valid &&
            profile.datos_bancarios.banco === clabeInspection.institutionName &&
            profile.datos_bancarios.institucion_clave === clabeInspection.institutionCode &&
            profile.datos_bancarios.institucion_key === clabeInspection.institutionKey;
        const smartBankMatches = !smartBanking || (
            modernPayout
                ? (
                    payoutInspection.valid &&
                    profile.datos_bancarios.destino_confirmado === true &&
                    Boolean(profile.datos_bancarios.banco)
                )
                : legacySmartMatches
        );
        const required = {
            foto_perfil: isDocumentReference(profile.foto_perfil),
            ine: isDocumentReference(profile.documentos.ine),
            ...(identityRequired ? {
                ine_reverso: isDocumentReference(profile.documentos.ine_reverso)
            } : {}),
            csf: isDocumentReference(profile.documentos.csf),
            banco: smartBanking ? smartBankMatches : Boolean(profile.datos_bancarios.banco),
            clabe: smartBanking ? smartBankMatches : /^\d{18}$/.test(profile.datos_bancarios.clabe),
            destino_retiro: smartBanking ? smartBankMatches : /^\d{18}$/.test(profile.datos_bancarios.clabe),
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
            identityRequired,
            identityVerified: profile.kyc?.identity_verified === true,
            bankingVersion: profile.datos_bancarios.banking_version || null,
            bankingInspection: clabeInspection,
            payoutInspection,
            smartBanking,
            certificatesOptional: true
        };
    }

    function technicianEligibility(raw = {}, options = {}) {
        const result = technicianKycRequirements(raw);
        const profile = result.profile;
        if (profile.rol !== "tecnico") return { ok: false, reason: "TECHNICIAN_ROLE_REQUIRED", profile };
        if (!result.complete) return { ok: false, reason: "KYC_INCOMPLETE", missing: result.missing, profile };
        if (profile.kyc?.identity_required === true && profile.kyc?.identity_verified !== true) {
            return { ok: false, reason: "IDENTITY_VERIFICATION_REQUIRED", profile };
        }
        if (profile.suspendido) return { ok: false, reason: "TECHNICIAN_SUSPENDED", profile };
        if (new Set([profile.estado, profile.status, profile.kyc.estado]).size !== 1) return { ok: false, reason: "TECHNICIAN_STATE_CONFLICT", profile };
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

    function getServiceDefinition(input) {
        const categoryId = normalizeCategoryKey(input);
        for (const [vertical, services] of Object.entries(SERVICE_CATALOG)) {
            const service = services.find(item => item.id === categoryId);
            if (service) return { ...service, vertical };
        }
        return null;
    }

    function isServiceCategoryEnabled(input, catalogConfig = {}) {
        const definition = getServiceDefinition(input);
        return Boolean(definition && catalogConfig?.[definition.id] === true);
    }

    function isB2BAccountProfile(profile = {}) {
        const accountType = normalizeToken(profile.tipo_cuenta ?? profile.account_type);
        const role = normalizeToken(profile.rol ?? profile.role);
        const subType = normalizeToken(profile.sub_type ?? profile.subtype);
        return profile.b2b_activo === true ||
            accountType === "b2b" ||
            ["admin_b2b", "b2b_admin", "asistente_admin", "inquilino_b2b", "tecnico_interno"].includes(role) ||
            ["saas", "tecnico_planta", "tecnico_interno"].includes(subType);
    }

    function serviceAudience(input) {
        const definition = getServiceDefinition(input);
        if (!definition) return null;
        return definition.vertical === "maint" ? "b2b" : "b2c";
    }

    function isServiceAllowedForCustomer(input, customer = {}) {
        const audience = serviceAudience(input);
        if (!audience) return false;
        return isB2BAccountProfile(customer) ? audience === "b2b" : audience === "b2c";
    }

    function isSkillCompatible(profile = {}, service = {}) {
        const definition = getServiceDefinition(service);
        if (!definition || definition.vertical === "maint") return false;
        const required = definition.id;
        const skills = Array.isArray(profile.skills)
            ? profile.skills.map(normalizeSkillKey).filter(Boolean)
            : [];
        return skills.some(skill =>
            skill === required ||
            (B2C_SKILL_VERTICALS.includes(skill) && required.startsWith(`${skill}_`))
        );
    }

    function technicianProvidesServiceCoverage(raw = {}, service = {}) {
        const audience = serviceAudience(service);
        if (!audience) return false;

        if (audience === "b2b") {
            if (!isB2BAccountProfile(raw)) return false;
            const role = normalizeToken(raw.rol ?? raw.role);
            const state = normalizeToken(raw.estado ?? raw.status);
            const suspended = raw.suspendido === true || ["suspendido", "suspendido_grave", "baneado_permanente"].includes(state);
            return ["tecnico", "tecnico_interno"].includes(role) && state === "activo" && !suspended;
        }

        if (isB2BAccountProfile(raw)) return false;
        const eligibility = technicianEligibility(raw, { requireAvailable: false });
        return eligibility.ok && isSkillCompatible(eligibility.profile, service);
    }

    function serviceCoverageCount(service, profiles = []) {
        if (!Array.isArray(profiles) || !getServiceDefinition(service)) return 0;
        return profiles.reduce(
            (count, profile) => count + (technicianProvidesServiceCoverage(profile, service) ? 1 : 0),
            0
        );
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
        if (serviceAudience(service) !== "b2c") return false;
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

    function marketplaceEventId(serviceId, revision = 0) {
        const safeRevision = Math.max(0, Math.trunc(Number(revision) || 0));
        const suffix = safeRevision > 0 ? `_r${safeRevision}` : "";
        return `${EVENT_MARKETPLACE_SERVICE_AVAILABLE}_${text(serviceId).replace(/[^a-zA-Z0-9_-]/g, "_")}${suffix}`;
    }

    function technicianMigration(raw = {}) {
        const normalized = normalizeTechnicianProfile(raw);
        const requirements = technicianKycRequirements(raw);
        const legacyFields = TECHNICIAN_LEGACY_FIELDS.filter(field => Object.hasOwn(raw, field));
        const hasLegacyShape = legacyFields.length > 0 || Object.hasOwn(raw.documentos || {}, "certificado");
        const canonicalShape = Boolean(
            raw.vehiculo && raw.documentos && raw.datos_bancarios && raw.kyc && Array.isArray(raw.skills)
        );
        const approvalConflict = normalized.estado === TECHNICIAN_STATES.ACTIVE && raw.kyc?.aprobado !== true;
        const stateConflict = new Set([normalized.estado, normalized.status, normalized.kyc.estado]).size !== 1;
        const legacyApproval = legacyApprovalEvidence(raw) && raw.kyc?.aprobado !== true;
        const wrongAccount = isB2BAccountProfile(raw) || normalizeToken(raw.tipo_cuenta) !== 'b2c';
        const roleConflict = raw.rol && raw.role && normalizeToken(raw.rol) !== normalizeToken(raw.role);
        const classification = approvalConflict || stateConflict || legacyApproval || wrongAccount || roleConflict || normalizeToken(raw.rol ?? raw.role) !== "tecnico"
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
                ...(stateConflict ? ["TECHNICIAN_STATE_CONFLICT"] : []),
                ...(legacyApproval ? ["LEGACY_APPROVAL_REQUIRES_REVIEW"] : []),
                ...(wrongAccount ? ["B2C_ACCOUNT_REQUIRED"] : []),
                ...(roleConflict ? ["TECHNICIAN_ROLE_CONFLICT"] : []),
                ...(!requirements.complete ? [`KYC_MISSING:${requirements.missing.join(",")}`] : [])
            ],
            canonical: {
                rol: normalized.rol,
                estado: normalized.estado,
                status: normalized.status,
                foto_perfil: normalized.foto_perfil,
                kyc: normalized.kyc,
                skills: normalized.skills,
                vehiculo: normalized.vehiculo,
                documentos: normalized.documentos,
                datos_bancarios: normalized.datos_bancarios,
                provider_profile: normalized.provider_profile,
                disponible: normalized.disponible
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
        B2C_PROVIDER_PROFILE_VERSION,
        B2C_PROVIDER_MAX_MEMBERS,
        B2C_PROVIDER_MODES,
        MEXICAN_CLABE_VERSION,
        MEXICAN_PAYOUT_DESTINATION_VERSION,
        MEXICAN_CLABE_CATALOG_SOURCE,
        CLABE_INSTITUTIONS,
        B2C_SKILL_VERTICALS,
        DESTINATION_SOURCES,
        EVENT_MARKETPLACE_SERVICE_AVAILABLE,
        PAYMENT_METHODS,
        SERVICE_CATALOG,
        SERVICE_STATES,
        SERVICE_TRANSITIONS,
        SERVICE_VERTICAL_LABELS,
        TECHNICIAN_LEGACY_FIELDS,
        TECHNICIAN_STATES,
        assertPaymentMethodAllowed,
        calculateMexicanClabeCheckDigit,
        inspectMexicanClabe,
        inspectMexicanPayoutDestination,
        normalizeMexicanClabe,
        normalizeMexicanPayoutDestination,
        normalizeB2cProviderProfile,
        buildMarketplaceListing,
        getServiceDefinition,
        isB2BAccountProfile,
        isServiceAllowedForCustomer,
        isDocumentReference,
        isServiceTransitionAllowed,
        isServiceCategoryEnabled,
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
        serviceAudience,
        serviceCoverageCount,
        shouldPublishMarketplace,
        technicianEligibility,
        technicianProvidesServiceCoverage,
        technicianKycRequirements,
        personnelKycRequirements,
        technicianMigration
    });
});
