/*
 * ======================================================================================
 * B2C CLIENT DISPUTE UI RECOVERY 2026
 * Archivo: b2c-client-dispute-ui-recovery.js
 * Rol: Restaurar el botón de disputa cuando el cliente cierra el flujo de evidencia.
 * ======================================================================================
 */

export const B2C_CLIENT_DISPUTE_UI_RECOVERY_VERSION = "1.0.0";

const FLOW_PREFIX = "b2cClientDisputeEvidence_";
const SOURCE_PREFIX = "b2cClientArrival_";
let installed = false;

function restaurarBoton(serviceSuffix) {
    const sourceModal = document.getElementById(
        `${SOURCE_PREFIX}${serviceSuffix}`
    );

    if (!sourceModal?.isConnected || sourceModal.classList.contains("hidden")) {
        return;
    }

    const button = sourceModal.querySelector('[data-action="dispute"]');
    if (!button) return;

    button.disabled = false;
    button.dataset.b2cClientDisputeBusy = "false";
    button.classList.remove("opacity-50");
    button.innerHTML = '<i class="fas fa-location-crosshairs"></i> EL TÉCNICO NO ESTÁ AQUÍ';
}

export function instalarRecuperacionUIDisputaClienteB2C() {
    if (installed) {
        return {
            version: B2C_CLIENT_DISPUTE_UI_RECOVERY_VERSION,
            installed: true
        };
    }

    const clickListener = (event) => {
        const closeButton = event.target?.closest?.(
            `[id^="${FLOW_PREFIX}"] [data-action="close"]`
        );

        if (!closeButton) return;

        const flowModal = closeButton.closest(`[id^="${FLOW_PREFIX}"]`);
        const flowId = String(flowModal?.id || "");
        const serviceSuffix = flowId.startsWith(FLOW_PREFIX)
            ? flowId.slice(FLOW_PREFIX.length)
            : null;

        if (!serviceSuffix) return;

        setTimeout(() => restaurarBoton(serviceSuffix), 0);
    };

    document.addEventListener("click", clickListener, true);
    installed = true;

    window.__B2C_CLIENT_DISPUTE_UI_RECOVERY_VERSION__ =
        B2C_CLIENT_DISPUTE_UI_RECOVERY_VERSION;

    console.log(
        `[B2C_CLIENT_DISPUTE_UI_RECOVERY_READY] v${B2C_CLIENT_DISPUTE_UI_RECOVERY_VERSION}`
    );

    return {
        version: B2C_CLIENT_DISPUTE_UI_RECOVERY_VERSION,
        installed: true,
        uninstall() {
            document.removeEventListener("click", clickListener, true);
            installed = false;
        }
    };
}
