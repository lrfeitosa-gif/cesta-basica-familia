# Automação — Folhetos do Cato

Tarefa agendada **"Folhetos Cato"** no Claude (id `trig_01Bkwoz25QA6vQetvBxALbH1`), todo dia às 06:46 (São Paulo),
no computador da Luciane (pasta `C:\Users\Luciane\cesta-basica-familia\encartes\cato`), com aprovação automática.
Este arquivo guarda uma cópia das instruções para ter histórico; a tarefa em si fica no Claude.

Requisitos para rodar: computador ligado, app Claude aberto e Chrome com a extensão do Claude conectada.
A carga no app continua manual: painel admin → Carregar encartes → Cato.

## Histórico
- 12/11/2026: criada. Primeira execução salvou um print PNG de 543×840 (o download do .webp deu 403).
- 12/11/2026: instruções ajustadas para tentar o download pelo PowerShell com o site do Cato como origem,
  e, se falhar, tirar o print com zoom de 200%. A checagem de repetidos passou a ignorar a extensão (.webp/.png).

## Instruções atuais

```text
Tarefa diária: salvar os folhetos (encartes) do Cato Supermercados no computador da Luciane.

1. No Chrome da Luciane (ferramentas do Claude in Chrome), abra https://www.catosupermercados.com.br/folhetos numa aba nova e espere carregar. Não faça login, não clique em carrinho, ofertas ou WhatsApp, não aceite nada além do necessário (recuse cookies não essenciais).

2. Identifique as imagens de folheto exibidas na página. Hoje elas vêm de https://cdn.regexsolutions.com.br/production/folheto/... (arquivos .webp). Leia os endereços das imagens com read_page/find ou pelas requisições de rede da aba. Se houver setas ou várias páginas de folheto, percorra todas.

3. Antes de salvar, confira se o folheto já foi salvo: procure em todas as subpastas de datas anteriores um arquivo com o mesmo nome, IGNORANDO a extensão (bf47c449-...-1.webp e bf47c449-...-1.png são o mesmo folheto). Se já existir, não salve de novo.

4. Salve cada folheto novo em C:\Users\Luciane\cesta-basica-familia\encartes\cato\AAAA-MM-DD\ (data de hoje, horário de São Paulo), mantendo o nome original do arquivo. Tente nesta ordem e pare na primeira que der certo:
   a) Download pelo shell do computador da Luciane (PowerShell), informando o site do Cato como origem, por exemplo:
      Invoke-WebRequest -Uri "<endereço da imagem>" -OutFile "<pasta>\<nome original>" -Headers @{ Referer = "https://www.catosupermercados.com.br/"; Origin = "https://www.catosupermercados.com.br" } -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
      Confira que o arquivo baixado é uma imagem de verdade (tamanho maior que 20 KB) e não uma página de erro.
   b) Se o download falhar (403, CORS ou arquivo inválido): abra o endereço da imagem direto numa aba do Chrome e salve um print dessa aba em PNG, com zoom de 200% e rolando a imagem se ela não couber, para os preços e nomes ficarem legíveis. Use o mesmo nome original com extensão .png.
   c) Só se (a) e (b) falharem: print do folheto na página de folhetos, com zoom de 200%, em PNG.
   Anote a largura x altura em pixels do arquivo salvo.

5. Acrescente uma linha em C:\Users\Luciane\cesta-basica-familia\encartes\cato\historico.log com: data/hora, quantos folhetos havia na página, quantos novos foram salvos, nome de cada arquivo, qual método funcionou (download, print da imagem ou print da página), tamanho em pixels e a validade indicada no folheto.

6. Feche as abas que você abriu.

Se o site mostrar erro 403 na própria página de folhetos, página de bloqueio, CAPTCHA ou verificação de robô: NÃO tente contornar. Registre isso no historico.log e avise a Luciane no resumo final. Não acesse outros sites (além do endereço das imagens do folheto) nem outras pastas.

Resumo final curto em português: quantos folhetos novos, nomes dos arquivos, método usado, tamanho em pixels e validade indicada no folheto (ex.: "válido só quinta 12/11"), se estiver visível.
```
