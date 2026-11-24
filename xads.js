/* Anúncios compartilhados entre os apps (Tasko, Prumo, Achei Barato, Respiro).
   O anunciante escolhe em quais outros apps quer aparecer. Quando o administrador
   abre o app onde o anúncio foi aprovado, uma cópia simples vai para apps/geral/ads,
   e os outros apps mostram essa cópia nos anúncios flutuantes. */
(function () {
  var APPS = {
    'tasko': ['Tasko', 'serviços e reformas'],
    'prumo': ['Prumo', 'finanças, MEI e metas'],
    'achei-barato': ['Achei Barato', 'promoções e compras'],
    'respiro': ['Respiro', 'natureza e passeios']
  };
  var L = [], on = 0, got = 0, busy = 0;
  function hj() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function E(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dt(x) { return /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? String(x) : ''; }
  function wa(x) { var n = String(x || '').replace(/\D/g, ''); if (n.length < 10) return ''; return (n.length <= 11 ? '55' + n : n).slice(0, 15); }
  function ln(x) { x = String(x || '').trim(); return /^https:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(x) ? x.slice(0, 200) : ''; }
  function col() { return firebase.firestore().collection('apps/geral/ads'); }
  function start() {
    if (on || !window.firebase || !firebase.firestore || !window.IA_NUVEM_UID) return;
    on = 1;
    try {
      col().onSnapshot(function (sn) { L = sn.docs.map(function (d) { var x = d.data() || {}; x.id = d.id; return x; }); got = 1; },
        function () { setTimeout(function () { on = 0; }, 60000); });
    } catch (_) { setTimeout(function () { on = 0; }, 60000); }
  }
  setInterval(start, 1500);

  function norm(app, a) {
    var xa = (Array.isArray(a.xa) ? a.xa : Object.keys(APPS)).filter(function (k) { return APPS[k] && k !== app; });
    return { k: app, sid: String(a.sid || '').slice(0, 60), tt: String(a.tt || '').slice(0, 60), loja: String(a.loja || '').slice(0, 60),
      cid: String(a.cid || '').slice(0, 40), tx: String(a.tx || '').slice(0, 200), pr: String(a.pr || '').slice(0, 40),
      wa: wa(a.wa), ln: ln(a.ln), from: dt(a.from), to: dt(a.to), xa: xa };
  }
  function sig(x) { return JSON.stringify([x.k, x.sid, x.tt, x.loja, x.cid, x.tx, x.pr, x.wa, x.ln, x.from, x.to, (x.xa || []).slice().sort()]); }

  var X = {
    APPS: APPS,
    /* anúncios de outros apps que escolheram aparecer neste */
    list: function (app) {
      var t = hj();
      return L.filter(function (a) { return a.k !== app && Array.isArray(a.xa) && a.xa.indexOf(app) >= 0 && a.tt && (!a.from || a.from <= t) && a.to && a.to >= t && (a.wa || a.ln); })
        .map(function (a) { var y = {}; for (var k in a) y[k] = a[k]; y._x = 1; return y; });
    },
    url: function (a) { return a.wa ? 'https://wa.me/' + a.wa + '?text=' + encodeURIComponent('Olá! Vi seu anúncio: ' + (a.tt || '')) : (ln(a.ln) || '#'); },
    card: function (a) {
      var u = X.url(a), cta = a.wa ? 'Chamar no WhatsApp' : 'Abrir o link';
      return '<div style="display:grid;gap:6px;padding:14px;border-radius:14px;background:var(--card,var(--surface,#fff));border:1.5px solid var(--line,#ddd);color:inherit">' +
        '<div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;align-items:center"><span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:#fff3d6;color:#7a4a00">Patrocinado</span></div>' +
        '<b style="font-size:17px;line-height:1.25">' + E(a.tt) + '</b>' +
        '<span style="font-size:13.5px;opacity:.75">' + E(a.loja) + (a.cid ? ' · ' + E(a.cid) : '') + '</span>' +
        (a.pr ? '<b style="font-size:16px">' + E(a.pr) + '</b>' : '') +
        (a.tx ? '<span style="font-size:14.5px">' + E(a.tx) + '</span>' : '') +
        '<a href="' + E(u) + '" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:12px;background:var(--acc,var(--pri,#0B6B4C));color:#fff;font-weight:700;text-decoration:none;margin-top:4px">' + cta + '</a></div>';
    },
    /* envolve a configuração dos anúncios flutuantes (FADS) para incluir os dos outros apps */
    wrap: function (app, C) {
      var D = {}; for (var k in C) D[k] = C[k];
      D.list = function () { var a = []; try { a = C.list() || []; } catch (_) {} return a.concat(X.list(app)); };
      D.id = function (a) { return a._x ? 'x' + a.id : C.id(a); };
      D.card = function (a) { return a._x ? X.card(a) : C.card(a); };
      D.href = function (a) { return a._x ? { url: E(X.url(a)), attr: 'target="_blank" rel="noopener noreferrer"' } : C.href(a); };
      D.t = function (a) { return a._x ? E(a.tt) : C.t(a); };
      D.s = function (a) { return a._x ? E(a.loja) : C.s(a); };
      return D;
    },
    /* campo do formulário do anúncio */
    pick: function (app, sel) {
      var all = !Array.isArray(sel);
      return '<fieldset data-xaf="1" style="border:1.5px solid var(--line,#ccc);border-radius:12px;padding:10px 12px;display:grid;gap:8px;margin:0;min-width:0">' +
        '<legend style="font-weight:700;font-size:14.5px;padding:0 4px">Aparecer também nos outros apps</legend>' +
        Object.keys(APPS).filter(function (k) { return k !== app; }).map(function (k) {
          var c = all || sel.indexOf(k) >= 0;
          return '<label style="display:flex;gap:10px;align-items:center;font-size:14.5px;font-weight:600"><input type="checkbox" data-xa="1" value="' + k + '"' + (c ? ' checked' : '') + ' style="width:22px;height:22px;flex:none;margin:0"><span>' + APPS[k][0] + ' <span style="font-weight:400;opacity:.75">· ' + APPS[k][1] + '</span></span></label>';
        }).join('') +
        '<span style="font-size:13px;opacity:.75">Desmarque os apps em que não quer aparecer. O anúncio entra nos outros depois de aprovado aqui.</span></fieldset>';
    },
    read: function () {
      var r = [];
      Array.prototype.forEach.call(document.querySelectorAll('input[data-xa]'), function (i) { if (i.checked && APPS[i.value] && r.indexOf(i.value) < 0) r.push(i.value); });
      return r;
    },
    /* só o administrador grava: publica os anúncios aprovados deste app que escolheram outros apps e apaga os que saíram do ar */
    sync: function (app, items) {
      if (!got || busy || !window.firebase) return;
      var t = hj(), want = {}, cur = {}, ops = [];
      (items || []).forEach(function (a) { var x = norm(app, a); if (x.sid && x.tt && x.to >= t && x.xa.length && (x.wa || x.ln)) want[app + '_' + x.sid.replace(/[^\w-]/g, '')] = x; });
      L.forEach(function (a) { if (a.k === app) cur[a.id] = a; });
      Object.keys(want).forEach(function (id) { if (!cur[id] || sig(cur[id]) !== sig(want[id])) ops.push(col().doc(id).set(want[id])); });
      Object.keys(cur).forEach(function (id) { if (!want[id]) ops.push(col().doc(id).delete()); });
      if (!ops.length) return;
      busy = 1;
      Promise.all(ops).catch(function () {}).then(function () { busy = 0; });
    }
  };
  window.XADS = X;
})();
