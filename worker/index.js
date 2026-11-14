// Servidor pequeno (Cloudflare Worker) que guarda a chave da IA em segredo.
// Recebe pedidos dos apps, limita uso e repassa para a API da Anthropic.
const ORIGENS = ['https://leomarsilva91.github.io'];          // só estes sites podem chamar
const MODELO = 'claude-haiku-5-5';                            // modelo barato
const MAX_SAIDA = 1500;                                       // teto de tokens de resposta
const MAX_TEXTO = 60000;                                      // teto de letras enviadas
const MAX_IMAGENS = 3;
const LIMITE_POR_PESSOA_DIA = 60;                             // pedidos por IP por dia
const LIMITE_GERAL_DIA = 3000;                                // pedidos de todos por dia

const cors = (o) => ({
  'Access-Control-Allow-Origin': ORIGENS.includes(o) ? o : ORIGENS[0],
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
});
const resp = (obj, status, o) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(o) } });

async function contar(env, chave, limite) {
  if (!env.LIMITES) return true;                              // sem KV: sem contagem (opcional)
  const k = chave + ':' + new Date().toISOString().slice(0, 10);
  const n = parseInt((await env.LIMITES.get(k)) || '0', 10);
  if (n >= limite) return false;
  await env.LIMITES.put(k, String(n + 1), { expirationTtl: 172800 });
  return true;
}

