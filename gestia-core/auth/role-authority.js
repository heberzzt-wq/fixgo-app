export const GESTIA_MASTER_EMAIL =
    "hebertoh-m@hotmail.com";

export function normalizeGestiaEmail(
    value = ""
) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

export function isGestiaMasterIdentity(
    user = {}
) {
    return (
        normalizeGestiaEmail(
            user?.email
        ) ===
        GESTIA_MASTER_EMAIL
    );
}

const ROLE_ALIASES =
    Object.freeze({
        b2c: "cliente",
        client: "cliente",
        tecnico_gp: "tecnico",
        tecnico_interno: "tecnico",
        admin_b2b: "b2b_admin",
        asistente_admin: "b2b_admin"
    });

export function resolveGestiaRole(
    user = {},
    metadata = {}
) {
    const email =
        normalizeGestiaEmail(
            user?.email ||
            metadata?.email ||
            ""
        );

    if (
        isGestiaMasterIdentity({ email })
    ) {
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
        version: "4.0.0-master-session-authority",
        masterIdentity: GESTIA_MASTER_EMAIL,
        aliases: {
            ...ROLE_ALIASES
        },
        unresolvedFallback: null,
        guarantees: [
            "firebase_session_required",
            "master_authenticated_email_is_primary_authority",
            "master_identity_precedes_profile_and_claims",
            "no_temporary_client_role",
            "unknown_role_does_not_redirect"
        ]
    };
}

function normalizePage(pathname = "") {
    const page =
        String(pathname || "")
            .split("/")
            .pop()
            .split("?")[0]
            .split("#")[0]
            .replace(/\.html$/i, "")
            .toLowerCase();

    return page || "index";
}

export function resolveGestiaRouteDecision({
    user = {},
    metadata = user,
    pathname = "",
    search = ""
} = {}) {
    const roleResolution =
        resolveGestiaRole(
            user,
            metadata
        );

    const role =
        roleResolution.role;

    const page =
        normalizePage(pathname);

    const subType =
        String(
            metadata?.sub_type ||
            metadata?.subtype ||
            user?.sub_type ||
            user?.subtype ||
            (
                metadata?.tipo_cuenta === "B2B" ||
                user?.tipo_cuenta === "B2B"
                    ? "saas"
                    : "marketplace"
            )
        )
            .trim()
            .toLowerCase();

    const accountType =
        String(
            metadata?.tipo_cuenta ||
            user?.tipo_cuenta ||
            ""
        )
            .trim()
            .toLowerCase();

    const b2bSubTypes = new Set([
        "saas",
        "tecnico_planta",
        "tecnico_interno"
    ]);

    const isB2BAccount =
        accountType === "b2b" ||
        b2bSubTypes.has(subType) ||
        roleResolution.roleReal === "tecnico_interno";

    const stay = reason => ({
        ...roleResolution,
        page,
        subType,
        target: null,
        redirect: false,
        reason
    });

    const redirect = (target, reason) => ({
        ...roleResolution,
        page,
        subType,
        target,
        redirect: true,
        reason
    });

    if (!role) {
        return stay("role_unresolved");
    }

    if (role === "admin") {
        const allowed =
            [
                "admin",
                "ceo",
                "gestia-terminal",
                "gestia-modulo",
                "noc"
            ]
                .some(surface =>
                    page.includes(surface)
                );

        return allowed
            ? stay("admin_surface_allowed")
            : redirect("admin.html", "admin_surface_protection");
    }

    if (
        [
            "seguridad",
            "recepcion",
            "seguridad_24_7"
        ].includes(role)
    ) {
        const target =
            "gestia-modulo.html?mod=seguridad_accesos_b2b";

        return (
            page === "gestia-modulo" &&
            search === "?mod=seguridad_accesos_b2b"
        )
            ? stay("b2b_staff_surface_allowed")
            : redirect(target, "b2b_staff_surface_protection");
    }

    if (role === "b2b_admin") {
        return page === "panel-b2b-admin"
            ? stay("b2b_admin_surface_allowed")
            : redirect("panel-b2b-admin.html", "b2b_admin_surface_protection");
    }

    if (role === "inquilino_b2b") {
        return page === "app-inquilino"
            ? stay("tenant_surface_allowed")
            : redirect("app-inquilino.html", "tenant_surface_protection");
    }

    if (role === "tecnico") {
        const target =
            isB2BAccount
                ? "tecnico-b2b.html"
                : "tecnico.html";

        return page === normalizePage(target)
            ? stay("technician_surface_allowed")
            : redirect(target, "technician_surface_protection");
    }

    if (role === "cliente") {
        if (isB2BAccount) {
            return page === "app-inquilino"
                ? stay("saas_client_surface_allowed")
                : redirect("app-inquilino.html", "saas_client_surface_protection");
        }

        return page === "cliente"
            ? stay("client_surface_allowed")
            : redirect("cliente.html", "client_surface_protection");
    }

    return stay("role_without_registered_route");
}
