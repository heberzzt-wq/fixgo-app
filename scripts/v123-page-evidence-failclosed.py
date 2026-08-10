from pathlib import Path
import json
import re

ROOT = Path('.')
OLD_RELEASE = 'v94-generalist-execution-contract-v122-20260810'
NEW_RELEASE = 'v94-page-evidence-failclosed-v123-20260810'
OLD_FS_VERSION = '2.39.0-generalist-execution-contract-v122'
NEW_FS_VERSION = '2.40.0-page-evidence-failclosed-v123'


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'REPLACE_COUNT:{path}:{count}:1:{old[:100]}')
    write(path, text.replace(old, new, 1))


def replace_all(path, old, new, minimum=1):
    text = read(path)
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f'REPLACE_COUNT:{path}:{count}:>={minimum}:{old[:100]}')
    write(path, text.replace(old, new))


# 1. Generic evidence-integrity state for page composition.
pack = 'gestia-core/jarvis/jarvis.multitool.pack.js'
canonical_marker = '''function canonicalEvidenceEnvelope(context = {}) {
    const evidence = Array.isArray(context?.canonicalEvidence)
        ? context.canonicalEvidence
        : [];
    try {
        return JSON.stringify(evidence).slice(0, 30000);
    } catch {
        return "[]";
    }
}
'''
helpers = canonical_marker + r'''

function normalizePageIdentityEvidenceText(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function collectPageIdentityEvidenceText(value, depth = 0) {
    if (value === null || value === undefined || depth > 5) return "";
    if (typeof value === "string" || typeof value === "number") {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value
            .map(item => collectPageIdentityEvidenceText(item, depth + 1))
            .filter(Boolean)
            .join(" ");
    }
    if (typeof value !== "object") return "";

    const ignoredKeyFragments = [
        "url", "href", "query", "search", "request", "input", "prompt", "instruction"
    ];
    return Object.entries(value)
        .filter(([key]) => {
            const normalizedKey = String(key || "").toLowerCase();
            return !ignoredKeyFragments.some(fragment => normalizedKey.includes(fragment));
        })
        .map(([, nested]) => collectPageIdentityEvidenceText(nested, depth + 1))
        .filter(Boolean)
        .join(" ");
}

function pageResearchIdentityState(context = {}, canonicalBrandName = "") {
    const researchItems = Array.isArray(context?.canonicalEvidence)
        ? context.canonicalEvidence.filter(item => String(item?.tool || "") === "web.research")
        : [];
    const validSources = researchItems.flatMap(item =>
        Array.isArray(item?.validSources)
            ? item.validSources.filter(source => source && typeof source === "object")
            : []
    );
    const canonicalIdentity = normalizePageIdentityEvidenceText(canonicalBrandName);
    const identityGrounded = Boolean(canonicalIdentity) && validSources.some(source => {
        const sourceText = normalizePageIdentityEvidenceText(
            collectPageIdentityEvidenceText(source)
        );
        return Boolean(sourceText) && sourceText.includes(canonicalIdentity);
    });

    return {
        researchObserved: researchItems.length > 0,
        identityGrounded: canonicalIdentity ? identityGrounded : null,
        validSourceCount: validSources.length
    };
}

function limitedEvidencePageInput({
    brandName = "",
    title = "",
    requiredSections = []
} = {}) {
    const disclosure =
        "No hay evidencia suficiente para publicar como hechos la actividad, los servicios o los datos de contacto asociados a este nombre.";
    const sectionDisclosure =
        "Esta sección queda pendiente de verificación. No se publica información específica hasta contar con evidencia suficiente y atribuible a la entidad correcta.";
    const sections = [...new Set(
        (Array.isArray(requiredSections) ? requiredSections : [])
            .map(item =>
                typeof item === "string"
                    ? item
                    : String(item?.title || item?.name || item?.label || "")
            )
            .map(item => String(item || "").trim())
            .filter(Boolean)
    )].slice(0, 24);

    return {
        brandName: clean(brandName),
        title: clean(title, clean(brandName, "Página informativa")),
        description: disclosure,
        services: [],
        requiredSections: sections,
        contentSections: sections.map(sectionTitle => ({
            title: sectionTitle,
            description: sectionDisclosure,
            items: []
        })),
        whatsapp: "",
        contactEmail: "",
        whatsappRequested: false,
        evidenceMode: "insufficient"
    };
}
'''
replace_once(pack, canonical_marker, helpers)

