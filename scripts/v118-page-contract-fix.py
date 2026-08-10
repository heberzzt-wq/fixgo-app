from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path, old, new):
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:120]!r}")
    write(path, source.replace(old, new, 1))


# 1) Page artifact: render explicit semantic sections and fail closed when requested coverage is missing.
artifact_path = "jarvis-page-artifact.js"
replace_once(
    artifact_path,
    '''function list(value, limit = 12) {
    return Array.isArray(value) ? value.filter(item => item && typeof item === "object").slice(0, limit) : [];
}
''',
    '''function list(value, limit = 12) {
    return Array.isArray(value) ? value.filter(item => item && typeof item === "object").slice(0, limit) : [];
}

function sectionKey(value = "", fallback = "seccion") {
    const source = text(value, fallback)
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return source || fallback;
}

function pageContentSections(input = {}) {
    return list(input.contentSections, 16)
        .map((section, index) => {
            const title = text(section.title, text(section.name));
            const description = text(section.description, text(section.body));
            const key = sectionKey(section.key || section.id || title, `seccion-${index + 1}`);
            const items = Array.isArray(section.items)
                ? section.items.slice(0, 8).map(item => {
                    if (typeof item === "string") {
                        return { title: text(item), description: "" };
                    }
                    if (!item || typeof item !== "object") return null;
                    return {
                        title: text(item.title, text(item.name)),
                        description: text(item.description, text(item.body))
                    };
                }).filter(item => item && (item.title || item.description))
                : [];
            return { key, title, description, items };
        })
        .filter(section => section.title && (section.description || section.items.length > 0));
}

function requiredPageSections(input = {}) {
    const source = Array.isArray(input.requiredSections) ? input.requiredSections : [];
    return source.slice(0, 16).map((item, index) => {
        const label = typeof item === "string"
            ? text(item)
            : text(item?.title, text(item?.name));
        return {
            label,
            key: sectionKey(label, `seccion-${index + 1}`)
        };
    }).filter(item => item.label);
}
'''
)
replace_once(
    artifact_path,
    '''    const description = text(input.description);
    const services = list(input.services, 12);
    if (!brandName || !title || description.length < 20 || services.length < 1) throw new Error("PAGE_CONTENT_REQUIRED");
''',
    '''    const description = text(input.description);
    const services = list(input.services, 12);
    const contentSections = pageContentSections(input);
    const requiredSections = requiredPageSections(input);
    if (!brandName || !title || description.length < 20 || services.length < 1) throw new Error("PAGE_CONTENT_REQUIRED");
'''
)
replace_once(
    artifact_path,
    '''    const serviceCards = services.map((service, index) => {
        const serviceTitle = text(service.title, text(service.name));
        const serviceDescription = text(service.description);
        if (!serviceTitle || !serviceDescription) throw new Error("PAGE_SERVICE_CONTENT_REQUIRED");
        return `<article class="card"><span class="index">${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(serviceTitle)}</h3><p>${escapeHtml(serviceDescription)}</p></article>`;
    }).join("");
''',
    '''    const serviceCards = services.map((service, index) => {
        const serviceTitle = text(service.title, text(service.name));
        const serviceDescription = text(service.description);
        if (!serviceTitle || !serviceDescription) throw new Error("PAGE_SERVICE_CONTENT_REQUIRED");
        return `<article class="card"><span class="index">${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(serviceTitle)}</h3><p>${escapeHtml(serviceDescription)}</p></article>`;
    }).join("");
    const contentSectionLinks = contentSections
        .slice(0, 6)
        .map(section => `<a href="#contenido-${escapeHtml(section.key)}">${escapeHtml(section.title)}</a>`)
        .join("");
    const contentSectionsMarkup = contentSections.map((section, sectionIndex) => {
        const itemsMarkup = section.items.length
            ? `<div class="cards">${section.items.map((item, itemIndex) => `<article class="card"><span class="index">${String(itemIndex + 1).padStart(2, "0")}</span>${item.title ? `<h3>${escapeHtml(item.title)}</h3>` : ""}${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</article>`).join("")}</div>`
            : "";
        return `<section id="contenido-${escapeHtml(section.key)}" data-requested-section="${escapeHtml(section.key)}"><div class="wrap"><p class="eyebrow">${escapeHtml(brandName)}</p><h2>${escapeHtml(section.title)}</h2>${section.description ? `<p class="section-copy">${escapeHtml(section.description)}</p>` : ""}${itemsMarkup}</div></section>`;
    }).join("");
'''
)
replace_once(
    artifact_path,
    '''.card{background:#fff;border:1px solid #e2e8f0;border-radius:1.25rem;padding:1.4rem;box-shadow:0 12px 35px #0f172a0d}.index{font-weight:900;color:var(--primary)}''',
    '''.card{background:#fff;border:1px solid #e2e8f0;border-radius:1.25rem;padding:1.4rem;box-shadow:0 12px 35px #0f172a0d}.index{font-weight:900;color:var(--primary)}.section-copy{max-width:72ch;color:var(--muted);font-size:1.08rem;margin:-.75rem 0 2rem}'''
)
replace_once(
    artifact_path,
    '''<div class="links"><a href="#servicios">Servicios</a>${gallery.length ? '<a href="#galeria">Galería</a>' : ""}${testimonials.length ? '<a href="#testimonios">Testimonios</a>' : ""}<a class="button" href="${escapeHtml(contactAction)}">${contactLabel}</a></div>''',
    '''<div class="links">${contentSectionLinks}<a href="#servicios">Servicios</a>${gallery.length ? '<a href="#galeria">Galería</a>' : ""}${testimonials.length ? '<a href="#testimonios">Testimonios</a>' : ""}<a class="button" href="${escapeHtml(contactAction)}">${contactLabel}</a></div>'''
)
replace_once(
    artifact_path,
    '''</div></div></section><section id="servicios"><div class="wrap"><p class="eyebrow">Servicios</p><h2>Servicios y capacidades</h2><div class="cards">${serviceCards}</div></div></section>${galleryMarkup}${beforeAfterMarkup}${testimonialsMarkup}${contactMarkup}</main>''',
    '''</div></div></section>${contentSectionsMarkup}<section id="servicios"><div class="wrap"><p class="eyebrow">Servicios</p><h2>Servicios y capacidades</h2><div class="cards">${serviceCards}</div></div></section>${galleryMarkup}${beforeAfterMarkup}${testimonialsMarkup}${contactMarkup}</main>'''
)
artifact = read(artifact_path)
marker = 'export function describePageArtifact(input = {}, html = "") {'
if artifact.count(marker) != 1:
    raise SystemExit("jarvis-page-artifact.js: describePageArtifact marker mismatch")
