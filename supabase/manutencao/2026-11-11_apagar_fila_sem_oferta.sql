-- Limpeza da fila do cadastro base (11/11/2026): apaga os produtos SEM item base que não tiveram oferta no dia mais
-- recente da coleta dos sites (sem estoque no dia ou de encartes vencidos), junto com o histórico de preços deles.
-- Se algum voltar a ser coletado, é recriado (sem histórico) e volta para a fila.
-- Produtos usados por famílias (alertas, notas fiscais, lista de interesse) ficam de fora por segurança.
-- Rode inteiro no SQL Editor: é tudo ou nada. Rode ANTES da coleta das 7h de 12/11 para valer a mesma lista.
begin;

create temp table apagar on commit drop as
select p.id
from produto p
where coalesce(p.item_base_origem, 'sem') = 'sem'
  and not exists (select 1 from oferta o where o.produto_id = p.id
                    and o.valido_de = (select max(valido_de) from oferta where fonte = 'ecommerce'))
  and not exists (select 1 from item_comprado i where i.produto_id = p.id)
  and not exists (select 1 from item_interesse i where i.produto_id = p.id)
  and not exists (select 1 from alerta a where a.produto_id = p.id)
  and not exists (select 1 from alerta a join oferta o on o.id = a.oferta_id where o.produto_id = p.id);

-- conferência: quantos produtos e preços saem (esperado em 11/11: 1223 produtos e 5842 preços)
select (select count(*) from apagar) as produtos,
       (select count(*) from oferta where produto_id in (select id from apagar)) as precos;

delete from oferta where produto_id in (select id from apagar);    -- avisos de esgotado saem em cascata
delete from produto where id in (select id from apagar);

commit;
