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

    /* =================================================
       PEOPLE
    ================================================= */

    if (target.role) {

        if (intent === "STATUS") {
            return ok(
                `${name} pertenece al área ${target.area}. Estado operativo sin incidencias.`
            );
        }

        if (intent === "REPORT") {
            return ok(
                `Resumen de ${name}: rol ${target.role}, área ${target.area}.`
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