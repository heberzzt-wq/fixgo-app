/**
 * =====================================================================================
 * JARVIS BUSINESS ENGINE v1.0
 * Inteligencia empresarial Gestia / FixGo
 * =====================================================================================
 */

import {
    findPerson,
    findVehicle,
    findTenant,
    findModule,
    resolveAny
} from "./jarvis.company.registry.js";

/* =====================================================================================
   MAIN
===================================================================================== */

export function runBusinessIntent(rawInput = "") {

    const text =
        String(rawInput)
            .toLowerCase()
            .trim();

    if (!text) {
        return null;
    }

    const target =
        detectTarget(text);

    const intent =
        detectIntent(text);

    if (!intent && !target) {
        return null;
    }

    return buildResponse(
        intent,
        target,
        text
    );
}

/* =====================================================================================
   DETECT TARGET
===================================================================================== */

function detectTarget(text = "") {

    const words =
        text.split(/\s+/);

    for (const word of words) {

        const found =
            resolveAny(word);

        if (found) {
            return found;
        }
    }

    // búsqueda por frase completa
    return resolveAny(text);
}

/* =====================================================================================
   DETECT INTENT
===================================================================================== */

function detectIntent(text = "") {
    
    text = String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

    if (
       text.includes("buenos dias") ||
       text.includes("buen día") ||
       text.includes("buen día")
    ) {
       return "GREETING_DAY";
    }

    if (
       text.includes("buenas noches")
    ) {
       return "GREETING_NIGHT";
    }

    if (
       text === "hola" ||
       text.includes("hola jarvis")
    ) {
       return "GREETING_HELLO";
    }

    if (
    text.includes("gracias")
    ) {
        return "THANKS";
    }

    if (
        text.includes("como estas") ||
        
        text.includes("cómo estás")
    ) {
        
        return "STATUS_SOCIAL";
    }

    if (
    text.includes("que novedades") ||
    text.includes("qué novedades") ||
    text.includes("novedades hoy")
) {
    return "DAILY_STATUS";
}

if (
    text.includes("todo bien") ||
    text.includes("todo en orden")
) {
    return "ALL_GOOD";
}

if (
    text.includes("como amanecimos") ||
    text.includes("como amanecio") ||
    text.includes("cómo amanecimos")
) {
    return "MORNING_STATUS";
}

if (
    text.includes("estado flotilla") ||
    text.includes("como esta la flotilla") ||
    text.includes("cómo está la flotilla")
) {
    return "FLEET_STATUS";
}

if (
    text.includes("como va gerardo") ||
    text.includes("cómo va gerardo")
) {
    return "GERARDO_STATUS";
}

    if (
        text.includes("como va") ||
        text.includes("cómo va") ||
        text.includes("estatus") ||
        text.includes("estado")
    ) {
        return "STATUS";
    }

    if (
        text.includes("reporte") ||
        text.includes("resumen")
    ) {
        return "REPORT";
    }

    if (
        text.includes("abre") ||
        text.includes("abrir") ||
        text.includes("open")
    ) {
        return "OPEN";
    }

    if (
        text.includes("revisa") ||
        text.includes("analiza") ||
        text.includes("audita")
    ) {
        return "ANALYZE";
    }

    if (
        text.includes("mejora") ||
        text.includes("optimiza") ||
        text.includes("corrige")
    ) {
        return "IMPROVE";
    }

    if (
        text.includes("ubica") ||
        text.includes("donde") ||
        text.includes("dónde")
    ) {
        return "LOCATE";
    }

    return "GENERAL";
}

/* =====================================================================================
   RESPONSE ENGINE
===================================================================================== */