artifact_prefix = artifact.split(marker, 1)[0]
artifact_tail = '''export function describePageArtifact(input = {}, html = "") {
    const { hasContactRoute } = pageContactState(input);
    const requiredSections = requiredPageSections(input);
    const renderedSections = pageContentSections(input).map(section => ({
        title: section.title,
        key: section.key
    }));
    const requestedSectionsSatisfied = requiredSections.every(section =>
        html.includes(`data-requested-section="${section.key}"`)
    );
    const contactPolicySatisfied = hasContactRoute
        ? html.includes('id="contacto"') && html.includes('class="contact-form"')
        : !html.includes('id="contacto"') &&
            !html.includes('mailto:?') &&
            !html.includes('https://wa.me/?text=') &&
            html.includes('href="#servicios"');
    const checks = {
        responsive: html.includes("@media(max-width:780px)"),
        accessibility: html.includes("Saltar al contenido") && html.includes("aria-label"),
        seo: html.includes('name="description"') && html.includes('property="og:title"'),
        structuredData: html.includes("application/ld+json"),
        services: html.includes('id="servicios"'),
        requestedSections: requestedSectionsSatisfied,
        contact: contactPolicySatisfied,
        noTodoMarkers: !html.includes("TODO") && !html.includes("Lorem ipsum") && !html.includes("undefined")
    };
    return {
        ok: Object.values(checks).every(Boolean),
        bytes: utf8ByteLength(html),
        checks,
        brandName: text(input.brandName),
        title: text(input.title),
        hasContactRoute,
        requiredSections,
        renderedSections
    };
}
'''
write(artifact_path, artifact_prefix + artifact_tail)


