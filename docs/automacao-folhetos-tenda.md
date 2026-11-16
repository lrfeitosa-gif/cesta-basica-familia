# Automação — Folhetos do Tenda

Tarefa agendada **"Folhetos Tenda"** no Claude (id `trig_012nSN66XneMBVSJpL12Ww83`), todo dia às 07:04 (São Paulo),
no computador da Luciane (pasta `C:\Users\Luciane\cesta-basica-familia\encartes\tenda`), com aprovação automática e
resumo no celular. Este arquivo guarda uma cópia das instruções para ter histórico; a tarefa em si fica no Claude.

Requisitos para rodar: computador ligado, app Claude aberto e Chrome com a extensão do Claude conectada.
A tarefa lê o folheto e grava as ofertas no app pela função `importar_encarte_interno` (migração 0025),
uma chamada por validade (cada página pode ter blocos com validades diferentes).

## Histórico
- 14/11/2026: criada em outra conversa. Primeira carga às 09h37: 4 páginas, 253 linhas (14 a 15/11 e 14 a 16/11).

## Instruções atuais (14/11/2026)

```text
Tarefa diária: salvar o folheto de ofertas (encarte) do Tenda Atacado Indaiatuba no computador da Luciane e carregar as ofertas no app Cesta Básica Família.

PARTE 1 — SALVAR O FOLHETO

1. No Chrome da Luciane (ferramentas do Claude in Chrome), abra https://www.tendaatacado.com.br/institucional/nossas-ofertas numa aba nova e espere carregar. Não faça login, não clique em carrinho, cupom, WhatsApp ou cadastro, e recuse cookies não essenciais.

2. Em "Promoções e ofertas de loja", escolha a cidade "Indaiatuba - SP" no primeiro seletor e a loja "Indaiatuba" no segundo (em 14/11/2026 o valor da loja era 21). Aparece um card de folheto (ex.: "Ofertas da semana", "Válido de 13/11 a 15/11", Alameda Filtros Mann, 670). Se houver mais de um card, trate cada um. Clique no card: as páginas do folheto aparecem como imagens. Leia os endereços com javascript/read_page. Em 14/11/2026 eram 4 páginas assim, em JPEG de 2040x3098:
   https://d3gdr9n5lqb5z7.cloudfront.net/fotos/1794330278530.jpeg
   Ignore banners e ícones (gif_frete, bandeiras de cartão, newsletter).

3. Antes de salvar, confira se a página já foi salva: procure em todas as subpastas de datas anteriores de C:\Users\Luciane\cesta-basica-familia\encartes\tenda um arquivo com o mesmo nome, ignorando a extensão. Se já existir, não salve de novo e não carregue de novo. Exceção: as páginas 1794330269303, 1794330278530, 1794330286790 e 1794330296271 já foram carregadas em 14/11/2026 sem salvar a imagem; se ainda aparecerem, salve as imagens mas NÃO carregue de novo.

4. Salve cada página nova em C:\Users\Luciane\cesta-basica-familia\encartes\tenda\AAAA-MM-DD\ (data de hoje, horário de São Paulo), com o nome original do arquivo. Tente nesta ordem e pare na primeira que der certo:
   a) Download pelo shell do computador da Luciane (PowerShell):
      Invoke-WebRequest -Uri "<endereço da imagem>" -OutFile "<pasta>\<nome original>" -Headers @{ Referer = "https://www.tendaatacado.com.br/" } -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
      Confira que o arquivo é uma imagem de verdade (maior que 20 KB), não uma página de erro.
   b) Se falhar: abra o endereço da imagem numa aba do Chrome, mostre a imagem com largura igual à da janela (o visualizador do Chrome achata a imagem; corrija com estilo width:<largura da janela>px; height:auto !important; max-width:none) e salve prints em PNG rolando a página, com o mesmo nome e sufixo -1, -2... .png.
   Anote a largura x altura em pixels de cada arquivo salvo.

PARTE 2 — LER AS OFERTAS E CARREGAR NO APP (só páginas novas salvas hoje)

5. Traga os arquivos salvos para o seu ambiente (device_stage_files) e abra cada imagem. As páginas são altas (cerca de 3100 px): corte em 4 ou 5 faixas horizontais com sobreposição e leia cada faixa com zoom. Se não conseguir trazer o arquivo, leia na aba do Chrome com a imagem na largura da janela, rolando e tirando screenshots.

6. Cada página pode ter BLOCOS com validades diferentes, numa faixa vermelha ou num selo amarelo: "Ofertas válidas somente nesta sexta 13.11", "Ofertas válidas para sábado e domingo 14 e 15.11", "Ofertas válidas de 13 a 16.11". Anote a validade de cada produto pelo bloco em que ele está. O rodapé deve citar Indaiatuba na lista de lojas; se não citar, não carregue e registre no historico.log.

7. Liste todos os produtos com preço legível, um por item, com estas regras (as mesmas do leitor de encartes do app):
   - Produto genérico, marca e embalagem separados ("Café União 500g" -> produto "Café torrado e moído", marca "União", quantidade 500, unidade "g"). Use nomes genéricos como "Açúcar refinado", "Achocolatado em pó", "Arroz branco tipo 1". A marca própria do Tenda é "Select".
   - Unidade sempre g, kg, ml, l ou un. Açougue ou frios vendidos por kg: quantidade 1, unidade "kg". Pacote com peso (ex.: "Pacote 5kg" com "Preço do pacote"): use o peso do pacote e o preço do pacote, e cite o preço do quilo em condicao.
   - O Tenda mostra até três preços no selo "DESCONTOU": "No cartão Tenda", "Cadastrado no app" e "Preço". Use o menor em preco e o "Preço" normal em preco_de. condicao:
       três preços -> "no cartão Tenda (cadastrado no app R$ X,XX); até N un por CPF"
       dois preços (app e normal) -> "cadastrado no app; até N un por CPF"
     O limite vem no texto vertical "Limite por CPF: 10 unidades/quilos/packs/caixas". "Leve 6 pague 4" e "Nesta promoção a unidade sai por": preco = valor por unidade na promoção, preco_de = preço unitário, condicao = "leve 6 pague 4". Preço único: preco_de null e condicao null (ou só as opções de sabor/tipo).
   - Packs e caixas: use o conteúdo total ("caixa 36un x 56g" -> 2016, "g"; "2x90g" -> 180, "g"). Use "un" só quando não houver peso ou volume (ex.: papel higiênico 12 rolos -> 12 un).
   - Quando houver opções de embalagem ("375g/380g", "96g/100g"), use a menor e cite as opções em condicao. Opções de sabor ou tipo também vão em condicao.
   - Nunca comece condicao com a palavra "Só" (o app interpreta "Só ..." como restrição de dias).
   - Categoria em minúsculas: mercearia, hortifruti, açougue, laticínios, frios, limpeza, higiene, bebidas, padaria, congelados ou pet.
   - Não invente: preço ou embalagem ilegível -> deixe o item de fora; marca ilegível -> null.
   - Confira cada preço duas vezes. Desconfie de preço muito abaixo do normal para o produto e, na dúvida, deixe de fora.

8. Validade de cada bloco: "13 a 16.11" -> 2026-11-13 a 2026-11-16; "14 e 15.11" -> 2026-11-14 a 2026-11-15; "somente nesta sexta 13.11" -> 2026-11-13 a 2026-11-13. Se o fim já passou, não carregue o bloco e registre no historico.log. O início não pode ser antes de hoje: se for, use hoje. Junte os produtos de todas as páginas novas que têm a mesma validade e tire repetidos.

9. Grave pelo conector do Supabase, no projeto dxpleekoyycbjcclrjtp, com a ferramenta de SQL, uma única chamada por validade e nenhum outro comando SQL:
   select importar_encarte_interno('Tenda', 'AAAA-MM-DD', 'AAAA-MM-DD', $json$[ ...ofertas... ]$json$::jsonb);
   Cada oferta: {"produto": "...", "marca": "..." ou null, "quantidade": número, "unidade": "g|kg|ml|l|un", "categoria": "...", "preco": número, "preco_de": número ou null, "condicao": "..." ou null}. No máximo 500 ofertas por chamada. A função devolve quantas linhas gravou (uma por dia de validade). Se der erro, não tente outro caminho: registre a mensagem no historico.log e avise no resumo.

PARTE 3 — REGISTRO

10. Acrescente uma linha em C:\Users\Luciane\cesta-basica-familia\encartes\tenda\historico.log com: data/hora, quantos folhetos e páginas havia, quantas páginas novas foram salvas, nome de cada arquivo, método (download ou print), tamanho em pixels, validade de cada bloco, quantas ofertas foram lidas e quantas linhas cada carga gravou (ou o motivo de não ter carregado).

11. Feche as abas que você abriu.

Se o site mostrar erro 403, página de bloqueio, CAPTCHA ou verificação de robô: NÃO tente contornar. Registre no historico.log e avise no resumo. Não acesse outros sites (além do endereço das imagens do folheto), nem outras pastas, e não faça nenhuma outra alteração no banco.

Resumo final curto em português: quantas páginas novas, nomes dos arquivos, método, tamanho em pixels, validades, quantas ofertas foram carregadas e 3 exemplos (produto, marca, preço) para conferência.
```
