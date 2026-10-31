# fast-promotions-mk — Documentação do projeto (Parte I)

Situação em 30/10/2026. O app começou como "Cesta Básica Família" e foi renomeado para **fast-promotions-mk** em 30/10/2026.

Este documento resume o que foi construído, como as peças se conectam, os requisitos técnicos, as chaves que precisam ser guardadas e o que falta.

---

## 1. O que o app faz hoje

O app ajuda a família a comprar quando o preço está bem mais em conta nos mercados de Indaiatuba.

- **Ofertas:** maiores descontos do dia sobre o preço normal de cada mercado, com filtro por mercado e busca no topo.
- **Comparar:** busca por palavras com filtro composto (`café pilão 500g`, `café -cápsula`), ordenada pelo preço por kg ou litro.
- **Compra:** cesta com 10 itens básicos, mais os itens que a pessoa adicionar. Mostra o melhor mercado único, a economia frente ao 2º mais barato e o total comprando cada item no mais barato. Permite fixar a marca de cada item.
- **Alertas:** a pessoa cadastra produto, marca (opcional) e preço-alvo (opcional). O alerta dispara quando o menor preço do dia fica abaixo do alvo ou 15% abaixo do preço normal. Por enquanto aparece só dentro do app.
- **Notas:** leitura do QR Code da NFC-e de SP (câmera ou link colado). Guarda os itens comprados, sem CPF.
- **Meus dados:** mostra o que é guardado, exporta um arquivo .json e exclui a conta.

Cada preço mostra a fonte (**SITE** ou **ENCARTE**), o preço por kg ou litro e o link para o site do mercado ou para o encarte.

---

## 2. Visão geral da arquitetura

```
Sites dos mercados (API VTEX) ─┐
Encartes no site (PDF/JPG) ────┼─► Coletores Python ─► Extrator Claude (só encartes) ─► Supabase (Postgres)
Prints enviados (Assaí, PdA) ──┘          ▲                                                  │
                                          │                                                  ▼
                       GitHub Actions (agenda de coletas)                   App web (Next.js) na Vercel
                                                                            celular e computador
```

---

## 3. Fontes de preço por mercado

| Mercado | Fonte | Como coletamos | Observação |
|---|---|---|---|
| Atacadão | Site | API pública VTEX | Loja online cobre parte dos itens; preço de atacado não aparece |
| Covabra | Site | API pública VTEX | |
| Pague Menos | Site | API pública VTEX | Muda preços ao longo do dia, principalmente na virada do mês |
| Savegnago | Site | API pública VTEX | |
| São Vicente | Site | Busca pública do site (Salesforce Commerce Cloud), bloco `search-card-grid` | Sem robots.txt; até 60 produtos por termo |
| Goodbom | Site, loja de Indaiatuba | Páginas de departamento (Mercafacil/Next.js) | robots.txt proíbe só /busca; preço do site, oferta e Clube Goodbom |
| Roldão | Encarte | Imagens no site → extrator | Encarte "ITU-" é de outra cidade e é ignorado |
| Sumerbol | Encarte | PDF no site → extrator | |
| Assaí | Encarte | Prints enviados → extrator | Site bloqueia leitura automática |

**Regras adotadas**
- Só usamos fontes abertas. Sites que bloqueiam robôs não são contornados.
- **Preço de site não é garantia de preço da loja física.** Os 4 sites devolvem o mesmo preço para qualquer CEP (um único vendedor central). As notas fiscais de Indaiatuba são o caminho para medir a diferença.
- Mercados de encarte entram só com os itens em promoção. Na Compra, item sem preço é estimado pela média dos outros mercados e aparece com "≈".

---

## 4. Agenda de coleta (GitHub Actions)

| Quando (Brasília) | O que coleta | Custo |
|---|---|---|
| 07:00, todo dia | Tudo: sites e encartes | ~8 chamadas à API do Claude |
| 13:00, todo dia | Só sites | Grátis |
| Dias 28 a 31 e 1º e 2, às 10h, 17h e 20h | Só sites (ofertas de virada de mês) | Grátis |
| Sob demanda | Botão **Run workflow** na aba Actions (padrão: "sites"; vazio = tudo) | Conforme a escolha |

- Os sites são buscados por **~95 termos** (mercearia, laticínios, frios, carnes, hortifruti, bebidas, limpeza, higiene, pet), até 100 produtos por termo.
- Uma coleta repetida no mesmo dia **substitui o preço** pelo mais recente e atualiza o horário "Atualizado às…".
- Prints de encarte são gravados para **todos os dias da validade** (até 14 dias).
- Duas coletas nunca rodam ao mesmo tempo. Tempo máximo de uma coleta: 120 minutos.

