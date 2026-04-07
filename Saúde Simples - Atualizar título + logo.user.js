// ==UserScript==
// @name         Saúde Simples - Atualizar título + logo
// @namespace    http://tampermonkey.net/
// @author       @otowm
// @downloadURL  https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Sa%C3%BAde%20Simples%20-%20Atualizar%20t%C3%ADtulo%20+%20logo.user.js
// @updateURL    https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Sa%C3%BAde%20Simples%20-%20Atualizar%20t%C3%ADtulo%20+%20logo.user.js
// @version      1.0
// @description  Atualiza o título da aba e o favicon conforme o conteúdo da tela
// @match        https://*.saudesimples.net/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const NOVO_FAVICON = "https://github.com/otowm/om30-saudesimples/blob/main/assets/OM30%20Logo.png?raw=true";

    function obterTituloPagina() {

        // 1. Caso específico: painel de senhas
        const senhaEl = document.querySelector('#painel-atendimento-senhas-container h1');
        if (senhaEl && senhaEl.innerText.trim()) {
            return `Senha: ${senhaEl.innerText.trim()}`;
        }

        // 2. Padrões gerais do sistema
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

    function atualizarTudo() {
        atualizarTitulo();
        atualizarFavicon();
    }

    // debounce
    let timeout;
    const observer = new MutationObserver(() => {
        clearTimeout(timeout);
        timeout = setTimeout(atualizarTudo, 100);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // eventos comuns
    window.addEventListener('load', atualizarTudo);
    window.addEventListener('popstate', atualizarTudo);

})();
