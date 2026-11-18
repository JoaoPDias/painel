// Peças comuns do app (PWA só de leitura): usadas pelo carregador (index.html), pelo service
// worker (sw.js, via importScripts) e pela camada de leitura (leitura.js). Nada daqui é dado:
// esta pasta é pública por desenho, o painel com os números mora num repo privado à parte.
(function (g) {
  'use strict';
  var A = {
    CACHE_DADOS: 'jp-dados-v1',
    /** a chave do painel no cache: um endereço dentro do escopo do app */
    chavePainel: function () { return new URL('painel-em-cache', g.registration ? g.registration.scope : g.location.href).href; },
    CFG: 'jp-app-cfg',
    META: 'jp-app-meta',
    /**
     * A política de conteúdo do painel servido pelo app. O painel é HTML com script e roda na
     * origem que guarda o token: a política não impede um painel trocado de LER o que está ali,
     * mas corta script de fora e saída silenciosa em segundo plano (só fala com a própria origem
     * e com a API do GitHub). 'unsafe-inline' é do painel: ele é um arquivo só, com script e
     * estilo embutidos. O service worker a manda como cabeçalho (com frame-ancestors, que não
     * vale em <meta>); o carregador repete a mesma política num <meta>, e o teste confere.
     */
    CSP: "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; manifest-src 'self'; connect-src 'self' https://api.github.com; " +
      "worker-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'",
    /** o que identifica o arquivo como o painel, antes de guardar qualquer coisa */
    ehPainel: function (html) { return typeof html === 'string' && html.indexOf('window.__STATUS=') > 0 && html.indexOf('window.__CAIXA=') > 0; },
    /**
     * O painel do repo vira a página do app: classe so-leitura, manifest, cores da barra do
     * aparelho e a camada de leitura. Idempotente — o que já foi marcado não é marcado de novo.
     * @param {string} html @param {string} [versao]
     */
    vestir: function (html, versao) {
      // o marcador só vale no começo do arquivo, onde ele é posto: a mesma palavra dentro de um
      // dado do painel (uma nota, por exemplo) não pode fazer a camada de leitura ser pulada
      if (html.slice(0, 2000).indexOf('<meta name="jp-app" data-jp-app') > 0) return html;
      var v = versao ? '?v=' + versao : '';
      var cabeca =
        '<meta name="jp-app" data-jp-app content="leitura">' +
        '<link rel="manifest" href="./manifest.webmanifest">' +
        '<meta name="theme-color" content="#F4F0E8" media="(prefers-color-scheme: light)">' +
        '<meta name="theme-color" content="#100E0B" media="(prefers-color-scheme: dark)">' +
        '<meta name="mobile-web-app-capable" content="yes">' +
        '<meta name="apple-mobile-web-app-capable" content="yes">' +
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">' +
        '<meta name="apple-mobile-web-app-title" content="Painel">' +
        '<link rel="apple-touch-icon" href="./icone-180.png">' +
        '<link rel="icon" type="image/png" href="./icone-192.png">' +
        '<link rel="stylesheet" href="./leitura.css' + v + '">' +
        '<script defer src="./comum.js' + v + '"></scr' + 'ipt>' +
        '<script defer src="./leitura.js' + v + '"></scr' + 'ipt>';
      var sai = html.replace(/<html([^>]*)>/i, function (m, attrs) {
        if (/\bclass=/.test(attrs)) return '<html' + attrs.replace(/class="([^"]*)"/, 'class="$1 so-leitura"') + '>';
        return '<html' + attrs + ' class="so-leitura">';
      });
      // logo depois do charset: o que vem antes dele tem que continuar sendo só o doctype e o <html>
      if (/<meta charset=[^>]*>/i.test(sai)) return sai.replace(/<meta charset=[^>]*>/i, function (m) { return m + cabeca; });
      return sai.replace(/<html[^>]*>/i, function (m) { return m + cabeca; });
    },
    /** @returns {{modo:string, repo?:string, arquivo?:string, ramo?:string, token?:string}|null} */
    cfg: function () { try { return JSON.parse(g.localStorage.getItem(A.CFG) || 'null'); } catch (e) { return null; } },
    meta: function () { try { return JSON.parse(g.localStorage.getItem(A.META) || '{}') || {}; } catch (e) { return {}; } },
    /** @param {object} m */
    gravaMeta: function (m) { try { g.localStorage.setItem(A.META, JSON.stringify(m)); } catch (e) { /* modo privado */ } },
    /**
     * Busca o painel. `etag` evita baixar de novo o que não mudou (304 não conta no limite da API).
     * @returns {Promise<{estado:'novo'|'igual'|'recusado'|'ausente'|'erro', html?:string, etag?:string|null, http?:number}>}
     */
    buscar: function (cfg, etag) {
      var url, h = {};
      if (cfg.modo === 'local') url = new URL('painel.html', g.location.href).href;
      else {
        var cam = String(cfg.arquivo || 'painel.html').split('/').map(encodeURIComponent).join('/');
        url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + cam + '?ref=' + encodeURIComponent(cfg.ramo || 'main');
        h.Accept = 'application/vnd.github.raw+json';
        h.Authorization = 'Bearer ' + cfg.token;
      }
      if (etag) h['If-None-Match'] = etag;
      // Prazo em dois tempos: sinal que conecta e não entrega (elevador, wi-fi preso em portal)
      // deixava o pedido pendurado por minutos, com "Conferir agora" mudo. 20 s até o cabeçalho,
      // 90 s para o corpo (1,6 MB em rede lenta). Sem AbortController (o contexto do teste), sem prazo.
      var ctl = typeof g.AbortController === 'function' && typeof g.setTimeout === 'function' ? new g.AbortController() : null, t = null;
      var arma = function (ms) { if (!ctl) return; if (t) g.clearTimeout(t); t = ms ? g.setTimeout(function () { ctl.abort(); }, ms) : null; };
      arma(20000);
      var op = { headers: h, cache: 'no-store' };
      if (ctl) op.signal = ctl.signal;
      return g.fetch(url, op).then(function (r) {
        if (r.status === 304) return { estado: 'igual', http: 304 };
        if (r.status === 401 || r.status === 403) return { estado: 'recusado', http: r.status };
        if (r.status === 404) return { estado: 'ausente', http: 404 };
        if (!r.ok) return { estado: 'erro', http: r.status };
        arma(90000);
        return r.text().then(function (html) {
          if (!A.ehPainel(html)) return { estado: 'ausente', http: r.status };
          return { estado: 'novo', html: html, etag: r.headers.get('ETag'), http: r.status };
        });
      }).then(function (x) { arma(0); return x; }, function () { arma(0); return { estado: 'erro', http: 0 }; });
    },
    /** guarda o painel cru: quem veste é quem serve (sw.js), para a roupa nova valer sem baixar de novo */
    guardar: function (html) {
      return g.caches.open(A.CACHE_DADOS).then(function (c) {
        return c.put(A.chavePainel(), new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
      });
    },
    guardado: function () {
      if (!g.caches) return Promise.resolve(null);
      return g.caches.open(A.CACHE_DADOS).then(function (c) { return c.match(A.chavePainel()); }).then(function (r) { return r ? r.text() : null; });
    },
    /**
     * "Apagar deste aparelho": tudo o que o app E o painel deixaram aqui. O painel grava o seu
     * estado na mesma origem (a lista de lançamentos da última visita, o mês, a seção…), e todas
     * as chaves dele e do app começam com jp- ou jp_ — a varredura é por prefixo, para não
     * apodrecer quando o painel ganhar chave nova, e nunca um clear(): a origem pode ser dividida.
     * Saem também os caches (dados, casca e fontes) e o service worker; a página que chamou
     * recarrega pela rede e registra tudo de novo, limpo.
     */
    esquecer: function () {
      var limpa = function (arm) {
        try { Object.keys(arm).forEach(function (k) { if (/^jp[-_]/.test(k)) arm.removeItem(k); }); } catch (e) { /* modo privado */ }
      };
      try { if (g.localStorage) limpa(g.localStorage); } catch (e) { /* sem armazenamento */ }
      try { if (g.sessionStorage) limpa(g.sessionStorage); } catch (e) { /* sem armazenamento */ }
      var nada = function () { return null; };
      var caches = g.caches ? g.caches.keys().then(function (ks) {
        return Promise.all(ks.filter(function (k) { return /^jp-/.test(k); }).map(function (k) { return g.caches.delete(k); }));
      }).catch(nada) : Promise.resolve(null);
      var sw = g.navigator && g.navigator.serviceWorker && g.navigator.serviceWorker.getRegistration
        ? g.navigator.serviceWorker.getRegistration().then(function (r) { return r ? r.unregister() : null; }).catch(nada) : Promise.resolve(null);
      return Promise.all([caches, sw]);
    }
  };
  g.JPApp = A;
})(typeof self !== 'undefined' ? self : this);