---

## 5. Componentes

### 5.1 Coletores (`worker/coleta/`)
- `vtex.py`: busca nas APIs públicas dos mercados em VTEX (preço, preço "de", EAN, estoque, link). Tenta de novo em quedas de conexão; para quando a loja falha em páginas profundas.
- `encartes.py`: acha os encartes nos sites do Sumerbol e do Roldão e envia ao extrator. Fica com a maior versão de cada imagem.
- `extrator.py`: envia imagem ou PDF ao Claude Opus 5.5 com visão e recebe as ofertas estruturadas (produto, marca, embalagem, preço, preço "de", condição, validade). Usa streaming para PDFs longos.
- `comparar_gabarito.py`: mede a precisão do extrator contra uma transcrição manual. No encarte do Assaí (80 itens): preço 100%, preço "de" 99%, embalagem 96%.

### 5.2 Orquestração (`worker/`)
- `rodar_coleta.py`: roda os coletores, normaliza (chave do produto = EAN ou nome+marca+embalagem) e grava. Um mercado com falha não derruba os outros. Prints entram com `--arquivo`.
- `resumo_banco.py`: ofertas por mercado e tamanho do catálogo.
- `exportar_ofertas.py`: exporta as ofertas do dia (usado na prévia antiga).

### 5.3 Motor de regras (`worker/motor/`)
- `regras.py`: cruzamento oferta × interesse, gatilho de oportunidade, melhor mercado e dupla, quanto estocar, aviso de compra repetida. 8 testes automatizados. Ainda não ligado ao banco.
- `nfce.py`: leitura da NFC-e (versão Python; o app usa a versão em `web/lib/nfce.ts`).

### 5.4 Banco de dados (Supabase / Postgres, projeto `cesta-basica`, região São Paulo)

| Migração | Conteúdo | Rodada? |
|---|---|---|
| `0001_schema.sql` | Tabelas: família, região, mercado, produto, oferta, item de interesse, compra, item comprado, alerta, push. RLS: cada família vê só os seus dados; produtos, mercados e ofertas são públicos para leitura | Sim |
| `0002_coleta.sql` | Chave única de produto, preço "de", condição, link, cadastro dos mercados (Pão de Açúcar removido em 31/10: o site bloqueia leitura automática e não publica encarte), uma oferta por produto/mercado/dia/fonte | Sim |
| `0003_curva_preco.sql` | Visões de histórico: preço diário (menor/média/maior), preço por mercado por dia, referência de 60/90 dias | Sim |
| `0004_alerta_por_termo.sql` | Alerta por palavras (`termo`), função `garantir_familia()` | Sim |
| `0005_excluir_conta.sql` | Função `excluir_conta()` para a pessoa apagar a própria conta | Sim |
| `0006_esgotado_e_sugestao.sql` | Avisos de "Acabou na loja" (valem só para a oferta do dia) e indicações de mercado novo | Sim |

Volume: cerca de 16 mil ofertas por dia com a lista ampliada. O plano gratuito (500 MB) deve durar uns 2 meses; acompanhar em Supabase → Settings → Usage.

### 5.5 App web (`web/`, Next.js na Vercel)
- Endereço: **https://cesta-basica-familia.vercel.app** (pode ser trocado em Vercel → Settings → Domains).
- Telas públicas: início, criar conta, entrar, termos, privacidade.
- Área logada (abas): Ofertas, Comparar, Compra, Alertas, Notas; menu da conta com Meus dados e Sair.
- `app/api/nota/route.ts`: lê a NFC-e no portal da Sefaz-SP (só esse domínio) e grava compra e itens com o token da pessoa (RLS).
- PWA: instalável na tela inicial, ícones do carrinho, nome curto "fast-promo".
- Visual: logo do carrinho cheio no topo, como marca-d'água no fundo e nos ícones; etiqueta amarela de preço; modo claro e escuro.

### 5.6 Repositório (GitHub, privado)
`lrfeitosa-gif/cesta-basica-familia`. Cada envio ao ramo `main` publica o app na Vercel automaticamente.

---

## 6. Requisitos técnicos

### 6.1 Serviços e contas
| Serviço | Uso | Plano |
|---|---|---|
| GitHub (`lrfeitosa-gif`) | Código e agenda de coletas (Actions) | Gratuito |
| Supabase (`cesta-basica`) | Banco Postgres, login, regras de acesso | Gratuito (500 MB) |
| Vercel | Hospedagem do app | Gratuito (Hobby) |
| Anthropic (console.anthropic.com) | API do Claude para encartes | Pago por uso (crédito pré-pago) |

