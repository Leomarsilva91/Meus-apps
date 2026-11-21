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
    if (!logado()) { if (!gastaVisita()) { entrar('Você usou as 3 consultas da IA de hoje como visitante. Entre para usar mais.'); throw erro('guest_limit', 'Limite de visitante atingido. Entre para continuar.'); } }
    var texto = typeof input === 'string' ? input : (input || []).map(function (m) { return (m.role === 'user' ? 'Usuário: ' : 'Assistente: ') + m.content; }).join('\n');
    if (json) texto += '\n\nResponda somente com JSON válido, sem markdown e sem texto fora do JSON.';
    var imagens = [];
    try { imagens = await Promise.all((opts.images || []).slice(0, 3).map(paraB64)); } catch (_) { throw erro('images_unavailable'); }
    var res;
    try {
      res = await fetch(URL_IA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: texto, imagens: imagens, max: json ? 1500 : 500 }) });
    } catch (_) { throw erro('network_error', 'Sem conexão com o servidor de IA.'); }
    if (res.status === 429) throw erro('rate_limited', 'Limite de usos da IA atingido por hoje.');
    if (!res.ok) { var j = {}; try { j = await res.json(); } catch (_) {} throw erro('ia_' + (j.erro || res.status) + (j.status ? '_' + j.status : ''), 'A IA não respondeu agora.'); }
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
  /* ---- conta deste aparelho (versão de teste; o login de verdade vem no lançamento) ---- */
  function logado() { if (window.IA_LOGIN_PROPRIO) return true; var c = ls('g', 'ia_conta'); if (c === '1') return true; if (c === '0') return false; return !!ls('g', KI); }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function gastaVisita() { var v = (ls('g', 'ia_gq') || '').split('|'), n = v[0] === hoje() ? +v[1] || 0 : 0; if (n >= 3) return false; ls('s', 'ia_gq', hoje() + '|' + (n + 1)); return true; }
  function entrar(msg) {
    if (document.getElementById('ia-entrar')) return;
    var d = document.createElement('div'); d.id = 'ia-entrar';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px;font:16px system-ui,sans-serif';
    d.innerHTML = '<form style="background:#fff;color:#111;border-radius:16px;padding:18px;max-width:360px;width:100%;display:grid;gap:10px;max-height:90vh;overflow:auto"><b style="font-size:18px">Entrar</b><span class="m" style="font-size:14px;color:#444"></span><label style="display:grid;gap:4px;font-weight:600;font-size:14px">Apelido (aparece para os outros)<input id="ia-ap" maxlength="20" autocomplete="nickname" style="font:inherit;border:1.5px solid #bbb;border-radius:10px;padding:10px"></label><label style="display:grid;gap:4px;font-weight:600;font-size:14px">E-mail (para a equipe responder você)<input id="ia-em" type="email" maxlength="80" autocomplete="email" style="font:inherit;border:1.5px solid #bbb;border-radius:10px;padding:10px"></label><span style="font-size:13px;color:#555">Nesta versão de teste, a conta fica só neste aparelho. O login definitivo chega no lançamento.</span><span class="e" style="color:#b3261e;font-size:13px;min-height:1px"></span><button style="min-height:46px;border:0;border-radius:12px;background:#222;color:#fff;font:inherit;font-weight:700">Entrar</button><button type="button" style="min-height:46px;border:1.5px solid #bbb;border-radius:12px;background:#fff;color:#111;font:inherit;font-weight:700">Fechar</button></form>';
    d.querySelector('.m').textContent = msg || 'Entre para salvar seus dados e participar.';
    document.body.appendChild(d);
    var f = d.querySelector('form'), ap = f.querySelector('#ia-ap'), em = f.querySelector('#ia-em'), e = f.querySelector('.e');
    ap.value = ls('g', 'ia_nome') || ''; em.value = ls('g', 'ia_email') || ''; ap.focus();
    f.querySelectorAll('button')[1].onclick = function () { d.remove(); };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var a = ap.value.trim(), m = em.value.trim();
      if (a.length < 2 || /https?:|www\.|\d{8}/i.test(a)) { e.textContent = 'Escolha um apelido de 2 a 20 letras, sem telefone nem link.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) { e.textContent = 'Digite um e-mail válido.'; return; }
      ls('s', 'ia_nome', a); ls('s', 'ia_email', m); ls('s', 'ia_conta', '1'); uid(); location.reload();
    };
  }
  function sair() { ls('s', 'ia_conta', '0'); location.reload(); }
  function chip() {
    if (window.IA_LOGIN_PROPRIO || window.IA_SEM_CHIP || document.getElementById('ia-chip')) return;
    var b = document.createElement('button'); b.id = 'ia-chip'; b.type = 'button';
    b.style.cssText = 'position:fixed;z-index:39;right:max(10px,env(safe-area-inset-right,0px));top:calc(env(safe-area-inset-top,0px) + 60px);min-height:36px;padding:0 12px;border-radius:999px;border:1.5px solid rgba(127,127,127,.55);background:rgba(255,255,255,.94);color:#111;font:700 13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer';
    var lg = logado(); b.textContent = lg ? '👤 ' + (ls('g', 'ia_nome') || 'Conta') + ' · Sair' : '👤 Entrar';
    b.setAttribute('aria-label', lg ? 'Sair da conta e voltar a visitante' : 'Entrar na conta');
    b.onclick = function () { logado() ? sair() : entrar(); };
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chip); else chip();
  /* ---- código deste aparelho no Firebase, para cadastrar na coleção "admins" (só aparece no modo administrador) ---- */
  function chipUid() {
    var ft = document.getElementById('ia-admlink'); if (!isAdm() || !ft || document.getElementById('ia-uidchip')) return;
    fbUid().then(function (u) {
      if (!u || document.getElementById('ia-uidchip')) return;
      var b = document.createElement('button'); b.id = 'ia-uidchip'; b.type = 'button';
      b.style.cssText = 'display:inline-block;margin-top:14px;min-height:38px;padding:0 12px;border-radius:999px;border:1.5px solid rgba(127,127,127,.55);background:rgba(255,248,230,.96);color:#111;font:700 12.5px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer';
      b.textContent = '🔑 Código do admin';
      b.onclick = function () {
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px;font:16px system-ui,sans-serif';
        d.innerHTML = '<div style="background:#fff;color:#111;border-radius:16px;padding:18px;max-width:380px;width:100%;display:grid;gap:10px"><b style="font-size:18px">Código deste aparelho</b><span style="font-size:14px;color:#444">Cadastre este código no Firebase, na coleção <b>admins</b>, para este aparelho poder salvar como administrador em todos os apps.</span><input readonly style="font:600 15px ui-monospace,monospace;padding:10px;border:1.5px solid #bbb;border-radius:10px;width:100%"><div style="display:flex;gap:8px"><button type="button" style="flex:1;min-height:46px;border:0;border-radius:12px;background:#222;color:#fff;font:inherit;font-weight:700">Copiar código</button><button type="button" style="flex:1;min-height:46px;border:1.5px solid #bbb;border-radius:12px;background:#fff;color:#111;font:inherit;font-weight:700">Fechar</button></div></div>';
        var i = d.querySelector('input'), bs = d.querySelectorAll('button'); i.value = u;
        bs[0].onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { bs[0].textContent = 'Copiado ✓'; }).catch(function () { i.select(); bs[0].textContent = 'Selecione e copie'; }); };
        bs[1].onclick = function () { d.remove(); };
        var st = document.createElement('div'); st.style.cssText = 'font-size:14.5px;font-weight:700;padding:8px 10px;border-radius:10px;background:#f1f1f1'; st.textContent = 'Conferindo no Firebase…';
        i.parentNode.insertBefore(st, i.nextSibling);
        var kb = document.createElement('div'); kb.style.cssText = 'display:grid;gap:6px;border-top:1px solid #ddd;padding-top:10px';
        kb.innerHTML = '<span style="font-size:14px;color:#444">Trocou o código? Digite a <b>chave do administrador</b> e este aparelho se cadastra sozinho, sem precisar ir ao Firebase.</span><input type="password" autocomplete="off" placeholder="Chave do administrador" style="font:inherit;padding:10px;border:1.5px solid #bbb;border-radius:10px;width:100%"><button type="button" style="min-height:44px;border:0;border-radius:12px;background:#0f766e;color:#fff;font:inherit;font-weight:700">Cadastrar este aparelho</button>';
        st.parentNode.insertBefore(kb, st.nextSibling);
        kb.querySelector('button').onclick = function () { var kv = kb.querySelector('input').value.trim(); if (!kv) { kb.querySelector('input').focus(); return; } var bt = kb.querySelector('button'); bt.textContent = 'Cadastrando…';
          firebase.firestore().collection('admins').doc(u).set({ k: kv, at: new Date().toISOString() }).then(function () { bt.textContent = 'Cadastrado ✓'; st.style.background = '#e3f4e6'; st.textContent = '✔ Este aparelho agora é administrador em todos os apps.'; }).catch(function (er) { bt.textContent = 'Cadastrar este aparelho'; st.style.background = '#fde8e6'; st.textContent = /permission/.test(String(er && er.code || '')) ? '✖ Chave errada, ou a chave ainda não foi criada no Firebase (coleção admkey, documento main, campo k).' : '⚠ Sem internet agora. Tente de novo.'; }); };
        try {
          firebase.firestore().collection('apps/' + appNome() + '/fb').limit(1).get().then(function () {
            st.style.background = '#e3f4e6'; st.textContent = '✔ Este aparelho já está cadastrado como administrador.';
          }).catch(function (er) {
            var c = String(er && er.code || '');
            st.style.background = '#fde8e6';
            st.textContent = /permission/.test(c) ? '✖ Ainda não reconhecido. No Firebase, a coleção tem que ser "admins" (tudo minúsculo) e o ID do documento tem que ser este código colado com "Copiar código", sem digitar.' : '⚠ Não consegui conferir agora (' + c + '). Veja a internet e tente de novo.';
          });
        } catch (_) { st.textContent = '⚠ Não consegui conferir agora.'; }
        document.body.appendChild(d);
      };
      var w = document.createElement('div'); w.appendChild(b); ft.appendChild(w);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chipUid); else chipUid();
  setInterval(chipUid, 3000);
  function stl() {
    if (document.getElementById('ia-authcss')) return;
    var st = document.createElement('style'); st.id = 'ia-authcss';
    st.textContent = '[data-iaauth]{color:#C2410C!important;background:rgba(234,88,12,.12)!important;border-color:rgba(234,88,12,.55)!important}[data-iaauth] svg{color:#EA580C!important;fill:none!important;stroke:currentColor!important}[data-iaauth] span{color:#C2410C!important;font-weight:800}';
    document.head.appendChild(st);
  }
  stl();
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-iaauth]'); if (!b) return; e.preventDefault(); e.stopPropagation(); logado() ? sair() : entrar(); }, true);
  window.IA_AUTH = { logado: logado, entrar: entrar, sair: sair, nome: function () { return ls('g', 'ia_nome') || ''; }, email: function () { return ls('g', 'ia_email') || ''; } };
  var user = {
    isOwner: async function () { return isAdm(); },
    canEdit: async function () { return isAdm(); },
    can: async function () { return isAdm() ? true : null; },
    id: async function () { if (!logado()) return null; var f = await fbUid(); return f || uid(); },
    me: async function () { if (!logado()) return { id: null }; var f = await fbUid(); return { id: f || uid() }; },
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
    a.innerHTML = (logado() ? '<a href="#sair" id="ia-sair" style="color:inherit;opacity:.6">Sair da conta (voltar a visitante)</a>' : '<a href="#entrar" id="ia-ent" style="color:inherit;font-weight:700">Você está como visitante. Entrar</a>') + '<br><br><a href="#admin" style="color:inherit;opacity:.6">' + (isAdm() ? 'Administrador (ativo): sair' : 'Sou administrador') + '</a>';
    var q = a.querySelector('a'); q.onclick = function (ev) { ev.preventDefault(); logado() ? sair() : entrar(); };
    document.body.appendChild(a);
  }
  addEventListener('load', function () { setTimeout(rodape, 800); });
  var taps = [];
  addEventListener('pointerdown', function (e) {
    if (e.clientX > 64 || e.clientY < innerHeight - 64) return;
    var n = Date.now(); taps = taps.filter(function (t) { return n - t < 4000; }); taps.push(n);
    if (taps.length >= 7) { taps = []; abrirAdmin(); }
  }, true);

  /* ---- banco de dados na nuvem (Firebase), para compartilhar metas, comunidade, bate-papo e pontos entre aparelhos ---- */
  var FBV = '10.12.5', FBP = null, FBU = null;
  function appNome() { var s = location.pathname.split('/').filter(Boolean); if (s.length && s[s.length - 1].indexOf('.') >= 0) s.pop(); return (s.pop() || 'app').toLowerCase().replace(/[^a-z0-9-]/g, ''); }
  function js(src) { return new Promise(function (ok, no) { var e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = no; document.head.appendChild(e); }); }
  function fbIni() {
    if (FBP) return FBP;
    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || !cfg.projectId) { window.IA_SEM_NUVEM = true; FBP = Promise.resolve(null); return FBP; }
    var b = 'https://www.gstatic.com/firebasejs/' + FBV + '/';
    FBP = js(b + 'firebase-app-compat.js').then(function () { return Promise.all([js(b + 'firebase-auth-compat.js'), js(b + 'firebase-firestore-compat.js')]); }).then(function () {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      var au = firebase.auth();
      return (au.setPersistence ? au.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {}) : Promise.resolve()).then(function () { return new Promise(function (ok) { var first = true, off = au.onAuthStateChanged(function (u) { if (u) { off(); ok(u); return; } if (first) { first = false; au.signInAnonymously().catch(function () { off(); ok(null); }); } }); }); });
    }).then(function (u) {
      if (!u) { window.IA_SEM_NUVEM = true; return null; }
      FBU = u.uid; window.IA_NUVEM_UID = u.uid;
      var fs = firebase.firestore(), pre = 'apps/' + appNome() + '/';
      return { collection: function (p) { return fs.collection(pre + p); }, doc: function (p) { return fs.doc(pre + p); } };
    }).catch(function () { window.IA_SEM_NUVEM = true; return null; });
    return FBP;
  }
  async function fbUid() { await fbIni(); return FBU; }
  async function fbDb() { if (!logado()) return null; return fbIni(); }
  if (window.FIREBASE_CONFIG) fbIni(); else window.IA_SEM_NUVEM = true;

  /* ---- vídeos (Cloudflare R2 pelo worker). Só aparece se o R2 estiver ligado. ---- */
  var VB = String(URL_IA).replace(/\/$/, ''), vidOk = null;
  function assetsOn() {
    if (vidOk) return vidOk;
    vidOk = fetch(VB + '/vid/ok').then(function (r) { return r.ok ? r.json() : {}; }).then(function (j) { return !!(j && j.ok); }).catch(function () { vidOk = null; return false; });
    return vidOk;
  }
  var assets = {
    upload: async function (f) {
      var tp = String(f.type || 'video/mp4').toLowerCase(); if (tp === 'video/x-m4v') tp = 'video/mp4';
      var r = await fetch(VB + '/vid/up?app=' + encodeURIComponent(appNome()), { method: 'PUT', headers: { 'Content-Type': tp }, body: f });
      var j = null; try { j = await r.json(); } catch (_) {}
      if (!r.ok || !j || !j.id) { var e = new Error((j && j.erro) || ('http ' + r.status)); e.code = j && j.erro; throw e; }
      return { id: j.id, url: j.url };
    },
    delete: async function (id) {
      var p = String(id || '').split('~'); if (p.length !== 2) { var e0 = new Error('not_found'); e0.code = 'not_found'; throw e0; }
      var r = await fetch(VB + '/vid/' + p[0] + '?tk=' + encodeURIComponent(p[1]), { method: 'DELETE' });
      if (r.status === 404) { var e1 = new Error('not_found'); e1.code = 'not_found'; throw e1; }
      if (!r.ok) throw new Error('http ' + r.status);
      return true;
    }
  };
  /* ---- downloads: salva o arquivo no aparelho (Downloads) ---- */
  var MIME = { pdf: 'application/pdf', csv: 'text/csv;charset=utf-8', json: 'application/json', vcf: 'text/vcard', txt: 'text/plain;charset=utf-8', png: 'image/png', jpg: 'image/jpeg' };
  var downloads = {
    save: async function (o) {
      o = o || {}; var fn = String(o.filename || 'arquivo').replace(/[\\/:*?"<>|]+/g, '-'), ext = (fn.split('.').pop() || '').toLowerCase(), d = o.data;
      var blob = d instanceof Blob ? d : new Blob([d instanceof Uint8Array || d instanceof ArrayBuffer ? d : String(d == null ? '' : d)], { type: MIME[ext] || 'application/octet-stream' });
      var u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = fn; a.rel = 'noopener'; a.style.display = 'none'; document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 60000);
      return true;
    }
  };
  window.claude = { use: async function (n) { if (n === 'downloads') return downloads; if (n === 'assets') return (await assetsOn()) ? assets : null; return n === 'sample' ? sample : n === 'user' ? user : n === 'db' ? fbDb() : n === 'dbany' ? fbIni() : null; } };
})();

