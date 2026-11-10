// Faz os apps funcionarem fora do Claude: usa o servidor de IA no lugar de claude.use('sample').
(function () {
  if (window.claude || !window.IA_URL) return;
  var URL_IA = window.IA_URL;
  function paraB64(blob) {
    return new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); ok({ tipo: blob.type || 'image/jpeg', dados: s.slice(s.indexOf(',') + 1) }); };
      r.onerror = no; r.readAsDataURL(blob);
    });
  }
  function erro(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  async function chamar(input, opts, json) {
    opts = opts || {};
    var texto = typeof input === 'string' ? input : (input || []).map(function (m) { return (m.role === 'user' ? 'Usuário: ' : 'Assistente: ') + m.content; }).join('\n');
    if (json) texto += '\n\nResponda somente com JSON válido, sem markdown e sem texto fora do JSON.';
    var imagens = [];
    try { imagens = await Promise.all((opts.images || []).slice(0, 3).map(paraB64)); } catch (_) { throw erro('images_unavailable'); }
    var res;
    try {
      res = await fetch(URL_IA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: texto, imagens: imagens, max: json ? 1500 : 500 }) });
    } catch (_) { throw erro('network_error', 'Sem conexão com o servidor de IA.'); }
    if (res.status === 429) throw erro('rate_limited', 'Limite de usos da IA atingido por hoje.');
    if (!res.ok) throw erro('server_error', 'A IA não respondeu agora.');
    return (await res.json()).texto || '';
  }
  function extrair(t) {
    t = String(t).replace(/```(?:json)?/gi, '').trim();
    var a = t.search(/[\[{]/), z = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (a < 0 || z < a) throw erro('invalid_json');
    try { return JSON.parse(t.slice(a, z + 1)); } catch (_) { throw erro('invalid_json'); }
  }
  var sample = async function (input, opts) { return { text: await chamar(input, opts, false), truncated: false }; };
  sample.json = async function (input, opts) { return extrair(await chamar(input, opts, true)); };
  sample.limits = async function () { return { images: { maxCount: 3 } }; };

  /* ---- modo administrador deste aparelho (não é segurança de servidor) ---- */
  var K = 'ia_admin', KP = 'ia_pin', KI = 'ia_uid';
  function ls(op, k, v) { try { return op === 'g' ? localStorage.getItem(k) : op === 's' ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { return null; } }
  function isAdm() { return ls('g', K) === '1'; }
  function uid() { var u = ls('g', KI); if (!u) { u = 'l' + Math.random().toString(36).slice(2, 10); ls('s', KI, u); } return u; }
  var user = {
    isOwner: async function () { return isAdm(); },
    canEdit: async function () { return isAdm(); },
    can: async function () { return isAdm() ? true : null; },
    id: async function () { return uid(); },
    me: async function () { return { id: uid() }; },
    profiles: async function () { return {}; }
  };
  async function sha(t) {
    var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ia|' + t));
    return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  function modal(msg, pedeDois, ok) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px;font:16px system-ui,sans-serif';
    d.innerHTML = '<form style="background:#fff;color:#111;border-radius:16px;padding:18px;max-width:340px;width:100%;display:grid;gap:10px"><b>Modo administrador</b><span style="font-size:14px;color:#444"></span>' + (pedeDois ? '<input type="email" autocomplete="off" placeholder="Seu e-mail" maxlength="80" style="font-size:18px;padding:10px;border:1px solid #bbb;border-radius:10px">' : '') + '<input type="password" inputmode="numeric" autocomplete="off" placeholder="PIN (4 a 8 números)" maxlength="8" style="font-size:18px;padding:10px;border:1px solid #bbb;border-radius:10px">' + (pedeDois ? '<input type="password" inputmode="numeric" autocomplete="off" placeholder="Repita o PIN" maxlength="8" style="font-size:18px;padding:10px;border:1px solid #bbb;border-radius:10px">' : '') + '<span class="e" style="font-size:13px;color:#b00020"></span><div style="display:flex;gap:8px"><button type="submit" style="flex:1;padding:12px;border:0;border-radius:10px;background:#111;color:#fff;font-size:16px">Entrar</button><button type="button" style="flex:1;padding:12px;border:1px solid #bbb;border-radius:10px;background:#fff;font-size:16px">Cancelar</button></div></form>';
    d.querySelector('span').textContent = msg;
    document.body.appendChild(d);
    var f = d.querySelector('form'), ins = f.querySelectorAll('input'), e = f.querySelector('.e');
    var em = pedeDois ? ins[0] : null, p1 = pedeDois ? ins[1] : ins[0], p2 = pedeDois ? ins[2] : null;
    ins[0].focus();
    f.querySelector('button[type=button]').onclick = function () { d.remove(); history.replaceState(null, '', location.pathname + location.search); };
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim())) { e.textContent = 'Digite um e-mail válido.'; return; }
      if (!/^\d{4,8}$/.test(p1.value)) { e.textContent = 'Use de 4 a 8 números.'; return; }
      if (p2 && p2.value !== p1.value) { e.textContent = 'Os dois PINs não são iguais.'; return; }
      var h = await sha(p1.value);
      if (em) ls('s', 'ia_email', em.value.trim().toLowerCase());
      if (await ok(h)) { d.remove(); location.hash = ''; location.reload(); } else e.textContent = 'PIN incorreto.';
    };
  }
  function abrirAdmin() {
    if (isAdm()) { if (confirm('Sair do modo administrador neste aparelho?')) { ls('r', K); location.reload(); } return; }
    var h0 = ls('g', KP);
    if (!h0) modal('Cadastro de administrador. Vale só neste aparelho e enxerga só os dados dele.', true, async function (h) { ls('s', KP, h); ls('s', K, '1'); return true; });
    else modal('Digite o PIN deste aparelho.', false, async function (h) { if (h === h0) { ls('s', K, '1'); return true; } return false; });
  }
  addEventListener('hashchange', function () { if (location.hash === '#admin') abrirAdmin(); });
  addEventListener('DOMContentLoaded', function () { if (location.hash === '#admin') setTimeout(abrirAdmin, 300); });
  function rodape() {
    if (document.getElementById('ia-admlink')) return;
    var a = document.createElement('div'); a.id = 'ia-admlink';
    a.style.cssText = 'text-align:center;padding:18px 12px 90px;font:13px system-ui,sans-serif';
    a.innerHTML = '<a href="#admin" style="color:inherit;opacity:.6">' + (isAdm() ? 'Administrador (ativo): sair' : 'Sou administrador') + '</a>';
    document.body.appendChild(a);
  }
  addEventListener('load', function () { setTimeout(rodape, 800); });
  var taps = [];
  addEventListener('pointerdown', function (e) {
    if (e.clientX > 64 || e.clientY < innerHeight - 64) return;
    var n = Date.now(); taps = taps.filter(function (t) { return n - t < 4000; }); taps.push(n);
    if (taps.length >= 7) { taps = []; abrirAdmin(); }
  }, true);

  window.claude = { use: async function (n) { return n === 'sample' ? sample : n === 'user' ? user : null; } };
})();
