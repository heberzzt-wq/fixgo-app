/*
 * ======================================================================================
 * B2C SECURE PAYMENT ENDPOINT REDIRECT 2026
 * ======================================================================================
 * Reescribe únicamente el endpoint histórico de checkout hacia el API autoritativo.
 * No altera ninguna otra petición fetch de la plataforma.
 * ======================================================================================
 */

export const B2C_SECURE_PAYMENT_ENDPOINT_REDIRECT_VERSION = "1.0.0";

const LEGACY_CHECKOUT_URL =
    "https://stripewebhook-72a7uqnggq-uc.a.run.app/create-checkout-session";
const SECURE_CHECKOUT_URL =
    "https://us-central1-fixgo-44e4d.cloudfunctions.net/api/create-checkout-session";
const INSTALL_KEY = "__B2C_SECURE_PAYMENT_ENDPOINT_REDIRECT__";

function normalizarURL(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (typeof Request !== "undefined" && input instanceof Request) {
        return input.url;
    }
    return "";
}

export function instalarRedirectCheckoutSeguroB2C() {
    if (globalThis[INSTALL_KEY]) return globalThis[INSTALL_KEY];
    if (typeof globalThis.fetch !== "function") {
        throw new Error("FETCH_UNAVAILABLE");
    }

    const nativeFetch = globalThis.fetch.bind(globalThis);

    const secureFetch = (input, init) => {
        const rawUrl = normalizarURL(input);
        if (rawUrl !== LEGACY_CHECKOUT_URL) {
            return nativeFetch(input, init);
        }

        console.info(
            `[B2C_PAYMENT_ENDPOINT_REDIRECT] ${LEGACY_CHECKOUT_URL} -> ${SECURE_CHECKOUT_URL}`
        );

        if (typeof Request !== "undefined" && input instanceof Request) {
            const redirectedRequest = new Request(SECURE_CHECKOUT_URL, input);
            return nativeFetch(redirectedRequest, init);
        }

        return nativeFetch(SECURE_CHECKOUT_URL, init);
    };

    Object.defineProperty(secureFetch, "__b2cSecurePaymentRedirect", {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false
    });

    globalThis.fetch = secureFetch;

    const installation = {
        version: B2C_SECURE_PAYMENT_ENDPOINT_REDIRECT_VERSION,
        legacyUrl: LEGACY_CHECKOUT_URL,
        secureUrl: SECURE_CHECKOUT_URL,
        uninstall() {
            if (globalThis.fetch === secureFetch) {
                globalThis.fetch = nativeFetch;
            }
            delete globalThis[INSTALL_KEY];
        }
    };

    globalThis[INSTALL_KEY] = installation;
    return installation;
}

instalarRedirectCheckoutSeguroB2C();
