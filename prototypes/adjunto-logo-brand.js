(() => {
  'use strict';

  const SOURCES = [
    'peninsula-tech-final-animated.local-20260801-162734.html',
    'peninsula-tech-final-animated.html'
  ];

  const defaults = {
    brand: 'ADJUNTO',
    tagline: 'TECNOLOGÍA · CONEXIÓN · SOLUCIONES',
    brandSize: 8.4,
    brandY: 67.8,
    tracking: 0.10,
    glow: 1,
    speed: 1,
    finish: 'steel'
  };

  const state = { ...defaults };
  const frame = document.getElementById('logoFrame');
  const panel = document.getElementById('panel');
  const badge = document.getElementById('statusBadge');
  const sourceText = document.getElementById('sourceText');
  let activeSource = '';

  async function sourceExists(src) {
    try {
      const response = await fetch(src, { method: 'HEAD', cache: 'no-store' });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  async function chooseSource() {
    for (const src of SOURCES) {
      if (await sourceExists(src)) return src;
    }
    return SOURCES[SOURCES.length - 1];
  }

  function getFrameDocument() {
    try { return frame.contentDocument || frame.contentWindow?.document || null; }
    catch (_) { return null; }
  }

  function injectionCss() {
    return `
      :root{
        --adj-brand-size:${state.brandSize};
        --adj-brand-y:${state.brandY}%;
        --adj-tracking:${state.tracking}em;
        --adj-glow:${state.glow};
      }
      .controls{display:none!important}
      .adjunto-erase{position:absolute;z-index:12;left:0;right:0;top:55.8%;bottom:4%;pointer-events:none;background:radial-gradient(ellipse at 50% 22%,rgba(0,10,28,.985) 0,rgba(0,0,0,.996) 44%,#000 74%);box-shadow:0 -34px 62px rgba(0,0,0,.94),0 26px 46px #000,inset 0 0 110px rgba(0,0,0,.38)}
      .adjunto-wordmark{position:absolute;z-index:14;left:50%;top:var(--adj-brand-y);transform:translate(-50%,-50%) scale(.9);white-space:nowrap;font-family:Arial Black,Impact,Inter,Segoe UI,sans-serif;font-size:calc(var(--adj-brand-size) * 1vw);font-weight:950;line-height:.9;letter-spacing:var(--adj-tracking);text-align:center;opacity:0;color:transparent;background:linear-gradient(180deg,#ffffff 0%,#d8f6ff 16%,#6f8eaa 42%,#f7ffff 58%,#8dacc5 75%,#274b72 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-stroke:.045em rgba(217,248,255,.72);filter:drop-shadow(0 0 calc(7px * var(--adj-glow)) rgba(255,255,255,.75)) drop-shadow(0 0 calc(18px * var(--adj-glow)) rgba(0,145,255,.78)) drop-shadow(0 .08em .05em #000);animation:adjuntoReveal 8.6s cubic-bezier(.2,.8,.2,1) infinite}
      .adjunto-wordmark[data-finish="ice"]{background:linear-gradient(180deg,#fff 0%,#d9ffff 28%,#6de8ff 58%,#087cff 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-stroke:.035em rgba(225,255,255,.8)}
      .adjunto-tagline{position:absolute;z-index:14;left:50%;top:calc(var(--adj-brand-y) + 5.8%);transform:translateX(-50%);width:92%;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#b7d5e5;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:2.05vw;font-weight:800;letter-spacing:.18em;text-shadow:0 0 calc(10px * var(--adj-glow)) rgba(0,142,255,.65);opacity:0;animation:adjuntoTag 8.6s ease infinite}
      @keyframes adjuntoReveal{0%,38%{opacity:0;transform:translate(-50%,-50%) scale(.82);filter:blur(8px)}48%{opacity:1;transform:translate(-50%,-50%) scale(1.04);filter:blur(0) drop-shadow(0 0 calc(8px * var(--adj-glow)) #fff) drop-shadow(0 0 calc(24px * var(--adj-glow)) #087cff)}56%,88%{opacity:1;transform:translate(-50%,-50%) scale(1);filter:drop-shadow(0 0 calc(7px * var(--adj-glow)) rgba(255,255,255,.72)) drop-shadow(0 0 calc(18px * var(--adj-glow)) rgba(0,145,255,.72)) drop-shadow(0 .08em .05em #000)}96%,100%{opacity:0;transform:translate(-50%,-50%) scale(.98)}}
      @keyframes adjuntoTag{0%,52%{opacity:0;transform:translateX(-50%) translateY(8px)}62%,88%{opacity:.95;transform:translateX(-50%) translateY(0)}96%,100%{opacity:0}}
    `;
  }

  function applyPlaybackRate(doc) {
    const rate = Number(state.speed) || 1;
    for (const animation of doc.getAnimations()) {
      animation.playbackRate = rate;
    }
  }

  function injectLab() {
    const doc = getFrameDocument();
    if (!doc) return;
    const wrap = doc.querySelector('.poster-wrap');
    if (!wrap) {
      badge.textContent = 'FUENTE NO COMPATIBLE';
      return;
    }

    doc.getElementById('adjunto-lab-style')?.remove();
    doc.getElementById('adjunto-lab-overlay')?.remove();

    const style = doc.createElement('style');
    style.id = 'adjunto-lab-style';
    style.textContent = injectionCss();
    doc.head.appendChild(style);

    const overlay = doc.createElement('div');
    overlay.id = 'adjunto-lab-overlay';
    overlay.innerHTML = `
      <div class="adjunto-erase"></div>
      <div class="adjunto-wordmark" data-finish="${state.finish}"></div>
      <div class="adjunto-tagline"></div>
    `;
    wrap.appendChild(overlay);

    renderText();
    applyPlaybackRate(doc);
    badge.textContent = activeSource.includes('.local-') ? 'FUENTE FINAL LOCAL · SIA7 INTACTO' : 'RESPALDO VERSIONADO · SIA7 INTACTO';
    sourceText.textContent = `Fuente visual: ${activeSource}`;
  }

  function renderText() {
    const doc = getFrameDocument();
    if (!doc) return;
    const brand = doc.querySelector('.adjunto-wordmark');
    const tagline = doc.querySelector('.adjunto-tagline');
    if (brand) {
      brand.textContent = state.brand.trim() || defaults.brand;
      brand.dataset.finish = state.finish;
    }
    if (tagline) tagline.textContent = state.tagline.trim();
  }

  function setFrameVariable(name, value) {
    const doc = getFrameDocument();
    doc?.documentElement.style.setProperty(name, value);
  }

  function bindText(id, key) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = state[key];
    input.addEventListener('input', event => {
      state[key] = event.target.value;
      renderText();
    });
  }

  function bindRange(id, key, outputId, formatter, variable, suffix = '') {
    const input = document.getElementById(id);
    const output = document.getElementById(outputId);
    if (!input || !output) return;
    input.value = state[key];
    const update = () => {
      state[key] = Number(input.value);
      output.value = formatter(state[key]);
      output.textContent = formatter(state[key]);
      if (variable) setFrameVariable(variable, `${state[key]}${suffix}`);
      if (key === 'speed') {
        const doc = getFrameDocument();
        if (doc) applyPlaybackRate(doc);
      }
    };
    input.addEventListener('input', update);
    update();
  }

  function replay() {
    const doc = getFrameDocument();
    if (!doc) return;
    for (const animation of doc.getAnimations()) {
      animation.cancel();
      animation.play();
      animation.playbackRate = state.speed;
    }
  }

  function reset() {
    Object.assign(state, defaults);
    document.getElementById('brandText').value = state.brand;
    document.getElementById('taglineText').value = state.tagline;
    for (const [id, key] of [['brandSize','brandSize'],['brandY','brandY'],['tracking','tracking'],['glow','glow'],['speed','speed']]) {
      const input = document.getElementById(id);
      if (!input) continue;
      input.value = state[key];
      input.dispatchEvent(new Event('input'));
    }
    document.querySelectorAll('.finish').forEach(button => button.classList.toggle('active', button.dataset.finish === state.finish));
    injectLab();
  }

  bindText('brandText', 'brand');
  bindText('taglineText', 'tagline');
  bindRange('brandSize', 'brandSize', 'brandSizeOut', value => value.toFixed(1), '--adj-brand-size');
  bindRange('brandY', 'brandY', 'brandYOut', value => `${value.toFixed(1)}%`, '--adj-brand-y', '%');
  bindRange('tracking', 'tracking', 'trackingOut', value => `${value.toFixed(2)}em`, '--adj-tracking', 'em');
  bindRange('glow', 'glow', 'glowOut', value => `${value.toFixed(2)}×`, '--adj-glow');
  bindRange('speed', 'speed', 'speedOut', value => `${value.toFixed(2)}×`);

  document.querySelectorAll('.finish').forEach(button => {
    button.addEventListener('click', () => {
      state.finish = button.dataset.finish;
      document.querySelectorAll('.finish').forEach(item => item.classList.toggle('active', item === button));
      renderText();
    });
  });

  document.getElementById('replay')?.addEventListener('click', replay);
  document.getElementById('reset')?.addEventListener('click', reset);
  document.getElementById('fullscreen')?.addEventListener('click', async () => {
    const target = document.querySelector('.preview');
    if (!document.fullscreenElement) await target.requestFullscreen?.();
    else await document.exitFullscreen?.();
  });
  document.getElementById('copySettings')?.addEventListener('click', async event => {
    const payload = JSON.stringify({ lab: 'ADJUNTO', source: activeSource, ...state }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      event.currentTarget.textContent = 'Copiado';
      setTimeout(() => { event.currentTarget.textContent = 'Copiar ajustes'; }, 1200);
    } catch (_) {
      window.prompt('Copia estos ajustes:', payload);
    }
  });
  document.getElementById('mobileToggle')?.addEventListener('click', event => {
    panel.classList.toggle('open');
    event.currentTarget.textContent = panel.classList.contains('open') ? 'Cerrar ajustes' : 'Ajustes';
  });

  frame.addEventListener('load', () => setTimeout(injectLab, 80));

  chooseSource().then(src => {
    activeSource = src;
    frame.src = src;
  });
})();
