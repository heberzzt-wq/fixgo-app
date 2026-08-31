/** Autoridad única para construir y leer el destino confirmado de un servicio B2C. */

const SOURCES = new Set(["mapa_pin", "waze_maps", "gps_dispositivo", "direccion_manual"]);

function finite(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
export function normalizeCoordinates(value) {
    const lat = finite(value?.lat ?? value?.latitude);
    const lng = finite(value?.lng ?? value?.longitude);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
}

export function extractCoordinatesFromMapInput(value) {
    const input = String(value ?? "").trim();
    if (!input) return null;
    let decoded = input;
    try { decoded = decodeURIComponent(input); } catch {}
    const patterns = [
        /(?:@|ll=|query=|q=)(-?\d{1,2}(?:\.\d+)?)[,%20\s]+(-?\d{1,3}(?:\.\d+)?)/i,
        /(-?\d{1,2}\.\d{3,})\s*[,\s]\s*(-?\d{1,3}\.\d{3,})/
    ];
    for (const pattern of patterns) {
        const match = decoded.match(pattern);
        const coords = match ? normalizeCoordinates({ lat: match[1], lng: match[2] }) : null;
        if (coords) return coords;
    }
    return null;
}

export function distanceMeters(a, b) {
    const start = normalizeCoordinates(a);
    const end = normalizeCoordinates(b);
    if (!start || !end) return null;
    const radius = 6371000;
    const toRad = degrees => degrees * Math.PI / 180;
    const dLat = toRad(end.lat - start.lat);
    const dLng = toRad(end.lng - start.lng);
    const value = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(start.lat)) * Math.cos(toRad(end.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function buildDestinationCandidates({ address, gps, mapLink, pin } = {}) {
    const writtenAddress = String(address ?? "").trim();
    const originalLink = String(mapLink ?? "").trim();
    const gpsCoords = normalizeCoordinates(gps);
    const linkCoords = extractCoordinatesFromMapInput(originalLink);
    const pinCoords = normalizeCoordinates(pin);
    const candidates = {};
    if (writtenAddress) candidates.direccion_manual = { direccion: writtenAddress, coords: null };
    if (gpsCoords) candidates.gps_dispositivo = { direccion: writtenAddress || null, coords: gpsCoords };
    if (originalLink) candidates.waze_maps = { direccion: writtenAddress || null, coords: linkCoords, link: originalLink };
    if (pinCoords) candidates.mapa_pin = { direccion: writtenAddress || null, coords: pinCoords };
    return {
        candidates,
        inputs: {
            direccion_escrita: writtenAddress || null,
            gps_dispositivo: gpsCoords,
            link_mapa: originalLink || null,
            coords_link: linkCoords,
            pin_mapa: pinCoords
        }
    };
}

export function findDestinationConflicts(candidates = {}, thresholdM = 150) {
    const withCoordinates = Object.entries(candidates).filter(([, value]) => normalizeCoordinates(value?.coords));
    const conflicts = [];
    for (let index = 0; index < withCoordinates.length; index += 1) {
        for (let other = index + 1; other < withCoordinates.length; other += 1) {
            const [sourceA, valueA] = withCoordinates[index];
            const [sourceB, valueB] = withCoordinates[other];
            const distance = distanceMeters(valueA.coords, valueB.coords);
            if (distance !== null && distance > thresholdM) conflicts.push({ sourceA, sourceB, distance_m: Math.round(distance) });
        }
    }
    return conflicts;
}

export function confirmDestination({ address, gps, mapLink, pin, selectedSource, confirmedAt = null } = {}) {
    if (!SOURCES.has(selectedSource)) throw new Error("DESTINATION_SOURCE_REQUIRED");
    const { candidates, inputs } = buildDestinationCandidates({ address, gps, mapLink, pin });
    const selected = candidates[selectedSource];
    if (!selected) throw new Error("DESTINATION_SOURCE_UNAVAILABLE");
    if (selectedSource === "waze_maps" && !selected.coords) throw new Error("MAP_LINK_COORDINATES_REQUIRED");
    const conflicts = findDestinationConflicts(candidates);
    return {
        direccion: String(selected.direccion || address || "").trim(),
        coords: normalizeCoordinates(selected.coords),
        fuente: selectedSource,
        fuente_direccion: String(address || "").trim() ? "direccion_manual" : selectedSource,
        confirmado_por_cliente: true,
        confirmado_at: confirmedAt,
        discrepancia: conflicts.length > 0,
        discrepancias: conflicts,
        inputs
    };
}

export function getConfirmedServiceDestination(service = {}, { allowLegacy = true } = {}) {
    const destination = service.destino;
    if (destination?.confirmado_por_cliente === true && SOURCES.has(destination.fuente)) {
        return { ...destination, coords: normalizeCoordinates(destination.coords), legacy: false };
    }
    if (!allowLegacy) return null;
    const legacyCoords = normalizeCoordinates(service.coords);
    const legacyAddress = String(service.direccion ?? "").trim();
    if (!legacyCoords && !legacyAddress) return null;
    return {
        direccion: legacyAddress,
        coords: legacyCoords,
        fuente: legacyCoords ? "gps_dispositivo" : "direccion_manual",
        fuente_direccion: legacyAddress ? "direccion_manual" : null,
        confirmado_por_cliente: false,
        confirmado_at: null,
        discrepancia: false,
        discrepancias: [],
        inputs: null,
        legacy: true
    };
}
