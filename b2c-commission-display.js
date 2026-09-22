// Presentation reference only. Settlement resolves service overrides in the backend.
export function technicianCommissionReference(value) {
    const missing = value === null || value === undefined || typeof value === "boolean" ||
        (typeof value === "string" && !value.trim());
    const rate = missing ? 0.32 : Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) return null;
    return Math.round((1 - rate) * 100);
}

export const COMMISSION_REFERENCE_NOTICE = "Referencia del perfil. El importe final depende de la tarifa aplicada a cada servicio.";
