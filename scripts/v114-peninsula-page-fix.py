from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path, old, new, label):
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}_COUNT_{count}")
    write(path, source.replace(old, new, 1))


# -----------------------------------------------------------------------------
# 1) Page renderer: contact data is optional; never invent a route.
# -----------------------------------------------------------------------------
page_artifact = r'''function text(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function escapeHtml(value = "") {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function safeUrl(value = "") {
    const candidate = text(value);
    if (!candidate) return "";
    try {
        const url = new URL(candidate);
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
}

function safeImageUrl(value = "") {
    const candidate = text(value);
    if (!candidate) return "";
    const embedded = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,"].some(prefix => candidate.startsWith(prefix));
    if (embedded) return candidate.length <= 16 * 1024 * 1024 ? candidate : "";
    return safeUrl(candidate);
}

function list(value, limit = 12) {
    return Array.isArray(value) ? value.filter(item => item && typeof item === "object").slice(0, limit) : [];
}

function pageContactState(input = {}) {
    const whatsapp = String(input.whatsapp || "").replace(/[^0-9]/g, "");
    const whatsappRequested = input.whatsappRequested === true;
    const contactEmail = text(input.contactEmail);
    const emailAvailable = contactEmail.includes("@");
    const phoneHref = whatsapp
        ? `https://wa.me/${whatsapp}`
        : whatsappRequested
            ? "https://wa.me/"
            : "";
    return {
        whatsapp,
        whatsappRequested,
        contactEmail,
        emailAvailable,
        phoneHref,
        hasContactRoute: Boolean(phoneHref || emailAvailable)
    };
}

export function buildPageArtifactHtml(input = {}) {
    const brandName = text(input.brandName);
    const title = text(input.title);
    const description = text(input.description);
    const services = list(input.services, 12);
    if (!brandName || !title || description.length < 20 || services.length < 1) throw new Error("PAGE_CONTENT_REQUIRED");

    const {
        whatsapp,
        contactEmail,
        phoneHref,
        hasContactRoute
    } = pageContactState(input);
    const primary = /^#[0-9a-f]{6}$/i.test(input.primaryColor || "") ? input.primaryColor : "#2563eb";
    const accent = /^#[0-9a-f]{6}$/i.test(input.accentColor || "") ? input.accentColor : "#22c55e";
    const heroImage = safeImageUrl(input.heroImage);
    const canonicalUrl = safeUrl(input.canonicalUrl);
    const mapUrl = safeUrl(input.mapUrl);
    const gallery = list(input.gallery, 12).map(item => ({ src: safeImageUrl(item.src), alt: text(item.alt) })).filter(item => item.src && item.alt);
    const testimonials = list(input.testimonials, 8)
        .map(item => ({ ...item, name: text(item.name, text(item.author)) }))
        .filter(item => text(item.quote) && item.name);
    const beforeAfter = list(input.beforeAfter, 6).map(item => ({ before: safeImageUrl(item.before), after: safeImageUrl(item.after), label: text(item.label) })).filter(item => item.before && item.after);
    const serviceCards = services.map((service, index) => {
        const serviceTitle = text(service.title, text(service.name));
        const serviceDescription = text(service.description);
        if (!serviceTitle || !serviceDescription) throw new Error("PAGE_SERVICE_CONTENT_REQUIRED");
        return `<article class="card"><span class="index">${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(serviceTitle)}</h3><p>${escapeHtml(serviceDescription)}</p></article>`;
    }).join("");
    const galleryMarkup = gallery.length ? `<section id="galeria"><div class="wrap"><p class="eyebrow">Galería</p><h2>Material visual disponible</h2><div class="gallery">${gallery.map(item => `<figure><img loading="lazy" src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}"><figcaption>${escapeHtml(item.alt)}</figcaption></figure>`).join("")}</div></div></section>` : "";
    const testimonialsMarkup = testimonials.length ? `<section id="testimonios"><div class="wrap"><p class="eyebrow">Testimonios</p><h2>Experiencias compartidas</h2><div class="cards">${testimonials.map(item => `<blockquote class="card"><p>“${escapeHtml(item.quote)}”</p><footer>${escapeHtml(item.name)}${text(item.role) ? ` · ${escapeHtml(item.role)}` : ""}</footer></blockquote>`).join("")}</div></div></section>` : "";
    const beforeAfterMarkup = beforeAfter.length ? `<section id="resultados"><div class="wrap"><p class="eyebrow">Antes y después</p><h2>Comparativa visual</h2><div class="before-after">${beforeAfter.map(item => `<figure><div><img loading="lazy" src="${escapeHtml(item.before)}" alt="Antes: ${escapeHtml(item.label)}"><span>Antes</span></div><div><img loading="lazy" src="${escapeHtml(item.after)}" alt="Después: ${escapeHtml(item.label)}"><span>Después</span></div><figcaption>${escapeHtml(item.label)}</figcaption></figure>`).join("")}</div></div></section>` : "";

    const contactAction = hasContactRoute
        ? (phoneHref || "#contacto")
        : "#servicios";
    const contactLabel = hasContactRoute
        ? "Contactar"
        : "Ver servicios";
    const heroActionLabel = hasContactRoute
        ? "Solicitar información"
        : "Explorar servicios";
    const contactMarkup = hasContactRoute
        ? `<section class="cta" id="contacto"><div class="wrap"><p class="eyebrow">Contacto</p><h2>Inicia una consulta</h2><p>Usa el canal de contacto disponible para enviar tu solicitud.</p><form class="contact-form"><label>Nombre<input name="name" autocomplete="name" required></label><label>Mensaje<textarea name="message" required></textarea></label><button class="button accent" type="submit">Enviar consulta</button></form>${mapUrl ? `<p><a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">Ver ubicación en el mapa</a></p>` : ""}</div></section>`
        : "";
    const contactScript = hasContactRoute
        ? `const contactForm=document.querySelector('.contact-form');if(contactForm){contactForm.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget),message='Hola, soy '+data.get('name')+'. '+data.get('message');${phoneHref ? `window.open('${phoneHref}?text='+encodeURIComponent(message),'_blank','noopener')` : `window.location.href='mailto:${escapeHtml(contactEmail)}?subject='+encodeURIComponent('Consulta desde el sitio')+'&body='+encodeURIComponent(message)`}})}`
        : "";
    const structuredData = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: brandName,
        description,
        url: canonicalUrl || undefined,
        telephone: whatsapp || undefined,
        email: contactEmail.includes("@") ? contactEmail : undefined
    }).replaceAll("<", "\\u003c");

    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | ${escapeHtml(brandName)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">${canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}"><meta property="og:url" content="${escapeHtml(canonicalUrl)}">` : ""}${heroImage ? `<meta property="og:image" content="${escapeHtml(heroImage)}">` : ""}<meta name="theme-color" content="${primary}"><script type="application/ld+json">${structuredData}</script>
<style>:root{--primary:${primary};--accent:${accent};--ink:#0f172a;--muted:#475569;--surface:#fff;--soft:#f1f5f9}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:16px/1.65 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);background:var(--surface)}a{color:inherit}.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:#fff;padding:.7rem;z-index:9}.wrap{width:min(1120px,calc(100% - 2rem));margin:auto}header{position:sticky;top:0;z-index:5;background:#fffffff2;backdrop-filter:blur(12px);border-bottom:1px solid #e2e8f0}.nav{height:72px;display:flex;align-items:center;justify-content:space-between}.brand{font-weight:900;text-decoration:none}.links{display:flex;gap:1.2rem;align-items:center}.links a{text-decoration:none}.button{display:inline-flex;align-items:center;justify-content:center;padding:.8rem 1.15rem;border-radius:999px;background:var(--primary);color:#fff;text-decoration:none;font-weight:750;border:0;cursor:pointer}.button.accent{background:var(--accent);color:#052e16}.menu{display:none;background:none;border:0;font-size:1.5rem}.hero{min-height:72vh;display:grid;place-items:center;background:linear-gradient(120deg,#eff6ff,#f8fafc 55%,#ecfdf5);position:relative;overflow:hidden}.hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:3rem;align-items:center;padding:5rem 0}.eyebrow{color:var(--primary);font-weight:850;text-transform:uppercase;letter-spacing:.12em;font-size:.78rem}.hero h1,h2{line-height:1.08;letter-spacing:-.04em}.hero h1{font-size:clamp(2.7rem,7vw,5.8rem);margin:.4rem 0 1rem}.hero p{font-size:1.15rem;color:var(--muted);max-width:65ch}.hero-media{min-height:420px;border-radius:2rem;background:${heroImage ? `url('${heroImage.replaceAll("'", "%27")}') center/cover` : `linear-gradient(145deg,var(--primary),var(--accent))`};box-shadow:0 30px 80px #0f172a2b}section{padding:5.5rem 0}section:nth-of-type(even){background:var(--soft)}h2{font-size:clamp(2rem,5vw,3.6rem);max-width:16ch;margin:.4rem 0 2rem}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.card{background:#fff;border:1px solid #e2e8f0;border-radius:1.25rem;padding:1.4rem;box-shadow:0 12px 35px #0f172a0d}.index{font-weight:900;color:var(--primary)}.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.gallery figure,.before-after figure{margin:0}.gallery img,.before-after img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:1rem}.gallery figcaption,.before-after figcaption{padding:.5rem 0;color:var(--muted)}.before-after{display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem}.before-after figure{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}.before-after figure>div{position:relative}.before-after span{position:absolute;left:.5rem;bottom:.5rem;background:#000b;color:#fff;padding:.25rem .5rem;border-radius:.5rem}.before-after figcaption{grid-column:1/-1}.cta{background:var(--ink);color:#fff}.cta p{color:#cbd5e1}.contact-form{display:grid;gap:.8rem;max-width:620px}.contact-form input,.contact-form textarea{width:100%;padding:.9rem;border:1px solid #cbd5e1;border-radius:.8rem;font:inherit}.contact-form textarea{min-height:130px}footer.site{padding:2rem 0;background:#020617;color:#cbd5e1}@media(max-width:780px){.menu{display:block}.links{display:none;position:absolute;top:72px;left:0;right:0;padding:1rem;background:#fff;flex-direction:column;align-items:stretch}.links.open{display:flex}.hero-grid{grid-template-columns:1fr;padding:3.5rem 0}.hero-media{min-height:280px}.cards,.gallery,.before-after{grid-template-columns:1fr}section{padding:4rem 0}}</style></head>
<body><a class="skip" href="#contenido">Saltar al contenido</a><header><nav class="nav wrap" aria-label="Principal"><a class="brand" href="#">${escapeHtml(brandName)}</a><button class="menu" aria-label="Abrir menú" aria-expanded="false">☰</button><div class="links"><a href="#servicios">Servicios</a>${gallery.length ? '<a href="#galeria">Galería</a>' : ""}${testimonials.length ? '<a href="#testimonios">Testimonios</a>' : ""}<a class="button" href="${escapeHtml(contactAction)}">${contactLabel}</a></div></nav></header><main id="contenido"><section class="hero"><div class="hero-grid wrap"><div><p class="eyebrow">${escapeHtml(brandName)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><a class="button accent" href="${escapeHtml(contactAction)}">${heroActionLabel}</a></div><div class="hero-media" role="img" aria-label="${escapeHtml(text(input.heroAlt, `Presentación de ${brandName}`))}"></div></div></section><section id="servicios"><div class="wrap"><p class="eyebrow">Servicios</p><h2>Servicios y capacidades</h2><div class="cards">${serviceCards}</div></div></section>${galleryMarkup}${beforeAfterMarkup}${testimonialsMarkup}${contactMarkup}</main><footer class="site"><div class="wrap">© <span id="year"></span> ${escapeHtml(brandName)}. Todos los derechos reservados.</div></footer>
<script>const menu=document.querySelector('.menu'),links=document.querySelector('.links');menu.addEventListener('click',()=>{const open=links.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});${contactScript}document.getElementById('year').textContent=new Date().getFullYear();</script></body></html>`;
}

export function describePageArtifact(input = {}, html = "") {
    const { hasContactRoute } = pageContactState(input);
    const contactPolicySatisfied = hasContactRoute
        ? html.includes('id="contacto"') && html.includes('class="contact-form"')
        : !html.includes('id="contacto"') &&
            !html.includes('mailto:?') &&
            !html.includes('https://wa.me/?text=') &&
            html.includes('href="#servicios"');
    return {
        ok: true,
        bytes: Buffer.byteLength(html, "utf8"),
        checks: {
            responsive: html.includes("@media(max-width:780px)"),
            accessibility: html.includes("Saltar al contenido") && html.includes("aria-label"),
            seo: html.includes('name="description"') && html.includes('property="og:title"'),
            structuredData: html.includes("application/ld+json"),
            services: html.includes('id="servicios"'),
            contact: contactPolicySatisfied,
            noTodoMarkers: !html.includes("TODO") && !html.includes("Lorem ipsum") && !html.includes("undefined")
        },
        brandName: text(input.brandName),
        title: text(input.title),
        hasContactRoute
    };
}
'''
write("jarvis-page-artifact.js", page_artifact)

