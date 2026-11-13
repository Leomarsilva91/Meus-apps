/* Apresentação animada do app (abre na primeira vez e pode ser aberta de novo pelo rodapé).
   Cada app define window.IA_INTRO = {app, nome, cor, fundo, tinta, slides:[{ic, t, x}]} antes de carregar este arquivo. */
(function () {
  var C = window.IA_INTRO;
  if (!C || !C.slides || !C.slides.length) return;
  var KEY = 'intro_' + C.app + '_v1', S = C.slides, i = 0, paused = false, root = null;
  var reduce = false;
  try { reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  paused = reduce;
  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function mark() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function addCss() {
    if (document.getElementById('ia-intro-css')) return;
    var st = document.createElement('style'); st.id = 'ia-intro-css';
    st.textContent =
      '#ia-intro{position:fixed;inset:0;z-index:2147482500;display:grid;place-items:center;padding:16px;background:rgba(10,14,24,.72);font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}' +
      '#ia-intro .iac{position:relative;width:min(440px,100%);max-height:calc(100dvh - 24px);overflow:auto;border-radius:24px;background:' + (C.fundo || '#fff') + ';color:' + (C.tinta || '#111') + ';padding:16px 18px 18px;display:grid;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.4)}' +
      '#ia-intro .iab{height:5px;border-radius:3px;background:rgba(127,127,127,.25);overflow:hidden}' +
      '#ia-intro .iab i{display:block;height:100%;width:0;background:' + (C.cor || '#2457d6') + ';animation:iaw 4.5s linear forwards}' +
      '#ia-intro.pz .iab i{animation-play-state:paused}' +
      '@keyframes iaw{to{width:100%}}' +
      '@keyframes iaup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
      '@keyframes iabo{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}' +
      '#ia-intro .iah{display:flex;justify-content:space-between;align-items:center;gap:8px}' +
      '#ia-intro .iah b{font-size:14px;opacity:.75}' +
      '#ia-intro .iask{min-height:44px;padding:0 14px;border-radius:999px;border:1.5px solid rgba(127,127,127,.5);background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}' +
      '#ia-intro .iast{display:grid;gap:10px;text-align:center;justify-items:center;padding:6px 0;animation:iaup .45s ease both}' +
      '#ia-intro .iaic{font-size:68px;line-height:1;animation:iabo 2.4s ease-in-out infinite}' +
      '#ia-intro h2{margin:0;font-size:24px;line-height:1.15}' +
      '#ia-intro p{margin:0;font-size:16.5px}' +
      '#ia-intro .iad{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}' +
      '#ia-intro .iad button{width:24px;height:24px;border-radius:50%;border:0;background:rgba(127,127,127,.35);cursor:pointer;padding:0}' +
      '#ia-intro .iad button[aria-current=true]{background:' + (C.cor || '#2457d6') + '}' +
      '#ia-intro .iar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}' +
      '#ia-intro .iar button{min-height:48px;border-radius:14px;border:1.5px solid rgba(127,127,127,.5);background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}' +
      '#ia-intro .iar button.pr{background:' + (C.cor || '#2457d6') + ';border-color:' + (C.cor || '#2457d6') + ';color:#fff}' +
      '#ia-intro .iar button:disabled{opacity:.4;cursor:default}' +
      '#ia-intro details{border-top:1px solid rgba(127,127,127,.35);padding-top:6px}' +
      '#ia-intro summary{cursor:pointer;font-weight:700;min-height:40px;display:flex;align-items:center;justify-content:space-between;list-style:none}' +
      '#ia-intro summary::-webkit-details-marker{display:none}' +
      '#ia-intro summary::after{content:"+";font-weight:800;font-size:1.3em;padding:0 6px}' +
      '#ia-intro details[open]>summary::after{content:"\\2212"}' +
      '#ia-intro .iat{display:grid;gap:10px;padding:4px 0 2px;font-size:15px}' +
      '#ia-intro .iat p{font-size:15px}' +
      '@media (prefers-reduced-motion:reduce){#ia-intro *{animation:none!important}}';
    document.head.appendChild(st);
  }
  function draw() {
    var s = S[i], last = i === S.length - 1;
    root.className = paused ? 'pz' : '';
    root.innerHTML =
      '<div class="iac" role="dialog" aria-modal="true" aria-label="Como funciona o ' + esc(C.nome) + '">' +
      '<div class="iah"><b>' + esc(C.nome) + ' · ' + (i + 1) + ' de ' + S.length + '</b><button type="button" class="iask" data-ia="skip" aria-label="Pular a apresentação">Pular</button></div>' +
      (reduce ? '' : '<div class="iab" aria-hidden="true"><i></i></div>') +
      '<div class="iast" aria-live="polite"><span class="iaic" aria-hidden="true">' + s.ic + '</span><h2>' + esc(s.t) + '</h2><p>' + esc(s.x) + '</p></div>' +
      '<div class="iad" role="group" aria-label="Escolher parte">' + S.map(function (_, k) { return '<button type="button" data-ia-go="' + k + '" aria-label="Parte ' + (k + 1) + '"' + (k === i ? ' aria-current="true"' : '') + '></button>'; }).join('') + '</div>' +
      '<div class="iar"><button type="button" data-ia="prev"' + (i === 0 ? ' disabled' : '') + '>Anterior</button>' +
      '<button type="button" data-ia="pause">' + (paused ? 'Continuar' : 'Pausar') + '</button>' +
      '<button type="button" class="pr" data-ia="' + (last ? 'skip' : 'next') + '">' + (last ? 'Começar' : 'Próximo') + '</button></div>' +
      '<details><summary>Ler tudo em texto</summary><div class="iat">' + S.map(function (z) { return '<p><b>' + esc(z.t) + '.</b> ' + esc(z.x) + '</p>'; }).join('') + '</div></details></div>';
    var bar = root.querySelector('.iab i');
    if (bar) bar.addEventListener('animationend', function () { if (!paused) { if (i < S.length - 1) { i++; draw(); } } });
    var f = root.querySelector('.pr'); if (f) { try { f.focus({ preventScroll: true }); } catch (e) {} }
  }
  function close() { mark(); if (root) { root.remove(); root = null; } document.body.style.overflow = ''; document.removeEventListener('keydown', key); }
  function key(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' && i < S.length - 1) { i++; draw(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); } }
  function open() {
    if (root) return; addCss(); i = 0; paused = reduce;
    root = document.createElement('div'); root.id = 'ia-intro'; document.body.appendChild(root); document.body.style.overflow = 'hidden';
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b) return;
      var a = b.getAttribute('data-ia'), g = b.getAttribute('data-ia-go');
      if (g != null) { i = +g; draw(); return; }
      if (a === 'skip') close(); else if (a === 'next') { if (i < S.length - 1) { i++; draw(); } } else if (a === 'prev') { if (i > 0) { i--; draw(); } } else if (a === 'pause') { paused = !paused; draw(); }
    });
    document.addEventListener('keydown', key);
    draw();
  }
  window.IA_INTRO_OPEN = open;
  function link() {
    if (document.getElementById('ia-introlink')) return true;
    var f = document.getElementById('ia-admlink');
    if (!f) { if (!link.n) link.n = 0; if (++link.n < 12) return false; f = document.createElement('div'); f.id = 'ia-admlink'; f.style.cssText = 'text-align:center;padding:18px 12px 90px;font:13px system-ui,sans-serif'; document.body.appendChild(f); }
    var a = document.createElement('a'); a.id = 'ia-introlink'; a.href = '#'; a.textContent = 'Como o ' + C.nome + ' funciona'; a.style.cssText = 'color:inherit;font-weight:700;display:inline-block;padding:10px 6px';
    a.onclick = function (e) { e.preventDefault(); open(); };
    f.insertBefore(document.createElement('br'), f.firstChild); f.insertBefore(a, f.firstChild); return true;
  }
  var tries = setInterval(function () { if (link()) clearInterval(tries); }, 500);
  addEventListener('load', function () { setTimeout(function () { if (!seen()) open(); }, 700); });
})();
