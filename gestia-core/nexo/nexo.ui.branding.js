/*
 * JARVIS UI Branding Bridge
 * Historical NEXO filename retained only for compatibility.
 * No interpreta lenguaje natural ni decisiones de aprobación.
 */

export const JARVIS_UI_BRANDING_VERSION =
    "3.0.0-jarvis-branding-single-semantic-authority";
export const NEXO_UI_BRANDING_VERSION =
    JARVIS_UI_BRANDING_VERSION; // compatibility export only

const INSTALL_KEY = "__JARVIS_UI_BRANDING__";
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
    root.dataset.privateEngine = "JARVIS";
    root.dataset.privateEngineVersion = JARVIS_UI_BRANDING_VERSION;
    root.dataset.jarvisUiVersion = JARVIS_UI_BRANDING_VERSION;

    globalThis.__JARVIS_RUNTIME_STAMP__ = {
        name: "JARVIS",
        identityVersion: "jarvis-single-authority",
        uiVersion: JARVIS_UI_BRANDING_VERSION,
        semanticAuthority: "jarvisSemanticPlan",
        alternateBrains: 0,
        loadedAt: new Date().toISOString()
    };

    const input = document.getElementById("gestia-input");
    if (input && !input.dataset.jarvisPlaceholderApplied) {
        input.dataset.jarvisPlaceholderApplied = "true";
        input.placeholder =
            "Dile a ADJUNTO qué debe investigar, crear, analizar o ejecutar...";
    }

    const headerTitle = [...document.querySelectorAll("h1")].find(element =>
        String(element.textContent || "").trim() === "Terminal Heberto"
    );
    if (headerTitle) {
        headerTitle.setAttribute(
            "title",
            "JARVIS — autoridad semántica única"
        );
    }
}

export function instalarMarcaJarvis() {
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
            version: JARVIS_UI_BRANDING_VERSION,
            identity: Object.freeze({ name: "JARVIS", semanticAuthority: "jarvisSemanticPlan", alternateBrains: 0 }),
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
        version: JARVIS_UI_BRANDING_VERSION,
        identity: Object.freeze({ name: "JARVIS", semanticAuthority: "jarvisSemanticPlan", alternateBrains: 0 }),
        observer: null,
        uninstall() {
            delete globalThis[INSTALL_KEY];
        }
    };
    globalThis[INSTALL_KEY] = installation;
    return installation;
}

instalarMarcaJarvis();