# -----------------------------------------------------------------------------
# 2) Structural tool dependency: selected page.create gets page.compose if needed.
# -----------------------------------------------------------------------------
dependencies = r'''const VERSION = "1.0.0-page-production-v114";

function object(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}

function directPageReady(args = {}) {
    const source = object(args);
    return Boolean(
        String(source.brandName || "").trim() &&
        String(source.title || "").trim() &&
        String(source.description || "").trim().length >= 20 &&
        Array.isArray(source.services) &&
        source.services.length > 0
    );
}

export function ensureExecutableArtifactDependencies({
    toolCalls = [],
    catalog = []
} = {}) {
    const calls = Array.isArray(toolCalls)
        ? toolCalls.filter(call => call && typeof call === "object").map(call => ({
            ...call,
            args: { ...object(call.args) }
        }))
        : [];
    const available = new Set(
        (Array.isArray(catalog) ? catalog : [])
            .map(tool => String(tool?.name || ""))
            .filter(Boolean)
    );
    const hasPageCreate = calls.some(call => call.name === "page.create");
    const hasPageCompose = calls.some(call => call.name === "page.compose");
    if (!hasPageCreate || hasPageCompose || !available.has("page.compose")) {
        return calls;
    }

    const createIndex = calls.findIndex(call => call.name === "page.create");
    const createCall = calls[createIndex];
    if (directPageReady(createCall?.args)) {
        return calls;
    }
    const pagePlan = [...calls]
        .slice(0, Math.max(0, createIndex))
        .reverse()
        .find(call => call?.name === "page.plan") || null;
    const seed = {
        ...object(pagePlan?.args),
        ...object(createCall?.args)
    };
    const composeCall = {
        name: "page.compose",
        args: {
            ...(String(seed.brandName || "").trim() ? { brandName: String(seed.brandName).trim() } : {}),
            ...(String(seed.title || "").trim() ? { title: String(seed.title).trim() } : {}),
            ...(String(seed.contactEmail || "").trim() ? { contactEmail: String(seed.contactEmail).trim() } : {}),
            ...(String(seed.whatsapp || "").trim() ? { whatsapp: String(seed.whatsapp).trim() } : {}),
            ...(seed.whatsappRequested === true ? { whatsappRequested: true } : {})
        },
        approved: false,
        reason: "STRUCTURAL_PAGE_CREATE_DEPENDENCY"
    };
    const expanded = [...calls];
    expanded.splice(createIndex, 0, composeCall);
    return expanded;
}

export function describeMissionDependencies() {
    return {
        ok: true,
        version: VERSION,
        architecture: "tool_contract_dependency",
        lexicalRouting: false,
        currentDependency: "page.create -> page.compose when direct page input is incomplete"
    };
}

export const __test = {
    directPageReady
};
'''
write("gestia-core/jarvis/jarvis.mission.dependencies.js", dependencies)

