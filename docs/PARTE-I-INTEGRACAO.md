# fast-promotions-mk — Parte I: Integração e coleta de preços

Situação em 29/10/2026. O app se chamava "Cesta Básica Família" e foi renomeado para fast-promotions-mk em 30/10/2026. Este documento resume o que foi construído até aqui, onde cada peça fica e o que precisa ser guardado.

## 1. Visão geral

Todo dia às 7h (Brasília) um robô no GitHub coleta os preços dos mercados de Indaiatuba e grava no banco de dados. O app lê desse banco.

```
Sites dos mercados ──┐
Encartes (PDF/foto) ─┼─► Coletores (Python) ─► Extrator Claude (encartes) ─► Supabase (banco) ─► App / tela
Prints enviados ─────┘          ▲
                                └── GitHub Actions: roda sozinho todo dia às 7h
```

## 2. Fontes de preço por mercado

| Mercado | Como coletamos | Observação |
|---|---|---|
| Atacadão | API pública do site (plataforma VTEX), região de Indaiatuba | Loja online cobre só parte dos itens; preços de atacado não aparecem |
| Covabra | API pública do site (VTEX) | Preço do site, pode diferir da loja |
| Pague Menos | API pública do site (VTEX) | Coleção 161 = ofertas |
| Savegnago | API pública do site (VTEX) | Site não aceita região: preço padrão |
| Sumerbol | Encarte em PDF no site → extrator | |
| Roldão | Encartes em imagem no site → extrator | Encarte "ITU-" é de outra cidade e é ignorado |
| Assaí | Prints enviados manualmente → extrator | Site bloqueia acesso automático |
| Pão de Açúcar | Prints enviados manualmente → extrator | Site bloqueia acesso automático |

Regra adotada: só usamos fontes abertas. Sites que bloqueiam robôs não são contornados.

## 3. Componentes

### 3.1 Coletores (`worker/coleta/`)
- `vtex.py` — busca produtos nas APIs públicas dos mercados em VTEX. Traz preço, preço "de", código de barras (EAN) e estoque, informando o CEP de Indaiatuba.
- `encartes.py` — encontra os encartes publicados nos sites (Sumerbol, Roldão) e envia cada um ao extrator.
- `extrator.py` — envia a imagem ou o PDF do encarte para a API do Claude (modelo Claude Opus 5.5, com visão) e recebe a lista de ofertas estruturada: produto, marca, embalagem, preço, preço "de", condição e validade.
- `comparar_gabarito.py` — mede a precisão do extrator contra uma transcrição manual. No encarte do Assaí de 26/10: preço 100%, preço "de" 99%, embalagem 96%.

### 3.2 Orquestração (`worker/rodar_coleta.py`)
Roda todos os coletores, converte cada oferta para o formato do banco e grava. Se um mercado falhar, os outros continuam. Prints entram com `--arquivo`.

### 3.3 Banco de dados (Supabase / Postgres)
Projeto `cesta-basica`, região São Paulo. Estrutura em `supabase/migrations/`:
- `0001_schema.sql` — tabelas do app: família, regiões de interesse, mercados, produtos, ofertas, lista de interesse, compras, itens comprados, alertas. Regras de acesso (RLS): cada família só vê os próprios dados; produtos, mercados e ofertas são públicos para leitura.
- `0002_coleta.sql` — ajustes para a coleta: chave única de produto (EAN ou nome+marca+embalagem), preço "de", condição, link, cadastro dos 8 mercados.
- `0003_curva_preco.sql` — visões de histórico: preço médio diário por produto (curva de preço) e referência de 60/90 dias para os alertas.

Uma oferta por produto, mercado, dia e fonte: rodar duas vezes no mesmo dia atualiza em vez de duplicar. Cada dia novo gera um registro novo, e isso forma o histórico.

Privacidade: o banco não tem campo para CPF, nome completo, endereço exato ou pagamento. A região da família é guardada arredondada (~1 km).

