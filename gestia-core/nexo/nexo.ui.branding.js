/*
 * NEXO UI Branding Bridge
 * Cambia solo identidad visible; conserva ids y APIs Jarvis/SIA7 para compatibilidad.
 * También normaliza aprobaciones naturales antes de que el listener legacy las procese.
 */

import {
    NEXO_IDENTITY,
    NEXO_IDENTITY_VERSION
} from "./nexo.identity.js";

export const NEXO_UI_BRANDING_VERSION =
    "1.1.0-approval-normalization-runtime-stamp";

const INSTALL_KEY = "__NEXO_UI_BRANDING__";
const APPROVAL_BRIDGE_KEY = "__NEXO_APPROVAL_NORMALIZER__";

const EXACT_APPROVAL_COMMANDS = new Set([
    "si",
    "ok",
    "arre",
    "dale",
    "hazlo",
    "adelante",
    "proceder",
    "procede",
    "confirmar",
    "confirmo",
    "aprobado",
    "aprobada",
    "autorizado",
    "autorizada",
    "apruebo",
    "autorizo",
    "aprobacion autorizada",
    "autorizacion aprobada",
    "plan aprobado",
    "plan autorizado",
    "apruebo el plan",
    "autorizo el plan",
    "procede con el plan",
    "adelante con el plan",
    "ejecuta el plan",
    "publicacion autorizada",
    "autorizo la publicacion"
]);

function replaceExactText(selector, expected, replacement) {
    document.querySelectorAll(selector).forEach(element => {
        if (String(element.textContent || "").trim() === expected) {
            element.textContent = replacement;
        }
    });
}

export function normalizeNexoCommand(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function isNexoApprovalCommand(value = "") {
    const command = normalizeNexoCommand(value);

    if (!command || command.length > 140) return false;

    if (
        /\b(no|nunca|cancelar|cancela|rechazo|rechazar|detener|deten|abortar|aborta)\b/
            .test(command)
    ) {
        return false;
    }

    if (EXACT_APPROVAL_COMMANDS.has(command)) return true;

    const hasApprovalAction =
        /\b(apruebo|aprobado|aprobada|autorizo|autorizado|autorizada|confirmo|confirmado|confirmada|procede|proceder|adelante|ejecuta|ejecutalo|publica|publicalo|hazlo|dale)\b/
            .test(command);

    const hasApprovalScope =
        /\b(plan|propuesta|mision|campana|marketing|aprobacion|autorizacion|ejecucion|publicacion|publicar|artefactos|entregables)\b/
            .test(command);

    return hasApprovalAction && (
        hasApprovalScope ||
        command.split(" ").length <= 4
    );
}

function normalizeApprovalBeforeLegacy(event) {
    const form = event?.target;

    if (
        !form ||
        form.id !== "gestia-form"
    ) {
        return;
    }

    const input =
        form.querySelector("#gestia-input") ||
        document.getElementById("gestia-input");

    if (!input) return;

    const originalCommand =
        String(input.value || "").trim();

    if (!isNexoApprovalCommand(originalCommand)) return;

    input.dataset.nexoOriginalApproval = originalCommand;
    input.dataset.nexoApprovalNormalized = "true";

    // El runtime legacy reconoce `proceder` de forma determinista.
    input.value = "proceder";

    globalThis.__NEXO_LAST_APPROVAL_NORMALIZATION__ = {
        originalCommand,
        normalizedCommand: "proceder",
        normalizedAt: new Date().toISOString(),
        version: NEXO_UI_BRANDING_VERSION
    };
}

function installApprovalNormalizer() {
    if (
        typeof document === "undefined" ||
        globalThis[APPROVAL_BRIDGE_KEY]
    ) {
        return globalThis[APPROVAL_BRIDGE_KEY] || null;
    }

    document.addEventListener(
        "submit",
        normalizeApprovalBeforeLegacy,
        true
    );

    const installation = {
        version: NEXO_UI_BRANDING_VERSION,
        normalize: normalizeNexoCommand,
        isApprovalCommand: isNexoApprovalCommand,
        uninstall() {
            document.removeEventListener(
                "submit",
                normalizeApprovalBeforeLegacy,
                true
            );
            delete globalThis[APPROVAL_BRIDGE_KEY];
        }
    };

    globalThis[APPROVAL_BRIDGE_KEY] = installation;
    globalThis.NexoApproval = installation;

    return installation;
}

function applyBranding() {
    if (typeof document === "undefined") return;

    if (["Terminal Heberto | GestiaPremium", "NEXO | Terminal privada Peninsula Tech"].includes(document.title)) {
        document.title = "Terminal Heberto | ADJUNTO";
    }

    replaceExactText("h3", "Jarvis listo", "ADJUNTO listo");
    replaceExactText("h3", "NEXO listo", "ADJUNTO listo");
    replaceExactText(
        "p",
        "Motor No-Code | GestiaPremium V5.18",
        "ADJUNTO | Tecnología privada de Península Tech"
    );

    const root = document.documentElement;
    root.dataset.privateEngine = NEXO_IDENTITY.name;
    root.dataset.privateEngineVersion = NEXO_IDENTITY_VERSION;
    root.dataset.nexoUiVersion = NEXO_UI_BRANDING_VERSION;
    root.dataset.nexoApprovalNormalizer = "active";

    globalThis.__NEXO_RUNTIME_STAMP__ = {
        name: NEXO_IDENTITY.name,
        identityVersion: NEXO_IDENTITY_VERSION,
        uiVersion: NEXO_UI_BRANDING_VERSION,
        approvalNormalizer: true,
        loadedAt: new Date().toISOString()
    };

    const input = document.getElementById("gestia-input");
    if (input && !input.dataset.nexoPlaceholderApplied) {
        input.dataset.nexoPlaceholderApplied = "true";
        input.placeholder =
            "Dile a ADJUNTO qué debe investigar, crear, analizar o ejecutar...";
    }

    const headerTitle = [...document.querySelectorAll("h1")].find(element =>
        String(element.textContent || "").trim() === "Terminal Heberto"
    );
    if (headerTitle) {
        headerTitle.setAttribute(
            "title",
            `${NEXO_IDENTITY.expandedName} — uso privado de ${NEXO_IDENTITY.owner}`
        );
    }
}

export function instalarMarcaNexo() {
    if (globalThis[INSTALL_KEY]) return globalThis[INSTALL_KEY];

    const approvalNormalizer =
        installApprovalNormalizer();

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", applyBranding, { once: true });
        } else {
            applyBranding();
        }

        const observer = new MutationObserver(() => applyBranding());
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        const installation = {
            version: NEXO_UI_BRANDING_VERSION,
            identity: NEXO_IDENTITY,
            approvalNormalizer,
            observer,
            uninstall() {
                observer.disconnect();
                approvalNormalizer?.uninstall?.();
                delete globalThis[INSTALL_KEY];
            }
        };
        globalThis[INSTALL_KEY] = installation;
        return installation;
    }

    const installation = {
        version: NEXO_UI_BRANDING_VERSION,
        identity: NEXO_IDENTITY,
        approvalNormalizer,
        observer: null,
        uninstall() {
            approvalNormalizer?.uninstall?.();
            delete globalThis[INSTALL_KEY];
        }
    };
    globalThis[INSTALL_KEY] = installation;
    return installation;
}

instalarMarcaNexo();