### 6.2 Tecnologias e versões
| Parte | Tecnologia | Versão |
|---|---|---|
| Coleta | Python | 3.12 |
| | anthropic (SDK) / modelo | 2.3.0 / `claude-opus-5-5` |
| | httpx, pydantic, beautifulsoup4, supabase-py | 0.27.2, 2.9.2, 4.12.3, 2.9.1 |
| | pytest | 8.3.3 |
| App | Node.js | 22.12 |
| | Next.js, React, TypeScript | 14.2.15, 18.3.1, 5.6.3 |
| | @supabase/supabase-js | 2.45.4 |
| | @yudiel/react-qr-scanner, cheerio | 2.0.8, 1.0.0 |
| Banco | PostgreSQL (Supabase) | gerenciado |

### 6.3 Configurações importantes
- **Supabase → Authentication → Sign In / Providers → Email:** "Confirm email" desligado no piloto (o e-mail gratuito do Supabase manda só 2 a 3 por hora).
- **Supabase → Authentication → URL Configuration:** Site URL e Redirect URLs com o endereço da Vercel.
- **Login com Google:** desligado. Para ativar, configurar o provedor no Supabase e criar `NEXT_PUBLIC_LOGIN_GOOGLE=1` na Vercel.

### 6.4 Computador de desenvolvimento (Windows)
- Python 3.12 em `%LOCALAPPDATA%\Programs\Python\Python312`, ambiente em `worker\.venv`.
- Node.js portátil em `%LOCALAPPDATA%\nodejs-portable`; GitHub CLI portátil em `%LOCALAPPDATA%\gh-cli`; Git em `C:\Program Files\Git`.

---

## 7. Chaves e contas — o que guardar

Nunca coloque chaves no código, no chat ou em e-mail.

| Chave | Para que serve | Onde está |
|---|---|---|
| Senha do banco (criada com o projeto) | Acesso direto ao Postgres | Guardada por você |
| `SUPABASE_URL` | Endereço do banco | Variável do Windows + secret do GitHub |
| `SUPABASE_SERVICE_KEY` (service_role) | Gravação pelo robô. **Acesso total: nunca no app** | Variável do Windows + secret do GitHub |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Uso no app (respeita o RLS) | Variáveis da Vercel |
| `ANTHROPIC_API_KEY` | Extrator de encartes | Variável do Windows + secret do GitHub |

Para trocar uma chave: gere a nova no painel do serviço, atualize a variável do Windows (`[Environment]::SetEnvironmentVariable("NOME", "valor", "User")`), o secret do GitHub (Settings → Secrets and variables → Actions) e, se for do app, a variável da Vercel (Settings → Environment Variables), depois publique de novo.

---

## 8. Privacidade

- A conta guarda só o e-mail. Sem CPF, nome, endereço ou pagamento.
- Das notas: loja, data, total e itens. CPF e pagamento da nota nunca são gravados.
- Itens da Compra e marcas escolhidas ficam só no aparelho.
- Meus dados: exportação em .json e exclusão da conta.
- Termos e política são rascunhos do piloto; revisar com um profissional antes de abrir ao público.

---

## 9. Como rodar no computador

```
cd worker
.\.venv\Scripts\python.exe -m pytest -q tests                              # testes do motor
.\.venv\Scripts\python.exe rodar_coleta.py covabra roldao                   # coleta de alguns mercados
.\.venv\Scripts\python.exe -m coleta.extrator encarte.jpg --mercado Assaí --saida prints.json
.\.venv\Scripts\python.exe rodar_coleta.py --arquivo prints.json --mercado Assaí
.\.venv\Scripts\python.exe resumo_banco.py                                  # ofertas por mercado
```
As variáveis `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` e `ANTHROPIC_API_KEY` precisam estar definidas.

---

## 10. Pendências e próximos passos

**Produto**
- Notificação no celular (push) para os alertas, depois da coleta.
- Testar a leitura de NFC-e com notas reais de Indaiatuba e usar as notas para comparar preço do site × loja física.
- Envio dos prints do Assaí pelo próprio app.
- Login com Google e e-mail próprio (Resend + domínio) antes de abrir ao público.

**Dados**
- Normalizar o catálogo: juntar o mesmo produto escrito de formas diferentes (principalmente nos encartes).
- Ligar o motor de regras ao histórico (média de 60 dias) quando houver algumas semanas de dados.
- Rotina de limpeza do histórico antes de chegar ao limite do Supabase gratuito.
