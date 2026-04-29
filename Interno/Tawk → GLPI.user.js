// ==UserScript==
// @name         Tawk.to → GLPI Sender
// @namespace    http://tampermonkey.net/
// @version      1.0
// @uploadURL    https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Interno/Tawk%20%E2%86%92%20GLPI.user.js
// @downloadURL  https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Interno/Tawk%20%E2%86%92%20GLPI.user.js
// @description  Envia chat do Tawk.to para o GLPI automaticamente
// @author       -
// @match        https://dashboard.tawk.to/*
// @match        https://suporte.om30.cloud/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// ==/UserScript==

(function () {
    'use strict';

    /* ══════════════════════════════════════════════
       ⚙️  CONFIGURAÇÃO — edite aqui conforme necessário
    ══════════════════════════════════════════════ */

    const ENTITY_ID = 567;

    const GROUP_ASSIGN = {
        items_id: '9',  // ID do grupo "Operação > Sistemas Guarujá"
    };

    // Mapa: nome exibido no GLPI → dados do usuário
    // Adicione entradas conforme necessário
    const USER_MAP = {
        'Leonardo Crispim': { items_id: '304', email: 'leonardo.oliveira@om30.com.br' },
        'Pedro Justino Sampaio Andrade': {items_id: '203', email: 'pedro.andrade@om30.com.br'},
        'Tauana Matos': {items_id: '672', email: 'tauana.matos@om30.com.br'},
        'Jorge Cruz': {items_id: '64', email: 'jorge.cruz@om30.com.br'}
        // 'Outro Nome':    { items_id: '999', email: 'outro@om30.com.br' },
    };

    // Mapa: texto da "Unidade" no Tawk → locations_id no GLPI
    // Adicione entradas conforme necessário
    const LOCATION_MAP = {
        'OM30': 0, // substitua pelo ID real de cada unidade
        'USAFA Perequê': 658,
        'SESAU': 641,
        'ARE': 567,
        'CAPS AD II': 2100,
        'CAPS II': 2101,
        'CAPS III': 2102,
        'CAPS I': 2103,
        'CASA SER': 2880,
        'CEO': 2104,
        'CEVC': 2727,
        'CRFG': 2105,
        'CRVC': 2106,
        'CROOF': 2107,
        'CONSULTORIO NA RUA': 2108,
        'FARMACIA - JAYRO GRACIOLA': 2109,
        'FARMACIA - VC': 2110,
        'FARMACIA - VILA JULIA': 2111,
        'CASA ROSA': 2112,
        'PSVC': 2113,
        'PS PEREQUÊ': 2114,
        'PAM RODOVIÁRIA': 2115,
        'PS - SANTA CRUZ DOS NAVEGANTES': 2116,
        'RESIDENCIA TERAPEUTICA': 2117,
        'SAMU': 2118,
        'CENTRAL DE REGULAÇÃO': 2119,
        'TRANSPORTE SANITÁRIO': 2120,
        'VIGILÂNCIA SANITARIA E EPIDEMIOLÓGICA': 2121,
        'SIAD': 2122,
        'UBS MORRINHOS': 2123,
        'UBS PAE CARA': 2124,
        'UBS PERNAMBUCO': 2125,
        'UBS PRAINHA': 2126,
        'UBS VILA ALICE': 2127,
        'UBS VILA BAIANA': 2128,
        'UNAERP': 2728,
        'UBS SANTA ROSA': 2129,
        'DOCINHOS': 2130,
        'WILLIAN ROCHA': 2131,
        'ZOONOSES': 2132,
        'UPA ENSEADA': 2133,
        'USAFA CIDADE ATLANTICA': 644,
        'USAFA JARDIM BOA ESPERANÇA': 646,
        'USAFA JARDIM BRASIL': 658,
        'USAFA JARDIM CONCEIÇÃOZINHA': 650,
        'USAFA JARDIM DOS PASSAROS': 652,
        'USAFA JARDIM LAS PALMAS': 654,
        'USAFA JARDIM PROGRESSO': 656,
        'USAFA SANTA CRUZ DOS NAVEGANTES': 660,
        'USAFA SITIO CONCEIÇÃOZINHA': 664,
        'USAFA VILA AUREA': 666,
        'USAFA VILA RÃ': 670,
        'USAFA VILA ZILDA': 672,
        // 'Nome Unidade': 123,
    };

    /* ══════════════════════════════════════════════
       CONSTANTES INTERNAS
    ══════════════════════════════════════════════ */
    const DATA_KEY = 'tawk_glpi_chatdata';
    const STEP_KEY = 'tawk_glpi_step';

    /* ══════════════════════════════════════════════
       ROTEAMENTO
    ══════════════════════════════════════════════ */
    if (location.hostname === 'dashboard.tawk.to') {
        initTawk();
    } else if (location.hostname === 'suporte.om30.cloud') {
        initGLPI();
    }

    /* ══════════════════════════════════════════════
       TAWK.TO
    ══════════════════════════════════════════════ */
    function initTawk() {
        setInterval(tryInjectBtn, 1000);
    }

    function tryInjectBtn() {
        if (document.getElementById('glpi-btn')) return;
        const header = findMsgInputHeader();
        if (!header) return;
        const rightDiv = header.querySelector('.tawk-flex-right.tawk-flex-middle, .tawk-flex-1.tawk-flex-right');
        injectBtn(rightDiv || header);
    }

    function findMsgInputHeader() {
        const byClass = document.querySelector('.tawk-message-input-header');
        if (byClass) return byClass;

        const smartReply = document.querySelector('.tawk-smart-reply');
        if (smartReply) {
            let el = smartReply;
            for (let i = 0; i < 5; i++) {
                el = el.parentElement;
                if (!el) break;
                if (el.classList.contains('tawk-message-input-header')) return el;
            }
            if (smartReply.parentElement?.parentElement) return smartReply.parentElement.parentElement;
        }
        return null;
    }

    function injectBtn(container) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText =
            'border-left:1px solid rgba(0,0,0,.15);padding-left:8px;' +
            'display:flex;align-items:center;margin-left:4px;';

        const btn = document.createElement('button');
        btn.id = 'glpi-btn';
        btn.type = 'button';
        btn.style.cssText =
            'color:#e53e3e;height:40px;display:flex;align-items:center;gap:6px;' +
            'cursor:pointer;background:none;border:none;padding:0 8px;' +
            'font-size:13px;font-weight:500;white-space:nowrap;';
        btn.innerHTML = svgIcon() + 'Enviar para o GLPI';
        btn.addEventListener('click', onClickSend);

        wrapper.appendChild(btn);
        container.appendChild(wrapper);
        console.log('[GLPI] Botão injetado com sucesso!');
    }

    function svgIcon() {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
            'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
            '<polyline points="14 2 14 8 20 8"></polyline></svg>';
    }

    async function onClickSend() {
        const btn = document.getElementById('glpi-btn');
        if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.textContent = 'Coletando…'; }

        try {
            const data = collectChatData();
            console.log('[GLPI] Dados coletados:', data);
            await GM_setValue(DATA_KEY, JSON.stringify(data));
            await GM_setValue(STEP_KEY, 'navigate');
            GM_openInTab('https://suporte.om30.cloud/front/central.php?active_entity=' + ENTITY_ID, {
                active: true, insert: true
            });
        } catch (err) {
            alert('Erro ao coletar dados: ' + err.message);
            console.error('[GLPI]', err);
        }

        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = svgIcon() + 'Enviar para o GLPI'; }
    }

    function collectChatData() {
        let chatText = '';
        let firstTime = '';

        document.querySelectorAll('.tawk-smooth-scroll').forEach(container => {
            const blocks = container.querySelectorAll('[id^="blockId-"]');
            if (!blocks.length) return;
            blocks.forEach(block => {
                const logEl = block.querySelector('.tawk-log-message-text');
                if (logEl) { chatText += `[Sistema] ${logEl.textContent.trim()}\n`; return; }

                const nameEl = block.querySelector('.tawk-text-grey-2.tawk-text-regular-1');
                const msgEl  = block.querySelector('.tawk-message');
                const timeEl = block.querySelector('.tawk-time');
                if (msgEl) {
                    const name = nameEl ? nameEl.textContent.trim() : 'Visitante';
                    const time = timeEl ? timeEl.textContent.trim() : '';
                    if (!firstTime && time) firstTime = time;
                    chatText += `[${time}] ${name}: ${(msgEl.innerText || msgEl.textContent).trim()}\n`;
                }
            });
        });

        // ── Unidade: seletor corrigido ──
        let unidade = '';
        const unidadeSel =
            '#active-chats > div > div > div > div > div ' +
            '> div.resizable-component.tawk-border-default-left.tawk-flex.tawk-flex-none ' +
            '> div.tawk-flex.tawk-overflow-hidden.tawk-flex-column.tawk-padding-remove.' +
            'tawk-flex-1.tawk-min-width-1.tawk-sidebar-card ' +
            '> div.tawk-flex-1.tawk-overflow-hidden.tawk-height-100.tawk-padding-vertical ' +
            '> div:nth-child(1) > div ' +
            '> div.tawk-card.tawk-card-small.tawk-card-flat.tawk-flex-none.tawk-flex.' +
            'tawk-flex-column.tawk-padding-bottom.tawk-padding-remove-left.' +
            'tawk-padding-remove-right.tawk-contact-details-card.tawk-padding-remove-bottom ' +
            '> div > div > div.tawk-tabs-content.tawk-flex-1 > div > div.tawk-flex-1 ' +
            '> form:nth-child(5) > div > div.tawk-flex-1.tawk-flex.tawk-flex-middle > div > div';

        const unidadeEl = document.querySelector(unidadeSel);
        if (unidadeEl) {
            // Pega o texto do <span> filho, ou o textContent direto
            const span = unidadeEl.querySelector('span');
            unidade = (span || unidadeEl).textContent.trim();
            console.log('[GLPI] Unidade encontrada:', unidade);
        }

        // Fallback: extrai do texto do chat
        if (!unidade) {
            const m = chatText.match(/Unidade\s*:\s*([^\n\r]+)/i);
            if (m) unidade = m[1].trim();
            if (unidade) console.log('[GLPI] Unidade via fallback do chat:', unidade);
        }

        if (!unidade) console.warn('[GLPI] Unidade não encontrada!');

        return { chatText, firstTime, unidade, date: todayStr() };
    }

    function todayStr() {
        const d  = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
    }

    /* ══════════════════════════════════════════════
       GLPI
    ══════════════════════════════════════════════ */
    async function initGLPI() {
        const step = await GM_getValue(STEP_KEY, '');
        if (!step) return;

        const path = location.pathname;

        if (path.includes('central.php') && step === 'navigate') {
            await GM_setValue(STEP_KEY, 'fill');
            window.addEventListener('load', () => {
                location.href = 'https://suporte.om30.cloud/front/ticket.form.php';
            });
            return;
        }

        if (path.includes('ticket.form.php') && step === 'fill') {
            window.addEventListener('load', async () => {
                await sleep(1500);
                const raw = await GM_getValue(DATA_KEY, '');
                if (!raw) return;
                const data = JSON.parse(raw);
                await submitTicket(data);
                await GM_deleteValue(DATA_KEY);
                await GM_deleteValue(STEP_KEY);
            });
        }
    }

    /* ══════════════════════════════════════════════
       SUBMISSÃO DIRETA VIA POST
    ══════════════════════════════════════════════ */
    async function submitTicket(data) {
        const csrfToken = getCsrfToken();
        if (!csrfToken) {
            alert('[GLPI] CSRF token não encontrado. Tente recarregar a página.');
            return;
        }

        const loggedUserName = getLoggedUserName();
        const loggedUser     = resolveUser(loggedUserName);
        const locationsId    = resolveLocation(data.unidade);
        const actors         = buildActors(loggedUser);
        const title          = buildTitle(data.chatText);
        const content        = buildContent(data.chatText);
        const glpiDate       = buildGlpiDate(data.date, data.firstTime);

        console.log('[GLPI] Enviando ticket...', { title, glpiDate, locationsId, actors });

        const form = new FormData();
        form.append('_glpi_csrf_token',                '');  // será sobrescrito abaixo
        form.append('_skip_default_actor',              '1');
        form.append('_tickettemplate',                  '1');
        form.append('_predefined_fields',               'W10=');
        form.append('name',                             title);
        form.append('content',                          content);
        form.append('entities_id',                      String(ENTITY_ID));
        form.append('date',                             glpiDate);
        form.append('type',                             '1');
        form.append('itilcategories_id',                '0');
        form.append('status',                           '5');  // Solucionado
        form.append('requesttypes_id',                  '0');
        form.append('urgency',                          '3');
        form.append('impact',                           '3');
        form.append('priority',                         '3');
        form.append('locations_id',                     String(locationsId));
        form.append('actiontime',                       '0');
        form.append('validatortype',                    '0');
        form.append('_add_validation',                  '0');
        form.append('_actors',                          JSON.stringify(actors));
        form.append('_notifications_actorname',         '');
        form.append('_notifications_actortype',         '');
        form.append('_notifications_actorindex',        '');
        form.append('_notifications_alternative_email', '');
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

        // Sobrescreve o CSRF token com o valor real (append sobrescrito pelo set)
        form.set('_glpi_csrf_token', csrfToken);

        const response = await fetch('https://suporte.om30.cloud/front/ticket.form.php', {
            method: 'POST',
            body: form,
            credentials: 'include'
        });

        if (response.ok) {
            console.log('[GLPI] Ticket criado! Redirecionando para:', response.url);
            location.href = response.url;
        } else {
            alert('[GLPI] Erro ao criar ticket: HTTP ' + response.status);
        }
    }

    /* ── Helpers ── */

    function getCsrfToken() {
        const hidden = document.querySelector('input[name="_glpi_csrf_token"]');
        if (hidden?.value) return hidden.value;
        if (window.CFG_GLPI?.csrf_token) return window.CFG_GLPI.csrf_token;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');
        return null;
    }

    function getLoggedUserName() {
        const el = document.querySelector(
            'body > div.page > aside > div > div.d-lg-none > div > ' +
            'div.navbar-nav.flex-row.order-md-last.user-menu > div > div > h6'
        );
        return el ? el.textContent.trim() : '';
    }

    function resolveUser(name) {
        if (!name) return null;
        if (USER_MAP[name]) return USER_MAP[name];
        const lower = name.toLowerCase();
        for (const [key, val] of Object.entries(USER_MAP)) {
            if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return val;
        }
        console.warn('[GLPI] Usuário não encontrado no mapa:', name);
        return null;
    }

    function resolveLocation(unidade) {
        if (!unidade) return 0;
        if (LOCATION_MAP[unidade] !== undefined) return LOCATION_MAP[unidade];
        const lower = unidade.toLowerCase();
        for (const [key, val] of Object.entries(LOCATION_MAP)) {
            if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return val;
        }
        console.warn('[GLPI] Localização não encontrada no mapa:', unidade);
        return 0;
    }

    function buildActors(loggedUser) {
        const actors = { requester: [], observer: [], assign: [] };

        if (loggedUser) {
            const userEntry = {
                itemtype: 'User',
                items_id: loggedUser.items_id,
                use_notification: 1,
                alternative_email: '',
                default_email: loggedUser.email || ''
            };
            actors.requester.push({ ...userEntry });
            actors.assign.push({ ...userEntry });
        }

        actors.assign.push({
            itemtype: 'Group',
            items_id: GROUP_ASSIGN.items_id,
            use_notification: 0,
            alternative_email: '',
            default_email: ''
        });

        return actors;
    }

    function buildTitle(chatText) {
        const m = chatText.match(/Nome\s*:\s*([^\n\r]+)/i);
        return m ? `Chat - ${m[1].trim()}` : 'Suporte via Chat';
    }

    function buildContent(chatText) {
        const html = chatText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        return `<p>${html}</p>`;
    }

    function buildGlpiDate(dateStr, timeStr) {
        // dateStr: DD/MM/YYYY → YYYY-MM-DD
        const [dd, mm, yyyy] = dateStr.split('/');
        let time24 = '08:00:00';
        if (timeStr) {
            const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (m) {
                let h = parseInt(m[1]);
                const min = m[2];
                const ampm = (m[3] || '').toUpperCase();
                if (ampm === 'PM' && h < 12) h += 12;
                if (ampm === 'AM' && h === 12) h = 0;
                time24 = `${String(h).padStart(2, '0')}:${min}:00`;
            }
        }
        return `${yyyy}-${mm}-${dd} ${time24}`;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

})();
