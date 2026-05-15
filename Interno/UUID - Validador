// ==UserScript==
// @name         UUID Validator - Saúde Simples
// @namespace    om30-saudesimples
// @version      1.2.0
// @description  Valida UUIDs via arquivo CSV na tela de correções cadastrais individuais
// @match        https://guaruja.saudesimples.net/esus/correcoes_cadastros_individuais*
// @grant        GM_xmlhttpRequest
// @connect      guaruja.saudesimples.net
// ==/UserScript==

(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    #uvp {
      position: fixed; top: 20px; right: 20px; z-index: 99999;
      width: 430px; background: #1a1a2e; color: #e0e0e0;
      border: 1px solid #ff6a00; border-radius: 8px;
      font-family: 'Segoe UI', sans-serif; font-size: 13px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.55);
      display: flex; flex-direction: column; overflow: hidden;
    }
    #uvp-header {
      background: #ff6a00; color: #fff; padding: 10px 14px;
      font-weight: 700; font-size: 14px; cursor: move;
      display: flex; align-items: center; justify-content: space-between;
      user-select: none;
    }
    #uvp-toggle {
      background: none; border: none; color: #fff;
      font-size: 20px; cursor: pointer; line-height: 1; padding: 0;
    }
    #uvp-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    #uvp.collapsed #uvp-body { display: none; }
    #uvp-dropzone {
      border: 2px dashed #ff6a00; border-radius: 6px;
      padding: 18px 12px; text-align: center; cursor: pointer;
      color: #aaa; background: #12122a; transition: background 0.2s, color 0.2s;
      position: relative;
    }
    #uvp-dropzone.dragover { background: #1f1f3a; color: #fff; }
    #uvp-dropzone.has-file { border-style: solid; color: #3fb950; }
    #uvp-dropzone input[type=file] {
      position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
    }
    #uvp-dropzone .dz-icon  { font-size: 22px; display: block; margin-bottom: 6px; }
    #uvp-dropzone .dz-label { font-size: 12px; }
    #uvp-run {
      background: #ff6a00; color: #fff; border: none; border-radius: 4px;
      padding: 8px 16px; font-weight: 700; cursor: pointer; font-size: 13px;
      transition: opacity 0.2s;
    }
    #uvp-run:disabled { opacity: 0.45; cursor: not-allowed; }
    #uvp-status { font-size: 12px; color: #aaa; min-height: 16px; }
    #uvp-bar-wrap { background: #12122a; border-radius: 4px; height: 8px; overflow: hidden; }
    #uvp-bar      { height: 100%; width: 0%; background: #ff6a00; transition: width 0.15s; }
    #uvp-log {
      max-height: 180px; overflow-y: auto; background: #12122a;
      border: 1px solid #2a2a3e; border-radius: 4px; padding: 6px 8px;
      font-size: 11px; line-height: 1.7; display: none; font-family: monospace;
    }
    #uvp-log .ok   { color: #3fb950; }
    #uvp-log .err  { color: #f85149; }
    #uvp-log .info { color: #79c0ff; }
    #uvp-log .warn { color: #e3b341; }
    #uvp-summary {
      display: none; background: #12122a; border: 1px solid #2a2a3e;
      border-radius: 4px; padding: 10px 12px; font-size: 13px; line-height: 1.9;
    }
    #uvp-summary .val   { color: #3fb950; font-weight: 700; }
    #uvp-summary .nval  { color: #f85149; font-weight: 700; }
    #uvp-summary .total { color: #ff6a00; font-weight: 700; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'uvp';
  panel.innerHTML = `
    <div id="uvp-header">
      <span>🔍 UUID Validator</span>
      <button id="uvp-toggle" title="Minimizar">−</button>
    </div>
    <div id="uvp-body">
      <div id="uvp-dropzone">
        <input type="file" id="uvp-file-input" accept=".csv,.txt,.tsv">
        <span class="dz-icon">📂</span>
        <span class="dz-label">Clique ou arraste o arquivo CSV aqui</span>
      </div>
      <button id="uvp-run" disabled>▶ Processar</button>
      <div id="uvp-status">Aguardando arquivo…</div>
      <div id="uvp-bar-wrap"><div id="uvp-bar"></div></div>
      <div id="uvp-log"></div>
      <div id="uvp-summary"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const fileInput = document.getElementById('uvp-file-input');
  const dropzone  = document.getElementById('uvp-dropzone');
  const runBtn    = document.getElementById('uvp-run');
  const statusEl  = document.getElementById('uvp-status');
  const barEl     = document.getElementById('uvp-bar');
  const logEl     = document.getElementById('uvp-log');
  const summaryEl = document.getElementById('uvp-summary');

  let parsedUUIDs = [];

  document.getElementById('uvp-toggle').addEventListener('click', () => {
    const c = panel.classList.toggle('collapsed');
    document.getElementById('uvp-toggle').textContent = c ? '+' : '−';
  });

  const hdr = document.getElementById('uvp-header');
  let dragging = false, ox = 0, oy = 0;
  hdr.addEventListener('mousedown', e => {
    if (e.target.id === 'uvp-toggle') return;
    dragging = true;
    ox = e.clientX - panel.offsetLeft;
    oy = e.clientY - panel.offsetTop;
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.right = 'unset';
    panel.style.left = (e.clientX - ox) + 'px';
    panel.style.top  = (e.clientY - oy) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  // CSV separado por ";" — coluna G = índice 6
  const UUID_RE = /^[\w]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function parseUUIDs(text) {
    const seen = new Set();
    for (const line of text.split('\n')) {
      const cols = line.split(';');
      const uuid = (cols[6] || '').trim().replace(/"/g, '');
      if (uuid && UUID_RE.test(uuid)) seen.add(uuid);
    }
    return [...seen];
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      parsedUUIDs = parseUUIDs(text);
      dropzone.classList.add('has-file');
      dropzone.querySelector('.dz-icon').textContent  = '✅';
      dropzone.querySelector('.dz-label').textContent =
        `${file.name}  (${parsedUUIDs.length} UUID${parsedUUIDs.length !== 1 ? 's' : ''} encontrado${parsedUUIDs.length !== 1 ? 's' : ''})`;
      runBtn.disabled = parsedUUIDs.length === 0;
      setStatus(
        parsedUUIDs.length
          ? `Pronto para processar ${parsedUUIDs.length} UUID(s).`
          : '⚠ Nenhum UUID encontrado na coluna G.'
      );
    };
    // ISO-8859-1 é o encoding real do arquivo exportado pelo sistema
    reader.readAsText(file, 'ISO-8859-1');
  }

  fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
  });

  function log(msg, type = 'info') {
    logEl.style.display = 'block';
    const d = document.createElement('div');
    d.className = type;
    d.textContent = msg;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function setStatus(msg) { statusEl.textContent = msg; }
  function setProgress(cur, total) {
    barEl.style.width = total ? ((cur / total) * 100) + '%' : '0%';
  }
  function pageVal(sel) {
    const el = document.querySelector(sel);
    return el ? (el.value || '') : '';
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function fetchPage(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { Accept: 'text/html' },
        timeout: 15000,
        onload:    r => resolve(r.responseText),
        onerror:   e => reject(new Error(JSON.stringify(e))),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  function isNotFound(html) {
    return html.includes('Nenhum registro foi encontrado');
  }

  runBtn.addEventListener('click', async () => {
    if (!parsedUUIDs.length) return;

    logEl.innerHTML = '';
    logEl.style.display = 'block';
    summaryEl.style.display = 'none';
    runBtn.disabled = true;
    setProgress(0, parsedUUIDs.length);

    const dataInicial = pageVal('#filtro_data_inicial');
    const dataFinal   = pageVal('#filtro_data_final');
    const tipo        = pageVal('#filtro_tipo');
    const unidades    = [...document.querySelectorAll('[name="filtro[unidade_saude_id][]"]')]
                          .map(el => el.value).filter(Boolean);

    log(`📋 ${parsedUUIDs.length} UUID(s) únicos. Iniciando…`, 'info');
    log(`📅 Período: ${dataInicial || '(vazio)'} → ${dataFinal || '(vazio)'}`, 'info');

    const BASE = 'https://guaruja.saudesimples.net/esus/correcoes_cadastros_individuais';
    let validados = 0, naoValidados = 0, erros = 0;

    for (let i = 0; i < parsedUUIDs.length; i++) {
      const uuid = parsedUUIDs[i];
      setStatus(`Verificando ${i + 1}/${parsedUUIDs.length}: ${uuid}`);
      setProgress(i + 1, parsedUUIDs.length);

      try {
        const p = new URLSearchParams();
        p.set('utf8', '✓');
        p.set('filtro[data_inicial]', dataInicial);
        p.set('filtro[data_final]',   dataFinal);
        p.set('filtro[tipo]',         tipo);
        p.set('filtro[uuid]',         uuid);
        if (unidades.length) unidades.forEach(u => p.append('filtro[unidade_saude_id][]', u));
        else p.set('filtro[unidade_saude_id][]', '');
        p.set('consultar', '');

        const html = await fetchPage(`${BASE}?${p.toString()}`);

        if (isNotFound(html)) {
          validados++;
          log(`✅ VALIDADO      ${uuid}`, 'ok');
        } else {
          naoValidados++;
          log(`❌ NÃO VALIDADO  ${uuid}`, 'err');
        }
      } catch (err) {
        erros++;
        log(`⚠ ERRO  ${uuid}  — ${err.message}`, 'warn');
      }

      await sleep(400);
    }

    summaryEl.style.display = 'block';
    summaryEl.innerHTML = `
      <strong>📊 Resultado final</strong><br><br>
      <span class="total">Total processado: ${parsedUUIDs.length}</span><br>
      <span class="val">✅ Validados: ${validados}</span><br>
      <span class="nval">❌ Não Validados: ${naoValidados}</span><br>
      ${erros ? `<span style="color:#e3b341">⚠ Erros de requisição: ${erros}</span><br>` : ''}
    `;

    setStatus('✔ Processamento concluído.');
    runBtn.disabled = false;
  });

})();
