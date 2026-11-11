// ==UserScript==
// @name         Saúde Simples - CPF na Recepção
// @namespace    om30.saudesimples.guaruja
// @version      1.2.1
// @description  Mostra o CPF no quadro Informações do Munícipe da recepção ambulatorial (/ambulatorial/recepcoes/new), igual ao Vagas por horário faz no agendamento, avisa quando o munícipe está sem CPF e traz os botões Alterar/Gerar do número de prontuário.
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
      .sspr-btn {
        display: inline-block; margin-left: 4px; padding: 1px 8px; border-radius: 4px;
        font: 12px/18px Arial, sans-serif; cursor: pointer; vertical-align: middle;
        background: #eee; color: #333; border: 1px solid #ccc;
      }
      .sspr-btn:hover:not(:disabled) { background: #e0e0e0; }
      .sspr-btn:disabled { opacity: .6; cursor: wait; }
      .sspr-input { width: 90px; padding: 1px 4px; font: 13px Arial, sans-serif; vertical-align: middle; }
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

  /* ================= Número de prontuário: Alterar / Gerar ================= */
  // Mesmos endpoints da tela de agendamento:
  //  - Alterar: GET /agendamentos/alterar_numero.json {municipe_id, unidade_saude_id: unidade logada, numero}
  //    → { status, valor, mensagem }; status 1 já salva. Sem unidade_saude_id o servidor responde "dados inválidos".
  //  - Gerar: GET /prontuarios_numeracoes_atuais.json {municipe_id, unidade_saude_id}
  //    → { status: 1, mensagem: número } ou { status != 1, mensagem: erro }. Só existe em unidade
  //    com numeração sequencial (unidade_numeracoes_atuais → true). Depois de gerar, confere no
  //    /agendamentos/new se o número ficou mesmo no cadastro.

  const jsonHeaders = { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' };

  async function getJson(url) {
    const resp = await fetchComTimeout(url, { credentials: 'same-origin', headers: jsonHeaders });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const texto = await resp.text();
    try { return JSON.parse(texto); } catch { throw new Error('resposta inválida'); }
  }

  let unidadePromise = null;
  // Id da unidade logada: a recepção não traz o id, só o nome no topo; busca pelo nome exato.
  function unidadeAtual() {
    if (unidadePromise) return unidadePromise;
    const nome = document.querySelector('.unidade-saude-atual')?.textContent.replace(/\s+/g, ' ').trim() || '';
    unidadePromise = (async () => {
      if (!nome) return null;
      const lista = await getJson(`/unidades_saude/search.json?q=${encodeURIComponent(nome)}`);
      const achada = (Array.isArray(lista) ? lista : []).filter((u) => normalizar(u.nome) === normalizar(nome));
      if (achada.length !== 1) return null;
      const id = String(achada[0].id || achada[0]._id || '');
      if (!id) return null;
      const seq = await getJson(`/ferramentas/prontuario/gerar_numeracoes_atuais/unidade_numeracoes_atuais?unidade_saude_id=${id}`);
      return { id, nome, sequencial: seq === true };
    })().catch((e) => {
      warn('Falha ao identificar a unidade:', e);
      unidadePromise = null;
      return null;
    });
    return unidadePromise;
  }

  async function numeroNoCadastro(municipeId) {
    const resp = await fetchComTimeout(`/agendamentos/new?municipe_id=${encodeURIComponent(municipeId)}`, { credentials: 'same-origin' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
    return (doc.getElementById('agendamento_alterar_numeracao')?.value || '').trim();
  }

  function botao(texto, titulo, aoClicar) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sspr-btn';
    b.textContent = texto;
    b.title = titulo;
    b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); aoClicar(b); });
    return b;
  }

  function desenharProntuario(p, municipeId, numero) {
    p.textContent = '';
    p.append(document.createTextNode(numero || '—'));
    if (numero) {
      p.append(' ', botao('Alterar', 'Alterar o número de prontuário (salva na hora)', () => editarProntuario(p, municipeId, numero)));
      return;
    }
    const espaco = document.createElement('span');
    p.append(' ', espaco);
    unidadeAtual().then((u) => {
      if (!espaco.isConnected || !u?.sequencial) return;
      espaco.replaceWith(botao('Gerar', `Gerar número de prontuário na unidade ${u.nome}`, (b) => gerarProntuario(p, municipeId, u, b)));
    });
  }

  function editarProntuario(p, municipeId, numeroAtual) {
    p.textContent = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 30;
    input.value = numeroAtual;
    input.className = 'sspr-input';
    const ok = botao('OK', 'Salvar o novo número', async () => {
      const numero = input.value.trim();
      if (!numero) { alert('O número de prontuário não pode ficar em branco.'); return; }
      ok.disabled = true; cancelar.disabled = true; input.disabled = true;
      try {
        const unidade = await unidadeAtual();
        if (!unidade?.id) throw new Error('unidade logada não identificada');
        const qs = new URLSearchParams({ municipe_id: municipeId, unidade_saude_id: unidade.id, numero });
        const r = await getJson(`/agendamentos/alterar_numero.json?${qs}`);
        if (r?.mensagem) alert(r.mensagem);
        // status 1 = salvo; status 0 = recusado (ex.: número em conflito) e "valor" volta com o número antigo.
        desenharProntuario(p, municipeId, String(r?.valor ?? '').trim() || numeroAtual);
      } catch (e) {
        warn('Falha ao alterar prontuário:', e);
        alert(`Ocorreu um erro ao atualizar o número de prontuário (${e.message}). Tente novamente.`);
        ok.disabled = false; cancelar.disabled = false; input.disabled = false;
      }
    });
    const cancelar = botao('✕', 'Cancelar', () => desenharProntuario(p, municipeId, numeroAtual));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); ok.click(); }
      if (ev.key === 'Escape') { ev.preventDefault(); cancelar.click(); }
    });
    p.append(input, ' ', ok, ' ', cancelar);
    input.focus();
    input.select();
  }

  async function gerarProntuario(p, municipeId, unidade, b) {
    if (!confirm(`Gerar um número de prontuário para este munícipe na unidade ${unidade.nome}?`)) return;
    b.disabled = true;
    b.textContent = 'Gerando…';
    try {
      const qs = new URLSearchParams({ municipe_id: municipeId, unidade_saude_id: unidade.id });
      const r = await getJson(`/prontuarios_numeracoes_atuais.json?${qs}`);
      if (Number(r?.status) !== 1) {
        alert(r?.mensagem || 'Não foi possível gerar o número de prontuário.');
        b.disabled = false; b.textContent = 'Gerar';
        return;
      }
      const gerado = String(r.mensagem || '').trim();
      desenharProntuario(p, municipeId, gerado);
      let salvo = '';
      try { salvo = await numeroNoCadastro(municipeId); } catch (e) { warn('Falha ao conferir prontuário:', e); }
      if (salvo !== gerado) {
        const aviso = document.createElement('span');
        aviso.className = 'sscr-sem-cpf';
        aviso.textContent = 'NÃO CONFIRMADO';
        aviso.title = salvo
          ? `O cadastro mostra ${salvo}, não ${gerado}.`
          : 'O número foi gerado, mas não apareceu no cadastro do munícipe. Confira pelo agendamento.';
        p.append(' ', aviso);
      }
    } catch (e) {
      warn('Falha ao gerar prontuário:', e);
      alert('Ocorreu um erro ao gerar o número de prontuário. Tente novamente.');
      b.disabled = false; b.textContent = 'Gerar';
    }
  }

  function inserirAcoesProntuario() {
    const quadro = localizarQuadroMunicipe();
    if (!quadro) return;
    const municipeId = municipeIdAtual(quadro);
    if (!/^\d+$/.test(municipeId)) return;
    const bloco = [...quadro.querySelectorAll('div[class*="grid_"]')]
      .find((d) => normalizar(d.querySelector(':scope > b')?.textContent) === 'NUMERO DE PRONTUARIO');
    const p = bloco?.querySelector('p');
    if (!p || bloco.dataset.ssprMunicipe === municipeId) return;
    bloco.dataset.ssprMunicipe = municipeId;
    injetarCss();
    const numero = p.textContent.replace(/\s+/g, ' ').trim();
    desenharProntuario(p, municipeId, /^[—-]?$/.test(numero) ? '' : numero);
  }

  let agendado = false;
  const verificar = () => {
    agendado = false;
    inserirCpfNoQuadro();
    inserirAcoesProntuario();
  };
  new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(verificar);
  }).observe(document.documentElement, { childList: true, subtree: true });
  verificar();
})();
