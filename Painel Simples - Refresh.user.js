// ==UserScript==
// @name         Painel Simples - Refresh
// @description  Realiza atualização da página caso senha se altere e nenhum som seja reproduzido e ao atualizar força a reprodução do áudio da seja presente na tela
// @updateURL    https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Painel%20Simples%20-%20Refresh.user.js
// @downloadURL  https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Painel%20Simples%20-%20Refresh.user.js
// @namespace    http://tampermonkey.net/
// @version      1.1
// @match        https://senhaguaruja.saudesimples.net/paineis/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================
    // VERIFICAÇÃO DE HORÁRIO
    // =========================
    function dentroDoHorario() {
        const hora = new Date().getHours();
        // Retorna true se a hora atual for maior ou igual a 8 e menor que 17 (08:00 às 16:59)
        return hora >= 8 && hora < 17;
    }

    // =========================
    // LOG
    // =========================
    function log(...args) {
        console.log(`[Painel ${new Date().toLocaleTimeString()}]`, ...args);
    }

    function warn(...args) {
        console.warn(`[Painel ${new Date().toLocaleTimeString()}]`, ...args);
    }

    // =========================
    // VARIÁVEIS
    // =========================
    let ultimaSenha = null;
    let historicoAudios = [];

    // =========================
    // UTIL
    // =========================
    function getSenhaAtual() {
        const el = document.querySelector('#password span');
        if (!el) return null;

        const match = el.innerText.match(/[A-Z]{2}\d+/i);
        return match ? match[0].toLowerCase() : null;
    }

    function getLocalAtual() {
        const el = document.querySelector('#local span');
        if (!el) return null;

        return el.innerText
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, '-');
    }

    function extrairSenha(src) {
        const match = src?.match(/senha-([a-z0-9]+)/i);
        return match ? match[1].toLowerCase() : null;
    }

    // =========================
    // REGISTRAR ÁUDIO
    // =========================
    function registrarAudio(audioEl) {
        if (!dentroDoHorario()) return; // Bloqueia a execução fora do horário

        const src = audioEl.getAttribute('src');
        if (!src) return;

        const senha = extrairSenha(src);
        if (!senha) return;

        historicoAudios.push({
            senha,
            timestamp: Date.now()
        });

        log("🔊 Áudio registrado:", senha, src);
    }

    // =========================
    // MONITOR GLOBAL DE AUDIO
    // =========================
    function monitorarAudiosGlobal() {

        const observer = new MutationObserver((mutations) => {

            mutations.forEach(mutation => {

                // novo audio criado
                mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'AUDIO' && node.id?.startsWith('notification_speech_')) {
                        log("🆕 Novo áudio detectado:", node.id);
                        registrarAudio(node);
                    }
                });

                // mudança de src
                if (mutation.type === 'attributes' && mutation.target.tagName === 'AUDIO') {
                    registrarAudio(mutation.target);
                }

            });

        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });

        log("Monitor global de áudio iniciado");
    }

    monitorarAudiosGlobal();

    // =========================
    // MONITOR DE SENHA
    // =========================
    setInterval(() => {
        if (!dentroDoHorario()) return; // Bloqueia a execução fora do horário

        const senhaAtual = getSenhaAtual();

        log("Senha atual:", senhaAtual);

        if (!senhaAtual) return;

        if (!ultimaSenha) {
            ultimaSenha = senhaAtual;
            log("Inicial:", senhaAtual);
            return;
        }

        if (senhaAtual !== ultimaSenha) {
            const momentoMudanca = Date.now();

            log("Mudança:", ultimaSenha, "→", senhaAtual);

            setTimeout(() => {
                const agora = Date.now();

                const audioValido = historicoAudios.find(a =>
                    a.senha === senhaAtual &&
                    (
                        (momentoMudanca - a.timestamp <= 5000 && momentoMudanca - a.timestamp >= 0) ||
                        (a.timestamp - momentoMudanca <= 8000 && a.timestamp - momentoMudanca >= 0)
                    )
                );

                if (audioValido) {
                    log("✅ Áudio OK:", audioValido);
                } else {
                    warn("⚠ Sem áudio para:", senhaAtual);
                    warn("Recarregando em 3s...");

                    setTimeout(() => location.reload(), 3000);
                }

                // limpeza
                historicoAudios = historicoAudios.filter(a =>
                    agora - a.timestamp < 15000
                );

            }, 3000);
        }

        ultimaSenha = senhaAtual;

    }, 2000);

    // =========================
    // FORÇAR ÁUDIO APÓS RELOAD
    // =========================
    function tocarAudioAtual() {
        const senha = getSenhaAtual();
        const local = getLocalAtual();

        if (!senha || !local) {
            warn("[Init Áudio] Dados insuficientes");
            return;
        }

        const url = `/mp3/senha-${senha}-local-${local}.mp3`;

        const audio = document.querySelector('audio[id^="notification_speech_"]');

        if (!audio) {
            warn("[Init Áudio] Audio não encontrado");
            return;
        }

        log("[Init Áudio] Reforçando SRC:", url);

        try {
            // FORÇA MUDANÇA REAL DE SRC (gatilho principal)
            audio.removeAttribute("src");

            setTimeout(() => {
                audio.setAttribute("src", url);

                log("[Init Áudio] SRC reaplicado");

            }, 200);

        } catch (e) {
            warn("[Init Áudio] Erro:", e);
        }
    }

    // =========================
    // INIT
    // =========================
    window.addEventListener('load', () => {
        if (!dentroDoHorario()) {
            log("Fora do horário de funcionamento (08:00 às 17:00). Nenhuma ação inicial será executada.");
            return;
        }

        setTimeout(() => {
            log("Executando áudio pós-reload...");
            tocarAudioAtual();
        }, 3000);
    });

})();