replace_once(
    pack,
    '''        whatsapp: clean(value?.whatsapp).replace(/[^0-9]/g, ""),
        contactEmail: clean(value?.contactEmail),
        whatsappRequested: value?.whatsappRequested === true
''',
    '''        whatsapp: clean(value?.whatsapp).replace(/[^0-9]/g, ""),
        contactEmail: clean(value?.contactEmail),
        whatsappRequested: value?.whatsappRequested === true,
        evidenceMode:
            clean(value?.evidenceMode).toLowerCase() === "insufficient"
                ? "insufficient"
                : ""
'''
)

replace_once(
    pack,
    '"Devuelve solamente un objeto con brandName, title, description, services, requiredSections, contentSections, whatsapp, contactEmail y whatsappRequested.",',
    '"Devuelve solamente un objeto con brandName, title, description, services, requiredSections, contentSections, whatsapp, contactEmail, whatsappRequested y evidenceMode.",'
)
replace_once(
    pack,
    '"La descripción debe tener al menos 20 caracteres y debe existir por lo menos un servicio.",',
    '"No fuerces servicios para completar el esquema. Si la evidencia no sustenta al menos un servicio real atribuible a la entidad correcta, devuelve services=[] y evidenceMode=\\"insufficient\\"; nunca rellenes el hueco con servicios genéricos.",'
)

page_compose_marker = '''                const canonicalEvidence =
                    canonicalEvidenceEnvelope(context);
                let semantic = await fetchSemanticConversation(
                    [
                        "Redacta el contenido completo de una landing page como JSON estricto.",
'''
page_compose_insert = '''                const canonicalEvidence =
                    canonicalEvidenceEnvelope(context);
                const identityEvidence =
                    pageResearchIdentityState(
                        context,
                        clean(args.brandName)
                    );
                if (
                    identityEvidence.researchObserved === true &&
                    identityEvidence.identityGrounded === false
                ) {
                    const pageInput =
                        limitedEvidencePageInput({
                            brandName: args.brandName,
                            title: args.title,
                            requiredSections:
                                Array.isArray(args.sections)
                                    ? args.sections
                                    : []
                        });
                    return {
                        ok: true,
                        status: "PAGE_CONTENT_COMPOSED",
                        pageInput,
                        requestedSectionsSatisfied: true,
                        identityPreserved: true,
                        factualIntegrityPassed: true,
                        factualAudit: {
                            status: "PAGE_FACTUAL_INTEGRITY_LIMITED_EVIDENCE",
                            unsupportedClaims: [],
                            provider: null,
                            model: null
                        },
                        missingSections: [],
                        provider: null,
                        model: null,
                        original: true,
                        readOnly: true,
                        objectiveSatisfied: true,
                        limitedEvidence: true,
                        evidenceIntegrity: identityEvidence,
                        error: null
                    };
                }
                let semantic = await fetchSemanticConversation(
                    [
                        "Redacta el contenido completo de una landing page como JSON estricto.",
'''
replace_once(pack, page_compose_marker, page_compose_insert)

replace_once(
    pack,
    '"Si una afirmación no está sustentada, elimínala o reescríbela sin afirmar una capacidad existente.",',
    '"Si una afirmación no está sustentada, elimínala. No conviertas ausencia de evidencia en capacidades plausibles. Si no queda ningún servicio sustentado, usa services=[] y evidenceMode=\\"insufficient\\".",'
)

