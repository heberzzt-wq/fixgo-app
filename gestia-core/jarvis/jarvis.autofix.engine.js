/**
 * ==================================================
 * JARVIS AUTOFIX ENGINE v2.0
 * Converts scanner findings into ranked repair actions.
 * ==================================================
 */

const VERSION = "2.0.0-evidence-actions";

const PRIORITY_BY_SEVERITY = {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
    INFO: "LOW"
};

export function buildAutoFix(scan = {}) {
    const file = scan.file || "archivo";
    const findings =
        Array.isArray(scan.findings) && scan.findings.length
            ? scan.findings
            : legacyFindingsFromFlags(scan);

    const fixes =
        findings
            .map(finding => fixFromFinding(finding, file, scan))
            .filter(Boolean)
            .sort(sortFixes);

    if (!fixes.length) {
        fixes.push({
            id: "FIX_OK_STABLE",
            type: "OK",
            priority: "LOW",
            title: "Sin correcciones criticas",
            summary: "El scanner no encontro hallazgos que requieran accion inmediata.",
            patchable: false,
            safe: true,
            confidence: 0.9,
            sourceFinding: null,
            actions: [],
            patch: "Estructura estable."
        });
    }

    return {
        ok: true,
        engine: "jarvis_autofix_engine",
        version: VERSION,
        file,
        total: fixes.length,
        blocking:
            fixes.some(fix => fix.blocking === true),
        patchable:
            fixes.filter(fix => fix.patchable === true).length,
        fixes
    };
}

