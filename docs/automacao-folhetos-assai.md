# Automação — Folhetos do Assaí

Tarefa agendada **"Folhetos Assaí"** no Claude (id `trig_01KefqUhm9fxonZWvk3M959y`), todo dia às 07:17 (São Paulo),
no computador da Luciane (pasta `C:\Users\Luciane\cesta-basica-familia\encartes\assai`), com aprovação automática e
resumo no celular. Este arquivo guarda uma cópia das instruções para ter histórico; a tarefa em si fica no Claude.

Requisitos para rodar: computador ligado, app Claude aberto e Chrome com a extensão do Claude conectada.
A tarefa lê os jornais e grava as ofertas no app pela função `importar_encarte_interno` (migração 0025),
uma chamada por jornal (por validade).

## Histórico
- 13/11/2026: criada. A 1ª tentativa manual (11h13) não rodou: conectores do computador e do Supabase com erro 502.
  A 2ª (12h10) gravou às 12h17: 101 produtos de 13 a 15/11 (303 linhas, uma por dia de validade).
- 14/11/2026: a execução das 07h34 terminou em cerca de 5 segundos, sem carga nova. A verificar no historico.log
  (pode não haver jornal novo, mas o tempo parece curto demais).

## Instruções atuais (14/11/2026)

```text
Tarefa diária: salvar os jornais de ofertas (encartes) do Assaí Indaiatuba no computador da Luciane e carregar as ofertas no app Cesta Básica Família.

PARTE 1 — SALVAR OS JORNAIS

1. No Chrome da Luciane (ferramentas do Claude in Chrome), abra https://www.assai.com.br/ofertas/sao-paulo/assai-indaiatuba numa aba nova e espere carregar. Não faça login, não clique em WhatsApp, app ou "Escolha uma Loja", e recuse cookies não essenciais.

2. A página tem abas "Jornal de Ofertas 1", "Jornal de Ofertas 2" (pode haver mais ou menos), cada uma com "Preços válidos de DD/MM/AAAA até DD/MM/AAAA" e "Página N/M". Para cada aba de jornal e para cada página (botão "Próxima Página de ofertas"), leia o endereço do link "Baixar página" com find/read_page. Em 13/11/2026 eram assim:
   https://d2q57q7k4hzryv.cloudfront.net/RPA/v3/176015/campanha-176015-cluster-788-pagina-1.jpeg
   Anote para cada imagem: a aba do jornal, a página e a validade daquela aba.

3. Antes de salvar, confira se a imagem já foi salva: procure em todas as subpastas de datas anteriores de C:\Users\Luciane\cesta-basica-familia\encartes\assai um arquivo com o mesmo nome, ignorando a extensão. Se já existir, não salve de novo e não carregue de novo.

4. Salve cada imagem nova em C:\Users\Luciane\cesta-basica-familia\encartes\assai\AAAA-MM-DD\ (data de hoje, horário de São Paulo), com o nome original do arquivo. Tente nesta ordem e pare na primeira que der certo:
   a) Download pelo shell do computador da Luciane (PowerShell):
      Invoke-WebRequest -Uri "<endereço da imagem>" -OutFile "<pasta>\<nome original>" -Headers @{ Referer = "https://www.assai.com.br/" } -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
      Confira que o arquivo é uma imagem de verdade (maior que 20 KB), não uma página de erro.
   b) Se falhar: abra o endereço da imagem numa aba do Chrome e salve um print em PNG com zoom de 200%, rolando se não couber, com o mesmo nome e extensão .png.
   Anote a largura x altura em pixels de cada arquivo salvo.

PARTE 2 — LER AS OFERTAS E CARREGAR NO APP (só imagens novas salvas hoje)

5. Traga os arquivos salvos para o seu ambiente (device_stage_files) e abra cada imagem. Se os textos estiverem miúdos, corte em partes (por exemplo, 3 ou 4 faixas horizontais com sobreposição) e leia cada parte com zoom.

6. Liste todos os produtos com preço legível, um por item, com estas regras (as mesmas do leitor de encartes do app):
   - Separe produto genérico, marca e embalagem ("Café Pilão 500g" -> produto "Café torrado e moído", marca "Pilão", quantidade 500, unidade "g").
   - Unidade sempre g, kg, ml, l ou un. Hortifrúti ou açougue a granel ("Kg"): quantidade 1, unidade "kg".
   - O Assaí costuma mostrar preço unitário e preço de atacado ("a partir de N un", "no fardo", "na caixa"). Use o menor em preco, o outro em preco_de e descreva a regra em condicao (ex.: "a partir de 6 un"). Preço do cartão Passaí ou do app Meu Assaí também é condição. Preço riscado vai em preco_de.
   - Packs, fardos e caixas: se o preço for do pacote inteiro, use o conteúdo total ("fardo 12x350ml" -> 4200, "ml"); se o preço for por unidade dentro do fardo, use a embalagem unitária e cite o fardo em condicao. Use "un" só quando não houver peso ou volume.
   - Quando houver opções de embalagem ("150 ou 250 ml"), use a menor e cite as opções em condicao.
   - Categoria em minúsculas: mercearia, hortifruti, açougue, laticínios, frios, limpeza, higiene, bebidas, padaria, congelados ou pet.
   - Não invente: preço ou embalagem ilegível -> deixe o item de fora; marca ilegível -> null.
   - Confira cada preço duas vezes. Desconfie de preço muito abaixo do normal para o produto (ex.: café a menos de R$ 20 o kg) e, na dúvida, deixe de fora.
   - Junte as ofertas de todas as páginas novas do mesmo jornal (mesma validade) e tire repetidos.

7. Validade: use a de cada aba ("Preços válidos de 13/11/2026 até 15/11/2026" -> 2026-11-13 a 2026-11-15). Se o fim já passou, não carregue e registre no historico.log. O início não pode ser antes de hoje: se for, use hoje.

8. Grave pelo conector do Supabase, no projeto dxpleekoyycbjcclrjtp, com a ferramenta de SQL, uma única chamada por jornal (por validade) e nenhum outro comando SQL:
   select importar_encarte_interno('Assaí', 'AAAA-MM-DD', 'AAAA-MM-DD', $json$[ ...ofertas... ]$json$::jsonb);
   Cada oferta: {"produto": "...", "marca": "..." ou null, "quantidade": número, "unidade": "g|kg|ml|l|un", "categoria": "...", "preco": número, "preco_de": número ou null, "condicao": "..." ou null}. No máximo 500 ofertas por chamada. A função devolve quantas linhas gravou. Se der erro, não tente outro caminho: registre a mensagem no historico.log e avise no resumo.

PARTE 3 — REGISTRO

9. Acrescente uma linha em C:\Users\Luciane\cesta-basica-familia\encartes\assai\historico.log com: data/hora, quantos jornais e páginas havia, quantas imagens novas foram salvas, nome de cada arquivo, método (download ou print), tamanho em pixels, validade de cada jornal, quantas ofertas foram lidas e quantas linhas a carga gravou (ou o motivo de não ter carregado).

10. Feche as abas que você abriu.

Se o site mostrar erro 403, página de bloqueio, CAPTCHA ou verificação de robô: NÃO tente contornar. Registre no historico.log e avise no resumo. Não acesse outros sites (além do endereço das imagens), nem outras pastas, e não faça nenhuma outra alteração no banco.

Resumo final curto em português: quantas imagens novas, nomes dos arquivos, método, tamanho em pixels, validade, quantas ofertas foram carregadas e 3 exemplos (produto, marca, preço) para conferência.
```
