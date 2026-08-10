from pathlib import Path

RELEASE = "v94-generalist-page-integrity-v120-20260810"

identity_module = r'''const DEFAULT_IDENTITY_FIELDS = Object.freeze([
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
'''

identity_path = Path("gestia-core/jarvis/jarvis.identity.integrity.js")
if identity_path.exists():
    raise SystemExit("V120_IDENTITY_MODULE_ALREADY_EXISTS")
identity_path.write_text(identity_module, encoding="utf-8")

planner_path = Path("gestia-core/jarvis/jarvis.multifunction.planner.js")
planner = planner_path.read_text(encoding="utf-8")
planner_import = f'''import {{\n    rejectCorruptedIdentityArgs\n}} from "./jarvis.identity.integrity.js?v={RELEASE}";\n\n'''
if planner.startswith("import {"):
    raise SystemExit("V120_PLANNER_UNEXPECTED_EXISTING_IMPORT")
planner = planner_import + planner
policy_old = '    "La instruccion actual es la autoridad primaria; el historial, el estado previo y los adjuntos aportan contexto, pero no sustituyen ni arrastran una tarea anterior salvo continuidad o referencia inequívoca del usuario.",\n'
policy_new = policy_old + '    "Los nombres propios y las identidades explícitas de la solicitud actual se conservan fielmente: no los abrevies, renombres ni corrijas por aproximación. La creatividad puede producir identidades nuevas cuando esa sea realmente la intención, pero una copia casi igual de una identidad explícita no es una identidad nueva válida.",\n'
if planner.count(policy_old) != 1:
    raise SystemExit(f"V120_POLICY_ANCHOR_COUNT_{planner.count(policy_old)}")
planner = planner.replace(policy_old, policy_new, 1)
trusted_anchor = '''        if (!tool) continue;\n        if (\n            tool.name === "system.certify" &&'''
trusted_replacement = '''        if (!tool) continue;\n        args = rejectCorruptedIdentityArgs(\n            args,\n            context?.originalInstruction || ""\n        );\n        if (\n            tool.name === "system.certify" &&'''
if planner.count(trusted_anchor) != 1:
    raise SystemExit(f"V120_TRUSTED_PLAN_ANCHOR_COUNT_{planner.count(trusted_anchor)}")
planner = planner.replace(trusted_anchor, trusted_replacement, 1)
planner_path.write_text(planner, encoding="utf-8")

pack_path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
pack = pack_path.read_text(encoding="utf-8")
pack_import_anchor = '''import {\n    planMarketingRequest\n} from "./jarvis.marketing.engine.js?v=v94-marketing-real-delivery-v12-20260809";\n'''
pack_import_replacement = pack_import_anchor + f'''import {{\n    repairCanonicalIdentityValue\n}} from "./jarvis.identity.integrity.js?v={RELEASE}";\n'''
if pack.count(pack_import_anchor) != 1:
    raise SystemExit(f"V120_PACK_IMPORT_ANCHOR_COUNT_{pack.count(pack_import_anchor)}")
pack = pack.replace(pack_import_anchor, pack_import_replacement, 1)

signature_old = 'function normalizedPageArtifactInput(value = {}, fallbackTitle = "", fallbackRequiredSections = []) {'
signature_new = 'function normalizedPageArtifactInput(value = {}, fallbackTitle = "", fallbackRequiredSections = [], canonicalBrandName = "", canonicalTitle = "") {'
if pack.count(signature_old) != 1:
    raise SystemExit(f"V120_NORMALIZER_SIGNATURE_COUNT_{pack.count(signature_old)}")
pack = pack.replace(signature_old, signature_new, 1)

services_old = '''    const services = Array.isArray(value?.services)\n        ? value.services.slice(0, 12).map(service => ({'''
services_new = '''    const canonicalBrand = clean(canonicalBrandName);\n    const canonicalPageTitle = clean(canonicalTitle, fallbackTitle);\n    const repairedValue = canonicalBrand\n        ? repairCanonicalIdentityValue(value, canonicalBrand)\n        : value;\n    const services = Array.isArray(repairedValue?.services)\n        ? repairedValue.services.slice(0, 12).map(service => ({'''
if pack.count(services_old) != 1:
    raise SystemExit(f"V120_NORMALIZER_SERVICES_COUNT_{pack.count(services_old)}")
pack = pack.replace(services_old, services_new, 1)
pack = pack.replace('value?.requiredSections,\n        fallbackRequiredSections', 'repairedValue?.requiredSections,\n        fallbackRequiredSections', 1)
pack = pack.replace('const contentSections = normalizePageContentSections(value?.contentSections);', 'const contentSections = normalizePageContentSections(repairedValue?.contentSections);', 1)
return_old = '''        brandName: clean(value?.brandName),\n        title: clean(value?.title, fallbackTitle),\n        description: clean(value?.description),'''
return_new = '''        brandName: clean(canonicalBrand, clean(repairedValue?.brandName)),\n        title: clean(canonicalPageTitle, clean(repairedValue?.title)),\n        description: clean(repairedValue?.description),'''
if pack.count(return_old) != 1:
    raise SystemExit(f"V120_NORMALIZER_RETURN_COUNT_{pack.count(return_old)}")
