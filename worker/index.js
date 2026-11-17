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
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
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


// Lugares de natureza do OpenStreetMap (Overpass), pedidos pelo servidor e guardados por 1 dia.
const OVP = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function osm(req, o, ctx) {
  const q = new URL(req.url).searchParams.get('data') || '';
  if (!/^\[out:json\]/.test(q) || q.length > 3000 || !/around:\d+,/.test(q)) return resp({ erro: 'consulta' }, 400, o);
  const cache = caches.default, chave = new Request('https://cache.local/osm-v1?' + encodeURIComponent(q));
  const hit = await cache.match(chave);
  if (hit) return new Response(await hit.text(), { status: 200, headers: { 'Content-Type': 'application/json', ...cors(o) } });
  let ult = 'sem resposta';
  for (const s of OVP) {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 25000);
    try {
      const r = await fetch(s, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ac.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Respiro/1.0 (app de natureza)' } });
      clearTimeout(tm);
      if (!r.ok) { ult = 'HTTP ' + r.status; continue; }
      const t = await r.text();
      let j; try { j = JSON.parse(t); } catch (_) { ult = 'resposta'; continue; }
      if (!Array.isArray(j.elements)) { ult = 'resposta'; continue; }
      if (!j.elements.length && j.remark && /error|timed out/i.test(j.remark)) { ult = 'ocupado'; continue; }
      const res = new Response(t, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' } });
      ctx && ctx.waitUntil ? ctx.waitUntil(cache.put(chave, res.clone())) : await cache.put(chave, res.clone());
      return new Response(t, { status: 200, headers: { 'Content-Type': 'application/json', ...cors(o) } });
    } catch (_) { clearTimeout(tm); ult = 'demorou demais'; }
  }
  return resp({ erro: 'osm', motivo: ult }, 502, o);
}


// Reforço com o Google (Places API New). A chave fica só no servidor: variável GOOGLE_PLACES_KEY.
// Pago depois da cota grátis: limite o uso por dia no painel do Google Cloud (Cotas).
const GTIPOS = ['park', 'national_park', 'state_park', 'hiking_area', 'campground'];
async function gplaces(req, o, env) {
  if (!ORIGENS.includes(o)) return resp({ erro: 'origem' }, 403, o);
  if (!env.GOOGLE_PLACES_KEY) return resp({ erro: 'sem_chave' }, 503, o);
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  if (!(await contar(env, 'gp:geral', 300))) return resp({ erro: 'limite_geral' }, 429, o);
  if (!(await contar(env, 'gp:' + ip, 20))) return resp({ erro: 'limite' }, 429, o);
  const u = new URL(req.url), lat = +u.searchParams.get('lat'), lon = +u.searchParams.get('lon'), km = Math.min(50, Math.max(1, +u.searchParams.get('km') || 20));
  if (!(lat >= -34 && lat <= 6 && lon >= -74 && lon <= -34)) return resp({ erro: 'local' }, 400, o);
  let r;
  try {
    r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.primaryType,places.googleMapsUri' },
      body: JSON.stringify({ includedTypes: GTIPOS, maxResultCount: 20, languageCode: 'pt-BR', regionCode: 'BR', locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: km * 1000 } } }),
    });
  } catch (_) { return resp({ erro: 'rede' }, 502, o); }
  if (!r.ok) return resp({ erro: 'google', status: r.status }, 502, o);
  const j = await r.json();
  const L = (j.places || []).map((p) => ({ id: p.id, n: (p.displayName && p.displayName.text) || '', lat: p.location && p.location.latitude, lon: p.location && p.location.longitude, ty: p.primaryType || '', url: p.googleMapsUri || '' })).filter((p) => p.n && isFinite(p.lat) && isFinite(p.lon));
  return resp({ L }, 200, o);
}


