# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Famílias de Indaiatuba (SP) que fazem a compra do mês ou da semana e querem gastar menos. Hoje o app está em piloto com convites; a meta é abrir para o público da cidade.

A pessoa usa principalmente **em casa, planejando**: antes de sair, decide em qual mercado vale a pena ir e o que comprar onde. Conferir preço dentro da loja é uso secundário.

Muitas dessas pessoas têm **pouca familiaridade com tecnologia** e usam **celulares simples ou internet fraca**.

## Product Purpose

Mostrar quando o preço do que a família consome está bem mais em conta nos mercados de Indaiatuba, e onde comprar.

A tarefa central é a **Compra**: montar a cesta (10 itens básicos mais os que a pessoa adicionar) e ver o melhor mercado único, a economia frente ao 2º mais barato e o total comprando cada item no mais barato. O app cumpre seu papel quando essa tela leva a uma decisão clara de onde comprar.

Telas de apoio: Ofertas (maiores descontos do dia), Comparar (busca com preço por kg/litro), Alertas (preço-alvo ou 15% abaixo do normal), Notas (leitura da NFC-e de SP), Evolução de preços e Meus dados. Há também uma área de administração (encartes e cadastro base).

## Positioning

Preços reais e locais de Indaiatuba, coletados todo dia dos sites dos mercados e dos encartes (lidos por IA), de cerca de 11 redes, inclusive as que só publicam folheto. Cada preço mostra a fonte (SITE ou ENCARTE), o preço por kg ou litro e o link de origem.

## Operating Context

- Coleta automática diária (07:00 tudo; 13:00 sites; reforço na virada do mês), por GitHub Actions.
- Os dados de "hoje" mudam ao longo do dia; o app mostra "Atualizado às…".
- PWA instalável na tela inicial; usado no celular e no computador.
- Navegadores-alvo: iOS/Safari 15+, Chrome/Android 100+, Samsung 18+, Firefox 115+.

## Capabilities and Constraints

- Só fontes abertas; sites que bloqueiam robôs não são contornados.
- **Preço de site não é garantia de preço na loja física.** O app não pode afirmar o contrário.
- Mercados de encarte só têm os itens em promoção. Na Compra, item sem preço é estimado pela média dos outros mercados e marcado com "≈"; a estimativa precisa continuar visivelmente diferente de um preço real.
- Itens da Compra e marcas escolhidas ficam só no aparelho.
- Alertas aparecem só dentro do app por enquanto; push no celular é pendência.
- Login por e-mail; login com Google desligado.
- **Nome do produto: em aberto.** Aparecem "Mercato" (título e app instalado), "fast-promotions-mk" (documentação) e "Cesta Básica Família" (repositório). Não escolher nem trocar o nome sem decisão do dono.

## Brand Commitments

- Logo existente: carrinho de compras cheio (ícones do PWA em `web/public/`).
- Tom: português direto e simples, sem jargão.

## Evidence on Hand

- Precisão medida do extrator no encarte do Assaí (80 itens): preço 100%, preço "de" 99%, embalagem 96% (`worker/coleta/comparar_gabarito.py`, `encartes/`).
- Volume: cerca de 16 mil ofertas por dia.
- Não há depoimentos, números de usuários nem estudos de economia média. Não inventar.

## Product Principles

1. **A decisão de onde comprar vem primeiro.** A Compra é o centro; as outras telas alimentam essa decisão.
2. **Honestidade sobre o preço.** Sempre mostrar a fonte, a hora da atualização e quando um valor é estimado; nunca prometer o preço da loja física.
3. **Simples para quem não é da tecnologia.** Palavras do dia a dia, poucos passos, nada que dependa de saber usar apps.
4. **Leve em qualquer aparelho.** Funcionar bem em celular simples e internet fraca.
5. **Privacidade mínima por padrão.** Só e-mail na conta; sem CPF, endereço ou pagamento.

## Accessibility & Inclusion

- Público com pouca familiaridade com tecnologia: textos claros, ações óbvias, alvos de toque generosos.
- Celulares simples e conexões lentas: páginas leves, carregamento rápido, uso razoável sem rede estável.
- Modo claro e escuro já existem e devem ser mantidos.
