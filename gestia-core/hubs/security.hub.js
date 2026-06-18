/* =====================================================
   GESTIA SECURITY HUB V2
   Sovereign Security Governance Layer
===================================================== */

export const SECURITY_HUB_VERSION = "2.0.0-security-contract";

export function describeSecurityHub() {

    return {
        ok: true,
        hub: "security",
        version:
            SECURITY_HUB_VERSION,
        capabilities: [
            "firewall",
            "core_audit",
            "code_security",
            "field_weight_validation",
            "history_integrity"
        ]
    };
}

/* =====================================================
   FIREWALL FABRIC
===================================================== */

export {

    ejecutarFirewallGlobal

}

from "../firewall.engine.js";

/* =====================================================
   AUDIT FABRIC
===================================================== */

export {

    ejecutarAuditoriaCore,
    validarSeguridadCodigo,
    validarPesoCampos

}

from "../audit.engine.js";

/* =====================================================
   HISTORY FABRIC
===================================================== */

export {

    registrarYVerificarADN,
    existeEnHistorial,
    purgarCacheHistorial

}

from "../history.engine.js";

console.log(
    "🛡️ [SECURITY_HUB] ONLINE"
);
