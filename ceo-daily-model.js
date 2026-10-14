// Read projections only. Firestore remains the operational source of truth.
export const CEO_TIME_ZONE = "America/Cancun";

export function ceoDayKey(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CEO_TIME_ZONE,
        year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("-");
}

export function ceoDayBounds(day = ceoDayKey()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("CEO_DAY_INVALID");
    // Cancun has used UTC-5 without seasonal clock changes since 2015.
    const start = new Date(`${day}T00:00:00-05:00`);
    if (!Number.isFinite(start.getTime()) || ceoDayKey(start) !== day || day < "2015-02-01") {
        throw new Error("CEO_DAY_INVALID");
    }
    return { day, start, end: new Date(start.getTime() + 86400000) };
}

export function ceoAdminCaseUrl(serviceId, ticketId = "") {
    const id = String(serviceId || "");
    if (!id || id.includes("/") || id.length > 1500) return null;
    if (ticketId && (String(ticketId).includes("/") || String(ticketId).length > 1500)) return null;
    return `admin.html?serviceId=${encodeURIComponent(id)}${ticketId ? `&ticketId=${encodeURIComponent(ticketId)}` : ""}#expediente-ceo`;
}

export function ceoQueryState(snapshot) {
    if (snapshot.metadata?.fromCache !== false || snapshot.metadata?.hasPendingWrites === true) return { available: false, label: "Esperando datos del servidor" };
    return { available: true, count: snapshot.size, observedAt: new Date().toISOString() };
}

export function ceoDistinctRecords(pages) {
    if (pages.some(page => page === null)) return null;
    return [...new Set(pages.flat().map(record => record.id))];
}