factual_post_marker = '''                if (factualAudit.ok === true) {
                    pageInput =
                        groundPageContactInput(
                            normalizePageArtifactInput(
                                factualAudit.pageInput
                            ),
                            {
                                contactEmail:
                                    args.contactEmail,
                                whatsapp:
                                    args.whatsapp,
                                whatsappRequested:
                                    args.whatsappRequested === true
                            }
                        );
                }
                const factualIntegrityPassed =
                    factualAudit.ok === true;
'''
factual_post_new = '''                if (factualAudit.ok === true) {
                    pageInput =
                        groundPageContactInput(
                            normalizePageArtifactInput(
                                factualAudit.pageInput
                            ),
                            {
                                contactEmail:
                                    args.contactEmail,
                                whatsapp:
                                    args.whatsapp,
                                whatsappRequested:
                                    args.whatsappRequested === true
                            }
                        );
                }
                if (
                    factualAudit.ok === true &&
                    identityEvidence.researchObserved === true &&
                    (
                        pageInput.evidenceMode === "insufficient" ||
                        !Array.isArray(pageInput.services) ||
                        pageInput.services.length === 0
                    )
                ) {
                    pageInput =
                        limitedEvidencePageInput({
                            brandName: pageInput.brandName || args.brandName,
                            title: pageInput.title || args.title,
                            requiredSections:
                                Array.isArray(pageInput.requiredSections) &&
                                pageInput.requiredSections.length > 0
                                    ? pageInput.requiredSections
                                    : args.sections
                        });
                }
                const factualIntegrityPassed =
                    factualAudit.ok === true;
'''
replace_once(pack, factual_post_marker, factual_post_new)

ok_marker = '''                const ok =
                    semantic?.ok === true &&
                    factualIntegrityPassed &&
                    identityPreserved &&
                    Boolean(pageInput.brandName) &&
                    Boolean(pageInput.title) &&
                    pageInput.description.length >= 20 &&
                    pageInput.services.length > 0 &&
                    requestedSectionsSatisfied;
'''
ok_new = '''                const limitedEvidence =
                    pageInput.evidenceMode === "insufficient";
                const ok =
                    semantic?.ok === true &&
                    factualIntegrityPassed &&
                    identityPreserved &&
                    Boolean(pageInput.brandName) &&
                    Boolean(pageInput.title) &&
                    pageInput.description.length >= 20 &&
                    Array.isArray(pageInput.services) &&
                    (pageInput.services.length > 0 || limitedEvidence) &&
                    requestedSectionsSatisfied;
'''
replace_once(pack, ok_marker, ok_new)

return_marker = '''                    readOnly: true,
                    objectiveSatisfied:
                        ok,
                    error:
'''
return_new = '''                    readOnly: true,
                    objectiveSatisfied:
                        ok,
                    limitedEvidence,
                    evidenceIntegrity:
                        identityEvidence,
                    error:
'''
replace_once(pack, return_marker, return_new)

# 2. Renderer gets a deterministic non-business page mode.
artifact = 'jarvis-page-artifact.js'
limited_renderer = r'''
function buildInsufficientEvidencePageHtml(input = {}) {
    const brandName = text(input.brandName);
    const title = text(input.title, brandName || "Página informativa");
    if (!brandName || !title) throw new Error("PAGE_IDENTITY_REQUIRED");

    const description =
        "No hay evidencia suficiente para publicar como hechos la actividad, los servicios o los datos de contacto asociados a este nombre.";
    const requiredSections = requiredPageSections(input);
    const sectionMarkup = requiredSections.map(section => `
<section id="contenido-${escapeHtml(section.key)}" data-requested-section="${escapeHtml(section.key)}">
  <div class="wrap"><p class="eyebrow">Pendiente de verificación</p><h2>${escapeHtml(section.title)}</h2>
  <p>Esta sección queda pendiente de verificación. No se publica información específica hasta contar con evidencia suficiente y atribuible a la entidad correcta.</p></div>
</section>`).join("");
    const sectionLinks = requiredSections.map(section =>
        `<a href="#contenido-${escapeHtml(section.key)}">${escapeHtml(section.title)}</a>`
    ).join("");
    const structuredData = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: title,
        description
    }).replaceAll("<", "\\u003c");

    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | ${escapeHtml(brandName)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta name="theme-color" content="#2563eb"><script type="application/ld+json">${structuredData}</script>
<style>:root{--ink:#0f172a;--muted:#475569;--line:#cbd5e1;--soft:#f8fafc;--primary:#2563eb}*{box-sizing:border-box}body{margin:0;font:16px/1.65 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);background:#fff}.wrap{width:min(980px,calc(100% - 2rem));margin:auto}.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:#fff;padding:.7rem;z-index:9}header{border-bottom:1px solid var(--line);background:#fff}.nav{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:1rem}.brand{font-weight:850;text-decoration:none}.links{display:flex;flex-wrap:wrap;gap:1rem}.links a{color:var(--primary)}.hero{padding:6rem 0;background:linear-gradient(135deg,#eff6ff,var(--soft))}.eyebrow{font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--primary);font-size:.78rem}h1{font-size:clamp(2.3rem,7vw,5rem);line-height:1.03;letter-spacing:-.04em;max-width:15ch}h2{font-size:clamp(1.8rem,5vw,3rem);line-height:1.08}p{max-width:72ch;color:var(--muted)}.button{display:inline-block;margin-top:1rem;padding:.8rem 1.1rem;border-radius:999px;background:var(--primary);color:#fff;text-decoration:none;font-weight:750}section{padding:4.5rem 0}section:nth-of-type(even){background:var(--soft)}#verificacion{border-top:1px solid var(--line)}footer{padding:2rem 0;background:#020617;color:#cbd5e1}@media(max-width:780px){.nav{align-items:flex-start;flex-direction:column;padding:1rem 0}.links{flex-direction:column}.hero{padding:4rem 0}section{padding:3.5rem 0}}</style></head>
<body><a class="skip" href="#contenido">Saltar al contenido</a><header><nav class="nav wrap" aria-label="Principal"><a class="brand" href="#contenido">${escapeHtml(brandName)}</a><div class="links">${sectionLinks}<a href="#verificacion">Estado de verificación</a></div></nav></header><main id="contenido"><section class="hero"><div class="wrap"><p class="eyebrow">Información pendiente de verificación</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><a class="button" href="#verificacion">Ver estado de verificación</a></div></section>${sectionMarkup}<section id="verificacion"><div class="wrap"><p class="eyebrow">Estado de la evidencia</p><h2>Información pendiente de verificación</h2><p>La investigación realizada no permitió verificar con suficiente certeza la identidad exacta asociada a este nombre. Por esa razón, esta versión no publica servicios, datos de contacto, experiencia, certificaciones, testimonios ni otras afirmaciones operativas.</p></div></section></main><footer><div class="wrap">Página provisional · información pendiente de verificación.</div></footer></body></html>`;
}

'''
artifact_text = read(artifact)
marker = 'export function buildPageArtifactHtml(input = {}) {'
if marker not in artifact_text:
    raise SystemExit('BUILD_PAGE_MARKER_MISSING')
