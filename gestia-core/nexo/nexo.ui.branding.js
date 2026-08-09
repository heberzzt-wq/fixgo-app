/*
 * NEXO UI Branding Bridge
 * Cambia solo identidad visible; conserva ids y APIs Jarvis/SIA7 para compatibilidad.
 * No interpreta lenguaje natural ni decisiones de aprobación.
 */

import {
    NEXO_IDENTITY,
    NEXO_IDENTITY_VERSION
} from "./nexo.identity.js";

export const NEXO_UI_BRANDING_VERSION =
    "2.0.0-branding-only-single-semantic-authority";

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

    globalThis.__NEXO_RUNTIME_STAMP__ = {
        name: NEXO_IDENTITY.name,
        identityVersion: NEXO_IDENTITY_VERSION,
        uiVersion: NEXO_UI_BRANDING_VERSION,
        semanticAuthority: "jarvisSemanticPlan",
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