### 3.4 Motor de regras (`worker/motor/regras.py`)
Funções puras, com 8 testes automatizados:
- cruzamento oferta × lista de interesse (por EAN, ou produto + marca + embalagem ±25%);
- gatilho de oportunidade: preço-alvo, 15% abaixo da média de 60 dias ou menor preço de 90 dias, com limite de 1 alerta por produto a cada 7 dias;
- melhor mercado único e melhor dupla, somando o deslocamento;
- quanto estocar (até ~90 dias de consumo);
- aviso de compra repetida.

Ainda não está ligado ao banco: depende de algumas semanas de histórico.

### 3.5 Leitura de nota fiscal (`worker/motor/nfce.py`)
Lê a NFC-e de SP pela URL do QR Code: itens, quantidades, preços, CNPJ da loja e data. CPF e dados do consumidor não são lidos. Ainda não testado com notas reais.

### 3.6 GitHub (repositório privado `lrfeitosa-gif/cesta-basica-familia`)
- Guarda todo o código com histórico de versões.
- `.github/workflows/coleta-diaria.yml` roda a coleta todo dia às 7h, de graça, sem depender do computador ligado. Botão "Run workflow" na aba Actions roda na hora.
- Se a coleta falhar, o GitHub avisa por e-mail.

### 3.7 App (`web/`)
PWA em Next.js: telas de entrada, cadastro, família e leitura de notas. Prévia com dados reais publicada em https://claude.ai/artifact/9jRf6kjDgVoBB8SsjFKFhs.

## 4. Chaves e contas — o que guardar

Nunca coloque as chaves no código, no chat ou em e-mail.

| Chave / conta | Para que serve | Onde está |
|---|---|---|
| Conta GitHub `lrfeitosa-gif` | Código e coleta diária | github.com |
| Conta Supabase, projeto `cesta-basica` | Banco de dados | supabase.com |
| Senha do banco (criada com o projeto) | Acesso direto ao Postgres | Guardada por você |
| `SUPABASE_URL` | Endereço do banco | Variável do Windows + secret do GitHub |
| `SUPABASE_SERVICE_KEY` (service_role) | Gravação pelo robô. **Acesso total: nunca no app** | Variável do Windows + secret do GitHub |
| Chave anon / publishable do Supabase | Uso no app (respeita o RLS) | Painel do Supabase → API Keys |
| `ANTHROPIC_API_KEY` | Extrator de encartes | Variável do Windows + secret do GitHub |
| Conta Anthropic (console.anthropic.com) | Crédito e consumo da API | console.anthropic.com |

Para trocar uma chave: gere a nova no painel do serviço, atualize a variável do Windows (`[Environment]::SetEnvironmentVariable("NOME", "valor", "User")`) e o secret no GitHub (Settings → Secrets and variables → Actions).

## 5. Custos

- GitHub Actions: grátis no volume atual.
- Supabase: plano gratuito (500 MB). ~6 mil ofertas por dia cabem com folga por vários meses; acompanhar em Settings → Usage.
- API do Claude: cerca de 8 chamadas por dia (encartes). Acompanhar em console.anthropic.com → Usage.

## 6. Como rodar no computador

```
cd worker
.\.venv\Scripts\python.exe -m pytest -q tests                 # testes do motor
.\.venv\Scripts\python.exe rodar_coleta.py covabra roldao      # coleta de alguns mercados
.\.venv\Scripts\python.exe rodar_coleta.py --arquivo prints.json --mercado Assaí
.\.venv\Scripts\python.exe resumo_banco.py                     # quantas ofertas por mercado
```

## 7. Pendências conhecidas

- Normalizar produtos: o mesmo item sem código de barras pode aparecer com nomes diferentes (principalmente nos encartes).
- Ligar o motor de alertas ao banco quando houver histórico.
- Confirmar o preço regional de Indaiatuba no Covabra, Pague Menos e Savegnago.
- Testar a leitura de NFC-e com notas reais de Indaiatuba.
