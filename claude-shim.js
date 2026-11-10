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
  window.claude = { use: async function (n) { return n === 'sample' ? sample : null; } };
})();
