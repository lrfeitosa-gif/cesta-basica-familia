# Automação — Encarte do Revolução

Diferente do Cato, do Assaí e do Tenda, o Revolução **não é uma tarefa agendada no computador**: o encarte é lido
pela coleta diária do GitHub Actions ("Coleta diária de ofertas"), na execução das 7h, junto com Sumerbol e Roldão.
Não depende do computador da Luciane estar ligado. Entrou no PR #26 (13/11/2026).

## Como funciona
- Endereço fixo do encarte: `https://www.supermercadosrevolucao.com.br/assets/indaiatuba.jpg`. O site troca a imagem
  nesse mesmo endereço a cada encarte novo. Em 14/11/2026 a imagem tinha 1000×7528 px.
- Código: chave `"arquivos"` do Revolução em `worker/coleta/encartes.py`.
- A imagem é maior que o limite de 5 MB da API do Claude. Ela é cortada em faixas de 1800×2200 px, com 250 px de
  sobreposição para não perder produto no corte (`_fatias` em `worker/coleta/extrator.py`, com testes). Cada faixa é
  uma chamada à API.
- Quem lê: Claude Sonnet (`EXTRATOR` = `claude`, `CLAUDE_MODELO` = `claude-sonnet-5-5`).

## Como a gravação funciona
- Cada linha de `oferta` vale para um dia. A coleta diária grava **só o dia em que roda** (`gravar` em
  `worker/rodar_coleta.py`); a data de início impressa no encarte não é usada.
- Cargas por arquivo ou prints (`--arquivo`, painel admin) gravam de hoje até o fim da validade (no máximo 14 dias).
- Oferta com `valido_ate` anterior ao dia não é gravada. Se o site demorar para trocar a imagem depois do fim do
  encarte, a coleta não grava nada do Revolução naquele dia.
- A chave única é (produto, mercado, dia, fonte). Quando a leitura automática chega no mesmo produto (mesmo nome, marca
  e embalagem) de uma carga anterior, ela substitui a linha. Quando o nome sai diferente, ficam as duas, e o app mostra
  o mesmo item duas vezes.

## Histórico
- 11/11/2026: carga manual por prints, 43 ofertas por dia, de 11/11 a 15/11.
- 13/11/2026: execução de teste 43455903459 gravou 68 ofertas às 12h47.
- 14/11/2026: primeira carga automática da coleta das 7h (68 ofertas, 07h39). A carga manual de 13 a 15/11, que
  duplicava produtos com nomes diferentes, foi apagada (124 linhas); em 11 e 12/11 foi corrigido o preço "Leve N por".

## Como conferir e rodar à mão
- Conferir no banco: ofertas do Revolução com `url` preenchida (leitura automática) e o `coletado_em` do dia.
- Rodar fora do horário: GitHub → Actions → "Coleta diária de ofertas" → Run workflow.
- Se a imagem mudar de endereço ou o site sair do ar, a coleta não grava nada do Revolução. A reserva é o painel
  admin → Carregar encartes, por prints. Antes de carregar prints num dia em que a coleta automática já rodou, lembre
  que nomes diferentes geram duplicação.