artifact_text = artifact_text.replace(marker, limited_renderer + marker, 1)
artifact_text = artifact_text.replace(
    marker,
    marker + '\n    if (text(input?.evidenceMode).toLowerCase() === "insufficient") {\n        return buildInsufficientEvidencePageHtml(input);\n    }',
    1
)
describe_marker = 'export function describePageArtifact(input = {}, html = "") {\n    const { hasContactRoute } = pageContactState(input);'
describe_new = r'''export function describePageArtifact(input = {}, html = "") {
    if (text(input?.evidenceMode).toLowerCase() === "insufficient") {
        const requiredSections = requiredPageSections(input);
        const renderedSections = requiredSections.map(section => ({
            title: section.title,
            key: section.key
        }));
        const requestedSectionsSatisfied = requiredSections.every(section =>
            html.includes(`data-requested-section="${section.key}"`)
        );
        const checks = {
            responsive: html.includes("@media(max-width:780px)"),
            accessibility: html.includes("Saltar al contenido") && html.includes("aria-label"),
            seo: html.includes('name="description"') && html.includes('property="og:title"'),
            structuredData:
                html.includes("application/ld+json") &&
                html.includes('"@type":"WebPage"') &&
                !html.includes('"@type":"Organization"'),
            verification: html.includes('id="verificacion"'),
            services:
                !html.includes('id="servicios"') &&
                !html.includes("Servicios y capacidades"),
            requestedSections: requestedSectionsSatisfied,
            contact:
                !html.includes('id="contacto"') &&
                !html.includes('class="contact-form"') &&
                !html.includes("wa.me") &&
                !html.includes("mailto:"),
            noTodoMarkers:
                !html.includes("TODO") &&
                !html.includes("Lorem ipsum") &&
                !html.includes("undefined")
        };
        return {
            ok: Object.values(checks).every(Boolean),
            bytes: utf8ByteLength(html),
            checks,
            brandName: text(input.brandName),
            title: text(input.title),
            hasContactRoute: false,
            requiredSections,
            renderedSections,
            evidenceMode: "insufficient"
        };
    }
    const { hasContactRoute } = pageContactState(input);'''
if describe_marker not in artifact_text:
    raise SystemExit('DESCRIBE_PAGE_MARKER_MISSING')