# Core import and dependency expansion.
replace_once(
    "gestia-core/gestia-core.js",
    '''import {
    reelArtifactArgsFromCompletedTasks
} from '/gestia-core/jarvis/jarvis.reel.presenter.js?v=v94-live-human-reds-v113-20260809';''',
    '''import {
    reelArtifactArgsFromCompletedTasks
} from '/gestia-core/jarvis/jarvis.reel.presenter.js?v=v94-live-human-reds-v113-20260809';
import {
    ensureExecutableArtifactDependencies
} from '/gestia-core/jarvis/jarvis.mission.dependencies.js?v=v94-peninsula-page-v114-20260809';''',
    "CORE_PAGE_DEPENDENCY_IMPORT"
)
replace_once(
    "gestia-core/gestia-core.js",
    '''    if (conversationalPlan.requiresFinalConversation) {
        missionContractToolCalls =
            mergeEvidenceGroundedToolCalls(
                missionContractToolCalls,
                operationalInitialToolCalls
            );
    }
    const hasRepositoryMission =''',
    '''    if (conversationalPlan.requiresFinalConversation) {
        missionContractToolCalls =
            mergeEvidenceGroundedToolCalls(
                missionContractToolCalls,
                operationalInitialToolCalls
            );
    }
    missionContractToolCalls =
        ensureExecutableArtifactDependencies({
            toolCalls: missionContractToolCalls,
            catalog: missionToolCatalog
        });
    const hasRepositoryMission =''',
    "CORE_PAGE_DEPENDENCY_EXPANSION"
)
replace_once(
    "gestia-core/gestia-core.js",
    "import '/gestia-core/tools.runtime.js?v=v94-live-human-reds-v113-20260809';",
    "import '/gestia-core/tools.runtime.js?v=v94-peninsula-page-v114-20260809';",
    "CORE_RUNTIME_CACHE_V114"
)
replace_once(
    "gestia-core/gestia-core.js",
    "import '/gestia-core/tools.bridge.js?v=v94-live-human-reds-v113-20260809';",
    "import '/gestia-core/tools.bridge.js?v=v94-peninsula-page-v114-20260809';",
    "CORE_BRIDGE_CACHE_V114"
)
replace_once(
    "gestia-terminal.html",
    '<script type="module" src="/gestia-core/gestia-core.js?v=v94-live-human-reds-v113-20260809"></script>',
    '<script type="module" src="/gestia-core/gestia-core.js?v=v94-peninsula-page-v114-20260809"></script>',
    "HTML_CORE_CACHE_V114"
)