// Pagamento Pix pelo Mercado Pago. O token fica só aqui: variável secreta MP_TOKEN.
// Em teste, use o "Access Token" de TESTE (Suas integrações > sua aplicação > Credenciais de teste).
// Com o comprador de teste "APRO", o Mercado Pago aprova o Pix sozinho, sem dinheiro de verdade.
async function mpPix(req, o, env) {
  if (!ORIGENS.includes(o)) return resp({ erro: 'origem' }, 403, o);
  if (!env.MP_TOKEN) return resp({ erro: 'sem_chave' }, 503, o);
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  if (!(await contar(env, 'mp:geral', 500))) return resp({ erro: 'limite_geral' }, 429, o);
  if (!(await contar(env, 'mp:' + ip, 30))) return resp({ erro: 'limite' }, 429, o);
  let b; try { b = await req.json(); } catch (_) { return resp({ erro: 'json' }, 400, o); }
  const cents = parseInt(b.cents, 10), ref = String(b.ref || '').replace(/[^\w-]/g, '').slice(0, 60), desc = String(b.desc || 'Taxa Tasko').slice(0, 80);
  if (!(cents >= 100 && cents <= 50000)) return resp({ erro: 'valor' }, 400, o);
  const valor = (cents / 100).toFixed(2), teste = env.MP_MODO !== 'producao';
  const corpo = { type: 'online', processing_mode: 'automatic', external_reference: ref || ('tk-' + Date.now()), total_amount: valor, description: desc,
    payer: teste ? { email: 'test_user_br@testuser.com', first_name: 'APRO' } : { email: String(b.email || '').slice(0, 120) },
    transactions: { payments: [{ amount: valor, payment_method: { id: 'pix', type: 'bank_transfer' } }] } };
  let r; try {
    r = await fetch('https://api.mercadopago.com/v1/orders', { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.MP_TOKEN, 'Content-Type': 'application/json', 'X-Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(corpo) });
  } catch (_) { return resp({ erro: 'rede' }, 502, o); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return resp({ erro: 'mp', status: r.status, msg: (j.errors && j.errors[0] && j.errors[0].message) || j.message || '' }, 502, o);
  const pg = (j.transactions && j.transactions.payments && j.transactions.payments[0]) || {}, pm = pg.payment_method || {};
  return resp({ id: j.id, status: j.status, det: j.status_detail, qr: pm.qr_code || '', qr64: pm.qr_code_base64 || '', url: pm.ticket_url || '', teste }, 200, o);
}
async function mpStatus(req, o, env) {
  if (!ORIGENS.includes(o)) return resp({ erro: 'origem' }, 403, o);
  if (!env.MP_TOKEN) return resp({ erro: 'sem_chave' }, 503, o);
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[\w-]{4,60}$/.test(id)) return resp({ erro: 'id' }, 400, o);
  let r; try { r = await fetch('https://api.mercadopago.com/v1/orders/' + id, { headers: { 'Authorization': 'Bearer ' + env.MP_TOKEN } }); } catch (_) { return resp({ erro: 'rede' }, 502, o); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return resp({ erro: 'mp', status: r.status }, 502, o);
  const pago = j.status === 'processed' || j.status_detail === 'accredited';
  return resp({ id: j.id, status: j.status, det: j.status_detail, pago }, 200, o);
}

// Vídeos dos apps (Cloudflare R2, binding VIDEOS). Envio até 20 MB; quem envia recebe uma senha para apagar.
const MAX_VID = 20 * 1024 * 1024;
const LIMITE_VID_DIA = 20;                                    // envios por IP por dia
async function vidUp(req, o, env) {
  if (!ORIGENS.includes(o)) return resp({ erro: 'origem' }, 403, o);
  if (!env.VIDEOS) return resp({ erro: 'sem_r2' }, 503, o);
  const tipo = (req.headers.get('Content-Type') || '').toLowerCase();
  if (!/^video\/(mp4|webm|quicktime|3gpp|x-matroska|ogg)$/.test(tipo)) return resp({ erro: 'tipo' }, 400, o);
  const tam = parseInt(req.headers.get('Content-Length') || '0', 10);
  if (!(tam > 0) || tam > MAX_VID) return resp({ erro: 'tamanho' }, 413, o);
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  if (!(await contar(env, 'vid:' + ip, LIMITE_VID_DIA))) return resp({ erro: 'limite' }, 429, o);
  const app = (new URL(req.url).searchParams.get('app') || 'app').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'app';
  const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  const ext = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/3gpp': '3gp', 'video/x-matroska': 'mkv', 'video/ogg': 'ogv' }[tipo];
  const key = app + '/' + new Date().toISOString().slice(0, 7) + '/' + rnd() + '.' + ext, tk = rnd();
  const body = await req.arrayBuffer();
  if (body.byteLength > MAX_VID) return resp({ erro: 'tamanho' }, 413, o);
  await env.VIDEOS.put(key, body, { httpMetadata: { contentType: tipo }, customMetadata: { tk } });
  const base = new URL(req.url).origin;
  return resp({ id: key + '~' + tk, url: base + '/vid/' + key }, 200, o);
}
async function vidGet(req, o, env, key) {
  if (!env.VIDEOS) return new Response('sem_r2', { status: 503 });
  const obj = await env.VIDEOS.get(key, { range: req.headers });
  if (!obj) return new Response('não encontrado', { status: 404, headers: cors(o) });
  const h = new Headers(cors(o));
  obj.writeHttpMetadata(h);
  h.set('Accept-Ranges', 'bytes'); h.set('Cache-Control', 'private, max-age=86400');
  if (obj.range && req.headers.get('Range')) {
    const off = obj.range.offset || 0, len = obj.range.length != null ? obj.range.length : obj.size - off;
    h.set('Content-Range', 'bytes ' + off + '-' + (off + len - 1) + '/' + obj.size); h.set('Content-Length', String(len));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set('Content-Length', String(obj.size));
  return new Response(obj.body, { status: 200, headers: h });
}
async function vidDel(req, o, env, key) {
  if (!ORIGENS.includes(o)) return resp({ erro: 'origem' }, 403, o);
  if (!env.VIDEOS) return resp({ erro: 'sem_r2' }, 503, o);
  const tk = new URL(req.url).searchParams.get('tk') || '';
  const obj = await env.VIDEOS.head(key);
  if (!obj) return resp({ erro: 'not_found' }, 404, o);
  if (!tk || (obj.customMetadata || {}).tk !== tk) return resp({ erro: 'senha' }, 403, o);
  await env.VIDEOS.delete(key);
  return resp({ ok: true }, 200, o);
}

export default {
  async fetch(req, env, ctx) {
    const o = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(o) });
    const pth = new URL(req.url).pathname;
    if (req.method === 'GET' && pth === '/vid/ok') return resp({ ok: !!env.VIDEOS }, 200, o);
    if (req.method === 'PUT' && pth === '/vid/up') { try { return await vidUp(req, o, env); } catch (_) { return resp({ erro: 'r2' }, 502, o); } }
    if (pth.startsWith('/vid/') && /^[a-z0-9-]+\/\d{4}-\d{2}\/[0-9a-f]{24}\.[a-z0-9]{2,4}$/.test(pth.slice(5))) {
      const key = pth.slice(5);
      try {
        if (req.method === 'GET' || req.method === 'HEAD') return await vidGet(req, o, env, key);
        if (req.method === 'DELETE') return await vidDel(req, o, env, key);
      } catch (_) { return resp({ erro: 'r2' }, 502, o); }
    }
    if (req.method === 'GET' && new URL(req.url).pathname === '/taxas') {
      try { return await taxas(req, o, ctx); } catch (_) { return resp({ erro: 'bcb' }, 502, o); }
    }
    if (req.method === 'GET' && new URL(req.url).pathname === '/gplaces') {
      try { return await gplaces(req, o, env); } catch (_) { return resp({ erro: 'google' }, 502, o); }
    }
    if (req.method === 'GET' && new URL(req.url).pathname === '/osm') {
      try { return await osm(req, o, ctx); } catch (_) { return resp({ erro: 'osm' }, 502, o); }
    }
    if (req.method === 'POST' && new URL(req.url).pathname === '/mp/pix') {
      try { return await mpPix(req, o, env); } catch (_) { return resp({ erro: 'mp' }, 502, o); }
    }
    if (req.method === 'GET' && new URL(req.url).pathname === '/mp/status') {
      try { return await mpStatus(req, o, env); } catch (_) { return resp({ erro: 'mp' }, 502, o); }
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
