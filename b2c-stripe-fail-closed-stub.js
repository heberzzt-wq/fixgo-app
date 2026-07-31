/*
 * ======================================================================================
 * B2C STRIPE FAIL-CLOSED STUB 2026
 * ======================================================================================
 * Se instala desde app-panel.js después del intento normal de cargar fixgo-bridge.js.
 * Si el bridge falló, define funciones que rechazan el pago en vez de permitir que el
 * panel legacy simule éxito y cambie el servicio a "trabajando".
 * ======================================================================================
 */

export const B2C_STRIPE_FAIL_CLOSED_STUB_VERSION = "1.0.0";

function crearError() {
    const error = new Error("STRIPE_BRIDGE_UNAVAILABLE_FAIL_CLOSED");
    error.code = "STRIPE_BRIDGE_UNAVAILABLE_FAIL_CLOSED";
    return error;
}

function instalarStub(nombre) {
    if (typeof window === "undefined") return false;
    if (typeof window[nombre] === "function") return false;

    window[nombre] = async () => {
        const error = crearError();
        console.error(`[${nombre}_BLOCKED]`, error);
        alert(
            "La pasarela segura no está disponible. El servicio no cambiará de estado y no se simulará ningún pago."
        );
        throw error;
    };

    Object.defineProperty(window[nombre], "__b2cFailClosedStub", {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false
    });

    return true;
}

export function instalarStripeFailClosedStubB2C() {
    const initialInstalled = instalarStub("procesarPagoStripe");
    const balanceInstalled = instalarStub("procesarPagoSaldoStripe");

    if (initialInstalled || balanceInstalled) {
        console.warn(
            `[B2C_STRIPE_FAIL_CLOSED_STUB_READY] v${B2C_STRIPE_FAIL_CLOSED_STUB_VERSION}`
        );
    }

    return {
        initialInstalled,
        balanceInstalled,
        version: B2C_STRIPE_FAIL_CLOSED_STUB_VERSION
    };
}

instalarStripeFailClosedStubB2C();
