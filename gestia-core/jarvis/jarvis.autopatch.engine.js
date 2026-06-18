/**
 * ==================================================
 * JARVIS AUTOPATCH ENGINE v2.0
 * Builds safe, explicit patch operations from scanner findings.
 * ==================================================
 */

const VERSION = "2.0.0-safe-operations";

export function buildAutoPatch(scan = {}) {
    const file = scan.file || "";
    const findings =
        Array.isArray(scan.findings)
            ? scan.findings
            : [];

    const patches =
        findings
            .flatMap(finding => patchFromFinding(finding, file))
            .filter(Boolean);

    if (!patches.length) {
        patches.push({
            id: "PATCH_NONE",
            title: "Sin parche automatico seguro",
            risk: "LOW",
            safe: true,
            autoApply: false,
            confidence: 0.9,
            operations: [],
            code: "// Sin cambios automaticos seguros"
        });
    }

    return {
        ok: true,
        engine: "jarvis_autopatch_engine",
        version: VERSION,
        file,
        total: patches.length,
        safePatches:
            patches.filter(patch => patch.safe === true && patch.autoApply === true).length,
        patches
    };
}

function patchFromFinding(finding = {}, file = "") {
    switch (finding.id) {
        case "LOWERCASE_DATE_NOW":
            return [{
                id: "PATCH_LOWERCASE_DATE_NOW",
                title: "Corregir Date.now",
                risk: "LOW",
                safe: true,
                autoApply: true,
                confidence: 0.99,
                sourceFinding: finding.id,
                file,
                evidence: finding.evidence || null,
                operations: [
                    {
                        type: "replace_all",
                        find: "date.now()",
                        replace: "Date.now()"
                    }
                ],
                before: "date.now()",
                after: "Date.now()",
                code: "date.now() -> Date.now()"
            }];

        case "OPEN_SAFE_EDIT_ZONE":
        case "UNBALANCED_SYNTAX_DELIMITERS":
        case "HARDCODED_SECRET_LITERAL":
        case "DYNAMIC_CODE_EXECUTION":
            return [{
                id: `PATCH_BLOCKED_${finding.id}`,
                title: "Parche automatico bloqueado",
                risk:
                    finding.severity === "CRITICAL"
                        ? "CRITICAL"
                        : "HIGH",
                safe: false,
                autoApply: false,
                confidence: finding.confidence || 0.8,
                sourceFinding: finding.id,
                file,
                evidence: finding.evidence || null,
                operations: [],
                code: "Requiere intervencion manual segura."
            }];

        default:
            if (finding.patchable === true && finding.action) {
                return [{
                    id: `PATCH_${String(finding.id || "GENERIC").toUpperCase()}`,
                    title: finding.title || "Parche sugerido",
                    risk: riskFromSeverity(finding.severity),
                    safe: finding.safe !== false,
                    autoApply: finding.safe !== false,
                    confidence: finding.confidence || 0.7,
                    sourceFinding: finding.id || null,
                    file,
                    evidence: finding.evidence || null,
                    operations: [finding.action],
                    code: `${finding.action.find || ""} -> ${finding.action.replace || ""}`.trim()
                }];
            }

            return [];
    }
}

function riskFromSeverity(severity = "LOW") {
    if (severity === "CRITICAL") return "CRITICAL";
    if (severity === "HIGH") return "HIGH";
    if (severity === "MEDIUM") return "MEDIUM";
    return "LOW";
}
