export const JARVIS_QUOTE_CALCULATOR_VERSION = "1.0.0-exact-minor-units";

function digitsOnly(value) {
    if (!value) return false;
    return Array.from(value).every(character => {
        const code = character.charCodeAt(0);
        return code >= 48 && code <= 57;
    });
}

function decimalParts(value, field, maximumDecimals = 2) {
    const source = String(value ?? "").trim();
    if (!source || source.startsWith("-") || source.startsWith("+")) throw new Error(`${field}_INVALID`);
    const parts = source.split(".");
    if (parts.length > 2 || !digitsOnly(parts[0]) || (parts[1] && !digitsOnly(parts[1])) || (parts[1]?.length || 0) > maximumDecimals) {
        throw new Error(`${field}_INVALID`);
    }
    return { whole: parts[0], fraction: parts[1] || "" };
}

function fixedUnits(value, field, decimals = 2) {
    const parts = decimalParts(value, field, decimals);
    return BigInt(parts.whole) * (10n ** BigInt(decimals)) + BigInt(parts.fraction.padEnd(decimals, "0") || "0");
}

function roundRatio(numerator, denominator) {
    return (numerator + denominator / 2n) / denominator;
}

function safeNumber(value, field) {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field}_OUT_OF_RANGE`);
    return Number(value);
}

function moneyFromMinor(minor, currency) {
    const numeric = safeNumber(minor, "QUOTE_MONEY") / 100;
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numeric);
}

export function calculateQuoteTotals(input = {}) {
    const currency = String(input.currency || "MXN").trim().toUpperCase();
    if (currency.length !== 3 || !Array.from(currency).every(character => character >= "A" && character <= "Z")) {
        throw new Error("QUOTE_CURRENCY_INVALID");
    }
    const subtotalMinor = fixedUnits(input.subtotal, "QUOTE_SUBTOTAL");
    const discountBasisPoints = fixedUnits(input.discountPercent ?? 0, "QUOTE_DISCOUNT_PERCENT");
    const taxBasisPoints = fixedUnits(input.taxPercent ?? 16, "QUOTE_TAX_PERCENT");
    if (discountBasisPoints > 10000n || taxBasisPoints > 10000n) throw new Error("QUOTE_PERCENT_OUT_OF_RANGE");

    const discountMinor = roundRatio(subtotalMinor * discountBasisPoints, 10000n);
    const taxableMinor = subtotalMinor - discountMinor;
    const taxMinor = roundRatio(taxableMinor * taxBasisPoints, 10000n);
    const totalMinor = taxableMinor + taxMinor;
    const minor = {
        subtotal: safeNumber(subtotalMinor, "QUOTE_SUBTOTAL"),
        discount: safeNumber(discountMinor, "QUOTE_DISCOUNT"),
        taxableSubtotal: safeNumber(taxableMinor, "QUOTE_TAXABLE_SUBTOTAL"),
        tax: safeNumber(taxMinor, "QUOTE_TAX"),
        total: safeNumber(totalMinor, "QUOTE_TOTAL")
    };

    return {
        ok: true,
        version: JARVIS_QUOTE_CALCULATOR_VERSION,
        currency,
        operationOrder: ["subtotal", "discount", "tax", "total"],
        percentages: {
            discount: Number(discountBasisPoints) / 100,
            tax: Number(taxBasisPoints) / 100
        },
        minor,
        values: Object.fromEntries(Object.entries(minor).map(([key, value]) => [key, value / 100])),
        formatted: Object.fromEntries(Object.entries(minor).map(([key, value]) => [key, moneyFromMinor(BigInt(value), currency)]))
    };
}

export function buildQuotePdfChanges(input = {}) {
    const calculation = calculateQuoteTotals(input);
    const fields = input.fields;
    if (!fields || typeof fields !== "object") throw new Error("QUOTE_PDF_FIELDS_REQUIRED");
    const definitions = [
        ["discount", input.discountLabel || "Descuento"],
        ["taxableSubtotal", input.taxableSubtotalLabel || "Subtotal con descuento"],
        ["tax", input.taxLabel || `IVA ${calculation.percentages.tax}%`],
        ["total", input.totalLabel || "Total"]
    ];
    const changes = definitions.map(([key, label]) => {
        const box = fields[key];
        if (!box || typeof box !== "object") throw new Error(`QUOTE_PDF_FIELD_REQUIRED:${key}`);
        return { ...box, text: `${label}: ${calculation.formatted[key]}` };
    });
    return {
        calculation,
        changes,
        changeLog: definitions.map(([key, label]) => ({ field: key, label, value: calculation.values[key], formatted: calculation.formatted[key] }))
    };
}