function fixFromFinding(finding = {}, file = "archivo", scan = {}) {
    const severity = finding.severity || "INFO";
    const priority = PRIORITY_BY_SEVERITY[severity] || "LOW";

    switch (finding.id) {
        case "EMPTY_SOURCE":
            return {
                id: "FIX_EMPTY_SOURCE_BLOCK",
                type: "BLOCK",
                priority: "CRITICAL",
                title: "Bloquear escritura vacia",
                summary: `${file} no tiene contenido ejecutable. Jarvis debe pedir contenido o regenerar el plan antes de escribir.`,
                patchable: false,
                safe: false,
                blocking: true,
                confidence: 1,
                sourceFinding: finding.id,
                actions: [
                    {
                        type: "clarify_or_regenerate",
                        reason: "empty_source"
                    }
                ],
                patch: "No escribir archivo vacio."
            };

        case "LOWERCASE_DATE_NOW":
            return {
                id: "FIX_LOWERCASE_DATE_NOW",
                type: "SAFE_REPLACE",
                priority,
                title: "Corregir Date.now",
                summary: "Reemplazar date.now() por Date.now() para evitar fallo runtime.",
                patchable: true,
                safe: true,
                confidence: 0.99,
                sourceFinding: finding.id,
                evidence: finding.evidence || null,
                actions: [
                    {
                        type: "replace_all",
                        find: "date.now()",
                        replace: "Date.now()"
                    }
                ],
                patch: "date.now() -> Date.now()"
            };

        case "HARDCODED_SECRET_LITERAL":
            return {
                id: "FIX_SECRET_TO_ENV",
                type: "SECURITY",
                priority: "CRITICAL",
                title: "Mover secreto fuera del codigo",
                summary: "Hay un literal con forma de secreto. No se debe autoparchear sin definir nombre de secreto/entorno.",
                patchable: false,
                safe: false,
                blocking: true,
                confidence: finding.confidence || 0.86,
                sourceFinding: finding.id,
                evidence: finding.evidence || null,
                actions: [
                    {
                        type: "manual_secret_migration",
                        target: "Secret Manager / process.env"
                    }
                ],
                patch: "Mover secreto a configuracion segura."
            };

        case "DYNAMIC_CODE_EXECUTION":
            return {
                id: "FIX_REMOVE_DYNAMIC_EXECUTION",
                type: "SECURITY",
                priority: "CRITICAL",
                title: "Eliminar ejecucion dinamica",
                summary: "eval/Function requieren reemplazo manual por rutas deterministas.",
                patchable: false,
                safe: false,
                blocking: true,
                confidence: finding.confidence || 0.9,
                sourceFinding: finding.id,
                evidence: finding.evidence || null,
                actions: [
                    {
                        type: "manual_refactor",
                        target: "dynamic_execution"
                    }
                ],
                patch: "Reemplazar ejecucion dinamica por handlers explicitos."
            };

        case "UNBALANCED_SYNTAX_DELIMITERS":
            return {
                id: "FIX_VALIDATE_SYNTAX",
                type: "SYNTAX",
                priority,
                title: "Validar sintaxis antes de escribir",
                summary: "El balance de delimitadores no cuadra. Ejecutar validador parser antes del commit.",
                patchable: false,
                safe: false,
                blocking: true,
                confidence: finding.confidence || 0.72,
                sourceFinding: finding.id,
                evidence: finding.evidence || null,
                actions: [
                    {
                        type: "run_parser_validation",
                        file
                    }
                ],
                patch: "Revisar sintaxis con parser."
            };

        case "INNERHTML_ASSIGNMENT":
            return {
                id: "FIX_REVIEW_INNERHTML",
                type: "DOM_SECURITY",
                priority,
                title: "Revisar innerHTML",
                summary: "Cambiar a textContent/template seguro si el contenido viene de usuario o IA.",
                patchable: false,
                safe: true,
                confidence: finding.confidence || 0.78,
                sourceFinding: finding.id,
                evidence: finding.evidence || null,
                actions: [
                    {
                        type: "review_dom_sink",
                        preferred: "textContent_or_sanitized_template"
                    }
                ],
                patch: "Revisar sink DOM antes de autoparchear."
            };

        case "LARGE_FILE":
            return {
                id: "FIX_PLAN_MODULARIZATION",
                type: "REFACTOR",
                priority,
                title: "Planear modularizacion",
                summary: `${file} es grande. Limitar parches a zonas pequenas o dividir por responsabilidad.`,
                patchable: false,
                safe: true,
                confidence: 0.95,
                sourceFinding: finding.id,
                actions: [
                    {
                        type: "limit_patch_scope",
                        maxLines: 120
                    }
                ],
                patch: "Crear plan modular antes de cambios amplios."
            };

        case "MIXED_UI_AUTH_DB":
            return {
                id: "FIX_SEPARATE_UI_AUTH_DB",
                type: "ARCHITECTURE",
                priority,
                title: "Separar UI/Auth/DB",
                summary: "Separar render, autoridad y persistencia antes de reparaciones grandes.",
                patchable: false,
                safe: true,
                confidence: finding.confidence || 0.82,
                sourceFinding: finding.id,
                actions: [
                    {
                        type: "architecture_plan",
                        layers: ["ui", "auth", "db"]
                    }
                ],
                patch: "Dividir responsabilidades en modulos."
            };

        default:
            return {
                id: `FIX_${String(finding.id || "UNKNOWN").toUpperCase()}`,
                type: "REVIEW",
                priority,
                title: finding.title || "Revisar hallazgo",
                summary: finding.message || "Jarvis requiere revision contextual.",
                patchable: finding.patchable === true,
                safe: finding.safe !== false,
                confidence: finding.confidence || 0.7,
                sourceFinding: finding.id || null,
                evidence: finding.evidence || null,
                actions: finding.action ? [finding.action] : [],
                patch: finding.patchable ? "Aplicar accion sugerida por scanner." : "Revision manual."
            };
    }
}

function legacyFindingsFromFlags(scan = {}) {
    const flags = scan.flags || [];

    return flags.map(flag => ({
        id: flag,
        severity:
            flag === "LARGE_FILE" ||
            flag === "MIXED_UI_AUTH_DB"
                ? "HIGH"
                : "MEDIUM",
        title: flag,
        message: flag,
        patchable: false,
        safe: true,
        confidence: 0.65
    }));
}

function sortFixes(a = {}, b = {}) {
    const order = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3
    };

    return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
}