/* Notificações com o ícone do próprio app */
(function(){try{var ic=new URL('icon-192.png',location.href).href;function fx(o){o=o||{};if(!o.icon)o.icon=ic;if(!o.image&&o.icon==='icon-192.png')o.icon=ic;return o}
  var N=window.Notification;if(N&&!N.__ic){var W=function(t,o){return new N(t,fx(o))};W.prototype=N.prototype;Object.defineProperty(W,'permission',{get:function(){return N.permission}});W.requestPermission=function(){return N.requestPermission.apply(N,arguments)};W.__ic=1;window.Notification=W}
  if(window.ServiceWorkerRegistration&&!ServiceWorkerRegistration.prototype.__ic){var sn=ServiceWorkerRegistration.prototype.showNotification;ServiceWorkerRegistration.prototype.showNotification=function(t,o){return sn.call(this,t,fx(o))};ServiceWorkerRegistration.prototype.__ic=1}}catch(e){}})();

/* Campos de texto: não perder o que está sendo digitado quando a tela se atualiza sozinha */
(function(){var lastAct=0;
  document.addEventListener('click',function(){lastAct=Date.now()},true);
  document.addEventListener('submit',function(){lastAct=Date.now()},true);
  document.addEventListener('keydown',function(e){if(e.key==='Enter'&&!(e.target&&e.target.tagName==='TEXTAREA'))lastAct=Date.now()},true);
  function sel(a){if(a.id)return '#'+CSS.escape(a.id);var at=[].slice.call(a.attributes).filter(function(x){return /^data-|^name$/.test(x.name)});if(!at.length)return null;return a.tagName.toLowerCase()+at.map(function(x){return '['+x.name+'="'+CSS.escape(x.value)+'"]'}).join('')}
  function txt(a){return a&&(a.tagName==='TEXTAREA'||(a.tagName==='INPUT'&&/^(text|search|email|tel|url|number|password|)$/.test(a.type||'')))}
  function wrap(){var r=window.render;if(typeof r!=='function'||r.__keep)return;var w=function(){var a=document.activeElement,s=null,v,ss,se,y=window.scrollY;
      if(txt(a)&&Date.now()-lastAct>400){s=sel(a);v=a.value;try{ss=a.selectionStart;se=a.selectionEnd}catch(e){}}
      var out=r.apply(this,arguments);
      if(s){try{var n=document.querySelector(s);if(n&&n!==a&&txt(n)){var ch=n.value!==v;if(ch)n.value=v;n.focus({preventScroll:true});try{n.setSelectionRange(ss,se)}catch(e){}window.scrollTo(0,y);if(ch)n.dispatchEvent(new Event('input',{bubbles:true}))}}catch(e){}}
      return out};w.__keep=1;window.render=w}
  if(document.readyState==='complete')setTimeout(wrap,0);else window.addEventListener('load',function(){setTimeout(wrap,0)});
  setTimeout(wrap,4000);
})();

