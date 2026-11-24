/* Botões flutuantes que a pessoa pode arrastar para outro lugar da tela.
   Segure e arraste. A posição fica guardada neste aparelho.
   Para voltar ao lugar de sempre, arraste o botão de volta para perto da posição original. */
(function () {
  window.MOVER = function (key, sels) {
    var K = key + '_mover', P = {};
    try { P = JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (_) { P = {}; }
    function save() { try { localStorage.setItem(K, JSON.stringify(P)); } catch (_) {} }
    function idOf(el, s) { if (!/\s/.test(s.trim())) return s; return s + '|' + String(el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30); }
    function match(t) { for (var i = 0; i < sels.length; i++) { var e = t.closest && t.closest(sels[i]); if (e) return { el: e, id: idOf(e, sels[i]) }; } return null; }
    function put(el, x, y) { el.style.translate = (x || y) ? x + 'px ' + y + 'px' : ''; }
    function clampAll() {
      sels.forEach(function (s) {
        Array.prototype.forEach.call(document.querySelectorAll(s), function (el) {
          if (!el.dataset.mvok) { el.dataset.mvok = '1'; el.style.touchAction = 'none'; el.title = el.title || 'Segure e arraste para mudar de lugar'; }
          var p = P[idOf(el, s)];
          if (!p) { if (el.style.translate) el.style.translate = ''; return; }
          var want = p.x + 'px ' + p.y + 'px';
          if (el.style.translate !== want) el.style.translate = want;
          var r = el.getBoundingClientRect();
          if (!r.width) return;
          var dx = 0, dy = 0;
          if (r.left < 4) dx = 4 - r.left; else if (r.right > innerWidth - 4) dx = innerWidth - 4 - r.right;
          if (r.top < 4) dy = 4 - r.top; else if (r.bottom > innerHeight - 4) dy = innerHeight - 4 - r.bottom;
          if (dx || dy) { p.x += Math.round(dx); p.y += Math.round(dy); put(el, p.x, p.y); save(); }
        });
      });
    }
    var D = null, block = 0;
    document.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      var m = match(e.target); if (!m) return;
      var p = P[m.id] || { x: 0, y: 0 };
      D = { el: m.el, id: m.id, sx: e.clientX, sy: e.clientY, bx: p.x, by: p.y, on: false, pid: e.pointerId };
    }, true);
    document.addEventListener('pointermove', function (e) {
      if (!D || e.pointerId !== D.pid) return;
      var dx = e.clientX - D.sx, dy = e.clientY - D.sy;
      if (!D.on && Math.abs(dx) + Math.abs(dy) < 10) return;
      if (!D.on) { D.on = true; D.el.style.transition = 'none'; D.el.style.opacity = '.85'; try { D.el.setPointerCapture(D.pid); } catch (_) {} }
      e.preventDefault();
      put(D.el, D.bx + dx, D.by + dy);
    }, { capture: true, passive: false });
    function end(e) {
      if (!D || (e && e.pointerId !== D.pid)) return;
      var d = D; D = null;
      if (!d.on) return;
      d.el.style.opacity = ''; d.el.style.transition = '';
      var x = Math.round(d.bx + (e ? e.clientX - d.sx : 0)), y = Math.round(d.by + (e ? e.clientY - d.sy : 0));
      if (Math.abs(x) < 24 && Math.abs(y) < 24) { delete P[d.id]; put(d.el, 0, 0); } else { P[d.id] = { x: x, y: y }; }
      save(); block = Date.now(); clampAll();
    }
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', function (e) { if (D && D.on) end(e); else D = null; }, true);
    window.addEventListener('click', function (e) { if (Date.now() - block < 400 && match(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    addEventListener('resize', clampAll);
    setInterval(clampAll, 700); setTimeout(clampAll, 300);
    window.MOVER_RESET = function () { P = {}; save(); clampAll(); };
  };
})();
