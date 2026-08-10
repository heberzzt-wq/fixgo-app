const DEFAULT_IDENTITY_FIELDS = Object.freeze([
    "brandName",
    "pageName",
    "title"
]);

function comparableIdentityText(value = "") {
    return String(value || "")
        .normalize("NFC")
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function compactIdentityText(value = "") {
    return comparableIdentityText(value).replaceAll(" ", "");
}

function boundedEditDistance(left = "", right = "", maximum = 2) {
    const a = String(left || "");
    const b = String(right || "");
    const limit = Math.max(0, Number(maximum) || 0);
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
        const current = [row];
        let rowMinimum = row;
        for (let column = 1; column <= b.length; column += 1) {
            const substitution = previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1);
            const insertion = current[column - 1] + 1;
            const deletion = previous[column] + 1;
            const value = Math.min(substitution, insertion, deletion);
            current.push(value);
            rowMinimum = Math.min(rowMinimum, value);
        }
        if (rowMinimum > limit) return limit + 1;
        previous = current;
    }
    return previous[b.length];
}

function identityThreshold(compact = "") {
    const length = String(compact || "").length;
    if (length < 6) return 1;
    return length >= 42 ? 2 : 1;
}

function originalLooksLikeAcronym(value = "") {
    const source = String(value || "").trim();
    return /^[A-Z0-9][A-Z0-9._-]{1,7}$/.test(source);
}

export function identityNearCopyMismatch(candidate = "", instruction = "") {
    const candidateComparable = comparableIdentityText(candidate);
    const sourceComparable = comparableIdentityText(instruction);
    const candidateCompact = candidateComparable.replaceAll(" ", "");
    const sourceCompact = sourceComparable.replaceAll(" ", "");
    if (!candidateComparable || !sourceComparable || !candidateCompact) return false;
    if (sourceCompact.includes(candidateCompact)) return false;

    const candidateWords = candidateComparable.split(" ").filter(Boolean);
    const allowSingleWord =
        candidateWords.length === 1 &&
        (originalLooksLikeAcronym(candidate) || candidateCompact.length >= 8);
    if (candidateWords.length < 2 && !allowSingleWord) return false;

    const sourceWords = sourceComparable.split(" ").filter(Boolean).slice(0, 2400);
    if (sourceWords.length < candidateWords.length) return false;
    const maximum = identityThreshold(candidateCompact);

    for (let index = 0; index <= sourceWords.length - candidateWords.length; index += 1) {
        const windowCompact = sourceWords
            .slice(index, index + candidateWords.length)
            .join("");
        if (Math.abs(windowCompact.length - candidateCompact.length) > maximum) continue;
        if (boundedEditDistance(candidateCompact, windowCompact, maximum) <= maximum) {
            return true;
        }
    }
    return false;
}

export function rejectCorruptedIdentityArgs(
    args = {},
    instruction = "",
    fields = DEFAULT_IDENTITY_FIELDS
) {
    const next = args && typeof args === "object" && !Array.isArray(args)
        ? { ...args }
        : {};
    for (const field of Array.isArray(fields) ? fields : DEFAULT_IDENTITY_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(next, field)) continue;
        if (identityNearCopyMismatch(next[field], instruction)) {
            delete next[field];
        }
    }
    return next;
}

function wordSpans(value = "") {
    const source = String(value || "");
    return [...source.matchAll(/[\p{L}\p{N}]+/gu)].map(match => ({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length
    }));
}

export function repairCanonicalIdentityCopy(value = "", canonicalIdentity = "") {
    const source = String(value || "");
    const canonical = String(canonicalIdentity || "").trim();
    const canonicalComparable = comparableIdentityText(canonical);
    const canonicalCompact = canonicalComparable.replaceAll(" ", "");
    if (!source || !canonical || !canonicalCompact) return source;

    const canonicalWords = canonicalComparable.split(" ").filter(Boolean);
    const allowSingleWord =
        canonicalWords.length === 1 &&
        (originalLooksLikeAcronym(canonical) || canonicalCompact.length >= 8);
    if (canonicalWords.length < 2 && !allowSingleWord) return source;

    const spans = wordSpans(source);
    if (spans.length < canonicalWords.length) return source;
    const maximum = identityThreshold(canonicalCompact);
    const replacements = [];

    for (let index = 0; index <= spans.length - canonicalWords.length; index += 1) {
        const first = spans[index];
        const last = spans[index + canonicalWords.length - 1];
        const fragment = source.slice(first.start, last.end);
        const fragmentCompact = compactIdentityText(fragment);
        if (!fragmentCompact || fragmentCompact === canonicalCompact) continue;
        if (Math.abs(fragmentCompact.length - canonicalCompact.length) > maximum) continue;
        if (boundedEditDistance(fragmentCompact, canonicalCompact, maximum) <= maximum) {
            replacements.push({ start: first.start, end: last.end });
            index += canonicalWords.length - 1;
        }
    }

    let repaired = source;
    for (const replacement of replacements.reverse()) {
        repaired = `${repaired.slice(0, replacement.start)}${canonical}${repaired.slice(replacement.end)}`;
    }
    return repaired;
}

export function repairCanonicalIdentityValue(value, canonicalIdentity = "") {
    if (typeof value === "string") {
        return repairCanonicalIdentityCopy(value, canonicalIdentity);
    }
    if (Array.isArray(value)) {
        return value.map(item => repairCanonicalIdentityValue(item, canonicalIdentity));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                repairCanonicalIdentityValue(item, canonicalIdentity)
            ])
        );
    }
    return value;
}
