// ==UserScript==
// @name         Saúde Simples — navegação mobile
// @namespace    otowm.saudesimples
// @version      0.2.0
// @description  Torna o Saúde Simples (layout legado) usável em celular e tablet: menu em gaveta, conteúdo fluido, tabelas com rolagem própria, formulários em coluna única.
// @author       otowm
// @match        *://*.saudesimples.net/*
// @exclude      *://*.saudesimples.net/*painel*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

/*
 * O que quebra no layout legado (Rails + tema Remark + grid 960gs), e a correção:
 *
 *   .main-content { min-width: 960px }              -> min-width: 0
 *   .site-menubar + #layout_new { margin-left:290px} -> 0 (toggleSidebar() grava 290px/75px
 *                                                       inline, então precisa de !important)
 *   .container_12 .grid_N { width: 172px ... }       -> largura automática, uma coluna
 *   .top_search_form { position:absolute; top:150px } -> estático, acima da lista
 *   #selecionar-unidade-saude { width:480px }        -> fluido
 *   .token-input-list { width:400px }                -> fluido
 *   .modal { width:560px; margin-left:-280px }       -> colado nas margens da tela
 *
 * A barra lateral (.site-menubar) é fixa e sempre visível; aqui ela vira gaveta
 * off-canvas com backdrop, acionada pelo botão flutuante e pelos ícones da navbar.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------ ajustes
  var BREAKPOINT = 900;           // px: acima disso o site já cabe, não mexemos
  var ESCONDER_CHAT = true;       // widget do Tawk.to cobre o rodapé no celular
  var CHAVE_DESLIGADO = 'ssm:desligado';

  var html = document.documentElement;
  var ligado = false;             // gaveta/ajustes ativos nesta viewport
  var overlay = null;
  var fab = null;

  function desativadoPeloUsuario() {
    try { return localStorage.getItem(CHAVE_DESLIGADO) === '1'; } catch (e) { return false; }
  }

  function ligarDeVolta(recarregar) {
    try { localStorage.removeItem(CHAVE_DESLIGADO); } catch (e) {}
    if (recarregar) location.reload(); else avaliar();
  }

  function desligar() {
    try { localStorage.setItem(CHAVE_DESLIGADO, '1'); } catch (e) {}
    avaliar();
  }

  // Saída de emergência sem console: abrir qualquer página do sistema com
  // #mobile no fim da URL religa os ajustes.
  if (location.hash === '#mobile' || location.hash === '#ssm') {
    try { localStorage.removeItem(CHAVE_DESLIGADO); } catch (e) {}
  }

  // Atalho para o console do desktop.
  window.ssmMobile = {
    ligar: function () { ligarDeVolta(false); },
    desligar: desligar,
    ativo: function () { return ligado; }
  };

  function telaPequena() {
    return window.matchMedia('(max-width: ' + BREAKPOINT + 'px)').matches;
  }

  // Layout legado: <body class="site-menubar-unfold"> + #layout_new.
  // O v3 (Nuxt/Bootstrap 4) e os painéis de senha não entram aqui.
  function layoutLegado() {
    var b = document.body;
    if (!b) return false;
    return /site-menubar-(un)?fold/.test(b.className) ||
           !!document.querySelector('#layout_new, .site-menubar');
  }

  // --------------------------------------------------------------------- CSS
  // Tudo sob html.ssm + media query: girar o tablet ou desligar o script
  // devolve o layout original sem recarregar.
  var CSS = [
    /* fora do breakpoint (ou em página que não é o layout legado) os controles
       injetados não aparecem */
    '.ssm-fab, .ssm-overlay { display: none !important; }',
    '@media (max-width: ' + BREAKPOINT + 'px) {',

    /* --- moldura da página ------------------------------------------------ */
    'html.ssm, html.ssm body { max-width: 100% !important; }',
    /* no breakpoint mobile o tema faz .navbar-fixed-top voltar a position:static
       com margin-left/right de -20px -> a barra ficava 40px mais larga que a tela
       e o padding-top de 66px do body virava um vão vazio */
    'html.ssm body { padding-top: 0 !important; }',
    'html.ssm #header-bar, html.ssm .site-navbar {',
    '  position: sticky !important; top: 0 !important; left: 0 !important; right: 0 !important;',
    '  width: auto !important; max-width: 100% !important; margin-left: 0 !important;',
    '  margin-right: 0 !important; z-index: 1100 !important; overflow: visible !important; }',
    'html.ssm .main-content { min-width: 0 !important; max-width: 100% !important;',
    '  padding-top: .5rem !important; }',
    'html.ssm .site-menubar + #layout_new, html.ssm #layout_new,',
    'html.ssm .site-menubar + .layout_new + .footer {',
    '  margin-left: 0 !important; margin-right: 0 !important; padding-left: 0 !important; }',
    'html.ssm .page-header, html.ssm .page-content { padding: 10px !important; }',
    'html.ssm .page-header h2, html.ssm .page-title { font-size: 20px !important; line-height: 1.3 !important; }',

    /* --- navbar ----------------------------------------------------------- */
    'html.ssm .site-navbar { min-height: 0 !important; }',
    'html.ssm .navbar-header { width: auto !important; min-width: 0 !important;',
    '  display: flex !important; align-items: center !important; }',
    'html.ssm .header-logo-prefeitura { display: flex !important; align-items: center !important;',
    '  gap: 4px !important; }',
    'html.ssm .header-main-logo-image { max-height: 34px !important; width: auto !important; }',
    /* faixa de campanha come metade da tela num celular */
    'html.ssm .campanha-container { display: none !important; }',
    'html.ssm .navbar-header .fa-expand { display: none !important; }',
    /* o site mantém os dois ícones (recolher/expandir) e alterna por JS;
       na gaveta só o ☰ faz sentido */
    'html.ssm .navbar-header .fa-chevron-left { display: none !important; }',
    'html.ssm .navbar-header .fa-bars { display: inline-block !important;',
    '  font-size: 20px !important; padding: 6px 12px 6px 4px !important; }',
    /* a barra de ferramentas (notificações, unidade, usuário) estourava a largura:
       nome completo do usuário + nome da unidade passavam de 540px */
    'html.ssm .navbar-collapse, html.ssm #site-navbar-collapse {',
    '  padding-left: 0 !important; padding-right: 0 !important; margin-left: 0 !important;',
    '  margin-right: 0 !important; max-width: 100% !important; box-sizing: border-box !important;',
    '  border: 0 !important; box-shadow: none !important; }',
    'html.ssm .navbar-toolbar { float: none !important; display: flex !important;',
    '  flex-wrap: wrap !important; justify-content: flex-end !important; align-items: center !important;',
    '  margin: 0 !important; max-width: 100% !important; }',
    'html.ssm .navbar-toolbar > li { float: none !important; }',
    'html.ssm .navbar-toolbar > li > a { padding: 10px 8px !important; }',
    'html.ssm .unidade-saude-atual > a { display: inline-block !important;',
    '  max-width: 34vw !important; overflow: hidden !important; text-overflow: ellipsis !important;',
    '  white-space: nowrap !important; font-size: 11px !important; }',
    /* esconde o nome do usuário mantendo o avatar como alvo de toque */
    'html.ssm .navbar-avatar { font-size: 0 !important; }',
    'html.ssm .navbar-avatar .avatar img { width: 30px !important; height: 30px !important; }',
    'html.ssm .site-navbar .dropdown-menu { max-width: 94vw !important; }',
    'html.ssm .dropdown-menu-media, html.ssm .dropdown-menu-media .list-group {',
    '  width: auto !important; max-width: 94vw !important; }',

    /* --- barra lateral como gaveta ---------------------------------------- */
    'html.ssm .site-menubar {',
    '  position: fixed !important; top: 0 !important; left: 0 !important; bottom: 0 !important;',
    '  height: 100% !important; width: min(86vw, 300px) !important; max-width: 300px !important;',
    '  z-index: 1300 !important; overflow-y: auto !important; overflow-x: hidden !important;',
    '  -webkit-overflow-scrolling: touch;',
    '  transform: translateX(-102%) !important; transition: transform .22s ease-out !important;',
    '  box-shadow: 0 0 24px rgba(0,0,0,.25) !important; }',
    'html.ssm.ssm-menu-aberto .site-menubar { transform: none !important; }',
    /* perfect-scrollbar trava o toque; quem rola é a própria gaveta */
    'html.ssm .site-menubar-body, html.ssm .site-menubar .scroll-menu {',
    '  height: auto !important; max-height: none !important; overflow: visible !important;',
    '  position: static !important; }',
    'html.ssm .site-menubar .ps__rail-x, html.ssm .site-menubar .ps__rail-y { display: none !important; }',
    'html.ssm .site-menubar-footer { position: static !important; width: auto !important;',
    '  float: none !important; }',
    /* o toggleSidebar() do site esconde os títulos; na gaveta eles voltam */
    'html.ssm .site-menu-title { display: inline-block !important; visibility: visible !important;',
    '  opacity: 1 !important; max-width: none !important; white-space: normal !important; }',
    'html.ssm .site-menu-item > a { min-height: 44px !important; height: auto !important;',
    '  line-height: 1.4 !important; padding-top: 11px !important; padding-bottom: 11px !important;',
    '  white-space: normal !important; }',
    'html.ssm .site-menu-item, html.ssm .site-menu-sub .site-menu-item { white-space: normal !important; }',
    'html.ssm .site-menu > .site-menu-item > .site-menu-sub { position: static !important;',
    '  width: auto !important; visibility: visible !important; opacity: 1 !important;',
    '  left: auto !important; }',

    /* --- backdrop e botão flutuante --------------------------------------- */
    'html.ssm .ssm-overlay { position: fixed !important; inset: 0 !important; z-index: 1250 !important;',
    '  display: block !important;',
    '  background: rgba(0,0,0,.45); opacity: 0; pointer-events: none;',
    '  transition: opacity .22s ease-out; }',
    'html.ssm.ssm-menu-aberto .ssm-overlay { opacity: 1; pointer-events: auto; }',
    'html.ssm.ssm-menu-aberto { overflow: hidden !important; }',
    /* o botão aparece com html.ssm (abre a gaveta) e também sem ele quando os
       ajustes estão desligados (aí ele religa) */
    '.ssm-fab { position: fixed !important; left: 12px !important; bottom: 12px !important;',
    '  z-index: 1200 !important; width: 50px; height: 50px; border: 0; border-radius: 50%;',
    '  background: #00bcd4; color: #fff; font-size: 22px; line-height: 50px; padding: 0;',
    '  box-shadow: 0 3px 10px rgba(0,0,0,.3); cursor: pointer; display: block !important; }',
    '.ssm-fab.ssm-fab-off { background: rgba(0,0,0,.45); font-size: 20px; }',
    'html.ssm.ssm-menu-aberto .ssm-fab { display: none !important; }',
    'html.ssm .ssm-desktop { display: block; padding: 12px 20px; font-size: 13px;',
    '  color: #757575; border-bottom: 1px solid #eee; background: #fafafa; }',

    /* --- grid fixo -> uma coluna ------------------------------------------ */
    'html.ssm [class*="container_12"], html.ssm [class*="container_16"] {',
    '  width: auto !important; max-width: 100% !important; }',
    'html.ssm [class^="grid_"], html.ssm [class*=" grid_"] {',
    '  width: auto !important; float: none !important; margin-left: 0 !important;',
    '  margin-right: 0 !important; }',
    'html.ssm .row-fluid [class*="span"], html.ssm .row [class*="span"] {',
    '  width: 100% !important; float: none !important; margin-left: 0 !important; }',
    'html.ssm .two-column .column, html.ssm .two-column .column-content-box,',
    'html.ssm .two-column .column-fixed { width: 100% !important; float: none !important; }',
    'html.ssm .content-box, html.ssm .ui-widget, html.ssm fieldset {',
    '  max-width: 100% !important; box-sizing: border-box !important; }',

    /* --- campos e widgets ------------------------------------------------- */
    'html.ssm #layout_new input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]),',
    'html.ssm #layout_new select, html.ssm #layout_new textarea {',
    '  width: 100% !important; max-width: 100% !important; box-sizing: border-box !important;',
    '  min-height: 40px !important; }',
    /* 16px evita o zoom automático do Safari/iOS ao focar o campo */
    'html.ssm #layout_new input, html.ssm #layout_new select, html.ssm #layout_new textarea {',
    '  font-size: 16px !important; }',
    'html.ssm #layout_new input[type="checkbox"], html.ssm #layout_new input[type="radio"] {',
    '  width: 20px !important; height: 20px !important; min-height: 0 !important; }',
    'html.ssm #layout_new label { display: block !important; float: none !important;',
    '  width: auto !important; margin-bottom: 4px !important; }',
    'html.ssm .chosen-container, html.ssm .chosen-container-single, html.ssm .chosen-drop,',
    'html.ssm .token-input-list, html.ssm .ciap-cid-field .token-input-list {',
    '  width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; }',
    'html.ssm .chosen-container-single .chosen-single { height: auto !important;',
    '  min-height: 38px !important; line-height: 36px !important; }',
    'html.ssm #selecionar-unidade-saude { width: auto !important; max-width: 100% !important;',
    '  padding: 10px !important; }',
    'html.ssm .btn, html.ssm .ui-button, html.ssm #layout_new input[type="submit"] {',
    '  min-height: 40px !important; }',
    'html.ssm #layout_new .actions li { line-height: normal !important; margin-bottom: 8px !important; }',

    /* --- busca que flutuava sobre a lista --------------------------------- */
    'html.ssm #layout_new .top_search_form, html.ssm #layout_new .bottom_search_form {',
    '  position: static !important; right: auto !important; top: auto !important;',
    '  margin: 0 0 12px 0 !important; width: auto !important; }',
    'html.ssm #state_panel { position: static !important; }',

    /* --- tabelas: rolagem dentro da caixa, não na página ------------------ */
    'html.ssm .ssm-scroll { width: 100% !important; max-width: 100% !important;',
    '  overflow-x: auto !important; -webkit-overflow-scrolling: touch;',
    '  overscroll-behavior-x: contain; }',
    'html.ssm .ssm-scroll > table { max-width: none !important; width: auto !important;',
    '  min-width: 100% !important; }',
    'html.ssm .hastable th, html.ssm .hastable td { white-space: nowrap !important; }',
    'html.ssm .pagination { white-space: normal !important; }',
    'html.ssm #layout_new .pagination a, html.ssm #layout_new .pagination .current {',
    '  display: inline-block !important; padding: 11px 14px !important; margin-bottom: 4px !important; }',

    /* --- modais Bootstrap 2 ---------------------------------------------- */
    'html.ssm .modal { position: fixed !important; top: 8px !important; left: 8px !important;',
    '  right: 8px !important; bottom: auto !important; width: auto !important;',
    '  max-width: none !important; margin: 0 !important; max-height: calc(100% - 16px) !important;',
    '  overflow-y: auto !important; -webkit-overflow-scrolling: touch; }',
    'html.ssm .modal-body { max-height: none !important; }',

    /* --- gráficos --------------------------------------------------------- */
    'html.ssm [id^="chart-"], html.ssm .chart { max-width: 100% !important; }',

    ESCONDER_CHAT ? 'html.ssm #tawkchat-container, html.ssm .tawk-min-container,' +
                    ' html.ssm iframe[title*="chat" i] { display: none !important; }' : '',

    '}' // fim da media query
  ].join('\n');

  function injetarCSS() {
    var s = document.createElement('style');
    s.id = 'ssm-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ------------------------------------------------------------------ gaveta
  function abrirGaveta() { html.classList.add('ssm-menu-aberto'); }
  function fecharGaveta() { html.classList.remove('ssm-menu-aberto'); }
  function alternarGaveta() {
    if (html.classList.contains('ssm-menu-aberto')) fecharGaveta(); else abrirGaveta();
  }

  function montarControles() {
    if (!document.body) return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'ssm-overlay';
      overlay.addEventListener('click', fecharGaveta);
      document.body.appendChild(overlay);
    }
    if (!fab) {
      fab = document.createElement('button');
      fab.type = 'button';
      fab.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (ligado) { alternarGaveta(); return; }
        ligarDeVolta(true);  // modo desligado: o mesmo botão religa os ajustes
      });
      document.body.appendChild(fab);
    }
    atualizarFab();
    montarBotaoDesktop();
  }

  function atualizarFab() {
    if (!fab) return;
    fab.className = ligado ? 'ssm-fab' : 'ssm-fab ssm-fab-off';
    fab.textContent = ligado ? '☰' : '\uD83D\uDCF1';  // ☰ / 📱
    fab.setAttribute('aria-label', ligado ? 'Abrir menu' : 'Voltar ao layout mobile');
  }

  // Escape fecha a gaveta (útil no tablet com teclado).
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') fecharGaveta();
  });

  function montarBotaoDesktop() {
    var barra = document.querySelector('.site-menubar');
    if (!barra || barra.querySelector('.ssm-desktop')) return;
    var a = document.createElement('a');
    a.className = 'ssm-desktop';
    a.href = '#';
    a.textContent = 'Usar layout de desktop (desliga os ajustes)';
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      fecharGaveta();
      desligar();
    });
    barra.insertBefore(a, barra.firstChild);
  }

  // O site expõe toggleSidebar() nos ícones da navbar; no celular esses ícones
  // passam a abrir a gaveta em vez de alternar 290px/75px de margem.
  function capturarToggleDoSite() {
    var original = window.toggleSidebar;
    window.toggleSidebar = function () {
      if (ligado) { alternarGaveta(); return; }
      if (typeof original === 'function') return original.apply(this, arguments);
    };
    // os ícones usam onclick inline: troca direta é mais confiável
    var icones = document.querySelectorAll('.navbar-header .fa-bars, .navbar-header .fa-chevron-left');
    Array.prototype.forEach.call(icones, function (el) {
      el.onclick = function (ev) { ev.preventDefault(); alternarGaveta(); };
    });
  }

  // --------------------------------------------------- tabelas e larguras fixas
  var IGNORAR_TABELA = '.ui-datepicker, .chosen-container, .ssm-scroll, #modal-odontograma';

  function envolverTabelas(raiz) {
    var tabelas = (raiz || document).querySelectorAll('table');
    Array.prototype.forEach.call(tabelas, function (t) {
      if (t.closest(IGNORAR_TABELA)) return;
      var pai = t.parentNode;
      if (!pai || (pai.classList && pai.classList.contains('ssm-scroll'))) return;
      var box = document.createElement('div');
      box.className = 'ssm-scroll';
      pai.insertBefore(box, t);
      box.appendChild(t);
    });
  }

  // Larguras em pixel gravadas inline (pelo Chosen, pelo jQuery UI e por views
  // antigas) não cedem a CSS externo; aqui são removidas acima de 360px.
  var IGNORAR_LARGURA = 'table, img, canvas, svg, iframe, .ui-datepicker, #modal-odontograma';

  function soltarLargurasInline(raiz) {
    var alvo = raiz || document.getElementById('layout_new');
    if (!alvo) return;
    var els = alvo.querySelectorAll('[style*="width"]');
    Array.prototype.forEach.call(els, function (el) {
      if (el.matches(IGNORAR_LARGURA) || el.closest('.ui-datepicker, #modal-odontograma')) return;
      ['width', 'minWidth'].forEach(function (prop) {
        var v = el.style[prop];
        if (!v || v.indexOf('px') < 0) return;
        if (parseFloat(v) > 360) {
          el.style[prop] = '';
          el.style.maxWidth = '100%';
        }
      });
    });
  }

  // A aplicação repinta listas e formulários por ajax; o observer cuida do que
  // chega depois do load.
  var pendente = null;
  function observarDOM() {
    var raiz = document.getElementById('layout_new') || document.body;
    new MutationObserver(function () {
      if (pendente) return;
      pendente = setTimeout(function () {
        pendente = null;
        if (!ligado) return;
        envolverTabelas(raiz);
        soltarLargurasInline(raiz);
      }, 150);
    }).observe(raiz, { childList: true, subtree: true });
  }

  // ------------------------------------------------------------ liga/desliga
  function ativar() {
    if (ligado) return;
    ligado = true;
    html.classList.add('ssm');
    montarControles();
    envolverTabelas(document);
    soltarLargurasInline();
    capturarToggleDoSite();
  }

  function desativar() {
    ligado = false;
    html.classList.remove('ssm', 'ssm-menu-aberto');
    atualizarFab();
  }

  function avaliar() {
    if (!layoutLegado()) { desativar(); return; }
    if (desativadoPeloUsuario() || !telaPequena()) {
      desativar();
      // em tela pequena, mantém o botão de religar acessível
      if (telaPequena()) montarControles();
      return;
    }
    ativar();
  }

  // ------------------------------------------------------------------ partida
  injetarCSS();

  // Aplica a classe já no document-start para a página não piscar no layout de
  // 960px antes do DOMContentLoaded; avaliar() confirma ou desfaz em seguida.
  if (telaPequena() && !desativadoPeloUsuario()) html.classList.add('ssm');

  function iniciar() {
    avaliar();
    observarDOM();
    window.addEventListener('resize', avaliar);
    window.addEventListener('orientationchange', function () {
      setTimeout(avaliar, 300);
    });
    window.addEventListener('load', function () {
      if (ligado) { capturarToggleDoSite(); envolverTabelas(document); soltarLargurasInline(); }
    });
    // Fecha a gaveta ao navegar — mas não quando o toque só abre uma categoria.
    // Fase de bolha, depois do handler do tema: se ele chamou preventDefault
    // (expandir submenu) ou se o item tem submenu, a gaveta fica aberta.
    document.addEventListener('click', function (ev) {
      if (!ligado || ev.defaultPrevented) return;
      var a = ev.target.closest && ev.target.closest('.site-menubar a[href]');
      if (!a || a.classList.contains('ssm-desktop')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      var item = a.parentElement;
      if (item && item.querySelector('.site-menu-sub')) return;  // é categoria
      fecharGaveta();
    }, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