function buildResponse(
    intent,
    target,
    text
) {

    if (intent === "GREETING_DAY") {
    return ok(
        "Buenos días Arquitecto. Sistemas estables y listos para operar."
    );
}

if (intent === "GREETING_NIGHT") {
    return ok(
        "Buenas noches Arquitecto. Todo permanece bajo control."
    );
}

if (intent === "GREETING_HELLO") {
    return ok(
        "Hola Arquitecto. Jarvis en línea."
    );
}

if (intent === "THANKS") {
    return ok(
        "Siempre listo."
    );
}

if (intent === "STATUS_SOCIAL") {
    return ok(
        "Operando al cien por ciento."
    );
}

    if (intent === "DAILY_STATUS") {
    return ok(
        "Sin novedades críticas. Sistemas operando con normalidad."
    );
}

if (intent === "ALL_GOOD") {
    return ok(
        "Todo bajo control Arquitecto."
    );
}

if (intent === "MORNING_STATUS") {
    return ok(
        "Amanecimos operativos y sin incidencias relevantes."
    );
}

if (intent === "FLEET_STATUS") {
    return ok(
        "Flotilla disponible. Sin reportes críticos al momento."
    );
}

if (intent === "GERARDO_STATUS") {
    return ok(
        "Gerardo pertenece al área OPERACIONES. Estado operativo sin incidencias."
    );
}

    if (!target) {
        return {
            ok: true,
            source: "BUSINESS_ENGINE",
            message:
                "Orden detectada. Falta objetivo específico."
        };
    }

    const name =
        target.name ||
        "Objetivo";


        if (
    intent === "PERSON_STATUS" ||
    intent === "GERARDO_STATUS"
) {

    const status =
        target.status ||
        "ACTIVO";

    const jobs =
        target.todayJobs || 0;

    const vehicle =
        target.vehicle ||
        "Sin unidad asignada";

    return ok(
        `${name} ${target.role || "colaborador"} ${status}. ${jobs} servicios hoy. Unidad ${vehicle}.`
    );
}

    /* =================================================
       PEOPLE
    ================================================= */

   if (target.role) {

    const status =
        target.status ||
        "ACTIVO";

    const jobs =
        target.todayJobs || 0;

    const vehicle =
        target.vehicle ||
        "Sin unidad asignada";

    if (intent === "STATUS") {
        return ok(
            `${name} ${target.role}. Estado ${status}. ${jobs} servicios hoy. Unidad ${vehicle}.`
        );
    }

    if (intent === "REPORT") {
        return ok(
            `Resumen de ${name}: rol ${target.role}, área ${target.area}, estado ${status}, ${jobs} servicios hoy.`
        );
    }

    if (intent === "LOCATE") {
        return ok(
            `${name} pertenece al área ${target.area}.`
        );
    }

    return ok(
        `${name} identificado como ${target.role}.`
    );
}

    /* =================================================
       TENANTS
    ================================================= */

    if (target.location) {

        if (
            intent === "STATUS" ||
            intent === "LOCATE"
        ) {
            return ok(
                `${name} ubicado en ${target.location}. Sin incidencias reportadas.`
            );
        }

        if (intent === "REPORT") {
            return ok(
                `${name}: ubicación ${target.location}, tipo ${target.type}.`
            );
        }

        return ok(
            `${name} detectado en ${target.location}.`
        );
    }

    /* =================================================
       VEHICLES
    ================================================= */

    if (target.status) {

        if (
            intent === "STATUS" ||
            intent === "REPORT"
        ) {
            return ok(
                `${name} estado ${target.status}. Unidad perteneciente a flotilla.`
            );
        }

        return ok(
            `${name} detectado en flotilla.`
        );
    }

    /* =================================================
       MODULES
    ================================================= */

    if (target.file) {

        if (intent === "OPEN") {
            return ok(
                `Abriendo módulo ${name}. Archivo base ${target.file}.`
            );
        }

        if (intent === "ANALYZE") {
            return ok(
                `Analizando módulo ${name}. Archivo ${target.file}.`
            );
        }

        if (intent === "IMPROVE") {
            return ok(
                `Preparando mejoras para ${name}. Optimización responsive recomendada.`
            );
        }

        return ok(
            `${name} pertenece al área ${target.area}.`
        );
    }

    return ok(
        `${name} identificado correctamente.`
    );
}

/* =====================================================================================
   HELPERS
===================================================================================== */

function ok(message = "") {
    return {
        ok: true,
        source: "BUSINESS_ENGINE",
        message
    };
}