pack = pack.replace(return_old, return_new, 1)

prompt_anchor = '                        "Devuelve solamente un objeto con brandName, title, description, services, requiredSections, contentSections, whatsapp, contactEmail y whatsappRequested.",\n'
prompt_replacement = prompt_anchor + '                        "MARCA_CANONICA y TITULO_CANONICO son identidad de la misión actual: consérvalos literalmente. Nunca cambies una sigla, palabra, acento o nombre por una aproximación creativa.",\n'
if pack.count(prompt_anchor) != 1:
    raise SystemExit(f"V120_PAGE_PROMPT_COUNT_{pack.count(prompt_anchor)}")
pack = pack.replace(prompt_anchor, prompt_replacement, 1)
pack = pack.replace('                        `MARCA=${clean(args.brandName)}`,\n                        `TITULO=${clean(args.title)}`,', '                        `MARCA_CANONICA=${clean(args.brandName)}`,\n                        `TITULO_CANONICO=${clean(args.title)}`,', 1)

call_old = '''                                clean(args.title),\n                                Array.isArray(args.sections) ? args.sections : []\n                            ),'''
call_new = '''                                clean(args.title),\n                                Array.isArray(args.sections) ? args.sections : [],\n                                clean(args.brandName),\n                                clean(args.title)\n                            ),'''
if pack.count(call_old) != 1:
    raise SystemExit(f"V120_NORMALIZER_CALL_COUNT_{pack.count(call_old)}")
pack = pack.replace(call_old, call_new, 1)

coverage_old = '''                const requestedSectionsSatisfied = missingSections.length === 0;\n                const ok =\n                    semantic?.ok === true &&\n                    pageInput.brandName &&'''
coverage_new = '''                const requestedSectionsSatisfied = missingSections.length === 0;\n                const canonicalBrandName = clean(args.brandName);\n                const canonicalTitle = clean(args.title);\n                const identityPreserved =\n                    (!canonicalBrandName || pageInput.brandName === canonicalBrandName) &&\n                    (!canonicalTitle || pageInput.title === canonicalTitle);\n                const ok =\n                    semantic?.ok === true &&\n                    identityPreserved &&\n                    pageInput.brandName &&'''
if pack.count(coverage_old) != 1:
    raise SystemExit(f"V120_COVERAGE_ANCHOR_COUNT_{pack.count(coverage_old)}")
pack = pack.replace(coverage_old, coverage_new, 1)
return_status_old = '''                    requestedSectionsSatisfied,\n                    missingSections,\n                    provider:'''
return_status_new = '''                    requestedSectionsSatisfied,\n                    identityPreserved,\n                    missingSections,\n                    provider:'''
if pack.count(return_status_old) != 1:
    raise SystemExit(f"V120_RETURN_STATUS_COUNT_{pack.count(return_status_old)}")
pack = pack.replace(return_status_old, return_status_new, 1)
pack_path.write_text(pack, encoding="utf-8")

creator_path = Path("gestia-core/jarvis/jarvis.page.creator.js")
creator = creator_path.read_text(encoding="utf-8")
creator_old = '''    const brandName = clean(input.brandName, "GestiaPremium");\n    const pageName = clean(input.pageName, "pagina-oficial");'''
creator_new = '''    const brandName = clean(input.brandName);\n    const pageName = clean(input.pageName, brandName || "pagina-oficial");'''
if creator.count(creator_old) != 1:
    raise SystemExit(f"V120_CREATOR_IDENTITY_COUNT_{creator.count(creator_old)}")
creator = creator.replace(creator_old, creator_new, 1)
creator = creator.replace('            title: clean(input.title, brandName),', '            title: clean(input.title, brandName || pageName),', 1)
creator = creator.replace('            description: clean(input.description, "Operacion profesional, trazable y premium."),', '            description: clean(input.description, "Página generada a partir de la solicitud actual."),', 1)
sections_old = '''            sections: input.sections || [\n                "hero",\n                "beneficios",\n                "servicios",\n                "como_funciona",\n                "prueba_social",\n                "cta",\n                "footer"\n            ],'''
sections_new = '''            sections: Array.isArray(input.sections)\n                ? input.sections.slice(0, 32)\n                : [],'''
if creator.count(sections_old) != 1:
    raise SystemExit(f"V120_CREATOR_SECTIONS_COUNT_{creator.count(sections_old)}")
creator = creator.replace(sections_old, sections_new, 1)
creator_path.write_text(creator, encoding="utf-8")

print("V120_GENERALIST_PAGE_INTEGRITY_PATCH_APPLIED")
