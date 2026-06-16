
"use strict";

/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - SERVER REPO SYNTAX VALIDATOR V1.0
 * ======================================================================================
 * Valida contenido JavaScript dentro de Cloud Functions antes de cualquier escritura
 * en GitHub.
 *
 * Reglas:
 * - No ejecuta el código recibido.
 * - Usa Acorn como dependencia local versionada.
 * - Soporta ES Modules y CommonJS.
 * - Permite extensiones conocidas que no son JavaScript.
 * - Bloquea archivos sin extensión o con extensión desconocida.
 * - Nunca propaga directamente errores internos del parser.
 * ======================================================================================
 */

const {
    parse,
    version: acornVersion
} = require("acorn");

/* =====================================================================================
   CONSTANTES
===================================================================================== */

const VALIDATOR_NAME =
    "gestia-javascript-syntax-validator";

const VALIDATOR_VERSION =
    "1.0.0";

const MODULE_EXTENSIONS =
    new Set([
        ".js",
        ".mjs"
    ]);

const SCRIPT_EXTENSIONS =
    new Set([
        ".cjs"
    ]);

const KNOWN_NON_JAVASCRIPT_EXTENSIONS =
    new Set([
        ".html",
        ".css",
        ".json",
        ".txt",
        ".md",
        ".svg",
        ".xml"
    ]);

/* =====================================================================================
   NORMALIZACIÓN DE ARCHIVO
===================================================================================== */

function normalizeFilePath(file) {

    if (
        typeof file !== "string"
    ) {

        return "";
    }

    return file
        .trim()
        .split("?")[0]
        .split("#")[0]
        .replace(/\\/g, "/");
}

/* =====================================================================================
   RESOLUCIÓN DE EXTENSIÓN
===================================================================================== */

function resolveFileExtension(file) {

    const normalizedFile =
        normalizeFilePath(file);

    if (!normalizedFile) {

        return "";
    }

    const lastSlashIndex =
        normalizedFile.lastIndexOf("/");

    const lastDotIndex =
        normalizedFile.lastIndexOf(".");

    if (
        lastDotIndex === -1 ||
        lastDotIndex < lastSlashIndex
    ) {

        return "";
    }

    return normalizedFile
        .slice(lastDotIndex)
        .toLowerCase();
}

/* =====================================================================================
   RESOLUCIÓN DE SOURCE TYPE
===================================================================================== */

function resolveJavaScriptSourceType(file) {

    const normalizedFile =
        normalizeFilePath(file);

    if (!normalizedFile) {

        return {
            ok: false,
            status: "blocked",
            file: null,
            extension: null,
            sourceType: null,
            reason: "FILE_REQUIRED",
            message:
                "No se recibió un nombre de archivo válido."
        };
    }

    const extension =
        resolveFileExtension(
            normalizedFile
        );

    if (!extension) {

        return {
            ok: false,
            status: "blocked",
            file: normalizedFile,
            extension: null,
            sourceType: null,
            reason:
                "AMBIGUOUS_FILE_EXTENSION",
            message:
                "No fue posible determinar la extensión del archivo."
        };
    }

    if (
        MODULE_EXTENSIONS.has(
            extension
        )
    ) {

        return {
            ok: true,
            status: "resolved",
            file: normalizedFile,
            extension,
            sourceType: "module"
        };
    }

    if (
        SCRIPT_EXTENSIONS.has(
            extension
        )
    ) {

        return {
            ok: true,
            status: "resolved",
            file: normalizedFile,
            extension,
            sourceType: "script"
        };
    }

    return {
        ok: false,
        status: "blocked",
        file: normalizedFile,
        extension,
        sourceType: null,
        reason:
            "UNSUPPORTED_JAVASCRIPT_EXTENSION",
        message:
            `La extensión ${extension} no pertenece a un archivo JavaScript soportado.`
    };
}

/* =====================================================================================
   CONSTRUCTOR DE RESULTADO BLOQUEADO
===================================================================================== */

function createBlockedResult({
    file,
    reason,
    message,
    extension = null,
    sourceType = null
}) {

    return {
        ok: false,
        status: "blocked",

        file:
            normalizeFilePath(file) ||
            null,

        reason,
        message,
        extension,
        sourceType,

        parser:
            "acorn",

        parserVersion:
            acornVersion ||
            null,

        validator:
            VALIDATOR_NAME,

        validatorVersion:
            VALIDATOR_VERSION,

        surface:
            "server",

        line: null,
        column: null,
        columnZeroBased: null,
        position: null
    };
}

/* =====================================================================================
   VALIDADOR JAVASCRIPT
===================================================================================== */

