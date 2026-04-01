// ==UserScript==
// @name         Saúde Simples - Relatórios e Cores de área
// @namespace    http://tampermonkey.net/
// @version      8.5
// @downloadURL  https://github.com/otowm/om30-saudesimples/blob/main/Sa%C3%BAde%20Simples%20-%20Relat%C3%B3rios%20e%20Cores%20de%20%C3%A1rea.user.js
// @updateURL    https://github.com/otowm/om30-saudesimples/blob/main/Sa%C3%BAde%20Simples%20-%20Relat%C3%B3rios%20e%20Cores%20de%20%C3%A1rea.user.js
// @author       otowm
// @description  Botões rápidos configuráveis, tabela dividida manhã/tarde, prontuários coloridos, seleção automática de especialidade, coloração de nomes de médicos
// @match        https://guaruja.saudesimples.net/atendimentos_medicos_administrativo*
// @match        https://guaruja.saudesimples.net/agendamentos*
// @match        https://guarujahomolog.saudesimples.net/atendimentos_medicos_administrativo*
// @match        https://guarujahomolog.saudesimples.net/agendamentos*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const colors = {
        "05": "#FF99CC", //
        "04": "#66B2FF", //
        "12": "#FFB84D", //
        "13": "#80E680", //
    };
    const areas = {
        "Área Azul": "#3b82f6",
        "Área Rosa": "#ec4899",
        "Área Laranja": "#f97316",
        "Área Verde": "#22c55e",
        "NASF": "#808080"
    };
    const configKey = "guaruja_saude_funcionarios";

    function loadConfig() {
        const stored = localStorage.getItem(configKey);
        if (stored) {
            return JSON.parse(stored);
        } else {
            // Fallback para os hardcoded
            return [
                { area: "Área Azul", nome: "NIER OLIVEROS BEREAU" },
                { area: "Área Azul", nome: "PRISCILA TOLEDO DE AZEVEDO SILVA" },
                { area: "Área Rosa", nome: "TIARA RUANI DA CRUZ" },
                { area: "Área Rosa", nome: "LARISSA RAIANE ALMEIDA DOS SANTOS" },
                { area: "Área Laranja", nome: "ANNABEL CABALLERO MACHADO" },
                { area: "Área Laranja", nome: "LARISSA KRISTAL CASANOVA MONTEIRO" },
                { area: "Área Verde", nome: "LOUISE MARCELA XAVIER DE ARAUJO" },
                { area: "Área Verde", nome: "CAMILA ANGELO BEZERRA" },
            ];
        }
    }

    function saveConfig(config) {
        localStorage.setItem(configKey, JSON.stringify(config));
    }

    function getFuncionarios() {
        const select = document.querySelector("#filtro_atendimento_medico_profissional_id");
        if (!select) return [];
        return Array.from(select.options).slice(1).map(o => o.textContent.trim());
    }

    //------------------------------------------------------------
    // COLORAÇÃO DE NOMES DE MÉDICOS
    //------------------------------------------------------------
    function processMedicos() {
        // Itera por todos os portlets
        document.querySelectorAll(".portlet-header.portlet-header-clickable.ui-widget-header").forEach(header => {
            const content = header.nextElementSibling;
            if (content && content.style.display === "none") {
                content.style.display = "block";
            }

            if (!content) return;

            // Seletores fixos do prontuário e nome
            const prontuarioP = content.querySelector("div > div:nth-child(5) > p");
            const nameP = content.querySelector("div > div:nth-child(7) > p");

            if (!prontuarioP || !nameP) return;

            const prefix = prontuarioP.textContent.trim().slice(0,2);
            const color = colors[prefix];

            if (color) {
                // Transformar o nome em um "badge" sem quebrar o layout
                const text = nameP.textContent.trim();
                nameP.textContent = ''; // limpar o p
                const badge = document.createElement('span');
                badge.textContent = text;
                badge.style.backgroundColor = color;
                badge.style.color = "#000";
                badge.style.padding = "4px 6px";
                badge.style.borderRadius = "6px";
                badge.style.display = "inline-block";
                nameP.appendChild(badge);
            }
        });
    }

    function colorirSelectProfissionais() {
        const config = loadConfig();

        function aplicarCores() {
            const select = document.querySelector("#agendamento_profissional_id");
            if (!select) return;

            Array.from(select.options).forEach(option => {
                if (!option.value) return; // pular option vazia
                const nome = option.textContent.trim();
                const profissional = config.find(c => c.nome === nome);
                if (profissional) {
                    const cor = areas[profissional.area];
                    if (cor) {
                        option.style.backgroundColor = cor;
                        option.style.color = "#fff"; // texto branco para contraste
                        option.style.fontWeight = "bold";
                    }
                }
            });

            // Manter a cor na opção selecionada
            function atualizarCorSelect() {
                const selectedOption = select.options[select.selectedIndex];
                if (selectedOption && selectedOption.value) {
                    const nome = selectedOption.textContent.trim();
                    const profissional = config.find(c => c.nome === nome);
                    if (profissional) {
                        const cor = areas[profissional.area];
                        if (cor) {
                            select.style.backgroundColor = cor;
                            select.style.color = "#fff";
                        } else {
                            select.style.backgroundColor = "";
                            select.style.color = "";
                        }
                    } else {
                        select.style.backgroundColor = "";
                        select.style.color = "";
                    }
                } else {
                    select.style.backgroundColor = "";
                    select.style.color = "";
                }
            }

            atualizarCorSelect(); // inicial
            select.addEventListener('change', atualizarCorSelect);
        }

        // Aplicar inicialmente
        aplicarCores();

        // Re-aplicar periodicamente para lidar com conflitos de outros scripts
        setInterval(aplicarCores, 2000); // a cada 2 segundos
    }

    //------------------------------------------------------------
    // FUNÇÕES AUXILIARES
    //------------------------------------------------------------
    function formatarDataHoje() {
        const hoje = new Date();
        const dd = String(hoje.getDate()).padStart(2, '0');
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        const yyyy = hoje.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }

    async function selecionarProfissional(nome) {
        const campoData = document.querySelector("#filtro_atendimento_medico_data");
        const campoProf = document.querySelector("#filtro_atendimento_medico_profissional_id");
        const botaoConsultar = document.querySelector("#new_filtro_atendimento_medico > li > div > button:nth-child(3)");

        if (!campoProf || !botaoConsultar) return;

        if (!campoData.value) {
            campoData.value = formatarDataHoje();
            campoData.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const opcoes = Array.from(campoProf.options);
        const alvo = opcoes.find(o => o.textContent.trim().toUpperCase() === nome.toUpperCase());
        if (!alvo) {
            alert(`Profissional "${nome}" não encontrado.`);
            return;
        }

        campoProf.value = alvo.value;
        campoProf.dispatchEvent(new Event('change', { bubbles: true }));

        // Espera a especialidade aparecer
        let tentativas = 0;
        const maxTentativas = 50;
        const esperar = setInterval(() => {
            tentativas++;
            const campoEsp = document.querySelector("#filtro_atendimento_medico_especialidade_id");
            if (campoEsp) {
                const opcoesEsp = Array.from(campoEsp.options).filter(o => o.value && o.value !== "");
                if (opcoesEsp.length === 1) {
                    campoEsp.value = opcoesEsp[0].value;
                    campoEsp.dispatchEvent(new Event('change', { bubbles: true }));
                    clearInterval(esperar);
                    setTimeout(() => botaoConsultar.click(), 300);
                }
            }
            if (tentativas > maxTentativas) clearInterval(esperar);
        }, 100);
    }

    //------------------------------------------------------------
    // PAINEL DE BOTÕES
    //------------------------------------------------------------
    function criarPainel() {
        const config = loadConfig();
        const painel = document.createElement("div");
        painel.id = "atalhos-saude";
        painel.style.position = "fixed";
        painel.style.bottom = "10px";
        painel.style.left = "50%";
        painel.style.transform = "translateX(-50%)";
        painel.style.display = "flex";
        painel.style.flexDirection = "row";
        painel.style.flexWrap = "wrap";
        painel.style.justifyContent = "center";
        painel.style.alignItems = "center";
        painel.style.gap = "10px";
        painel.style.zIndex = "9999";
        painel.style.padding = "10px";
        painel.style.background = "rgba(255, 255, 255, 0.95)";
        painel.style.border = "2px solid #ddd";
        painel.style.borderRadius = "12px";
        painel.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
        painel.style.backdropFilter = "blur(4px)";

        // Botão Configurar (somente emoji, menor)
        const btnConfig = document.createElement("button");
        btnConfig.textContent = "⚙️";
        btnConfig.style.background = "#666";
        btnConfig.style.color = "white";
        btnConfig.style.border = "none";
        btnConfig.style.borderRadius = "50%";
        btnConfig.style.outline = "none";
        btnConfig.style.width = "34px";
        btnConfig.style.height = "34px";
        btnConfig.style.display = "flex";
        btnConfig.style.alignItems = "center";
        btnConfig.style.justifyContent = "center";
        btnConfig.style.padding = "0";
        btnConfig.style.cursor = "pointer";
        btnConfig.style.fontWeight = "600";
        btnConfig.style.fontSize = "16px";
        btnConfig.style.transition = "transform 0.2s ease";
        btnConfig.onmouseenter = () => btnConfig.style.transform = "scale(1.05)";
        btnConfig.onmouseleave = () => btnConfig.style.transform = "scale(1)";
        btnConfig.onfocus = () => btnConfig.style.outline = "none";
        btnConfig.onclick = () => abrirPainelConfig();
        painel.appendChild(btnConfig);

        // Botão Toggle para retrair/expandir
        const btnToggle = document.createElement("button");
        btnToggle.textContent = "▼";
        btnToggle.style.background = "#666";
        btnToggle.style.color = "white";
        btnToggle.style.border = "none";
        btnToggle.style.borderRadius = "50%";
        btnToggle.style.outline = "none";
        btnToggle.style.width = "34px";
        btnToggle.style.height = "34px";
        btnToggle.style.display = "flex";
        btnToggle.style.alignItems = "center";
        btnToggle.style.justifyContent = "center";
        btnToggle.style.padding = "0";
        btnToggle.style.cursor = "pointer";
        btnToggle.style.fontWeight = "600";
        btnToggle.style.fontSize = "16px";
        btnToggle.style.transition = "transform 0.2s ease";
        btnToggle.onmouseenter = () => btnToggle.style.transform = "scale(1.05)";
        btnToggle.onmouseleave = () => btnToggle.style.transform = "scale(1)";
        btnToggle.onfocus = () => btnToggle.style.outline = "none";
        btnToggle.onclick = () => {
            const containers = painel.querySelectorAll('[data-area]');
            const isCollapsed = btnToggle.textContent === "▶";
            if (isCollapsed) {
                containers.forEach(c => {
                    c.style.display = "flex";
                    setTimeout(() => c.style.transform = "translateY(0)", 10);
                });
                btnToggle.textContent = "▼";
            } else {
                containers.forEach(c => {
                    c.style.transform = "translateY(200px)";
                    setTimeout(() => c.style.display = "none", 300);
                });
                btnToggle.textContent = "▶";
            }
        };
        painel.appendChild(btnToggle);

        const gruposArea = {};
        config.forEach(b => {
            if (!gruposArea[b.area]) {
                const containerArea = document.createElement("div");
                containerArea.style.display = "flex";
                containerArea.style.flexDirection = "column";
                containerArea.style.alignItems = "center";
                containerArea.style.margin = "0 10px";
                containerArea.dataset.area = b.area;
                containerArea.style.transition = "transform 0.3s ease";
                containerArea.style.transform = "translateY(0)";

                const label = document.createElement("div");
                label.textContent = b.area;
                label.style.fontWeight = "700";
                label.style.fontSize = "13px";
                label.style.textAlign = "center";
                label.style.color = areas[b.area];
                label.style.marginBottom = "4px";

                containerArea.appendChild(label);
                gruposArea[b.area] = containerArea;
            }

            const btn = document.createElement("button");
            btn.textContent = b.nome.split(" ")[0];
            btn.title = b.nome;
            btn.style.background = areas[b.area];
            btn.style.color = "white";
            btn.style.border = "none";
            btn.style.borderRadius = "8px";
            btn.style.outline = "none";
            btn.style.padding = "8px 10px";
            btn.style.cursor = "pointer";
            btn.style.fontWeight = "600";
            btn.style.fontSize = "12px";
            btn.style.transition = "transform 0.2s ease";
            btn.onmouseenter = () => btn.style.transform = "scale(1.05)";
            btn.onmouseleave = () => btn.style.transform = "scale(1)";
            btn.onfocus = () => btn.style.outline = "none";
            btn.onclick = () => selecionarProfissional(b.nome);
            gruposArea[b.area].appendChild(btn);
        });

        Object.values(gruposArea).forEach(container => painel.appendChild(container));

        document.body.appendChild(painel);
    }

    //------------------------------------------------------------
    // PAINEL DE CONFIGURAÇÃO
    //------------------------------------------------------------
    function abrirPainelConfig() {
        let painelConfig = document.getElementById("painel-config-saude");
        if (painelConfig) {
            painelConfig.remove();
            return;
        }
        criarPainelConfig();
    }

    function criarPainelConfig() {
        const config = loadConfig();
        const todosFuncionarios = getFuncionarios();
        const painelConfig = document.createElement("div");
        painelConfig.id = "painel-config-saude";
        painelConfig.style.position = "fixed";
        painelConfig.style.top = "10px";
        painelConfig.style.left = "10px";
        painelConfig.style.width = "400px";
        painelConfig.style.maxHeight = "80vh";
        painelConfig.style.overflowY = "auto";
        painelConfig.style.zIndex = "10000";
        painelConfig.style.padding = "20px";
        painelConfig.style.background = "white";
        painelConfig.style.border = "2px solid #ddd";
        painelConfig.style.borderRadius = "12px";
        painelConfig.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";

        const titulo = document.createElement("h3");
        titulo.textContent = "Configurar Funcionários";
        titulo.style.marginTop = "0";
        painelConfig.appendChild(titulo);

        // Seções por área
        Object.keys(areas).forEach(area => {
            const secao = document.createElement("div");
            secao.style.marginBottom = "20px";
            const h4 = document.createElement("h4");
            h4.textContent = area;
            h4.style.color = areas[area];
            secao.appendChild(h4);

            const lista = document.createElement("ul");
            lista.style.listStyle = "none";
            lista.style.padding = "0";
            config.filter(c => c.area === area).forEach(c => {
                const li = document.createElement("li");
                li.style.display = "flex";
                li.style.justifyContent = "space-between";
                li.style.alignItems = "center";
                li.style.marginBottom = "5px";
                li.textContent = c.nome;
                const btnRemover = document.createElement("button");
                btnRemover.textContent = "Remover";
                btnRemover.style.background = "#f44336";
                btnRemover.style.color = "white";
                btnRemover.style.border = "none";
                btnRemover.style.padding = "2px 5px";
                btnRemover.style.borderRadius = "4px";
                btnRemover.style.cursor = "pointer";
                btnRemover.onclick = () => {
                    const novaConfig = config.filter(item => !(item.area === area && item.nome === c.nome));
                    saveConfig(novaConfig);
                    painelConfig.remove();
                    document.getElementById("atalhos-saude").remove();
                    criarPainel();
                };
                li.appendChild(btnRemover);
                lista.appendChild(li);
            });
            secao.appendChild(lista);
            painelConfig.appendChild(secao);
        });

        // Adicionar novo
        const adicionarDiv = document.createElement("div");
        adicionarDiv.style.marginTop = "20px";
        adicionarDiv.style.borderTop = "1px solid #ddd";
        adicionarDiv.style.paddingTop = "10px";

        const selectFunc = document.createElement("select");
        selectFunc.style.width = "100%";
        selectFunc.style.marginBottom = "10px";
        const optionEmpty = document.createElement("option");
        optionEmpty.value = "";
        optionEmpty.textContent = "Selecione um funcionário";
        selectFunc.appendChild(optionEmpty);
        todosFuncionarios.filter(n => !config.some(c => c.nome === n)).forEach(nome => {
            const option = document.createElement("option");
            option.value = nome;
            option.textContent = nome;
            selectFunc.appendChild(option);
        });

        const selectArea = document.createElement("select");
        selectArea.style.width = "100%";
        selectArea.style.marginBottom = "10px";
        Object.keys(areas).forEach(area => {
            const option = document.createElement("option");
            option.value = area;
            option.textContent = area;
            selectArea.appendChild(option);
        });

        const btnAdicionar = document.createElement("button");
        btnAdicionar.textContent = "Adicionar";
        btnAdicionar.style.background = "#4CAF50";
        btnAdicionar.style.color = "white";
        btnAdicionar.style.border = "none";
        btnAdicionar.style.padding = "8px 12px";
        btnAdicionar.style.borderRadius = "4px";
        btnAdicionar.style.cursor = "pointer";
        btnAdicionar.onclick = () => {
            const nome = selectFunc.value;
            const area = selectArea.value;
            if (nome && area) {
                config.push({ area, nome });
                saveConfig(config);
                painelConfig.remove();
                document.getElementById("atalhos-saude").remove();
                criarPainel();
            }
        };

        adicionarDiv.appendChild(document.createTextNode("Adicionar Funcionário:"));
        adicionarDiv.appendChild(selectFunc);
        adicionarDiv.appendChild(document.createTextNode("Área:"));
        adicionarDiv.appendChild(selectArea);
        adicionarDiv.appendChild(btnAdicionar);

        const btnFechar = document.createElement("button");
        btnFechar.textContent = "Fechar";
        btnFechar.style.background = "#666";
        btnFechar.style.color = "white";
        btnFechar.style.border = "none";
        btnFechar.style.padding = "8px 12px";
        btnFechar.style.borderRadius = "4px";
        btnFechar.style.cursor = "pointer";
        btnFechar.style.marginTop = "10px";
        btnFechar.onclick = () => painelConfig.remove();

        adicionarDiv.appendChild(btnFechar);

        painelConfig.appendChild(adicionarDiv);

        document.body.appendChild(painelConfig);
    }

    //------------------------------------------------------------
    // DIVISÃO DA TABELA E COLORAÇÃO
    //------------------------------------------------------------
    function atualizarTabela() {
        const tabela = document.querySelector(".hastable > table");
        if (!tabela) return;
        const tbody = tabela.querySelector("tbody");
        if (!tbody) return;
        if (!window._observerTabela) return;

        // Pausa observer para evitar loop infinito
        window._observerTabela.disconnect();

        const linhasOriginais = Array.from(tbody.querySelectorAll("tr")).filter(tr => !tr.querySelector('[data-secao="dividido"]'));
        if (linhasOriginais.length === 0) return;

        const nCols = tabela.querySelectorAll("thead th").length;
        const linhasManha = [];
        const linhasTarde = [];

        linhasOriginais.forEach(tr => {
            const horaTexto = tr.querySelector("td:nth-child(2)")?.textContent.trim() || "00:00";
            const m = horaTexto.match(/(\d{1,2}):(\d{2})/);
            if (!m) { linhasTarde.push(tr); return; }
            const hora = parseInt(m[1], 10);
            if (hora < 12) linhasManha.push(tr);
            else linhasTarde.push(tr);
        });

        tbody.innerHTML = "";

        function criarSecao(titulo, lista) {
            const trTitulo = document.createElement("tr");
            const th = document.createElement("th");
            th.setAttribute("colspan", nCols);
            th.dataset.secao = "dividido";
            th.style.background = "#eef2ff";
            th.style.fontWeight = "700";
            th.style.textAlign = "left";
            th.textContent = titulo;
            trTitulo.appendChild(th);
            tbody.appendChild(trTitulo);

            lista.forEach(l => tbody.appendChild(l.cloneNode(true)));

            const trTotal = document.createElement("tr");
            const tdTotal = document.createElement("td");
            tdTotal.setAttribute("colspan", nCols);
            tdTotal.style.textAlign = "right";
            tdTotal.style.fontWeight = "700";
            tdTotal.style.background = "#f8fafc";
            tdTotal.textContent = `Total: ${lista.length} paciente${lista.length !== 1 ? "s" : ""}`;
            trTotal.appendChild(tdTotal);
            tbody.appendChild(trTotal);
        }

        criarSecao("Manhã", linhasManha);
        criarSecao("Tarde", linhasTarde);

        // Colorir prontuários
        const linhasParaColorir = Array.from(tbody.querySelectorAll("tr")).filter(tr => !tr.querySelector('[data-secao="dividido"]'));
        linhasParaColorir.forEach(tr => {
            const tdPront = tr.querySelector("td:nth-child(3)");
            if (!tdPront) return;
            const texto = tdPront.textContent.trim();
            let cor = "";
            if (texto.startsWith("04")) cor = "#3b82f6";     // Azul
            else if (texto.startsWith("05")) cor = "#ec4899"; // Rosa
            else if (texto.startsWith("12")) cor = "#f97316"; // Laranja
            else if (texto.startsWith("13")) cor = "#22c55e"; // Verde
            tdPront.style.color = cor;
            tdPront.style.fontWeight = cor ? "700" : "400";
        });

        // Reconecta o observer
        window._observerTabela.observe(tbody, { childList: true, subtree: true });
    }

    function setupObserver() {
        const tbody = document.querySelector(".hastable > table tbody");
        if (!tbody) return;
        window._observerTabela = new MutationObserver(() => setTimeout(atualizarTabela, 100));
        window._observerTabela.observe(tbody, { childList: true, subtree: true });
    }

    //------------------------------------------------------------
    // INICIALIZAÇÃO
    //------------------------------------------------------------
    function init() {
        if (window.location.href.includes('atendimentos_medicos_administrativo')) {
            criarPainel();
            setupObserver();
            setTimeout(atualizarTabela, 1000);
        }

        // Colorir nomes de médicos na página de agendamentos
        if (window.location.href.includes('agendamentos')) {
            const interval = setInterval(processMedicos, 500);
            setTimeout(() => clearInterval(interval), 10000);
            colorirSelectProfissionais();
        }
    }

    window.addEventListener("load", () => setTimeout(init, 1500));
})();