# 2) Semantic page composer: preserve required sections and materialize one explicit content block for each.
multitool_path = "gestia-core/jarvis/jarvis.multitool.pack.js"
multitool = read(multitool_path)
start = multitool.find('function normalizedPageArtifactInput(value = {}, fallbackTitle = "") {')
end = multitool.find('function hasPlanningValue(value) {', start)
if start < 0 or end < 0:
    raise SystemExit("jarvis.multitool.pack.js: normalizedPageArtifactInput block not found")
new_normalizer = '''function pageSectionContractKey(value = "") {
    return clean(value)
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function normalizePageRequiredSections(value = [], fallback = []) {
    const primary = Array.isArray(value) && value.length > 0 ? value : fallback;
    return (Array.isArray(primary) ? primary : [])
        .slice(0, 16)
        .map(item => typeof item === "string" ? clean(item) : clean(item?.title || item?.name))
        .filter(Boolean)
        .filter((item, index, list) =>
            list.findIndex(candidate => pageSectionContractKey(candidate) === pageSectionContractKey(item)) === index
        );
}

function normalizePageContentSections(value = []) {
    return (Array.isArray(value) ? value : [])
        .slice(0, 16)
        .map(section => {
            if (!section || typeof section !== "object") return null;
            const title = clean(section.title || section.name);
            const description = clean(section.description || section.body);
            const items = (Array.isArray(section.items) ? section.items : [])
                .slice(0, 8)
                .map(item => {
                    if (typeof item === "string") return { title: clean(item), description: "" };
                    if (!item || typeof item !== "object") return null;
                    return {
                        title: clean(item.title || item.name),
                        description: clean(item.description || item.body)
                    };
                })
                .filter(item => item && (item.title || item.description));
            return title && (description || items.length > 0)
                ? { title, description, items }
                : null;
        })
        .filter(Boolean);
}

function normalizedPageArtifactInput(value = {}, fallbackTitle = "", fallbackRequiredSections = []) {
    const services = Array.isArray(value?.services)
        ? value.services.slice(0, 12).map(service => ({
            title: clean(service?.title || service?.name),
            description: clean(service?.description)
        })).filter(service =>
            service.title &&
            service.description
        )
        : [];
    const requiredSections = normalizePageRequiredSections(
        value?.requiredSections,
        fallbackRequiredSections
    );
    const contentSections = normalizePageContentSections(value?.contentSections);
    return {
        brandName: clean(value?.brandName),
        title: clean(value?.title, fallbackTitle),
        description: clean(value?.description),
        services,
        requiredSections,
        contentSections,
        whatsapp: clean(value?.whatsapp).replace(/[^0-9]/g, ""),
        contactEmail: clean(value?.contactEmail),
        whatsappRequested: value?.whatsappRequested === true
    };
}

'''
multitool = multitool[:start] + new_normalizer + multitool[end:]
write(multitool_path, multitool)
replace_once(
    multitool_path,
    '''            output: "SIA7_PAGE_SPEC",
            inputSchema: PAGE_ARGUMENT_SCHEMA,''',
    '''            output: "SIA7_PAGE_SPEC",
            missionDedupeBy: ["pageName"],
            inputSchema: PAGE_ARGUMENT_SCHEMA,'''
)
replace_once(
    multitool_path,
    '''                title: "string",
                instructions: "string",
                contactEmail: "string",''',
    '''                title: "string",
                instructions: "string",
                sections: "array",
                contactEmail: "string",'''
)
replace_once(
    multitool_path,
    '"Devuelve solamente un objeto con brandName, title, description, services, whatsapp, contactEmail y whatsappRequested.",',
    '"Devuelve solamente un objeto con brandName, title, description, services, requiredSections, contentSections, whatsapp, contactEmail y whatsappRequested.",'
)
replace_once(
    multitool_path,
    '"services debe ser un arreglo de objetos {title,description} con contenido específico y honesto.",',
    '''"services debe ser un arreglo de objetos {title,description} con contenido específico y honesto.",
                        "requiredSections debe conservar, en el idioma del usuario, cada sección de contenido pedida explícitamente o recibida en SECCIONES_PLANIFICADAS; no omitas ni fusiones objetivos distintos.",
                        "contentSections debe contener exactamente una entrada sustantiva por requiredSections con {title,description,items}; title debe corresponder a la sección requerida y cada bloque debe tener copy real, no sólo una etiqueta.",
                        "Una página no puede considerarse compuesta si falta cualquiera de sus requiredSections.",'''
)
replace_once(
    multitool_path,
    '''                        `TITULO=${clean(args.title)}`,
                        `SOLICITUD=${instruction}`''',
    '''                        `TITULO=${clean(args.title)}`,
                        `SECCIONES_PLANIFICADAS=${JSON.stringify(Array.isArray(args.sections) ? args.sections : [])}`,
                        `SOLICITUD=${instruction}`'''
)
replace_once(
    multitool_path,
    '''                                ),
                                clean(args.title)
                            ),''',
    '''                                ),
                                clean(args.title),
                                Array.isArray(args.sections) ? args.sections : []
                            ),'''
)
replace_once(
    multitool_path,
    '''                const ok =
                    semantic?.ok === true &&
                    pageInput.brandName &&
                    pageInput.title &&
                    pageInput.description.length >= 20 &&
                    pageInput.services.length > 0;
''',
    '''                const missingSections = pageInput.requiredSections.filter(required =>
                    !pageInput.contentSections.some(section =>
                        pageSectionContractKey(section.title) === pageSectionContractKey(required)
                    )
                );
                const requestedSectionsSatisfied = missingSections.length === 0;
                const ok =
                    semantic?.ok === true &&
                    pageInput.brandName &&
                    pageInput.title &&
                    pageInput.description.length >= 20 &&
                    pageInput.services.length > 0 &&
                    requestedSectionsSatisfied;
'''
)
replace_once(
    multitool_path,
    '''                    pageInput,
                    provider:
''',
    '''                    pageInput,
                    requestedSectionsSatisfied,
                    missingSections,
                    provider:
'''
)
replace_once(
    multitool_path,
    '''                    error:
                        ok
                            ? null
                            : "PAGE_CONTENT_REQUIRED"
''',
    '''                    error:
                        ok
                            ? null
                            : missingSections.length > 0
                                ? "PAGE_REQUESTED_SECTION_COVERAGE_INCOMPLETE"
                                : "PAGE_CONTENT_REQUIRED"
'''
)