function validateJavaScriptSyntax({
    file,
    content
} = {}) {

    const fileResolution =
        resolveJavaScriptSourceType(
            file
        );

    if (!fileResolution.ok) {

        return createBlockedResult({
            file:
                fileResolution.file ||
                file,

            reason:
                fileResolution.reason,

            message:
                fileResolution.message,

            extension:
                fileResolution.extension,

            sourceType:
                fileResolution.sourceType
        });
    }

    if (
        typeof content !== "string"
    ) {

        return createBlockedResult({
            file:
                fileResolution.file,

            reason:
                "CONTENT_REQUIRED",

            message:
                "El contenido JavaScript debe ser una cadena de texto.",

            extension:
                fileResolution.extension,

            sourceType:
                fileResolution.sourceType
        });
    }

    if (
        content.trim().length === 0
    ) {

        return createBlockedResult({
            file:
                fileResolution.file,

            reason:
                "EMPTY_CONTENT_BLOCKED",

            message:
                "La validación bloqueó un archivo JavaScript vacío.",

            extension:
                fileResolution.extension,

            sourceType:
                fileResolution.sourceType
        });
    }

    if (
        typeof parse !== "function"
    ) {

        return createBlockedResult({
            file:
                fileResolution.file,

            reason:
                "PARSER_UNAVAILABLE",

            message:
                "Acorn no se encuentra disponible para validar el archivo.",

            extension:
                fileResolution.extension,

            sourceType:
                fileResolution.sourceType
        });
    }

    try {

        const syntaxTree =
            parse(
                content,
                {
                    ecmaVersion:
                        "latest",

                    sourceType:
                        fileResolution.sourceType,

                    locations:
                        true,

                    allowHashBang:
                        true
                }
            );

        return {
            ok: true,
            status: "valid",

            file:
                fileResolution.file,

            extension:
                fileResolution.extension,

            sourceType:
                fileResolution.sourceType,

            parser:
                "acorn",

            parserVersion:
                acornVersion,

            validator:
                VALIDATOR_NAME,

            validatorVersion:
                VALIDATOR_VERSION,

            surface:
                "server",

            contentLength:
                content.length,

            statements:
                Array.isArray(
                    syntaxTree?.body
                )
                    ? syntaxTree.body.length
                    : 0
        };

    } catch(error) {

        const line =
            Number.isInteger(
                error?.loc?.line
            )
                ? error.loc.line
                : null;

        const columnZeroBased =
            Number.isInteger(
                error?.loc?.column
            )
                ? error.loc.column
                : null;

        const position =
            Number.isInteger(
                error?.pos
            )
                ? error.pos
                : null;

        return {
            ok: false,
            status: "syntax_error",

            file:
                fileResolution.file,

            extension:
                fileResolution.extension,

            sourceType:
                fileResolution.sourceType,

            reason:
                "SYNTAX_VALIDATION_FAILED",

            message:
                String(
                    error?.message ||
                    "JavaScript syntax validation failed."
                ),

            line,

            column:
                columnZeroBased === null
                    ? null
                    : columnZeroBased + 1,

            columnZeroBased,
            position,

            parser:
                "acorn",

            parserVersion:
                acornVersion,

            validator:
                VALIDATOR_NAME,

            validatorVersion:
                VALIDATOR_VERSION,

            surface:
                "server"
        };
    }
}

/* =====================================================================================
   POLÍTICA GENERAL DE ESCRITURA
===================================================================================== */

function validateRepoWriteSyntax({
    file,
    content
} = {}) {

    const fileResolution =
        resolveJavaScriptSourceType(
            file
        );

    if (
        fileResolution.ok === true
    ) {

        return validateJavaScriptSyntax({
            file:
                fileResolution.file,

            content
        });
    }

    if (
        fileResolution.extension &&
        KNOWN_NON_JAVASCRIPT_EXTENSIONS.has(
            fileResolution.extension
        )
    ) {

        return {
            ok: true,
            status: "skipped",

            file:
                fileResolution.file,

            extension:
                fileResolution.extension,

            sourceType:
                null,

            reason:
                "KNOWN_NON_JAVASCRIPT_FILE",

            parser:
                null,

            parserVersion:
                null,

            validator:
                VALIDATOR_NAME,

            validatorVersion:
                VALIDATOR_VERSION,

            surface:
                "server"
        };
    }

    return createBlockedResult({
        file:
            fileResolution.file ||
            file,

        reason:
            fileResolution.reason ||
            "AMBIGUOUS_FILE_EXTENSION",

        message:
            fileResolution.message ||
            "No fue posible determinar un tipo de archivo seguro.",

        extension:
            fileResolution.extension,

        sourceType:
            fileResolution.sourceType
    });
}

/* =====================================================================================
   EXPORTACIONES
===================================================================================== */

module.exports = {
    resolveJavaScriptSourceType,
    validateJavaScriptSyntax,
    validateRepoWriteSyntax
};

