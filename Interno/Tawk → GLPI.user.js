// ==UserScript==
// @name         Tawk.to → GLPI Sender
// @namespace    http://tampermonkey.net/
// @version      1.3
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

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 1 — CONFIGURAÇÃO
       Edite os mapas abaixo conforme necessário.
    ════════════════════════════════════════════════════════════════════ */

    const ENTITY_ID = 567;

    const GROUP_ASSIGN = {
        items_id: '9',  // Grupo "Operação > Sistemas Guarujá"
    };

    // ── Usuários ────────────────────────────────────────────────────────
    // Nome exibido no GLPI → { items_id, email }
    const USER_MAP = {
        'Leonardo Crispim':              { items_id: '304', email: 'leonardo.oliveira@om30.com.br' },
        'Pedro Justino Sampaio Andrade': { items_id: '203', email: 'pedro.andrade@om30.com.br' },
        'Tauana Matos':                  { items_id: '672', email: 'tauana.matos@om30.com.br' },
        'Jorge Cruz':                    { items_id: '64',  email: 'jorge.cruz@om30.com.br' },
    };

    // ── Categorias de unidade (definidas no Tawk) ───────────────────────
    // Cada categoria é um campo custom diferente na sidebar.
    // O detector procura o valor preenchido em qualquer um dos cinco.
    const UNIDADE_CATEGORIES = [
        'Urgência e Emergência',
        'Especialidades, Gestão e Outros Serviços',
        'Saúde Mental',
        'Atenção Básica (USAFA)',
        'Atenção Basica (UBS)',
    ];

    // ── Localizações (locations_id no GLPI) ─────────────────────────────
    // Chave: nome da unidade exatamente como aparece nos seletores do Tawk.
    // Lookup é tolerante a acentos, case e espaços extras (normalizeKey).
    const LOCATION_MAP = {
        // Urgência e Emergência
        'PAM RODOVIARIA':                2115,
        'PS SANTA CRUZ DOS NAVEGANTES':  2116,
        'PS PEREQUÊ':                    2114,
        'PSVC':                          2113,
        'SAMU':                          2118,
        'UPA ENSEADA':                   2133,

        // Especialidades, Gestão e Outros Serviços
        'ARE':                                  567,
        'CASA ROSA':                            2112,
        'CASA SER':                             2880,
        'CENTRAL DE REGULAÇÃO':                 2119,
        'CEO':                                  2104,
        'CEVC':                                 2727,
        'CONSULTORIO NA RUA':                   2108,
        'CRFG':                                 2105,
        'CROOF':                                2107,
        'CRVC':                                 2106,
        'DOCINHOS':                             2130,
        'SESAU':                                641,
        'SIAD':                                 2122,
        'TRANSPORTE SANITÁRIO':                 2120,
        'UNAERP':                               2728,
        'VIGILÂNCIA SANITARIA E EPIDEMIOLÓGICA':2121,
        'WILLIAN ROCHA':                        2131,
        'ZOONOSES':                             2132,

        // Saúde Mental
        'CAPS AD II':                    2100,
        'CAPS I':                        2103,
        'CAPS II':                       2101,
        'CAPS III':                      2102,
        'RESIDENCIA TERAPEUTICA':        2117,

        // Atenção Básica (USAFA)
        'USAFA CIDADE ATLANTICA':         644,
        'USAFA JARDIM BOA ESPERANÇA':     646,
        'USAFA JARDIM BRASIL':            658,
        'USAFA JARDIM CONCEIÇÃOZINHA':    650,
        'USAFA JARDIM DOS PASSAROS':      652,
        'USAFA JARDIM LAS PALMAS':        654,
        'USAFA JARDIM PROGRESSO':         656,
        'USAFA PEREQUÊ':                  658,
        'USAFA SANTA CRUZ DOS NAVEGANTES':660,
        'USAFA SITIO CONCEIÇÃOZINHA':     664,
        'USAFA VILA AUREA':               666,
        'USAFA VILA EDNA':                668,
        'USAFA VILA ZILDA':               672,
        'USAFA VILA RÃ':                  670,

        // Atenção Básica (UBS)
        'UBS MORRINHOS':                 2123,
        'UBS PAE CARA':                  2124,
        'UBS PERNAMBUCO':                2125,
        'UBS PRAINHA':                   2126,
        'UBS SANTA ROSA':                2129,
        'UBS VILA ALICE':                2127,
        'UBS VILA BAIANA':               2128,

        // Especiais
        'OM30': 0,
    };

    // ── Tipo de suporte ─────────────────────────────────────────────────
    // Mapa: texto do campo "Suporte à:" no Tawk → { type, itilcategories_id }
    const SUPORTE_MAP = {
        'Painel de Senha': { type: '1', itilcategories_id: '109' },
        'Saúde Simples':   { type: '2', itilcategories_id: '0'   },
    };
    const SUPORTE_DEFAULT = { type: '1', itilcategories_id: '0' };

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 2 — CONSTANTES INTERNAS E ROTEAMENTO
    ════════════════════════════════════════════════════════════════════ */

    const DATA_KEY = 'tawk_glpi_chatdata';
    const STEP_KEY = 'tawk_glpi_step';

    if (location.hostname === 'dashboard.tawk.to') {
        initTawk();
    } else if (location.hostname === 'suporte.om30.cloud') {
        initGLPI();
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 3 — UTILITÁRIOS GERAIS
    ════════════════════════════════════════════════════════════════════ */

    // Normaliza string para comparação tolerante a acentos / case / espaços.
    // Ex.: "PAM RODOVIÁRIA " → "pam rodoviaria"
    function normalizeKey(s) {
        return (s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
    }

    function todayStr() {
        const d  = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function svgIcon(size) {
        const s = size || 16;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 4 — RESOLVERS (texto livre → dado canônico)
    ════════════════════════════════════════════════════════════════════ */

    function resolveUser(name) {
        if (!name) return null;
        const norm = normalizeKey(name);

        // 1ª passada: exato
        for (const [key, val] of Object.entries(USER_MAP)) {
            if (normalizeKey(key) === norm) return val;
        }
        // 2ª passada: inclusão
        for (const [key, val] of Object.entries(USER_MAP)) {
            const nKey = normalizeKey(key);
            if (norm.includes(nKey) || nKey.includes(norm)) return val;
        }
        console.warn('[GLPI] Usuário não encontrado no mapa:', name);
        return null;
    }

    function resolveLocation(unidade) {
        if (!unidade) return 0;
        const norm = normalizeKey(unidade);

        // 1ª passada: match EXATO (evita "CAPS I" matchar "CAPS II" e similares)
        for (const [key, val] of Object.entries(LOCATION_MAP)) {
            if (normalizeKey(key) === norm) {
                console.log(`[GLPI] Localização resolvida (exato): "${unidade}" → "${key}" (id ${val})`);
                return val;
            }
        }

        // 2ª passada: match por inclusão (tolerante a abreviações/sufixos)
        for (const [key, val] of Object.entries(LOCATION_MAP)) {
            const nKey = normalizeKey(key);
            if (norm.includes(nKey) || nKey.includes(norm)) {
                console.log(`[GLPI] Localização resolvida (inclusão): "${unidade}" → "${key}" (id ${val})`);
                return val;
            }
        }

        console.warn('[GLPI] Localização não encontrada no mapa:', unidade);
        return 0;
    }

    function resolveSuporte(suporteA) {
        if (!suporteA) return SUPORTE_DEFAULT;
        const norm = normalizeKey(suporteA);

        // 1ª passada: exato
        for (const [key, val] of Object.entries(SUPORTE_MAP)) {
            if (normalizeKey(key) === norm) {
                console.log(`[GLPI] Suporte resolvido (exato): "${suporteA}" → "${key}"`, val);
                return val;
            }
        }
        // 2ª passada: inclusão
        for (const [key, val] of Object.entries(SUPORTE_MAP)) {
            const nKey = normalizeKey(key);
            if (norm.includes(nKey) || nKey.includes(norm)) {
                console.log(`[GLPI] Suporte resolvido (inclusão): "${suporteA}" → "${key}"`, val);
                return val;
            }
        }
        console.warn('[GLPI] "Suporte à:" não mapeado, usando padrão:', suporteA);
        return SUPORTE_DEFAULT;
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 5 — TAWK.TO: INJEÇÃO DOS BOTÕES
    ════════════════════════════════════════════════════════════════════ */

    function initTawk() {
        setInterval(tryInjectBtn, 1000);
    }

    function tryInjectBtn() {
        injectInActiveChats();
        injectInInboxTabBar();
    }

    // Caso 1: Painel "Chats" — botão por chat, no header do input.
    function injectInActiveChats() {
        document.querySelectorAll('.tawk-message-input-header').forEach(header => {
            const r = header.getBoundingClientRect();
            if (r.height < 5) return; // header colapsado (chat encerrado)
            if (header.querySelector('.glpi-btn')) return;

            const rightDiv = header.querySelector(
                '.tawk-flex-right.tawk-flex-middle, .tawk-flex-1.tawk-flex-right'
            );
            injectInputHeaderBtn(rightDiv || header);
        });
    }

    // Caso 2: Inbox — botão único na barra de tabs (Chats/Tickets).
    function injectInInboxTabBar() {
        const ticketsBtn = document.querySelector('button[data-text="Tickets"]');
        if (!ticketsBtn) return;
        const tabsBar = ticketsBtn.closest('.tawk-flex.tawk-flex-1.tawk-flex-middle');
        if (!tabsBar) return;
        if (tabsBar.querySelector('.glpi-btn')) return;
        injectTabBtn(tabsBar);
    }

    // Cria o botão estilizado que vai no header do input do Painel Chats.
    function injectInputHeaderBtn(container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'glpi-btn-wrapper';
        wrapper.style.cssText =
            'border-left:1px solid rgba(0,0,0,.15);padding-left:8px;' +
            'display:flex;align-items:center;margin-left:4px;';

        const btn = document.createElement('button');
        btn.className = 'glpi-btn';
        btn.type = 'button';
        btn.style.cssText =
            'color:#e53e3e;height:40px;display:flex;align-items:center;gap:6px;' +
            'cursor:pointer;background:none;border:none;padding:0 8px;' +
            'font-size:13px;font-weight:500;white-space:nowrap;';
        btn.innerHTML = svgIcon() + 'Enviar para o GLPI';
        btn.addEventListener('click', onClickSend);

        wrapper.appendChild(btn);
        container.appendChild(wrapper);
        console.log('[GLPI] Botão injetado no header do chat ativo');
    }

    // Cria o botão no estilo tab (mesmas classes Tawk dos botões Chats/Tickets).
    function injectTabBtn(tabsBar) {
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
                svgIcon(20) +
            '</div>';
        btn.addEventListener('click', onClickSend);

        wrapper.appendChild(btn);
        tabsBar.appendChild(wrapper);
        console.log('[GLPI] Botão injetado na barra de tabs');
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 6 — TAWK.TO: HANDLER DO CLICK
    ════════════════════════════════════════════════════════════════════ */

    async function onClickSend(event) {
        const btn = event.currentTarget;
        const isTabBtn = btn.classList.contains('glpi-tab-btn');
        const chatContainer = findChatContainerFromBtn(btn);

        btn.disabled = true;
        btn.style.opacity = '0.5';
        const originalHTML = btn.innerHTML;
        if (!isTabBtn) btn.textContent = 'Coletando…';

        try {
            const data = collectChatData(chatContainer);
            console.log('[GLPI] Dados coletados:', data);
            await GM_setValue(DATA_KEY, JSON.stringify(data));
            await GM_setValue(STEP_KEY, 'navigate');
            GM_openInTab('https://suporte.om30.cloud/front/central.php?active_entity=' + ENTITY_ID, {
                active: true, insert: true,
            });
        } catch (err) {
            alert('Erro ao coletar dados: ' + err.message);
            console.error('[GLPI]', err);
        }

        btn.disabled = false;
        btn.style.opacity = '1';
        if (isTabBtn) {
            btn.innerHTML = originalHTML;
        } else {
            btn.innerHTML = svgIcon() + 'Enviar para o GLPI';
        }
    }

    // Sobe na DOM a partir do botão até achar o container correto.
    // - Painel "Chats": ancestral com .resizable-component.tawk-border-default-left
    // - Inbox (tab btn): o botão está fora da árvore da conversa, então procuramos
    //   GLOBALMENTE pelo chat painel visível (com sidebar) e usamos ele.
    // - Inbox sem sidebar: fallback para o ancestral com .tawk-smooth-scroll visível.
    function findChatContainerFromBtn(btn) {
        // Primeiro: sobe procurando container do painel Chats (sidebar dentro)
        let el = btn.parentElement;
        let inboxFallback = null;

        while (el && el !== document.body) {
            if (el.querySelector('.resizable-component.tawk-border-default-left')) {
                return el;
            }
            if (!inboxFallback) {
                for (const s of el.querySelectorAll('.tawk-smooth-scroll')) {
                    const r = s.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) { inboxFallback = el; break; }
                }
            }
            el = el.parentElement;
        }

        // Não achou subindo: procura GLOBAL por uma sidebar visível
        // (caso típico: tab btn do inbox, que não está na árvore da conversa)
        for (const sidebar of document.querySelectorAll('.resizable-component.tawk-border-default-left')) {
            const r = sidebar.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                // Sobe até encontrar o container que tem TANTO a sidebar quanto a área de mensagens
                let parent = sidebar.parentElement;
                while (parent && parent !== document.body) {
                    if (parent.querySelector('.tawk-smooth-scroll')) {
                        return parent;
                    }
                    parent = parent.parentElement;
                }
                // Em último caso, retorna o pai imediato da sidebar
                return sidebar.parentElement || document;
            }
        }

        return inboxFallback || document;
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 7 — TAWK.TO: COLETA DE DADOS
    ════════════════════════════════════════════════════════════════════ */

    function collectChatData(chatContainer) {
        // Lista todos os blocos em ordem; depois pula [Sistema] iniciais.
        const items = [];
        chatContainer.querySelectorAll('.tawk-smooth-scroll').forEach(scroll => {
            const r = scroll.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return; // pula cache invisível

            scroll.querySelectorAll('[id^="blockId-"]').forEach(block => {
                const logEl = block.querySelector('.tawk-log-message-text');
                if (logEl) {
                    items.push({ kind: 'system', text: logEl.textContent.trim() });
                    return;
                }
                const msgEl = block.querySelector('.tawk-message');
                if (msgEl) {
                    const nameEl = block.querySelector('.tawk-text-grey-2.tawk-text-regular-1');
                    const timeEl = block.querySelector('.tawk-time');
                    items.push({
                        kind: 'message',
                        name: nameEl ? nameEl.textContent.trim() : 'Visitante',
                        time: timeEl ? timeEl.textContent.trim() : '',
                        text: (msgEl.innerText || msgEl.textContent).trim(),
                    });
                }
            });
        });

        // Começa o chatText na primeira mensagem real (descarta navigate-to iniciais)
        const firstMsgIdx = items.findIndex(i => i.kind === 'message');
        let chatText  = '';
        let firstTime = '';
        if (firstMsgIdx >= 0) {
            for (let i = firstMsgIdx; i < items.length; i++) {
                const it = items[i];
                if (it.kind === 'system') {
                    chatText += `[Sistema] ${it.text}\n`;
                } else {
                    if (!firstTime && it.time) firstTime = it.time;
                    chatText += `[${it.time}] ${it.name}: ${it.text}\n`;
                }
            }
        }

        // ── Unidade: SOMENTE da sidebar (não confia em input livre do chat) ──
        const unidade = extractUnidade(chatContainer);
        if (!unidade) {
            console.warn('[GLPI] Unidade não encontrada na sidebar! Ticket vai sem location.');
        }

        // ── Suporte à: do chatText (é um seletor, vem padronizado) ──
        const suporteA = extractSuporteA(chatText);

        return { chatText, firstTime, unidade, suporteA, date: todayStr() };
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 8 — TAWK.TO: EXTRAÇÃO DA SIDEBAR
       Toda a leitura de dados estruturados (Unidade, Suporte à:) sai daqui.
    ════════════════════════════════════════════════════════════════════ */

    // Retorna os <form> do card de detalhes "ativo".
    //
    // Estratégia: vai DIRETO ao card de detalhes (.tawk-contact-details-card)
    // sem depender da sidebar. Se houver múltiplos cards no DOM (cache de
    // conversas anteriores), escolhe o que estiver visível; se nenhum tiver
    // dimensões > 0, escolhe o que tiver mais forms (provavelmente o ativo).
    function getSidebarForms(_chatContainer) {
        const cards = Array.from(document.querySelectorAll('.tawk-contact-details-card'));
        console.log('[GLPI] Total de cards .tawk-contact-details-card no DOM:', cards.length);

        if (!cards.length) {
            console.warn('[GLPI] Nenhum card .tawk-contact-details-card encontrado');
            return [];
        }

        // Coleta info de cada card pra debug + escolha
        const candidates = cards.map((card, i) => {
            const r = card.getBoundingClientRect();
            const forms = card.querySelectorAll('form');
            const visible = r.width > 0 && r.height > 0;
            return { i, card, forms, visible, w: Math.round(r.width), h: Math.round(r.height) };
        });
        console.log('[GLPI] Cards candidatos:',
            candidates.map(c => ({ i: c.i, size: `${c.w}x${c.h}`, forms: c.forms.length, visible: c.visible }))
        );

        // 1ª escolha: card visível com forms
        let chosen = candidates.find(c => c.visible && c.forms.length > 0);
        // 2ª escolha: qualquer card com forms (chega a quem tiver mais)
        if (!chosen) {
            chosen = candidates
                .filter(c => c.forms.length > 0)
                .sort((a, b) => b.forms.length - a.forms.length)[0];
        }
        if (!chosen) {
            console.warn('[GLPI] Nenhum card com forms encontrado');
            return [];
        }

        console.log(`[GLPI] Card escolhido: #${chosen.i} (${chosen.w}x${chosen.h}, ${chosen.forms.length} forms, visível=${chosen.visible})`);
        return Array.from(chosen.forms);
    }

    // Lê apenas o textContent completo do form, preservando quebras lógicas.
    // Label e valor podem vir grudados (ex: "Saúde MentalCAPS II"), então
    // a separação acontece em extractUnidade, contra a lista de categorias conhecidas.
    function readSidebarRaw(form) {
        return (form.textContent || '').trim().replace(/\s+/g, ' ');
    }

    // Extrai a Unidade. Estratégia:
    //   Para cada form, pega seu textContent inteiro. Procura uma das
    //   UNIDADE_CATEGORIES como prefixo (case/accent-insensitive). Se achar,
    //   o valor é o que vem DEPOIS do nome da categoria, limpo.
    //
    //   Se nenhum form for de categoria, varre procurando um valor que
    //   esteja diretamente no LOCATION_MAP (independente do label).
    function extractUnidade(chatContainer) {
        const forms = getSidebarForms(chatContainer);
        if (!forms.length) return '';

        const debugFields = forms.map(readSidebarRaw);
        console.log('[GLPI] Forms lidos da sidebar:', debugFields);

        // Etapa 1: form cujo conteúdo COMEÇA com uma das categorias conhecidas
        for (const raw of debugFields) {
            const nRaw = normalizeKey(raw);

            for (const category of UNIDADE_CATEGORIES) {
                const nCat = normalizeKey(category);
                if (nRaw.startsWith(nCat)) {
                    // Determina quantos chars do RAW correspondem à categoria
                    let consumed = 0;
                    while (consumed < raw.length && normalizeKey(raw.slice(0, consumed)) !== nCat) {
                        consumed++;
                    }
                    const value = raw.slice(consumed).trim();
                    if (value) {
                        console.log(`[GLPI] Unidade encontrada (categoria "${category}"):`, value);
                        return value;
                    }
                }
            }
        }

        // Etapa 2: alguma string da sidebar bate diretamente com LOCATION_MAP?
        for (const raw of debugFields) {
            const nRaw = normalizeKey(raw);
            for (const key of Object.keys(LOCATION_MAP)) {
                const nKey = normalizeKey(key);
                if (nRaw.endsWith(nKey) || nRaw === nKey) {
                    console.log(`[GLPI] Unidade encontrada (match direto no LOCATION_MAP):`, key);
                    return key;
                }
            }
        }

        console.warn('[GLPI] Unidade não localizada nos forms acima');
        return '';
    }

    // O campo "Suporte à:" é um SELETOR no Tawk e aparece consistentemente
    // no início do chat como "Suporte à: : XYZ". Ler do chatText é mais
    // confiável que tentar adivinhar onde está na sidebar (a estrutura varia).
    function extractSuporteA(chatText) {
        const m = chatText.match(/Suporte\s*à:?\s*:\s*([^\n\r]+)/i);
        if (m) {
            const value = m[1].trim();
            console.log(`[GLPI] Suporte à: ${value}`);
            return value;
        }
        console.warn('[GLPI] Campo "Suporte à:" não encontrado no chatText');
        return '';
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 9 — GLPI: ROTEAMENTO POR ETAPA
    ════════════════════════════════════════════════════════════════════ */

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

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 10 — GLPI: MONTAGEM E SUBMISSÃO DO TICKET
    ════════════════════════════════════════════════════════════════════ */

    async function submitTicket(data) {
        const csrfToken = getCsrfToken();
        if (!csrfToken) {
            alert('[GLPI] CSRF token não encontrado. Tente recarregar a página.');
            return;
        }

        const loggedUserName = getLoggedUserName();
        const loggedUser     = resolveUser(loggedUserName);
        const locationsId    = resolveLocation(data.unidade);
        const suporte        = resolveSuporte(data.suporteA);
        const actors         = buildActors(loggedUser);
        const title          = buildTitle(data.chatText);
        const content        = buildContent(data.chatText);
        const glpiDate       = buildGlpiDate(data.date, data.firstTime);

        console.log('[GLPI] Enviando ticket:', { title, glpiDate, locationsId, suporte, actors });

        const form = new FormData();
        form.append('_skip_default_actor',              '1');
        form.append('_tickettemplate',                  '1');
        form.append('_predefined_fields',               'W10=');
        form.append('name',                             title);
        form.append('content',                          content);
        form.append('entities_id',                      String(ENTITY_ID));
        form.append('date',                             glpiDate);
        form.append('type',                             suporte.type);
        form.append('itilcategories_id',                suporte.itilcategories_id);
        form.append('status',                           '5'); // Solucionado
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
        form.append('_glpi_csrf_token',                 csrfToken);

        const response = await fetch('https://suporte.om30.cloud/front/ticket.form.php', {
            method: 'POST',
            body: form,
            credentials: 'include',
        });

        if (response.ok) {
            console.log('[GLPI] Ticket criado, redirecionando para:', response.url);
            location.href = response.url;
        } else {
            alert('[GLPI] Erro ao criar ticket: HTTP ' + response.status);
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       SEÇÃO 11 — GLPI: HELPERS
    ════════════════════════════════════════════════════════════════════ */

    function getCsrfToken() {
        const hidden = document.querySelector('input[name="_glpi_csrf_token"]');
        if (hidden?.value) return hidden.value;
        if (window.CFG_GLPI?.csrf_token) return window.CFG_GLPI.csrf_token;
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : null;
    }

    function getLoggedUserName() {
        const el = document.querySelector(
            'body > div.page > aside > div > div.d-lg-none > div > ' +
            'div.navbar-nav.flex-row.order-md-last.user-menu > div > div > h6'
        );
        return el ? el.textContent.trim() : '';
    }

    function buildActors(loggedUser) {
        const actors = { requester: [], observer: [], assign: [] };

        if (loggedUser) {
            const userEntry = {
                itemtype: 'User',
                items_id: loggedUser.items_id,
                use_notification: 1,
                alternative_email: '',
                default_email: loggedUser.email || '',
            };
            actors.requester.push({ ...userEntry });
            actors.assign.push({ ...userEntry });
        }

        actors.assign.push({
            itemtype: 'Group',
            items_id: GROUP_ASSIGN.items_id,
            use_notification: 0,
            alternative_email: '',
            default_email: '',
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
                let h = parseInt(m[1], 10);
                const min = m[2];
                const ampm = (m[3] || '').toUpperCase();
                if (ampm === 'PM' && h < 12) h += 12;
                if (ampm === 'AM' && h === 12) h = 0;
                time24 = `${String(h).padStart(2, '0')}:${min}:00`;
            }
        }
        return `${yyyy}-${mm}-${dd} ${time24}`;
    }

})();
