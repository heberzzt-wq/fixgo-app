/**
 * ======================================================================================
 * GESTIA AUTHENTICATED LOADER RACE GUARD 2026
 * Archivo: gestia-loader-race-guard.js
 * Rol: Evitar que el boot vuelva a cubrir una superficie cuyo perfil y ruta ya fueron
 *      autorizados por Firebase.
 *
 * SEGURIDAD:
 * - No revela una superficie sin usuario, rol y decisión de ruta válidos.
 * - No sustituye la autoridad de app-main.js ni realiza redirecciones.
 * - Solo elimina loaders de arranque conocidos durante una ventana corta.
 * - No elimina loaders operativos como cierre de sesión, pagos o acciones del usuario.
 * ======================================================================================
 */

import { observarAuth } from "./firebase.js";
import {
    resolveGestiaRouteDecision
} from "./gestia-core/auth/role-authority.js?v=role-authority-v3-single-navigation-20260713";

export const GESTIA_LOADER_RACE_GUARD_VERSION = "1.0.0";

const GUARDED_WINDOW_MS = 20_000;
const STARTUP_LOADER_PATTERNS = Object.freeze([
    "VERIFICANDO SISTEMA",
    "PRECARGANDO MÓDULOS",
    "VALIDANDO NÚCLEO",
    "ACTIVANDO FORTRESS",
    "VALIDANDO PERFIL",
    "VALIDANDO SESIÓN Y ROL",
    "VALIDANDO SESIÃ“N Y ROL"
]);

let profileAuthorized = false;
let authorizedUntilMs = 0;
let observer = null;
let intervalId = null;
let unsubscribeAuth = null;

function textoNormalizado(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
}

function esLoaderDeArranque(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.id !== "fortressLoader") return false;

    const text = textoNormalizado(element.textContent);
    return STARTUP_LOADER_PATTERNS.some((pattern) => (
        text.includes(textoNormalizado(pattern))
    ));
}

function superficieProtegidaActual() {
    const path = window.location.pathname.toLowerCase();

    return (
        path.includes("admin") ||
        path.includes("ceo") ||
        path.includes("noc") ||
        path.includes("tecnico") ||
        path.includes("cliente") ||
        path.includes("gestia-modulo") ||
        path.includes("residencial")
    );
}

function revelarSuperficieAutorizada() {
    if (!profileAuthorized) return false;
    if (Date.now() > authorizedUntilMs) return false;

    const loader = document.getElementById("fortressLoader");
    if (loader && esLoaderDeArranque(loader)) {
        loader.remove();
    }

    document.documentElement.classList.remove("gestia-auth-pending");

    if (document.body) {
        document.body.style.visibility = "visible";
        document.body.style.opacity = "1";
        document.body.style.pointerEvents = "auto";
    }

    return true;
}

function detenerGuardiaTemporal() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

function activarGuardiaTemporal() {
    authorizedUntilMs = Date.now() + GUARDED_WINDOW_MS;
    revelarSuperficieAutorizada();

    if (!observer) {
        observer = new MutationObserver(() => {
            revelarSuperficieAutorizada();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (!intervalId) {
        intervalId = setInterval(() => {
            if (Date.now() > authorizedUntilMs) {
                detenerGuardiaTemporal();
                return;
            }

            revelarSuperficieAutorizada();
        }, 250);
    }
}

function validarPerfilYRuta(user) {
    if (!user || !superficieProtegidaActual()) return false;

    const role = user.rol || user.role || null;
    if (!role) return false;

    try {
        const decision = resolveGestiaRouteDecision({
            user,
            metadata: {
                ...user,
                rol: role,
                role
            },
            pathname: window.location.pathname,
            search: window.location.search
        });

        if (decision?.redirect) return false;
        if (decision?.reason === "role_without_registered_route") return false;

        return true;
    } catch (error) {
        console.error("[GESTIA_LOADER_GUARD_ROUTE_ERROR]", error);
        return false;
    }
}

export function instalarGestiaLoaderRaceGuard() {
    if (window.__GESTIA_LOADER_RACE_GUARD_INSTALLED__) {
        return window.__GESTIA_LOADER_RACE_GUARD_STATE__ || null;
    }

    window.__GESTIA_LOADER_RACE_GUARD_INSTALLED__ = true;

    unsubscribeAuth = observarAuth((user) => {
        if (!validarPerfilYRuta(user)) {
            profileAuthorized = false;
            return;
        }

        profileAuthorized = true;
        window.__GESTIA_PROFILE_READY__ = {
            uid: user.uid || null,
            role: user.rol || user.role || null,
            confirmedAt: Date.now(),
            guardVersion: GESTIA_LOADER_RACE_GUARD_VERSION
        };

        activarGuardiaTemporal();

        console.log(
            `[GESTIA_LOADER_RACE_GUARD_RELEASED] v${GESTIA_LOADER_RACE_GUARD_VERSION}`
        );
    });

    const state = {
        version: GESTIA_LOADER_RACE_GUARD_VERSION,
        stop() {
            profileAuthorized = false;
            detenerGuardiaTemporal();
            unsubscribeAuth?.();
            unsubscribeAuth = null;
        }
    };

    window.__GESTIA_LOADER_RACE_GUARD_STATE__ = state;
    return state;
}

instalarGestiaLoaderRaceGuard();
