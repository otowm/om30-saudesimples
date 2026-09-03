// ==UserScript==
// @name         Saúde Simples - Vagas por horário
// @namespace    om30.saudesimples.guaruja
// @version      1.10.0
// @description  Ao clicar num dia no agendamento, cruza a configuração da agenda (/agendas/ID) com os agendamentos já marcados (/consultar_agendas e /atendimentos_medicos_administrativo) e mostra, em cada horário da lista, quantas vagas existem, quem está em cada uma e quantas estão livres.
// @author       otowm
// @match        https://guaruja.saudesimples.net/agendamentos*
// @match        https://guarujahomolog.saudesimples.net/agendamentos*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ================================ CONFIG ================================ */

  const CONFIG = {
    // A listagem de horários mostra UMA linha por horário (não uma por vaga),
    // então a presença da linha só diz que há pelo menos uma vaga livre daquele
    // tipo. Quantas estão livres é calculado: configuradas − ocupadas.

    // Intervalo (minutos) usado quando a agenda NÃO é de horário distribuído.
    intervaloPorHora: 60,

    // Agenda específica na data substitui os períodos normais (true) ou soma (false).
    especificaSubstitui: true,

    cancelados: 'NÃO',   // filtro do consultar_agendas: 'SIM', 'NÃO' ou '' (todos)
    maxPaginas: 5,       // páginas seguidas na paginação do consultar_agendas
    debounceMs: 400,
    esperaTabelaMs: 12000, // quanto tempo esperar a tabela de horários aparecer
    ttlCacheMs: 60000,     // cache do consultar_agendas por data/profissional

    debug: false,
  };

  const log = (...a) => CONFIG.debug && console.log('[Vagas]', ...a);
  const warn = (...a) => console.warn('[Vagas]', ...a);

  /* ======================= Tipos de vaga / dias da semana ======================= */

  // tipo_atividade_agendamento_id -> chave interna
  const TIPO_POR_ID = {
    '1': 'retorno',
    '2': 'nova_consulta',
    '3': 'reserva_tecnica',
  };

  const TIPOS = {
    nova_consulta:  { label: 'Primeira Vez',    rotulos: ['PRIMEIRA VEZ', 'PRIMEIRO ATENDIMENTO', '1 VEZ'] },
    retorno:        { label: 'Retorno',         rotulos: ['RETORNO'] },
    reserva_tecnica:{ label: 'Reserva Técnica', rotulos: ['RESERVA TECNICA'] },
    regulacao:      { label: 'Regulação',       rotulos: ['REGULACAO'] },
  };

  // Ordem em que o Saúde Simples empilha os tipos no horário distribuído.
  const ORDEM_DISTRIBUIDO = ['nova_consulta', 'retorno', 'reserva_tecnica', 'regulacao'];

  const DIAS_SEMANA = {
    'DOMINGO': 0,
    'SEGUNDA-FEIRA': 1, 'SEGUNDA': 1,
    'TERCA-FEIRA': 2, 'TERCA': 2,
    'QUARTA-FEIRA': 3, 'QUARTA': 3,
    'QUINTA-FEIRA': 4, 'QUINTA': 4,
    'SEXTA-FEIRA': 5, 'SEXTA': 5,
    'SABADO': 6,
  };

  /* ==================== Unidades (para o consultar_agendas) ==================== */

  const AMBIENTE = location.hostname === 'guarujahomolog.saudesimples.net'
    ? 'HOMOLOGAÇÃO'
    : 'PRODUÇÃO';

  const UNIDADES_PRODUCAO = {
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

  const UNIDADES_HOMOLOGACAO = {
    'ALMOXARIFADO CENTRAL DA SAUDE': 122,
    'ALMOXARIFADO FARMACEUTICO 1': 123,
    'AMBULATORIO DE ESPECIALIDADES DA MULHER': 70,
    'CAPS AD II': 68,
    'CAPS ADULTO I': 71,
    'CAPS III': 72,
    'CAPS INFANTIL': 73,
    'CENTRAL DE ABASTECIMENTO FARMACEUTICO': 106,
    'CENTRAL DE REGULACAO MUNICIPAL': 118,
    'CENTRO DE ATENCAO PSICOSSOCIAL TRAUMA': 66,
    'CENTRO DE ESPECIALIDADES': 119,
    'CENTRO DE REABILITACAO': 76,
    'CENTRO DE REABILITACAO E CER': 116,
    'CENTRO DE REABILITACAO E FISIOTERAPIA': 75,
    'CENTRO DE REFERENCIA EM OTORRINO E OFTALMO': 77,
    'CENTRO ODONTOLOGICO CEO': 74,
    'CONSULTORIO NA RUA': 78,
    'FARMACIA DO CIDADAO I': 80,
    'FARMACIA DO CIDADAO II': 81,
    'FARMACIA DO CIDADAO III': 79,
    'INSTITUTO DA MULHER': 57,
    'PRONTO SOCORRO CENTRAL': 59,
    'PRONTO SOCORRO PEREQUE': 82,
    'PRONTO SOCORRO REGIONAL': 101,
    'PRONTO SOCORRO SANTA CRUZ': 83,
    'SAMU 192 SAV 836': 109,
    'SAMU 192 SBV 721': 113,
    'SAMU 192 SBV 799': 114,
    'SAMU 192 SBV 821': 107,
    'SAMU 192 SBV 833': 108,
    'SAMU 192 SBV 834': 111,
    'SAMU 192 SBV 837': 112,
    'SAMU MOTOLANCIA M1 145': 110,
    'SECRETARIA MUNICIPAL DE SAUDE': 48,
    'SERVICO DE INTERNACAO DOMICILIAR': 84,
    'SERVICO DE TRANSPORTE SANITARIO': 69,
    'SERVICO DE VIGILANCIA SANITARIA E EPIDEMIOLOGICA': 105,
    'UBS MIRANTE DA MATA': 124,
    'UBS MORRINHOS': 60,
    'UBS PAE CARA': 85,
    'UBS PERNAMBUCO': 61,
    'UBS PRAINHA': 62,
    'UBS VILA ALICE': 102,
    'UBS VILA BAIANA': 103,
    'UBS VILA COSMOPOLITA': 125,
    'UNIDADE COMPLEXA I': 65,
    'UNIDADE DE ESPECIALIDADE EM DIABETES': 86,
    'UNIDADE DE SAUDE SANTA ROSA': 58,
    'UNIDADE DE VIGILANCIA EM ZOONOSES': 104,
    'UNIDADE OPERACIONAL 30': 121,
    'UNIDADE UNIVERSITARIA': 120,
    'UPA ENSEADA': 67,
    'USAFA CIDADE ATLANTICA': 87,
    'USAFA JARDIM BOA ESPERANCA': 88,
    'USAFA JARDIM BRASIL': 89,
    'USAFA JARDIM CONCEICAOZINHA': 90,
    'USAFA JARDIM DOS PASSAROS': 91,
    'USAFA JARDIM LAS PALMAS': 92,
    'USAFA JARDIM PROGRESSO': 93,
    'USAFA PEREQUE': 94,
    'USAFA SANTA CRUZ': 95,
    'USAFA SITIO CONCEICAOZINHA': 96,
    'USAFA VILA AUREA': 97,
    'USAFA VILA EDNA': 98,
    'USAFA VILA RA': 99,
    'USAFA VILA ZILDA': 100,
  };

  const normalizar = (s) => (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const UNIDADES_NORM = new Map(
    Object.entries(AMBIENTE === 'HOMOLOGAÇÃO' ? UNIDADES_HOMOLOGACAO : UNIDADES_PRODUCAO)
      .map(([nome, id]) => [normalizar(nome), id])
  );

  function getUnidadeId() {
    const el = document.querySelector('#site-navbar-collapse ul li.nav-item.unidade-saude-atual a');
    if (!el) return '';
    const id = UNIDADES_NORM.get(normalizar(el.textContent));
    if (!id) warn(`Unidade não mapeada em ${AMBIENTE}:`, el.textContent.trim());
    return id ? String(id) : '';
  }

  function getProfissionalIdSelecionado() {
    const select = document.querySelector('#agendamento_profissional_id');
    return select ? String(select.value || '').trim() : '';
  }

  function getCsrfToken() {
    return document.querySelector("input[name='authenticity_token']")?.value
      || document.querySelector("meta[name='csrf-token']")?.content
      || '';
  }

  /* ============ Especialidade (filtro do atendimentos_medicos) ============ */

  const ESPECIALIDADE_MAPA = {
    'generalista': '449',
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
  };

  function especialidadeIdPorNome(nome) {
    const texto = normalizar(nome).replace(/^\d+\s*-\s*/, '').toLowerCase();
    if (!texto) return '';
    for (const [padrao, id] of Object.entries(ESPECIALIDADE_MAPA)) {
      if (new RegExp(padrao, 'i').test(texto)) return id;
    }
    return '';
  }

  /**
   * Tenta descobrir o especialidade_id: primeiro num select da própria tela,
   * depois pelo nome da especialidade que veio da configuração da agenda.
   */
  function getEspecialidadeId(config) {
    const sel = document.querySelector(
      '#agendamento_especialidade_id, #agendamento_ocupacao_id, select[name*="especialidade_id"]'
    );
    if (sel && sel.value) return String(sel.value).trim();

    const doTexto = document.querySelector(
      '#column-content-box > div > div.content-box-wrapper.container_16 > div:nth-child(3) > li'
    );
    if (doTexto) {
      const bruto = [...doTexto.childNodes]
        .find((n) => n.nodeType === 3 && n.textContent.trim());
      const id = bruto ? especialidadeIdPorNome(bruto.textContent) : '';
      if (id) return id;
    }

    return config ? especialidadeIdPorNome(config.especialidade) : '';
  }

  /* ============================ Utilitários gerais ============================ */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const pad2 = (n) => String(n).padStart(2, '0');

  function minutosDeHora(v) {
    const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function horaDeMinutos(min) {
    const t = ((min % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
  }

  function dataBRParaDate(v) {
    const m = String(v || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }

  const soDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  function numeroDeTexto(v) {
    const n = parseInt(String(v || '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }

  /* ================== Leitura da configuração da agenda (/agendas/ID) ================== */

  const cacheConfig = new Map(); // agendaId -> Promise<config>

  function obterConfigAgenda(agendaId) {
    if (!cacheConfig.has(agendaId)) {
      cacheConfig.set(agendaId, (async () => {
        const resp = await fetch(`/agendas/${agendaId}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ao abrir /agendas/${agendaId}`);
        const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
        return parsearConfigAgenda(doc, agendaId);
      })().catch((e) => { cacheConfig.delete(agendaId); throw e; }));
    }
    return cacheConfig.get(agendaId);
  }

  /**
   * A tela de visualização da agenda é toda montada como
   * <div class="grid_N"><b>Rótulo</b><li>Valor</li></div>.
   * A leitura é feita em ordem de documento: cada rótulo encontrado alimenta
   * o horário/período que está sendo montado no momento.
   */
  function pares(raiz) {
    const out = [];
    raiz.querySelectorAll('div').forEach((div) => {
      const b = div.querySelector(':scope > b');
      const li = div.querySelector(':scope > li');
      if (!b || !li) return;
      out.push({
        rotulo: normalizar(b.textContent),
        valor: li.textContent.replace(/\s+/g, ' ').trim(),
        el: div,
      });
    });
    return out;
  }

  function chaveTipoPorRotulo(rotulo) {
    if (rotulo.startsWith('PRIMEIRA VEZ')) return 'nova_consulta';
    if (rotulo.startsWith('RETORNO')) return 'retorno';
    if (rotulo.startsWith('RESERVA TECNICA')) return 'reserva_tecnica';
    if (rotulo.startsWith('REGULACAO')) return 'regulacao';
    return null;
  }

  function lerHorarios(lista, aoTrocarDia) {
    const horarios = [];
    let atual = null;
    let observacaoPendente = '';

    const fechar = () => { if (atual) horarios.push(atual); atual = null; };

    lista.forEach(({ rotulo, valor }) => {
      if (rotulo === 'DIA DA SEMANA') {
        fechar();
        if (aoTrocarDia) aoTrocarDia(valor);
        observacaoPendente = '';
        return;
      }
      if (rotulo === 'OBSERVACAO') { observacaoPendente = valor === '—' ? '' : valor; return; }
      if (rotulo === 'HORARIO DE INICIO') {
        fechar();
        atual = {
          horaInicio: valor,
          horaFim: '',
          observacao: observacaoPendente,
          diaSemana: aoTrocarDia ? aoTrocarDia() : null,
          vagas: { nova_consulta: 0, retorno: 0, reserva_tecnica: 0, regulacao: 0 },
          total: 0,
        };
        return;
      }
      if (!atual) return;
      if (rotulo === 'HORARIO DE FIM') { atual.horaFim = valor; return; }
      if (rotulo === 'TOTAL') { atual.total = numeroDeTexto(valor); fechar(); return; }
      const tipo = chaveTipoPorRotulo(rotulo);
      if (tipo) atual.vagas[tipo] = numeroDeTexto(valor);
    });

    fechar();
    return horarios;
  }

  function parsearConfigAgenda(doc, agendaId) {
    const cabecalho = {};
    pares(doc.querySelector('.content-box-wrapper') || doc.body).forEach(({ rotulo, valor }) => {
      if (['TIPO DE ATENDIMENTO', 'PERFIL DE AGENDA', 'UNIDADE DE SAUDE', 'PROFISSIONAL',
           'ESPECIALIDADE', 'PROCEDIMENTO'].includes(rotulo) && !cabecalho[rotulo]) {
        cabecalho[rotulo] = valor;
      }
    });

    // Horário distribuído: o rótulo não existe em toda instalação, então também
    // procuramos o texto solto na aba de parametrização.
    const textoTudo = normalizar(doc.body.textContent);
    let distribuido = false;
    const mDistrib = textoTudo.match(/(HORARIO )?DISTRIBUIDO\s*:?\s*(SIM|NAO|TRUE|FALSE)/);
    if (mDistrib) distribuido = /SIM|TRUE/.test(mDistrib[2]);

    // --- Períodos (aba "Horários de Atendimento") ---
    const periodos = [];
    doc.querySelectorAll('#horario .periodo').forEach((per) => {
      const lista = pares(per);
      const dataInicial = (lista.find((p) => p.rotulo === 'DATA INICIAL') || {}).valor || '';
      const dataFinal = (lista.find((p) => p.rotulo === 'DATA FINAL') || {}).valor || '';

      let diaCorrente = null;
      const registrarDia = (valor) => {
        if (valor !== undefined) {
          const cod = DIAS_SEMANA[normalizar(valor)];
          diaCorrente = cod === undefined ? null : cod;
          return diaCorrente;
        }
        return diaCorrente;
      };

      const restante = lista.filter((p) => p.rotulo !== 'DATA INICIAL' && p.rotulo !== 'DATA FINAL');
      const horarios = lerHorarios(restante, registrarDia);

      periodos.push({
        dataInicial,
        dataFinal,
        inicioTs: dataBRParaDate(dataInicial) ? soDia(dataBRParaDate(dataInicial)) : -Infinity,
        fimTs: dataBRParaDate(dataFinal) ? soDia(dataBRParaDate(dataFinal)) : Infinity,
        horarios,
      });
    });

    // --- Agenda específica (data avulsa) ---
    const especificas = [];
    doc.querySelectorAll('#especifica .container_dia').forEach((box) => {
      const lista = pares(box);
      const data = (lista.find((p) => p.rotulo === 'DATA') || {}).valor || '';
      const horarios = lerHorarios(lista.filter((p) => p.rotulo !== 'DATA'), null);
      const d = dataBRParaDate(data);
      especificas.push({ data, ts: d ? soDia(d) : null, horarios });
    });

    // --- Bloqueios ---
    const bloqueios = [];
    const listaBloq = pares(doc.querySelector('#bloqueio') || doc.createElement('div'));
    let bloqAtual = null;
    listaBloq.forEach(({ rotulo, valor }) => {
      if (rotulo === 'DATA DE INICIO') {
        if (bloqAtual) bloqueios.push(bloqAtual);
        bloqAtual = { inicio: valor, fim: '', motivo: '', observacao: '', horas: [] };
        return;
      }
      if (!bloqAtual) return;
      if (rotulo === 'DATA DE FIM') bloqAtual.fim = valor;
      else if (rotulo === 'MOTIVO') bloqAtual.motivo = valor;
      else if (rotulo === 'OBSERVACAO') bloqAtual.observacao = valor;
      else if (rotulo === 'HORA DE INICIO' || rotulo === 'HORA DE FIM') bloqAtual.horas.push(valor);
    });
    if (bloqAtual) bloqueios.push(bloqAtual);

    const config = {
      agendaId: String(agendaId),
      tipoAtendimento: cabecalho['TIPO DE ATENDIMENTO'] || '',
      perfil: cabecalho['PERFIL DE AGENDA'] || '',
      unidade: cabecalho['UNIDADE DE SAUDE'] || '',
      profissional: cabecalho['PROFISSIONAL'] || '',
      especialidade: cabecalho['ESPECIALIDADE'] || '',
      procedimento: cabecalho['PROCEDIMENTO'] || '',
      distribuido,
      periodos,
      especificas,
      bloqueios,
    };
    log('config da agenda', agendaId, config);
    return config;
  }

  /* ===================== Cálculo dos horários abertos na data ===================== */

  function distribuirVagas(total, qtdBuckets) {
    const r = Array.from({ length: qtdBuckets }, () => 0);
    if (total <= 0 || qtdBuckets <= 0) return r;
    const base = Math.floor(total / qtdBuckets);
    const sobra = total % qtdBuckets;
    for (let i = 0; i < qtdBuckets; i += 1) r[i] = base + (i < sobra ? 1 : 0);
    return r;
  }

  function bucketsPorHora(inicio, fim, passo) {
    const b = [];
    // O horário final não abre vaga: 08:00–10:00 abre 08:00 e 09:00.
    for (let min = inicio; min + passo <= fim; min += passo) b.push(min);
    return b;
  }

  function slotsDistribuidos(inicio, fim, vagas) {
    const out = [];
    if (vagas <= 0) return out;
    const passo = ((fim - inicio) * 60) / vagas;
    for (let i = 0; i < vagas; i += 1) {
      out.push(Math.floor((inicio * 60 + passo * i) / 60));
    }
    return out;
  }

  /**
   * Devolve Map hora("HH:MM") -> { total, porTipo:{...}, observacoes:Set }
   * considerando todos os horários configurados que valem para a data.
   */
  function vagasConfiguradasNaData(config, dataObj) {
    const ts = soDia(dataObj);
    const diaSemana = dataObj.getDay();

    let horarios = [];
    const especifica = config.especificas.filter((e) => e.ts === ts);
    if (especifica.length) {
      horarios = especifica.flatMap((e) => e.horarios);
      if (!CONFIG.especificaSubstitui) {
        horarios = horarios.concat(horariosDosPeriodos(config, ts, diaSemana));
      }
    } else {
      horarios = horariosDosPeriodos(config, ts, diaSemana);
    }

    const mapa = new Map();
    const addSlot = (hora, tipo, qtd, observacao) => {
      if (qtd <= 0) return;
      if (!mapa.has(hora)) {
        mapa.set(hora, {
          total: 0,
          porTipo: { nova_consulta: 0, retorno: 0, reserva_tecnica: 0, regulacao: 0 },
          observacoes: new Set(),
        });
      }
      const alvo = mapa.get(hora);
      alvo.total += qtd;
      alvo.porTipo[tipo] += qtd;
      if (observacao) alvo.observacoes.add(observacao);
    };

    horarios.forEach((h) => {
      const inicio = minutosDeHora(h.horaInicio);
      const fim = minutosDeHora(h.horaFim);
      if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return;

      // Início igual ao fim: um único horário concentrando todas as vagas.
      if (inicio === fim) {
        ORDEM_DISTRIBUIDO.forEach((t) => addSlot(horaDeMinutos(inicio), t, h.vagas[t], h.observacao));
        return;
      }

      if (config.distribuido) {
        const totalTipos = ORDEM_DISTRIBUIDO.reduce((s, t) => s + h.vagas[t], 0);
        if (totalTipos <= 0) return;
        const todos = slotsDistribuidos(inicio, fim, totalTipos);
        let cursor = 0;
        ORDEM_DISTRIBUIDO.forEach((t) => {
          const qtd = h.vagas[t];
          todos.slice(cursor, cursor + qtd).forEach((min) => addSlot(horaDeMinutos(min), t, 1, h.observacao));
          cursor += qtd;
        });
        return;
      }

      const buckets = bucketsPorHora(inicio, fim, CONFIG.intervaloPorHora);
      if (!buckets.length) return;
      ORDEM_DISTRIBUIDO.forEach((t) => {
        distribuirVagas(h.vagas[t], buckets.length).forEach((qtd, i) => {
          addSlot(horaDeMinutos(buckets[i]), t, qtd, h.observacao);
        });
      });
    });

    return mapa;
  }

  function horariosDosPeriodos(config, ts, diaSemana) {
    const out = [];
    config.periodos.forEach((p) => {
      if (ts < p.inicioTs || ts > p.fimTs) return;
      p.horarios.forEach((h) => { if (h.diaSemana === diaSemana) out.push(h); });
    });
    return out;
  }

  function bloqueiosNaData(config, dataObj) {
    const ts = soDia(dataObj);
    return config.bloqueios.filter((b) => {
      const ini = dataBRParaDate(b.inicio);
      const fim = dataBRParaDate(b.fim) || ini;
      return ini && ts >= soDia(ini) && ts <= soDia(fim);
    });
  }

  /* ================= Agendamentos já marcados (/consultar_agendas) ================= */

  const cacheOcupadas = new Map(); // chave -> { ts, promise }

  function montarUrlConsulta(dataStr, profissionalId) {
    const p = new URLSearchParams();
    p.set('utf8', '✓');
    p.set('filtro_consultar_agenda[data_inicial]', dataStr);
    p.set('filtro_consultar_agenda[data_final]', dataStr);
    p.set('filtro_consultar_agenda[modulo]', '');
    p.set('filtro_consultar_agenda[cancelados]', CONFIG.cancelados);
    p.set('filtro_consultar_agenda[situacao_id]', '');
    p.set('filtro_consultar_agenda[especifica]', '');
    p.set('filtro_consultar_agenda[prontuario]', '');
    p.set('filtro_consultar_agenda[unidade_saude_id]', getUnidadeId());
    p.set('filtro_consultar_agenda[municipe_id]', '');
    p.set('filtro_consultar_agenda[profissional_id]', profissionalId || '');
    p.set('filtro_consultar_agenda[ocupacao_id]', '');
    p.set('filtro_consultar_agenda[procedimento_id]', '');
    p.set('filtro_consultar_agenda[grupo_atendimento_id]', '');
    p.set('filtro_consultar_agenda[condicao_situacao_saude_id][]', '');
    p.set('consultar', '');
    return '/consultar_agendas?' + p.toString();
  }

  function parsearLinhasConsulta(doc) {
    const linhas = [];
    doc.querySelectorAll('.hastable table tbody tr').forEach((tr) => {
      const td = tr.querySelectorAll('td');
      if (td.length < 15) return;
      const txt = (i) => td[i].textContent.replace(/\s+/g, ' ').trim();
      const dataHora = txt(7);
      const mHora = dataHora.match(/(\d{1,2}:\d{2})/);
      linhas.push({
        unidade: txt(0),
        profissional: txt(1),
        municipe: txt(2),
        especialidade: txt(3),
        procedimento: txt(4),
        modulo: txt(6),
        dataHora,
        hora: mHora ? mHora[1].padStart(5, '0') : '',
        atendimento: txt(8),
        prontuario: txt(9),
        telefones: txt(11),
        cancelado: txt(12),
        situacao: txt(13),
      });
    });
    return linhas;
  }

  async function buscarAgendamentosDoDia(dataStr, profissionalId) {
    const chave = `${dataStr}|${profissionalId}`;
    const agora = Date.now();
    const cache = cacheOcupadas.get(chave);
    if (cache && agora - cache.ts < CONFIG.ttlCacheMs) return cache.promise;

    const promise = (async () => {
      const parser = new DOMParser();
      let url = montarUrlConsulta(dataStr, profissionalId);
      let todas = [];
      for (let pagina = 1; pagina <= CONFIG.maxPaginas && url; pagina += 1) {
        const resp = await fetch(url, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} no consultar_agendas`);
        const doc = parser.parseFromString(await resp.text(), 'text/html');
        todas = todas.concat(parsearLinhasConsulta(doc));
        const next = doc.querySelector('.pagination a.next_page');
        url = next ? next.getAttribute('href') : null;
      }
      return todas;
    })();

    cacheOcupadas.set(chave, { ts: agora, promise });
    promise.catch(() => cacheOcupadas.delete(chave));
    return promise;
  }

  /* ========= Lista de atendimentos (quem está em cada vaga) ========= */

  const cacheAtendimentos = new Map(); // chave -> { ts, promise }

  function indiceCabecalho(ths, palavras) {
    const lista = normalizar(palavras).toLowerCase().split('|').map((s) => s.trim()).filter(Boolean);
    return [...ths].findIndex((th) => {
      const t = normalizar(th.textContent).toLowerCase();
      return lista.some((p) => t.includes(p));
    });
  }

  function parsearAtendimentos(doc) {
    const tabela = doc.querySelector('#customers-contain table, table:not(.form-table)');
    if (!tabela) return [];

    const ths = tabela.querySelectorAll('th');
    const iHora = indiceCabecalho(ths, 'hora|horario');
    const iPaciente = indiceCabecalho(ths, 'paciente|municipe|nome');
    const iPront = indiceCabecalho(ths, 'pront');
    const iProc = indiceCabecalho(ths, 'procedimento');
    const iSit = indiceCabecalho(ths, 'situacao|status');
    const iTipo = indiceCabecalho(ths, 'tipo de consulta|tipo de vaga|tipo vaga|tipo');

    const linhas = [];
    tabela.querySelectorAll('tbody tr, tr').forEach((tr) => {
      if (tr.querySelector('th') || tr.querySelector('.not_found')) return;
      const td = tr.querySelectorAll('td');
      if (!td.length) return;

      const txt = (i) => (i >= 0 && td[i] ? td[i].textContent.replace(/\s+/g, ' ').trim() : '');
      let hora = txt(iHora);
      if (!hora) {
        const achado = [...td].map((c) => c.textContent).find((t) => /\d{1,2}\s*[:h]\s*\d{2}/.test(t));
        hora = achado || '';
      }
      const mHora = hora.match(/(\d{1,2})\s*[:h]\s*(\d{2})/);
      if (!mHora) return;

      linhas.push({
        hora: `${pad2(mHora[1])}:${mHora[2]}`,
        paciente: txt(iPaciente),
        prontuario: txt(iPront),
        procedimento: txt(iProc),
        situacao: txt(iSit),
        tipoVaga: txt(iTipo),
      });
    });
    return linhas;
  }

  async function buscarAtendimentosDoDia(dataStr, profissionalId, especialidadeId) {
    if (!profissionalId || !especialidadeId) return [];

    const chave = `${dataStr}|${profissionalId}|${especialidadeId}`;
    const agora = Date.now();
    const cache = cacheAtendimentos.get(chave);
    if (cache && agora - cache.ts < CONFIG.ttlCacheMs) return cache.promise;

    const promise = (async () => {
      const corpo = new URLSearchParams({
        utf8: '✓',
        authenticity_token: getCsrfToken(),
        'filtro_atendimento_medico[data]': dataStr,
        'filtro_atendimento_medico[profissional_id]': profissionalId,
        'filtro_atendimento_medico[especialidade_id]': especialidadeId,
        'filtro_atendimento_medico[unidade_id]': '',
        'filtro_atendimento_medico[status]': '',
        consultar: '',
      });

      const resp = await fetch('/atendimentos_medicos_administrativo', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: corpo.toString(),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} no atendimentos_medicos`);
      const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
      return parsearAtendimentos(doc);
    })();

    cacheAtendimentos.set(chave, { ts: agora, promise });
    promise.catch(() => cacheAtendimentos.delete(chave));
    return promise;
  }

  /* ====================== Localização da tabela de horários ====================== */

  function agendaIdDoBotao(btn) {
    const raw = String(btn.getAttribute('value') || '')
      .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&');
    try {
      const dados = JSON.parse(raw);
      if (dados && dados.agenda_id) return String(dados.agenda_id);
    } catch (_) { /* segue no regex */ }
    const m = raw.match(/"agenda_id"\s*:\s*"?(\d+)/);
    return m ? m[1] : '';
  }

  function horaDoBotao(btn) {
    const raw = String(btn.getAttribute('value') || '')
      .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&');
    const m = raw.match(/T(\d{2}:\d{2})/) || raw.match(/"hora"\s*:\s*"(\d{2}:\d{2})/);
    return m ? m[1] : '';
  }

  function horaDaLinha(tr) {
    const btn = tr.querySelector('[name="agendamento[vaga_button]"], [name="agendamento[vaga]"]');
    if (btn) {
      const h = horaDoBotao(btn);
      if (h) return h;
    }
    const td = tr.querySelector('td');
    const m = td && td.textContent.match(/(\d{1,2}:\d{2})/);
    return m ? m[1].padStart(5, '0') : '';
  }

  /**
   * Procura a tabela de horários renderizada para a agenda informada.
   * Devolve { tabela, container }: quando o dia não tem nenhuma vaga livre não
   * existe tabela de botões, então só o container é usado (para o resumo).
   */
  function localizarAlvo(agendaId) {
    const tabelas = new Set();
    document.querySelectorAll('[name="agendamento[vaga_button]"], [name="agendamento[vaga]"]')
      .forEach((btn) => {
        if (agendaIdDoBotao(btn) !== String(agendaId)) return;
        const t = btn.closest('table');
        if (t) tabelas.add(t);
      });

    const cal = document.querySelector(`[class*="calendar_${agendaId}"], [class*="horario_${agendaId}"]`);
    const containerAgenda = (cal && (cal.closest('div.agenda') || cal.parentElement)) || null;

    if (tabelas.size) {
      const tabela = [...tabelas][0];
      return { tabela, container: tabela.parentElement || containerAgenda };
    }
    return { tabela: null, container: containerAgenda };
  }

  function assinaturaTabela(tabela) {
    if (!tabela) return '(sem tabela)';
    return [...tabela.querySelectorAll('tr')].map(horaDaLinha).join(',');
  }

  /**
   * Espera o Rails trocar o conteúdo da agenda. Como o alvo antigo continua na
   * tela no instante do clique, só aceitamos quando o elemento ou a lista de
   * horários mudou — ou quando é um reclique no mesmo dia (nada muda).
   */
  function esperarAlvo(agendaId, chave, timeout) {
    const inicial = localizarAlvo(agendaId);
    const assinaturaInicial = assinaturaTabela(inicial.tabela);
    const elInicial = inicial.tabela;

    return new Promise((resolve) => {
      const inicio = Date.now();
      const tentar = () => {
        const atual = localizarAlvo(agendaId);
        const jaEhDesteDia = atual.tabela && atual.tabela.dataset.ssvhChave === chave;
        const mudou = atual.tabela !== elInicial
          || assinaturaTabela(atual.tabela) !== assinaturaInicial;
        if (jaEhDesteDia || mudou) return resolve(atual);
        if (Date.now() - inicio > timeout) return resolve(atual);
        setTimeout(tentar, 200);
      };
      tentar();
    });
  }

  /* ================================ Renderização ================================ */

  function injetarCss() {
    if (document.getElementById('ssvh-css')) return;
    const style = document.createElement('style');
    style.id = 'ssvh-css';
    style.textContent = `
      .ssvh-resumo {
        margin: 6px 0; padding: 6px 8px; border: 1px solid #d5d5d5; border-radius: 5px;
        background: #fafafa; font: 11px/1.5 Arial, sans-serif; color: #333;
      }
      .ssvh-resumo b { font-size: 11px; }
      .ssvh-resumo a { color: #06c; }
      .ssvh-resumo .ssvh-alerta { color: #b35900; }
      .ssvh-chip {
        display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 8px;
        font: bold 10px/16px Arial, sans-serif; white-space: nowrap; vertical-align: middle;
      }
      .ssvh-livre  { background: #e6f4ea; color: #1a7f37; border: 1px solid #b7dfc4; }
      .ssvh-cheio  { background: #fdecea; color: #b3261e; border: 1px solid #f3b8b2; }
      .ssvh-parcial{ background: #fff4e5; color: #8a5300; border: 1px solid #f0d0a0; }
      .ssvh-neutro { background: #eee; color: #555; border: 1px solid #ddd; }
      .ssvh-det { color: #888; font-weight: normal; }
      .ssvh-obs-vazia { color: #bbb; }
      .ssvh-toggle { cursor: pointer; user-select: none; color: #06c; }
      .ssvh-toggle input { vertical-align: middle; margin: 0 4px 0 0; }
      .ssvh-linha-cheia { display: none; opacity: .75; }
      table.ssvh-mostra-cheios .ssvh-linha-cheia { display: table-row; }
      .ssvh-clicavel { cursor: pointer; text-decoration: underline dotted; }
      .ssvh-duvida { border-style: dashed !important; }
      .ssvh-clicavel:hover { filter: brightness(0.95); }
      .ssvh-pop {
        position: fixed; z-index: 999999; max-width: 620px; max-height: 60vh;
        background: #fff; border: 1px solid #c9c9c9; border-radius: 6px;
        box-shadow: 0 6px 24px rgba(0,0,0,.18);
        font: 12px/1.45 Arial, sans-serif; color: #333; overflow: hidden;
        display: flex; flex-direction: column;
      }
      .ssvh-pop-head {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 10px; background: #f4f4f4; border-bottom: 1px solid #ddd;
      }
      .ssvh-pop-fechar {
        margin-left: auto; border: none; background: none; cursor: pointer;
        font-size: 14px; line-height: 1; color: #666; padding: 0 2px;
      }
      .ssvh-pop-nota {
        padding: 5px 10px; background: #fff8e6; border-bottom: 1px solid #f0e0b0;
        color: #8a5300;
      }
      .ssvh-pop-corpo { overflow: auto; }
      .ssvh-pop-sub { padding: 6px 10px 0; color: #666; }
      .ssvh-painel {
        position: fixed; inset: 0; z-index: 999999; background: rgba(0,0,0,.35);
        display: flex; align-items: center; justify-content: center; padding: 20px;
      }
      .ssvh-painel-caixa {
        background: #fff; border-radius: 6px; box-shadow: 0 10px 40px rgba(0,0,0,.3);
        font: 12px/1.45 Arial, sans-serif; color: #333;
        max-width: 1000px; width: 100%; max-height: 85vh;
        display: flex; flex-direction: column; overflow: hidden;
      }
      .ssvh-painel .ssvh-pop-corpo { overflow: auto; }
      .ssvh-painel table { width: 100%; border-collapse: collapse; }
      .ssvh-painel th, .ssvh-painel td {
        padding: 6px 10px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top;
      }
      .ssvh-painel th { position: sticky; top: 0; background: #efefef; font-size: 11px; }
      .ssvh-painel tfoot td { background: #f7f7f7; border-top: 2px solid #ddd; }
      .ssvh-painel .ssvh-hora { white-space: nowrap; font-weight: bold; }
      .ssvh-painel .ssvh-nomes { width: 45%; }
      .ssvh-painel .ssvh-chip { margin-left: 0; }
      .ssvh-vazio { color: #bbb; }
      .ssvh-painel-rodape {
        padding: 6px 10px; background: #fafafa; border-top: 1px solid #eee; color: #666;
      }
      .ssvh-pop-vazio { padding: 12px; text-align: center; color: #888; }
      .ssvh-pop table { width: 100%; border-collapse: collapse; }
      .ssvh-pop th, .ssvh-pop td {
        padding: 5px 9px; border-bottom: 1px solid #eee; text-align: left;
        vertical-align: top; white-space: nowrap;
      }
      .ssvh-pop th { position: sticky; top: 0; background: #efefef; font-size: 11px; }
      .ssvh-pop tr:hover td { background: #f7fbff; }
    `;
    document.head.appendChild(style);
  }

  function classeChip(livres, total) {
    if (!total) return 'ssvh-neutro';
    if (livres <= 0) return 'ssvh-cheio';
    if (livres < total) return 'ssvh-parcial';
    return 'ssvh-livre';
  }

  function pintar(alvo, dados) {
    const { tabela, container } = alvo;
    const {
      agendaId, chave, dataStr, tipoChave, config, configuradas,
      ocupadasPorHora, detalhesPorHora, detalhesTodosPorHora,
      ocupadasTipoPorHora, detalhesTipoPorHora,
      temTipoVaga, bloqueios, avisos,
    } = dados;

    injetarCss();
    if (tabela) tabela.dataset.ssvhChave = chave;

    // Conta as linhas livres por horário (uma linha = uma vaga livre).
    const linhas = tabela
      ? [...tabela.querySelectorAll('tr')].filter((tr) => tr.querySelector('td'))
      : [];
    const linhasPorHora = new Map();
    linhas.forEach((tr) => {
      const hora = horaDaLinha(tr);
      if (!hora) return;
      if (!linhasPorHora.has(hora)) linhasPorHora.set(hora, []);
      linhasPorHora.get(hora).push(tr);
    });

    // --- números por horário, só do tipo de vaga selecionado ---
    const horas = new Set([...linhasPorHora.keys(), ...configuradas.keys()]);
    const porHora = new Map();
    horas.forEach((hora) => {
      const cfg = configuradas.get(hora);
      const configTipo = cfg ? (cfg.porTipo[tipoChave] || 0) : 0;
      // A linha na tela só indica que sobrou pelo menos uma vaga deste tipo.
      const temLinha = linhasPorHora.has(hora);

      // Ocupadas: número real quando a listagem separa o tipo de vaga; senão,
      // usa todos os agendados do horário (aproximação, sinalizada no chip).
      const ocupTipo = ocupadasTipoPorHora
        ? (ocupadasTipoPorHora.get(hora) || 0)
        : (ocupadasPorHora.get(hora) || 0);
      const aproximado = !ocupadasTipoPorHora && ocupTipo > 0;

      // Livres = configuradas − ocupadas, corrigido pelo que a tela mostra.
      let livres = Math.max(configTipo - ocupTipo, 0);
      let divergencia = '';
      if (!temLinha && livres > 0) {
        divergencia = `a tela não oferece vaga neste horário, mas a conta daria ${livres} livre(s) `
          + '— provável bloqueio, reserva ou agendamento fora deste relatório';
        livres = 0;
      } else if (temLinha && livres === 0) {
        divergencia = 'a tela oferece vaga aqui, mas a conta daria 0 livre(s) '
          + '— confira as vagas configuradas deste horário';
        livres = 1;
      }

      porHora.set(hora, {
        cfg,
        configTipo,
        livres,
        ocupTipo,
        temLinha,
        aproximado,
        divergencia,
        // total configurado somando todos os tipos (só informativo, no tooltip)
        configTodos: cfg ? cfg.total : 0,
        ocupTodos: ocupadasPorHora.get(hora) || 0,
        agendados: (detalhesTipoPorHora || detalhesPorHora).get(hora) || [],
        // agendados daquele horário que os filtros descartaram (outro
        // procedimento, ou outro tipo de vaga)
        descartados: (detalhesTodosPorHora.get(hora) || [])
          .filter((o) => !((detalhesTipoPorHora || detalhesPorHora).get(hora) || []).includes(o)),
      });
    });

    let totalConfigTipo = 0;
    let totalConfigTodos = 0;
    configuradas.forEach((v) => {
      totalConfigTodos += v.total;
      totalConfigTipo += v.porTipo[tipoChave] || 0;
    });

    let totalOcupadoTipo = 0;
    let totalLivre = 0;
    porHora.forEach((v) => { totalOcupadoTipo += v.ocupTipo; totalLivre += v.livres; });

    // --- monta o chip de um horário ---
    const montarChip = (hora, v) => {
      const totalTipoHora = v.configTipo || (v.livres + v.ocupTipo);
      const detalhe = [
        `${TIPOS[tipoChave].label}: ${v.livres} livre(s) de ${totalTipoHora}`,
        `ocupadas: ${v.ocupTipo}${v.aproximado ? ' (todos os tipos deste horário — a listagem não separa por tipo de vaga)' : ''}`,
        `todos os tipos: ${v.ocupTodos} ocupada(s) de ${v.configTodos}`,
        v.cfg && v.cfg.observacoes.size ? `obs.: ${[...v.cfg.observacoes].join(' / ')}` : '',
        v.divergencia ? `\nAtenção: ${v.divergencia}` : '',
        v.ocupTipo || v.agendados.length ? '\nClique para ver os agendados.' : '',
      ].filter(Boolean).join(' · ');

      const chip = document.createElement('span');
      chip.className = `ssvh-chip ${classeChip(v.livres, totalTipoHora)}`;
      if (v.divergencia) chip.classList.add('ssvh-duvida');
      chip.title = `${hora} — ${detalhe}`;
      chip.innerHTML = `${v.livres}/${totalTipoHora} ${esc(TIPOS[tipoChave].label)}` +
        (v.ocupTipo ? ` <span class="ssvh-det">(${v.ocupTipo} ocup.${v.aproximado ? '?' : ''})</span>` : '');

      if (v.ocupTipo > 0 || v.agendados.length) {
        chip.classList.add('ssvh-clicavel');
        chip.addEventListener('click', (ev) => {
          // o clique não pode disparar a seleção da vaga na linha
          ev.preventDefault();
          ev.stopPropagation();
          abrirPopover(chip, {
            hora,
            agendados: v.agendados,
            descartados: v.descartados,
            ocupTipo: v.ocupTipo,
            tipoChave,
            temTipoVaga,
            resumo: `${v.livres} livre(s) de ${totalTipoHora} · ${v.ocupTipo} ocupada(s)`,
          });
        });
      }
      return chip;
    };

    // O painel de horários é um grid_3 (~140px) do grid de 960, então a tabela
    // não tem para onde crescer. Alargamos o painel para ocupar o que sobra ao
    // lado do calendário.
    if (tabela) {
      const painel = tabela.closest('[class*="horario_"]');
      if (painel && !painel.dataset.ssvhLargura) {
        const calendario = painel.parentElement
          && painel.parentElement.querySelector('[class*="calendario"], [class*="calendar_"]');
        const mCal = calendario && calendario.className.match(/grid_(\d+)/);
        const colunasCalendario = mCal ? Number(mCal[1]) : 5;
        const largura = Math.max(16 - colunasCalendario - 1, 6);
        if (/grid_\d+/.test(painel.className)) {
          painel.className = painel.className.replace(/grid_\d+/, `grid_${largura}`);
        } else {
          painel.style.width = '100%';
        }
        painel.dataset.ssvhLargura = '1';
      }
    }

    // Sem observação a tabela vem com 2 colunas e fica espremida num canto.
    // Injetamos a coluna de observação (com "—") para ela ocupar a largura
    // toda, igual às agendas que têm observação.
    if (tabela && !tabela.dataset.ssvhColunaObs) {
      const linhasTabela = [...tabela.querySelectorAll('tr')];
      const semObservacao = linhasTabela.length
        && linhasTabela.every((tr) => tr.children.length === 2);
      if (semObservacao) {
        const grupo = tabela.querySelector('colgroup');
        if (grupo) {
          const cols = grupo.querySelectorAll('col');
          if (cols[0]) cols[0].setAttribute('width', '60');
          const novaCol = document.createElement('col');
          novaCol.setAttribute('width', '*');
          grupo.insertBefore(novaCol, cols[cols.length - 1]);
        }
        linhasTabela.forEach((tr) => {
          const ehCabecalho = !!tr.querySelector('th');
          const celula = document.createElement(ehCabecalho ? 'th' : 'td');
          celula.textContent = ehCabecalho ? 'Observação' : '—';
          if (!ehCabecalho) celula.className = 'ssvh-obs-vazia';
          tr.insertBefore(celula, tr.children[1]);
        });
        tabela.style.width = '100%';
        tabela.dataset.ssvhColunaObs = '1';
      }
    }

    // A tabela pode vir com 3 colunas (hora, observação, ação) ou com 2 (hora,
    // ação), quando não há observação. O chip vai na última coluna que não é a
    // do botão, para não ficar espremido embaixo dele.
    const indiceDaCelula = (tr) => {
      const tds = [...tr.querySelectorAll('td')];
      if (!tds.length) return -1;
      const ultimaLivre = tds.map((td, i) => ({ td, i }))
        .filter(({ td }) => !td.querySelector('input, button, a'))
        .pop();
      return ultimaLivre ? ultimaLivre.i : 0;
    };

    let colunaChip = 0;
    const modeloLinha = [...linhasPorHora.values()][0];
    if (modeloLinha && modeloLinha[0]) colunaChip = Math.max(indiceDaCelula(modeloLinha[0]), 0);

    // --- chip em cada linha existente ---
    linhasPorHora.forEach((trs, hora) => {
      const v = porHora.get(hora);
      trs.forEach((tr, i) => {
        tr.querySelectorAll('.ssvh-chip').forEach((c) => c.remove());
        if (i > 0) return; // marca só a primeira linha do horário
        const tds = tr.querySelectorAll('td');
        const celula = tds[colunaChip] || tds[0];
        if (celula) celula.appendChild(montarChip(hora, v));
      });
    });

    // --- horários deste tipo sem vaga na tela (cheios ou bloqueados) ---
    const cheios = [...configuradas.entries()]
      .filter(([h, v]) => (v.porTipo[tipoChave] || 0) > 0 && !linhasPorHora.has(h))
      .map(([h]) => h)
      .sort();

    if (tabela) {
      tabela.querySelectorAll('.ssvh-linha-cheia').forEach((tr) => tr.remove());
      const colunas = modeloLinha && modeloLinha[0]
        ? modeloLinha[0].querySelectorAll('td').length : 3;

      cheios.forEach((hora) => {
        const v = porHora.get(hora);
        const tr = document.createElement('tr');
        tr.className = 'ssvh-linha-cheia';
        const celulas = [];
        for (let k = 0; k < colunas; k += 1) {
          const td = document.createElement('td');
          tr.appendChild(td);
          celulas.push(td);
        }
        celulas[0].textContent = hora;
        const alvoChip = celulas[colunaChip] || celulas[0];
        if (colunaChip !== 0 && v.cfg && v.cfg.observacoes.size) {
          alvoChip.textContent = [...v.cfg.observacoes].join(' / ');
        }
        alvoChip.appendChild(montarChip(hora, v));

        // insere na ordem cronológica entre as linhas já existentes
        const seguinte = [...tabela.querySelectorAll('tr')]
          .find((outra) => {
            const h = horaDaLinha(outra) || (outra.classList.contains('ssvh-linha-cheia')
              ? outra.querySelector('td').textContent.trim() : '');
            return h && h > hora;
          });
        if (seguinte && seguinte.parentNode) seguinte.parentNode.insertBefore(tr, seguinte);
        else (tabela.querySelector('tbody') || tabela).appendChild(tr);
      });
    }

    // --- resumo acima da tabela (ou no fim do bloco da agenda, se não há tabela) ---
    const destino = container || (tabela && tabela.parentElement);
    if (!destino) return;
    destino.querySelectorAll('.ssvh-resumo').forEach((el) => el.remove());

    const box = document.createElement('div');
    box.className = 'ssvh-resumo';
    box.innerHTML = `
      <b>${esc(TIPOS[tipoChave].label)} em ${esc(dataStr)}</b>
      <span class="ssvh-det">· ${totalLivre} de ${totalConfigTipo} livre(s)</span>
      · <a href="#" class="ssvh-ver-agenda">ver agenda do dia</a>
      <br>
      ${esc(config.profissional)} — ${esc(config.procedimento)}
      · <a href="/agendas/${esc(agendaId)}" target="_blank" rel="noopener">ver configuração ↗</a>
      ${cheios.length ? `<br><label class="ssvh-toggle"><input type="checkbox"> Ver horários já cheios (${cheios.length})</label>` : ''}
      ${bloqueios.length ? `<br><span class="ssvh-alerta">Bloqueio nesta data: ${esc(
        bloqueios.map((b) => `${b.motivo || 'sem motivo'}${b.observacao && b.observacao !== '—' ? ` (${b.observacao})` : ''}`).join(' · ')
      )}</span>` : ''}
      ${avisos.length ? `<br><span class="ssvh-alerta">${esc(avisos.join(' · '))}</span>` : ''}
    `;

    const linkAgenda = box.querySelector('.ssvh-ver-agenda');
    if (linkAgenda) {
      linkAgenda.addEventListener('click', (ev) => {
        ev.preventDefault();
        abrirAgendaDoDia({
          agendaId, dataStr, config, configuradas,
          detalhesPorHora, temTipoVaga,
        });
      });
    }

    const marcador = box.querySelector('.ssvh-toggle input');
    if (marcador) {
      marcador.addEventListener('change', () => {
        if (tabela) tabela.classList.toggle('ssvh-mostra-cheios', marcador.checked);
      });
    }

    if (tabela && tabela.parentElement === destino) destino.insertBefore(box, tabela);
    else destino.appendChild(box);
  }

  /* =========================== Agenda completa do dia =========================== */

  let painelAtual = null;

  function fecharPainel() {
    if (!painelAtual) return;
    painelAtual.remove();
    painelAtual = null;
    document.removeEventListener('keydown', aoTeclarPainel, true);
  }

  function aoTeclarPainel(ev) {
    if (ev.key === 'Escape') fecharPainel();
  }

  /**
   * Mostra a agenda inteira daquela data: todos os horários e todos os tipos de
   * vaga do procedimento selecionado, independente do tipo que está sendo
   * pesquisado na tela.
   */
  function abrirAgendaDoDia({ agendaId, dataStr, config, configuradas, detalhesPorHora, temTipoVaga }) {
    fecharPainel();
    injetarCss();

    const horas = [...new Set([...configuradas.keys(), ...detalhesPorHora.keys()])].sort();
    const tipos = ORDEM_DISTRIBUIDO.filter((t) => {
      const temConfig = [...configuradas.values()].some((v) => (v.porTipo[t] || 0) > 0);
      const temOcup = temTipoVaga && [...detalhesPorHora.values()]
        .some((lista) => lista.some((o) => tipoDaOcupacao(o) === t));
      return temConfig || temOcup;
    });

    const somas = {};
    tipos.forEach((t) => { somas[t] = { total: 0, ocup: 0 }; });

    const linhas = horas.map((hora) => {
      const cfg = configuradas.get(hora);
      const agendados = detalhesPorHora.get(hora) || [];

      const celulas = tipos.map((t) => {
        const total = cfg ? (cfg.porTipo[t] || 0) : 0;
        const ocup = temTipoVaga
          ? agendados.filter((o) => tipoDaOcupacao(o) === t).length
          : 0;
        somas[t].total += total;
        somas[t].ocup += ocup;
        if (!total && !ocup) return '<td class="ssvh-vazio">—</td>';
        const livres = Math.max(total - ocup, 0);
        const classe = livres <= 0 ? 'ssvh-cheio' : (livres < total ? 'ssvh-parcial' : 'ssvh-livre');
        return `<td><span class="ssvh-chip ${classe}">${livres}/${total}</span></td>`;
      }).join('');

      const nomes = agendados.length
        ? agendados.map((o) => `${esc(o.paciente || '(sem nome)')}`
            + (o.tipoVaga ? ` <span class="ssvh-det">(${esc(o.tipoVaga)})</span>` : '')
            + (o.prontuario ? ` <span class="ssvh-det">· pront. ${esc(o.prontuario)}</span>` : ''))
          .join('<br>')
        : '<span class="ssvh-vazio">—</span>';

      const obs = cfg && cfg.observacoes.size ? esc([...cfg.observacoes].join(' / ')) : '';

      return `<tr>
        <td class="ssvh-hora">${esc(hora)}${obs ? `<br><span class="ssvh-det">${obs}</span>` : ''}</td>
        ${celulas}
        <td class="ssvh-nomes">${nomes}</td>
      </tr>`;
    }).join('');

    const rodape = tipos.map((t) => {
      const { total, ocup } = somas[t];
      return `<td><b>${Math.max(total - ocup, 0)}/${total}</b></td>`;
    }).join('');

    const pop = document.createElement('div');
    pop.className = 'ssvh-painel';
    pop.innerHTML = `
      <div class="ssvh-painel-caixa">
        <div class="ssvh-pop-head">
          <b>Agenda de ${esc(dataStr)}</b>
          <span class="ssvh-det">${esc(config.profissional)} — ${esc(config.procedimento)}</span>
          <button class="ssvh-pop-fechar" title="Fechar">✕</button>
        </div>
        ${temTipoVaga ? '' : '<div class="ssvh-pop-nota">A listagem de atendimentos não separa o tipo de vaga, então as ocupadas não foram distribuídas entre os tipos: os números abaixo mostram apenas o que está configurado.</div>'}
        <div class="ssvh-pop-corpo">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                ${tipos.map((t) => `<th>${esc(TIPOS[t].label)}</th>`).join('')}
                <th>Agendados</th>
              </tr>
            </thead>
            <tbody>${linhas || '<tr><td colspan="9" class="ssvh-vazio">Nenhum horário configurado nesta data.</td></tr>'}</tbody>
            ${linhas ? `<tfoot><tr><td><b>Total</b></td>${rodape}<td></td></tr></tfoot>` : ''}
          </table>
        </div>
        <div class="ssvh-painel-rodape">
          Livres/configuradas por tipo de vaga ·
          <a href="/agendas/${esc(agendaId)}" target="_blank" rel="noopener">ver configuração ↗</a>
        </div>
      </div>`;

    pop.addEventListener('click', (ev) => { if (ev.target === pop) fecharPainel(); });
    pop.querySelector('.ssvh-pop-fechar').addEventListener('click', fecharPainel);
    document.body.appendChild(pop);
    painelAtual = pop;
    document.addEventListener('keydown', aoTeclarPainel, true);
  }

  /* ============================ Popover de agendados ============================ */

  let popoverAtual = null;

  function fecharPopover() {
    if (!popoverAtual) return;
    popoverAtual.remove();
    popoverAtual = null;
    document.removeEventListener('click', aoClicarFora, true);
    document.removeEventListener('keydown', aoTeclar, true);
  }

  function aoClicarFora(ev) {
    if (popoverAtual && !popoverAtual.contains(ev.target)) fecharPopover();
  }

  function aoTeclar(ev) {
    if (ev.key === 'Escape') fecharPopover();
  }

  function posicionarPopover(pop, ancora) {
    const r = ancora.getBoundingClientRect();
    pop.style.visibility = 'hidden';
    document.body.appendChild(pop);
    const largura = pop.offsetWidth;
    const altura = pop.offsetHeight;
    let left = r.left;
    if (left + largura > window.innerWidth - 8) left = window.innerWidth - largura - 8;
    if (left < 8) left = 8;
    let top = r.bottom + 6;
    if (top + altura > window.innerHeight - 8) top = Math.max(8, r.top - altura - 6);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = '';
  }

  function abrirPopover(ancora, { hora, agendados, descartados = [], ocupTipo = 0, tipoChave, temTipoVaga, resumo }) {
    fecharPopover();
    injetarCss();

    const tabelaDe = (lista) => {
      const temColunaTipo = lista.some((o) => o.tipoVaga);
      const linhas = lista.map((o) => `
        <tr>
          <td>${esc(o.paciente || '(sem nome)')}</td>
          <td>${esc(o.prontuario || '—')}</td>
          ${temColunaTipo ? `<td>${esc(o.tipoVaga || '—')}</td>` : ''}
          <td>${esc(o.procedimento || '—')}</td>
          <td>${esc(o.situacao || '—')}</td>
        </tr>`).join('');
      return `
        <table>
          <thead>
            <tr>
              <th>Paciente</th><th>Prontuário</th>
              ${temColunaTipo ? '<th>Tipo de consulta</th>' : ''}
              <th>Procedimento</th><th>Situação</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>`;
    };

    let corpo = '';
    let nota = '';

    if (agendados.length) {
      corpo = tabelaDe(agendados);
      if (!temTipoVaga) {
        nota = 'A listagem não separa o tipo de vaga: estes são todos os agendados deste horário.';
      }
    } else {
      // A vaga está ocupada (configuradas − livres), mas nenhum agendamento
      // desta agenda bateu com o horário na listagem de atendimentos.
      nota = 'Nenhum agendamento deste procedimento apareceu neste horário no relatório de '
        + 'atendimentos. Pode ser bloqueio ou reserva do horário, agendamento de outra '
        + 'unidade/especialidade, ou o relatório não carregou.';
      corpo = descartados.length
        ? `<div class="ssvh-pop-sub">Outros agendados neste horário (descartados pelo filtro de procedimento/tipo):</div>${tabelaDe(descartados)}`
        : '<div class="ssvh-pop-vazio">Nenhum agendamento encontrado neste horário.</div>';
    }

    const pop = document.createElement('div');
    pop.className = 'ssvh-pop';
    pop.innerHTML = `
      <div class="ssvh-pop-head">
        <b>${esc(hora)} — ${esc(TIPOS[tipoChave].label)}</b>
        <span class="ssvh-det">${esc(resumo)}</span>
        <button class="ssvh-pop-fechar" title="Fechar">✕</button>
      </div>
      ${nota ? `<div class="ssvh-pop-nota">${esc(nota)}</div>` : ''}
      <div class="ssvh-pop-corpo">${corpo}</div>`;

    pop.addEventListener('click', (ev) => ev.stopPropagation());
    pop.querySelector('.ssvh-pop-fechar').addEventListener('click', fecharPopover);

    posicionarPopover(pop, ancora);
    popoverAtual = pop;
    // capture=true para fechar antes que o site trate o clique
    setTimeout(() => {
      document.addEventListener('click', aoClicarFora, true);
      document.addEventListener('keydown', aoTeclar, true);
    }, 0);
  }

  /* ============================== Fluxo principal ============================== */

  function rotularPaciente(o) {
    return [o.paciente, o.prontuario ? `pront. ${o.prontuario}` : '']
      .filter(Boolean).join(' — ') || '(sem nome)';
  }

  /** Converte o texto do tipo de vaga da listagem na chave interna. */
  function tipoDaOcupacao(o) {
    const t = normalizar(o.tipoVaga || '');
    if (!t) return null;
    for (const [chave, info] of Object.entries(TIPOS)) {
      if (info.rotulos.some((r) => t.includes(r))) return chave;
    }
    return null;
  }

  let ultimaChave = '';
  let ultimoTs = 0;


  async function aoSelecionarDia({ agendaId, dia, mes, ano, tipoId }) {
    const chave = `${agendaId}|${dia}/${mes}/${ano}|${tipoId}`;
    const agora = Date.now();
    if (chave === ultimaChave && agora - ultimoTs < CONFIG.debounceMs) return;
    ultimaChave = chave;
    ultimoTs = agora;


    const dataStr = `${pad2(dia)}/${pad2(mes)}/${ano}`;
    const dataObj = new Date(Number(ano), Number(mes) - 1, Number(dia));
    const tipoChave = TIPO_POR_ID[String(tipoId)] || 'nova_consulta';
    const avisos = [];

    try {
      const alvo = await esperarAlvo(agendaId, chave, CONFIG.esperaTabelaMs);
      if (!alvo.tabela && !alvo.container) {
        warn('bloco da agenda não encontrado na tela para a agenda', agendaId);
        return;
      }
      if (!alvo.tabela) avisos.push('Nenhuma vaga livre listada nesta data.');

      const config = await obterConfigAgenda(agendaId);

      const profissionalId = getProfissionalIdSelecionado();
      if (!profissionalId) avisos.push('Profissional não selecionado na tela: a consulta usou só a unidade e foi filtrada pelo nome do profissional da agenda.');

      let linhas = [];
      try {
        linhas = await buscarAgendamentosDoDia(dataStr, profissionalId);
      } catch (e) {
        avisos.push(`Não foi possível ler os agendamentos do dia (${e.message}).`);
      }

      const profNorm = normalizar(config.profissional);
      const procNorm = normalizar(config.procedimento);
      const doProfissional = linhas.filter((l) => !profNorm || normalizar(l.profissional) === profNorm);

      // Lista de atendimentos: traz o paciente que está em cada vaga.
      const especialidadeId = getEspecialidadeId(config);
      let atendimentos = [];
      if (profissionalId && especialidadeId) {
        try {
          atendimentos = await buscarAtendimentosDoDia(dataStr, profissionalId, especialidadeId);
        } catch (e) {
          avisos.push(`Não foi possível ler a lista de atendimentos (${e.message}).`);
        }
      } else if (!especialidadeId) {
        avisos.push('Especialidade não identificada: os nomes dos pacientes por horário não foram carregados.');
      }

      // Ocupação: prefere a lista de atendimentos (tem paciente e prontuário);
      // o consultar_agendas completa o procedimento de cada linha.
      let ocupacoes;
      if (atendimentos.length) {
        ocupacoes = atendimentos.map((a) => {
          let procedimento = a.procedimento;
          if (!procedimento) {
            const par = doProfissional.find((l) => l.hora === a.hora
              && (!a.paciente || normalizar(l.municipe) === normalizar(a.paciente)));
            if (par) procedimento = par.procedimento;
          }
          return { ...a, procedimento };
        });
      } else {
        ocupacoes = doProfissional.map((l) => ({
          hora: l.hora,
          paciente: l.municipe,
          prontuario: l.prontuario,
          procedimento: l.procedimento,
          situacao: l.situacao,
        }));
      }

      // Só as vagas do procedimento desta agenda (linhas sem procedimento ficam).
      const ocupacoesAgenda = procNorm
        ? ocupacoes.filter((o) => !o.procedimento || normalizar(o.procedimento) === procNorm)
        : ocupacoes;

      const ocupadasPorHora = new Map();
      const detalhesPorHora = new Map();
      ocupacoesAgenda.forEach((o) => {
        if (!o.hora) return;
        ocupadasPorHora.set(o.hora, (ocupadasPorHora.get(o.hora) || 0) + 1);
        if (!detalhesPorHora.has(o.hora)) detalhesPorHora.set(o.hora, []);
        detalhesPorHora.get(o.hora).push(o);
      });

      // Tudo que existe naquele horário, inclusive o que foi descartado pelos
      // filtros — serve para explicar um horário sem nomes no popover.
      const detalhesTodosPorHora = new Map();
      ocupacoes.forEach((o) => {
        if (!o.hora) return;
        if (!detalhesTodosPorHora.has(o.hora)) detalhesTodosPorHora.set(o.hora, []);
        detalhesTodosPorHora.get(o.hora).push(o);
      });

      // Se a lista traz o tipo de vaga, dá pra separar as ocupadas do tipo
      // selecionado; senão, o cálculo cai para "configuradas − livres" no chip.
      const temTipoVaga = ocupacoesAgenda.some((o) => tipoDaOcupacao(o));
      let ocupadasTipoPorHora = null;
      let detalhesTipoPorHora = null;
      if (temTipoVaga) {
        ocupadasTipoPorHora = new Map();
        detalhesTipoPorHora = new Map();
        ocupacoesAgenda
          .filter((o) => tipoDaOcupacao(o) === tipoChave)
          .forEach((o) => {
            if (!o.hora) return;
            ocupadasTipoPorHora.set(o.hora, (ocupadasTipoPorHora.get(o.hora) || 0) + 1);
            if (!detalhesTipoPorHora.has(o.hora)) detalhesTipoPorHora.set(o.hora, []);
            detalhesTipoPorHora.get(o.hora).push(o);
          });
      }

      const configuradas = vagasConfiguradasNaData(config, dataObj);

      const tsData = soDia(dataObj);
      const periodosValendo = config.periodos.filter((p) => tsData >= p.inicioTs && tsData <= p.fimTs
        && p.horarios.some((h) => h.diaSemana === dataObj.getDay()));
      if (periodosValendo.length > 1) {
        avisos.push(`Atenção: ${periodosValendo.length} períodos sobrepostos valem para esta data — as vagas configuradas estão somadas.`);
      }

      if (!configuradas.size) {
        avisos.push('Nenhum horário configurado bate com esta data (confira período, dia da semana e agenda específica).');
      }

      const dados = {
        agendaId, chave, dataStr, tipoChave, config, configuradas,
        ocupadasPorHora, detalhesPorHora, detalhesTodosPorHora, ocupacoesAgenda,
        ocupadasTipoPorHora, detalhesTipoPorHora, temTipoVaga,
        bloqueios: bloqueiosNaData(config, dataObj),
        avisos,
      };

      pintar(alvo, dados);
      window.__ssVagas = { ...dados, linhas, doProfissional, atendimentos, especialidadeId };
      log('resultado', window.__ssVagas);
    } catch (e) {
      warn('falha ao montar as vagas:', e);
    }
  }

  /* ====================== Interceptação de XHR e fetch ====================== */

  function tratarUrl(rawUrl) {
    try {
      if (typeof rawUrl !== 'string' || !rawUrl.includes('obter_agenda_horario_dia')) return;
      const u = new URL(rawUrl, location.origin);
      const agendaId = u.searchParams.get('agenda_id');
      const dia = u.searchParams.get('dia');
      const mes = u.searchParams.get('mes');
      const ano = u.searchParams.get('ano');
      const tipoId = u.searchParams.get('tipo_atividade_agendamento_id');
      if (agendaId && dia && mes && ano) {
        setTimeout(() => aoSelecionarDia({ agendaId, dia, mes, ano, tipoId }), 0);
      }
    } catch (_) { /* silencioso */ }
  }

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    tratarUrl(url);
    return origOpen.call(this, method, url, ...rest);
  };

  const origFetch = window.fetch;
  window.fetch = function (input) {
    tratarUrl(typeof input === 'string' ? input : input && input.url);
    return origFetch.apply(this, arguments);
  };

  console.log(`[Vagas] v1.10.0 ativo em ${AMBIENTE} — aguardando clique num dia da agenda.`);
})();
