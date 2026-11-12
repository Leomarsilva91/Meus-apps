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

export default {
  async fetch(req, env, ctx) {
    const o = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(o) });
    if (req.method === 'GET' && new URL(req.url).pathname === '/taxas') {
      try { return await taxas(req, o, ctx); } catch (_) { return resp({ erro: 'bcb' }, 502, o); }
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
