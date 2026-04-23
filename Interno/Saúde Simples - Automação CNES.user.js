// ==UserScript==
// @name         Saúde Simples - Automação CNES
// @namespace    https://guaruja.saudesimples.net/
// @version      2.0.0
// @description  Busca dados no CNES e CADSUS pelo CPF e preenche o formulário automaticamente
// @author       Guarujá SMSB
// @match        https://guarujahomolog.saudesimples.net/profissionais/new
// @match        https://guaruja.saudesimples.net/profissionais/new
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      cnes.datasus.gov.br
// @connect      v3apiguaruja.saudesimples.net
// @connect      wscadsus.saudesimples.net
// ==/UserScript==

(function () {
    'use strict';

    GM_addStyle(`
        #cnes-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.55);
            z-index: 99998;
            display: flex; align-items: center; justify-content: center;
        }
        #cnes-modal {
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.22);
            width: 700px; max-width: 96vw;
            max-height: 92vh;
            display: flex; flex-direction: column;
            font-family: system-ui, sans-serif;
            font-size: 14px; color: #222;
        }
        #cnes-modal-header {
            padding: 18px 24px 14px;
            border-bottom: 1px solid #e5e7eb;
            display: flex; align-items: center; justify-content: space-between;
            flex-shrink: 0;
        }
        #cnes-modal-header h2 {
            margin: 0; font-size: 17px; font-weight: 600; color: #1a56db;
            display: flex; align-items: center; gap: 8px;
        }
        #cnes-close-btn {
            background: none; border: none; font-size: 22px; cursor: pointer;
            color: #6b7280; line-height: 1; padding: 0 4px;
        }
        #cnes-close-btn:hover { color: #111; }
        #cnes-steps {
            display: flex; align-items: center;
            padding: 11px 24px; border-bottom: 1px solid #e5e7eb;
            flex-shrink: 0; background: #f9fafb;
        }
        .cnes-step { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: #9ca3af; }
        .cnes-step.active { color: #1a56db; }
        .cnes-step.done   { color: #166534; }
        .cnes-step-num {
            width: 24px; height: 24px; border-radius: 50%;
            background: #e5e7eb; color: #6b7280;
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 700; flex-shrink: 0;
        }
        .cnes-step.active .cnes-step-num { background: #1a56db; color: #fff; }
        .cnes-step.done   .cnes-step-num { background: #166534; color: #fff; }
        .cnes-step-sep { flex: 1; height: 1px; background: #e5e7eb; margin: 0 12px; }
        #cnes-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
        #cnes-body::-webkit-scrollbar { width: 6px; }
        #cnes-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .cnes-field-group { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
        .cnes-field-group input[type=text] {
            flex: 1; padding: 9px 13px; border: 1.5px solid #d1d5db;
            border-radius: 8px; font-size: 15px; outline: none;
            transition: border-color .2s; background: #fff; color: #111;
        }
        .cnes-field-group input[type=text]:focus { border-color: #1a56db; }
        .cnes-btn {
            padding: 9px 20px; border-radius: 8px; font-size: 14px;
            font-weight: 500; cursor: pointer; border: none; white-space: nowrap;
            transition: background .15s;
        }
        .cnes-btn-primary   { background: #1a56db; color: #fff; }
        .cnes-btn-primary:hover   { background: #1447b8; }
        .cnes-btn-primary:disabled { background: #93aee8; cursor: not-allowed; }
        .cnes-btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
        .cnes-btn-secondary:hover { background: #e5e7eb; }
        .cnes-btn-success   { background: #166534; color: #fff; }
        .cnes-btn-success:hover   { background: #14532d; }
        .cnes-btn-success:disabled { background: #86efac; cursor: not-allowed; }
        #cnes-status { margin-bottom: 12px; font-size: 13px; min-height: 20px; color: #6b7280; }
        #cnes-status.error   { color: #dc2626; }
        #cnes-status.loading { color: #1a56db; }
        .cnes-professional-info {
            background: #eff6ff; border: 1px solid #bfdbfe;
            border-radius: 8px; padding: 12px 16px; margin-bottom: 14px;
        }
        .cnes-professional-info p { margin: 0 0 3px; font-size: 13px; }
        .cnes-professional-info strong { color: #1e40af; }
        .cnes-vinculos-title {
            font-weight: 700; font-size: 11px; margin-bottom: 8px; color: #6b7280;
            text-transform: uppercase; letter-spacing: .05em;
        }
        .cnes-vinculos-list { display: flex; flex-direction: column; gap: 8px; }
        .cnes-vinculo-card {
            border: 1.5px solid #e5e7eb; border-radius: 9px;
            padding: 11px 14px; cursor: pointer; position: relative;
            transition: border-color .15s, background .15s;
        }
        .cnes-vinculo-card:hover   { border-color: #1a56db; background: #f0f7ff; }
        .cnes-vinculo-card.selected {
            border-color: #1a56db; background: #eff6ff;
            box-shadow: 0 0 0 3px rgba(26,86,219,0.12);
        }
        .vc-unidade { font-weight: 600; font-size: 13px; color: #1e3a8a; margin-bottom: 3px; padding-right: 65px; }
        .vc-cbo     { font-size: 12px; color: #374151; }
        .vc-meta    { font-size: 11px; color: #6b7280; display: flex; gap: 12px; margin-top: 5px; flex-wrap: wrap; }
        .vc-badge {
            position: absolute; top: 9px; right: 11px;
            font-size: 10px; padding: 2px 7px; border-radius: 20px;
            background: #dcfce7; color: #166534; font-weight: 600;
        }
        .cnes-check {
            position: absolute; top: 9px; right: 36px;
            width: 18px; height: 18px; border-radius: 50%;
            background: #1a56db; display: none;
            align-items: center; justify-content: center;
        }
        .cnes-vinculo-card.selected .cnes-check { display: flex; }
        .cnes-check svg { width: 10px; height: 10px; }
        .cadsus-section-label {
            font-size: 11px; font-weight: 700; color: #6b7280;
            text-transform: uppercase; letter-spacing: .06em;
            margin: 0 0 10px;
        }
        .cadsus-info-box {
            background: #f0fdf4; border: 1px solid #bbf7d0;
            border-radius: 8px; padding: 11px 15px; margin-bottom: 14px;
        }
        .cadsus-info-box p { margin: 0 0 3px; font-size: 13px; }
        .cadsus-info-box strong { color: #166534; }
        .cadsus-warn-box {
            background: #fefce8; border: 1px solid #fde68a;
            border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;
            font-size: 13px; color: #92400e;
        }
        .cadsus-form-grid {
            display: grid; grid-template-columns: 1fr 1fr; gap: 11px 16px; margin-bottom: 11px;
        }
        .cadsus-form-grid.full { grid-template-columns: 1fr; }
        .cadsus-field label {
            display: block; font-size: 11px; font-weight: 700; color: #6b7280;
            margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em;
        }
        .cadsus-field input[type=text] {
            width: 100%; box-sizing: border-box;
            padding: 8px 11px; border: 1.5px solid #d1d5db;
            border-radius: 7px; font-size: 14px; outline: none;
            transition: border-color .2s; background: #fff; color: #111;
        }
        .cadsus-field input[type=text]:focus { border-color: #1a56db; }
        .cadsus-field input.empty { border-color: #fca5a5; background: #fff1f2; }
        .cnes-modal-footer {
            padding: 12px 24px 16px; border-top: 1px solid #e5e7eb;
            display: flex; justify-content: space-between; align-items: center;
            gap: 10px; flex-shrink: 0;
        }
        .cnes-footer-right { display: flex; gap: 10px; }
        #cnes-trigger-btn {
            position: fixed; bottom: 24px; right: 24px; z-index: 99990;
            background: #1a56db; color: #fff;
            border: none; border-radius: 50px;
            padding: 11px 20px; font-size: 14px; font-weight: 600;
            cursor: pointer; box-shadow: 0 4px 14px rgba(26,86,219,0.35);
            display: flex; align-items: center; gap: 8px;
        }
        #cnes-trigger-btn:hover { background: #1447b8; }
    `);

    // ─── ESTADO ───────────────────────────────────
    let state = resetState();
    function resetState() {
        return {
            cpf: '', step: 1,
            profissional: null, cnesDetail: null,
            vinculos: [], selected: null,
            editCep: '', editNumero: '', editNascimento: '',
            editNomeMae: '', editNomePai: '', editTelefone: '',
        };
    }

    // ─── HELPERS ──────────────────────────────────
    function formatCPF(v) {
        return v.replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    function rawCPF(v) { return v.replace(/\D/g, ''); }
    function formatDate(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    }
    function esc(s) { return (s || '').replace(/"/g, '&quot;'); }
    function emptyClass(val) { return val ? '' : 'empty'; }

    // ─── GET (CNES / DataSUS) ─────────────────────
    function gmGet(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url,
                headers: {
                    'Accept': 'application/json',
                    'Referer': 'https://cnes.datasus.gov.br/',
                    'Origin':  'https://cnes.datasus.gov.br',
                },
                onload(r) {
                    if (r.status === 200 || r.status === 304) {
                        try { resolve(JSON.parse(r.responseText)); }
                        catch (e) { reject(new Error('Resposta inválida — não é JSON')); }
                    } else if (r.status === 404) {
                        resolve(null);
                    } else if (r.status === 0) {
                        reject(new Error('Sem resposta (status 0) — verifique @connect no script'));
                    } else {
                        reject(new Error(`Erro HTTP ${r.status}`));
                    }
                },
                onerror()   { reject(new Error('Falha de conexão com o CNES')); },
                ontimeout() { reject(new Error('Tempo limite excedido')); },
                timeout: 15000,
            });
        });
    }

    // ─── POST (CADSUS) ────────────────────────────
    function gmPost(url, payload) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST', url,
                headers: {
                    'Accept':       'application/json',
                    'Content-Type': 'application/json',
                    'Referer': 'https://guaruja.saudesimples.net/',
                    'Origin':  'https://guaruja.saudesimples.net',
                },
                data: JSON.stringify(payload),
                onload(r) {
                    if (r.status === 200 || r.status === 201) {
                        try { resolve(JSON.parse(r.responseText)); }
                        catch (e) { reject(new Error('Resposta inválida do CADSUS')); }
                    } else if (r.status === 404) {
                        resolve(null);
                    } else if (r.status === 0) {
                        reject(new Error('Sem resposta (status 0) — verifique @connect no script'));
                    } else {
                        reject(new Error(`Erro HTTP ${r.status} no CADSUS`));
                    }
                },
                onerror()   { reject(new Error('Falha de conexão com o CADSUS')); },
                ontimeout() { reject(new Error('Tempo limite excedido')); },
                timeout: 1,
            });
        });
    }

    // ─── MODAL ────────────────────────────────────
    function buildModal() {
        const overlay = document.createElement('div');
        overlay.id = 'cnes-overlay';
        overlay.innerHTML = `
          <div id="cnes-modal" role="dialog" aria-modal="true" aria-labelledby="cnes-modal-title">
            <div id="cnes-modal-header">
              <h2 id="cnes-modal-title">
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                  <circle cx="9" cy="9" r="6" stroke="#1a56db" stroke-width="2"/>
                  <path d="M13.5 13.5L17 17" stroke="#1a56db" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Busca CNES + CADSUS
              </h2>
              <button id="cnes-close-btn" title="Fechar">&#x2715;</button>
            </div>
            <div id="cnes-steps">
              <div class="cnes-step active" id="si-1">
                <div class="cnes-step-num" id="si-1-num">1</div>
                <span>CNES &#8212; V&#237;nculo</span>
              </div>
              <div class="cnes-step-sep"></div>
              <div class="cnes-step" id="si-2">
                <div class="cnes-step-num" id="si-2-num">2</div>
                <span>CADSUS &#8212; Dados complementares</span>
              </div>
            </div>
            <div id="cnes-body">
              <div id="area-step1">
                <div class="cnes-field-group">
                  <input type="text" id="cnes-cpf-input"
                    placeholder="Digite o CPF  (000.000.000-00)"
                    maxlength="14" autocomplete="off"/>
                  <button class="cnes-btn cnes-btn-primary" id="cnes-search-btn">Buscar</button>
                </div>
                <div id="cnes-status"></div>
                <div id="cnes-result-area"></div>
              </div>
              <div id="area-step2" style="display:none"></div>
            </div>
            <div class="cnes-modal-footer">
              <div id="footer-left"></div>
              <div class="cnes-footer-right">
                <button class="cnes-btn cnes-btn-secondary" id="cnes-cancel-btn">Cancelar</button>
                <button class="cnes-btn cnes-btn-primary"   id="btn-next"    disabled>Pr&#243;ximo &#8594;</button>
                <button class="cnes-btn cnes-btn-success"   id="btn-confirm" style="display:none" disabled>
                  &#10003; Preencher formul&#225;rio
                </button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        document.getElementById('cnes-close-btn').addEventListener('click', closeModal);
        document.getElementById('cnes-cancel-btn').addEventListener('click', closeModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

        const cpfInput = document.getElementById('cnes-cpf-input');
        cpfInput.addEventListener('input', () => { cpfInput.value = formatCPF(cpfInput.value); });
        cpfInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('cnes-search-btn').click(); });

        document.getElementById('cnes-search-btn').addEventListener('click', handleSearchCNES);
        document.getElementById('btn-next').addEventListener('click', goToStep2);
        document.getElementById('btn-confirm').addEventListener('click', handleConfirm);

        setTimeout(() => cpfInput.focus(), 100);
    }

    function closeModal() {
        const ov = document.getElementById('cnes-overlay');
        if (ov) ov.remove();
        state = resetState();
    }

    function setStatus(msg, type) {
        const el = document.getElementById('cnes-status');
        if (!el) return;
        el.textContent = msg;
        el.className = type || '';
    }

    // ─── ETAPA 1 — CNES ───────────────────────────
    async function handleSearchCNES() {
        const raw = rawCPF(document.getElementById('cnes-cpf-input').value);
        if (raw.length !== 11) { setStatus('Aviso: CPF invalido. Informe os 11 digitos.', 'error'); return; }
        state.cpf = raw;

        const btn = document.getElementById('cnes-search-btn');
        btn.disabled = true; btn.textContent = 'Buscando...';
        setStatus('Consultando CNES...', 'loading');
        document.getElementById('cnes-result-area').innerHTML = '';
        document.getElementById('btn-next').disabled = true;

        try {
            const list = await gmGet(`https://cnes.datasus.gov.br/services/profissionais?cpf=${raw}`);
            if (!list || !list.length) {
                setStatus('Profissional nao encontrado no CNES para este CPF.', 'error');
                return;
            }
            state.profissional = list[0];

            const detail = await gmGet(`https://cnes.datasus.gov.br/services/profissionais/${list[0].id}`);
            if (!detail) { setStatus('Nao foi possivel obter detalhes do profissional.', 'error'); return; }
            state.cnesDetail = detail;

            const vinculos = (detail.vinculos || []).filter(
                v => v.noMun && v.noMun.toUpperCase().includes('GUARUJA')
            );
            state.vinculos = vinculos;
            setStatus('');
            renderVinculos(detail, vinculos);
        } catch (err) {
            setStatus('Erro: ' + err.message, 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'Buscar';
        }
    }

    function renderVinculos(detail, vinculos) {
        const area = document.getElementById('cnes-result-area');
        let html = `<div class="cnes-professional-info">
            <p><strong>Nome:</strong> ${detail.nome || '&mdash;'}</p>
            <p><strong>CNS:</strong> ${detail.cns || '&mdash;'}</p>
            <p><strong>Competencia:</strong> ${detail.cmptAtual || '&mdash;'}</p>
          </div>`;

        if (!vinculos.length) {
            html += `<p style="color:#6b7280;font-size:13px;margin:0">
                Nenhum vinculo ativo em Guaruja. Prossiga para buscar dados complementares.
            </p>`;
            area.innerHTML = html;
            document.getElementById('btn-next').disabled = false;
            return;
        }

        html += `<div class="cnes-vinculos-title">Selecione o vinculo desejado:</div>
                 <div class="cnes-vinculos-list">`;
        vinculos.forEach((v, i) => {
            html += `
              <div class="cnes-vinculo-card" data-index="${i}" tabindex="0"
                   role="button" aria-pressed="false">
                <div class="vc-unidade">${v.noFant || v.cnes}</div>
                <div class="vc-cbo">${v.dsCbo || '&mdash;'}</div>
                <div class="vc-meta">
                  <span>CNES: <strong>${v.cnes}</strong></span>
                  <span>CBO: <strong>${v.cbo}</strong></span>
                  <span>C.H. Amb: <strong>${v.chAmb}h</strong></span>
                  <span>${v.vinculo || ''}</span>
                </div>
                <span class="vc-badge">${v.tpSusNaoSus === 'S' ? 'SUS' : 'Nao-SUS'}</span>
                <span class="cnes-check">
                  <svg viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="#fff" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </div>`;
        });
        html += `</div>`;
        area.innerHTML = html;

        area.querySelectorAll('.cnes-vinculo-card').forEach(card => {
            card.addEventListener('click', () => selectCard(card));
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') selectCard(card);
            });
        });
    }

    function selectCard(card) {
        document.querySelectorAll('.cnes-vinculo-card').forEach(c => {
            c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('selected'); card.setAttribute('aria-pressed', 'true');
        state.selected = state.vinculos[parseInt(card.dataset.index, 10)];
        document.getElementById('btn-next').disabled = false;
    }

    // ─── TRANSICAO ETAPA 1 -> 2 ───────────────────
    async function goToStep2() {
        const si1 = document.getElementById('si-1');
        si1.classList.remove('active'); si1.classList.add('done');
        document.getElementById('si-1-num').textContent = '\u2713';
        document.getElementById('si-2').classList.add('active');

        document.getElementById('area-step1').style.display = 'none';
        document.getElementById('area-step2').style.display = 'block';
        document.getElementById('btn-next').style.display = 'none';
        document.getElementById('btn-confirm').style.display = 'inline-block';

        const fl = document.getElementById('footer-left');
        fl.innerHTML = '';
        const backBtn = document.createElement('button');
        backBtn.className = 'cnes-btn cnes-btn-secondary';
        backBtn.textContent = '\u2190 Voltar';
        backBtn.addEventListener('click', goToStep1);
        fl.appendChild(backBtn);

        await loadCadsus();
    }

    function goToStep1() {
        const si1 = document.getElementById('si-1');
        si1.classList.add('active'); si1.classList.remove('done');
        document.getElementById('si-1-num').textContent = '1';
        document.getElementById('si-2').classList.remove('active');

        document.getElementById('area-step1').style.display = 'block';
        document.getElementById('area-step2').style.display = 'none';
        document.getElementById('area-step2').innerHTML = '';

        document.getElementById('btn-next').style.display = 'inline-block';
        document.getElementById('btn-next').disabled = !state.selected && state.vinculos.length > 0;
        document.getElementById('btn-confirm').style.display = 'none';
        document.getElementById('footer-left').innerHTML = '';
    }

    // ─── ETAPA 2 — CADSUS ─────────────────────────
    // Estratégia: tenta v3apiguaruja (GET, usa cookies da sessão) como primário.
    // Se falhar ou não retornar dados, tenta wscadsus (POST) como fallback.
    async function loadCadsus() {
    const area = document.getElementById('area-step2');

    // Aviso simples
    area.innerHTML = `
        <div class="cadsus-warn-box" style="text-align:center; font-size:14px;">
            <strong>Consulta ao CADSUS temporariamente desativada.</strong><br>
            Prosseguir apenas com os dados do CNES.
        </div>
    `;

    // Limpa qualquer dado antigo
    state.editCep        = '';
    state.editNumero     = '';
    state.editNascimento = '';
    state.editNomeMae    = '';
    state.editNomePai    = '';
    state.editTelefone   = '';

    // Libera botão de confirmar
    document.getElementById('btn-confirm').disabled = false;
}

    /**
     * GET para v3apiguaruja — envia cookies da sessão do site (anonymous: false).
     * O Tampermonkey injeta os cookies do domínio automaticamente com cookie:true.
     */
    function gmGetV3(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url,
                headers: {
                    'Accept':  'application/json',
                    'Referer': 'https://guaruja.saudesimples.net/',
                    'Origin':  'https://guaruja.saudesimples.net',
                },
                cookie: true,
                onload(r) {
                    if (r.status === 200 || r.status === 304) {
                        try { resolve(JSON.parse(r.responseText)); }
                        catch (e) { reject(new Error('Resposta inválida do v3api')); }
                    } else if (r.status === 404) {
                        resolve(null);
                    } else if (r.status === 401 || r.status === 403) {
                        reject(new Error('Sessao expirada ou sem permissao (' + r.status + ')'));
                    } else if (r.status === 0) {
                        reject(new Error('Sem resposta (status 0)'));
                    } else {
                        reject(new Error('HTTP ' + r.status));
                    }
                },
                onerror()   { reject(new Error('Falha de conexao com v3apiguaruja')); },
                ontimeout() { reject(new Error('Tempo limite excedido')); },
                timeout: 1,
            });
        });
    }

    /**
     * Normaliza o objeto do v3apiguaruja para o mesmo formato do wscadsus,
     * garantindo que os campos esperados existam com os nomes corretos.
     * O v3 não retorna nome_pai, então deixamos vazio.
     */
    function normalizeV3(v3) {
        return {
            nome:               v3.nome                || '',
            residencia_cep:     v3.residencia_cep      || '',
            residencia_numero:  v3.residencia_numero    || '',
            data_nascimento:    v3.data_nascimento      || '',
            nome_mae:           v3.nome_mae             || '',
            nome_pai:           '',   // v3 não retorna nome_pai
            telefone_celular:   v3.telefone_celular     || '',
            sexo:               v3.sexo || null,
            residencia_municipio: v3.residencia_municipio || null,
            raca_cor:           null,
        };
    }

    /**
     * Garante formato "(XX) XXXXX-XXXX".
     * O v3 retorna "(13)99742-3127" (sem espaço), o wscadsus retorna "(13) 99742-3127".
     */
    function normalizeTelefone(tel) {
        if (!tel) return '';
        const digits = tel.replace(/\D/g, '');
        if (digits.length === 11) {
            return '(' + digits.slice(0,2) + ') ' + digits.slice(2,7) + '-' + digits.slice(7);
        }
        if (digits.length === 10) {
            return '(' + digits.slice(0,2) + ') ' + digits.slice(2,6) + '-' + digits.slice(6);
        }
        return tel; // retorna original se não reconhecido
    }

    function renderStep2(found) {
        const area   = document.getElementById('area-step2');
        const detail = state.cnesDetail;
        const p      = state.profissional;
        const v      = state.selected;

        let html = '';

        // Resumo CNES
        html += `<div class="cnes-professional-info" style="margin-bottom:14px">
            <p><strong>Profissional:</strong> ${detail ? detail.nome : (p ? p.nome : '&mdash;')}</p>
            <p><strong>CNS:</strong> ${detail ? detail.cns : (p ? p.cns : '&mdash;')}</p>`;
        if (v) {
            html += `<p><strong>Unidade:</strong> ${v.noFant} <span style="color:#6b7280">(CNES ${v.cnes})</span></p>
                     <p><strong>Funcao:</strong> ${v.dsCbo} <span style="color:#6b7280">(CBO ${v.cbo})</span></p>`;
        }
        html += `</div>`;

        // Status CADSUS
        if (!found) {
            html += `<div class="cadsus-warn-box">
                CPF nao encontrado no CADSUS. Preencha os dados manualmente.
            </div>`;
        } else {
            html += `<div class="cadsus-info-box">
                <p><strong>Encontrado no CADSUS:</strong> ${found.nome}</p>
                <p>
                  <strong>Nasc.:</strong> ${formatDate(found.data_nascimento)}
                  &nbsp;|&nbsp;
                  <strong>Sexo:</strong> ${found.sexo ? found.sexo.nome : '&mdash;'}
                  ${found.raca_cor ? '&nbsp;|&nbsp;<strong>Raca/Cor:</strong> ' + found.raca_cor.nome : ''}
                </p>
                ${found.residencia_municipio
                    ? '<p><strong>Municipio:</strong> ' + found.residencia_municipio.nome + ' / ' + found.residencia_municipio.uf + '</p>'
                    : ''}
            </div>`;
        }

        // Formulario editavel
        html += `<p class="cadsus-section-label">Confirme ou edite os dados complementares:</p>
          <div class="cadsus-form-grid">
            <div class="cadsus-field">
              <label>CEP</label>
              <input type="text" id="ed-cep" value="${esc(state.editCep)}"
                class="${emptyClass(state.editCep)}"
                placeholder="00000-000" maxlength="9"/>
            </div>
            <div class="cadsus-field">
              <label>Numero de residencia</label>
              <input type="text" id="ed-numero" value="${esc(state.editNumero)}"
                class="${emptyClass(state.editNumero)}"
                placeholder="Ex: 152"/>
            </div>
            <div class="cadsus-field">
              <label>Data de nascimento</label>
              <input type="text" id="ed-nasc" value="${esc(state.editNascimento)}"
                class="${emptyClass(state.editNascimento)}"
                placeholder="DD/MM/AAAA" maxlength="10"/>
            </div>
            <div class="cadsus-field">
              <label>Telefone celular</label>
              <input type="text" id="ed-tel" value="${esc(state.editTelefone)}"
                class="${emptyClass(state.editTelefone)}"
                placeholder="(00) 00000-0000" maxlength="15"/>
            </div>
          </div>
          <div class="cadsus-form-grid full">
            <div class="cadsus-field">
              <label>Nome da mae</label>
              <input type="text" id="ed-mae" value="${esc(state.editNomeMae)}"
                class="${emptyClass(state.editNomeMae)}"
                placeholder="Nome completo da mae"/>
            </div>
          </div>
          <div class="cadsus-form-grid full">
            <div class="cadsus-field">
              <label>Nome do pai</label>
              <input type="text" id="ed-pai" value="${esc(state.editNomePai)}"
                placeholder="Nome completo do pai (opcional)"/>
            </div>
          </div>`;

        area.innerHTML = html;

        // Bind edicao em tempo real
        function bindEdit(id, fn) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', e => fn(e.target.value));
        }
        bindEdit('ed-cep',    val => state.editCep        = val);
        bindEdit('ed-numero', val => state.editNumero      = val);
        bindEdit('ed-nasc',   val => state.editNascimento  = val);
        bindEdit('ed-tel',    val => state.editTelefone    = val);
        bindEdit('ed-mae',    val => state.editNomeMae     = val);
        bindEdit('ed-pai',    val => state.editNomePai     = val);

        document.getElementById('btn-confirm').disabled = false;
    }

    // ─── CONFIRMACAO FINAL ────────────────────────
    function handleConfirm() {
        const detail = state.cnesDetail;
        const p      = state.profissional;
        const v      = state.selected;
        const nome   = detail ? detail.nome : (p ? p.nome : '');
        const cns    = detail ? detail.cns  : (p ? p.cns  : '');

        // Campos simples — CNES
        fillSimple('#profissional_nome',        nome);
        fillSimple('#profissional_codigo_cns',  cns);
        fillSimple('#profissional_cpf_numero',  formatCPF(state.cpf));

        // Campos simples — CADSUS
        fillSimple('#profissional_residencia_cep',    state.editCep);
        fillSimple('#profissional_residencia_numero', state.editNumero);
        fillSimple('#profissional_data_nascimento',   state.editNascimento);
        fillSimple('#profissional_nome_mae',          state.editNomeMae);
        fillSimple('#profissional_nome_pai',          state.editNomePai);
        fillSimple('#profissional_telefone_celular',  state.editTelefone);

        // Token inputs — CBO e Unidade
        if (v) {
            fillTokenInput('#token-input-profissional_ocupacao_token', v.cbo,  v.dsCbo);
            fillTokenInput('#token-input-profissional_unidade_token',  v.cnes, v.noFant);
        }

        closeModal();
        showToast('Dados de ' + (nome.split(' ')[0] || 'profissional') + ' preenchidos!');

        // Clica no botao de avanco (aguarda token inputs processarem)
        setTimeout(() => {
            const advBtn = document.querySelector('#ocupacao > div.grid_2 > a');
            if (advBtn) {
                advBtn.click();
            } else {
                console.warn('[CNES] Botao #ocupacao > div.grid_2 > a nao encontrado.');
            }
        }, 1800);
    }

    // ─── FILL HELPERS ─────────────────────────────
    function fillSimple(selector, value) {
        const el = document.querySelector(selector);
        if (!el) { console.warn('[CNES] Campo nao encontrado: ' + selector); return; }
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
            .set.call(el, value || '');
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function fillTokenInput(inputSelector, searchValue, displayHint) {
        const input = document.querySelector(inputSelector);
        if (!input) { console.warn('[CNES] Token input nao encontrado: ' + inputSelector); return; }

        // Remove tokens existentes
        const list = input.closest('ul.token-input-list, ul[class*="token-input-list"]');
        if (list) {
            list.querySelectorAll('li.token-input-token, li[class*="token-input-token"]')
                .forEach(tok => { const d = tok.querySelector('p,span,a'); if (d) d.click(); });
        }

        input.focus();
        input.value = '';

        const chars = String(searchValue).split('');
        chars.forEach((ch, i) => {
            setTimeout(() => {
                input.value += ch;
                input.dispatchEvent(new KeyboardEvent('keydown',  { key: ch, bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true }));
                input.dispatchEvent(new InputEvent('input',       { bubbles: true, data: ch }));
                input.dispatchEvent(new KeyboardEvent('keyup',    { key: ch, bubbles: true }));
            }, i * 30);
        });

        setTimeout(() => {
            const dd = document.querySelector('.token-input-dropdown, [class*="token-input-dropdown"]');
            if (dd) {
                const first = dd.querySelector('li:not(.token-input-dropdown-item-disabled)');
                if (first) { first.click(); return; }
            }
            if (window.jQuery) {
                const $i = window.jQuery(inputSelector);
                if ($i.length && typeof $i.tokenInput === 'function') {
                    try { $i.tokenInput('add', { id: searchValue, name: displayHint || searchValue }); return; }
                    catch (e) { /* segue */ }
                }
            }
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            console.warn('[CNES] Token "' + searchValue + '" confirmado via Enter. Verifique se foi selecionado.');
        }, chars.length * 30 + 700);
    }

    // ─── TOAST ────────────────────────────────────
    function showToast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        Object.assign(t.style, {
            position: 'fixed', bottom: '24px', left: '50%',
            transform: 'translateX(-50%)',
            background: '#166534', color: '#fff',
            padding: '12px 24px', borderRadius: '8px',
            fontSize: '14px', fontWeight: '500',
            zIndex: '999999', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'opacity .4s',
        });
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; }, 2800);
        setTimeout(() => t.remove(), 3300);
    }

    // ─── BOTAO FLUTUANTE + INIT ───────────────────
    function addTriggerButton() {
        const btn = document.createElement('button');
        btn.id = 'cnes-trigger-btn';
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="white" stroke-width="2"/>
              <path d="M13.5 13.5L17 17" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg> Buscar no CNES`;
        btn.title = 'Pesquisar profissional pelo CPF no CNES + CADSUS';
        btn.addEventListener('click', () => {
            if (!document.getElementById('cnes-overlay')) buildModal();
        });
        document.body.appendChild(btn);
    }

    function init() {
        addTriggerButton();
        // Abre automaticamente ao carregar a pagina.
        // Comente as 3 linhas abaixo para abrir apenas pelo botao flutuante.
        setTimeout(() => {
            if (!document.getElementById('cnes-overlay')) buildModal();
        }, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