artifact_text = artifact_text.replace(describe_marker, describe_new, 1)
write(artifact, artifact_text)

# 3. Page execution accepts zero services only in the explicit fail-closed mode.
core = 'gestia-core/gestia-core.js'
replace_once(
    core,
    '''                            pageInput.brandName &&
                            pageInput.title &&
                            Array.isArray(pageInput.services) &&
                            pageInput.services.length > 0
''',
    '''                            pageInput.brandName &&
                            pageInput.title &&
                            Array.isArray(pageInput.services) &&
                            (
                                pageInput.services.length > 0 ||
                                pageInput.evidenceMode === "insufficient"
                            )
'''
)
replace_once(
    core,
    '''                        const directPageReady =
                            executionCall.args.brandName &&
                            executionCall.args.title &&
                            executionCall.args.description &&
                            Array.isArray(executionCall.args.services) &&
                            executionCall.args.services.length > 0;
''',
    '''                        const directPageReady =
                            executionCall.args.brandName &&
                            executionCall.args.title &&
                            executionCall.args.description &&
                            Array.isArray(executionCall.args.services) &&
                            (
                                executionCall.args.services.length > 0 ||
                                executionCall.args.evidenceMode === "insufficient"
                            );
'''
)

# 4. Dependency insertion recognizes an already fail-closed page blueprint.
deps = 'gestia-core/jarvis/jarvis.mission.dependencies.js'
replace_once(deps, 'const VERSION = "1.1.0-generalist-execution-contract-v122";', 'const VERSION = "1.2.0-page-evidence-failclosed-v123";')
replace_once(
    deps,
    '''        Array.isArray(source.services) &&
        source.services.length > 0
''',
    '''        Array.isArray(source.services) &&
        (
            source.services.length > 0 ||
            source.evidenceMode === "insufficient"
        )
'''
)

# 5. Expose the explicit renderer mode to page.create and flush its renderer import.
actuator = 'gestia-core/jarvis/jarvis.actuator.pack.js'
replace_once(
    actuator,
    'from "../../jarvis-page-artifact.js?v=v94-generalist-production-integrity-v121-20260810";',
    f'from "../../jarvis-page-artifact.js?v={NEW_RELEASE}";'
)
replace_once(
    actuator,
    '''                brandName: "string", title: "string", description: "string", services: "array",
''',
    '''                brandName: "string", title: "string", description: "string", services: "array", evidenceMode: "verified|insufficient",
'''
)

# 6. Bridge/runtime identity and browser cache lineage.
replace_once('jarvis-fs-bridge.js', OLD_FS_VERSION, NEW_FS_VERSION)
write('jarvis-runtime-contract.json', json.dumps({
    'projectId': 'fixgo-app',
    'branch': 'v94-media-v4n-negative-claims',
    'releaseId': NEW_RELEASE
}, indent=2, ensure_ascii=False) + '\n')

for path in [
    'gestia-core/gestia-core.js',
    'gestia-core/tools.runtime.js',
    'gestia-terminal.html',
    'modules/terminal/proposal-state.js',
    'modules/terminal/nexo-bootstrap.js'
]:
    replace_all(path, OLD_RELEASE, NEW_RELEASE, minimum=1)

replace_once(
    'modules/terminal/nexo-bootstrap.js',
    '"1.2.0-generalist-execution-contract-v122";',
    '"1.3.0-page-evidence-failclosed-v123";'
)

# Keep stale active expectations aligned. This touches tests only, never product behavior.
for test_path in (ROOT / 'tests').rglob('*'):
    if not test_path.is_file() or test_path.suffix not in {'.mjs', '.cjs', '.js'}:
        continue
    text = test_path.read_text(encoding='utf-8')
    updated = text.replace(OLD_RELEASE, NEW_RELEASE).replace(OLD_FS_VERSION, NEW_FS_VERSION)
    if updated != text:
        test_path.write_text(updated, encoding='utf-8')

