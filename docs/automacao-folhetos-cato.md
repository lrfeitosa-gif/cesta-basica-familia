# Automação — Folhetos do Cato

Tarefa agendada **"Folhetos Cato"** no Claude (id `trig_01Bkwoz25QA6vQetvBxALbH1`), todo dia às 06:46 (São Paulo),
no computador da Luciane (pasta `C:\Users\Luciane\cesta-basica-familia\encartes\cato`), com aprovação automática.
Este arquivo guarda uma cópia das instruções para ter histórico; a tarefa em si fica no Claude.

Requisitos para rodar: computador ligado, app Claude aberto e Chrome com a extensão do Claude conectada.
Desde 12/11 a própria tarefa lê o folheto e grava as ofertas no app pela função `importar_encarte_interno`
(migração 0025), a mesma regra do painel admin → Carregar encartes, que continua disponível para carga manual.

## Histórico
- 12/11/2026: criada. Primeira execução salvou um print PNG de 543×840 (o download do .webp deu 403).
- 12/11/2026: instruções ajustadas para tentar o download pelo PowerShell com o site do Cato como origem,
  e, se falhar, tirar o print com zoom de 200%. A checagem de repetidos passou a ignorar a extensão (.webp/.png).
- 12/11/2026: a tarefa passa a ler o folheto e carregar as ofertas no app (migração 0025), logo depois de salvar.

## Instruções atuais