/* iPhone: campos com letra de 16px para o Safari não dar zoom e "estourar" a tela ao digitar */
(function(){try{if(!/iP(hone|ad|od)/.test(navigator.userAgent)&&!(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))return;var st=document.createElement('style');st.textContent='input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea{font-size:16px!important}html,body{max-width:100%;overflow-x:hidden}';(document.head||document.documentElement).appendChild(st)}catch(e){}})();

/* Atualização automática: quando sai versão nova, o app recarrega sozinho (sem precisar fechar e abrir várias vezes) */
(function(){try{if(!('serviceWorker' in navigator))return;var sw=navigator.serviceWorker,had=!!sw.controller,done=false;
  sw.getRegistration().then(function(reg){if(!reg)return;var up=function(){try{reg.update()}catch(e){}};up();document.addEventListener('visibilitychange',function(){if(!document.hidden)up()});setInterval(up,10*60*1000)}).catch(function(){});
  sw.addEventListener('controllerchange',function(){if(!had){had=true;return}if(done)return;done=true;var go=function(){var a=document.activeElement;if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.value){setTimeout(go,4000);return}location.reload()};go()});
}catch(e){}})();

/* Enquanto a pessoa digita, as atualizações que chegam em segundo plano esperam (o teclado do celular não perde o campo) */
(function(){var last=0,evt=false,pend=false,tm=null;
  var clk=false,ct=null;['click','change','submit'].forEach(function(t){document.addEventListener(t,function(){clk=true;clearTimeout(ct);ct=setTimeout(function(){clk=false},0)},true)});
  document.addEventListener('keydown',function(e){if(e.key==='Enter'){clk=true;clearTimeout(ct);ct=setTimeout(function(){clk=false},0)}},true);
  ['input','keyup','compositionend'].forEach(function(t){document.addEventListener(t,function(){evt=true;clearTimeout(tm);tm=setTimeout(function(){evt=false},0)},true)});
  function typing(){var a=document.activeElement;return !!(a&&(a.tagName==='TEXTAREA'||(a.tagName==='INPUT'&&!/^(checkbox|radio|button|submit|range|file|color)$/.test(a.type||''))))}
  function flush(){if(pend&&!typing()){pend=false;try{window.render()}catch(e){}}}
  function wrap(){var r=window.render;if(typeof r!=='function'||r.__tg)return;var w=function(){if(typing()&&!evt&&!clk){pend=true;return}return r.apply(this,arguments)};w.__tg=1;w.__keep=r.__keep;window.render=w}
  document.addEventListener('focusout',function(){setTimeout(flush,250)},true);setInterval(flush,1500);
  if(document.readyState==='complete')setTimeout(wrap,0);else window.addEventListener('load',function(){setTimeout(wrap,0)});setTimeout(wrap,4500);
})();

