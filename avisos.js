/* Aviso numérico (bolinha com número) de novidades não vistas: publicações novas na Comunidade
   e mensagens novas nas conversas. Cada app chama NBADGE({...}) com as suas funções. */
(function () {
  if (!document.getElementById('nb-css')) {
    var st = document.createElement('style'); st.id = 'nb-css';
    st.textContent = '.nb-host{position:relative}.nb-pill{position:absolute;top:2px;right:2px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#E0262B;color:#fff;font:800 12px/20px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px var(--card,var(--surface,#fff));pointer-events:none;z-index:2}.nb-pill.nb-in{position:static;display:inline-block;margin-left:6px;vertical-align:middle;box-shadow:none}';
    document.head.appendChild(st);
  }
  function tsOf(p) { if (typeof p.at === 'number') return p.at; var n = Date.parse(p.ts || p.at || ''); return isNaN(n) ? 0 : n; }
  window.NBADGE = function (C) {
    var K = C.key + '_com_seen';
    function get() { try { return +localStorage.getItem(K) || 0; } catch (_) { return 0; } }
    function put(v) { try { localStorage.setItem(K, String(v)); } catch (_) {} }
    function pill(el, n, inline) {
      if (!el) return;
      var p = el.querySelector(':scope > .nb-pill');
      if (!n) { if (p) { p.remove(); if (el.dataset.nbo) el.setAttribute('aria-label', el.dataset.nbo); else el.removeAttribute('aria-label'); delete el.dataset.nbl; } return; }
      if (!el.dataset.nbl) { el.dataset.nbo = el.getAttribute('aria-label') || ''; el.dataset.nbl = (el.dataset.nbo || (el.querySelector('.lg') || el).textContent || '').trim(); }
      if (!inline) el.classList.add('nb-host');
      if (!p) { p = document.createElement('span'); p.className = 'nb-pill' + (inline ? ' nb-in' : ''); p.setAttribute('aria-hidden', 'true'); el.appendChild(p); }
      var t = n > 99 ? '99+' : String(n);
      if (p.textContent !== t) p.textContent = t;
      el.setAttribute('aria-label', el.dataset.nbl + ' (' + t + (n === 1 ? ' novidade)' : ' novidades)'));
    }
    function tick() {
      try {
        var me = C.me ? C.me() : null, P = [];
        try { P = (C.posts() || []).filter(function (p) { return p && p.uid !== me && !p.hid; }); } catch (_) {}
        var mx = 0; P.forEach(function (p) { var t = tsOf(p); if (t > mx) mx = t; });
        var s = get();
        if (!s && mx) { put(mx); s = mx; }
        var on = false; try { on = !!C.onCom(); } catch (_) {}
        if (on && !document.hidden && mx > s) { put(mx); s = mx; }
        var nc = s ? P.filter(function (p) { return tsOf(p) > s; }).length : 0, nd = 0;
        try { nd = +C.dm() || 0; } catch (_) {}
        var n = me ? nc + nd : 0;
        (C.targets() || []).forEach(function (el) { pill(el, n); });
        if (C.inline) (C.inline() || []).forEach(function (el) { pill(el, nc, 1); });
      } catch (_) {}
    }
    setInterval(tick, 1500); setTimeout(tick, 600);
    return tick;
  };
})();