# 3) Semantic mission planner must preserve explicit user section objectives in both planning and composition calls.
planner_path = "gestia-core/jarvis/jarvis.multifunction.planner.js"
replace_once(
    planner_path,
    'Para crear una landing usa page.plan, page.compose y page.create;',
    'Para crear una landing usa page.plan, page.compose y page.create; para page.plan y page.compose copia en args.sections cada sección de contenido pedida explícitamente por el usuario, en su idioma y sin sustituirla por aliases técnicos;'
)


# 4) page.create catalog advertises the structured section contract carried by the compose handoff.
actuator_path = "gestia-core/jarvis/jarvis.actuator.pack.js"
replace_once(
    actuator_path,
    '''                brandName: "string", title: "string", description: "string", services: "array",
                heroImage: "string",''',
    '''                brandName: "string", title: "string", description: "string", services: "array",
                requiredSections: "array", contentSections: "array",
                heroImage: "string",'''
)
replace_once(
    actuator_path,
    '../../jarvis-page-artifact.js?v=v94-page-browser-fallback-v115-20260809',
    '../../jarvis-page-artifact.js?v=v94-page-request-contract-v118-20260810'
)


# 5) Browser cache identity for the modules modified by v118. No deployment is performed by this workflow.
runtime_path = "gestia-core/tools.runtime.js"
replace_once(
    runtime_path,
    './jarvis/jarvis.multitool.pack.js?v=v94-repo-marketing-integrity-v112-20260809',
    './jarvis/jarvis.multitool.pack.js?v=v94-page-request-contract-v118-20260810'
)
replace_once(
    runtime_path,
    './jarvis/jarvis.actuator.pack.js?v=v94-page-browser-fallback-v115-20260809',
    './jarvis/jarvis.actuator.pack.js?v=v94-page-request-contract-v118-20260810'
)
core_path = "gestia-core/gestia-core.js"
replace_once(
    core_path,
    '/gestia-core/jarvis/jarvis.multifunction.planner.js?v=v94-semantic-memory-integrity-v110-20260809',
    '/gestia-core/jarvis/jarvis.multifunction.planner.js?v=v94-page-request-contract-v118-20260810'
)
replace_once(
    core_path,
    '/gestia-core/tools.runtime.js?v=v94-page-browser-fallback-v115-20260809',
    '/gestia-core/tools.runtime.js?v=v94-page-request-contract-v118-20260810'
)