/* Rascunho dos campos: se a tela for redesenhada, o que foi digitado volta para o campo (até salvar) */
(function(){var D={};function ok(t){return t&&t.id&&(t.tagName==='TEXTAREA'||(t.tagName==='INPUT'&&!/^(checkbox|radio|button|submit|range|file|color|password|hidden)$/.test(t.type||'')))}
  document.addEventListener('input',function(e){var t=e.target;if(ok(t))D[t.id]=t.value},true);
  function clr(root){if(!root)return;[].forEach.call(root.querySelectorAll('input[id],textarea[id]'),function(x){delete D[x.id]})}
  document.addEventListener('submit',function(e){clr(e.target)},true);
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button');if(!b)return;var f=b.closest('form')||b.closest('.box')||b.closest('.card');if(f&&f.querySelector('input[id],textarea[id]'))setTimeout(function(){clr(f)},0)},true);
  function wrap(){var r=window.render;if(typeof r!=='function'||r.__dr)return;var w=function(){var x=r.apply(this,arguments);try{for(var k in D){var el=document.getElementById(k);if(el&&el!==document.activeElement&&el.value===''&&D[k])el.value=D[k]}}catch(e){}return x};w.__dr=1;w.__tg=r.__tg;w.__keep=r.__keep;window.render=w}
  if(document.readyState==='complete')setTimeout(wrap,10);else window.addEventListener('load',function(){setTimeout(wrap,10)});setTimeout(wrap,5000);
})();
