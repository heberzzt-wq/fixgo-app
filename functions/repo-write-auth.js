"use strict";

/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - REPO WRITE AUTHORITY GATE V1.0
 * ======================================================================================
 * Autoriza escrituras en GitHub únicamente para identidades Firebase verificadas
 * con rango de CEO o Arquitecto Supremo.
 *
 * Reglas:
 * - Requiere Firebase ID Token en Authorization: Bearer <token>.
 * - Verifica firma y revocación mediante Firebase Admin.
 * - Custom Claim admin === true equivale a arquitecto_supremo.
 * - Consulta users/{uid} como fuente adicional de rol.
 * - Falla de forma cerrada.
 * ======================================================================================
 */

const ALLOWED_REPO_WRITE_ROLES =
    new Set([
        "arquitecto_supremo",
        "ceo"
    ]);

function normalizeAuthorityRole(value) {

    if (
        typeof value !== "string"
    ) {

        return "";
    }

    return value
        .trim()
        .toLowerCase();
}

function extractBearerToken(req) {

    const authorizationHeader =
        req?.headers?.authorization ||
        req?.headers?.Authorization ||
        "";

    if (
        typeof authorizationHeader !== "string" ||
        !authorizationHeader.startsWith("Bearer ")
    ) {

        return "";
    }

    return authorizationHeader
        .slice("Bearer ".length)
        .trim();
}

module.exports = ({
    admin,
    db
}) => {

    if (
        !admin ||
        !db
    ) {

        throw new Error(
            "REPO_WRITE_AUTH_DEPENDENCIES_REQUIRED"
        );
    }

    async function authorizeRepoWriteRequest(req) {

        const idToken =
            extractBearerToken(
                req
            );

        if (!idToken) {

            return {
                ok: false,
                authorized: false,
                httpStatus: 401,
                status: "unauthenticated",
                reason: "REPO_WRITE_AUTH_REQUIRED",
                message:
                    "La escritura en repositorio requiere una sesión Firebase válida.",
                uid: null,
                role: null,
                tenantId: null
            };
        }

        try {

            const decodedToken =
                await admin
                    .auth()
                    .verifyIdToken(
                        idToken,
                        true
                    );

            const uid =
                decodedToken?.uid ||
                null;

            if (!uid) {

                return {
                    ok: false,
                    authorized: false,
                    httpStatus: 401,
                    status: "unauthenticated",
                    reason: "INVALID_AUTH_TOKEN",
                    message:
                        "El token Firebase no contiene una identidad válida.",
                    uid: null,
                    role: null,
                    tenantId: null
                };
            }

            let userData =
                null;

            let role =
                decodedToken.admin === true
                    ? "arquitecto_supremo"
                    : normalizeAuthorityRole(
                        decodedToken.rol ||
                        decodedToken.role
                    );

            if (
                !ALLOWED_REPO_WRITE_ROLES.has(
                    role
                )
            ) {

                const userSnapshot =
                    await db
                        .collection("users")
                        .doc(uid)
                        .get();

                if (
                    userSnapshot.exists
                ) {

                    userData =
                        userSnapshot.data() ||
                        {};

                    role =
                        normalizeAuthorityRole(
                            userData.rol ||
                            userData.role ||
                            role
                        );
                }
            }

            if (
                !ALLOWED_REPO_WRITE_ROLES.has(
                    role
                )
            ) {

                return {
                    ok: false,
                    authorized: false,
                    httpStatus: 403,
                    status: "forbidden",
                    reason:
                        "REPO_WRITE_ROLE_FORBIDDEN",
                    message:
                        "La identidad autenticada no tiene autoridad para escribir en el repositorio.",
                    uid,
                    role:
                        role ||
                        "unknown",
                    tenantId:
                        decodedToken.tenantId ||
                        userData?.tenantId ||
                        userData?.condominioId ||
                        null
                };
            }

            return {
                ok: true,
                authorized: true,
                httpStatus: 200,
                status: "authorized",
                reason: null,
                message:
                    "Autoridad de escritura validada.",
                uid,
                email:
                    decodedToken.email ||
                    userData?.email ||
                    null,
                role,
                tenantId:
                    decodedToken.tenantId ||
                    userData?.tenantId ||
                    userData?.condominioId ||
                    null,
                authSource:
                    decodedToken.admin === true
                        ? "firebase_custom_claim"
                        : "firebase_token_or_user_profile"
            };

        } catch(error) {

            console.warn(
                "🛑 [REPO_WRITE_TOKEN_REJECTED]",
                {
                    code:
                        error?.code ||
                        null,

                    message:
                        error?.message ||
                        "Token verification failed."
                }
            );

            return {
                ok: false,
                authorized: false,
                httpStatus: 401,
                status: "unauthenticated",
                reason: "INVALID_AUTH_TOKEN",
                message:
                    "El token Firebase fue rechazado o ya no es válido.",
                uid: null,
                role: null,
                tenantId: null
            };
        }
    }

    return {
        authorizeRepoWriteRequest,
        normalizeAuthorityRole
    };
};
