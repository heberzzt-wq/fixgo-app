export const GESTIA_MASTER_EMAIL =
    "hebertoh-m@hotmail.com";

const ROLE_ALIASES =
    Object.freeze({
        b2c: "cliente",
        client: "cliente",
        tecnico_gp: "tecnico",
        tecnico_interno: "tecnico",
        admin_b2b: "b2b_admin"
    });

export function resolveGestiaRole(
    user = {},
    metadata = {}
) {
    const email =
        String(
            user?.email ||
            metadata?.email ||
            ""
        )
            .trim()
            .toLowerCase();

    if (email === GESTIA_MASTER_EMAIL) {
        return {
            role: "admin",
            roleReal: "admin",
            source: "master_identity",
            resolved: true
        };
    }

    const rawRole =
        String(
            metadata?.rol ||
            metadata?.role ||
            user?.rol ||
            user?.role ||
            ""
        )
            .trim()
            .toLowerCase();

    return {
        role:
            ROLE_ALIASES[rawRole] ||
            rawRole ||
            null,
        roleReal:
            rawRole ||
            null,
        source:
            rawRole
                ? "profile"
                : "unresolved",
        resolved:
            Boolean(rawRole)
    };
}

export function describeGestiaRoleAuthority() {
    return {
        version: "2.0.0-role-authority",
        masterIdentity: GESTIA_MASTER_EMAIL,
        aliases: {
            ...ROLE_ALIASES
        },
        unresolvedFallback: null,
        guarantees: [
            "master_identity_precedes_profile",
            "no_temporary_client_role",
            "unknown_role_does_not_redirect"
        ]
    };
}
