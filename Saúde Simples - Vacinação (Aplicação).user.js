// ==UserScript==
// @name         💉 Saúde Simples — Vacinação (Aplicação)
// @namespace    om30-guaruja
// @version      0.2.0
// @description  Facilita o preenchimento da aplicação e verifica pendências antes de salvar.
// @downloadURL  https://raw.githubusercontent.com/otowm/om30-saudesimples/main/Sa%C3%BAde%20Simples%20-%20Vacina%C3%A7%C3%A3o%20(Aplica%C3%A7%C3%A3o).user.js
// @updateURL    https://raw.githubusercontent.com/otowm/om30-saudesimples/main/Sa%C3%BAde%20Simples%20-%20Vacina%C3%A7%C3%A3o%20(Aplica%C3%A7%C3%A3o).user.js
// @author       otowm
// @match        https://guaruja.saudesimples.net/esus/vacinacoes*
// @match        https://guarujahomolog.saudesimples.net/esus/vacinacoes*
// @grant        none
// @inject-into  page
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const PROFISSIONAL_LOGADO = true; // Selecionar o profissional do usuário na nova ficha.
    const LOCAL_UBS = true; // Preencher UBS quando o local estiver vazio.
    const MATERNAL_SEM_PADRAO = true; // Exigir escolha maternal nas fichas novas.
    const BUSCA_VACINA = true; // Buscar imunobiológicos e destacar os que têm lote.
    const ROTINA_FAIXA_ETARIA = true; // Sugerir Faixa Etária para a estratégia Rotina.
    const VIAS_DE_VACINA = true; // Mostrar primeiro as vias usadas em vacinação.
    const LOTE_FABRICANTE = true; // Lembrar o fabricante por imunobiológico e lote.
    const CPF_OBRIGATORIO = true; // Bloquear quando confirmado que o munícipe está sem CPF.
    const DOSE_DUPLICADA_NA_FICHA = true; // Avisar sobre vacina e dose repetidas nesta ficha.
    const HISTORICO_PAINEL = true; // Painel com as vacinas da carteirinha e as doses que o sistema oferece; clique lança a dose na ficha.
    const DOSE_DUPLICADA_HISTORICO = true; // Avisar sobre dose já aplicada na carteirinha.

    const $ = window.jQuery;
    if (!$) return;
    $(function () {
        setTimeout(iniciar, 0);
    });

    function iniciar() {
        if (document.body.hasAttribute('data-vac-iniciado')) return;
        document.body.setAttribute('data-vac-iniciado', '1');
        const FORMULARIOS = 'form#new_esus_vacinacao, form.esus_vacinacao';
        const MATERNAL = 'input[type="radio"][name="esus_vacinacao[condicao_maternal]"]';
        const FABRICANTE = 'select.esus-vacinacao-fabricante-input';
        const CHAVE_MEMORIA = 'vac-lote-fabricante';
        const estados = new WeakMap();
        const dosesHistorico = new Map();
        const filaDoses = [];
        let consultasDoses = 0;
        let lancandoDose = false;
        let usuario;
        let agendado = false;

        $('<style>', { id: 'vac-estilo', text: `
            .vac-aviso {clear:both; padding:12px; margin:10px 0; border:1px solid currentColor; border-radius:4px; font-size:14px; line-height:1.5}
            .vac-erro {color:#b42318; background:#fef3f2}
            .vac-alerta {color:#b54708; background:#fffaeb}
            .vac-cpf-ok {display:block; clear:both; color:#067647; margin:8px 0}
            .vac-nota {font-size:12px; color:#667085; display:block; margin:4px 0}
            .vac-maternal {outline:2px solid #b54708; outline-offset:3px}
            .vac-destaque {outline:3px solid #b42318 !important; outline-offset:3px}
            .vac-busca {display:block; box-sizing:border-box; width:100%; margin:5px 0}
            .vac-opcao-oculta {display:none !important}
            .vac-link {color:inherit; text-decoration:underline; cursor:pointer}
            .vac-pendencia {display:block; margin:5px 0}
            .vac-aviso button {margin:6px 8px 0 0}
            .vac-hist-painel, .vac-hist-painel * {box-sizing:border-box}
            .vac-hist-painel {clear:both; background:#fff; border:1px solid #d0d5dd; border-radius:6px; margin:14px 0; overflow:hidden; font:13px/1.4 Roboto,sans-serif; color:#344054}
            .vac-hist-cabecalho {display:flex; align-items:center; flex-wrap:wrap; gap:16px; padding:12px 16px}
            .vac-hist-painel .vac-hist-titulo {margin:0; font:700 15px/1.4 Roboto,sans-serif; color:#344054}
            .vac-hist-fonte {margin-left:auto; text-align:right; font-size:12px; color:#667085}
            .vac-hist-acoes {display:inline-flex; gap:12px; margin-left:12px}
            .vac-hist-alerta {background:#fef3f2; color:#b42318; padding:8px 16px; border-top:1px solid #fee4e2; border-bottom:1px solid #fee4e2}
            .vac-hist-linha {display:flex; align-items:center; padding:10px 16px; border-bottom:1px solid #eaecf0}
            .vac-hist-linha:nth-child(odd) {background:#f9fafb}
            .vac-hist-vacina {width:190px; flex:0 0 190px; padding-right:12px; font-size:14px; font-weight:700; color:#344054}
            .vac-hist-vacina .vac-nota {font-weight:400}
            .vac-hist-doses {display:flex; flex:1; flex-wrap:wrap; gap:10px; min-width:0}
            .vac-hist-dose {width:150px; height:62px; flex:0 0 150px; border:2px solid; border-radius:6px; padding:8px 10px}
            .vac-hist-dose-nome {font-size:12px; font-weight:700; text-transform:uppercase; line-height:13px}
            .vac-hist-detalhe {font-size:13px; line-height:15px; white-space:nowrap}
            .vac-hist-unidade {font-size:11px; line-height:12px; color:#667085; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
            .vac-hist-aplicada {border-color:#12b76a; background:#ecfdf3}
            .vac-hist-aplicada .vac-hist-dose-nome {color:#067647}
            .vac-hist-disponivel {border-color:#d0d5dd; background:#fff; color:#344054}
            .vac-hist-disponivel .vac-hist-detalhe {color:#667085}
            .vac-hist-disponivel:hover, .vac-hist-disponivel:focus {border-color:#2e90fa; cursor:pointer}
            .vac-hist-registrando {border-color:#f79009; background:#fffaeb}
            .vac-hist-registrando .vac-hist-dose-nome {color:#b54708}
            .vac-hist-duplicada {border-color:#f04438}
            .vac-hist-legenda {display:flex; flex-wrap:wrap; align-items:center; gap:20px; padding:10px 16px; color:#667085; font-size:12px}
            .vac-hist-legenda-item {display:inline-flex; align-items:center; gap:6px}
            .vac-hist-amostra {display:inline-block; width:14px; height:14px; border-width:2px; border-style:solid; border-radius:3px}
            .vac-hist-estado, .vac-hist-subtitulo {padding:10px 16px}
            .vac-hist-erro {color:#b54708; background:#fffaeb}
            .vac-hist-painel [hidden] {display:none !important}
            @media (max-width:650px) {.vac-hist-linha {flex-wrap:wrap; gap:8px} .vac-hist-vacina {width:100%; flex-basis:100%}}
        ` }).appendTo(document.head);

        function marcar(el, nome) {
            const attr = 'data-vac-' + nome;
            if (el.hasAttribute(attr)) return false;
            el.setAttribute(attr, '1');
            return true;
        }
        function selecionar(el, valor) {
            if (el && Array.from(el.options).some(o => o.value === String(valor))) {
                $(el).val(String(valor)).trigger('chosen:updated').trigger('change');
            }
        }
        function normalizar(texto) {
            return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        }
        function itensAtivos(form) {
            return Array.from(form.querySelectorAll('#item_container .nested-fields')).filter(item => {
                const destruir = item.querySelector('input[id$="_destroy"]');
                return !/^(1|true)$/i.test(destruir ? destruir.value : '') && $(item).is(':visible');
            });
        }
        function agendar() {
            if (agendado) return;
            agendado = true;
            setTimeout(() => { agendado = false; processar(); }, 0);
        }
        function processarModal() {
            if (!PROFISSIONAL_LOGADO) return;
            document.querySelectorAll('#esus_agendamento_form_profissional_id').forEach(el => {
                if (!marcar(el, 'profissional') || el.value) return;
                if (!usuario) usuario = Promise.resolve($.getJSON('/current_usuario'));
                usuario.then(dados => {
                    setTimeout(() => {
                        if (el.isConnected && !el.value) selecionar(el, dados.profissional_id);
                    }, 0);
                }).catch(() => {});
            });
            document.querySelectorAll('#esus_agendamento_form_ocupacao_id').forEach(el => {
                if (!marcar(el, 'ocupacao') || el.value) return;
                const opcoes = Array.from(el.options).filter(o => o.value);
                if (opcoes.length === 1) selecionar(el, opcoes[0].value);
            });
        }
        function prepararBusca(select) {
            if (!marcar(select, 'busca')) return;
            const item = select.closest('.nested-fields');
            const opcoes = Array.from(select.options);
            const lotes = new Map();
            opcoes.forEach(o => {
                o.setAttribute('data-vac-texto', o.textContent);
                // Guardar somente as ocultações alheias à regra de registro anterior.
                if (o.style.display === 'none' && o.dataset.apenasRegistroAnterior !== 'true') o.dataset.vacOcultaSite = '1';
                let lista = [];
                try { lista = JSON.parse(o.dataset.lotes || '[]'); } catch (_) { /* Lote inválido: manter a opção. */ }
                if (!Array.isArray(lista)) lista = [];
                lotes.set(o, lista.length > 0);
                if (lista.length) {
                    const saldo = lista.reduce((s, par) => s + (Number(par[1]) || 0), 0);
                    o.textContent += ' — estoque: ' + saldo.toLocaleString('pt-BR');
                }
            });
            const selecionado = select.value;
            const fragmento = document.createDocumentFragment();
            [opcoes.filter(o => !o.value), opcoes.filter(o => o.value && lotes.get(o)), opcoes.filter(o => o.value && !lotes.get(o))]
                .flat().forEach(o => fragmento.appendChild(o));
            select.appendChild(fragmento);
            select.value = selecionado;
            // Atributos via .attr: com $('<input>', {...}) a chave "autocomplete" chamaria o plugin do jQuery UI.
            const busca = $('<input type="text">').attr({
                class: 'vac-busca', placeholder: 'Buscar vacina… (ex.: pneumo 13, hepatite)',
                'aria-label': 'Buscar vacina', autocomplete: 'off'
            }).insertBefore(select)[0];
            function filtrar(escolher) {
                const termos = busca.value.trim().split(/\s+/).map(normalizar).filter(Boolean);
                const anterior = $(item).find('input[id*="registro_anterior"]:checked').val() === 'true';
                const resultados = [];
                Array.from(select.options).forEach(o => {
                    const ocultaSite = o.dataset.vacOcultaSite === '1' || (o.dataset.apenasRegistroAnterior === 'true' && !anterior);
                    const combina = termos.every(t => normalizar(o.dataset.vacTexto).includes(t));
                    const ocultar = !!o.value && (ocultaSite || !combina);
                    o.classList.toggle('vac-opcao-oculta', ocultar);
                    o.hidden = ocultar;
                    o.style.display = ocultar ? 'none' : '';
                    if (o.value && !ocultar) resultados.push(o);
                });
                if (escolher && termos.length && resultados.length === 1 && select.value !== resultados[0].value) {
                    selecionar(select, resultados[0].value);
                }
                return resultados;
            }
            $(busca).on('input', () => filtrar(true)).on('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const resultados = filtrar(false);
                    if (resultados.length) selecionar(select, resultados[0].value);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    select.focus();
                }
            });
            $(item).on('change.vac', 'input[id*="registro_anterior"]', () => setTimeout(() => filtrar(false), 0));
            filtrar(false);
        }
        function prepararGrupo(select) {
            if (!marcar(select, 'grupo')) return;
            const valor = select.value;
            const opcoes = Array.from(select.options);
            const prioridade = ['', '117', '188', '189'];
            prioridade.forEach(v => opcoes.filter(o => o.value === v).forEach(o => select.appendChild(o)));
            opcoes.filter(o => !prioridade.includes(o.value)).forEach(o => select.appendChild(o));
            select.value = valor;
            $(select).trigger('chosen:updated');
        }
        function prepararVia(select) {
            if (!marcar(select, 'via')) return;
            const permitidas = ['', 'intramuscular', 'subcutanea', 'intradermica', 'oral', 'nasal'];
            let todas = false;
            const link = $('<a>', { href: '#', class: 'vac-nota vac-link' }).insertAfter(select);
            function atualizar() {
                Array.from(select.options).forEach(o => {
                    const ocultar = !todas && !permitidas.includes(o.value) && o.value !== select.value;
                    o.classList.toggle('vac-opcao-oculta', ocultar);
                    o.hidden = ocultar;
                    o.style.display = ocultar ? 'none' : '';
                });
                link.text(todas ? 'só vias de vacina' : 'mostrar todas as vias');
            }
            link.on('click', e => { e.preventDefault(); todas = !todas; atualizar(); });
            $(select).on('change.vac', atualizar);
            atualizar();
        }
        function lerMemoria() {
            try {
                const dados = JSON.parse(localStorage.getItem(CHAVE_MEMORIA) || '{}');
                return dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {};
            } catch (_) { return {}; }
        }
        function chaveItem(item) {
            const imuno = $(item).find('select.tipo_imunobiologico').val();
            const campos = $(item).find('.esus-vacinacao-lote-select, .esus-vacinacao-lote-sem-estoque-input, .esus-vacinacao-lote-manual-registro-anterior-input');
            const ativo = campos.filter(':visible').not(':disabled').first();
            const lote = String(ativo.length ? ativo.val() || '' : $(item).find('.esus-vacinacao-lote-hidden').val() || '').trim().toUpperCase();
            return imuno && lote ? imuno + '|' + lote : '';
        }
        function lembrarFabricante(item) {
            if (!LOTE_FABRICANTE || !item.isConnected) return;
            const chave = chaveItem(item);
            const lembrado = lerMemoria()[chave];
            if (!chave || !lembrado || !lembrado.fabricante_id) return;
            const selects = Array.from(item.querySelectorAll(FABRICANTE));
            // Um valor escolhido pelo usuário em qualquer um dos dois campos prevalece.
            if (selects.some(s => s.value && s.value !== String(lembrado.fabricante_id))) return;
            selects.forEach(select => {
                if (select.value || !Array.from(select.options).some(o => o.value === String(lembrado.fabricante_id))) return;
                selecionar(select, lembrado.fabricante_id);
                if (!$(select).siblings('.vac-fabricante-lembrado').length) {
                    $('<span>', { class: 'vac-nota vac-fabricante-lembrado', text: 'fabricante lembrado deste lote' }).insertAfter(select);
                }
            });
        }
        function aprender(form) {
            if (!LOTE_FABRICANTE) return;
            const memoria = lerMemoria();
            itensAtivos(form).forEach(item => {
                const chave = chaveItem(item);
                const selects = $(item).find(FABRICANTE);
                // Chosen oculta o select; a visibilidade do li identifica o campo em uso.
                const fabricante = selects.filter(function () { return $(this).closest('li').is(':visible'); }).first().val() ||
                    selects.filter(function () { return !!this.value; }).first().val();
                if (chave && fabricante) memoria[chave] = { fabricante_id: String(fabricante), ts: Date.now() };
            });
            const recentes = Object.entries(memoria).filter(([, v]) => v && v.fabricante_id)
                .sort((a, b) => (Number(b[1].ts) || 0) - (Number(a[1].ts) || 0)).slice(0, 500);
            try { localStorage.setItem(CHAVE_MEMORIA, JSON.stringify(Object.fromEntries(recentes))); } catch (_) { /* Seguir sem memória. */ }
        }
        function prepararItem(item) {
            if (BUSCA_VACINA) item.querySelectorAll('select.tipo_imunobiologico').forEach(prepararBusca);
            if (ROTINA_FAIXA_ETARIA) item.querySelectorAll('select.esus-vacinacao-grupo-atendimento').forEach(prepararGrupo);
            if (VIAS_DE_VACINA) item.querySelectorAll('select.via_administracao').forEach(prepararVia);
            if (LOTE_FABRICANTE && marcar(item, 'observado')) {
                new MutationObserver(mudancas => {
                    if (mudancas.some(m => Array.from(m.addedNodes).some(n => n.nodeType === 1 && (n.matches(FABRICANTE) || n.querySelector(FABRICANTE))))) {
                        setTimeout(() => lembrarFabricante(item), 0);
                    }
                }).observe(item, { childList: true, subtree: true });
                lembrarFabricante(item);
            }
        }
        function lerCabecalho(form, rotulo) {
            const strong = Array.from(form.querySelectorAll('strong')).find(s => s.textContent.trim() === rotulo);
            return strong ? $(strong).closest('li').next('li').text().trim() : '';
        }
        async function consultarCpf(form, semCache = false) {
            const estado = estados.get(form);
            const rodada = ++estado.consulta;
            const id = $(form).find('#esus_vacinacao_municipe_id').val();
            const cns = lerCabecalho(form, 'CNS do Cidadão');
            const nomeData = [lerCabecalho(form, 'Nome'), lerCabecalho(form, 'Data de nascimento')].filter(Boolean).join(' ');
            async function buscar(q) {
                if (!q || !id) throw new Error('Munícipe não identificado');
                const dados = await $.ajax({ url: '/municipes/search.json', data: { q }, dataType: 'json', cache: !semCache });
                return Array.isArray(dados) ? dados.find(r => String(r.id) === String(id)) : null;
            }
            let resultado = 'erro';
            let cpf = '';
            try {
                let registro;
                if (/^\d+$/.test(cns)) {
                    try { registro = await buscar(cns); } catch (_) { /* Tentar também nome e nascimento. */ }
                }
                if (!registro) registro = await buscar(nomeData);
                if (registro) {
                    const candidatos = [registro.cpf_numero_sem_formatacao, registro.cpf_numero].map(v => String(v || '').replace(/\D/g, ''));
                    cpf = candidatos.find(v => v.length === 11) || '';
                    resultado = cpf ? 'tem' : 'falta';
                }
            } catch (_) { resultado = 'erro'; }
            if (rodada !== estado.consulta || !form.isConnected) return;
            estado.cpf = resultado;
            $(form).find('.vac-cpf').remove();
            if (resultado === 'tem') {
                const formatado = cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
                $('<small>', { class: 'vac-cpf vac-cpf-ok', text: 'CPF: ' + formatado }).insertAfter($(form).find('h4').first());
            } else {
                const aviso = $('<div>', { class: 'vac-cpf vac-aviso ' + (resultado === 'falta' ? 'vac-erro' : 'vac-alerta'), role: 'status' }).prependTo(form);
                $('<strong>', { text: resultado === 'falta' ? 'Munícipe sem CPF — cadastre o CPF antes de salvar' : 'Não consegui verificar o CPF' }).appendTo(aviso);
                if (resultado === 'falta') {
                    aviso.append(' ');
                    $('<a>', { class: 'vac-link', text: 'Editar Munícipe', href: '/municipes/' + encodeURIComponent(id) + '/edit', target: '_blank', rel: 'noopener' }).appendTo(aviso);
                }
                aviso.append(' ');
                $('<button>', { type: 'button', text: 'Verificar de novo' }).appendTo(aviso).on('click', async function () {
                    this.disabled = true;
                    await consultarCpf(form, true);
                    if (this.isConnected) this.disabled = false;
                });
            }
            if (form.querySelector('#vac-pendencias')) mostrarPendencias(form, pendencias(form), estado.botao);
        }
        function prepararForm(form) {
            if (!marcar(form, 'formulario')) return;
            estados.set(form, { cpf: 'pendente', consulta: 0, ignorarDuplicadas: false, botao: null });
            if (LOCAL_UBS) {
                const local = form.querySelector('#esus_vacinacao_local_atendimento_id');
                if (local && !local.value) selecionar(local, '1');
            }
            if (MATERNAL_SEM_PADRAO && /^\/esus\/vacinacoes\/new\/?$/.test(location.pathname)) {
                $(form).find(MATERNAL).prop('checked', false);
                const campo = $(form).find('.condicoes-agrupamento-maternal').addClass('vac-maternal');
                $('<small>', { class: 'vac-nota vac-escolha-maternal', text: 'Escolha uma opção' }).appendTo(campo);
            }
            if (CPF_OBRIGATORIO) consultarCpf(form);
        }
        function normalizarDose(texto) {
            const ordinais = { primeira: '1', segunda: '2', terceira: '3', quarta: '4' };
            return normalizar(String(texto || '').toLowerCase().replace(/[ªº]/g, '')
                .replace(/\b(primeira|segunda|terceira|quarta)\b/g, palavra => ordinais[palavra])
                .replace(/(\d+)\s*[ao]\s*(?=dose\b)/g, '$1'));
        }
        function doseNaoRepetivel(texto) {
            return /^(\d+dose|unica)$/.test(normalizarDose(texto));
        }
        function opcoesHistorico(form) {
            let select = form.querySelector('#item_container select.tipo_imunobiologico');
            if (!select) {
                const link = form.querySelector('#item_container a.add_fields');
                const modelo = new DOMParser().parseFromString(link?.getAttribute('data-association-insertion-template') || '', 'text/html');
                select = modelo.querySelector('select.tipo_imunobiologico');
            }
            return select ? Array.from(select.options).filter(o => o.value).map(o => {
                let estoque = false;
                try { const lotes = JSON.parse(o.dataset.lotes || '[]'); estoque = Array.isArray(lotes) && lotes.length > 0; } catch (_) { /* Seguir sem estoque. */ }
                return {
                    id: o.value, nome: (o.dataset.vacTexto || o.textContent).trim().replace(/^vacina\s+/i, ''), estoque,
                    oculta: o.dataset.vacOcultaSite === '1' || o.dataset.apenasRegistroAnterior === 'true' ||
                        (!o.hasAttribute('data-vac-texto') && (o.hidden || o.style.display === 'none'))
                };
            }) : [];
        }
        async function mapearNome(nome, opcoes) {
            const chave = normalizar(nome);
            let memoria = {};
            try {
                const dados = JSON.parse(localStorage.getItem('vac-nome-imuno') || '{}');
                if (dados && typeof dados === 'object' && !Array.isArray(dados)) memoria = dados;
            } catch (_) { /* Seguir sem memória. */ }
            const salvo = memoria[chave];
            if (salvo && Date.now() - salvo.ts < 7 * 86400000 && (salvo.id === null || salvo.id)) {
                return salvo.id == null ? null : String(salvo.id);
            }
            let id = null;
            try {
                if (nome.trim().length >= 3) {
                    const dados = await $.ajax({ url: '/produtos_controlaveis.json', data: { q: nome.trim() }, dataType: 'json', timeout: 15000 });
                    const vacinas = Array.isArray(dados) ? dados.filter(v => v.controlavel_type === 'Vacina') : [];
                    const igual = vacinas.find(v => normalizar(v.nome) === chave || normalizar(v.nome_popular) === chave);
                    const comTipo = vacinas.filter(v => v.esus_vacinas_tipo_imunobiologico_id != null);
                    const vacina = igual || (comTipo.length === 1 ? comTipo[0] : null);
                    if (vacina?.esus_vacinas_tipo_imunobiologico_id != null) id = String(vacina.esus_vacinas_tipo_imunobiologico_id);
                }
            } catch (_) { /* Tentar a lista da ficha. */ }
            if (id == null) {
                const iguais = opcoes.filter(o => normalizar(o.nome) === chave);
                const contem = opcoes.filter(o => normalizar(o.nome).includes(chave) || chave.includes(normalizar(o.nome)));
                const opcao = iguais.length === 1 ? iguais[0] : (contem.length === 1 ? contem[0] : null);
                id = opcao ? opcao.id : null;
            }
            try {
                const atuais = JSON.parse(localStorage.getItem('vac-nome-imuno') || '{}');
                if (atuais && typeof atuais === 'object' && !Array.isArray(atuais)) memoria = atuais;
                memoria[chave] = { id, ts: Date.now() };
                localStorage.setItem('vac-nome-imuno', JSON.stringify(memoria));
            } catch (_) { /* Seguir sem memória. */ }
            return id;
        }
        function consultarDoses(id) {
            if (!dosesHistorico.has(id)) {
                dosesHistorico.set(id, new Promise((resolve, reject) => {
                    filaDoses.push({ id, resolve, reject });
                    executarFilaDoses();
                }));
            }
            return dosesHistorico.get(id);
        }
        function executarFilaDoses() {
            while (consultasDoses < 4 && filaDoses.length) {
                const tarefa = filaDoses.shift();
                consultasDoses++;
                Promise.resolve($.ajax({ url: '/esus/vacinacoes/campo_tipo_dose', dataType: 'html', timeout: 15000, data: {
                    tipo_imunobiologico_id: tarefa.id, tipo_estrategia_id: 1, child_index: 0,
                    atendimento_klass: 'Esus::Vacinacao', registro_anterior: false
                } })).then(html => {
                    const pagina = new DOMParser().parseFromString(html, 'text/html');
                    const select = pagina.querySelector('select');
                    if (!select) throw new Error('Lista de doses ausente');
                    return Array.from(select.options).filter(o => o.value).map(o => ({ valor: o.value, texto: o.textContent.trim() }));
                }).then(tarefa.resolve, erro => {
                    dosesHistorico.delete(tarefa.id);
                    tarefa.reject(erro);
                }).finally(() => { consultasDoses--; executarFilaDoses(); });
            }
        }
        function prepararHistorico(form) {
            if ((!HISTORICO_PAINEL && !DOSE_DUPLICADA_HISTORICO) || !form.querySelector('#item_container') || !marcar(form, 'historico')) return;
            const hist = { status: 'carregando', linhas: [], rodada: 0, painel: null, timer: null, recolhido: false };
            estados.get(form).historico = hist;
            if (HISTORICO_PAINEL) {
                try { hist.recolhido = localStorage.getItem('vac-hist-recolhido') === '1'; } catch (_) { /* Mostrar o painel. */ }
                const painel = $('<section>', { id: 'vac-hist-painel', class: 'vac-hist-painel', 'aria-labelledby': 'vac-hist-titulo' }).insertBefore($(form).find('#item_container'));
                hist.painel = painel;
                const cabecalho = $('<div>', { class: 'vac-hist-cabecalho' }).appendTo(painel);
                $('<h2>', { id: 'vac-hist-titulo', class: 'vac-hist-titulo', text: 'Histórico de vacinas do munícipe' }).appendTo(cabecalho);
                const fonte = $('<div>', { class: 'vac-hist-fonte', text: 'Fonte: Carteirinha de Vacinação' }).appendTo(cabecalho);
                const acoes = $('<span>', { class: 'vac-hist-acoes' }).appendTo(fonte);
                $('<a>', { href: '#', class: 'vac-link', text: 'atualizar' }).appendTo(acoes).on('click', e => { e.preventDefault(); carregarHistorico(form); });
                const recolher = $('<a>', { href: '#', class: 'vac-link vac-hist-recolher', 'aria-controls': 'vac-hist-conteudo' }).appendTo(acoes);
                $('<div>', { class: 'vac-hist-alerta', role: 'status', hidden: true }).appendTo(painel);
                const conteudo = $('<div>', { id: 'vac-hist-conteudo' }).appendTo(painel);
                $('<div>', { class: 'vac-hist-corpo', role: 'list', 'aria-live': 'polite' }).appendTo(conteudo);
                const legenda = $('<div>', { class: 'vac-hist-legenda', 'aria-label': 'Legenda' }).appendTo(conteudo);
                [['aplicada', 'Aplicada'], ['disponivel', 'Disponível (clique para registrar)'], ['registrando', 'Registrando nesta ficha'], ['duplicada', 'Já aplicada (dose repetida)']].forEach(([classe, texto]) => {
                    const entrada = $('<span>', { class: 'vac-hist-legenda-item' }).appendTo(legenda);
                    $('<span>', { class: 'vac-hist-amostra vac-hist-' + classe }).appendTo(entrada);
                    entrada.append(document.createTextNode(texto));
                });
                function recolherPainel() {
                    conteudo.prop('hidden', hist.recolhido);
                    recolher.text(hist.recolhido ? 'mostrar' : 'recolher').attr('aria-expanded', String(!hist.recolhido));
                }
                recolher.on('click', e => {
                    e.preventDefault();
                    hist.recolhido = !hist.recolhido;
                    try { localStorage.setItem('vac-hist-recolhido', hist.recolhido ? '1' : '0'); } catch (_) { /* Seguir sem memória. */ }
                    recolherPainel();
                });
                recolherPainel();
            }
            new MutationObserver(() => agendarHistorico(form)).observe(form.querySelector('#item_container'), { childList: true, subtree: true });
            carregarHistorico(form);
        }
        async function carregarHistorico(form) {
            const hist = estados.get(form).historico;
            const rodada = ++hist.rodada;
            hist.status = 'carregando';
            renderizarHistorico(form);
            try {
                const id = form.querySelector('#esus_vacinacao_municipe_id')?.value;
                if (!id) throw new Error('Munícipe não identificado');
                const html = await $.ajax({ url: '/carteirinhas_vacinacoes/' + encodeURIComponent(id) + '/exibir_municipe', dataType: 'html', cache: false, timeout: 15000 });
                const pagina = new DOMParser().parseFromString(html, 'text/html');
                const titulo = Array.from(pagina.querySelectorAll('h4')).find(h => normalizar(h.textContent) === 'historicodevacinas');
                const tabela = Array.from(pagina.querySelectorAll('#customers-contain table')).find(t => titulo && (titulo.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING));
                if (!titulo || !tabela) throw new Error('Carteirinha ausente');
                const entradas = Array.from(tabela.querySelectorAll('tbody tr')).map(tr => {
                    const celulas = Array.from(tr.querySelectorAll('td'));
                    if (celulas.length < 7) return null;
                    const [nome, dose, lote, , , , data] = celulas.map(td => td.textContent.trim());
                    const partes = data.split('/');
                    const link = celulas[7]?.querySelector('a[href]');
                    return nome ? { nome, dose, lote, data, ordem: partes.reverse().join(''), caminho: link ? new URL(link.getAttribute('href'), location.origin).pathname : '' } : null;
                }).filter(Boolean);
                const opcoes = opcoesHistorico(form);
                const nomes = Array.from(new Set(entradas.map(e => e.nome)));
                const mapa = new Map(await Promise.all(nomes.map(async nome => [nome, await mapearNome(nome, opcoes)])));
                if (rodada !== hist.rodada || !form.isConnected) return;
                const linhas = new Map();
                entradas.forEach(entrada => {
                    const tipo = mapa.get(entrada.nome);
                    const chave = tipo || 'nome:' + normalizar(entrada.nome);
                    if (!linhas.has(chave)) linhas.set(chave, { id: tipo, nome: opcoes.find(o => o.id === tipo)?.nome || entrada.nome, entradas: [], doses: null });
                    linhas.get(chave).entradas.push(entrada);
                });
                const porData = (a, b) => b.entradas.reduce((m, e) => e.ordem > m ? e.ordem : m, '').localeCompare(a.entradas.reduce((m, e) => e.ordem > m ? e.ordem : m, ''));
                hist.linhas = [...Array.from(linhas.values()).filter(l => l.id).sort(porData), ...Array.from(linhas.values()).filter(l => !l.id).sort(porData)];
                opcoes.filter(o => o.estoque && !o.oculta && !linhas.has(o.id)).forEach(o => hist.linhas.push({ id: o.id, nome: o.nome, entradas: [], doses: null, estoque: true }));
                hist.linhas.forEach(l => l.entradas.sort((a, b) => a.ordem.localeCompare(b.ordem)));
                hist.status = 'pronto';
                renderizarHistorico(form);
                if (HISTORICO_PAINEL) await Promise.all(hist.linhas.filter(l => l.id).map(async linha => {
                    try { linha.doses = await consultarDoses(linha.id); } catch (_) { linha.erroDoses = true; }
                }));
            } catch (_) {
                if (rodada === hist.rodada) hist.status = 'erro';
            }
            if (rodada === hist.rodada && form.isConnected) {
                renderizarHistorico(form);
                const estado = estados.get(form);
                if (form.querySelector('#vac-pendencias')) mostrarPendencias(form, pendencias(form), estado.botao);
            }
        }
        function dosesNaFicha(form) {
            return itensAtivos(form).map(item => {
                const imuno = item.querySelector('select.tipo_imunobiologico');
                const dose = item.querySelector('select[id*="tipo_dose_id"]');
                return { item, id: imuno?.value, valor: dose?.value, texto: dose?.value ? dose.options[dose.selectedIndex].textContent.trim() : '' };
            }).filter(d => d.id);
        }
        function conflitosHistorico(form) {
            const hist = estados.get(form)?.historico;
            if (!hist || hist.status !== 'pronto') return [];
            const lista = [];
            dosesNaFicha(form).forEach(dose => {
                if (!dose.valor || !doseNaoRepetivel(dose.texto)) return;
                const linha = hist.linhas.find(l => l.id === dose.id);
                const entradas = linha?.entradas.filter(e => normalizarDose(e.dose) === normalizarDose(dose.texto) &&
                    !(/^\/esus\/vacinacoes\/\d+\/edit\/?$/.test(location.pathname) && e.caminho.replace(/\/$/, '') === location.pathname.replace(/\/$/, ''))) || [];
                if (entradas.length) lista.push({ linha, entrada: entradas[entradas.length - 1], dose, entradas });
            });
            return lista;
        }
        function verificarHistorico(form) {
            return conflitosHistorico(form).map(c => ({
                texto: c.linha.nome + ' ' + c.dose.texto + ' já aplicada em ' + c.entrada.data + ' (carteirinha).', alvo: c.dose.item, duplicada: true
            }));
        }
        function agendarHistorico(form) {
            const hist = estados.get(form)?.historico;
            if (!hist) return;
            clearTimeout(hist.timer);
            hist.timer = setTimeout(() => renderizarHistorico(form), 80);
        }
        function renderizarHistorico(form) {
            const hist = estados.get(form)?.historico;
            if (!hist?.painel || !form.isConnected) return;
            const corpo = hist.painel.find('.vac-hist-corpo').empty();
            const alerta = hist.painel.find('.vac-hist-alerta').empty().prop('hidden', true);
            hist.painel.attr('data-vac-hist-estado', hist.status);
            if (hist.status !== 'pronto') {
                const estado = $('<div>', { class: 'vac-hist-estado' + (hist.status === 'erro' ? ' vac-hist-erro' : ''), text: hist.status === 'erro' ? 'Não consegui carregar a carteirinha ' : 'Carregando a carteirinha…' }).appendTo(corpo);
                if (hist.status === 'erro') $('<a>', { href: '#', class: 'vac-link', text: 'tentar de novo' }).appendTo(estado).on('click', e => { e.preventDefault(); carregarHistorico(form); });
                return;
            }
            const conflitos = conflitosHistorico(form);
            conflitos.forEach(c => $('<div>', { text: c.linha.nome + ' ' + c.dose.texto + ' já aplicada em ' + c.entrada.data + ' — escolher a mesma dose bloqueia o Salvar.' }).appendTo(alerta));
            alerta.prop('hidden', !conflitos.length);
            const escolhidas = dosesNaFicha(form);
            let estoque = false;
            function cartao(destino, classe, titulo, detalhe, lote) {
                const card = $('<div>', { class: 'vac-hist-dose vac-hist-' + classe }).appendTo(destino);
                $('<div>', { class: 'vac-hist-dose-nome', text: titulo.toLocaleUpperCase('pt-BR') }).appendTo(card);
                $('<div>', { class: 'vac-hist-detalhe', text: detalhe }).appendTo(card);
                if (lote) $('<div>', { class: 'vac-hist-unidade', text: 'lote ' + lote, title: 'lote ' + lote }).appendTo(card);
                return card;
            }
            hist.linhas.forEach(linha => {
                if (linha.estoque && !estoque) {
                    $('<div>', { class: 'vac-hist-subtitulo', text: 'Com estoque na unidade', role: 'heading', 'aria-level': '3' }).appendTo(corpo);
                    estoque = true;
                }
                const el = $('<div>', { class: 'vac-hist-linha', role: 'listitem', 'data-vac-imuno': linha.id || '', 'data-vac-estoque': linha.estoque ? '1' : '0' }).appendTo(corpo);
                const nome = $('<div>', { class: 'vac-hist-vacina', text: linha.nome }).appendTo(el);
                const doses = $('<div>', { class: 'vac-hist-doses' }).appendTo(el);
                linha.entradas.forEach(entrada => {
                    const card = cartao(doses, 'aplicada', entrada.dose, '💉 ' + entrada.data, entrada.lote);
                    if (conflitos.some(c => c.linha === linha && c.entradas.includes(entrada))) card.addClass('vac-hist-duplicada');
                });
                if (!linha.id) {
                    $('<small>', { class: 'vac-nota', text: 'sem correspondência na lista de imunobiológicos' }).appendTo(nome);
                    return;
                }
                if (!linha.doses) {
                    $('<small>', { class: 'vac-nota', text: linha.erroDoses ? 'Não consegui consultar as doses; tente atualizar.' : 'Carregando as doses…' }).appendTo(doses);
                    return;
                }
                const atuais = escolhidas.filter(d => d.id === linha.id);
                const ofertas = linha.doses.length ? linha.doses : [{ valor: '', texto: 'Registrar' }];
                ofertas.forEach(dose => {
                    const registrando = atuais.some(d => dose.valor ? normalizarDose(d.texto) === normalizarDose(dose.texto) : !d.valor);
                    if (!registrando && doseNaoRepetivel(dose.texto) && linha.entradas.some(e => normalizarDose(e.dose) === normalizarDose(dose.texto))) return;
                    const card = cartao(doses, registrando ? 'registrando' : 'disponivel', dose.texto, registrando ? 'registrando agora' : '+ registrar');
                    card.attr('data-vac-dose', dose.valor);
                    if (!registrando) card.attr({ role: 'button', tabindex: '0', 'aria-label': linha.nome + ' — ' + dose.texto + ': registrar' })
                        .on('click', () => lancarDose(form, linha.id, dose.valor)).on('keydown', e => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lancarDose(form, linha.id, dose.valor); }
                        });
                });
                atuais.filter(d => d.valor && !linha.doses.some(o => normalizarDose(o.texto) === normalizarDose(d.texto)))
                    .forEach(d => cartao(doses, 'registrando', d.texto, 'registrando agora'));
            });
        }
        function esperarCampo(buscar, limite) {
            return new Promise((resolve, reject) => {
                const inicio = Date.now();
                function tentar() {
                    const campo = buscar();
                    if (campo) resolve(campo);
                    else if (Date.now() - inicio >= limite) reject(new Error('Campo não carregado'));
                    else setTimeout(tentar, 100);
                }
                tentar();
            });
        }
        async function lancarDose(form, id, valor) {
            if (lancandoDose) return;
            lancandoDose = true;
            let item;
            try {
                item = itensAtivos(form).find(el => !el.querySelector('select.tipo_imunobiologico')?.value);
                if (!item) {
                    const antes = itensAtivos(form);
                    form.querySelector('#item_container a.add_fields')?.click();
                    item = await esperarCampo(() => itensAtivos(form).find(el => !antes.includes(el)), 5000);
                }
                prepararItem(item);
                $(item).find('.vac-hist-manual').remove();
                const busca = item.querySelector('.vac-busca');
                if (busca) $(busca).val('').trigger('input');
                const imuno = item.querySelector('select.tipo_imunobiologico');
                if (!imuno || !Array.from(imuno.options).some(o => o.value === id)) throw new Error('Imunobiológico ausente');
                selecionar(imuno, id);
                if (valor) {
                    const rotina = await esperarCampo(() => item.isConnected && item.querySelector('select.tipo_estrategia option[data-codigo="1"]'), 8000);
                    selecionar(rotina.parentElement, rotina.value);
                    const dose = await esperarCampo(() => {
                        const campo = item.isConnected && item.querySelector('select[id*="tipo_dose_id"]');
                        return campo && Array.from(campo.options).some(o => o.value === valor) ? campo : null;
                    }, 8000);
                    selecionar(dose, valor);
                }
            } catch (_) {
                const destino = item || form.querySelector('#item_container');
                $(destino).find('.vac-hist-manual').remove();
                $('<small>', { class: 'vac-nota vac-hist-manual', text: 'Complete a estratégia/dose manualmente' }).appendTo(destino);
            } finally {
                if (item?.isConnected) destacar(item);
                lancandoDose = false;
                agendarHistorico(form);
            }
        }
        function pendencias(form) {
            const lista = [];
            if (MATERNAL_SEM_PADRAO && form.querySelector(MATERNAL) && !form.querySelector(MATERNAL + ':checked')) {
                lista.push({ texto: 'Maternal: escolha uma opção.', alvo: form.querySelector('.condicoes-agrupamento-maternal') });
            }
            if (CPF_OBRIGATORIO && estados.get(form).cpf === 'falta') {
                lista.push({ texto: 'Munícipe sem CPF — cadastre o CPF antes de salvar.', alvo: form.querySelector('.vac-cpf') });
            }
            if (DOSE_DUPLICADA_NA_FICHA) {
                const vistos = new Map();
                itensAtivos(form).forEach(item => {
                    const imuno = item.querySelector('select.tipo_imunobiologico');
                    const dose = item.querySelector('select[id*="tipo_dose_id"]');
                    if (!imuno || !dose || !imuno.value || !dose.value) return;
                    const chave = imuno.value + '|' + dose.value;
                    if (vistos.has(chave)) {
                        const vacina = imuno.options[imuno.selectedIndex];
                        lista.push({ texto: 'Dose duplicada na ficha: ' + (vacina.dataset.vacTexto || vacina.textContent) + ' — ' + dose.options[dose.selectedIndex].textContent + '.', alvo: item, duplicada: true });
                    } else vistos.set(chave, item);
                });
            }
            if (DOSE_DUPLICADA_HISTORICO) lista.push(...verificarHistorico(form));
            return lista;
        }
        function destacar(alvo) {
            if (!alvo) return;
            alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alvo.classList.add('vac-destaque');
            setTimeout(() => alvo.classList.remove('vac-destaque'), 2200);
        }
        function reabilitar(botao) {
            if (!botao) return;
            const el = $(botao);
            if ($.rails && $.rails.enableElement) $.rails.enableElement(el);
            const texto = el.data('ujs:enable-with');
            if (texto != null) {
                if (botao.tagName === 'INPUT') el.val(texto);
                else el.html(texto);
            } else if (botao.dataset.vacTextoBotao && botao.disabled) {
                if (botao.tagName === 'INPUT') botao.value = botao.dataset.vacTextoBotao;
                else botao.textContent = botao.dataset.vacTextoBotao;
            }
            botao.disabled = false;
        }
        function mostrarPendencias(form, lista, botao) {
            $(form).find('#vac-pendencias').remove();
            if (!lista.length) return;
            const banner = $('<div>', { id: 'vac-pendencias', class: 'vac-aviso vac-erro', role: 'alert', tabindex: '-1' }).prependTo(form);
            $('<strong>', { text: 'Confira as pendências antes de salvar:' }).appendTo(banner);
            lista.forEach(p => $('<a>', { href: '#', class: 'vac-link vac-pendencia', text: p.texto }).appendTo(banner).on('click', e => { e.preventDefault(); destacar(p.alvo); }));
            if (lista.some(p => p.duplicada)) {
                $('<button>', { type: 'button', text: 'Salvar mesmo assim' }).appendTo(banner).on('click', () => {
                    if (!confirm('Há vacina e dose duplicadas nesta ficha. Deseja salvar mesmo assim?')) return;
                    const estado = estados.get(form);
                    const original = botao && botao.isConnected ? botao : form.querySelector('button[type="submit"], input[type="submit"]');
                    if (!original) return;
                    estado.ignorarDuplicadas = true;
                    reabilitar(original);
                    try { original.click(); } finally { estado.ignorarDuplicadas = false; }
                });
            }
        }
        function proteger(e, form, botao) {
            prepararForm(form);
            const estado = estados.get(form);
            if (botao) {
                estado.botao = botao;
                if (!botao.dataset.vacTextoBotao) botao.dataset.vacTextoBotao = botao.tagName === 'INPUT' ? botao.value : botao.textContent.trim();
            }
            const lista = pendencias(form).filter(p => !(estado.ignorarDuplicadas && p.duplicada));
            if (lista.length) {
                e.preventDefault();
                e.stopImmediatePropagation();
                estado.ignorarDuplicadas = false;
                const original = botao || estado.botao;
                reabilitar(original);
                setTimeout(() => reabilitar(original), 0);
                mostrarPendencias(form, lista, original);
                const banner = form.querySelector('#vac-pendencias');
                banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
                banner.focus({ preventScroll: true });
                return;
            }
            $(form).find('#vac-pendencias').remove();
            // Clique e submit passam pelo mesmo controle; aprender somente no submit liberado.
            if (e.type === 'submit') aprender(form);
        }
        document.addEventListener('click', e => {
            const botao = e.target.closest('button, input[type="submit"], input[type="image"]');
            if (botao && botao.form && botao.form.matches(FORMULARIOS) && /^(submit|image)$/.test(botao.type)) proteger(e, botao.form, botao);
        }, true);
        document.addEventListener('submit', e => {
            if (e.target.matches(FORMULARIOS)) proteger(e, e.target, e.submitter || estados.get(e.target)?.botao);
        }, true);
        $(document).on('change.vac', '#item_container select.tipo_estrategia', function () {
            if (!ROTINA_FAIXA_ETARIA) return;
            const opcao = this.options[this.selectedIndex];
            const grupo = this.closest('.nested-fields').querySelector('select.esus-vacinacao-grupo-atendimento');
            if (opcao && opcao.dataset.codigo === '1' && grupo && !grupo.value) selecionar(grupo, '117');
        }).on('change.vac input.vac', '#item_container .esus-vacinacao-lote-select, #item_container .esus-vacinacao-lote-sem-estoque-input, #item_container .esus-vacinacao-lote-manual-registro-anterior-input', function () {
            const item = this.closest('.nested-fields');
            setTimeout(() => lembrarFabricante(item), 0);
        }).on('change.vac', MATERNAL, function () {
            const campo = $(this).closest('.condicoes-agrupamento-maternal');
            campo.removeClass('vac-maternal').find('.vac-escolha-maternal').remove();
        }).on('change.vac', FABRICANTE, function () {
            $(this).siblings('.vac-fabricante-lembrado').remove();
        }).on('change.vac', '#item_container select.tipo_imunobiologico, #item_container select[id*="tipo_dose_id"]', function () {
            agendarHistorico(this.closest('form'));
        }).on('cocoon:after-insert.vac cocoon:after-remove.vac', '#item_container', function () {
            agendar();
            agendarHistorico(this.closest('form'));
        });

        function processar() {
            processarModal();
            document.querySelectorAll(FORMULARIOS).forEach(form => {
                prepararForm(form);
                form.querySelectorAll('#item_container .nested-fields').forEach(prepararItem);
                prepararHistorico(form);
            });
        }
        new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
        processar();
    }
})();
