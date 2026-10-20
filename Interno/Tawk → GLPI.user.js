// ==UserScript==
// @name         Tawk.to → GLPI Sender
// @namespace    http://tampermonkey.net/
// @version      2.4
// @uploadURL    https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Interno/Tawk%20%E2%86%92%20GLPI.user.js
// @downloadURL  https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Interno/Tawk%20%E2%86%92%20GLPI.user.js
// @description  Envia chat do Tawk.to para o GLPI (com revisão antes de criar o chamado)
// @author       otowm
// @match        https://dashboard.tawk.to/*
// @match        https://suporte.om30.cloud/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// ==/UserScript==

(function () {
    'use strict';

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 1 — CONFIGURAÇÃO
    ════════════════════════════════════════════════════════════════════ */

    const GLPI_URL  = 'https://suporte.om30.cloud';
    const ENTITY_ID = 567;
    const GROUP_ASSIGN_ID = 9; // Grupo "Operação > Sistemas Guarujá"

    // Status padrão do chamado: 1 Novo, 2 Em atendimento, 4 Pendente, 5 Solucionado, 6 Fechado
    const STATUS_DEFAULT = 5;

    // ── Categorias de unidade (campos custom da sidebar do Tawk) ────────
    const UNIDADE_CATEGORIES = [
        'Urgência e Emergência',
        'Especialidades, Gestão e Outros Serviços',
        'Saúde Mental',
        'Atenção Básica (USAFA)',
        'Atenção Basica (UBS)',
    ];

    // ── Localizações (locations_id no GLPI) ─────────────────────────────
    // Chave: valor exatamente como aparece no seletor do Tawk.
    // IDs conferidos contra o dropdown de Localização do GLPI (entidade 567).
    const LOCATION_MAP = {
        // Urgência e Emergência
        'PAM RODOVIARIA':                2115, // GLPI também tem 642 "...– PAM RODOVIÁRIA"
        'PS SANTA CRUZ DOS NAVEGANTES':  2116,
        'PS PEREQUÊ':                    2114,
        'PSVC':                          2113,
        'SAMU':                          2118,
        'UPA ENSEADA':                   2133,

        // Especialidades, Gestão e Outros Serviços
        'ARE':                                   2099,
        'CASA ROSA':                             2112,
        'CASA SER':                              2880,
        'CENTRAL DE REGULAÇÃO':                  2119,
        'CEO':                                   2104,
        'CEVC':                                  2727,
        'CONSULTORIO NA RUA':                    2108,
        'CRFG':                                  2105,
        'CROOF':                                 2107,
        'CRVC':                                  2106,
        'DOCINHOS':                              2130,
        'SESAU':                                 641,
        'SIAD':                                  2122,
        'TRANSPORTE SANITÁRIO':                  2120,
        'UNAERP':                                2728,
        'VIGILÂNCIA SANITARIA E EPIDEMIOLÓGICA': 2121,
        'WILLIAN ROCHA':                         2131,
        'ZOONOSES':                              2132,

        // Saúde Mental
        'CAPS AD II':                    2100,
        'CAPS I':                        2103, // CAPS INFANTIL
        'CAPS II':                       2101,
        'CAPS III':                      2102,
        'RESIDENCIA TERAPEUTICA':        2117,

        // Atenção Básica (USAFA)
        'USAFA CIDADE ATLANTICA':          644,
        'USAFA JARDIM BOA ESPERANÇA':      646,
        'USAFA JARDIM BRASIL':             648,
        'USAFA JARDIM CONCEIÇÃOZINHA':     650,
        'USAFA JARDIM DOS PASSAROS':       652,
        'USAFA JARDIM LAS PALMAS':         654,
        'USAFA JARDIM PROGRESSO':          656,
        'USAFA PEREQUÊ':                   658,
        'USAFA SANTA CRUZ DOS NAVEGANTES': 660,
        'USAFA SITIO CONCEIÇÃOZINHA':      664,
        'USAFA VILA AUREA':                666,
        'USAFA VILA EDNA':                 668,
        'USAFA VILA RÃ':                   670,
        'USAFA VILA ZILDA':                672,

        // Atenção Básica (UBS)
        'UBS MORRINHOS':                 2123,
        'UBS PAE CARA':                  2124,
        'UBS PERNAMBUCO':                2125,
        'UBS PRAINHA':                   2126,
        'UBS SANTA ROSA':                2129,
        'UBS VILA ALICE':                2127,
        'UBS VILA BAIANA':               2128,

        // Especiais
        'OM30':                          2005,
    };

    // ── Categorias de reserva ───────────────────────────────────────────
    // A revisão carrega a lista completa do GLPI (conforme o Tipo).
    // Esta lista só é usada se esse carregamento falhar.
    const CATEGORY_OPTIONS = [
        { id: 0,   label: '(sem categoria)' },
        { id: 109, label: 'Painel de Senha > Erro' },
        { id: 52,  label: 'Totem > Touch' },
        { id: 51,  label: 'Totem > Som' },
        { id: 110, label: 'Saúde Simples > Instabilidade no Sistema' },
        { id: 136, label: 'Saúde Simples > Cadastro > Profissionais' },
        { id: 137, label: 'Saúde Simples > Cadastro > Configuração de Agenda' },
        { id: 139, label: 'Saúde Simples > Cadastro > Munícipes' },
        { id: 140, label: 'Saúde Simples > Cadastro > Consolidação de Munícipe' },
        { id: 122, label: 'Saúde Simples > Tele Saúde' },
        { id: 382, label: 'SUPORTE N2 > Suporte dúvida' },
        { id: 381, label: 'SUPORTE N2 > Suporte requisição' },
    ];

    // ── "Suporte à:" (pré-chat do Tawk) → tipo e categoria iniciais ─────
    // type: 1 = Incidente, 2 = Requisição
    const SUPORTE_MAP = {
        'Painel de Senha': { type: 1, itilcategories_id: 109 },
        'Saúde Simples':   { type: 2, itilcategories_id: 0   },
    };
    const SUPORTE_DEFAULT = { type: 1, itilcategories_id: 0 };

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 2 — CONSTANTES INTERNAS E ROTEAMENTO
    ════════════════════════════════════════════════════════════════════ */

    const DATA_KEY = 'tawk_glpi_chatdata';
    const STEP_KEY = 'tawk_glpi_step';
    const LAST_CAT_KEY = 'tawk_glpi_lastcat:'; // + "suporte à" normalizado → { type, cat }
    const BATCH_KEY = 'tawk_glpi_batch';        // chats guardados com "+ Juntar"
    const BATCH_MAX_AGE = 12 * 60 * 60 * 1000;  // descarta fila esquecida (12h)
    const LOG = (...a) => console.log('[GLPI]', ...a);

    if (location.hostname === 'dashboard.tawk.to') {
        initTawk();
    } else if (location.hostname === 'suporte.om30.cloud') {
        initGLPI();
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 3 — UTILITÁRIOS
    ════════════════════════════════════════════════════════════════════ */

    // "PAM Rodoviária " → "pam rodoviaria"
    function normalizeKey(s) {
        return (s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
    }

    // "UBS.VILAALICE" → "ubsvilaalice" (pra comparar texto livre do pré-chat)
    function compactKey(s) {
        return normalizeKey(s).replace(/[^a-z0-9]/g, '');
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function isVisible(el) {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    // Texto com quebras de linha preservadas. Não usa innerText: em painéis
    // ocultos (chats em cache) ele perde os <br> e junta as linhas.
    function cleanText(el) {
        if (!el) return '';
        const clone = el.cloneNode(true);
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        clone.querySelectorAll('div, p, li').forEach(b => b.append('\n'));
        return clone.textContent
            .replace(/ /g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // "8:12 AM" / "20:05" → "08:12" / "20:05"
    function to24h(t) {
        const m = (t || '').match(/(\d{1,2}):(\d{2})\s*([AP]\.?M\.?)?/i);
        if (!m) return '';
        let h = parseInt(m[1], 10);
        const ampm = (m[3] || '').replace(/\./g, '').toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${m[2]}`;
    }

    function todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function titleCase(s) {
        const keepUpper = /^(UBS|USAFA|CAPS|PS|PSVC|PAM|UPA|SAMU|ARE|CEO|CEVC|CRFG|CROOF|CRVC|SIAD|SESAU|UNAERP|OM30|AD|I|II|III)$/i;
        return (s || '').toLowerCase().split(/\s+/).map(w =>
            keepUpper.test(w) ? w.toUpperCase()
                : /^(de|da|do|dos|das|e)$/.test(w) ? w
                : w.charAt(0).toUpperCase() + w.slice(1)
        ).join(' ');
    }

    function svgIcon(size) {
        const s = size || 16;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 4 — RESOLVERS
    ════════════════════════════════════════════════════════════════════ */

    // Retorna { key, id } ou null.
    function resolveLocation(unidade) {
        if (!unidade) return null;
        const entries = Object.entries(LOCATION_MAP);

        // 1) exato (tolerante a acento/caixa/espaço)
        const norm = normalizeKey(unidade);
        for (const [key, id] of entries) {
            if (normalizeKey(key) === norm) return { key, id };
        }

        // 2) exato ignorando pontuação ("UBS.VILAALICE" = "UBS VILA ALICE")
        const comp = compactKey(unidade);
        if (!comp) return null;
        for (const [key, id] of entries) {
            if (compactKey(key) === comp) return { key, id };
        }

        // 3) chave contida no texto: escolhe a MAIS LONGA
        //    (evita "CAPS I" ganhar de "CAPS III")
        const contained = entries
            .filter(([key]) => comp.includes(compactKey(key)))
            .sort((a, b) => compactKey(b[0]).length - compactKey(a[0]).length);
        if (contained.length) return { key: contained[0][0], id: contained[0][1] };

        // 4) texto contido na chave ("Palmas" → "USAFA JARDIM LAS PALMAS"), só se único
        if (comp.length >= 4) {
            const partial = entries.filter(([key]) => compactKey(key).includes(comp));
            if (partial.length === 1) return { key: partial[0][0], id: partial[0][1] };
        }

        console.warn('[GLPI] Localização não encontrada no mapa:', unidade);
        return null;
    }

    function resolveSuporte(suporteA) {
        const norm = normalizeKey(suporteA);
        if (norm) {
            for (const [key, val] of Object.entries(SUPORTE_MAP)) {
                if (normalizeKey(key) === norm) return val;
            }
        }
        return SUPORTE_DEFAULT;
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 5 — TAWK.TO: INJEÇÃO DOS BOTÕES
    ════════════════════════════════════════════════════════════════════ */

    function initTawk() {
        setInterval(() => {
            injectInInputHeaders();
            injectInChatHeaders();
            injectInInboxTabBar();
            refreshBatchLabels();
        }, 1000);
    }

    // Header acima da caixa de resposta. Existem duas variações:
    //  - chat ativo:  [Responder | Sussurro] ... [div.tawk-flex-right]
    //  - inbox/ticket: [div.tawk-flex-right  Assignee / Priority]
    function injectInInputHeaders() {
        document.querySelectorAll('.tawk-message-input-header').forEach(header => {
            if (header.querySelector('.glpi-btn') || !isVisible(header)) return;
            // No Inbox, o único header deste tipo é o do formulário "Create Ticket"
            if (header.closest('.tawk-chat-inline-overlay')) return;
            (header.querySelector('.tawk-flex-right') || header).appendChild(makeButtons());
        });
    }

    // Topo do chat (nome do visitante … Popout / Close). Usado quando a caixa
    // de resposta não está visível: chats encerrados no Inbox.
    function injectInChatHeaders() {
        document.querySelectorAll('.tawk-chat-header').forEach(chatHeader => {
            const existing = chatHeader.querySelector('.glpi-btn-wrapper');
            const panel = panelFromInside(chatHeader);
            const hasInputBtns = panel && [...panel.querySelectorAll('.tawk-message-input-header .glpi-btn-wrapper')]
                .some(isVisible);
            if (!panel || hasInputBtns || !isVisible(chatHeader)) {
                if (existing) existing.remove();
                return;
            }
            if (existing) return;
            const row = chatHeader.querySelector(':scope > .tawk-flex.tawk-flex-middle') || chatHeader;
            const actions = row.querySelector(':scope > .tawk-chat-header-actions');
            const wrapper = makeButtons();
            wrapper.style.marginLeft = 'auto';
            if (actions) row.insertBefore(wrapper, actions);
            else row.appendChild(wrapper);
        });
    }

    function makeButtons() {
        const wrapper = document.createElement('div');
        wrapper.className = 'glpi-btn-wrapper';
        wrapper.style.cssText =
            'border-left:1px solid rgba(0,0,0,.15);padding-left:8px;' +
            'display:flex;align-items:center;margin-left:4px;flex:none;';

        const btn = document.createElement('button');
        btn.className = 'glpi-btn';
        btn.type = 'button';
        btn.style.cssText =
            'color:#e53e3e;height:40px;display:flex;align-items:center;gap:6px;' +
            'cursor:pointer;background:none;border:none;padding:0 8px;' +
            'font-size:13px;font-weight:500;white-space:nowrap;';
        btn.innerHTML = svgIcon() + '<span class="glpi-send-label">Enviar para o GLPI</span>';
        btn.addEventListener('click', onClickSend);

        // Guarda este chat para sair no mesmo chamado do próximo envio
        // (ex.: visitante saiu e voltou → dois registros no Tawk)
        const join = document.createElement('button');
        join.className = 'glpi-join-btn';
        join.type = 'button';
        join.title = 'Guarda este chat para ser enviado junto com o próximo "Enviar para o GLPI"';
        join.style.cssText =
            'color:#64748b;height:40px;display:flex;align-items:center;cursor:pointer;' +
            'background:none;border:none;padding:0 8px;font-size:13px;font-weight:500;white-space:nowrap;';
        join.textContent = '+ Juntar';
        join.addEventListener('click', onClickJoin);

        wrapper.append(btn, join);
        return wrapper;
    }

    // Inbox — botão na barra de tabs (Chats / Tickets).
    function injectInInboxTabBar() {
        const ticketsBtn = document.querySelector('button[data-text="Tickets"]');
        if (!ticketsBtn) return;
        const tabsBar = ticketsBtn.closest('.tawk-flex.tawk-flex-1.tawk-flex-middle');
        if (!tabsBar || tabsBar.querySelector('.glpi-btn')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'tawk-flex-center tawk-flex-middle glpi-btn-wrapper';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
            'tawk-button tawk-button-text tawk-button-medium tawk-tab ' +
            'tawk-flex tawk-width-100 tawk-flex-center tawk-flex-middle tawk-tooltip ' +
            'glpi-btn glpi-tab-btn';
        btn.setAttribute('data-text', 'Enviar para o GLPI');
        btn.innerHTML =
            '<div class="tawk-flex tawk-flex-middle tawk-gap-small tawk-tab-content" style="color:#e53e3e;">' +
            svgIcon(20) + '</div>';
        btn.addEventListener('click', onClickSend);
        wrapper.appendChild(btn);
        tabsBar.appendChild(wrapper);
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 6 — TAWK.TO: LOCALIZAR O PAINEL DO CHAT
       Cada conversa aberta é uma subárvore com UMA área de mensagens
       (.tawk-smooth-scroll) e UM card de detalhes (.tawk-contact-details-card).
       Subir a partir do botão até esse nível garante que mensagens e
       sidebar sejam da mesma conversa (vários chats ficam no DOM ao mesmo tempo).
    ════════════════════════════════════════════════════════════════════ */

    function isChatPanel(el) {
        return el.querySelectorAll('.tawk-contact-details-card').length === 1 &&
               el.querySelectorAll('.tawk-smooth-scroll').length === 1;
    }

    function panelFromInside(el) {
        while (el && el !== document.body) {
            if (el.querySelector('.tawk-smooth-scroll') && el.querySelector('.tawk-contact-details-card')) {
                return isChatPanel(el) ? el : null;
            }
            el = el.parentElement;
        }
        return null;
    }

    function findChatPanel(btn) {
        const own = panelFromInside(btn.parentElement);
        if (own) return own;

        // Botão da barra de tabs: fica fora da conversa → pega o painel visível
        const panels = [];
        document.querySelectorAll('.tawk-smooth-scroll').forEach(sc => {
            if (!isVisible(sc)) return;
            const p = panelFromInside(sc);
            if (p && !panels.includes(p)) panels.push(p);
        });
        if (panels.length > 1) console.warn('[GLPI] Mais de um chat visível; usando o primeiro.');
        return panels[0] || null;
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 7 — TAWK.TO: COLETA DE DADOS
    ════════════════════════════════════════════════════════════════════ */

    // Logs de navegação poluem o chamado (podem ser centenas)
    const NOISE_LOG = /^(visitor navigated to|o visitante navegou|visitante navegou)/i;
    const PRECHAT_RE = /^\s*(name|nome)\s*:/i;

    async function onClickSend(event) {
        const btn = event.currentTarget;
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.style.opacity = '0.5';

        try {
            const panel = findChatPanel(btn);
            if (!panel) throw new Error('Não encontrei a conversa aberta. Abra o chat e tente novamente.');
            const current = collectChatData(panel);
            const batch = (await getBatch()).filter(c => c.chatId !== current.chatId);
            const data = mergeChats([...batch, current]);
            LOG('Dados coletados:', data);
            if (!data.messages.some(m => m.kind === 'message')) throw new Error('Nenhuma mensagem encontrada neste chat.');

            await GM_setValue(DATA_KEY, JSON.stringify(data));
            await GM_setValue(STEP_KEY, 'navigate');
            await GM_deleteValue(BATCH_KEY);
            GM_openInTab(`${GLPI_URL}/front/central.php?active_entity=${ENTITY_ID}`, { active: true, insert: true });
        } catch (err) {
            alert('Erro ao coletar dados: ' + err.message);
            console.error('[GLPI]', err);
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerHTML = originalHTML;
        }
    }

    /* ── Fila de chats para juntar ──────────────────────────────────── */

    async function getBatch() {
        let list = [];
        try { list = JSON.parse(await GM_getValue(BATCH_KEY, '[]')) || []; } catch (e) { /* fila corrompida */ }
        return list.filter(c => Date.now() - (c.addedAt || 0) < BATCH_MAX_AGE);
    }

    // Identifica o chat pela 1ª mensagem (ids do Tawk são únicos)
    function chatIdOf(panel) {
        const first = panel.querySelector('.tawk-smooth-scroll [id^="messageId-"], .tawk-smooth-scroll [id^="blockId-"]');
        return first ? first.id : '';
    }

    async function onClickJoin(event) {
        const btn = event.currentTarget;
        try {
            const panel = findChatPanel(btn);
            if (!panel) throw new Error('Não encontrei a conversa aberta.');
            const id = chatIdOf(panel);
            let batch = await getBatch();
            if (batch.some(c => c.chatId === id)) {
                batch = batch.filter(c => c.chatId !== id); // 2º clique tira da fila
            } else {
                const data = collectChatData(panel);
                if (!data.messages.some(m => m.kind === 'message')) throw new Error('Nenhuma mensagem encontrada neste chat.');
                batch.push({ ...data, addedAt: Date.now() });
            }
            await GM_setValue(BATCH_KEY, JSON.stringify(batch));
            refreshBatchLabels();
        } catch (err) {
            alert('Erro ao juntar chat: ' + err.message);
            console.error('[GLPI]', err);
        }
    }

    let refreshing = false;
    async function refreshBatchLabels() {
        if (refreshing) return;
        refreshing = true;
        try {
            const ids = (await getBatch()).map(c => c.chatId);
            document.querySelectorAll('.glpi-btn-wrapper').forEach(w => {
                const join = w.querySelector('.glpi-join-btn');
                const label = w.querySelector('.glpi-send-label');
                if (!join || !label) return;
                const panel = findChatPanel(join);
                const id = panel ? chatIdOf(panel) : '';
                const queued = ids.includes(id);
                const others = ids.filter(x => x !== id).length;
                join.textContent = queued ? '✓ Juntado' : '+ Juntar';
                join.style.color = queued ? '#16a34a' : '#64748b';
                join.title = queued
                    ? 'Este chat irá junto no próximo envio. Clique para remover da fila.'
                    : 'Guarda este chat para ser enviado junto com o próximo "Enviar para o GLPI"';
                label.textContent = others ? `Enviar para o GLPI (+${others} chat${others > 1 ? 's' : ''})` : 'Enviar para o GLPI';
            });
        } finally {
            refreshing = false;
        }
    }

    // Vários chats → um só registro, em ordem de horário, com separadores
    function mergeChats(list) {
        if (list.length === 1) return { ...list[0], chatCount: 1 };
        const sorted = list.slice().sort((a, b) => (a.firstTime || '').localeCompare(b.firstTime || ''));
        const messages = [];
        sorted.forEach((c, i) => {
            messages.push({ kind: 'system', text: `— Chat ${i + 1} de ${sorted.length}${c.firstTime ? ` (início ${c.firstTime})` : ''} —` });
            messages.push(...c.messages);
        });
        const pick = k => (sorted.find(c => c[k]) || {})[k] || '';
        // Em campos repetidos, o 1º chat prevalece
        const earliestWins = k => Object.assign({}, ...sorted.slice().reverse().map(c => c[k] || {}));
        return {
            messages,
            prechat:      earliestWins('prechat'),
            attrs:        earliestWins('attrs'),
            unidade:      pick('unidade'),
            unidadeLivre: pick('unidadeLivre'),
            suporteA:     pick('suporteA'),
            visitante:    pick('visitante'),
            date:         sorted[0].date,
            firstTime:    sorted[0].firstTime,
            chatCount:    sorted.length,
        };
    }

    function collectChatData(panel) {
        const scroll = panel.querySelector('.tawk-smooth-scroll');
        const messages = []; // { kind: 'system'|'message', name, outgoing, time, text, files[] }
        let prechat = null;

        scroll.querySelectorAll('[id^="blockId-"]').forEach(block => {
            const logEl = block.querySelector('.tawk-log-message-text');
            if (logEl) {
                const text = cleanText(logEl);
                if (text && !NOISE_LOG.test(text)) messages.push({ kind: 'system', text });
                return;
            }

            const nameEl = block.querySelector('.tawk-text-grey-2.tawk-text-regular-1');
            const rawName = cleanText(nameEl).replace(/\s*\((me|eu)\)\s*$/i, '');

            // Um bloco = várias mensagens seguidas da mesma pessoa
            block.querySelectorAll('[id^="messageId-"]').forEach(bubble => {
                const outgoing = !!bubble.querySelector('.tawk-outgoing-chat');
                const msgEl  = bubble.querySelector('.tawk-message');
                const text   = cleanText(msgEl);
                const time   = to24h(cleanText(bubble.querySelector('.tawk-time')));
                const files  = [];
                bubble.querySelectorAll('.tawk-files-container img, .tawk-files-container a[href]').forEach(f => {
                    const url = f.src || f.href;
                    if (url && !files.some(x => x.url === url)) {
                        files.push({ url, name: f.getAttribute('name') || cleanText(f) || 'arquivo' });
                    }
                });
                if (!text && !files.length) return;

                const name = rawName || (outgoing ? 'Atendente' : 'Visitante');
                if (!outgoing && !prechat && PRECHAT_RE.test(text)) {
                    prechat = parsePrechat(text);
                    prechat._time = time;
                    return;
                }
                messages.push({ kind: 'message', name, outgoing, time, text, files });
            });
        });

        const attrs   = readSidebarAttributes(panel);
        const unidadeSidebar = findUnidade(attrs);
        // Abertura = primeira mensagem do chat (o pré-chat pode vir depois)
        const firstTime = [prechat && prechat._time, (messages.find(m => m.kind === 'message') || {}).time]
            .filter(Boolean).sort()[0] || '';

        return {
            chatId: chatIdOf(panel),
            messages,
            prechat: prechat || {},
            attrs,
            unidade: unidadeSidebar || '',
            unidadeLivre: prechat ? (prechat['Unidade'] || '') : '',
            suporteA: prechat ? (prechat['Suporte à'] || '') : '',
            visitante: prechat ? (prechat['Name'] || prechat['Nome'] || '') : '',
            date: todayISO(),
            firstTime,
        };
    }

    // "Name : luiza\nUnidade : UBS.VILAALICE\nSuporte à: : Painel de Senha"
    // → { Name: 'luiza', Unidade: 'UBS.VILAALICE', 'Suporte à': 'Painel de Senha' }
    function parsePrechat(text) {
        const out = {};
        text.split(/\r?\n/).forEach(line => {
            const m = line.match(/^(.+?)\s+:\s*(.*)$/);
            if (m) out[m[1].replace(/:\s*$/, '').trim()] = m[2].trim();
        });
        return out;
    }

    // Campos custom da sidebar:
    //   <form><p for="customAttributes.xxx"><span>LABEL</span></p>
    //         ... <div class="tawk-text-truncate"><span>VALOR</span></div></form>
    function readSidebarAttributes(panel) {
        const card = panel.querySelector('.tawk-contact-details-card');
        const attrs = {};
        if (!card) return attrs;
        card.querySelectorAll('form').forEach(form => {
            const labelEl = form.querySelector('p[for^="customAttributes."] span, p[for^="customAttributes."]');
            const valueEl = form.querySelector('.tawk-text-truncate');
            const label = cleanText(labelEl);
            const value = cleanText(valueEl);
            if (label && value) attrs[label] = value;
        });
        return attrs;
    }

    function findUnidade(attrs) {
        const cats = UNIDADE_CATEGORIES.map(normalizeKey);
        for (const [label, value] of Object.entries(attrs)) {
            if (cats.includes(normalizeKey(label))) return value;
        }
        return '';
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 8 — GLPI: ROTEAMENTO
    ════════════════════════════════════════════════════════════════════ */

    async function initGLPI() {
        const step = await GM_getValue(STEP_KEY, '');
        if (!step) return;
        const path = location.pathname;

        // 1º: central.php?active_entity=… troca a entidade ativa; depois vai pro formulário
        if (step === 'navigate' && path.endsWith('/front/central.php')) {
            await GM_setValue(STEP_KEY, 'fill');
            location.replace(`${GLPI_URL}/front/ticket.form.php`);
            return;
        }

        // 2º: formulário de novo chamado → abre a revisão
        if (step === 'fill' && path.endsWith('/front/ticket.form.php') && !new URLSearchParams(location.search).get('id')) {
            const raw = await GM_getValue(DATA_KEY, '');
            if (!raw) { await GM_deleteValue(STEP_KEY); return; }
            await showReviewModal(JSON.parse(raw));
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 9 — GLPI: REVISÃO ANTES DE ENVIAR
    ════════════════════════════════════════════════════════════════════ */

    async function showReviewModal(data) {
        const loc = resolveLocation(data.unidade) || resolveLocation(data.unidadeLivre);
        const lastCatKey = LAST_CAT_KEY + normalizeKey(data.suporteA);
        let remembered = null;
        try { remembered = JSON.parse(await GM_getValue(lastCatKey, 'null')); } catch (e) { /* ignora */ }
        const suporte = remembered
            ? { type: Number(remembered.type), itilcategories_id: Number(remembered.cat) }
            : resolveSuporte(data.suporteA);
        const unidadeTitulo = loc ? titleCase(loc.key) : (data.unidade || data.unidadeLivre);
        const defaultTitle = [data.suporteA || 'Suporte via Chat', unidadeTitulo].filter(Boolean).join(' - ');

        const locOptions = Object.entries(LOCATION_MAP)
            .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
            .map(([k, id]) => `<option value="${id}" ${loc && loc.id === id ? 'selected' : ''}>${escapeHtml(k)} (${id})</option>`)
            .join('');
        const statusOptions = [[1, 'Novo'], [2, 'Em atendimento'], [4, 'Pendente'], [5, 'Solucionado'], [6, 'Fechado']]
            .map(([v, l]) => `<option value="${v}" ${v === STATUS_DEFAULT ? 'selected' : ''}>${l}</option>`).join('');

        const unidadeInfo = data.unidade
            ? `Sidebar: <b>${escapeHtml(data.unidade)}</b>`
            : `<span style="color:#d63939">Sem unidade na sidebar</span>` +
              (data.unidadeLivre ? ` · pré-chat: <b>${escapeHtml(data.unidadeLivre)}</b>` : '');

        const overlay = document.createElement('div');
        overlay.id = 'glpi-tawk-review';
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);' +
            'display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:32px 16px;';
        overlay.innerHTML = `
            <div class="card" style="width:100%;max-width:760px;box-shadow:0 10px 40px rgba(0,0,0,.3)">
              <div class="card-header"><h3 class="card-title">Tawk → GLPI: revisar chamado</h3></div>
              <div class="card-body">
                <div class="mb-3">
                  <label class="form-label">Título</label>
                  <input id="gt-title" class="form-control" value="${escapeHtml(defaultTitle)}">
                </div>
                <div class="row g-3 mb-3">
                  <div class="col-md-6">
                    <label class="form-label">Abertura</label>
                    <input id="gt-date" type="datetime-local" class="form-control"
                           value="${data.date}T${data.firstTime || '08:00'}">
                  </div>
                  <div class="col-md-3">
                    <label class="form-label">Tipo</label>
                    <select id="gt-type" class="form-select">
                      <option value="1" ${suporte.type === 1 ? 'selected' : ''}>Incidente</option>
                      <option value="2" ${suporte.type === 2 ? 'selected' : ''}>Requisição</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label">Status</label>
                    <select id="gt-status" class="form-select">${statusOptions}</select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Categoria</label>
                    <input id="gt-cat-filter" class="form-control form-control-sm mb-1" placeholder="Filtrar (ex: prontuário)">
                    <select id="gt-cat" class="form-select"></select>
                    <small class="form-hint">Suporte à: ${escapeHtml(data.suporteA || '—')} · <span id="gt-cat-hint"></span></small>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Localização <span class="required">*</span></label>
                    <select id="gt-loc" class="form-select">
                      <option value="0" ${loc ? '' : 'selected'}>----- escolha -----</option>${locOptions}
                    </select>
                    <small class="form-hint">${unidadeInfo}</small>
                  </div>
                </div>
                <label class="form-label">Conteúdo (${data.messages.filter(m => m.kind === 'message').length} mensagens${data.chatCount > 1 ? `, ${data.chatCount} chats juntados` : ''})</label>
                <div style="max-height:260px;overflow:auto;border:1px solid rgba(0,0,0,.15);border-radius:4px;padding:8px;font-size:12px">
                  ${buildContent(data)}
                </div>
                <div id="gt-error" class="alert alert-danger mt-3" style="display:none"></div>
              </div>
              <div class="card-footer d-flex gap-2 justify-content-end">
                <button id="gt-cancel" type="button" class="btn btn-outline-secondary">Cancelar</button>
                <button id="gt-submit" type="button" class="btn btn-primary">Criar chamado</button>
              </div>
            </div>`;
        document.body.appendChild(overlay);

        const $ = id => overlay.querySelector('#' + id);

        // ── Categoria: lista do GLPI + filtro ────────────────────────────
        const NO_CAT = { id: 0, label: '(sem categoria)' };
        let categories = CATEGORY_OPTIONS.slice();
        let wantedCat = String(suporte.itilcategories_id);

        function renderCats() {
            const q = normalizeKey($('gt-cat-filter').value);
            const sel = $('gt-cat');
            const list = categories.filter(c =>
                c.id === 0 || !q || normalizeKey(c.label).includes(q) || String(c.id) === q);
            sel.innerHTML = list.map(c =>
                `<option value="${c.id}">${escapeHtml(c.label)}${c.id ? ` (${c.id})` : ''}</option>`).join('');
            if (list.some(c => String(c.id) === wantedCat) && !(q && wantedCat === '0')) {
                sel.value = wantedCat;
            } else if (q && list.length > 1) {
                sel.value = String(list.find(c => c.id !== 0).id); // 1º resultado do filtro
            } else {
                sel.value = '0';
            }
        }

        async function reloadCats() {
            const hint = $('gt-cat-hint');
            hint.textContent = 'carregando categorias do GLPI…';
            try {
                const cats = await loadCategories($('gt-type').value);
                if (!cats.length) throw new Error('lista vazia');
                categories = [NO_CAT, ...cats];
                hint.textContent = `${cats.length} categorias`;
            } catch (err) {
                console.warn('[GLPI] Falha ao carregar categorias:', err);
                categories = CATEGORY_OPTIONS.slice();
                hint.textContent = 'falha ao carregar do GLPI, usando a lista do script';
            }
            renderCats();
        }

        $('gt-cat-filter').addEventListener('input', renderCats);
        $('gt-cat').addEventListener('change', () => { wantedCat = $('gt-cat').value; });
        $('gt-type').addEventListener('change', reloadCats);
        renderCats();
        reloadCats();

        $('gt-cancel').addEventListener('click', async () => {
            await GM_deleteValue(DATA_KEY);
            await GM_deleteValue(STEP_KEY);
            overlay.remove();
        });
        $('gt-submit').addEventListener('click', async () => {
            const errBox = $('gt-error');
            errBox.style.display = 'none';
            const fields = {
                title:      $('gt-title').value.trim(),
                date:       $('gt-date').value.replace('T', ' ') + ':00',
                type:       $('gt-type').value,
                status:     $('gt-status').value,
                categoryId: $('gt-cat').value,
                locationId: $('gt-loc').value,
            };
            if (!fields.title)              return showError('Informe o título.');
            if (fields.locationId === '0')  return showError('Escolha a localização (obrigatória no GLPI).');

            const btn = $('gt-submit');
            btn.disabled = true;
            btn.textContent = 'Enviando…';
            try {
                const id = await submitTicket(data, fields);
                await GM_setValue(lastCatKey, JSON.stringify({ type: fields.type, cat: fields.categoryId }));
                await GM_deleteValue(DATA_KEY);
                await GM_deleteValue(STEP_KEY);
                location.href = `${GLPI_URL}/front/ticket.form.php?id=${id}`;
            } catch (err) {
                console.error('[GLPI]', err);
                showError(err.message);
                btn.disabled = false;
                btn.textContent = 'Criar chamado';
            }

            function showError(msg) {
                errBox.textContent = msg;
                errBox.style.display = '';
            }
        });
    }

    // Mesma lista do campo Categoria do GLPI. O "condition" do dropdown muda
    // com o Tipo (Incidente/Requisição), por isso os parâmetros são lidos do
    // formulário renderizado para o tipo escolhido.
    async function loadCategories(type) {
        const ajaxHeaders = { 'X-Requested-With': 'XMLHttpRequest' };
        const qs = new URLSearchParams({
            _glpi_tab: 'Ticket$main', _target: '/front/ticket.form.php', _itemtype: 'Ticket',
            id: '0', entities_id: String(ENTITY_ID), type: String(type),
        });
        const tabHtml = await (await fetch(`${GLPI_URL}/ajax/common.tabs.php?${qs}`,
            { credentials: 'include', headers: ajaxHeaders })).text();
        const params = (tabHtml.match(/params_dropdown_itilcategories_id\d+\s*=\s*\{([\s\S]*?)\};/) || [])[1] || '';
        const condition = (params.match(/condition:\s*"([^"]*)"/) || [])[1] || '';
        const idorToken = (params.match(/_idor_token:\s*"([^"]*)"/) || [])[1];
        if (!idorToken) throw new Error('parâmetros do dropdown de categoria não encontrados');

        const csrf = document.querySelector('meta[property="glpi:csrf_token"]')?.content || '';
        const PAGE = 100;
        const out = new Map();
        for (let page = 1; page <= 30; page++) {
            const body = new URLSearchParams({
                multiple: '0', display_emptychoice: '0', itemtype: 'ITILCategory',
                entity_restrict: String(ENTITY_ID), permit_select_parent: '0',
                _idor_token: idorToken, searchText: '', page_limit: String(PAGE), page: String(page),
            });
            if (condition) body.set('condition', condition);
            const res = await fetch(`${GLPI_URL}/ajax/getDropdownValue.php`, {
                method: 'POST', credentials: 'include', body,
                headers: { ...ajaxHeaders, 'X-Glpi-Csrf-Token': csrf },
            });
            const json = await res.json();
            let n = 0;
            (function walk(items) {
                items.forEach(it => {
                    if (it.children) return walk(it.children);
                    n++;
                    // "disabled" = nó pai (não selecionável com permit_select_parent=0)
                    if (it.id && !it.disabled) out.set(it.id, it.title || it.selection_text || it.text);
                });
            })(json.results || []);
            if ((json.count ?? n) < PAGE) break;
        }
        return [...out].map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 10 — GLPI: SUBMISSÃO
       Campos espelham o POST real capturado do formulário (GLPI 10).
    ════════════════════════════════════════════════════════════════════ */

    async function submitTicket(data, f) {
        // Busca o formulário de novo: token CSRF novo (é de uso único)
        // e o _actors padrão com o usuário logado. O ticket.form.php não traz
        // o formulário no HTML; ele vem desta aba carregada via AJAX.
        const qs = new URLSearchParams({
            _glpi_tab: 'Ticket$main', _target: '/front/ticket.form.php', _itemtype: 'Ticket',
            id: '0', entities_id: String(ENTITY_ID),
        });
        const formHtml = await (await fetch(`${GLPI_URL}/ajax/common.tabs.php?${qs}`, {
            credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })).text();
        const formDoc  = new DOMParser().parseFromString(formHtml, 'text/html');
        const csrf     = formDoc.querySelector('#itil-form input[name="_glpi_csrf_token"], input[name="_glpi_csrf_token"]')?.value;
        if (!csrf) throw new Error('Token CSRF não encontrado (sessão do GLPI expirou?).');

        const actors = buildActors(formDoc);

        const form = new FormData();
        form.append('_glpi_csrf_token',                 csrf);
        form.append('_skip_default_actor',              '1');
        form.append('_tickettemplate',                  '1');
        form.append('_predefined_fields',               'W10=');
        form.append('name',                             f.title);
        form.append('content',                          buildContent(data));
        form.append('entities_id',                      String(ENTITY_ID));
        form.append('date',                             f.date);
        form.append('solvedate',                        '');
        form.append('type',                             f.type);
        form.append('itilcategories_id',                f.categoryId);
        form.append('status',                           f.status);
        form.append('requesttypes_id',                  '0');
        form.append('urgency',                          '3');
        form.append('impact',                           '3');
        form.append('priority',                         '3');
        form.append('locations_id',                     f.locationId);
        form.append('actiontime',                       '0');
        form.append('validatortype',                    '0');
        form.append('_add_validation',                  '0');
        form.append('_actors',                          JSON.stringify(actors));
        form.append('_notifications_actorname',         '');
        form.append('_notifications_actortype',         '');
        form.append('_notifications_actorindex',        '');
        form.append('_notifications_alternative_email', '');
        form.append('my_items',                         '');
        form.append('itemtype',                         '0');
        form.append('items_id',                         '0');
        form.append('time_to_own',                      '');
        form.append('slas_id_tto',                      '0');
        form.append('time_to_resolve',                  '');
        form.append('slas_id_ttr',                      '0');
        form.append('internal_time_to_own',             '');
        form.append('olas_id_tto',                      '0');
        form.append('internal_time_to_resolve',         '');
        form.append('olas_id_ttr',                      '0');
        form.append('_link[tickets_id_1]',              '0');
        form.append('_link[link]',                      '1');
        form.append('_link[tickets_id_2]',              '0');
        // Sem "add" o GLPI só re-renderiza o formulário (é o que acontece
        // quando se troca a categoria) e NÃO cria o chamado.
        form.append('add',                              '');

        LOG('Enviando chamado:', f, actors);
        const res  = await fetch(`${GLPI_URL}/front/ticket.form.php`, { method: 'POST', body: form, credentials: 'include' });
        const html = await res.text();

        // Sucesso: 302 → formulário com toast "Item adicionado com sucesso: <a href=...?id=N>"
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        const link = [...doc.querySelectorAll('.toast-body a[href*="ticket.form.php?id="]')].pop();
        const id   = link && link.getAttribute('href').match(/id=(\d+)/)[1];
        if (res.redirected && id) {
            LOG('Chamado criado:', id);
            return id;
        }

        const msg = [...doc.querySelectorAll('.toast-body')].map(cleanText).filter(Boolean).join(' | ');
        throw new Error(`O GLPI não criou o chamado (HTTP ${res.status}). ${msg || 'Veja o console para detalhes.'}`);
    }

    // Requerente = usuário logado (requerente padrão do formulário);
    // Atribuído  = mesmo usuário + grupo.
    function buildActors(formDoc) {
        let actors = { requester: [], observer: [], assign: [] };
        // O input #_actors chega vazio no HTML (o JS do GLPI o preenche depois),
        // então o requerente é lido do <option> selecionado do campo Requerente.
        try {
            actors = Object.assign(actors, JSON.parse(formDoc.querySelector('#_actors')?.value || '{}'));
        } catch (e) { /* segue para o <option> */ }
        if (!actors.requester.length) {
            formDoc.querySelectorAll('select[data-actor-type="requester"] option[selected]').forEach(o => {
                actors.requester.push({
                    itemtype: o.dataset.itemtype,
                    items_id: o.dataset.itemsId,
                    use_notification: Number(o.dataset.useNotification || 0),
                    alternative_email: o.dataset.alternativeEmail || '',
                    default_email: o.dataset.defaultEmail || '',
                });
            });
        }
        const me = actors.requester.find(a => a.itemtype === 'User');
        if (!me) throw new Error('Não identifiquei o usuário logado no GLPI.');

        actors.assign = [
            {
                itemtype: 'User',
                items_id: Number(me.items_id),
                use_notification: 1,
                default_email: me.default_email || '',
                alternative_email: '',
            },
            {
                itemtype: 'Group',
                items_id: GROUP_ASSIGN_ID,
                use_notification: false,
                default_email: '',
                alternative_email: '',
            },
        ];
        return actors;
    }

    function buildContent(data) {
        const p  = data.prechat || {};
        const info = [
            ['Visitante',  data.visitante],
            ['Telefone',   p['Telefone']],
            ['Unidade',    data.unidade || data.unidadeLivre],
            ['Suporte à',  data.suporteA],
        ].filter(([, v]) => v);
        Object.entries(data.attrs || {}).forEach(([k, v]) => {
            if (!info.some(([, val]) => val === v)) info.push([k, v]);
        });

        let html = '<p><strong>Atendimento via chat (Tawk.to)</strong></p>';
        if (info.length) {
            html += '<p>' + info.map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join('<br>') + '</p>';
        }
        html += '<hr>';
        data.messages.forEach(m => {
            if (m.kind === 'system') {
                html += `<p><em>${escapeHtml(m.text)}</em></p>`;
                return;
            }
            const text = escapeHtml(m.text).replace(/\n/g, '<br>');
            const files = (m.files || []).map(f =>
                `<a href="${escapeHtml(f.url)}" target="_blank">📎 ${escapeHtml(f.name)}</a>`).join('<br>');
            html += `<p><strong>[${escapeHtml(m.time)}] ${escapeHtml(m.name)}:</strong> ` +
                    [text, files].filter(Boolean).join('<br>') + '</p>';
        });
        return html;
    }

})();