# -----------------------------------------------------------------------------
# 3) Page artifact carries physical digest; local bridge version bumps to 2.38.
# -----------------------------------------------------------------------------
replace_once(
    "jarvis-fs-bridge.js",
    'export const JARVIS_FS_BRIDGE_VERSION =\n    "2.37.0-verified-reel-webm";',
    'export const JARVIS_FS_BRIDGE_VERSION =\n    "2.38.0-page-no-contact-route";',
    "FS_BRIDGE_V238"
)
replace_once(
    "jarvis-fs-bridge.js",
    '''            fs.writeFileSync(target, html, "utf8");
            const verification = describePageArtifact(pageInput, html);
            if (!Object.values(verification.checks).every(Boolean)) {
                fs.rmSync(target, { force: true });
                throw new Error("PAGE_POST_VERIFY_FAILED");
            }
            const artifact = registerArtifact({ root, output: path.relative(root, target).replaceAll("\\", "/"), metadata: {''',
    '''            fs.writeFileSync(target, html, "utf8");
            const verification = describePageArtifact(pageInput, html);
            if (!Object.values(verification.checks).every(Boolean)) {
                fs.rmSync(target, { force: true });
                throw new Error("PAGE_POST_VERIFY_FAILED");
            }
            const written = fs.readFileSync(target);
            const sha256 = createHash("sha256").update(written).digest("hex");
            if (written.length !== verification.bytes) {
                fs.rmSync(target, { force: true });
                throw new Error("PAGE_BYTE_COUNT_MISMATCH");
            }
            const artifact = registerArtifact({ root, output: path.relative(root, target).replaceAll("\\", "/"), metadata: {''',
    "PAGE_ROUTE_DIGEST"
)
replace_once(
    "jarvis-fs-bridge.js",
    '''                status: "PAGE_ARTIFACT_CREATED_VERIFIED", approvalRequired: false,
                approved: true, approvedBy: "LOCAL_ARTIFACT_POLICY",''',
    '''                status: "PAGE_ARTIFACT_CREATED_VERIFIED", approvalRequired: false,
                approved: true, approvedBy: "LOCAL_ARTIFACT_POLICY", sha256,''',
    "PAGE_ARTIFACT_SHA_METADATA"
)
replace_once(
    "jarvis-fs-bridge.js",
    '''                mimeType: "text/html",
                bytes: verification.bytes,
                embeddedBytes,''',
    '''                mimeType: "text/html",
                bytes: verification.bytes,
                sha256,
                embeddedBytes,''',
    "PAGE_RESPONSE_SHA"
)