```text
Tarefa diária: salvar os folhetos (encartes) do Cato Supermercados no computador da Luciane e carregar as ofertas no app Cesta Básica Família.

PARTE 1 — SALVAR O FOLHETO

1. No Chrome da Luciane (ferramentas do Claude in Chrome), abra https://www.catosupermercados.com.br/folhetos numa aba nova e espere carregar. Não faça login, não clique em carrinho, ofertas ou WhatsApp, não aceite nada além do necessário (recuse cookies não essenciais).

2. Identifique as imagens de folheto exibidas na página. Hoje elas vêm de https://cdn.regexsolutions.com.br/production/folheto/... (arquivos .webp). Leia os endereços das imagens com read_page/find ou pelas requisições de rede da aba. Se houver setas ou várias páginas de folheto, percorra todas.

3. Antes de salvar, confira se o folheto já foi salvo: procure em todas as subpastas de datas anteriores um arquivo com o mesmo nome, IGNORANDO a extensão (bf47c449-...-1.webp e bf47c449-...-1.png são o mesmo folheto). Se já existir, não salve de novo e não carregue de novo.

4. Salve cada folheto novo em C:\Users\Luciane\cesta-basica-familia\encartes\cato\AAAA-MM-DD\ (data de hoje, horário de São Paulo), mantendo o nome original do arquivo. Tente nesta ordem e pare na primeira que der certo:
   a) Download pelo shell do computador da Luciane (PowerShell), informando o site do Cato como origem, por exemplo:
      Invoke-WebRequest -Uri "<endereço da imagem>" -OutFile "<pasta>\<nome original>" -Headers @{ Referer = "https://www.catosupermercados.com.br/"; Origin = "https://www.catosupermercados.com.br" } -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
      Confira que o arquivo baixado é uma imagem de verdade (tamanho maior que 20 KB) e não uma página de erro.
   b) Se o download falhar (403, CORS ou arquivo inválido): abra o endereço da imagem direto numa aba do Chrome e salve um print dessa aba em PNG, com zoom de 200% e rolando a imagem se ela não couber, para os preços e nomes ficarem legíveis. Use o mesmo nome original com extensão .png.
   c) Só se (a) e (b) falharem: print do folheto na página de folhetos, com zoom de 200%, em PNG.
   Anote a largura x altura em pixels do arquivo salvo.

PARTE 2 — LER AS OFERTAS E CARREGAR NO APP (só para folhetos novos salvos hoje)

5. Traga o arquivo salvo para o seu ambiente (device_stage_files) e abra a imagem. Se for .webp, converta para PNG com Python/Pillow antes de abrir. Se a imagem for grande ou os textos estiverem miúdos, corte em partes (por exemplo, 3 faixas horizontais com sobreposição) e leia cada parte com zoom.

6. Liste todos os produtos com preço legível, um por item, seguindo estas regras (as mesmas do leitor de encartes do app):
   - Separe produto genérico, marca e embalagem ("Café Pilão 500g" -> produto "Café torrado e moído", marca "Pilão", quantidade 500, unidade "g").
   - Unidade sempre g, kg, ml, l ou un. Hortifrúti ou açougue vendido a granel ("Kg"): quantidade 1, unidade "kg".
   - Se houver dois preços (normal e Clube Cato, cartão, "a partir de N un"), use o menor em preco, o outro em preco_de e descreva a regra em condicao (ex.: "Clube Cato"). Preço riscado também vai em preco_de.
   - Packs: use o conteúdo total ("pack 5x160g" -> 800, "g"). Use "un" só quando não houver peso ou volume.
   - Quando o folheto der opções de embalagem ("150 ou 250 ml"), use a menor e cite as opções em condicao.
   - Categoria em minúsculas: mercearia, hortifruti, açougue, laticínios, frios, limpeza, higiene, bebidas, padaria, congelados ou pet.
   - Não invente: se o preço ou a embalagem não estiver legível, deixe o item de fora; se a marca não estiver legível, use null.
   - Confira cada preço duas vezes. Desconfie de preço muito abaixo do normal para o produto (ex.: café a menos de R$ 20 o kg) e, se não tiver certeza da leitura, deixe o item de fora.

7. Validade: use a data escrita no folheto ("ofertas válidas somente quinta 12/11" -> início e fim = 2026-11-12; "de 13/11 a 16/11" -> 2026-11-13 a 2026-11-16). Se o folheto não mostrar validade, use só hoje. Se o fim da validade já passou, não carregue; registre isso no historico.log. O início não pode ser antes de hoje: se for, use hoje.

8. Grave pelo conector do Supabase, no projeto dxpleekoyycbjcclrjtp, com a ferramenta de SQL, uma única chamada por folheto e nenhum outro comando SQL:
   select importar_encarte_interno('Cato', 'AAAA-MM-DD', 'AAAA-MM-DD', $json$[ ...ofertas... ]$json$::jsonb);
   Cada oferta no JSON: {"produto": "...", "marca": "..." ou null, "quantidade": número, "unidade": "g|kg|ml|l|un", "categoria": "...", "preco": número, "preco_de": número ou null, "condicao": "..." ou null}. No máximo 500 ofertas. A função devolve quantas linhas gravou. Se der erro, não tente outro caminho: registre a mensagem no historico.log e avise no resumo.

PARTE 3 — REGISTRO

9. Acrescente uma linha em C:\Users\Luciane\cesta-basica-familia\encartes\cato\historico.log com: data/hora, quantos folhetos havia na página, quantos novos foram salvos, nome de cada arquivo, qual método funcionou (download, print da imagem ou print da página), tamanho em pixels, validade indicada no folheto, quantas ofertas foram lidas e quantas linhas a carga gravou no app (ou o motivo de não ter carregado).

10. Feche as abas que você abriu.

Se o site mostrar erro 403 na própria página de folhetos, página de bloqueio, CAPTCHA ou verificação de robô: NÃO tente contornar. Registre isso no historico.log e avise a Luciane no resumo final. Não acesse outros sites (além do endereço das imagens do folheto) nem outras pastas, e não faça nenhuma outra alteração no banco.

Resumo final curto em português: quantos folhetos novos, nomes dos arquivos, método usado, tamanho em pixels, validade, quantas ofertas foram carregadas no app e 3 exemplos de ofertas carregadas (produto, marca, preço) para conferência.
```
