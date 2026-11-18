// Camada de leitura do app: roda DENTRO do painel servido pelo service worker. Não desenha
// número nenhum — impede que o painel escreva, diz de quando são os dados, confere se há painel
// novo e avisa.
(function(){
  'use strict';
  var A = window.JPApp; if (!A) return;
  var CONFERE_A_CADA = 5 * 60 * 1000;   // voltar ao app com mais de 5 min confere de novo
  var abriu = Date.now(), tocou = false;
  ['pointerdown', 'keydown', 'scroll'].forEach(function(ev){ window.addEventListener(ev, function(){ tocou = true; }, { passive: true, once: true }); });
  document.documentElement.classList.add('so-leitura');

  // ---- nada escreve ----
  // Esconder o botão não desarma o clique: o Enter no campo do simulador "Posso comprar isto?"
  // faz o painel chamar btnSave.click(), e um lançamento era gravado num app só de leitura, sem
  // ter como apagar. A barreira fica na fase de captura do documento, antes de qualquer ouvinte
  // do painel, e vale para toque, teclado, leitor de tela e o .click() do próprio painel. A lista
  // é a mesma que a leitura.css esconde (o teste confere que as duas dizem a mesma coisa).
  var ESCREVE = '#btnSave, [data-lancar], #btnBot, #btnBotTopo, .c-chk, .c-val, .c-zerar, .lanc-lista .lx, .fila-acoes, .fi-marca';
  document.addEventListener('click', function(ev){
    var t = /** @type {any} */ (ev.target);
    if (t && t.closest && t.closest(ESCREVE)) { ev.stopImmediatePropagation(); ev.preventDefault(); }
  }, true);

  // ---- o toque responde antes do trabalho ----
  // Trocar de mês redesenha a página inteira antes de o chip tocado mudar de cor (o mês do topo é
  // o último a saber), e no celular isso passa de um quinto de segundo com o dedo já fora da tela.
  // Aqui o chip acende na hora e o clique de verdade segue no quadro seguinte: o resultado na
  // tela é o mesmo, a resposta ao toque vem primeiro. Dois toques seguidos: vale o último.
  var MES = '.mesnav .chip', mesPedido = null, mesPassando = null;
  document.addEventListener('click', function(ev){
    var t = /** @type {any} */ (ev.target), chip = t && t.closest ? t.closest(MES) : null;
    if (!chip || chip === mesPassando || typeof window.requestAnimationFrame !== 'function') return;
    if (chip.classList.contains('on') && !mesPedido) return;   // já é o mês da tela
    ev.stopImmediatePropagation(); ev.preventDefault();
    Array.prototype.forEach.call(chip.parentNode.querySelectorAll('.chip'), function(/** @type {any} */ c){
      c.classList.toggle('on', c === chip);
      if (c === chip) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
    });
    var agendado = !!mesPedido; mesPedido = chip;
    if (agendado) return;
    var feito = false, segue = function(){
      if (feito) return;
      feito = true;
      var c = mesPedido; mesPedido = null; mesPassando = c;
      try { if (c && c.isConnected !== false) c.click(); } finally { mesPassando = null; }
    };
    window.requestAnimationFrame(function(){ setTimeout(segue, 0); });
    setTimeout(segue, 120);   // página em segundo plano não tem quadro: o clique não se perde
  }, true);

  // ---- segurar o dedo num controle não abre menu de site ----
  // No Chrome do Android, segurar o dedo num link abre o menu de link ("abrir no Chrome", "copiar
  // endereço"); os do painel são âncoras internas (href="#…"), que no app não têm o que copiar.
  // Vale só para controle (link interno, botão, <summary>, gráfico): no texto de leitura o menu
  // continua — é dele que sai o "copiar" de um valor. E só para o dedo: o clique direito do mouse
  // (app aberto no computador) segue abrindo o menu de sempre.
  var SEM_MENU = 'a[href^="#"], button, summary, .graf-box';
  document.addEventListener('contextmenu', function(ev){
    var t = /** @type {any} */ (ev.target);
    if (/** @type {any} */ (ev).pointerType === 'mouse') return;
    if (t && t.closest && t.closest(SEM_MENU)) ev.preventDefault();
  }, true);

  /** de quando é o DADO: o carimbo que o gerador põe no painel, não a hora do download */
  function geradoEm(){
    var s = window.__STATUS && window.__STATUS.geradoEm, o = window.__OFICIAL && window.__OFICIAL.cutoff;
    var d = new Date(s || o || NaN); return isNaN(d.getTime()) ? null : d;
  }
  // No fuso do painel, que formata tudo em Brasília: no fuso do aparelho, a faixa e o topo do
  // painel diziam duas horas diferentes para o mesmo carimbo a quem estivesse viajando.
  var FMT = null;
  try { FMT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch (e) { /* sem Intl: fuso do aparelho */ }
  /** @param {Date|null} d */
  function quando(d){
    if (!d) return 'data desconhecida';
    var p = function(n){ return (n < 10 ? '0' : '') + n; };
    if (!FMT) return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' às ' + p(d.getHours()) + 'h' + p(d.getMinutes());
    /** @type {Record<string, string>} */
    var f = {};
    FMT.formatToParts(d).forEach(function(x){ f[x.type] = x.value; });
    return f.day + '/' + f.month + ' às ' + f.hour + 'h' + f.minute;
  }

  // ---- a faixa no fim da página ----
  var faixa = document.createElement('div'); faixa.id = 'jpAppFaixa';
  var txt = document.createElement('span'); txt.className = 'jp-quando';
  var bConf = document.createElement('button'); bConf.type = 'button'; bConf.textContent = 'Conferir agora';
  var bCfg = document.createElement('button'); bCfg.type = 'button'; bCfg.textContent = 'Configurar';
  faixa.appendChild(txt); faixa.appendChild(bConf); faixa.appendChild(bCfg);
  function pintaFaixa(){
    var m = A.meta();
    txt.textContent = 'Só leitura · dados de ' + quando(geradoEm()) + (m.conferido ? ' · conferido ' + quando(new Date(m.conferido)) : '');
  }
  var casa = document.querySelector('.conteudo') || document.querySelector('main') || document.body;
  casa.appendChild(faixa); pintaFaixa();
  bCfg.addEventListener('click', function(){ location.href = './?config'; });

  // ---- o aviso ----
  var avisoEl = null;
  /** @param {string} texto @param {string} [rotulo] @param {Function|null} [acao] @param {number} [some] */
  function aviso(texto, rotulo, acao, some){
    if (avisoEl) avisoEl.remove();
    avisoEl = document.createElement('div'); avisoEl.id = 'jpAppAviso'; avisoEl.setAttribute('role', 'status');
    var s = document.createElement('span'); s.textContent = texto; avisoEl.appendChild(s);
    if (rotulo && acao) { var b = document.createElement('button'); b.type = 'button'; b.textContent = rotulo; b.addEventListener('click', function(){ acao(); }); avisoEl.appendChild(b); }
    document.body.appendChild(avisoEl);
    if (some) { var eu = avisoEl; setTimeout(function(){ if (eu === avisoEl) { eu.remove(); avisoEl = null; } }, some); }
  }

  // ---- a tela está atrás do que está guardado? ----
  // Um painel novo pode ter sido guardado sem a tela trocar (o dono estava lendo; outra aba
  // guardou). Daí em diante o GitHub responde 304 — o ETag novo já foi gravado — e, sem esta
  // lembrança, o app dizia "Nada novo" e "conferido agora" mostrando o painel antigo.
  // Compara com o que estava guardado quando ESTA página abriu, não com o relógio: relógio do
  // aparelho que volta atrás deixava o aviso de dados novos falso em toda abertura.
  var guardadoAoAbrir = A.meta().baixado || 0;
  function atras(){ var b = A.meta().baixado; return !!b && b !== guardadoAoAbrir; }
  function ofereceNovo(){ aviso('Chegaram dados novos.', 'Atualizar', function(){ location.reload(); }); }

  // ---- conferir se há painel novo ----
  var conferindo = false;
  /** @param {boolean} pedido o toque em "Conferir agora" (fala mesmo quando não há novidade) */
  function conferir(pedido){
    var cfg = A.cfg();
    if (!cfg || conferindo) return;
    conferindo = true; bConf.disabled = true;
    var m = A.meta();
    /** a conferência não trouxe arquivo novo: registra, e diz a verdade sobre o que está na tela */
    var nadaNovo = function(/** @type {string|null|undefined} */ etag){
      var mm = A.meta();
      if (etag !== undefined) mm.etag = etag;
      mm.conferido = Date.now(); A.gravaMeta(mm); pintaFaixa();
      if (atras()) { if (pedido) location.reload(); else ofereceNovo(); return; }
      if (pedido) aviso('Nada novo: os dados são de ' + quando(geradoEm()) + '.', '', null, 4000);
    };
    A.buscar(cfg, m.etag || null).then(function(r){
      conferindo = false; bConf.disabled = false;
      if (r.estado === 'igual') { nadaNovo(undefined); return; }
      if (r.estado === 'novo') {
        // servidor sem ETag (o modo local) responde sempre com o arquivo inteiro: novo é só o
        // que DIFERE do guardado — sem isto a página se recarregava sem parar
        return A.guardado().then(function(atual){
          if (atual === r.html) { nadaNovo(r.etag || null); return; }
          return A.guardar(r.html).then(function(){
            A.gravaMeta({ etag: r.etag || null, baixado: Date.now(), conferido: Date.now() });
            // recém-aberto e sem toque: troca sozinho, uma vez; no meio da leitura, pergunta
            var ja = 0; try { ja = Number(sessionStorage.getItem('jp-app-recarga')) || 0; } catch (e) { /* modo privado */ }
            if (pedido || (!tocou && Date.now() - abriu < 6000 && Date.now() - ja > 60000)) {
              try { sessionStorage.setItem('jp-app-recarga', String(Date.now())); } catch (e) { /* modo privado */ }
              location.reload(); return;
            }
            pintaFaixa(); ofereceNovo();
          });
        });
      }
      if (r.estado === 'recusado') { aviso('O GitHub recusou o token deste aparelho.', 'Configurar', function(){ location.href = './?config'; }); return; }
      if (r.estado === 'ausente') { if (pedido) aviso('O painel não está mais no endereço configurado.', 'Configurar', function(){ location.href = './?config'; }); return; }
      // sem rede: se há painel novo guardado, a oferta de atualizar não pode sumir atrás deste aviso
      if (atras()) { if (pedido) location.reload(); else ofereceNovo(); return; }
      if (pedido || !navigator.onLine) aviso('Sem conexão: mostrando os dados de ' + quando(geradoEm()) + '.', '', null, 5000);
    }, function(){ conferindo = false; bConf.disabled = false; });
  }
  bConf.addEventListener('click', function(){ conferir(true); });
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState !== 'visible') return;
    if (atras()) { ofereceNovo(); }
    var m = A.meta(); if (!m.conferido || Date.now() - m.conferido > CONFERE_A_CADA) conferir(false);
  });
  window.addEventListener('online', function(){ conferir(false); });
  conferir(false);

  // ---- gestos de celular: deslizar de lado e o voltar do aparelho ----
  // O painel é o mesmo do computador; o que faz dele um app no celular mora aqui. Nada disto muda
  // a tela parada: só o que acontece DURANTE o gesto (a tela acompanha o dedo) e o que o botão ou
  // o gesto de voltar do aparelho faz.
  var DESLIZA = 'mes';   // o que o dedo de lado troca: 'mes' (mês anterior/seguinte), 'secao' (aba anterior/seguinte) ou '' (nada)
  var BORDA = 24;        // px das bordas da tela em que o gesto não começa: é a zona do voltar do Android
  var FOLGA = 10;        // px de movimento até decidir se o dedo vai de lado
  var T_SAI = 150, T_ENTRA = 200;   // ms: a tela que sai, a que entra
  var CURVA = 'cubic-bezier(.2,.7,.3,1)';
  var raiz = document.documentElement;
  var zona = /** @type {HTMLElement|null} */ (document.querySelector('.conteudo'));
  var folha = document.getElementById('sheet');
  function folhaAberta(){ return !!folha && folha.classList.contains('open'); }
  /** os destinos da barra de baixo, na ordem da tela (o "+" não é destino) */
  function abas(){ return /** @type {HTMLElement[]} */ (Array.prototype.slice.call(document.querySelectorAll('.abas button[data-aba]'))); }
  function abaAtual(){ var l = abas(); for (var i = 0; i < l.length; i++) if (l[i].getAttribute('aria-current') === 'page') return i; return -1; }
  function secaoVisivel(){ return /** @type {HTMLElement|null} */ (document.querySelector('.conteudo > section:not([hidden])')); }
  function semMovimento(){ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  /** com zoom de pinça o dedo de lado é do navegador: é com ele que se anda pela página ampliada */
  function ampliado(){ var v = window.visualViewport; return !!v && v.scale > 1.02; }
  /**
   * O que há daquele lado: +1 = seguinte (dedo para a esquerda), -1 = anterior. Devolve a troca
   * pronta, ou null quando não há para onde ir. O mês passa pelo __mesBus.set(), que a página
   * inteira assina; a aba, pelo clique no destino da barra — a navegação é a do painel.
   * @param {number} lado @returns {(function(): void)|null}
   */
  function vizinho(lado){
    if (DESLIZA === 'secao') {
      var l = abas(), b = l[abaAtual() + lado];
      return abaAtual() >= 0 && b ? function(){ b.click(); } : null;
    }
    if (DESLIZA !== 'mes') return null;
    var bus = window.__mesBus, ordem = window.__CAIXA && window.__CAIXA.ordem, topo = document.getElementById('topoMes');
    // tela sem o seletor de mês à vista (a Fila) não depende de mês: lá o gesto não existe
    if (!bus || !ordem || !topo || !topo.getClientRects().length) return null;
    var k = ordem.indexOf(bus.get()), m = k < 0 ? null : ordem[k + lado];
    return m ? function(){ bus.set(m); } : null;
  }
  /** o toque caiu em algo que rola de lado e ainda tem para onde rolar naquele sentido?
   *  @param {Element|null} el @param {number} dx negativo = dedo para a esquerda */
  function rolaDeLado(el, dx){
    for (var e = el; e && e !== zona && e.nodeType === 1; e = e.parentElement) {
      if (e.scrollWidth <= e.clientWidth + 1) continue;
      var o = window.getComputedStyle(e).overflowX;
      if (o !== 'auto' && o !== 'scroll') continue;
      if (dx < 0 ? e.scrollLeft < e.scrollWidth - e.clientWidth - 1 : e.scrollLeft > 1) return true;
    }
    return false;
  }
  /** onde o gesto nunca começa: campo e controle de arrastar */
  var FORA_DO_GESTO = 'input, select, textarea, [contenteditable], [draggable="true"]';
  /** Em cima de gráfico o dedo de lado tem dois sentidos, e quem diz qual é o próprio gráfico: se o
   *  dedo PAROU nele um instante, a cruz acendeu e a caixa leva data-lendo — o arrasto é a leitura;
   *  se veio andando, é deslize como em qualquer outro lugar (o gráfico larga o toque sozinho).
   *  @param {Element|null} el */
  function lendoGrafico(el){ var b = el && el.closest ? el.closest('.graf-box') : null; return !!b && b.hasAttribute('data-lendo'); }

  /** @type {{id:number, x0:number, y0:number, alvo:Element|null, lado:boolean, base:number, x:number, w:number, sec:HTMLElement|null, viz:Object<string, (function(): void)|null>, pts:{t:number, x:number}[], quadro:number}|null} */
  var gesto = null;
  var animando = false;
  /** a transição em curso, pronta para terminar na hora: um deslize novo não espera a animação do anterior
   *  @type {(function(): void)|null} */
  var pendente = null;
  /** @type {Object<string, boolean>} */
  var dedos = {};
  function quantosDedos(){ return Object.keys(dedos).length; }
  /** @param {HTMLElement} sec */
  function limpa(sec){ sec.style.transform = sec.style.transition = sec.style.opacity = sec.style.willChange = ''; }
  function fimDoGesto(){ raiz.classList.remove('jp-deslizando'); animando = false; }
  /** leva a seção até x (px) em ms, e chama depois — por transição, que roda fora do script
   *  @param {HTMLElement} sec @param {number} x @param {number} ms @param {function(): void} depois @param {number} [opaco] */
  function leva(sec, x, ms, depois, opaco){
    var feito = false, relogio = 0;
    var fim = function(){
      if (feito) return;
      feito = true;
      if (pendente === fim) pendente = null;
      window.clearTimeout(relogio); sec.removeEventListener('transitionend', aoFim); depois();
    };
    var aoFim = function(/** @type {Event} */ ev){ if (ev.target === sec) fim(); };
    sec.addEventListener('transitionend', aoFim);
    sec.style.transition = 'transform ' + ms + 'ms ' + CURVA + ', opacity ' + ms + 'ms linear';
    sec.style.transform = 'translate3d(' + x + 'px,0,0)';
    if (opaco !== undefined) sec.style.opacity = String(opaco);
    relogio = window.setTimeout(fim, ms + 80);   // transição que não dispara (aba em segundo plano) não prende a tela
    pendente = fim;
  }
  /** termina já a animação em curso — a saída, a troca e a entrada —, para o deslize seguinte começar da tela
   *  parada. Sem isto, o deslize feito durante a animação (uns 400 a 550 ms em celular) era descartado. */
  function apressa(){ for (var n = 0; pendente && n < 4; n++) pendente(); }
  /** soltou aquém do limiar, ou o navegador ficou com o toque: a tela volta para o lugar */
  function devolve(){
    var g = gesto; gesto = null;
    if (!g || !g.lado || !g.sec) return;
    if (g.quadro) window.cancelAnimationFrame(g.quadro);
    var sec = g.sec;
    if (semMovimento() || !g.x) { limpa(sec); fimDoGesto(); return; }
    animando = true;
    leva(sec, 0, T_SAI, function(){ limpa(sec); fimDoGesto(); });
  }
  /** soltou além do limiar: a tela sai pelo lado do dedo, a troca acontece, a nova entra pelo outro
   *  @param {number} lado +1 seguinte, -1 anterior */
  function troca(lado){
    var g = gesto; gesto = null;
    if (!g || !g.sec) return;
    if (g.quadro) window.cancelAnimationFrame(g.quadro);
    var sec = g.sec, acao = g.viz[String(lado)], w = g.w;
    if (!acao) { fimDoGesto(); return; }
    if (semMovimento()) { limpa(sec); acao(); fimDoGesto(); return; }
    animando = true;
    leva(sec, -lado * w, T_SAI, function(){
      acao();
      var nova = secaoVisivel() || sec;
      if (nova !== sec) limpa(sec);
      // a tela nova nasce um quarto de tela para o lado de onde vem, sem transição, e desliza até o lugar
      nova.style.transition = 'none'; nova.style.willChange = 'transform';
      nova.style.transform = 'translate3d(' + (lado * w * 0.25) + 'px,0,0)'; nova.style.opacity = '0';
      void nova.offsetWidth;
      leva(nova, 0, T_ENTRA, function(){ limpa(nova); fimDoGesto(); }, 1);
    });
  }
  function pinta(){
    var g = gesto; if (!g || !g.sec) return;
    g.quadro = 0;
    g.sec.style.transform = 'translate3d(' + g.x + 'px,0,0)';
  }
  if (zona && DESLIZA && window.PointerEvent) {
    // pan-y: a rolagem de cima a baixo continua do navegador (e fora do script); o movimento de
    // lado ele entrega aqui. pinch-zoom: a pinça continua valendo. Com zoom a regra sai, e o dedo
    // de lado volta a andar pela página ampliada.
    var regra = function(){ raiz.classList.toggle('jp-desliza', !ampliado()); };
    regra();
    if (window.visualViewport) window.visualViewport.addEventListener('resize', regra);
    var solta = function(/** @type {PointerEvent} */ ev){ delete dedos[ev.pointerId]; };
    window.addEventListener('pointerup', solta, true);
    window.addEventListener('pointercancel', solta, true);
    zona.addEventListener('pointerdown', function(ev){
      if (ev.pointerType === 'mouse') return;
      // o primeiro dedo de um toque é sempre o primário: um "soltou" que se perdeu (o dedo saiu da
      // janela) não pode deixar a camada achando para sempre que há dois dedos na tela
      if (ev.isPrimary) dedos = {};
      dedos[ev.pointerId] = true;
      // segundo dedo: é pinça, não deslize — o que estava em curso volta para o lugar
      if (quantosDedos() > 1) { if (gesto) devolve(); return; }
      var t = /** @type {Element|null} */ (ev.target);
      // durante a animação da troca anterior o toque é aceito: se for de lado, a animação termina na hora
      if (gesto || folhaAberta() || ampliado()) return;
      if (ev.clientX < BORDA || ev.clientX > window.innerWidth - BORDA) return;
      if (t && t.closest && t.closest(FORA_DO_GESTO)) return;
      gesto = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, alvo: t, lado: false, base: 0, x: 0, w: 0, sec: null, viz: {}, pts: [], quadro: 0 };
    });
    zona.addEventListener('pointermove', function(ev){
      var g = gesto; if (!g || ev.pointerId !== g.id) return;
      var dx = ev.clientX - g.x0, dy = ev.clientY - g.y0;
      if (!g.lado) {
        // De cima a baixo é rolagem, e quem a encerra é o navegador (ele manda o pointercancel ao
        // ficar com o toque). Enquanto ele não ficou, o gesto ESPERA em vez de desistir: desistir
        // pelo primeiro movimento (o dedo que sobe 10 a 14 px e só então vai de lado) deixava o
        // toque morto — a camada largava o gesto e o navegador, que decide na folga dele e pelo
        // movimento até lá, já tinha decidido não rolar.
        if (Math.abs(dx) < FOLGA || Math.abs(dx) <= Math.abs(dy)) return;
        // de lado dentro de algo que ainda rola de lado é dessa rolagem; no gráfico em leitura, é da cruz
        if (folhaAberta() || rolaDeLado(g.alvo, dx) || lendoGrafico(g.alvo)) { gesto = null; return; }
        if (animando) apressa();
        g.viz = { '-1': vizinho(-1), '1': vizinho(1) };
        g.sec = secaoVisivel();
        // sem vizinho de nenhum lado, não há gesto
        if (!g.sec || (!g.viz['-1'] && !g.viz['1'])) { gesto = null; return; }
        // a tela parte de onde o dedo está, descontada só a folga: o primeiro movimento que o
        // navegador entrega pode ser grande (dedo rápido), e descontá-lo inteiro engolia o gesto
        g.lado = true; g.base = dx < 0 ? -FOLGA : FOLGA; g.w = zona.clientWidth || window.innerWidth;
        if (!semMovimento()) { raiz.classList.add('jp-deslizando'); g.sec.style.willChange = 'transform'; }
      }
      var d = dx - g.base;
      // sem mês ou aba daquele lado a tela resiste: anda um quarto do dedo, até 64 px
      if (!g.viz[d < 0 ? '1' : '-1']) d = Math.max(-64, Math.min(64, d * 0.25));
      g.x = d;
      g.pts.push({ t: ev.timeStamp, x: dx });
      if (g.pts.length > 6) g.pts.shift();
      if (!semMovimento() && !g.quadro) g.quadro = window.requestAnimationFrame(pinta);
    });
    zona.addEventListener('pointerup', function(ev){
      var g = gesto; if (!g || ev.pointerId !== g.id) return;
      if (!g.lado) { gesto = null; return; }
      vigiaToque();
      var dx = ev.clientX - g.x0, d = dx - g.base, lado = d < 0 ? 1 : -1;
      // velocidade do fim do gesto (px/ms), medida no ponto guardado mais antigo dos últimos ~100 ms
      var v = 0;
      for (var i = 0; i < g.pts.length; i++) if (ev.timeStamp - g.pts[i].t <= 120) { var dt = ev.timeStamp - g.pts[i].t; if (dt > 8) v = (dx - g.pts[i].x) / dt; break; }
      var longe = Math.abs(d) > Math.min(g.w * 0.28, 120);
      var rapido = Math.abs(v) > 0.4 && Math.abs(d) > 24 && (v < 0) === (d < 0);
      if ((longe || rapido) && g.viz[String(lado)]) troca(lado); else devolve();
    });
    // o navegador ficou com o toque (rolagem, pinça): a tela volta
    zona.addEventListener('pointercancel', function(ev){ if (gesto && ev.pointerId === gesto.id) devolve(); });
  }

  // ---- o toque logo depois de um deslize ----
  // O deslize rápido termina, para o navegador, num arremesso (a rolagem que seguiria sozinha). A
  // regra de toque não o deixa rolar nada, mas ele fica "em curso" enquanto a velocidade decai
  // (até ~1 s), e o toque seguinte é gasto em pará-lo: chegam o pointerdown e o pointerup, e
  // clique nenhum. Era um toque morto logo depois de deslizar (medido: até 800 ms depois de
  // soltar). Não há como desfazer o arremesso daqui — o touchend do deslize não é cancelável —,
  // então a camada vigia SÓ o primeiro toque depois de cada deslize: um dedo, parado, curto, e
  // sem clique em seguida = ela entrega o clique que faltou, no mesmo ponto. Se o clique de
  // verdade ainda chegar atrasado, é ele que é barrado: nunca são dois. Fora dessa janela nada
  // disto existe, e nenhum ouvinte fica na página.
  var JANELA = 1500, PACIENCIA = 60;   // ms: até quando o toque pode ter sido engolido; quanto esperar pelo clique dele
  /** @type {(function(): void)|null} */
  var paraDeVigiar = null;
  function vigiaToque(){
    if (paraDeVigiar) paraDeVigiar();
    var ate = Date.now() + JANELA, id = -1, x0 = 0, y0 = 0, t0 = 0, veio = false, entregue = false;
    /** @type {EventTarget|null} */
    var alvo = null;
    var relogio = window.setTimeout(function(){ if (id < 0) para(); }, JANELA);
    function para(){
      window.clearTimeout(relogio);
      window.removeEventListener('pointerdown', desce, true); window.removeEventListener('pointerdown', para, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', sobe, true); window.removeEventListener('pointercancel', para, true);
      window.removeEventListener('click', clique, true);
      if (paraDeVigiar === para) paraDeVigiar = null;
    }
    /** @param {PointerEvent} ev */
    function desce(ev){
      window.removeEventListener('pointerdown', desce, true);
      if (ev.pointerType === 'mouse' || !ev.isPrimary || Date.now() > ate) { para(); return; }
      id = ev.pointerId; x0 = ev.clientX; y0 = ev.clientY; t0 = ev.timeStamp; alvo = ev.target;
      window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', sobe, true);
      window.addEventListener('pointercancel', para, true); window.addEventListener('click', clique, true);
    }
    /** @param {PointerEvent} ev */
    function move(ev){
      // segundo dedo, ou o dedo andou: não é toque (é rolagem, pinça ou outro deslize)
      if (ev.pointerId !== id || Math.abs(ev.clientX - x0) > FOLGA || Math.abs(ev.clientY - y0) > FOLGA) para();
    }
    /** @param {PointerEvent} ev */
    function sobe(ev){
      if (ev.pointerId !== id) { para(); return; }
      window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', sobe, true);
      window.removeEventListener('pointercancel', para, true);
      // toque demorado é pressão longa (menu, seleção): o navegador não clica de propósito
      if (ev.timeStamp - t0 > 350) { para(); return; }
      var x = ev.clientX, y = ev.clientY;
      window.setTimeout(function(){
        if (veio) { para(); return; }
        var el = document.elementFromPoint ? document.elementFromPoint(x, y) : null, a = /** @type {Node|null} */ (alvo);
        // o que está sob o dedo tem de ser o que foi tocado (a tela pode ter trocado no meio)
        if (!el || !a || !(el === a || el.contains(a) || a.contains(el))) { para(); return; }
        entregue = true;
        el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window, detail: 1, clientX: x, clientY: y, screenX: x, screenY: y }));
        // o clique de verdade DESTE toque, se ainda chegar atrasado, é barrado — até o próximo toque
        // começar (o clique dele é dele) ou meio segundo passar
        window.addEventListener('pointerdown', para, true);
        relogio = window.setTimeout(para, 500);
      }, PACIENCIA);
    }
    /** @param {MouseEvent} ev */
    function clique(ev){
      if (!ev.isTrusted) return;
      if (entregue) { ev.stopImmediatePropagation(); ev.preventDefault(); } else veio = true;
    }
    window.addEventListener('pointerdown', desce, true);
    paraDeVigiar = para;
  }

  // ---- o voltar do aparelho (botão ou gesto) ----
  // Com a folha aberta, voltar fecha a folha; fora da primeira aba, leva a ela; na primeira, sai
  // do app. São no máximo três entradas de histórico — base → seção → folha —, nunca uma por
  // toque: trocar de aba em aba mexe na entrada "seção" que já existe. O painel não sabe de nada
  // disto: a camada só OBSERVA a seção (data-secao no .conteudo) e a folha (classe open) e acerta
  // o histórico; e, quando o dono volta, pede ao painel o que ele já sabe fazer (o clique na
  // primeira aba, o clique no véu da folha). O endereço não muda: recarregar segue igual.
  var H = window.history, voltando = false, acordado = false;
  function tipoDaEntrada(){ var s = null; try { s = H.state; } catch (e) { /* documento sem histórico */ } return (s && s.jpNav) || 'base'; }
  function chaveDaAba(){ var b = abas()[abaAtual()]; return b ? b.getAttribute('data-aba') : null; }
  function tipoDaTela(){ return folhaAberta() ? 'folha' : (abaAtual() > 0 ? 'secao' : 'base'); }
  function recua(){
    voltando = true; H.back();
    setTimeout(function(){ voltando = false; }, 1500);   // popstate que não veio não deixa a camada surda
  }
  /**
   * Deixa o histórico igual à tela. Só EMPURRA entrada depois de um toque do dono: o navegador
   * pula, no voltar, a entrada criada sem interação — e empurrar na abertura faria o primeiro
   * voltar sair do app em vez de ir à primeira aba.
   * @param {boolean} [soDesce] na abertura: desfaz entrada que sobrou, não cria nenhuma
   */
  function acerta(soDesce){
    if (voltando) return;
    var tem = tipoDaEntrada(), quer = tipoDaTela();
    try {
      if (tem === quer) {
        if (quer === 'secao' && H.state.aba !== chaveDaAba()) H.replaceState({ jpNav: 'secao', aba: chaveDaAba() }, '');
        return;
      }
      if (quer === 'folha' || (quer === 'secao' && tem === 'base')) {
        if (!soDesce) H.pushState({ jpNav: quer, aba: chaveDaAba() }, '');
        return;
      }
      recua();   // a tela está abaixo da entrada (fechou a folha, voltou à primeira aba pelo toque)
    } catch (e) { /* histórico indisponível: o voltar fica como o do navegador */ }
  }
  if (H && H.pushState && H.replaceState && typeof window.MutationObserver === 'function') {
    try { if (!H.state || !H.state.jpNav) H.replaceState({ jpNav: 'base' }, ''); } catch (e) { /* segue sem */ }
    window.addEventListener('popstate', function(){
      // o recuo que a própria camada pediu: a tela já está certa, só confere de novo
      if (voltando) { voltando = false; acerta(); return; }
      var tem = tipoDaEntrada(), l = abas();
      if (folhaAberta()) { if (tem !== 'folha') { var veu = document.getElementById('sheetBack'); if (veu) veu.click(); } }
      else if (tem === 'folha') { recua(); return; }   // avançou até uma folha que já fechou
      else if (tem === 'base' && abaAtual() > 0 && l[0]) l[0].click();
      else if (tem === 'secao' && abaAtual() === 0) {
        // avançou de volta: reabre a aba em que a entrada foi criada
        var s = H.state, b = s && s.aba ? document.querySelector('.abas button[data-aba="' + String(s.aba).replace(/[^\w-]/g, '') + '"]') : null;
        if (b) /** @type {HTMLElement} */ (b).click();
      }
      acerta();
    });
    var olho = new window.MutationObserver(function(){ if (acordado) acerta(); });
    if (zona) olho.observe(zona, { attributes: true, attributeFilter: ['data-secao'] });
    if (folha) olho.observe(folha, { attributes: true, attributeFilter: ['class'] });
    // o primeiro toque do dono libera o empurrão; depois dele quem avisa é o observador, e os
    // ouvintes saem — nenhum toque paga por isto
    var TOQUES = ['pointerup', 'keydown', 'click'];
    var acorda = function(){
      if (acordado) return;
      // o que libera é o que o NAVEGADOR conta como toque do dono; o clique que o painel dispara
      // por script (ou um arrasto que virou rolagem) não conta, e empurrar entrada sem isso faria
      // o voltar pular a base
      var ua = /** @type {any} */ (navigator).userActivation;
      if (ua && !ua.hasBeenActive) return;
      acordado = true;
      TOQUES.forEach(function(ev){ window.removeEventListener(ev, acorda, true); });
      acerta();
    };
    TOQUES.forEach(function(ev){ window.addEventListener(ev, acorda, true); });
    acerta(true);
  }

  // updateViaCache 'none': igual ao do carregador (com opções diferentes vale a do último registro)
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(function(){ return navigator.serviceWorker.ready; }).then(function(r){ if (r.active) r.active.postMessage('casca'); }).catch(function(){});
})();
