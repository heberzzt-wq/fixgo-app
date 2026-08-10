export function normalizePageFactualAudit(value = {}) {
    const payload = value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    const unsupportedClaims = Array.isArray(payload.unsupportedClaims)
        ? payload.unsupportedClaims
            .map(item => String(item || "").trim())
            .filter(Boolean)
            .slice(0, 40)
        : null;
    const pageInput = payload.pageInput &&
        typeof payload.pageInput === "object" &&
        !Array.isArray(payload.pageInput)
            ? payload.pageInput
            : null;
    const accepted =
        payload.ok === true &&
        Array.isArray(unsupportedClaims) &&
        unsupportedClaims.length === 0 &&
        Boolean(pageInput);
    return {
        ok: accepted,
        status: accepted
            ? "PAGE_FACTUAL_INTEGRITY_VERIFIED"
            : "PAGE_FACTUAL_INTEGRITY_INCOMPLETE",
        pageInput,
        unsupportedClaims:
            Array.isArray(unsupportedClaims)
                ? unsupportedClaims
                : ["FACTUAL_AUDIT_UNSUPPORTED_CLAIMS_REQUIRED"]
    };
}