replace_once(
    "gestia-core/jarvis/jarvis.actuator.pack.js",
    '''                        output: result.output,
                        bytes: result.bytes,
                        checks: result.checks,''',
    '''                        output: result.output,
                        bytes: result.bytes,
                        sha256: result.sha256,
                        checks: result.checks,''',
    "PAGE_ACTUATOR_SHA"
)

replace_once(
    "gestia-core/tools.bridge.js",
    '''                `Archivo: **${data?.output || "sin ruta"}**.`,
                `Tamano: ${Number(data?.bytes || 0)} bytes.`,
                "El HTML local quedo disponible para vista previa y descarga; no fue publicado ni desplegado."''',
    '''                `Archivo: **${data?.output || "sin ruta"}**.`,
                `Formato: **${data?.mimeType || "text/html"}**.`,
                `Tamano: ${Number(data?.bytes || 0)} bytes.`,
                data?.sha256
                    ? `SHA-256: **${data.sha256}**.`
                    : "SHA-256: no informado.",
                "El HTML fue creado físicamente y verificado antes de reportarse como completado; quedó disponible para vista previa y descarga, sin publicación ni despliegue automático."''',
    "PAGE_HUMAN_RESPONSE_SHA"
)

replace_once(
    "gestia-core/tools.runtime.js",
    '"2.37.0-verified-reel-webm";',
    '"2.38.0-page-no-contact-route";',
    "RUNTIME_BRIDGE_MIN_V238"
)

