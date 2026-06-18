/**
 * =====================================================================================
 * JARVIS COMPANY REGISTRY v2.0
 * Memoria estructurada de operación Gestia / FixGo
 * =====================================================================================
 */

export const COMPANY_REGISTRY_VERSION = "2.0.0-business-marketing";

export const COMPANY = {

    people: {

        heberto: {
            name: "Heberto",
            role: "ARQUITECTO",
            area: "DIRECCION"
        },

        jessica: {
            name: "Jessica",
            role: "ASISTENTE_PRESIDENCIA",
            area: "ADMIN"
        },

        jorge: {
            name: "Jorge",
            role: "ADMIN_B2B",
            area: "B2B"
        },

        majo: {
            name: "Majo",
            role: "RECEPCION",
            area: "FRONTDESK"
        },

        jonathan: {
            name: "Jonathan",
            role: "TECNICO",
            area: "OPERACIONES",
            status: "ACTIVO",
            todayJobs: 3,
            vehicle: "Gol 2014"
        },

        roberto: {
            name: "Roberto",
            role: "TECNICO",
            area: "OPERACIONES"
        },

        gerardo: {
            name: "Gerardo",
            role: "TECNICO",
            area: "OPERACIONES"
        },

        edwar: {
            name: "Edwar",
            role: "TECNICO",
            area: "OPERACIONES"
        },

        luis: {
            name: "Luis",
            role: "SEGURIDAD",
            area: "SEGURIDAD"
        },

        laura: {
            name: "Laura",
            role: "SEGURIDAD",
            area: "SEGURIDAD"
        },

        manuel: {
            name: "Manuel",
            role: "SEGURIDAD",
            area: "SEGURIDAD"
        }

    },

    tenants: {

        posiq: {
            name: "Posiq",
            location: "PISO 2",
            type: "INQUILINO"
        },

        anonimo: {
            name: "Anonimo",
            location: "PISO 1",
            type: "INQUILINO"
        },

        notaria74: {
            name: "Notaria 74",
            location: "MEZZANINE",
            type: "INQUILINO"
        }

    },

    vehicles: {

        gol2014: {
            name: "Gol Sedan 2014",
            area: "FLOTILLA",
            status: "ACTIVO"
        },

        gol2013: {
            name: "Gol Sedan 2013",
            area: "FLOTILLA",
            status: "ACTIVO"
        },

        vwup: {
            name: "VW Up Negro",
            area: "FLOTILLA",
            status: "ACTIVO"
        },

        spark: {
            name: "Spark Gris",
            area: "FLOTILLA",
            status: "ACTIVO"
        },

        np300: {
            name: "NP300 2011",
            area: "FLOTILLA",
            status: "ACTIVO"
        },

        moto150: {
            name: "Moto Honda 150",
            area: "FLOTILLA",
            status: "ACTIVO"
        }

    },

    modules: {

        tecnicob2b: {
            name: "Tecnico B2B",
            file: "app-tecnico-b2b.js",
            area: "B2B"
        },

        panelb2b: {
            name: "Panel B2B Admin",
            file: "panel-b2b-admin.js",
            area: "B2B"
        },

        terminalchofer: {
            name: "Terminal Chofer",
            file: "terminal-chofer.js",
            area: "FLOTILLA"
        },

        flotilla: {
            name: "Modulo Flotilla",
            file: "modulo-flotilla.js",
            area: "FLOTILLA"
        },

        gestiaterminal: {
            name: "Gestia Terminal",
            file: "gestia-terminal.js",
            area: "CORE"
        }

    },

    marketing: {

        brand: {
            name: "FixGo / GestiaPremium",
            owner: "Heberto",
            voice: "confiable, directo, operativo y premium",
            market: "servicios, administracion y operacion inmobiliaria"
        },

        channels: {
            web: {
                name: "Web / Landing",
                defaultAsset: "landing_page"
            },
            instagram: {
                name: "Instagram",
                defaultAsset: "flyer"
            },
            tiktok: {
                name: "TikTok",
                defaultAsset: "reel"
            },
            facebook: {
                name: "Facebook",
                defaultAsset: "campaign"
            },
            whatsapp: {
                name: "WhatsApp",
                defaultAsset: "campaign"
            }
        },

        defaultAudience:
            "administradores, empresas y clientes operativos",

        defaultOffer:
            "operacion mas rapida, trazable y profesional"
    },

    aliases: {

        jefe: "heberto",
        arquitecto: "heberto",

        jon: "jonathan",

        noto74: "notaria74",

        gol14: "gol2014",
        gol13: "gol2013"

    }

};

/* =====================================================================================
    HELPERS
===================================================================================== */

export function normalizeKey(text = "") {
    return String(text)
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^\w]/g, "");
}

export function findPerson(text = "") {

    const key = normalizeKey(text);
    const real =
        COMPANY.aliases[key] || key;

    return COMPANY.people[real] || null;
}

export function findTenant(text = "") {

    const key = normalizeKey(text);
    const real =
        COMPANY.aliases[key] || key;

    return COMPANY.tenants[real] || null;
}

export function findVehicle(text = "") {

    const key = normalizeKey(text);
    const real =
        COMPANY.aliases[key] || key;

    return COMPANY.vehicles[real] || null;
}

export function findModule(text = "") {

    const key = normalizeKey(text);
    const real =
        COMPANY.aliases[key] || key;

    return COMPANY.modules[real] || null;
}

export function resolveAny(text = "") {

    return (
        findPerson(text) ||
        findTenant(text) ||
        findVehicle(text) ||
        findModule(text) ||
        null
    );
}

export function resolveMarketingContext() {

    return {
        ...COMPANY.marketing.brand,
        audience:
            COMPANY.marketing.defaultAudience,
        offer:
            COMPANY.marketing.defaultOffer,
        channels:
            COMPANY.marketing.channels,
        registryVersion:
            COMPANY_REGISTRY_VERSION
    };
}
