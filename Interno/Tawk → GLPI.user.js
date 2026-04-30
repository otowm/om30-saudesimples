// ==UserScript==
// @name         Tawk.to → GLPI Sender
// @namespace    http://tampermonkey.net/
// @version      1.2
// @uploadURL    https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Interno/Tawk%20%E2%86%92%20GLPI.user.js
// @downloadURL  https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Interno/Tawk%20%E2%86%92%20GLPI.user.js
// @description  Envia chat do Tawk.to para o GLPI automaticamente
// @author       otowm
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
       ⚙️  CONFIGURAÇÃO
    ══════════════════════════════════════════════ */

    const ENTITY_ID = 567;

    const GROUP_ASSIGN = { items_id: '9' };

    const USER_MAP = {
        'Leonardo Crispim': { items_id: '304', email: 'leonardo.oliveira@om30.com.br' },
        // 'Outro Nome':    { items_id: '999', email: 'outro@om30.com.br' },
    };

    const LOCATION_MAP = {
        // ── Atenção Básica (UBS e USAFA) ──────────────────
        'UBS MORRINHOS':                            2123,
        'UBS PAE CARA':                             2124,
        'UBS PERNAMBUCO':                           2125,
        'UBS PRAINHA':                              2126,
        'UBS SANTA ROSA':                           2129,
        'UBS VILA ALICE':                           2127,
        'UBS VILA BAIANA':                          2128,
        'USAFA CIDADE ATLANTICA':                   644,
        'USAFA JARDIM BOA ESPERANCA':               646,
        'USAFA JARDIM BRASIL':                      648,
        'USAFA JARDIM CONCEIÇÃOZINHA':              650,
        'USAFA JARDIM DOS PASSAROS':                652,
        'USAFA JARDIM LAS PALMAS':                  654,
        'USAFA JARDIM PROGRESSO':                   656,
        'USAFA PEREQUÊ':                            658,
        'USAFA SANTA CRUZ DOS NAVEGANTES':          660,
        'USAFA SITIO CONCEIÇÃOZINHA':               664,
        'USAFA VILA AUREA':                         666,
        'USAFA VILA RA':                            670,
        'USAFA VILA ZILDA':                         672,
        // ── Especialidades, Gestão e Outros Serviços ──────
        'ARE':                                      567,
        'CASA ROSA':                                2112,
        'CASA SER':                                 2880,
        'CENTRAL DE REGULACAO':                     2119,
        'CEO':                                      2104,
        'CEVC':                                     2727,
        'CONSULTORIO NA RUA':                       2108,
        'CRFG':                                     2105,
        'CROOF':                                    2107,
        'CRVC':                                     2106,
        'DOCINHOS':                                 2130,
        'SESAU':                                    641,
        'SIAD':                                     2122,
        'TRANSPORTE SANITARIO':                     2120,
        'UNAERP':                                   2728,
        'VIGILANCIA SANITARIA E EPIDEMIOLOGICA':    2121,
        'WILLIAN ROCHA':                            2131,
        'ZOONOSES':                                 2132,
        // ── Urgência e Emergência ──────────────────────────
        'PAM RODOVIARIA':                           2115,
        'PS SANTA CRUZ DOS NAVEGANTES':             2116,
        'PS PEREQUÊ':                               2114,
        'PSVC':                                     2113,
        'SAMU':                                     2118,
        'UPA ENSEADA':                              2133,
        // ── Saúde Mental ──────────────────────────────────
        'CAPS AD II':                               2100,
        'CAPS I':                                   2103,
        'CAPS II':                                  2101,
        'CAPS III':                                 2102,
        'RESIDENCIA TERAPEUTICA':                   2117,
        // ── Farmácias ─────────────────────────────────────
        'FARMACIA JAYRO GRACIOLA':                  2109,
        'FARMACIA VC':                              2110,
        'FARMACIA VILA JULIA':                      2111,
    };

    const CATEGORY_MAP = {
        'senha simples':  { type: '1', itilcategories_id: '109' },
        'saude simples':  { type: '2', itilcategories_id: '0'   },
        'saúde simples':  { type: '2', itilcategories_id: '0'   },
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
       TAWK.TO — injeção de botões
    ══════════════════════════════════════════════ */
    function initTawk() {
        setInterval(() => {
            tryInjectActiveChatsBtn();
            tryInjectInboxBtn();
        }, 1000);
    }

    function tryInjectActiveChatsBtn() {
        if (document.getElementById('glpi-btn-active')) return;
        const header = document.querySelector('.tawk-message-input-header');
        if (!header) return;
        const rightDiv = header.querySelector('.tawk-flex-right.tawk-flex-middle, .tawk-flex-1.tawk-flex-right');
        if (!rightDiv) return;

        const btn = document.createElement('button');
        btn.id = 'glpi-btn-active';
        btn.type = 'button';
        btn.style.cssText =
            'color:#e53e3e;height:40px;display:flex;align-items:center;gap:6px;' +
            'cursor:pointer;background:none;border:none;padding:0 8px;' +
            'font-size:13px;font-weight:500;white-space:nowrap;';
        btn.innerHTML = svgFile() + 'Enviar para o GLPI';
        btn.addEventListener('click', () => onClickSend('active-chats'));

        const wrapper = document.createElement('div');
        wrapper.style.cssText =
            'border-left:1px solid rgba(0,0,0,.15);padding-left:8px;' +
            'display:flex;align-items:center;margin-left:4px;';
        wrapper.appendChild(btn);
        rightDiv.appendChild(wrapper);
        console.log('[GLPI] Botão active-chats injetado.');
    }

    function tryInjectInboxBtn() {
        if (document.getElementById('glpi-btn-inbox')) return;
        const ticketsBtn = document.querySelector('button[data-text="Tickets"]');
        if (!ticketsBtn) return;
        const ticketContainer = ticketsBtn.parentElement;
        if (!ticketContainer) return;

        const btn = document.createElement('button');
        btn.id = 'glpi-btn-inbox';
        btn.type = 'button';
        btn.className = 'tawk-button tawk-button-text tawk-button-medium tawk-tab tawk-flex tawk-width-100 tawk-flex-center tawk-flex-middle tawk-tooltip';
        btn.setAttribute('data-text', 'Enviar ao GLPI');
        btn.style.color = '#e53e3e';
        btn.innerHTML = '<div class="tawk-flex tawk-flex-middle tawk-gap-small tawk-tab-content">' + svgFileSmall() + '</div>';
        btn.addEventListener('click', () => onClickSend('inbox'));

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;align-items:center;justify-content:center;';
        wrapper.appendChild(btn);
        ticketContainer.insertAdjacentElement('afterend', wrapper);
        console.log('[GLPI] Botão inbox injetado.');
    }

    function svgFile() {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
            'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
            '<polyline points="14 2 14 8 20 8"/>' +
            '<line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
    }

    function svgFileSmall() {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" ' +
            'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
            '<polyline points="14 2 14 8 20 8"/>' +
            '<line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
    }

    /* ══════════════════════════════════════════════
       COLETA DE DADOS
    ══════════════════════════════════════════════ */
    async function onClickSend(mode) {
        const btnId = mode === 'inbox' ? 'glpi-btn-inbox' : 'glpi-btn-active';
        const btn = document.getElementById(btnId);
        if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

        try {
            const data = mode === 'inbox' ? collectFromInbox() : collectFromActiveChats();
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

        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }

    function collectFromActiveChats() {
        const blocks = [...document.querySelectorAll('.tawk-smooth-scroll [id^="blockId-"]')];
        const { chatText, firstTime } = parseBlocks(blocks);
        const unidade = readUnidade('#active-chats', chatText);
        return buildData(chatText, firstTime, unidade);
    }

    function collectFromInbox() {
        const chatRoot = document.querySelector('.split-view-conversation');
        const blocks = chatRoot ? [...chatRoot.querySelectorAll('[id^="blockId-"]')] : [];
        const { chatText, firstTime } = parseBlocks(blocks);
        const unidade = readUnidade('.split-view-conversation', chatText);
        return buildData(chatText, firstTime, unidade);
    }

    /* ── Parser de blocos ── */
    function parseBlocks(blocks) {
        let chatText  = '';
        let firstTime = '';
        let formFound = false;

        blocks.forEach(block => {
            const msgEl = block.querySelector('.tawk-message');

            if (msgEl) {
                const text = (msgEl.innerText || msgEl.textContent).trim();
                if (!formFound && isFormMessage(text)) formFound = true;

                if (formFound) {
                    const nameEl = block.querySelector('.tawk-text-grey-2.tawk-text-regular-1');
                    const timeEl = block.querySelector('.tawk-time');
                    const name   = nameEl ? nameEl.textContent.trim() : 'Visitante';
                    const time   = timeEl ? timeEl.textContent.trim() : '';
                    if (!firstTime && time) firstTime = time;
                    chatText += `[${time}] ${name}: ${text}\n`;
                }
                return;
            }

            if (formFound) {
                const logEl = block.querySelector('.tawk-log-message-text');
                if (logEl) chatText += `[Sistema] ${logEl.textContent.trim()}\n`;
            }
        });

        return { chatText, firstTime };
    }

    function isFormMessage(text) {
        return text.includes('Nome :') && text.includes('Unidade :') && text.includes('Telefone :');
    }

    /**
     * Busca a unidade de forma robusta dentro do contexto da página.
     * Em vez de depender de um seletor longo e frágil, encontra o
     * .tawk-contact-details-card visível e lê todos os <span> dentro
     * dos forms, retornando o primeiro que bata com alguma entrada do LOCATION_MAP.
     * Fallback: qualquer span não vazio nos forms do card.
     */
    function readUnidade(contextSel, chatText) {
        const context = document.querySelector(contextSel);
        if (context) {
            const card = context.querySelector('.tawk-contact-details-card');
            if (card) {
                const spans = [...card.querySelectorAll('form span')];
                // Tenta encontrar um span cujo texto bata com o LOCATION_MAP
                for (const span of spans) {
                    const text = span.textContent.trim();
                    if (!text || text.length < 3) continue;
                    const loc = resolveLocation(text);
                    if (loc !== 0) {
                        console.log('[GLPI] Unidade encontrada (match LOCATION_MAP):', text, '→', loc);
                        return text;
                    }
                }
                // Fallback: pega o primeiro span não vazio dos forms que pareça uma unidade
                for (const span of spans) {
                    const text = span.textContent.trim();
                    if (text && text.length > 3 && !/^\d+$/.test(text)) {
                        console.warn('[GLPI] Unidade via primeiro span não vazio:', text);
                        return text;
                    }
                }
            }
        }

        // Último recurso: extrai do texto do chat
        const m = chatText.match(/Unidade\s*:\s*([^\n\r]+)/i);
        if (m) {
            console.warn('[GLPI] Unidade via texto do chat:', m[1].trim());
            return m[1].trim();
        }

        console.warn('[GLPI] Unidade não encontrada!');
        return '';
    }

    /* ── Montagem do objeto de dados ── */
    function buildData(chatText, firstTime, unidade) {
        const suporteMatch = chatText.match(/Suporte\s*[àa]\s*:\s*:\s*([^\n\r]+)/i);
        const suporte = normalize(suporteMatch ? suporteMatch[1].trim() : '');

        let category = { type: '2', itilcategories_id: '0' };
        for (const [key, val] of Object.entries(CATEGORY_MAP)) {
            if (suporte.includes(normalize(key))) { category = val; break; }
        }

        console.log('[GLPI] Suporte:', suporte, '→ type:', category.type, 'cat:', category.itilcategories_id);

        return {
            chatText,
            firstTime,
            unidade,
            date: todayStr(),
            type: category.type,
            itilcategories_id: category.itilcategories_id,
        };
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
       SUBMISSÃO VIA POST
    ══════════════════════════════════════════════ */
    async function submitTicket(data) {
        const csrfToken = getCsrfToken();
        if (!csrfToken) {
            alert('[GLPI] CSRF token não encontrado. Recarregue a página.');
            return;
        }

        const loggedUser  = await getCurrentGlpiUser();
        const locationsId = resolveLocation(data.unidade);
        const actors      = buildActors(loggedUser);
        const title       = buildTitle(data.chatText);
        const content     = buildContent(data.chatText);
        const glpiDate    = buildGlpiDate(data.date, data.firstTime);

        console.log('[GLPI] Enviando ticket...', {
            title, glpiDate, locationsId, actors,
            type: data.type, itilcategories_id: data.itilcategories_id
        });

        const form = new FormData();
        form.set('_glpi_csrf_token',                csrfToken);
        form.set('_skip_default_actor',              '1');
        form.set('_tickettemplate',                  '1');
        form.set('_predefined_fields',               'W10=');
        form.set('name',                             title);
        form.set('content',                          content);
        form.set('entities_id',                      String(ENTITY_ID));
        form.set('date',                             glpiDate);
        form.set('type',                             data.type);
        form.set('itilcategories_id',                data.itilcategories_id);
        form.set('status',                           '5');
        form.set('requesttypes_id',                  '0');
        form.set('urgency',                          '3');
        form.set('impact',                           '3');
        form.set('priority',                         '3');
        form.set('locations_id',                     String(locationsId));
        form.set('actiontime',                       '0');
        form.set('validatortype',                    '0');
        form.set('_add_validation',                  '0');
        form.set('_actors',                          JSON.stringify(actors));
        form.set('_notifications_actorname',         '');
        form.set('_notifications_actortype',         '');
        form.set('_notifications_actorindex',        '');
        form.set('_notifications_alternative_email', '');
        form.set('itemtype',                         '0');
        form.set('items_id',                         '0');
        form.set('time_to_own',                      '');
        form.set('slas_id_tto',                      '0');
        form.set('time_to_resolve',                  '');
        form.set('slas_id_ttr',                      '0');
        form.set('internal_time_to_own',             '');
        form.set('olas_id_tto',                      '0');
        form.set('internal_time_to_resolve',         '');
        form.set('olas_id_ttr',                      '0');
        form.set('_link[tickets_id_1]',              '0');
        form.set('_link[link]',                      '1');
        form.set('_link[tickets_id_2]',              '0');

        const response = await fetch('https://suporte.om30.cloud/front/ticket.form.php', {
            method: 'POST',
            body: form,
            credentials: 'include'
        });

        if (response.ok) {
            console.log('[GLPI] Ticket criado! URL:', response.url);
            location.href = response.url;
        } else {
            alert('[GLPI] Erro ao criar ticket: HTTP ' + response.status);
        }
    }

    /* ══════════════════════════════════════════════
       HELPERS
    ══════════════════════════════════════════════ */

    function getCsrfToken() {
        const hidden = document.querySelector('input[name="_glpi_csrf_token"]');
        if (hidden?.value) return hidden.value;
        if (window.CFG_GLPI?.csrf_token) return window.CFG_GLPI.csrf_token;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');
        return null;
    }

    async function getCurrentGlpiUser() {
        if (window.CFG_GLPI?.user_id) {
            const uid = String(window.CFG_GLPI.user_id);
            for (const info of Object.values(USER_MAP)) {
                if (info.items_id === uid) return { items_id: uid, email: info.email };
            }
            return { items_id: uid, email: '' };
        }
        const name = getLoggedUserName();
        if (name) {
            const mapped = resolveUser(name);
            if (mapped) return mapped;
        }
        console.warn('[GLPI] Usuário não detectado automaticamente.');
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
        return null;
    }

    function resolveLocation(unidade) {
        if (!unidade) return 0;
        const query = normalize(unidade);

        for (const [key, val] of Object.entries(LOCATION_MAP)) {
            if (normalize(key) === query) return val;
        }
        for (const [key, val] of Object.entries(LOCATION_MAP)) {
            const nKey = normalize(key);
            if (nKey.includes(query) || query.includes(nKey)) return val;
        }

        console.warn('[GLPI] Localização não encontrada:', unidade, '→', query);
        return 0;
    }

    function normalize(str) {
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
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