# 7. Permanent generic regression (fictional entity; no HMH production hardcode).
regression = r'''import assert from "node:assert/strict";
import test from "node:test";

import {
    registerJarvisMultifunctionTools
} from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import {
    ensureExecutableArtifactDependencies
} from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import {
    buildPageArtifactHtml,
    describePageArtifact
} from "../jarvis-page-artifact.js";

class Runtime {
    constructor() { this.map = new Map(); }
    register(definition) {
        this.map.set(definition.name, definition);
        return { ok: true };
    }
    get(name) { return this.map.get(name) || null; }
    list() { return [...this.map.values()]; }
}

test("page.compose fails closed when web research cannot anchor the exact entity identity", async () => {
    const runtime = new Runtime();
    registerJarvisMultifunctionTools(runtime);
    const compose = runtime.get("page.compose");
    assert.ok(compose);

    const result = await compose.execute({
        brandName: "Orbe Delta Talleres ZXQ",
        title: "Sitio informativo de Orbe Delta Talleres ZXQ",
        sections: ["Servicios", "Contacto"]
    }, {
        canonicalEvidence: [{
            tool: "web.research",
            status: "GROUNDED",
            validSources: [
                {
                    title: "Talleres Delta del Norte",
                    snippet: "Empresa distinta dedicada a mantenimiento industrial."
                },
                {
                    title: "Directorio industrial regional",
                    description: "Listado de negocios sin coincidencia exacta para el nombre consultado."
                }
            ]
        }]
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "PAGE_CONTENT_COMPOSED");
    assert.equal(result.limitedEvidence, true);
    assert.equal(result.pageInput.evidenceMode, "insufficient");
    assert.deepEqual(result.pageInput.services, []);
    assert.equal(result.pageInput.whatsapp, "");
    assert.equal(result.pageInput.contactEmail, "");
    assert.equal(result.evidenceIntegrity.researchObserved, true);
    assert.equal(result.evidenceIntegrity.identityGrounded, false);

    const html = buildPageArtifactHtml(result.pageInput);
    const report = describePageArtifact(result.pageInput, html);
    assert.equal(report.ok, true);
    assert.equal(report.evidenceMode, "insufficient");
    assert.match(html, /"@type":"WebPage"/);
    assert.match(html, /id="verificacion"/);
    assert.match(html, /No hay evidencia suficiente para publicar como hechos/);
    assert.doesNotMatch(html, /"@type":"Organization"/);
    assert.doesNotMatch(html, /id="servicios"/);
    assert.doesNotMatch(html, /id="contacto"/);
    assert.doesNotMatch(html, /contact-form/);
    assert.doesNotMatch(html, /wa\.me|mailto:/);
    assert.doesNotMatch(html, /Servicios y capacidades|ofrece una variedad|soluciones integrales|Ofrecemos una gama/i);
});

test("page dependency contract does not reinsert page.compose for an explicit insufficient-evidence blueprint", () => {
    const calls = ensureExecutableArtifactDependencies({
        catalog: [
            { name: "page.compose" },
            { name: "page.create" }
        ],
        toolCalls: [{
            name: "page.create",
            args: {
                brandName: "Orbe Delta Talleres ZXQ",
                title: "Sitio informativo de Orbe Delta Talleres ZXQ",
                description: "No hay evidencia suficiente para publicar hechos asociados a este nombre.",
                services: [],
                evidenceMode: "insufficient"
            }
        }]
    });
    assert.deepEqual(calls.map(call => call.name), ["page.create"]);
});

test("verified page mode keeps normal business rendering unchanged when content is supplied", () => {
    const input = {
        brandName: "Empresa Demostración",
        title: "Servicios verificados",
        description: "Contenido de demostración suministrado directamente para probar el renderer normal.",
        services: [{ title: "Servicio A", description: "Descripción suministrada para la prueba." }]
    };
    const html = buildPageArtifactHtml(input);
    const report = describePageArtifact(input, html);
    assert.equal(report.ok, true);
    assert.match(html, /"@type":"Organization"/);
    assert.match(html, /id="servicios"/);
});
'''
write('tests/jarvis-page-insufficient-evidence-v123.test.mjs', regression)

# Make the regression part of normal CI, not only the staging workflow.
package_path = 'package.json'
package_text = read(package_path)
needle = 'tests/jarvis-page-artifact.test.mjs'
if package_text.count(needle) < 1:
    raise SystemExit('PACKAGE_PAGE_TEST_MARKER_MISSING')
package_text = package_text.replace(
    needle,
    needle + ' tests/jarvis-page-insufficient-evidence-v123.test.mjs'
)
write(package_path, package_text)

print('V123_PAGE_EVIDENCE_FAILCLOSED_PATCH_APPLIED=TRUE')
