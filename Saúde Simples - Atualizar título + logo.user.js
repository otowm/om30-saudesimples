// ==UserScript==
// @name         Saúde Simples - Atualizar título + logo
// @namespace    http://tampermonkey.net/
// @author       @otowm
// @downloadURL  https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Sa%C3%BAde%20Simples%20-%20Atualizar%20t%C3%ADtulo%20+%20logo.user.js
// @updateURL    https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Sa%C3%BAde%20Simples%20-%20Atualizar%20t%C3%ADtulo%20+%20logo.user.js
// @version      2.1
// @description  Atualiza o título da aba e o favicon conforme o conteúdo da tela
// @match        https://*.saudesimples.net/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────
  const NOVO_FAVICON = "https://github.com/otowm/om30-saudesimples/blob/main/assets/OM30%20Logo.png?raw=true";

  // ─────────────────────────────────────────────────────────────
  // TÍTULO DINÂMICO
  // ─────────────────────────────────────────────────────────────
  function obterTituloPagina() {
    const senhaEl = document.querySelector('#painel-atendimento-senhas-container h1');
    if (senhaEl && senhaEl.innerText.trim()) {
      return `Senha: ${senhaEl.innerText.trim()}`;
    }

    const seletores = [
      '#app .page-header h2',
      '#layout_new .page-header h2',
      '.page-header h2',
      '.content-header h2',
      'h2'
    ];

    for (const seletor of seletores) {
      const el = document.querySelector(seletor);
      if (el && el.innerText.trim()) {
        return el.innerText.trim();
      }
    }

    return null;
  }

  function atualizarTitulo() {
    const titulo = obterTituloPagina();
    if (titulo) {
      document.title = `${titulo} | Saúde Simples`;
    }
  }

  function atualizarFavicon() {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = NOVO_FAVICON;
  }

  // ─────────────────────────────────────────────────────────────
  // ÍCONES DO MENU
  // ─────────────────────────────────────────────────────────────
  const ICON_MAP = [
    { match: /dashboard|indicador/i, icon: 'zmdi-chart' },
    { match: /agendamento|agenda/i, icon: 'zmdi-calendar' },
    { match: /atendimento pa|pronto atend/i, icon: 'zmdi-ambulance' },
    { match: /urgência|emergência/i, icon: 'zmdi-alert-circle' },
    { match: /atendimento ambulatorial/i, icon: 'zmdi-stethoscope' },
    { match: /atendimento odontol/i, icon: 'zmdi-local-hospital' },
    { match: /acolhimento/i, icon: 'zmdi-account-add' },
    { match: /fila de atendimento/i, icon: 'zmdi-format-list-bulleted' },
    { match: /munícipe|municipe/i, icon: 'zmdi-accounts' },
    { match: /prontuário|prontuario/i, icon: 'zmdi-assignment' },
    { match: /cadastro/i, icon: 'zmdi-assignment-account' },
    { match: /profissional/i, icon: 'zmdi-badge-check' },
    { match: /estoque|farmácia/i, icon: 'zmdi-store' },
    { match: /vacinação|vacin/i, icon: 'zmdi-needle' },
    { match: /regulação/i, icon: 'zmdi-balance' },
    { match: /relatório/i, icon: 'zmdi-file-text' },
    { match: /ferramentas/i, icon: 'zmdi-wrench' },
    { match: /importação/i, icon: 'zmdi-upload' },
    { match: /ouvidoria/i, icon: 'zmdi-comment-alt' },
  ];

  function applyIcons() {
    document.querySelectorAll('.site-menu-title').forEach(titleEl => {
      const text = titleEl.textContent.trim();
      const iconEl = titleEl.closest('a, li')?.querySelector('.site-menu-icon');
      if (!iconEl) return;

      for (const rule of ICON_MAP) {
        if (rule.match.test(text)) {
          iconEl.className = iconEl.className
            .replace(/zmdi-[\w-]+/g, '')
            .trim() + ' ' + rule.icon;
          break;
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // TOOLTIP MENU
  // ─────────────────────────────────────────────────────────────
  const tooltip = document.createElement('div');
  tooltip.id = 'ss-menu-tooltip';

  Object.assign(tooltip.style, {
    position: 'fixed',
    background: '#1a1a2e',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.15s ease',
    zIndex: '99999'
  });

  document.body.appendChild(tooltip);

  function isSidebarCollapsed() {
    return document.querySelector('.site-menubar')?.classList.contains('collapseSidebar');
  }

  function attachTooltips() {
    document.querySelectorAll('.site-menu-title').forEach(titleEl => {
      if (titleEl.dataset.tooltipBound) return;
      titleEl.dataset.tooltipBound = '1';

      const anchor = titleEl.closest('a') || titleEl.parentElement;

      anchor.addEventListener('mouseenter', (e) => {
        if (!isSidebarCollapsed()) return;
        tooltip.textContent = titleEl.textContent.trim();
        tooltip.style.opacity = '1';
        moveTooltip(e);
      });

      anchor.addEventListener('mousemove', moveTooltip);
      anchor.addEventListener('mouseleave', () => tooltip.style.opacity = '0');
    });
  }

  function moveTooltip(e) {
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY + 12) + 'px';
  }

  // ─────────────────────────────────────────────────────────────
  // OBSERVER GLOBAL (SPA)
  // ─────────────────────────────────────────────────────────────
  let timeout;
  const observer = new MutationObserver(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      atualizarTitulo();
      atualizarFavicon();
      applyIcons();
      attachTooltips();
    }, 100);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // INIT
  window.addEventListener('load', () => {
    atualizarTitulo();
    atualizarFavicon();
    applyIcons();
    attachTooltips();
  });

})();