# 6) Human regression from the live Jarvis V7 request.
test_path = Path("tests/jarvis-page-request-contract-v118.test.mjs")
test_path.write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPageArtifactHtml, describePageArtifact } from "../jarvis-page-artifact.js";

const humanPrompt = "Créame una página web para Jarvis V7 con introducción, cómo funciona, beneficios, herramientas disponibles, casos de uso y contacto. Quiero diseño de tecnología premium, mobile-first y accesible.";
const requiredSections = [
    "Introducción",
    "Cómo funciona",
    "Beneficios",
    "Herramientas disponibles",
    "Casos de uso",
    "Contacto"
];
const contentSections = requiredSections.map((title, index) => ({
    title,
    description: `Contenido verificable de ${title.toLowerCase()} para Jarvis V7, bloque ${index + 1}.`,
    items: [{ title: `Punto ${index + 1}`, description: `Detalle específico del bloque ${title}.` }]
}));
const input = {
    brandName: "Jarvis V7",
    title: "Jarvis V7: asistencia inteligente",
    description: "Una presentación clara de Jarvis V7 con experiencia premium, adaptable y accesible.",
    services: [
        { title: "Asistencia", description: "Apoya tareas y decisiones con una interfaz clara." },
        { title: "Automatización", description: "Coordina acciones y artefactos verificables." }
    ],
    requiredSections,
    contentSections,
    whatsapp: "",
    contactEmail: "",
    whatsappRequested: true
};

test("v118 live-human page request renders every explicitly requested section and verifies coverage", () => {
    assert.match(humanPrompt, /introducción/);
    const html = buildPageArtifactHtml(input);
    const report = describePageArtifact(input, html);
    for (const expected of ["introduccion", "como-funciona", "beneficios", "herramientas-disponibles", "casos-de-uso", "contacto"]) {
        assert.match(html, new RegExp(`data-requested-section="${expected}"`));
    }
    assert.equal(report.checks.requestedSections, true);
    assert.equal(report.ok, true);
    assert.equal(report.requiredSections.length, 6);
    assert.equal(report.renderedSections.length, 6);
    assert.match(html, /https:\/\/wa\.me\/\?text=/);
});

test("v118 verification fails closed when page.create material omits one requested content objective", () => {
    const incomplete = {
        ...input,
        contentSections: contentSections.filter(section => section.title !== "Casos de uso")
    };
    const html = buildPageArtifactHtml(incomplete);
    const report = describePageArtifact(incomplete, html);
    assert.equal(report.checks.requestedSections, false);
    assert.equal(report.ok, false);
    assert.doesNotMatch(html, /data-requested-section="casos-de-uso"/);
});

test("v118 semantic page compose preserves section objectives instead of collapsing them into services", () => {
    const multitool = fs.readFileSync(path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.multitool.pack.js"), "utf8");
    const planner = fs.readFileSync(path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.multifunction.planner.js"), "utf8");
    const actuator = fs.readFileSync(path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.actuator.pack.js"), "utf8");
    assert.match(multitool, /requiredSections, contentSections/);
    assert.match(multitool, /sections: "array"/);
    assert.match(multitool, /PAGE_REQUESTED_SECTION_COVERAGE_INCOMPLETE/);
    assert.match(multitool, /missionDedupeBy: \["pageName"\]/);
    assert.match(planner, /copia en args\.sections cada sección de contenido pedida explícitamente/);
    assert.match(actuator, /requiredSections: "array", contentSections: "array"/);
});
''', encoding="utf-8")

print("v118 page request contract patch applied")
