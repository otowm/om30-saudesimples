// ==UserScript==
// @name Saúde Simples - Último agendado da agenda
// @namespace om30.saudesimples.guaruja
// @version 1.0.0
// @description Na edição da agenda, consulta o Consultar Agendas e mostra a data do paciente agendado mais distante.
// @downloadURL https://raw.githubusercontent.com/otowm/om30-saudesimples/previa/Sa%C3%BAde%20Simples%20-%20%C3%9Altimo%20agendado%20da%20agenda.user.js
// @updateURL https://raw.githubusercontent.com/otowm/om30-saudesimples/previa/Sa%C3%BAde%20Simples%20-%20%C3%9Altimo%20agendado%20da%20agenda.user.js
// @author otowm
// @match https://guaruja.saudesimples.net/agendas/*/edit*
// @match https://guarujahomolog.saudesimples.net/agendas/*/edit*
// @run-at document-idle
// @grant none
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = { anosAFrente: 3, maxPaginasDia: 10, maxRequisicoes: 150 };
  const PREFIXO = '[UltimoAgendado]';
  const agendaId = location.pathname.match(/\/agendas\/(\d+)\/edit\/?$/)?.[1];
  if (!agendaId) return;
  const form = document.querySelector(`#edit_agenda_${agendaId}`);
  if (!form) return;

  const normalizar = (texto) => String(texto || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const bloco = (rotulo) => Array.from(form.querySelectorAll('div.grid_5, div.grid_6'))
    .find((div) => div.querySelector('b')?.textContent.trim() === rotulo);
  const unidadeId = document.querySelector('div.unidade_saude_id')?.textContent.trim() || '';
  const profissionalNome = bloco('Profissional')?.querySelector('li')?.textContent.trim() || '';
  let procedimentoId = '';
  let procedimentoNome = '';
  try {
    const procedimento = JSON.parse(document.querySelector('#agenda_procedimento_token')
      ?.getAttribute('data-pre') || '[]')[0];
    procedimentoId = procedimento?.id ?? '';
    procedimentoNome = procedimento?.nome || '';
  } catch (erro) {
    console.warn(PREFIXO, 'Procedimento indisponível; consultando por especialidade.', erro);
  }
  let profissionalId = '';
  let requisicoes = 0;
  let executando = false;

  function formatarData(data) {
    return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1)
      .padStart(2, '0')}/${data.getFullYear()}`;
  }

  function somarDias(data, dias) {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
  }

  function numeroDia(data) {
    return Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) / 86400000;
  }

  function montarUrl(ini, fim, page) {
    const params = new URLSearchParams([
      ['utf8', '✓'],
      ['per_page', '100'],
      ['filtro_consultar_agenda[data_inicial]', formatarData(ini)],
      ['filtro_consultar_agenda[data_final]', formatarData(fim)],
      ['filtro_consultar_agenda[modulo]', ''],
      ['filtro_consultar_agenda[cancelados]', 'NÃO'],
      ['filtro_consultar_agenda[situacao_id]', ''],
      ['filtro_consultar_agenda[especifica]', ''],
      ['filtro_consultar_agenda[prontuario]', ''],
      ['filtro_consultar_agenda[unidade_saude_id]', unidadeId],
      ['filtro_consultar_agenda[municipe_id]', ''],
      ['filtro_consultar_agenda[profissional_id]', profissionalId],
      ['filtro_consultar_agenda[ocupacao_id]', ''],
      ['filtro_consultar_agenda[procedimento_id]', procedimentoId],
      ['filtro_consultar_agenda[grupo_atendimento_id]', ''],
      ['filtro_consultar_agenda[condicao_situacao_saude_id][]', ''],
      ['consultar', ''],
    ]);
    if (page > 1) params.append('page', String(page));
    return `/consultar_agendas?${params}`;
  }

  async function buscar(url, json = false) {
    if (requisicoes >= CONFIG.maxRequisicoes) throw new Error('limite de consultas atingido');
    requisicoes += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const resposta = await fetch(url, {
        credentials: 'same-origin',
        signal: controller.signal,
        ...(json ? { headers: { Accept: 'application/json' } } : {}),
      });
      if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status} no ${json ? 'profissionais/search.json' : 'consultar_agendas'}`);
      }
      return await (json ? resposta.json() : resposta.text());
    } catch (erro) {
      if (erro.name === 'AbortError') throw new Error('tempo limite de 20 segundos excedido');
      throw erro;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function resolverProfissional() {
    try {
      const resultados = await buscar(`/profissionais/search.json?q=${encodeURIComponent(profissionalNome)}`, true);
      if (!Array.isArray(resultados)) return '';
      return resultados.find((item) => normalizar(item.nome) === normalizar(profissionalNome))?.id ?? '';
    } catch (erro) {
      console.warn(PREFIXO, 'Não foi possível resolver o profissional; filtrando pelo nome.', erro);
      return '';
    }
  }

  function analisarPagina(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const registros = [];
    for (const tr of doc.querySelectorAll('.hastable table tbody tr')) {
      const td = tr.querySelectorAll('td');
      if (td.length < 15) continue;
      const txt = (i) => td[i].textContent.replace(/\s+/g, ' ').trim();
      const registro = {
        unidade: txt(0), profissional: txt(1), municipe: txt(2),
        procedimento: txt(4), dataHora: txt(7), cancelado: txt(12), situacao: txt(13),
      };
      if (normalizar(registro.profissional) !== normalizar(profissionalNome)
        || normalizar(registro.cancelado) === 'SIM') continue;
      const partes = registro.dataHora.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!partes) continue;
      const [, dia, mes, ano] = partes.map(Number);
      const data = new Date(ano, mes - 1, dia);
      if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) continue;
      const hora = registro.dataHora.match(/(\d{1,2}:\d{2})/)?.[1] || '';
      const [horas, minutos] = hora ? hora.split(':').map(Number) : [0, 0];
      registros.push({ ...registro, data, hora, ordem: numeroDia(data) * 1440 + horas * 60 + minutos });
    }
    return { registros, temMais: !!doc.querySelector('.pagination a.next_page') };
  }

  const maior = (registros) => registros.reduce((max, item) => !max || item.ordem > max.ordem ? item : max, null);

  async function maisRecente(ini, fim) {
    const primeira = analisarPagina(await buscar(montarUrl(ini, fim, 1)));
    if (!primeira.temMais) return maior(primeira.registros);
    const dias = numeroDia(fim) - numeroDia(ini);
    if (dias > 0) {
      const meio = somarDias(ini, Math.floor(dias / 2));
      const recente = await maisRecente(somarDias(meio, 1), fim);
      return recente || maisRecente(ini, meio);
    }
    let resultado = maior(primeira.registros);
    let temMais = primeira.temMais;
    for (let page = 2; temMais && page <= CONFIG.maxPaginasDia; page += 1) {
      const pagina = analisarPagina(await buscar(montarUrl(ini, fim, page)));
      resultado = maior([resultado, ...pagina.registros].filter(Boolean));
      temMais = pagina.temMais;
    }
    return resultado;
  }

  if (!document.getElementById('ssua-css')) {
    const style = document.createElement('style');
    style.id = 'ssua-css';
    style.textContent = `
      #ssua-box { clear: both; margin: 8px 0 12px; padding: 8px 12px; border: 1px solid #d5d5d5;
        border-left: 4px solid #1a73e8; border-radius: 6px; background: #f7faff;
        font: 13px/1.4 Arial, sans-serif; color: #333; display: flex; gap: 10px;
        align-items: center; flex-wrap: wrap; }
      #ssua-box .ssua-valor { color: #777; }
      #ssua-box .ssua-valor strong { font-size: 14px; color: #333; }
      #ssua-box a { color: #06c; }
      #ssua-box button { border: none; background: none; cursor: pointer; font-size: 14px;
        color: #666; margin-left: auto; }
      #ssua-box .ssua-nota { font-size: 11px; color: #999; width: 100%; }
      #ssua-box [hidden] { display: none; }
    `;
    document.head.append(style);
  }
  let box = document.getElementById('ssua-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'ssua-box';
    const especialidade = bloco('Especialidade');
    if (especialidade) {
      const seguinte = especialidade.nextElementSibling;
      const ancora = seguinte?.matches('div.clear') ? seguinte : especialidade;
      ancora.after(box);
    } else {
      form.prepend(box);
    }
  }
  const rotulo = document.createElement('b');
  rotulo.textContent = 'Último paciente agendado:';
  const valor = document.createElement('span');
  valor.className = 'ssua-valor';
  const link = document.createElement('a');
  link.textContent = 'ver no Consultar Agendas ↗';
  link.target = '_blank';
  link.rel = 'noopener';
  link.hidden = true;
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.textContent = '↻';
  botao.title = 'Consultar de novo';
  const nota = document.createElement('span');
  nota.className = 'ssua-nota';
  nota.textContent = 'profissional filtrado pelo nome';
  nota.hidden = true;
  box.replaceChildren(rotulo, valor, link, botao, nota);

  async function consultar() {
    if (executando) return;
    executando = true;
    botao.disabled = true;
    requisicoes = 0;
    valor.textContent = 'consultando…';
    valor.style.color = '#777';
    link.hidden = true;
    nota.hidden = true;
    try {
      if (!unidadeId || !profissionalNome) throw new Error('unidade ou profissional não encontrado na agenda');
      profissionalId = await resolverProfissional();
      nota.hidden = profissionalId !== '';
      const agora = new Date();
      const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
      const fim = new Date(hoje.getTime());
      fim.setFullYear(fim.getFullYear() + CONFIG.anosAFrente);
      console.info(PREFIXO, 'Consultando agenda', agendaId, procedimentoNome);
      const resultado = await maisRecente(hoje, fim);
      if (resultado) {
        const data = document.createElement('strong');
        data.textContent = formatarData(resultado.data);
        valor.style.color = '#555';
        valor.replaceChildren(data, document.createTextNode(
          `${resultado.hora ? ` às ${resultado.hora}` : ''} — ${resultado.municipe}`));
        link.href = montarUrl(resultado.data, resultado.data, 1);
        link.hidden = false;
      } else {
        valor.textContent = 'nenhum agendamento a partir de hoje';
      }
      console.info(PREFIXO, 'Consulta concluída', { requisicoes, resultado });
    } catch (erro) {
      valor.textContent = `erro: ${erro.message}`;
      valor.style.color = '#c00';
      console.error(PREFIXO, erro);
    } finally {
      executando = false;
      botao.disabled = false;
    }
  }

  botao.addEventListener('click', consultar);
  void consultar();
})();
