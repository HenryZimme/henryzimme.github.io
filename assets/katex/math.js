// math.js | henryzimmerman.net
// KaTeX render pass + hover/focus "copy TeX" + staged resolve (raw TeX -> typeset).
// needs katex.min.js and auto-render.min.js loaded first (in order).
//
// config via data-* on this script tag:
//   data-root     selector to render inside            (default: body)
//   data-resolve  selector whose math gets the staged resolve (default: none)
//   data-dollar   "1" to also accept $...$ / $$...$$   (default: \( \) and \[ \] only)
(function () {
  'use strict';
  var cfg = (document.currentScript && document.currentScript.dataset) || {};

  var delimiters = [
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
  ];
  if (cfg.dollar === '1') {
    delimiters.unshift({ left: '$$', right: '$$', display: true });
    delimiters.push({ left: '$', right: '$', display: false });
  }

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---  staged resolve: raw TeX in dim mono for a beat, then typeset
  var HOLD_MS = 420, STAGGER_MS = 70, STAGGER_CAP = 6;
  var resolveIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    var i = 0;
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      resolveIO.unobserve(en.target);
      var el = en.target;
      setTimeout(function () { el.classList.add('is-resolved'); },
        HOLD_MS + Math.min(i++, STAGGER_CAP) * STAGGER_MS);
    });
  }, { threshold: 0.6 }) : null;

  function texOf(host) {
    var a = host.querySelector('annotation[encoding="application/x-tex"]');
    return a ? a.textContent.trim() : '';
  }

  function decorate(root) {
    var resolveSel = cfg.resolve || '';
    root.querySelectorAll('.katex').forEach(function (k) {
      var host = k.parentElement && k.parentElement.classList.contains('katex-display')
        ? k.parentElement : k;
      if (host.classList.contains('tex')) return;
      var tex = texOf(host);
      if (!tex) return;
      host.classList.add('tex');
      host.dataset.tex = tex;
      host.tabIndex = 0;

      if (resolveSel && resolveIO && !reduceMotion && host.closest(resolveSel)) {
        var src = document.createElement('span');
        src.className = 'tex-src';
        src.setAttribute('aria-hidden', 'true');
        src.textContent = tex;
        host.classList.add('tex-resolve');
        host.appendChild(src);
        resolveIO.observe(host);
      }
    });
  }

  // ---  copy button: one shared node on <body>, position:fixed, so no ancestor
  //      overflow/stacking context (card-expand, katex-display, tables) can clip or bury it
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tex-copy';
  btn.textContent = 'copy TeX';
  btn.hidden = true;
  btn.setAttribute('aria-label', 'Copy LaTeX source');
  document.body.appendChild(btn);

  var current = null, hideTimer = 0, resetTimer = 0;

  function place(host) {
    var r = host.getBoundingClientRect();
    btn.hidden = false;
    var bw = btn.offsetWidth, bh = btn.offsetHeight;
    var top = r.top - bh - 4;
    if (top < 64) top = r.bottom + 4;          // clear the fixed nav
    var left = Math.min(Math.max(8, r.right - bw), window.innerWidth - bw - 8);
    btn.style.top = Math.round(top) + 'px';
    btn.style.left = Math.round(left) + 'px';
  }
  function show(host) {
    clearTimeout(hideTimer);
    if (current !== host) { btn.textContent = 'copy TeX'; btn.classList.remove('is-done'); }
    current = host;
    place(host);
  }
  function hideSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { btn.hidden = true; current = null; }, 220);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, fail) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(e); }
      ta.remove();
    });
  }

  document.addEventListener('mouseover', function (e) {
    var h = e.target.closest && e.target.closest('.tex');
    if (h) show(h);
  });
  document.addEventListener('mouseout', function (e) {
    var h = e.target.closest && e.target.closest('.tex');
    if (h && !h.contains(e.relatedTarget) && e.relatedTarget !== btn) hideSoon();
  });
  document.addEventListener('focusin', function (e) {
    if (e.target.classList && e.target.classList.contains('tex')) show(e.target);
  });
  document.addEventListener('focusout', function (e) {
    if (e.relatedTarget !== btn && e.target.classList &&
        e.target.classList.contains('tex')) hideSoon();
  });
  btn.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
  btn.addEventListener('mouseleave', hideSoon);
  btn.addEventListener('blur', hideSoon);
  btn.addEventListener('click', function () {
    if (!current) return;
    copy(current.dataset.tex).then(function () {
      btn.textContent = 'copied';
      btn.classList.add('is-done');
    }, function () { btn.textContent = 'copy failed'; });
    clearTimeout(resetTimer);
    resetTimer = setTimeout(function () {
      btn.textContent = 'copy TeX'; btn.classList.remove('is-done');
    }, 1400);
  });
  window.addEventListener('scroll', function () { if (!btn.hidden) { btn.hidden = true; current = null; } }, { passive: true });
  window.addEventListener('resize', function () { btn.hidden = true; current = null; });

  // ---  render
  var root = document.querySelector(cfg.root || 'body') || document.body;
  function render(el) {
    renderMathInElement(el, { delimiters: delimiters, throwOnError: false });
    decorate(el);
  }
  window.siteMath = { render: render };   // for pages that re-typeset dynamic content
  render(root);
})();
