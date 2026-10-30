-- Histórico de preços: curva diária por produto e referência para os alertas.
-- Cada coleta grava uma oferta por produto, mercado e dia; estas visões leem esse histórico.

-- Curva de preço: por produto e dia, menor, média e maior preço entre os mercados.
create or replace view preco_diario as
select o.produto_id,
       o.valido_de                         as dia,
       count(distinct o.mercado_id)        as mercados,
       min(o.preco)                        as menor,
       round(avg(o.preco), 2)              as media,
       max(o.preco)                        as maior
from oferta o
group by o.produto_id, o.valido_de;

-- Preço do produto em cada mercado, dia a dia (para desenhar uma linha por mercado).
create or replace view preco_diario_mercado as
select o.produto_id, o.valido_de as dia, m.rede as mercado, min(o.preco) as preco
from oferta o join mercado m on m.id = o.mercado_id
group by o.produto_id, o.valido_de, m.rede;

-- Referência para o gatilho de alerta: substitui a visão preco_referencia da 0001
-- usando a média dos preços médios diários (um dia com muitos mercados não pesa mais).
create or replace view preco_referencia as
select produto_id,
       round(avg(media) filter (where dia >= current_date - 60), 2) as media_60d,
       min(menor) filter (where dia >= current_date - 90)           as minimo_90d,
       count(*) filter (where dia >= current_date - 60)             as dias_com_preco_60d
from preco_diario
group by produto_id;
