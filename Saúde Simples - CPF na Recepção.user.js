// ==UserScript==
// @name         Saúde Simples - CPF na Recepção
// @namespace    om30.saudesimples.guaruja
// @version      1.1.0
// @description  Mostra o CPF no quadro Informações do Munícipe da recepção ambulatorial (/ambulatorial/recepcoes/new), igual ao Vagas por horário faz no agendamento, e avisa quando o munícipe está sem CPF.
// @author       otowm
// @match        https://guaruja.saudesimples.net/ambulatorial/recepcoes/new*
// @match        https://guarujahomolog.saudesimples.net/ambulatorial/recepcoes/new*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    timeoutFetchMs: 20000,
    ttlCacheMs: 60000,
  };

  const warn = (...a) => console.warn('[CPF recepção]', ...a);

  const normalizar = (s) => (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  async function fetchComTimeout(url, opcoes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeoutFetchMs);
    try {
      const resp = await fetch(url, { ...opcoes, signal: controller.signal });
      const texto = await resp.text();
      return { ok: resp.ok, status: resp.status, text: async () => texto };
    } catch (e) {
      if (controller.signal.aborted) throw new Error('tempo esgotado');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ============================== CPF do paciente ============================== */
  // Mesma regra do Vagas por horário: busca pelo CNS e confere o id do munícipe;
  // sem CNS, busca por nome + nascimento e confere pelo nome da mãe.

  const cacheCpf = new Map(); // chave -> { ts, promise }

  const buscaPorNome = (o) => !!(o.cnsVazio && o.nome && o.nascimento && o.mae);

  function escolherMunicipe(lista, o) {
    const temCns = /^\d{15}$/.test(o.cns || '');
    if (!temCns && !buscaPorNome(o)) {
      return { cpf: '', motivo: o.cnsVazio ? 'sem CNS e sem nome, nascimento e mãe para conferir' : 'CNS inválido' };
    }
    let candidatos = lista.filter((m) => (temCns
      ? String(m.codigo_cns || '').replace(/\D/g, '') === o.cns && (!o.municipeId || String(m.id) === o.municipeId)
      : normalizar(m.nome) === normalizar(o.nome)
        && m.data_nascimento_formatada === o.nascimento
        && normalizar(m.nome_mae) === normalizar(o.mae)));
    // Cadastro duplicado (mesmo nome, nascimento e mãe): fica o que está aberto.
    if (candidatos.length > 1 && o.municipeId) candidatos = candidatos.filter((m) => String(m.id) === o.municipeId);
    if (candidatos.length !== 1) {
      return { cpf: '', motivo: temCns ? 'cadastro não encontrado pelo CNS' : 'cadastro não encontrado por nome, nascimento e mãe' };
    }
    const cpf = String(candidatos[0].cpf_numero || '').replace(/\D/g, '');
    if (!cpf) return { cpf: '', semCpf: true, motivo: 'cadastro sem CPF' };
    return /^\d{11}$/.test(cpf)
      ? { cpf: cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') }
      : { cpf: '', motivo: 'CPF inválido no cadastro' };
  }

  async function buscarCpf(o) {
    const temCns = /^\d{15}$/.test(o.cns || '');
    if (!temCns && !buscaPorNome(o)) return escolherMunicipe([], o);
    const termos = temCns ? [o.cns] : [`${o.nome} ${o.nascimento}`, o.nome];
    const chave = temCns
      ? `${o.cns}|${o.municipeId || ''}`
      : `${normalizar(o.nome)}|${o.nascimento}|${normalizar(o.mae)}|${o.municipeId || ''}`;
    const agora = Date.now();
    const cache = cacheCpf.get(chave);
    if (cache && agora - cache.ts < CONFIG.ttlCacheMs) return cache.promise;

    const promise = (async () => {
      let resultado;
      for (const termo of termos) {
        const resp = await fetchComTimeout(`/municipes/search_padronizado_com_mudanca.json?q=${encodeURIComponent(termo)}`, {
          credentials: 'same-origin',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} na consulta de CPF`);
        const lista = JSON.parse(await resp.text());
        if (!Array.isArray(lista)) throw new Error('resposta inválida na consulta de CPF');
        resultado = escolherMunicipe(lista, o);
        if (resultado.cpf || resultado.semCpf) break;
      }
      return resultado;
    })().catch((e) => {
      if (cacheCpf.get(chave)?.promise === promise) cacheCpf.delete(chave);
      warn('Falha ao buscar CPF:', e);
      return { cpf: '', motivo: 'paciente não identificado: falha na consulta de CPF' };
    });

    cacheCpf.set(chave, { ts: agora, promise });
    return promise;
  }

  function injetarCss() {
    if (document.getElementById('sscr-css')) return;
    const style = document.createElement('style');
    style.id = 'sscr-css';
    style.textContent = `
      .sscr-sem-cpf {
        display: inline-block; padding: 1px 6px; border-radius: 8px;
        font: bold 10px/16px Arial, sans-serif; white-space: nowrap;
        background: #fdecea; color: #b3261e; border: 1px solid #f3b8b2;
      }
      .sscr-cpf-valor { cursor: copy; }
      .sscr-alerta-sem-cpf {
        display: flex; align-items: center; gap: 10px; margin: 0 0 10px;
        padding: 10px 14px; border-radius: 6px; border: 2px solid #d93025;
        background: #fdecea; color: #8c1d18; font: 14px/1.4 Arial, sans-serif;
      }
      .sscr-alerta-sem-cpf strong { font-size: 15px; }
      .sscr-alerta-sem-cpf a { color: #8c1d18; font-weight: bold; text-decoration: underline; margin-left: auto; white-space: nowrap; }
      .sscr-alerta-sem-cpf button {
        border: 0; background: none; color: #8c1d18; font-size: 18px; line-height: 1;
        cursor: pointer; padding: 0 2px;
      }
    `;
    document.head.appendChild(style);
  }

  /* ================ CPF no quadro "Informações do Munícipe" ================ */
  // Aqui o quadro é um .portlet com blocos div.grid_N > b (rótulo) + p.mb4 (valor).
  // O CPF entra no lugar do "Cartão provisório" (1ª linha, ao lado do CNS) e o
  // cartão provisório desce para uma linha própria depois do nome da mãe.

  function localizarQuadroMunicipe() {
    const cabecalho = [...document.querySelectorAll('.portlet .portlet-header')]
      .find((h) => normalizar(h.textContent).includes('INFORMACOES DO MUNICIPE'));
    return cabecalho ? cabecalho.closest('.portlet').querySelector('.portlet-content') : null;
  }

  function municipeIdAtual(quadro) {
    return String(new URLSearchParams(location.search).get('municipe_id')
      || document.getElementById('agendamento_municipe_id')?.value
      || quadro.querySelector('a[href*="/municipes/"][href*="/edit"]')?.getAttribute('href').match(/\/municipes\/(\d+)\/edit/)?.[1]
      || '').trim();
  }

  // Faixa vermelha acima do quadro do munícipe quando o cadastro não tem CPF.
  function mostrarAlertaSemCpf(quadro, municipeId) {
    const portlet = quadro.closest('.portlet');
    if (!portlet?.isConnected) return;
    document.querySelectorAll('.sscr-alerta-sem-cpf').forEach((el) => el.remove());
    const alerta = document.createElement('div');
    alerta.className = 'sscr-alerta-sem-cpf';
    alerta.dataset.municipeId = municipeId;
    alerta.setAttribute('role', 'alert');
    alerta.innerHTML = '<span style="font-size:20px">⚠️</span>'
      + '<span><strong>Munícipe sem CPF cadastrado.</strong> Peça o CPF e atualize o cadastro.</span>';
    if (municipeId) {
      const link = document.createElement('a');
      link.href = `/municipes/${municipeId}/edit`;
      link.target = '_blank';
      link.textContent = 'Editar cadastro';
      alerta.appendChild(link);
    }
    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.title = 'Fechar aviso';
    fechar.textContent = '×';
    fechar.addEventListener('click', () => alerta.remove());
    alerta.appendChild(fechar);
    portlet.before(alerta);
  }

  function preencher(valorEl, resultado, quadro, municipeId) {
    const { cpf, semCpf, motivo } = resultado;
    if (!valorEl.isConnected) return;
    if (semCpf) mostrarAlertaSemCpf(quadro, municipeId);
    valorEl.textContent = semCpf ? '' : (cpf || '—');
    if (semCpf) {
      const badge = document.createElement('span');
      badge.className = 'sscr-sem-cpf';
      badge.textContent = 'SEM CPF';
      badge.title = motivo;
      valorEl.appendChild(badge);
    }
    if (cpf) {
      valorEl.classList.add('sscr-cpf-valor');
      valorEl.title = 'Clique para copiar o CPF (só números)';
      valorEl.addEventListener('click', () => {
        navigator.clipboard?.writeText(cpf.replace(/\D/g, '')).then(() => {
          valorEl.title = 'Copiado!';
          setTimeout(() => { valorEl.title = 'Clique para copiar o CPF (só números)'; }, 1500);
        }).catch(() => {});
      });
    } else valorEl.title = motivo;
  }

  function inserirCpfNoQuadro() {
    const quadro = localizarQuadroMunicipe();
    if (!quadro) return;
    const municipeId = municipeIdAtual(quadro);
    const existente = quadro.querySelector('.sscr-cpf-quadro');
    if (existente) {
      if (existente.dataset.municipeId === municipeId) return;
      const movido = quadro.querySelector('.sscr-cpf-movido');
      if (movido) {
        movido.classList.remove('sscr-cpf-movido');
        existente.replaceWith(movido);
      } else existente.remove();
      quadro.querySelectorAll('.sscr-cpf-clear').forEach((el) => el.remove());
      document.querySelectorAll('.sscr-alerta-sem-cpf').forEach((el) => el.remove());
    }

    const blocos = [...quadro.querySelectorAll('div[class*="grid_"]')].filter((d) => d.querySelector(':scope > b'));
    const blocoDe = (rotulo) => blocos.find((d) => normalizar(d.querySelector(':scope > b')?.textContent) === rotulo);
    const valorDe = (rotulo) => (blocoDe(rotulo)?.querySelector('p')?.textContent || '').replace(/\s+/g, ' ').trim();
    const cns = valorDe('CODIGO CNS').replace(/\D/g, '');
    const nome = valorDe('NOME');
    const nascimento = (valorDe('DATA DE NASCIMENTO').match(/\d{2}\/\d{2}\/\d{4}/) || [''])[0];
    const mae = valorDe('NOME DA MAE');
    const ancora = blocoDe('NOME DA MAE') || blocoDe('DATA DE NASCIMENTO');
    if (!ancora) return;

    injetarCss();
    const provisorio = blocoDe('CARTAO PROVISORIO');
    const bloco = document.createElement('div');
    bloco.dataset.municipeId = municipeId;
    bloco.innerHTML = '<b>CPF</b><p class="mb4">…</p>';
    let paraLinha = bloco;
    if (provisorio) {
      bloco.className = `${provisorio.className} sscr-cpf-quadro`;
      provisorio.replaceWith(bloco);
      provisorio.classList.add('sscr-cpf-movido');
      paraLinha = provisorio;
    } else bloco.className = 'grid_3 sscr-cpf-quadro';
    const limpar = document.createElement('div');
    limpar.className = 'clear sscr-cpf-clear';
    const depoisDe = ancora.nextElementSibling?.classList.contains('clear') ? ancora.nextElementSibling : ancora;
    depoisDe.after(paraLinha, limpar);
    if (depoisDe === ancora) paraLinha.before(Object.assign(document.createElement('div'), { className: 'clear sscr-cpf-clear' }));

    const valorEl = bloco.querySelector('p');
    buscarCpf({ cns: /^\d{15}$/.test(cns) ? cns : '', cnsVazio: !cns, municipeId, nome, nascimento, mae })
      .then((r) => preencher(valorEl, r, quadro, municipeId));
  }

  let agendado = false;
  const verificar = () => {
    agendado = false;
    inserirCpfNoQuadro();
  };
  new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(verificar);
  }).observe(document.documentElement, { childList: true, subtree: true });
  verificar();
})();