# -----------------------------------------------------------------------------
# 4) Historical tests + v114 human regressions.
# -----------------------------------------------------------------------------
replace_once(
    "tests/jarvis-fs-bridge-v2.test.mjs",
    'assert.equal(description.version, "2.37.0-verified-reel-webm");',
    'assert.equal(description.version, "2.38.0-page-no-contact-route");',
    "TEST_BRIDGE_VERSION_V238"
)
replace_once(
    "tests/jarvis-live-human-reds-v113.test.mjs",
    'assert.match(runtime, /2\\.37\\.0-verified-reel-webm/);',
    'assert.match(runtime, /2\\.38\\.0-page-no-contact-route/);',
    "TEST_RUNTIME_VERSION_V238"
)
replace_once(
    "tests/jarvis-semantic-memory-integrity.test.mjs",
    'assert.match(core, /tools\\.runtime\\.js\\?v=v94-live-human-reds-v113-20260809/);',
    'assert.match(core, /tools\\.runtime\\.js\\?v=v94-peninsula-page-v114-20260809/);',
    "TEST_CORE_RUNTIME_CACHE_V114"
)

page_test = read("tests/jarvis-page-artifact.test.mjs")
old_test = '''test("page studio fails closed instead of filling missing business content", () => {
    assert.throws(() => buildPageArtifactHtml({ brandName: "Sin contenido" }), /PAGE_CONTENT_REQUIRED/);
    assert.throws(() => buildPageArtifactHtml({ ...input, whatsapp: "", contactEmail: "" }), /PAGE_CONTACT_ROUTE_REQUIRED/);
});'''
new_test = '''test("page studio fails closed on missing business content but allows no-contact informational pages without inventing a route", () => {
    assert.throws(() => buildPageArtifactHtml({ brandName: "Sin contenido" }), /PAGE_CONTENT_REQUIRED/);
    const html = buildPageArtifactHtml({ ...input, whatsapp: "", contactEmail: "", whatsappRequested: false });
    const report = describePageArtifact({ ...input, whatsapp: "", contactEmail: "", whatsappRequested: false }, html);
    assert.match(html, /href="#servicios"/);
    assert.match(html, /Explorar servicios/);
    assert.doesNotMatch(html, /id="contacto"/);
    assert.doesNotMatch(html, /mailto:/);
    assert.doesNotMatch(html, /wa\.me/);
    assert.equal(report.hasContactRoute, false);
    assert.ok(Object.values(report.checks).every(Boolean));
});'''
if page_test.count(old_test) != 1:
    raise SystemExit(f"PAGE_TEST_CONTACT_CONTRACT_COUNT_{page_test.count(old_test)}")
