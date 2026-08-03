// ==UserScript==
// @name         Saúde Simples - Consultar Agenda ao clicar no dia
// @namespace    om30.saudesimples.guaruja
// @version      1.1.0
// @downloadURL  https://raw.githubusercontent.com/otowm/om30-saudesimples/main/Sa%C3%BAde%20Simples%20-%20Consultar%20Agenda%20ao%20clicar%20no%20dia.user.js
// @updateURL    https://raw.githubusercontent.com/otowm/om30-saudesimples/main/Sa%C3%BAde%20Simples%20-%20Consultar%20Agenda%20ao%20clicar%20no%20dia.user.js
// @description  Ao selecionar uma data no agendamento, consulta /consultar_agendas (mesma data, unidade e profissional) e exibe os agendamentos em painel inline dentro da agenda clicada. Suporta múltiplas agendas por profissional.
// @match        https://guaruja.saudesimples.net/agendamentos*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ============================== CONFIG ============================== */

  const CONFIG = {
    cancelados: 'NÃO',   // 'SIM', 'NÃO' ou '' (todos)
    maxPaginas: 5,       // limite de páginas seguidas na paginação do consultar_agendas
    debounceMs: 400,     // evita disparo duplicado se o site fizer 2 requests seguidos
    alturaMax: 280,      // altura máxima (px) da lista antes de rolar
  };

  /* ============ Mapa nome -> id das unidades (select do filtro) ============ */

  const UNIDADES = {
    'AMB REF EM ESPECIALIDADES E SAUDE DA MULHER ARE GUARUJA': 70,
    'AMBULATORIO TRANSEXUALIZADOR TRANSFORMA GUARUJA': 121,
    'CAF CENTRAL DE ABASTECIMENTO FARMACEUTICO': 106,
    'CAPS ADII GUARUJA': 68,
    'CAPS DR JOSE FORSTHER JUNIOR GUARUJA': 71,
    'CAPS III GUARUJA': 72,
    'CAPS INFANTIL GUARUJA': 73,
    'CASA SER': 124,
    'CENTRAL DE DISTRIBUICAO DE VACINAS GUARUJA': 123,
    'CENTRAL DE REGULACAO MUNICIPAL GUARUJA': 118,
    'CENTRO DE ESPECIALIDADE ODONTOLOGICA CEO': 74,
    'CENTRO DE ESPECIALIDADES DE VICENTE DE CARVALHO GUARUJA': 119,
    'CENTRO DE RECUPERACAO E FISIOTERAPIA DE VICENTE DE CARVALHO': 75,
    'CENTRO DE RECUPERACAO E FISIOTERAPIA GUARUJA': 76,
    'CENTRO DE REF OTORRINO OFTALMO E FONOAUDIOLOGIA GUARUJA': 77,
    'CENTRO REC DE PARAL INF E CER DO GUARUJA CRPI SOC BENEF': 116,
    'CONSULTORIO NA RUA GUARUJA': 78,
    'CTAPT GUARUJA': 66,
    'FARMACIA DO CIDADAO FARMACEUTICO OSWALDO CAFARO V C': 79,
    'FARMACIA DO CIDADAO JAYRO GRACIOLA': 80,
    'FARMACIA DO CIDADAO VILA JULIA GUARUJA': 81,
    'INSTITUTO DA MULHER CASA ROSA': 57,
    'PRONTO SOCORRO DE VICENTE DE CARVALHO GUARUJA': 101,
    'PRONTO SOCORRO PEREQUE ANIBAL ARDEN DOS REIS GUARUJA': 82,
    'PRONTO SOCORRO PROF DR MATHEUS SANTAMARIA GUARUJA': 59,
    'PRONTO SOCORRO SANTA CRUZ DOS NAVEGANTES GUARUJA': 83,
    'SAMU 192 MOTOLANCIA M1 145 GUARUJA': 110,
    'SAMU 192 SAV 836 GUARUJA': 109,
    'SAMU 192 SBV 799 GUARUJA': 114,
    'SAMU 192 SBV 821 GUARUJA': 107,
    'SAMU 192 SBV 833 GUARUJA': 108,
    'SAMU 192 SBV 834 GUARUJA': 111,
    'SAMU 192 SBV 837 GUARUJA': 112,
    'SAMU 192 SBV G9 721 GUARUJA': 113,
    'SECRETARIA DE SAUDE GUARUJA': 48,
    'SERV DE VIG SANITARIA EPIDEMIO E CTRL DE ZOONOZES GUARUJA': 105,
    'SERVICO DE TRANSPORTE SANITARIO DO GUARUJA': 69,
    'SIAD SERVICO DE INTERNACAO E ASSIST DOMICILIAR GUARUJA': 84,
    'UBS MORRINHOS GUARUJA': 60,
    'UBS PAE CARA GUARUJA': 85,
    'UBS PERNAMBUCO GUARUJA': 61,
    'UBS PRAINHA VICENTE DE CARVALHO GUARUJA': 62,
    'UBS VILA ALICE KATIA GONCALVES DOS S SIQUEIRA GUARUJA': 102,
    'UBS VILA BAIANA GUARUJA': 103,
    'UNAERP GUARUJA': 120,
    'UNIDADE COMPLEXA WILLIAM ROCHA': 65,
    'UNIDADE DE ESPECIALIDADE EM DIABETES E OBESIDADE INFANTO JUV': 86,
    'UNIDADE DE SAUDE SANTA ROSA GUARUJA': 58,
    'UNIDADE DE VIGILANCIA EM ZOONOSES DE GUARUJA': 104,
    'UNIDADE TESTE GUARUJÁ': 122,
    'UPA ENSEADA PAULO FLAVIO AFONSO PIASENTI GUARUJA': 67,
    'USAFA CIDADE ATLANTICA GUARUJA': 87,
    'USAFA JARDIM BOA ESPERANCA LUIZ MACIEL BRAIA GUARUJA': 88,
    'USAFA JARDIM BRASIL GUSTAVO COELHO DE ALMEIDA GUARUJA': 89,
    'USAFA JARDIM CONCEICAOZINHA GENTIL NUNES NETO GUARUJA': 90,
    'USAFA JARDIM DOS PASSAROS GUARUJA': 91,
    'USAFA JARDIM LAS PALMAS JANDUI DE SOUZA MOREIRA GUARUJA': 92,
    'USAFA JARDIM PROGRESSO GUARUJA': 93,
    'USAFA PEREQUE GUARUJA': 94,
    'USAFA SANTA CRUZ DOS NAVEGANTES GUARUJA': 95,
    'USAFA SITIO CONCEICAOZINHA GUARUJA': 96,
    'USAFA VILA AUREA GUARUJA': 97,
    'USAFA VILA EDNA MARCO ANTONIO GONZALEZ GUARUJA': 98,
    'USAFA VILA RA GUARUJA': 99,
    'USAFA VILA ZILDA DR DAVID CAPISTRANO DA COSTA FILHO GUARUJA': 100,
  };

  const normalizar = (s) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

  const UNIDADES_NORM = new Map(
    Object.entries(UNIDADES).map(([nome, id]) => [normalizar(nome), id])
  );

  /* ======================= Coleta de dados da página ======================= */

  function getUnidadeId() {
    const el = document.querySelector(
      '#site-navbar-collapse ul li.nav-item.unidade-saude-atual a'
    );
    if (!el) return '';
    const id = UNIDADES_NORM.get(normalizar(el.textContent));
    if (!id) console.warn('[ConsultaAgenda] Unidade não mapeada:', el.textContent.trim());
    return id || '';
  }

  function getProfissionalId() {
    const opt = document.querySelector('#agendamento_profissional_id > option:nth-child(2)');
    return opt ? (opt.value || '').trim() : '';
  }

  // Localiza a div.agenda correspondente ao agenda_id (via div.calendar_XXXX)
  function getAgendaContainer(agendaId) {
    const cal = document.querySelector(`#agendamento_vagas_container div[class*="calendar_${agendaId}"]`);
    return cal ? cal.closest('div.agenda') : null;
  }

  // Nome do procedimento na legend da agenda (parte após o <br>)
  function getProcedimentoNome(agendaEl) {
    const legend = agendaEl && agendaEl.querySelector('fieldset > legend');
    if (!legend) return '';
    const partes = legend.innerHTML.split(/<br\s*\/?>/i);
    const texto = partes.length > 1 ? partes[partes.length - 1] : legend.textContent;
    const tmp = document.createElement('div');
    tmp.innerHTML = texto;
    return tmp.textContent.replace(/Procedimento:\s*/i, '').trim();
  }

  /* ========================= Montagem da consulta ========================= */

  function montarUrlConsulta({ dia, mes, ano }) {
    const data = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
    const p = new URLSearchParams();
    p.set('utf8', '✓');
    p.set('filtro_consultar_agenda[data_inicial]', data);
    p.set('filtro_consultar_agenda[data_final]', data);
    p.set('filtro_consultar_agenda[modulo]', '');
    p.set('filtro_consultar_agenda[cancelados]', CONFIG.cancelados);
    p.set('filtro_consultar_agenda[situacao_id]', '');
    p.set('filtro_consultar_agenda[especifica]', '');
    p.set('filtro_consultar_agenda[prontuario]', '');
    p.set('filtro_consultar_agenda[unidade_saude_id]', getUnidadeId());
    p.set('filtro_consultar_agenda[municipe_id]', '');
    p.set('filtro_consultar_agenda[profissional_id]', getProfissionalId());
    p.set('filtro_consultar_agenda[ocupacao_id]', '');
    // O filtro de procedimento espera um ID (autocomplete); como só temos o
    // nome na legend, filtramos por data+unidade+profissional e destacamos
    // visualmente as linhas do procedimento da agenda clicada.
    p.set('filtro_consultar_agenda[procedimento_id]', '');
    p.set('filtro_consultar_agenda[grupo_atendimento_id]', '');
    p.set('filtro_consultar_agenda[condicao_situacao_saude_id][]', '');
    p.set('consultar', '');
    return '/consultar_agendas?' + p.toString();
  }

  /* ==================== Fetch + parse do consultar_agendas ==================== */

  function parseLinhas(doc) {
    const linhas = [];
    doc.querySelectorAll('.hastable table tbody tr').forEach((tr) => {
      const td = tr.querySelectorAll('td');
      if (td.length < 15) return;
      linhas.push({
        unidade: td[0].textContent.trim(),
        profissional: td[1].textContent.trim(),
        municipe: td[2].textContent.trim(),
        especialidade: td[3].textContent.trim(),
        procedimento: td[4].textContent.trim(),
        modulo: td[6].textContent.trim(),
        dataHora: td[7].textContent.trim(),
        atendimento: td[8].textContent.trim(),
        prontuario: td[9].textContent.trim(),
        telefones: td[11].textContent.trim(),
        cancelado: td[12].textContent.trim(),
        situacao: td[13].textContent.trim(),
      });
    });
    return linhas;
  }

  async function buscarTodasPaginas(urlInicial) {
    const parser = new DOMParser();
    let url = urlInicial;
    let todas = [];
    for (let pagina = 1; pagina <= CONFIG.maxPaginas && url; pagina++) {
      const resp = await fetch(url, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ao consultar agenda`);
      const doc = parser.parseFromString(await resp.text(), 'text/html');
      todas = todas.concat(parseLinhas(doc));
      const next = doc.querySelector('.pagination a.next_page');
      url = next ? next.getAttribute('href') : null;
    }
    return todas;
  }

  /* ====================== Painel inline (por agenda) ====================== */

  function css() {
    if (document.getElementById('ssca-css')) return;
    const style = document.createElement('style');
    style.id = 'ssca-css';
    style.textContent = `
      .ssca-panel {
        clear: both; width: 100%; box-sizing: border-box;
        margin: 12px 0 4px; border: 1px solid #d5d5d5; border-radius: 6px;
        background: #fff; font: 12px/1.4 Arial, sans-serif; color: #333;
      }
      .ssca-head {
        padding: 6px 10px; background: #f4f4f4; border-bottom: 1px solid #ddd;
        border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 8px;
        cursor: pointer; user-select: none;
      }
      .ssca-head b { font-size: 12px; }
      .ssca-head .ssca-count { color: #777; }
      .ssca-head .ssca-btn {
        border: none; background: none; cursor: pointer;
        font-size: 14px; line-height: 1; color: #666; padding: 0 4px;
      }
      .ssca-head .ssca-toggle { margin-left: auto; }
      .ssca-body { overflow: auto; max-height: ${CONFIG.alturaMax}px; }
      .ssca-panel.ssca-collapsed .ssca-body,
      .ssca-panel.ssca-collapsed .ssca-foot { display: none; }
      .ssca-panel table { width: 100%; border-collapse: collapse; }
      .ssca-panel th, .ssca-panel td {
        padding: 4px 8px; border-bottom: 1px solid #eee;
        text-align: left; vertical-align: top;
      }
      .ssca-panel th {
        position: sticky; top: 0; background: #efefef;
        font-size: 11px; z-index: 1;
      }
      .ssca-panel tr:hover td { background: #f7fbff; }
      .ssca-outro-proc td { color: #999; }
      .ssca-outro-proc td small { color: #aaa; }
      .ssca-sit-presente { color: #1a7f37; font-weight: bold; }
      .ssca-sit-ausente  { color: #b35900; font-weight: bold; }
      .ssca-sit-cancel   { color: #c00; font-weight: bold; }
      .ssca-foot {
        padding: 5px 10px; border-top: 1px solid #ddd;
        display: flex; gap: 8px; align-items: center;
      }
      .ssca-foot a { color: #06c; }
      .ssca-empty { padding: 12px; text-align: center; color: #777; }
    `;
    document.head.appendChild(style);
  }

  function getPanel(agendaEl, agendaId) {
    css();
    let panel = agendaEl.querySelector(`.ssca-panel[data-agenda="${agendaId}"]`);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'ssca-panel';
      panel.dataset.agenda = agendaId;
      panel.innerHTML = `
        <div class="ssca-head">
          <b>Agendamentos do dia</b>
          <span class="ssca-data"></span>
          <span class="ssca-count"></span>
          <button class="ssca-btn ssca-toggle" title="Recolher/expandir">▾</button>
          <button class="ssca-btn ssca-close" title="Fechar">✕</button>
        </div>
        <div class="ssca-body"></div>
        <div class="ssca-foot"></div>`;
      panel.querySelector('.ssca-close').addEventListener('click', (e) => {
        e.stopPropagation();
        panel.remove();
      });
      const toggle = () => {
        panel.classList.toggle('ssca-collapsed');
        panel.querySelector('.ssca-toggle').textContent =
          panel.classList.contains('ssca-collapsed') ? '▸' : '▾';
      };
      panel.querySelector('.ssca-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
      });
      panel.querySelector('.ssca-head').addEventListener('click', toggle);
      // Insere no final do fieldset da agenda (largura total, abaixo dos horários)
      const fieldset = agendaEl.querySelector('fieldset') || agendaEl;
      fieldset.appendChild(panel);
    }
    panel.classList.remove('ssca-collapsed');
    panel.querySelector('.ssca-toggle').textContent = '▾';
    return panel;
  }

  function classeSituacao(s) {
    const n = normalizar(s);
    if (n.includes('PRESENTE') || n.includes('CONFIRMADO')) return 'ssca-sit-presente';
    if (n.includes('AUSENTE')) return 'ssca-sit-ausente';
    if (n.includes('CANCEL')) return 'ssca-sit-cancel';
    return '';
  }

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  function renderPainel(panel, { dataStr, procedimentoNome, url, estado, linhas, erro }) {
    panel.querySelector('.ssca-data').textContent = '— ' + dataStr;
    const body = panel.querySelector('.ssca-body');
    const foot = panel.querySelector('.ssca-foot');
    const count = panel.querySelector('.ssca-count');
    count.textContent = '';
    foot.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Abrir no Consultar Agendas ↗</a>`;

    if (estado === 'carregando') {
      body.innerHTML = `<div class="ssca-empty">Consultando agendamentos de ${esc(dataStr)}…</div>`;
      return;
    }
    if (estado === 'erro') {
      body.innerHTML = `<div class="ssca-empty">Erro na consulta: ${esc(erro)}</div>`;
      return;
    }
    if (!linhas.length) {
      body.innerHTML = `<div class="ssca-empty">Nenhum agendamento encontrado para ${esc(dataStr)}.</div>`;
      count.textContent = '(0)';
      return;
    }

    linhas.sort((a, b) => a.dataHora.localeCompare(b.dataHora));
    const procNorm = normalizar(procedimentoNome);

    const rows = linhas
      .map((l) => {
        const mesmoProc = !procNorm || normalizar(l.procedimento) === procNorm;
        return `
        <tr class="${mesmoProc ? '' : 'ssca-outro-proc'}">
          <td>${esc(l.dataHora.split(' ')[1] || l.dataHora)}</td>
          <td>${esc(l.municipe)}<br><small>${esc(l.telefones)}</small></td>
          <td>${esc(l.procedimento)}</td>
          <td class="${classeSituacao(l.situacao)}">${esc(l.situacao)}</td>
        </tr>`;
      })
      .join('');

    body.innerHTML = `
      <table>
        <thead><tr><th>Hora</th><th>Munícipe</th><th>Procedimento</th><th>Situação</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    const doProc = procNorm
      ? linhas.filter((l) => normalizar(l.procedimento) === procNorm).length
      : linhas.length;
    count.textContent = `(${doProc} deste procedimento / ${linhas.length} no total)`;
    foot.insertAdjacentHTML(
      'beforeend',
      `<span style="margin-left:auto;color:#999;">linhas em cinza = outros procedimentos do mesmo profissional/dia</span>`
    );
  }

  /* =========================== Fluxo principal =========================== */

  let ultimoKey = '';
  let ultimoTs = 0;

  async function aoSelecionarDia({ agendaId, dia, mes, ano }) {
    const key = `${agendaId}|${dia}/${mes}/${ano}`;
    const agora = Date.now();
    if (key === ultimoKey && agora - ultimoTs < CONFIG.debounceMs) return;
    ultimoKey = key;
    ultimoTs = agora;

    const agendaEl = getAgendaContainer(agendaId);
    if (!agendaEl) {
      console.warn('[ConsultaAgenda] div.agenda não encontrada para agenda_id', agendaId);
      return;
    }

    const dataStr = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
    const url = montarUrlConsulta({ dia, mes, ano });
    const procedimentoNome = getProcedimentoNome(agendaEl);
    const panel = getPanel(agendaEl, agendaId);

    renderPainel(panel, { dataStr, procedimentoNome, url, estado: 'carregando' });
    try {
      const linhas = await buscarTodasPaginas(url);
      renderPainel(panel, { dataStr, procedimentoNome, url, estado: 'ok', linhas });
    } catch (e) {
      console.error('[ConsultaAgenda]', e);
      renderPainel(panel, { dataStr, procedimentoNome, url, estado: 'erro', erro: e.message });
    }
  }

  function tratarUrl(rawUrl) {
    try {
      if (typeof rawUrl !== 'string' || !rawUrl.includes('obter_agenda_horario_dia')) return;
      const u = new URL(rawUrl, location.origin);
      const agendaId = u.searchParams.get('agenda_id');
      const dia = u.searchParams.get('dia');
      const mes = u.searchParams.get('mes');
      const ano = u.searchParams.get('ano');
      if (agendaId && dia && mes && ano) {
        setTimeout(() => aoSelecionarDia({ agendaId, dia, mes, ano }), 0);
      }
    } catch (e) {
      /* silencioso */
    }
  }

  /* ===================== Interceptação de XHR e fetch ===================== */

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    tratarUrl(url);
    return origOpen.call(this, method, url, ...rest);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    tratarUrl(url);
    return origFetch.apply(this, arguments);
  };

  console.log('[ConsultaAgenda] v1.1.0 ativo — aguardando seleção de data no agendamento.');
})();
