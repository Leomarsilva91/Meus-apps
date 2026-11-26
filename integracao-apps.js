/* Integração opcional entre apps independentes, versão 1.
 * Somente termos públicos de pesquisa. Nunca enviar valores, IDs de conta,
 * datas pessoais, endereços particulares ou listas financeiras.
 */
(function () {
  'use strict';
  const apps = ['prumo', 'achei-barato', 'tasko', 'respiro'];
  const actions = {'achei-barato':'compras', tasko:'servicos', respiro:'destino'};
  function clean(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120);
  }
  function link(from, to, term) {
    if (!apps.includes(from) || !Object.hasOwn(actions,to) || from === to) throw new Error('Rota inválida');
    const q = clean(term);
    if (!q) throw new Error('Informe um termo de pesquisa');
    const u = new URL('../' + to + '/', location.href);
    if (u.origin !== location.origin) throw new Error('Origem inválida');
    u.hash = new URLSearchParams({integracao:'1', origem:from, acao:actions[to], q}).toString();
    return u.href;
  }
  function receive(app) {
    if (!Object.hasOwn(actions,app)) return null;
    const p = new URLSearchParams(location.hash.slice(1));
    const from = p.get('origem'), q = clean(p.get('q'));
    if (p.get('integracao') !== '1' || !apps.includes(from) || from === app || p.get('acao') !== actions[app] || !q) return null;
    return Object.freeze({from, action:actions[app], q});
  }
  function clear(app) {
    if (receive(app)) history.replaceState(history.state, '', location.pathname + location.search);
  }
  window.PrInterApp = Object.freeze({link, receive, clear});
})();