write("tests/jarvis-page-artifact.test.mjs", page_test.replace(old_test, new_test, 1))

human_test = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
    ensureExecutableArtifactDependencies,
    describeMissionDependencies
} from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import {
    buildPageArtifactHtml,
    describePageArtifact
} from "../jarvis-page-artifact.js";

const catalog = [
    { name: "page.plan" },
    { name: "page.compose" },
    { name: "page.create" }
];

test("selected incomplete page.create gets page.compose structurally without lexical intent routing", () => {
    const calls = ensureExecutableArtifactDependencies({
        toolCalls: [
            { name: "page.plan", args: { brandName: "Península Tech" } },
            { name: "page.create", args: { brandName: "Península Tech" } }
        ],
        catalog
    });
    assert.deepEqual(calls.map(call => call.name), ["page.plan", "page.compose", "page.create"]);
    assert.equal(calls[1].reason, "STRUCTURAL_PAGE_CREATE_DEPENDENCY");
    assert.equal(calls[1].args.brandName, "Península Tech");
    const description = describeMissionDependencies();
    assert.equal(description.lexicalRouting, false);
    assert.equal(description.architecture, "tool_contract_dependency");
});

test("complete direct page.create remains direct and does not add a duplicate composer", () => {
    const calls = ensureExecutableArtifactDependencies({
        toolCalls: [{
            name: "page.create",
            args: {
                brandName: "Península Tech",
                title: "Plataforma de servicios",
                description: "Una experiencia digital para coordinar y dar seguimiento a solicitudes de servicio.",
                services: [{ title: "Seguimiento", description: "Consulta el estado de cada solicitud." }]
            }
        }],
        catalog
    });
    assert.deepEqual(calls.map(call => call.name), ["page.create"]);
});

test("Península Tech informational page renders without fabricated phone or email", () => {
    const input = {
        brandName: "Península Tech",
        title: "Tecnología para coordinar servicios con claridad",
        description: "Plataforma para solicitar, coordinar y dar seguimiento a servicios desde una experiencia digital.",
        services: [
            { title: "Solicitud digital", description: "Inicia y organiza una solicitud de servicio desde una sola experiencia." },
            { title: "Seguimiento", description: "Consulta el estado operativo y la evidencia disponible del servicio." },
            { title: "Coordinación", description: "Centraliza la comunicación y los pasos necesarios para atender el servicio." }
        ],
        whatsapp: "",
        whatsappRequested: false,
        contactEmail: ""
    };
    const html = buildPageArtifactHtml(input);
    const report = describePageArtifact(input, html);
    assert.ok(Object.values(report.checks).every(Boolean));
    assert.equal(report.hasContactRoute, false);
    assert.match(html, /Península Tech/);
    assert.match(html, /Explorar servicios/);
    assert.doesNotMatch(html, /mailto:/);
    assert.doesNotMatch(html, /wa\.me/);
    assert.doesNotMatch(html, /Lorem ipsum|TODO|undefined/);
});

test("page physical result contract includes digest and truthful human response", () => {
    const bridge = fs.readFileSync(path.join(process.cwd(), "jarvis-fs-bridge.js"), "utf8");
    const response = fs.readFileSync(path.join(process.cwd(), "gestia-core", "tools.bridge.js"), "utf8");
    const runtime = fs.readFileSync(path.join(process.cwd(), "gestia-core", "tools.runtime.js"), "utf8");
    assert.match(bridge, /2\.38\.0-page-no-contact-route/);
    assert.match(bridge, /PAGE_BYTE_COUNT_MISMATCH/);
    assert.match(bridge, /sha256/);
    assert.match(response, /HTML fue creado físicamente/);
    assert.match(response, /SHA-256/);
    assert.match(runtime, /2\.38\.0-page-no-contact-route/);
});
'''
write("tests/jarvis-peninsula-page-v114.test.mjs", human_test)

print("V114_PAGE_PATCH_APPLIED")
