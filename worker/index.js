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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export default {
  async fetch(req, env) {
    const o = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(o) });
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
