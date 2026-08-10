function text(value, fallback = "") {
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

function utf8ByteLength(value = "") {
    const source = String(value || "");
    if (typeof TextEncoder === "function") {
        return new TextEncoder().encode(source).byteLength;
    }
    if (typeof Buffer !== "undefined" && typeof Buffer.byteLength === "function") {
        return Buffer.byteLength(source, "utf8");
    }
    throw new Error("PAGE_UTF8_BYTE_COUNTER_UNAVAILABLE");
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
        bytes: utf8ByteLength(html),
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
