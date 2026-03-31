// ==UserScript==
// @name         Saúde Simples - Automação CNES
// @namespace    http://tampermonkey.net/
// @version      1.0
// @author       otowm
// @updateURL    https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Interno/Sa%C3%BAde%20Simples%20-%20Automa%C3%A7%C3%A3o%20CNES.user.js
// @downloadURL  https://github.com/otowm/om30-saudesimples/raw/refs/heads/main/Interno/Sa%C3%BAde%20Simples%20-%20Automa%C3%A7%C3%A3o%20CNES.user.js
// @description  Busca automática CNES com popup de CPF, extração aprimorada e preenchimento de campos
// @match        *://guaruja.saudesimples.net/profissionais/new*
// @match        *://cnes.datasus.gov.br/pages/profissionais/consulta.jsp*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// ==/UserScript==

(function() {
    'use strict';

    const log = (msg, color = 'gray') => {
        console.log(`%c[CNES-Automation] ${msg}`, `color: ${color}; font-weight: bold;`);
    };

    // =========================================================================
    // FUNÇÃO DE ATIVAÇÃO E BUSCA DE TOKENINPUT
    // =========================================================================
    async function ativarEPreencher(inputElement, valor) {
        const input = inputElement;
        if (!input || !valor) {
            log(`❌ Campo não encontrado ou valor vazio: ${input ? input.id || input.name || 'elemento' : 'null'}`, "red");
            return;
        }

        log(`🔍 Ativando TokenInput: ${input.id || input.name || 'elemento'}`, "blue");

        // 1. Localiza o container
        const container = input.closest('.token-input-list');
        if (container) {
            log(`✓ Container TokenInput encontrado`, "gray");
            // Limpa tokens existentes
            container.querySelectorAll('.token-input-delete-token').forEach(x => x.click());

            // Cliques para "abrir" o campo
            container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(r => setTimeout(r, 150));
        } else {
            log(`⚠️ Container TokenInput não encontrado. Tentando ativar diretamente no input`, "orange");
        }

        // 2. Prepara o input
        input.style.display = 'inline-block';
        input.focus();
        input.value = "";

        log(`📝 Digitando: ${valor}`, "gray");

        // 3. Digita caractere por caractere
        for (let char of valor) {
            input.value += char;
            input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
            input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
            await new Promise(r => setTimeout(r, 50));
        }

        // 4. Aguarda AJAX completar
        await new Promise(r => setTimeout(r, 800));

        log(`⏳ Procurando opção para: ${valor}`, "orange");

        // 5. Procura e clica na sugestão
        let tentativas = 0;
        const maxTentativas = 30;
        let sucesso = false;
        const valorLower = valor.toLowerCase().trim();

        while (tentativas < maxTentativas && !sucesso) {
            // Procura por diferentes tipos de dropdown
            const dropdowns = document.querySelectorAll(
                'ul.token-input-list-ul, ' +
                'div.token-input-dropdown, ' +
                '[class*="token-input-dropdown"], ' +
                'ul[class*="dropdown"], ' +
                'div[class*="autocomplete"]'
            );

            log(`Tentativa ${tentativas + 1}: Procurando dropdowns. Encontrados: ${dropdowns.length}`, "gray");

            let sugestao = null;

            // Procura dentro de cada dropdown
            for (let d of dropdowns) {
                const isVisible = window.getComputedStyle(d).display !== 'none' && d.offsetParent !== null;

                if (!isVisible) continue;

                // Tenta encontrar itens (li, div, ou qualquer elemento com texto)
                const items = d.querySelectorAll('li, div[class*="item"], div[role="option"], .token-input-list-item');

                for (let item of items) {
                    const texto = item.innerText.toLowerCase().trim();

                    // Filtra itens vazios ou de busca
                    if (!texto || texto === "searching..." || texto === "buscando..." || texto.length === 0) {
                        continue;
                    }

                    // Busca flexível:
                    // 1. Match exato
                    // 2. Contém o valor
                    // 3. Valor contém números (CBO) e texto contém os números
                    let match = texto === valorLower ||
                               texto.includes(valorLower) ||
                               valorLower.replace(/\D/g, '').length > 0 && texto.includes(valorLower.replace(/\D/g, ''));

                    if (match) {
                        sugestao = item;
                        log(`✓ Match encontrado: "${texto}" (busca: "${valorLower}")`, "green");
                        break;
                    }
                }

                if (sugestao) break;
            }

            if (sugestao) {
                log(`✓ Opção encontrada: "${sugestao.innerText.trim()}"`, "green");

                // Simula interação completa com múltiplas tentativas
                sugestao.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                await new Promise(r => setTimeout(r, 50));
                sugestao.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                await new Promise(r => setTimeout(r, 50));
                sugestao.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                await new Promise(r => setTimeout(r, 50));
                sugestao.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                await new Promise(r => setTimeout(r, 50));
                sugestao.click();

                // Tenta confirmar com Enter também
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));

                log(`✅ Item selecionado com sucesso!`, "green");
                await new Promise(r => setTimeout(r, 500));
                sucesso = true;
            } else {
                if (dropdowns.length === 0) {
                    log(`⚠️ Nenhum dropdown encontrado na tentativa ${tentativas + 1}`, "orange");
                }
                await new Promise(r => setTimeout(r, 300));
                tentativas++;

                if (tentativas === 10 || tentativas === 20) {
                    log(`⏳ Ainda aguardando... (${tentativas}/${maxTentativas})`, "orange");
                }
            }
        }

        if (!sucesso) {
            log(`⚠️ Timeout: Não foi possível encontrar opção para "${valor}"`, "orange");
            log(`Sugestão: Verifique se o valor existe no dropdown`, "orange");
        }
    }

    // =========================================================================
    // LÓGICA SAÚDE SIMPLES
    // =========================================================================
    if (window.location.href.includes('guaruja.saudesimples.net')) {

        // Limpa estados residuais ao carregar a página
        log("🚀 Inicializando script na página Saúde Simples", "blue");
        const currentTime = Date.now();
        const lastSearchTime = GM_getValue('cnes_last_search_time');

        // Se há uma busca antiga (mais de 1 minuto), limpa
        if (lastSearchTime && (currentTime - lastSearchTime) > 60000) {
            log("🧹 Limpando estados residuais antigos", "gray");
            GM_setValue('cnes_is_running', false);
            GM_setValue('cnes_search_trigger', null);
            GM_setValue('cnes_last_search_time', null);
            GM_setValue('cnes_extracted_data', null);
        }

        // Popup inicial para solicitar CPF
        function mostrarPopupCPF() {
            const cpfInput = document.querySelector('#profissional_cpf_numero');
            if (!cpfInput) return;

            // Verifica se CPF já foi preenchido
            if (cpfInput.value.replace(/\D/g, '').length === 11) {
                // Remove popup se existir
                const popup = document.getElementById('popup-cpf-cnes');
                if (popup) popup.remove();
                return;
            }

            // Cria popup com input
            if (!document.getElementById('popup-cpf-cnes')) {
                const popup = document.createElement('div');
                popup.id = 'popup-cpf-cnes';
                popup.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    border: 2px solid #333;
                    padding: 25px;
                    border-radius: 8px;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    min-width: 350px;
                `;

                popup.innerHTML = `
                    <h3 style="margin-top: 0; color: #333; text-align: center;">🔍 Buscar Profissional</h3>
                    <p style="margin: 15px 0; color: #666; text-align: center;">Digite o CPF para buscar os dados no CNES</p>

                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 8px; color: #333; font-weight: bold;">CPF (com ou sem formatação)</label>
                        <input
                            type="text"
                            id="popup-cpf-input"
                            placeholder="000.000.000-00 ou 00000000000"
                            style="
                                width: 100%;
                                padding: 10px;
                                border: 2px solid #ddd;
                                border-radius: 4px;
                                font-size: 14px;
                                box-sizing: border-box;
                                font-family: Arial, sans-serif;
                            "
                        />
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 25px;">
                        <button
                            id="popup-cpf-confirmar"
                            style="
                                flex: 1;
                                background: #28a745;
                                color: white;
                                border: none;
                                padding: 12px 16px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: bold;
                            "
                        >✓ Confirmar</button>
                        <button
                            id="popup-cpf-limpar"
                            style="
                                flex: 1;
                                background: #6c757d;
                                color: white;
                                border: none;
                                padding: 12px 16px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 14px;
                            "
                        >Limpar</button>
                        <button
                            id="popup-cpf-reset"
                            style="
                                background: #dc3545;
                                color: white;
                                border: none;
                                padding: 12px 16px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            "
                            title="Forçar reset da busca CNES"
                        >🔄 Reset</button>
                    </div>

                    <div id="popup-cpf-erro" style="
                        margin-top: 15px;
                        padding: 10px;
                        border-radius: 4px;
                        display: none;
                        background: #f8d7da;
                        color: #721c24;
                        font-size: 13px;
                    "></div>
                `;

                document.body.appendChild(popup);

                const popupInput = document.getElementById('popup-cpf-input');
                const btnConfirmar = document.getElementById('popup-cpf-confirmar');
                const btnLimpar = document.getElementById('popup-cpf-limpar');
                const btnReset = document.getElementById('popup-cpf-reset');
                const erroDiv = document.getElementById('popup-cpf-erro');

                // Foca no input automaticamente
                setTimeout(() => popupInput.focus(), 100);

                // Formatar CPF conforme digita
                popupInput.addEventListener('input', function() {
                    let valor = this.value.replace(/\D/g, '');
                    if (valor.length > 11) valor = valor.slice(0, 11);

                    if (valor.length <= 3) {
                        this.value = valor;
                    } else if (valor.length <= 6) {
                        this.value = valor.slice(0, 3) + '.' + valor.slice(3);
                    } else if (valor.length <= 9) {
                        this.value = valor.slice(0, 3) + '.' + valor.slice(3, 6) + '.' + valor.slice(6);
                    } else {
                        this.value = valor.slice(0, 3) + '.' + valor.slice(3, 6) + '.' + valor.slice(6, 9) + '-' + valor.slice(9);
                    }

                    erroDiv.style.display = 'none';
                });

                // Confirmar ao pressionar Enter
                popupInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        btnConfirmar.click();
                    }
                });

                // Botão Confirmar
                btnConfirmar.addEventListener('click', function() {
                    const cpf = popupInput.value.replace(/\D/g, '');

                    if (cpf.length !== 11) {
                        erroDiv.style.display = 'block';
                        erroDiv.innerText = '❌ CPF inválido! Digite 11 dígitos.';
                        return;
                    }

                    log(`✅ CPF confirmado via popup: ${cpf}`, "green");

                    // Preenche o campo do formulário
                    cpfInput.value = popupInput.value;
                    cpfInput.dispatchEvent(new Event('input', { bubbles: true }));
                    cpfInput.dispatchEvent(new Event('change', { bubbles: true }));

                    // Remove o popup
                    popup.remove();

                    // Inicia a busca
                    setTimeout(() => {
                        iniciarBuscaCPF();
                    }, 300);
                });

                // Botão Limpar
                btnLimpar.addEventListener('click', function() {
                    popupInput.value = '';
                    erroDiv.style.display = 'none';
                    popupInput.focus();
                });

                // Botão Reset
                btnReset.addEventListener('click', function() {
                    log("🔄 Reset forçado pelo usuário", "orange");
                    GM_setValue('cnes_is_running', false);
                    GM_setValue('cnes_search_trigger', null);
                    GM_setValue('cnes_last_search_time', null);
                    GM_setValue('cnes_extracted_data', null);

                    erroDiv.style.display = 'block';
                    erroDiv.style.background = '#d4edda';
                    erroDiv.style.color = '#155724';
                    erroDiv.innerText = '✅ Estado CNES resetado! Tente buscar novamente.';

                    setTimeout(() => {
                        erroDiv.style.display = 'none';
                    }, 3000);
                });

                log("🎯 Popup de CPF (com input) exibido", "blue");
            }
        }

        // Função para iniciar busca
        function iniciarBuscaCPF() {
            const cpfInput = document.querySelector('#profissional_cpf_numero');
            const cnsInput = document.querySelector('#profissional_codigo_cns');

            if (!cpfInput) {
                log("❌ Campo CPF não encontrado!", "red");
                return;
            }

            const cpfNumeros = cpfInput.value.replace(/\D/g, '');
            const cnsValue = cnsInput ? cnsInput.value.trim() : '';

            // Debug: mostra status atual
            const isRunning = GM_getValue('cnes_is_running');
            const lastSearchTime = GM_getValue('cnes_last_search_time');
            const timeSinceLastSearch = lastSearchTime ? (Date.now() - lastSearchTime) / 1000 : 'N/A';

            log(`🔍 Debug iniciarBuscaCPF:`, "gray");
            log(`  - CPF digitado: ${cpfInput.value}`, "gray");
            log(`  - CPF números: ${cpfNumeros} (length: ${cpfNumeros.length})`, "gray");
            log(`  - CNS encontrado: ${cnsInput ? 'sim' : 'não'}`, "gray");
            log(`  - CNS valor: "${cnsValue}"`, "gray");
            log(`  - cnes_is_running: ${isRunning}`, "gray");
            log(`  - Última busca: ${timeSinceLastSearch} segundos atrás`, "gray");

            // Verifica CPF válido e CNS vazio
            if (cpfNumeros.length === 11 && (!cnsInput || cnsValue === "")) {
                let isRunning = GM_getValue('cnes_is_running');
                const lastSearchTime = GM_getValue('cnes_last_search_time');

                log(`✅ Validações passaram!`, "green");

                // Se busca está rodando mas é muito antiga, reseta
                if (isRunning && lastSearchTime && (Date.now() - lastSearchTime) > 30000) { // 30 segundos
                    log("⚠️ Timeout (30 seg): Resetando busca anterior que não respondeu", "orange");
                    GM_setValue('cnes_is_running', false);
                    GM_setValue('cnes_search_trigger', null);
                    isRunning = false; // Atualiza variável local
                }

                // Inicia nova busca APENAS se não houver uma em progresso
                if (!isRunning) {
                    log(`✅ CPF válido detectado: ${cpfNumeros}`, "green");
                    log(`✅ Abrindo janela CNES para busca...`, "green");

                    GM_setValue('cnes_is_running', true);
                    GM_setValue('cnes_last_search_time', Date.now());
                    GM_setValue('cnes_search_trigger', cpfNumeros);

                    const urlCNES = 'https://cnes.datasus.gov.br/pages/profissionais/consulta.jsp?search=' + cpfNumeros;
                    log(`🌐 URL: ${urlCNES}`, "blue");

                    try {
                        window.open(urlCNES, '_blank');
                    } catch (err) {
                        log(`❌ Erro ao abrir janela: ${err.message}`, "red");
                        GM_setValue('cnes_is_running', false);
                    }
                } else {
                    log(`⚠️ Busca já está em progresso (cnes_is_running = true)`, "orange");
                    log(`💡 Dica: Se a busca travou, clique no botão "🔄 Reset" no popup`, "blue");
                }
            } else {
                log(`❌ Validações falharam:`, "red");
                log(`  - CPF válido (11 dígitos): ${cpfNumeros.length === 11}`, "red");
                log(`  - CNS vazio: ${(!cnsInput || cnsValue === "")}`, "red");
            }
        }

        // Mostra popup periodicamente se CPF não preenchido
        setInterval(mostrarPopupCPF, 3000);

        // Listener direto no campo CPF para detectar mudanças (executará uma única vez por mudança)
        document.addEventListener('DOMContentLoaded', () => {
            const cpfInput = document.querySelector('#profissional_cpf_numero');
            if (cpfInput) {
                cpfInput.addEventListener('blur', function() {
                    log(`👁️ Campo CPF perdeu foco: ${this.value}`, "gray");
                    iniciarBuscaCPF();
                });
            }
        });

        // Também tenta adicionar listeners após um delay
        setTimeout(() => {
            const cpfInput = document.querySelector('#profissional_cpf_numero');
            if (cpfInput) {
                cpfInput.addEventListener('blur', function() {
                    log(`👁️ Campo CPF perdeu foco: ${this.value}`, "gray");
                    iniciarBuscaCPF();
                });

                // Listener para mudanças (mas com debounce para não chamar múltiplas vezes)
                let debounceTimer = null;
                cpfInput.addEventListener('input', function() {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        log(`📝 CPF modificado: ${this.value}`, "gray");
                        // Só inicia busca se tiver 11 dígitos
                        if (this.value.replace(/\D/g, '').length === 11) {
                            iniciarBuscaCPF();
                        }
                    }, 500);
                });
            }
        }, 500);

        // Monitor periódico APENAS para: remover popup/destaque, resetar timeouts travados
        setInterval(() => {
            const cpfInput = document.querySelector('#profissional_cpf_numero');
            const cnsInput = document.querySelector('#profissional_codigo_cns');

            if (!cpfInput) return;

            // 1. Remove destaque quando CPF válido é preenchido
            if (cpfInput.value.replace(/\D/g, '').length === 11) {
                cpfInput.style.border = '';
                cpfInput.style.boxShadow = '';

                // Remove popup se existir
                const popup = document.getElementById('popup-cpf-cnes');
                if (popup) popup.remove();
            }

            // 2. IMPORTANTE: Se busca está travada, reseta após 30 segundos
            const isRunning = GM_getValue('cnes_is_running');
            const lastSearchTime = GM_getValue('cnes_last_search_time');

            if (isRunning && lastSearchTime && (Date.now() - lastSearchTime) > 30000) {
                log("❌ TIMEOUT: Busca não completou em 30 segundos. Resetando...", "red");
                GM_setValue('cnes_is_running', false);
                GM_setValue('cnes_search_trigger', null);
                GM_setValue('cnes_last_search_time', null);
            }
        }, 5000);

        GM_addValueChangeListener("cnes_extracted_data", async function(name, old_val, data, remote) {
            if (remote && data) {
                log("📥 Dados CNES recebidos. Preenchendo formulário...", "purple");

                try {
                    // Preenche Nome
                    const nomeEl = document.querySelector('#profissional_nome') ||
                                 document.querySelector('input[name="profissional[nome]"]') ||
                                 document.querySelector('input[placeholder*="nome" i]');
                    if (nomeEl) {
                        nomeEl.value = data.nome;
                        nomeEl.dispatchEvent(new Event('input', { bubbles: true }));
                        log(`Nome: ${data.nome}`, "gray");
                    } else {
                        log(`⚠️ Campo nome não encontrado`, "orange");
                    }

                    // Preenche CNS
                    const cnsEl = document.querySelector('#profissional_codigo_cns') ||
                                document.querySelector('input[name="profissional[codigo_cns]"]') ||
                                document.querySelector('input[placeholder*="cns" i]');
                    if (cnsEl) {
                        cnsEl.value = data.cns;
                        cnsEl.dispatchEvent(new Event('input', { bubbles: true }));
                        log(`CNS: ${data.cns}`, "gray");
                    } else {
                        log(`⚠️ Campo CNS não encontrado`, "orange");
                    }

                    // Preenche #customers-contain (CBO)
                    const customersEl = document.querySelector('#customers-contain') ||
                                      document.querySelector('input[name*="cbo" i]') ||
                                      document.querySelector('input[placeholder*="ocupacao" i]');
                    if (customersEl && data.cboString) {
                        const cboDescricao = data.cboString.includes(' - ') ?
                            data.cboString.split(' - ')[1] : data.cboString;
                        customersEl.value = cboDescricao;
                        customersEl.dispatchEvent(new Event('input', { bubbles: true }));
                        customersEl.dispatchEvent(new Event('change', { bubbles: true }));
                        log(`CBO/Ocupação: ${cboDescricao}`, "gray");
                    } else if (data.cboString) {
                        log(`⚠️ Campo CBO não encontrado. CBO: ${data.cboString}`, "orange");
                    }

                    // 1. UNIDADE DE SAÚDE
                    const unidadeInput = document.getElementById('token-input-profissional_unidade_token') ||
                                       document.querySelector('input[placeholder*="unidade" i]') ||
                                       document.querySelector('input[name*="unidade" i]');
                    if (data.unidade && unidadeInput) {
                        log(`Preenchendo Unidade: ${data.unidade}`, "blue");
                        await ativarEPreencher(unidadeInput, data.unidade);
                    } else {
                        log(`⚠️ Campo Unidade não encontrado ou dados vazios. Unidade: "${data.unidade}"`, "orange");
                    }

                    // 2. OCUPAÇÃO (TokenInput)
                    setTimeout(async () => {
                        const ocupacaoInput = document.getElementById('token-input-profissional_ocupacao_token') ||
                                            document.querySelector('input[placeholder*="ocupacao" i]') ||
                                            document.querySelector('input[name*="ocupacao" i]');
                        if (data.cboString && ocupacaoInput) {
                            // Tenta extrair apenas números (código CBO)
                            const cboNumeros = data.cboString.replace(/\D/g, '');
                            const descOcupacao = data.cboString.includes(' - ') ?
                                data.cboString.split(' - ')[1] : data.cboString;

                            // Se conseguir extrair números, tenta buscar só pelos números (mais rápido)
                            // Senão, busca pela descrição completa
                            const valorBusca = cboNumeros.length > 2 ? cboNumeros : descOcupacao;

                            log(`Preenchendo Ocupação: ${descOcupacao} (buscando por: ${valorBusca})`, "blue");
                            await ativarEPreencher(ocupacaoInput, valorBusca);
                        } else {
                            log(`⚠️ Campo Ocupação não encontrado ou dados CBO vazios. CBO: "${data.cboString}"`, "orange");
                        }

                        // 3. Clica no botão "Incluir" sem repetição de timeout
                        setTimeout(async () => {
                            log("⏳ Tentando clicar no botão 'Incluir'...", "gray");

                            let incluirBtn = document.querySelector('#ocupacao > div.grid_2 > a') ||
                                               document.querySelector('a[href*="incluir"]') ||
                                               document.querySelector('input[value*="Incluir"]') ||
                                               document.querySelector('input[type="submit"]') ||
                                               document.querySelector('button[type="submit"]');

                            if (!incluirBtn) {
                                const allButtons = document.querySelectorAll('a, button, input[type="submit"], input[type="button"]');
                                for (let btn of allButtons) {
                                    const text = (btn.innerText || btn.value || btn.getAttribute('title') || '').toLowerCase().trim();
                                    if (text.includes('incluir') || text.includes('salvar') || text.includes('cadastrar') || text.includes('enviar')) {
                                        incluirBtn = btn;
                                        log(`✓ Botão encontrado por texto: "${text}" (${btn.tagName})`, "green");
                                        break;
                                    }
                                }
                            }

                            if (incluirBtn) {
                                const isVisible = incluirBtn.offsetParent !== null && window.getComputedStyle(incluirBtn).display !== 'none';
                                const isEnabled = !incluirBtn.disabled && !incluirBtn.hasAttribute('disabled');

                                if (isVisible && isEnabled) {
                                    log(`🎯 Clicando no botão: ${incluirBtn.tagName} - "${incluirBtn.innerText || incluirBtn.value || incluirBtn.href}"`, "blue");
                                    incluirBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                                    await new Promise(r => setTimeout(r, 50));
                                    incluirBtn.click();
                                    log("✅ Botão 'Incluir' clicado com sucesso!", "green");
                                } else {
                                    log(`⚠️ Botão encontrado, mas indisponível: visível=${isVisible}, habilitado=${isEnabled}`, "orange");
                                }
                            } else {
                                log("❌ Botão 'Incluir' não encontrado", "red");
                            }

                            GM_setValue('cnes_is_running', false);
                            GM_setValue('cnes_last_search_time', null);
                            GM_setValue('cnes_extracted_data', null);
                            log("✓ Preenchimento finalizado!", "green");
                        }, 2000);
                    }, 500); // Fecha delay de ocupação
                } catch (err) {
                    log(`❌ Erro ao preencher: ${err.message}`, "red");
                    GM_setValue('cnes_is_running', false);
                    GM_setValue('cnes_last_search_time', null);
                    GM_setValue('cnes_extracted_data', null);
                }
            }
        });
    }

    // LÓGICA CNES (Extração de dados)
    if (window.location.href.includes('cnes.datasus.gov.br')) {
        const searchCpf = GM_getValue('cnes_search_trigger');

        if (!searchCpf) {
            log(`⚠️ Script CNES carregado mas sem searchCpf`, "orange");
            return;
        }

        log(`🔎 CNES: Buscando CPF: ${searchCpf}`, "blue");

        function extractDataFromPage() {
            let tdNome = document.querySelector('#relatorioGeralField > tbody:nth-child(2) > tr > td:nth-child(1)') ||
                        document.querySelector('#relatorioGeralField td[ng-bind*="nome"]') ||
                        document.querySelector('td[ng-bind*="nome"]') ||
                        document.querySelector('table td:first-child');

            let tdCNS = document.querySelector('#relatorioGeralField > tbody:nth-child(2) > tr > td:nth-child(2)') ||
                       document.querySelector('#relatorioGeralField td[ng-bind*="cns"]') ||
                       document.querySelector('td[ng-bind*="cns"]') ||
                       document.querySelector('table td:nth-child(2)');

            let tdCBO = document.querySelector('#relatorioGeralField > tbody:nth-child(4) > tr:nth-child(1) > td:nth-child(4)') ||
                       document.querySelector('#histProfissionalTableId > tbody:nth-child(4) > tr:nth-child(1) > td:nth-child(5)') ||
                       document.querySelector('table td[ng-bind*="cbo"]') ||
                       document.querySelector('table td[ng-bind*="ocupacao"]') ||
                       document.querySelector('td[ng-bind*="cbo"]') ||
                       document.querySelector('td[ng-bind*="ocupacao"]');

            let tdUnidade = document.querySelector('#relatorioGeralField > tbody:nth-child(4) > tr:nth-child(1) > td:nth-child(7)') ||
                           document.querySelector('table td[ng-bind*="unidade"]') ||
                           document.querySelector('td[ng-bind*="unidade"]');

            log(`Debug extração - Nome: ${tdNome ? tdNome.innerText.trim() : 'não encontrado'}`, "gray");
            log(`Debug extração - CNS: ${tdCNS ? tdCNS.innerText.trim() : 'não encontrado'}`, "gray");
            log(`Debug extração - CBO: ${tdCBO ? tdCBO.innerText.trim() : 'não encontrado'}`, "gray");
            log(`Debug extração - Unidade: ${tdUnidade ? tdUnidade.innerText.trim() : 'não encontrado'}`, "gray");

            if (!tdCNS || tdCNS.innerText.trim().length <= 10) {
                const allTables = document.querySelectorAll('table');
                log(`Debug - Total de tabelas encontradas: ${allTables.length}`, "orange");

                allTables.forEach((table, index) => {
                    const rows = table.querySelectorAll('tr');
                    log(`Debug - Tabela ${index}: ${rows.length} linhas`, "orange");

                    rows.forEach((row, rowIndex) => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length > 0 && rowIndex < 5) {
                            const cellTexts = Array.from(cells).map(cell => cell.innerText.trim()).join(' | ');
                            log(`Debug - Linha ${rowIndex}: ${cellTexts}`, "orange");
                        }
                    });
                });

                const allCells = document.querySelectorAll('table td');
                for (let cell of allCells) {
                    const text = cell.innerText.trim();
                    if (text.length === 15 && /^\d+$/.test(text)) {
                        log(`✓ CNS encontrado por busca geral: ${text}`, "green");
                        tdCNS = cell;

                        const row = cell.closest('tr');
                        if (row) {
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 4) {
                                tdNome = cells[0];
                                tdCBO = cells[3];
                                if (cells.length >= 7) {
                                    tdUnidade = cells[6];
                                }
                                log(`✓ Outros dados extraídos da mesma linha do CNS`, "green");
                            }
                        }
                        break;
                    }
                }
            }

            if (tdCNS && tdCNS.innerText.trim().length > 10) {
                return {
                    nome: tdNome ? tdNome.innerText.trim() : 'N/A',
                    cns: tdCNS.innerText.trim(),
                    cboString: tdCBO ? tdCBO.innerText.trim() : '',
                    unidade: tdUnidade ? tdUnidade.innerText.trim() : ''
                };
            }

            return null;
        }

        function abrirVinculosEExtrair() {
            log("🔘 Procurando botão de vínculos...", "blue");

            let checkBtn = setInterval(() => {
                let btn = document.querySelector('button[ng-click^="pesquisaVinculos("]');

                if (!btn) {
                    const buttons = document.querySelectorAll('button');
                    for (let b of buttons) {
                        if (b.innerText && (b.innerText.includes('Vínculos') || b.innerText.includes('Vinculos'))) {
                            btn = b;
                            log(`✓ Botão encontrado por texto: "${b.innerText.trim()}"`, "green");
                            break;
                        }
                    }
                }

                if (btn) {
                    clearInterval(checkBtn);
                    log("🔘 Botão 'Vínculos' encontrado. Clicando...", "blue");

                    setTimeout(() => {
                        btn.click();

                        let modalCheck = setInterval(() => {
                            log("⏳ Aguardando dados da modal...", "gray");

                            const timeoutId = setTimeout(() => {
                                clearInterval(modalCheck);
                                log("❌ Timeout: Dados não encontrados na modal após 10 segundos", "red");
                                log("💡 Dica: Verifique se o CPF possui dados no CNES ou se a página mudou", "orange");
                                GM_setValue('cnes_is_running', false);
                                GM_setValue('cnes_search_trigger', null);
                            }, 10000);

                            const dados = extractDataFromPage();
                            if (dados && dados.cns) {
                                clearTimeout(timeoutId);
                                clearInterval(modalCheck);

                                GM_setValue('cnes_extracted_data', dados);
                                GM_setValue('cnes_search_trigger', null);

                                setTimeout(() => {
                                    log("🔚 Fechando janela CNES...", "blue");
                                    window.close();
                                }, 800);
                            } else {
                                log("⏳ Dados ainda não encontrados na modal, continuando busca...", "orange");
                            }
                        }, 500);
                    }, 500);
                } else {
                    setTimeout(() => {
                        clearInterval(checkBtn);
                        log("❌ Timeout: Botão de vínculos não encontrado após 10 segundos", "red");
                        GM_setValue('cnes_is_running', false);
                        GM_setValue('cnes_search_trigger', null);
                    }, 10000);
                }
            }, 1000);
        }

        setTimeout(() => {
            log(`🚀 Iniciando extração após delay de carregamento`, "blue");
            abrirVinculosEExtrair();
        }, 3000);
    }
})();
