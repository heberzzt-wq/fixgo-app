/*
 * NEXO UI Branding Bridge
 * Cambia solo identidad visible; conserva ids y APIs Jarvis/SIA7 para compatibilidad.
 */

import {
    NEXO_IDENTITY,
    NEXO_IDENTITY_VERSION
} from "./nexo.identity.js";

export const NEXO_UI_BRANDING_VERSION = "1.0.0-safe-visible-migration";

const INSTALL_KEY = "__NEXO_UI_BRANDING__";

function replaceExactText(selector, expected, replacement) {
    document.querySelectorAll(selector).forEach(element => {
        if (String(element.textContent || "").trim() === expected) {
            element.textContent = replacement;
        }
    });
}

function applyBranding() {
    if (typeof document === "undefined") return;

    if (document.title === "Terminal Heberto | GestiaPremium") {
        document.title = "NEXO | Terminal privada Peninsula Tech";
    }

    replaceExactText("h3", "Jarvis listo", "NEXO listo");
    replaceExactText(
        "p",
        "Motor No-Code | GestiaPremium V5.18",
        "NEXO | Motor privado no-code de Peninsula Tech"
    );

    const root = document.documentElement;
    root.dataset.privateEngine = NEXO_IDENTITY.name;
    root.dataset.privateEngineVersion = NEXO_IDENTITY_VERSION;

    const input = document.getElementById("gestia-input");
    if (input && !input.dataset.nexoPlaceholderApplied) {
        input.dataset.nexoPlaceholderApplied = "true";
        input.placeholder =
            "Dile a NEXO qué debe investigar, crear, analizar o ejecutar...";
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
            observer,
            uninstall() {
                observer.disconnect();
                delete globalThis[INSTALL_KEY];
            }
        };
        globalThis[INSTALL_KEY] = installation;
        return installation;
    }

    const installation = {
        version: NEXO_UI_BRANDING_VERSION,
        identity: NEXO_IDENTITY,
        observer: null,
        uninstall() {
            delete globalThis[INSTALL_KEY];
        }
    };
    globalThis[INSTALL_KEY] = installation;
    return installation;
}

instalarMarcaNexo();
