(() => {
  const BRAND = 'ADJUNTO';

  function renderAdjuntoWordmark() {
    const letters = document.getElementById('letters');
    if (letters && letters.textContent !== BRAND) {
      letters.innerHTML = [...BRAND].map(letter => `<i>${letter}</i>`).join('');
    }

    const secondary = document.getElementById('tech');
    if (secondary) {
      secondary.textContent = '';
      secondary.setAttribute('aria-hidden', 'true');
    }
  }

  const originalPrepareWordmark = window.prepareWordmark;
  window.prepareWordmark = function prepareAdjuntoWordmark() {
    if (typeof originalPrepareWordmark === 'function') {
      originalPrepareWordmark();
    }

    renderAdjuntoWordmark();

    document.getElementById('tech')?.classList.remove('on');
    document.getElementById('tag')?.classList.remove('on');
    document.getElementById('slogan')?.classList.remove('on');
  };

  const observer = new MutationObserver(renderAdjuntoWordmark);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  renderAdjuntoWordmark();
})();