// Taxas de juros oficiais do Banco Central (dados públicos, sem chave).
// 432 = Meta Selic (% ao ano); 20749 = média de juros, pessoa física, compra de veículos (% ao ano);
// 25471 = a mesma média em % ao mês. Guardadas em cache por 12 horas.
const SGS = (n, q) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${n}/dados/ultimos/${q}?formato=json`;
async function serie(n) {
  const r = await fetch(SGS(n, 1), { headers: { Accept: 'application/json' }, cf: { cacheTtl: 43200 } });
  if (!r.ok) throw new Error('bcb ' + n);
  const a = await r.json(), x = a && a[a.length - 1];
  const v = x && parseFloat(String(x.valor).replace(',', '.'));
  if (!(v > 0)) throw new Error('vazio ' + n);
  return { v, data: x.data };                                 // data no formato dd/mm/aaaa
}
async function taxas(req, o, ctx) {
  const cache = caches.default, chave = new Request('https://cache.local/taxas-v1');
  const hit = await cache.match(chave);
  if (hit) { const j = await hit.json(); return resp(j, 200, o); }
  const [selic, aa, am] = await Promise.allSettled([serie(432), serie(20749), serie(25471)]);
  const out = { fonte: 'Banco Central do Brasil (SGS)', at: new Date().toISOString() };
  if (selic.status === 'fulfilled') out.selic = selic.value;
  if (aa.status === 'fulfilled') out.veicAno = aa.value;
  if (am.status === 'fulfilled') out.veicMes = am.value;
  else if (aa.status === 'fulfilled') out.veicMes = { v: Math.round((Math.pow(1 + aa.value.v / 100, 1 / 12) - 1) * 10000) / 100, data: aa.value.data, calc: true };
  if (!out.selic && !out.veicAno) return resp({ erro: 'bcb' }, 502, o);
  const res = new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=43200' } });
  ctx && ctx.waitUntil ? ctx.waitUntil(cache.put(chave, res.clone())) : await cache.put(chave, res.clone());
  return resp(out, 200, o);
}

// Lê a página de um produto pelo servidor (as lojas não deixam o navegador do cliente ler direto).
// Devolve título, preço, imagem e descrição que a própria página informa, e o texto limpo para a IA.
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const ent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
function meta(h, nomes) {
  for (const n of nomes) {
    const a = new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']' + n + '["\'][^>]*content=["\']([^"\']*)["\']', 'i').exec(h)
      || new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name|itemprop)=["\']' + n + '["\']', 'i').exec(h);
    if (a && a[1].trim()) return ent(a[1].trim());
  }
  return '';
}
function jsonLd(h) {
  const out = {};
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(h))) {
    let j; try { j = JSON.parse(m[1].trim()); } catch (_) { continue; }
    const pilha = [j];
    while (pilha.length) {
      const x = pilha.pop();
      if (!x || typeof x !== 'object') continue;
      if (Array.isArray(x)) { pilha.push(...x); continue; }
      if (x['@graph']) pilha.push(x['@graph']);
      const t = [].concat(x['@type'] || []).join(' ');
      if (/Product/i.test(t)) {
        out.n = out.n || x.name; out.desc = out.desc || x.description;
        const im = [].concat(x.image || [])[0]; out.img = out.img || (typeof im === 'string' ? im : im && im.url);
        const of = [].concat(x.offers || [])[0];
        if (of) { out.p = out.p || of.price || of.lowPrice; out.old = out.old || of.highPrice; }
      }
    }
  }
  return out;
}
function textoLimpo(h) {
  return ent(h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\r]+/g, ' ').replace(/\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function pagina(req, o, env) {
  if (!ORIGENS.includes(o)) return resp({ erro: 'origem' }, 403, o);
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  if (!(await contar(env, 'pg:' + ip, 120))) return resp({ erro: 'limite' }, 429, o);
  let u;
  try { u = new URL(new URL(req.url).searchParams.get('u') || ''); } catch (_) { return resp({ erro: 'link' }, 400, o); }
  if (u.protocol !== 'https:' || /^(localhost|\d+\.\d+\.\d+\.\d+|\[)/i.test(u.hostname) || !u.hostname.includes('.')) return resp({ erro: 'link' }, 400, o);
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 15000);
  let r;
  try {
    r = await fetch(u.toString(), { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9' } });
  } catch (_) { clearTimeout(tm); return resp({ erro: 'rede' }, 502, o); }
  clearTimeout(tm);
  const h = (await r.text()).slice(0, 2_000_000);
  const L = jsonLd(h);
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(h);
  const num = (v) => { const s = String(v || '').replace(/[^\d.,]/g, ''); if (!s) return null; const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, '')); return n > 0 ? n : null; };
  const out = {
    ok: r.ok, status: r.status, url: r.url,
    n: String(L.n || meta(h, ['og:title', 'twitter:title']) || (t ? ent(t[1]) : '')).trim().slice(0, 200),
    p: num(L.p || meta(h, ['product:price:amount', 'og:price:amount', 'price'])),
    old: num(L.old),
    img: String(L.img || meta(h, ['og:image', 'og:image:secure_url', 'twitter:image']) || ''),
    desc: String(L.desc || meta(h, ['og:description', 'description', 'twitter:description']) || '').trim().slice(0, 3000),
    texto: textoLimpo(h).slice(0, 14000),
  };
  if (!/^https:\/\//.test(out.img)) out.img = '';
  return resp(out, 200, o);
}

export default {
  async fetch(req, env, ctx) {
    const o = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(o) });
    if (req.method === 'GET' && new URL(req.url).pathname === '/taxas') {
      try { return await taxas(req, o, ctx); } catch (_) { return resp({ erro: 'bcb' }, 502, o); }
    }
    if (req.method === 'GET' && new URL(req.url).pathname === '/pagina') {
      try { return await pagina(req, o, env); } catch (_) { return resp({ erro: 'pagina' }, 502, o); }
    }
    if (req.method !== 'POST') return resp({ erro: 'metodo' }, 405, o);
    if (!ORIGENS.includes(o)) return resp({ erro: 'origem' }, 403, o);
    if (!env.ANTHROPIC_API_KEY) return resp({ erro: 'sem_chave' }, 500, o);

    let b;
    try { b = await req.json(); } catch (_) { return resp({ erro: 'json' }, 400, o); }
    const texto = typeof b.texto === 'string' ? b.texto : '';
    const imgs = Array.isArray(b.imagens) ? b.imagens.slice(0, MAX_IMAGENS) : [];
    if (!texto || texto.length > MAX_TEXTO) return resp({ erro: 'texto' }, 400, o);
    for (const i of imgs)
      if (!i || !/^image\/(jpeg|png|webp|gif)$/.test(i.tipo) || typeof i.dados !== 'string' || i.dados.length > 2_500_000)
        return resp({ erro: 'imagem' }, 400, o);

    const ip = req.headers.get('CF-Connecting-IP') || 'x';
    if (!(await contar(env, 'geral', LIMITE_GERAL_DIA))) return resp({ erro: 'limite_geral' }, 429, o);
    if (!(await contar(env, 'ip:' + ip, LIMITE_POR_PESSOA_DIA))) return resp({ erro: 'limite' }, 429, o);

    const content = [
      ...imgs.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.tipo, data: i.dados } })),
      { type: 'text', text: texto },
    ];
    const max = Math.min(Math.max(parseInt(b.max, 10) || 800, 100), MAX_SAIDA);
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODELO, max_tokens: max, messages: [{ role: 'user', content }] }),
      });
    } catch (_) { return resp({ erro: 'rede' }, 502, o); }
    if (!r.ok) return resp({ erro: 'ia', status: r.status }, 502, o);
    const j = await r.json();
    const t = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    return resp({ texto: t }, 200, o);
  },
};
