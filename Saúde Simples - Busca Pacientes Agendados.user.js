// ==UserScript==
// @name         Saúde Simples - Busca Pacientes Agendados
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Busca de agendas direto na tela de agendamento (prod + homolog)
// @downloadURL  https://github.com/otowm/om30-saudesimples/blob/main/Sa%C3%BAde%20Simples%20-%20Busca%20Pacientes%20Agendados.user.js
// @updateURL    https://github.com/otowm/om30-saudesimples/blob/main/Sa%C3%BAde%20Simples%20-%20Busca%20Pacientes%20Agendados.user.js
// @author       otowm
// @match        https://guaruja.saudesimples.net/agendamentos*
// @match        https://guarujahomolog.saudesimples.net/agendamentos*
// @grant        GM_xmlhttpRequest
// @connect      guaruja.saudesimples.net
// @connect      guarujahomolog.saudesimples.net
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ===== AMBIENTE (produção x homologação) =====
    const ENV = (() => {
        const host = window.location.hostname;
        const isHomolog = host.includes('homolog');
        return {
            isHomolog,
            baseUrl: isHomolog
                ? 'https://guarujahomolog.saudesimples.net'
                : 'https://guaruja.saudesimples.net'
        };
    })();

    // ===== CONFIGURAÇÕES E CONSTANTES =====
    const CONFIG = {
        selectors: {
            profissional: '#agendamento_profissional_id',
            pageContent: '#content-box',
            especialidade: '#column-content-box > div > div.content-box-wrapper.container_16 > div:nth-child(3) > li'
        },
        ids: {
            button: 'floating-search-button',
            spinner: 'busca-status-spinner',
            panel: 'painel-pacientes-lateral',
            style: 'mp-pacientes-style'
        },
        layout: {
            panelWidth: 600,
            transitionTime: 350
        },
        api: {
            path: '/atendimentos_medicos_administrativo',
            timeout: 15000,
            get url() {
                return ENV.baseUrl + this.path;
            }
        },
        areas: {
            '99': { class: 'area-azul',    label: 'Área Azul' },
            '88': { class: 'area-rosa',    label: 'Área Rosa' },
            '77': { class: 'area-laranja', label: 'Área Laranja' },
            '66': { class: 'area-verde',   label: 'Área Verde' }
        }
    };

    // ===== MAPEAMENTO DE ESPECIALIDADES =====
    const ESPECIALIDADE_MAPA = {
        'generalista' : '449',
        'pediatra': '432',
        'dentista|cirurgiao-dentista': '357',
        'gastroenterologista': '448',
        'geriatra': '451',
        'neurologista': '426',
        'educacao fisica|profissional de educacao fisica': '2626',
        'ortopedista|traumatologista': '468',
        'pneumologista': '434',
        'cardiologista': '429',
        'enfermeiro|enfermeira|enf': '396',
        'tecnico de enfermagem|tec enferm': '931',
        'endocrinologista|metabologista': '446',
        'clinico da familia|medico da familia|saude da familia': '441',
        'ginecologista|obstetra|ginec': '464',
        'fisioterapeuta|fisio': '399',
        'agente comunitario|acs': '1312',
        'nutricionista|nutri': '409',
        'assistente social|servico social': '662',
        'psicologo|psicologa': '652',
        'clinico': '433',
        'default': 'NAOENCONTRADO'
    };

    // ===== CACHE DE ELEMENTOS DOM =====
    const elementCache = {
        _button: null,
        _spinner: null,

        getButton() {
            if (!this._button) {
                this._button = document.getElementById(CONFIG.ids.button);
                if (!this._button) {
                    this._button = document.createElement('button');
                    this._button.id = CONFIG.ids.button;
                    document.body.appendChild(this._button);
                }
            }
            return this._button;
        },

        getSpinner() {
            if (!this._spinner) {
                this._spinner = document.getElementById(CONFIG.ids.spinner);
                if (!this._spinner) {
                    this._spinner = document.createElement('div');
                    this._spinner.id = CONFIG.ids.spinner;
                    this._spinner.innerHTML = '<div class="loader"></div><p>Buscando...</p>';
                    document.body.appendChild(this._spinner);
                }
            }
            return this._spinner;
        },

        getPanel() {
            return document.getElementById(CONFIG.ids.panel);
        },

        clearPanel() {
            // Não mantemos ref do painel em cache; sempre lemos do DOM
        }
    };

    // ===== UTILIDADES =====
    const Utils = {
        normalizeText(text) {
            return (text || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        },

        formatDate(dia, mes, ano) {
            if (!dia || !mes || !ano) return '';
            return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
        },

        findHeaderIndex(headers, keywords) {
            const keywordList = this.normalizeText(keywords)
                .split('|')
                .map(k => k.trim())
                .filter(Boolean);

            return Array.from(headers).findIndex(th => {
                const headerText = this.normalizeText(th.innerText);
                return keywordList.some(keyword => headerText.includes(keyword));
            });
        },

        extractPrefix(text) {
            const match = (text || '').match(/\d+/);
            return match ? match[0].slice(0, 2) : '';
        },

        parseHour(timeText) {
            const match = (timeText || '').match(/(\d{1,2})\s*[:h]\s*\d{2}/i);
            if (!match) return NaN;
            const h = Number(match[1]);
            return h >= 0 && h < 24 ? h : NaN;
        }
    };

    // ===== AUTENTICAÇÃO E LEITURA DE DADOS =====
    const Auth = {
        getToken() {
            return (
                document.querySelector("input[name='authenticity_token']")?.value ||
                document.querySelector("meta[name='csrf-token']")?.content ||
                ''
            );
        },

        getProfissionalId() {
            return document.querySelector(CONFIG.selectors.profissional)?.value || '';
        },

        getEspecialidadeId() {
            const li = document.querySelector(CONFIG.selectors.especialidade);
            if (!li) return ESPECIALIDADE_MAPA.default;

            let rawText = '';
            for (const node of li.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    rawText = node.textContent.trim();
                    break;
                }
            }

            if (!rawText) return ESPECIALIDADE_MAPA.default;

            const text = rawText.replace(/^\d+\s*-\s*/, '').trim();
            const normalized = Utils.normalizeText(text);

            for (const [pattern, id] of Object.entries(ESPECIALIDADE_MAPA)) {
                if (pattern === 'default') continue;
                if (new RegExp(pattern, 'i').test(normalized)) return id;
            }

            return ESPECIALIDADE_MAPA.default;
        }
    };

    // ===== GERENCIAMENTO DE UI =====
    const UIManager = {
        showSpinner() {
            elementCache.getSpinner().style.setProperty('display', 'flex', 'important');
        },

        hideSpinner() {
            elementCache.getSpinner().style.setProperty('display', 'none', 'important');
        },

        updateButton(data) {
            if (!data?.data || !data?.profissional_id) {
                this.hideButton();
                return;
            }

            const button = elementCache.getButton();
            const especialidadeId = Auth.getEspecialidadeId();
            const envLabel = ENV.isHomolog ? ' [HOMOLOG]' : '';

            button.innerHTML = `🔎 Consultar Agendados para <strong>${data.data}</strong>${envLabel} (Espec. ID: ${especialidadeId})`;
            button.dataset.data = data.data;
            button.dataset.profissional = data.profissional_id;
            button.dataset.especialidade = especialidadeId;
            button.onclick = SearchManager.start.bind(SearchManager);
            button.style.display = 'block';
        },

        hideButton() {
            elementCache.getButton().style.display = 'none';
            LayoutManager.remove();
        },

        applyLayoutAdjustment() {
            document.querySelector(CONFIG.selectors.pageContent)
                ?.style.setProperty('position', 'relative', 'important');
        },

        revertLayoutAdjustment() {
            document.querySelector(CONFIG.selectors.pageContent)
                ?.style.removeProperty('position');
        }
    };

    // ===== BUSCA DE PACIENTES =====
    const SearchManager = {
        start(e) {
            const btn = e.currentTarget;
            const { data, profissional, especialidade } = btn.dataset;

            UIManager.hideButton();
            this.execute({ data, profissionalId: profissional, especialidadeId: especialidade });
        },

        execute({ data, profissionalId, especialidadeId }) {
            if (!data || !profissionalId || !especialidadeId) {
                UIManager.hideSpinner();
                LayoutManager.showError('Dados de busca insuficientes.');
                return;
            }

            UIManager.showSpinner();
            this._makeRequest(data, profissionalId, especialidadeId);
        },

        _makeRequest(data, profissionalId, especialidadeId) {
            const formData = new URLSearchParams({
                utf8: '✓',
                authenticity_token: Auth.getToken(),
                'filtro_atendimento_medico[data]': data,
                'filtro_atendimento_medico[profissional_id]': profissionalId,
                'filtro_atendimento_medico[especialidade_id]': especialidadeId,
                'filtro_atendimento_medico[unidade_id]': '',
                'filtro_atendimento_medico[status]': '',
                consultar: ''
            });

            console.log(`[Busca v3.0 | ${ENV.isHomolog ? 'HOMOLOG' : 'PROD'}] Data: ${data} | Prof: ${profissionalId} | Espec: ${especialidadeId}`);
            console.log(`[Busca v3.0] API: ${CONFIG.api.url}`);

            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.api.url,
                data: formData.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: CONFIG.api.timeout,
                onload:   (res) => this._handleResponse(res, data),
                onerror:  ()    => this._handleError(),
                ontimeout: ()   => this._handleTimeout()
            });
        },

        _handleResponse(response, data) {
            UIManager.hideSpinner();

            if (response.status !== 200) {
                LayoutManager.showError(`Falha na busca (Erro HTTP ${response.status}).`);
                console.error(`[Busca v3.0] Status inesperado: ${response.status}`);
                return;
            }

            try {
                const doc = new DOMParser().parseFromString(response.responseText, 'text/html');
                const bodyText = Utils.normalizeText(doc.body?.innerText || '');

                const hasEmptyMsg = bodyText.includes('nenhum') &&
                    (bodyText.includes('procedimento') ||
                     bodyText.includes('paciente') ||
                     bodyText.includes('encontrado'));

                const table = doc.querySelector('table:not(.form-table)');
                const rows  = table?.querySelectorAll('tbody tr') || [];

                const validRowCount = Array.from(rows).filter(row => {
                    const cells = row.querySelectorAll('td');
                    return cells.length > 0 && Array.from(cells).some(c => c.textContent.trim());
                }).length;

                console.log(`[Busca v3.0] table=${!!table} | rows=${rows.length} | valid=${validRowCount} | emptyMsg=${hasEmptyMsg}`);

                if (!table || validRowCount === 0 || hasEmptyMsg) {
                    LayoutManager.showError(`Nenhum paciente agendado para ${data}.`);
                    return;
                }

                LayoutManager.showResults(table, data);
            } catch (err) {
                console.error('[Busca v3.0] Erro ao parsear resposta:', err);
                LayoutManager.showError('Erro ao processar resposta do servidor.');
            }
        },

        _handleError() {
            UIManager.hideSpinner();
            console.error('[Busca v3.0] Erro de rede.');
            LayoutManager.showError('Erro de rede. Verifique a conexão.');
        },

        _handleTimeout() {
            UIManager.hideSpinner();
            console.warn('[Busca v3.0] Timeout da requisição.');
            LayoutManager.showError('Requisição expirada. Tente novamente.');
        }
    };

    // ===== INTERCEPTAÇÃO DE AGENDA =====
    const AgendaInterceptor = {
        install() {
            const self = this;
            const originalOpen = XMLHttpRequest.prototype.open;

            XMLHttpRequest.prototype.open = function (method, url) {
                if (method === 'GET' && url.includes('/agendamentos/obter_agenda_horario_dia')) {
                    this.addEventListener('load', () => self._onLoadAgenda(url));
                }
                return originalOpen.apply(this, arguments);
            };
        },

        _onLoadAgenda(url) {
            try {
                const params = new URL(url, window.location.origin).searchParams;
                const data = Utils.formatDate(
                    params.get('dia'),
                    params.get('mes'),
                    params.get('ano')
                );

                if (!data) return;

                const profissionalId = Auth.getProfissionalId();
                if (profissionalId) {
                    setTimeout(() => UIManager.updateButton({ data, profissional_id: profissionalId }), 200);
                } else {
                    UIManager.hideButton();
                }
            } catch (err) {
                console.error('[Busca v3.0 AgendaInterceptor]', err);
            }
        }
    };

    // ===== GERENCIAMENTO DO PAINEL =====
    const LayoutManager = {
        showResults(table, data) {
            this.remove();

            const tbody = table.querySelector('tbody');
            if (!tbody?.querySelector('tr')) {
                this.showError(`Nenhum paciente agendado para ${data}.`);
                return;
            }

            const { morning, afternoon } = this._parseTable(table);

            if (morning.length === 0 && afternoon.length === 0) {
                this.showError(`Nenhum paciente agendado para ${data}.`);
                return;
            }

            const panel = this._createPanel(data, morning, afternoon, table);
            document.body.appendChild(panel);
            this._setupCloseButton();
            UIManager.applyLayoutAdjustment();

            void panel.offsetHeight; // força repaint antes da animação
            setTimeout(() => (panel.style.right = '0'), 50);
        },

        showError(message) {
            this.remove();

            const panel = document.createElement('div');
            panel.id = CONFIG.ids.panel;
            panel.innerHTML = `
                <div class="ppl-header">
                    <h2>Resultado da Busca</h2>
                    <button class="fechar-btn" aria-label="Fechar">✕</button>
                </div>
                <div class="ppl-content-error">
                    <h3>${message}</h3>
                </div>
            `;
            document.body.appendChild(panel);
            this._setupCloseButton();
            UIManager.applyLayoutAdjustment();

            void panel.offsetHeight;
            setTimeout(() => (panel.style.right = '0'), 50);
        },

        remove() {
            const panel = elementCache.getPanel();
            if (!panel) return;

            panel.style.right = `-${CONFIG.layout.panelWidth}px`;
            setTimeout(() => {
                panel.remove();
                elementCache.clearPanel();
                UIManager.revertLayoutAdjustment();
            }, CONFIG.layout.transitionTime);
        },

        _setupCloseButton() {
            const closeBtn = document.querySelector(`#${CONFIG.ids.panel} .fechar-btn`);
            if (closeBtn) closeBtn.onclick = () => this.remove();
        },

        _parseTable(table) {
            const headers  = table.querySelectorAll('th');
            const idxPront = Utils.findHeaderIndex(headers, 'pront');
            const idxHora  = Utils.findHeaderIndex(headers, 'hora|horario');

            const morning = [], afternoon = [];

            table.querySelectorAll('tbody tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length === 0) return;

                const hasContent = Array.from(cells).some(c => c.textContent.trim());
                if (!hasContent) return;

                // Coloração por área do prontuário
                if (idxPront >= 0 && cells[idxPront]) {
                    this._applyAreaColor(cells[idxPront]);
                }

                // Determinar período
                const timeText = (idxHora >= 0 && cells[idxHora]
                    ? cells[idxHora].innerText
                    : Array.from(cells).map(c => c.textContent).find(t => /\d{1,2}\s*[:h]\s*\d{2}/i.test(t)) || ''
                ).trim();

                const hour = Utils.parseHour(timeText);

                if (!Number.isNaN(hour) && hour >= 12) {
                    afternoon.push(row);
                } else {
                    morning.push(row); // sem hora detectada → manhã por padrão
                }
            });

            this._removeCheckboxCells(morning);
            this._removeCheckboxCells(afternoon);

            return { morning, afternoon };
        },

        _removeCheckboxCells(rows) {
            rows.forEach(row => {
                row.querySelectorAll('td').forEach(cell => {
                    if (cell.querySelector('input[type="checkbox"]')) cell.remove();
                });
            });
        },

        _applyAreaColor(cell) {
            const prefix = Utils.extractPrefix(cell.innerText.trim());
            const areaConfig = CONFIG.areas[prefix];

            cell.classList.remove(...Object.values(CONFIG.areas).map(a => a.class));
            if (areaConfig) cell.classList.add(areaConfig.class);
        },

        _createPanel(data, morning, afternoon, originalTable) {
            const panel = document.createElement('div');
            panel.id = CONFIG.ids.panel;

            // Clonar tabela e remover coluna de checkboxes do cabeçalho
            const clonedTable = originalTable.cloneNode(true);
            clonedTable.querySelectorAll('th').forEach((th, index) => {
                const isCheckbox = th.querySelector('input[type="checkbox"]') ||
                    /selecionar|check/i.test(th.innerText);
                if (!isCheckbox) return;
                th.remove();
                clonedTable.querySelector('tbody')?.querySelectorAll('tr').forEach(row => {
                    row.querySelectorAll('td')[index]?.remove();
                });
            });

            const headerHTML = clonedTable.querySelector('thead')?.innerHTML ||
                `<tr>${Array.from(clonedTable.querySelectorAll('th')).map(th => th.outerHTML).join('')}</tr>`;

            const total = morning.length + afternoon.length;
            const envBadge = ENV.isHomolog
                ? '<span class="env-badge homolog">HOMOLOG</span>'
                : '';

            panel.innerHTML = `
                <div class="ppl-header">
                    <h2>Pacientes Agendados (${data}) ${envBadge}</h2>
                    <button class="fechar-btn" aria-label="Fechar">✕</button>
                </div>
                <div class="ppl-stats">
                    <span>
                        <div class="label">Total</div>
                        <div class="value">${total}</div>
                    </span>
                    <span>
                        <div class="label">Manhã</div>
                        <div class="value">${morning.length}</div>
                    </span>
                    <span>
                        <div class="label">Tarde</div>
                        <div class="value">${afternoon.length}</div>
                    </span>
                </div>
                <div class="ppl-content">
                    ${morning.length > 0 ? `
                        <h3>🌅 Manhã</h3>
                        <div class="ppl-tabela-wrapper">
                            <table>
                                <thead>${headerHTML}</thead>
                                <tbody>${morning.map(r => r.outerHTML).join('')}</tbody>
                            </table>
                        </div>
                    ` : '<p class="ppl-empty">Nenhum agendamento na manhã.</p>'}

                    ${afternoon.length > 0 ? `
                        <h3>🌇 Tarde</h3>
                        <div class="ppl-tabela-wrapper">
                            <table>
                                <thead>${headerHTML}</thead>
                                <tbody>${afternoon.map(r => r.outerHTML).join('')}</tbody>
                            </table>
                        </div>
                    ` : '<p class="ppl-empty">Nenhum agendamento na tarde.</p>'}
                </div>
            `;

            return panel;
        }
    };

    // ===== ESTILOS =====
    function injectStyles() {
        if (document.getElementById(CONFIG.ids.style)) return;

        const style = document.createElement('style');
        style.id = CONFIG.ids.style;
        style.textContent = `
            body { overflow-x: hidden; }

            /* Badge de ambiente */
            .env-badge {
                display: inline-block;
                font-size: 0.6em;
                font-weight: 700;
                padding: 2px 8px;
                border-radius: 4px;
                vertical-align: middle;
                letter-spacing: 0.05em;
                margin-left: 6px;
            }
            .env-badge.homolog {
                background: #fff3cd;
                color: #856404;
                border: 1px solid #ffc107;
            }

            /* Botão flutuante */
            #floating-search-button {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                color: white;
                padding: 14px 28px;
                border: none;
                border-radius: 50px;
                cursor: pointer;
                font-size: 1em;
                font-weight: 600;
                box-shadow: 0 6px 20px rgba(0, 123, 255, 0.35);
                z-index: 999990;
                display: none;
                transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                white-space: nowrap;
                max-width: 90vw;
                overflow: hidden;
                text-overflow: ellipsis;
                will-change: transform, box-shadow;
            }
            #floating-search-button:hover {
                background: linear-gradient(135deg, #0056b3 0%, #003d82 100%);
                transform: translateX(-50%) translateY(-3px);
                box-shadow: 0 10px 30px rgba(0, 123, 255, 0.5);
            }
            #floating-search-button:active {
                transform: translateX(-50%) scale(0.97);
            }

            /* Spinner */
            #busca-status-spinner {
                position: fixed;
                top: 50%;
                right: 330px;
                transform: translate(50%, -50%);
                display: none;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                z-index: 999999;
                padding: 20px;
                background: rgba(0, 0, 0, 0.85);
                color: #fff;
                border-radius: 12px;
                backdrop-filter: blur(5px);
                animation: slideInSpinner 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                will-change: transform, opacity;
            }
            @keyframes slideInSpinner {
                from { opacity: 0; transform: translate(50%, -50%) scale(0.7); }
                to   { opacity: 1; transform: translate(50%, -50%) scale(1);   }
            }
            #busca-status-spinner p {
                margin-top: 8px;
                font-size: 0.95em;
                font-weight: 500;
            }
            .loader {
                margin: 8px auto;
                width: 30px;
                height: 30px;
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-top-color: #007bff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin { to { transform: rotate(360deg); } }

            /* Painel lateral */
            #painel-pacientes-lateral {
                position: fixed;
                top: 0;
                right: -600px;
                width: 600px;
                height: 100%;
                background: #fff;
                box-shadow: -8px 0 25px rgba(0, 0, 0, 0.15);
                z-index: 999998;
                transition: right 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                padding: 0;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border-left: 4px solid #007bff;
                will-change: right;
            }

            /* Cabeçalho */
            .ppl-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px;
                border-bottom: 2px solid #e9ecef;
                flex-shrink: 0;
                background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
            }
            .ppl-header h2 {
                margin: 0;
                font-size: 1.3em;
                color: #007bff;
                font-weight: 700;
            }
            .fechar-btn {
                background: none;
                border: none;
                font-size: 1.5em;
                cursor: pointer;
                color: #dc3545;
                font-weight: bold;
                padding: 0;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .fechar-btn:hover {
                background: rgba(220, 53, 69, 0.1);
                transform: scale(1.2) rotate(90deg);
            }

            /* Estatísticas */
            .ppl-stats {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 0;
                font-size: 0.95em;
                padding: 14px 16px;
                border-bottom: 1px solid #e9ecef;
                margin: 0;
                flex-shrink: 0;
                background: #f8f9fa;
                font-weight: 500;
                animation: slideDown 0.35s ease-out 0.1s backwards;
            }
            .ppl-stats span {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 0 15px;
                position: relative;
            }
            .ppl-stats span:not(:last-child)::after {
                content: '|';
                position: absolute;
                right: 0;
                top: 50%;
                transform: translateY(-50%);
                color: #007bff;
                font-weight: bold;
                font-size: 1.2em;
            }
            .ppl-stats .label {
                font-weight: 700;
                color: #007bff;
                margin-bottom: 2px;
            }
            .ppl-stats .value {
                font-size: 1.1em;
                font-weight: 600;
            }
            @keyframes slideDown {
                from { opacity: 0; transform: translateY(-10px); }
                to   { opacity: 1; transform: translateY(0);      }
            }

            /* Conteúdo */
            .ppl-content {
                flex-grow: 1;
                overflow-y: auto;
                padding: 16px;
                padding-right: 12px;
            }
            .ppl-content::-webkit-scrollbar { width: 6px; }
            .ppl-content::-webkit-scrollbar-track  { background: #f1f1f1; border-radius: 3px; }
            .ppl-content::-webkit-scrollbar-thumb  { background: #d0d0d0; border-radius: 3px; transition: background 0.2s; }
            .ppl-content::-webkit-scrollbar-thumb:hover { background: #999; }
            .ppl-content h3 {
                text-align: center;
                margin: 12px 0 10px;
                font-size: 1.1em;
                color: #333;
                font-weight: 700;
                padding-bottom: 8px;
                border-bottom: 2px solid #007bff;
                animation: fadeIn 0.35s ease-out;
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

            .ppl-empty {
                text-align: center;
                padding: 24px;
                color: #999;
                font-style: italic;
                background: #f8f9fa;
                border-radius: 8px;
                margin: 10px 0;
                animation: fadeIn 0.35s ease-out;
            }

            .ppl-content-error {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 240px;
                padding: 16px;
            }
            .ppl-content-error h3 {
                color: #dc3545;
                text-align: center;
                margin: 0;
                font-size: 1.2em;
                line-height: 1.5;
                border: none;
                padding: 0;
                animation: fadeIn 0.35s ease-out;
            }

            /* Tabela */
            .ppl-tabela-wrapper {
                margin-bottom: 16px;
                border-radius: 8px;
                overflow: hidden;
                border: 1px solid #e9ecef;
                animation: fadeIn 0.35s ease-out;
            }
            #painel-pacientes-lateral table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12.5px;
                background: white;
            }
            #painel-pacientes-lateral th,
            #painel-pacientes-lateral td {
                padding: 10px;
                border-bottom: 1px solid #e9ecef;
                text-align: left;
            }
            #painel-pacientes-lateral th {
                background: #f0f6ff;
                position: sticky;
                top: 0;
                font-weight: 700;
                color: #007bff;
                z-index: 10;
            }
            #painel-pacientes-lateral tbody tr {
                transition: background-color 0.2s ease;
            }
            #painel-pacientes-lateral tbody tr:hover {
                background: #f8f9fa;
            }

            /* Colorações por área do prontuário */
            .area-azul    { color: #007bff !important; font-weight: 700 !important; }
            .area-rosa    { color: #e83e8c !important; font-weight: 700 !important; }
            .area-laranja { color: #fd7e14 !important; font-weight: 700 !important; }
            .area-verde   { color: #28a745 !important; font-weight: 700 !important; }

            /* Responsividade */
            @media (max-width: 1000px) {
                #painel-pacientes-lateral { width: 100% !important; right: -100% !important; }
                #busca-status-spinner     { right: 50% !important; }
            }
            @media (max-width: 768px) {
                #floating-search-button {
                    bottom: 15px;
                    left: 50%;
                    margin: 0 auto;
                    padding: 12px 20px;
                    font-size: 0.95em;
                }
                #busca-status-spinner { font-size: 0.9em; }
            }
        `;

        document.head.appendChild(style);
    }

    // ===== INICIALIZAÇÃO =====
    function init() {
        injectStyles();
        AgendaInterceptor.install();
        console.log(`✨ Busca Pacientes v3.0 | Ambiente: ${ENV.isHomolog ? 'HOMOLOGAÇÃO' : 'PRODUÇÃO'}`);
        console.log(`   API: ${CONFIG.api.url}`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
