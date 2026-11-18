// Service worker do app. Três trabalhos: (1) guardar o carregador para abrir sem rede;
// (2) na navegação, servir o painel que está no cache — vestido com a camada de leitura —
// e, sem painel guardado, o carregador; (3) guardar a fonte dos títulos na primeira visita.
// A VERSAO é carimbada pelo `node build-app.mjs` (resumo dos arquivos da pasta): arquivo
// mudado sem carimbo novo deixaria o aparelho com a versão velha, e o teste cobra.
/* global JPApp */
importScripts('./comum.js');
const VERSAO = 'fc7d3c540d';
const CASCA = 'jp-casca-' + VERSAO;
const FONTES = 'jp-fontes-v1';
const ARQUIVOS = ['./', './index.html', './comum.js', './leitura.js', './leitura.css', './manifest.webmanifest',
  './icone-180.png', './icone-192.png', './icone-512.png', './icone-mascara-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' — o Pages manda max-age=600, e sem isto a casca de uma versão nova nascia com
  // os arquivos da anterior que ainda estivessem no cache HTTP (carimbo novo, código velho)
  e.waitUntil(caches.open(CASCA).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('jp-casca-') && k !== CASCA).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// frame-ancestors só vale como cabeçalho (o Pages não deixa mandar; aqui quem responde é o SW):
// o painel não abre dentro de página de ninguém
const html = (texto) => new Response(texto, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
  'Content-Security-Policy': JPApp.CSP + "; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
// a casca pode sumir com o service worker vivo ("Apagar" com outra janela do app aberta: o Chrome
// reaproveita o registro sem evento install): a navegação a refaz quando falta
const refazCasca = () => caches.open(CASCA).then((c) => c.match('./leitura.js').then((r) => r || c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))));
const daCasca = (req) => caches.open(CASCA).then((c) => c.match(req, { ignoreSearch: true }));

async function navegar(req) {
  const url = new URL(req.url);
  // ?config abre o carregador mesmo com painel guardado (trocar token, sair)
  if (!url.searchParams.has('config')) {
    const guardado = await JPApp.guardado();
    if (guardado) return html(JPApp.vestir(guardado, VERSAO));
  }
  return (await daCasca('./index.html')) || fetch(req);
}

// a página pede a casca de volta sem esperar a próxima navegação (reconectou e saiu da rede em seguida)
self.addEventListener('message', (e) => { if (e.data === 'casca') e.waitUntil(refazCasca().catch(() => {})); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const escopo = new URL(self.registration.scope);
  if (url.origin === escopo.origin && url.pathname.startsWith(escopo.pathname)) {
    const resto = url.pathname.slice(escopo.pathname.length);
    if (req.mode === 'navigate' && (resto === '' || resto === 'index.html')) { e.waitUntil(refazCasca().catch(() => {})); e.respondWith(navegar(req)); return; }
    // o painel de mesma origem (modo local) é sempre da rede: é ele que a camada confere
    if (resto === 'painel.html') return;
    e.respondWith(daCasca(req).then((r) => r || fetch(req)));
    return;
  }
  // a serifada dos títulos (Google Fonts): guarda na primeira vez, serve do cache depois
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTES).then((c) => c.match(req).then((r) => r || fetch(req).then((n) => {
      if (n && (n.ok || n.type === 'opaque')) c.put(req, n.clone());
      return n;
    }))));
  }
});
