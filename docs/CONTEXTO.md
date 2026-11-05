# Contexto (Saúde Simples Guarujá)

- `/consultar_agendas` e `/atendimentos_medicos_administrativo` não trazem CPF. A lista de atendimentos traz a coluna SUS (CNS, 15 dígitos) e a data de nascimento.
- O CPF vem de `GET /municipes/search_padronizado_com_mudanca.json?q=<termo>` (mesma origem). Ela devolve um array (até ~10) com `id`, `nome`, `codigo_cns`, `cpf_numero` (formatado) e `data_nascimento_formatada`. Busca por nome e por CPF confirmada; por CNS, a confirmar ao vivo.
- Vagas por horário: o CPF é buscado só pelo CNS da linha, conferindo `codigo_cns` no retorno (decisão do usuário: mesmo cadastro exibido, sem cair para o nome).
- Quadro "Informações do Munícipe" (agendamento/encaixe): blocos `div.grid_N` com `<strong>rótulo</strong>` e o valor no 2º `li`. Duas variantes: com "Número de Prontuário" editável (blocos filhos diretos do wrapper, `#agendamento_municipe_id` dentro) e sem (blocos dentro de `div.form`, id fora do quadro ou ausente). O link "Editar Munícipe" (`/municipes/ID/edit`) existe nas duas. Pode haver um cartão de lembrete flutuando à direita.
- CPF no quadro: ocupa o lugar do "Cartão provisório" (1ª linha, ao lado do CNS, mesma classe grid); o cartão provisório desce para uma linha própria na coluna da esquerda depois de "Nome da mãe" (decisão do usuário). Ordem: 1) pelo CNS (busca padronizada, confere `codigo_cns` e o id); 2) só com CNS totalmente vazio, "nome dd/mm/aaaa" e depois o nome, conferindo nascimento e nome da mãe (duplicado desempata pelo id). A busca pelo CNS foi confirmada no site (1.14.0).
- Não há rota pelo id daqui: `/municipes/ID/edit` redireciona pro v3 (`v3guaruja`, SPA). Os dados do v3 vêm de `v3apiguaruja.saudesimples.net` (`/municipes/ID/identificacao`, `/v1/buscas/municipes/ID/detalhes`), que exige `Authorization: Bearer` do v3 e só libera CORS para `v3guaruja`. Copiar esse token entre sites foi descartado.
- Lista de vagas: só pelo CNS (não tem id do munícipe).
- Prévias vão para a branch `previa`, com `@downloadURL`/`@updateURL` apontando para o raw dela; a `main` só recebe o que foi aprovado.
- Capturas da tela ficam em `~/Documentos/Capturas/guaruja.saudesimples.net-*` (HTML por página + HAR do tráfego).
