-- Evolução de preços pelo item genérico do cadastro base (ex.: "Café torrado e moído"), e não por um produto
-- comercial: junta todas as marcas e tamanhos ligados ao item e compara pelo preço do quilo, litro ou unidade.
-- Devolve, por dia e mercado, o menor preço por unidade de medida (só a medida mais comum do item).
create or replace function evolucao_item_base(p_item bigint, p_dias int)
returns table (dia date, mercado text, preco_un numeric, unidade text)
language sql stable set search_path = public as $$
  with hoje as (select timezone('America/Sao_Paulo', now())::date as d),
  precos as (
    select o.valido_de as dia, m.rede as mercado,
      o.preco / case when p.unidade in ('g', 'ml') then p.quantidade / 1000 else p.quantidade end as preco_un,
      case p.unidade when 'g' then 'kg' when 'ml' then 'l' else p.unidade end as unidade
    from produto p
    join oferta o on o.produto_id = p.id
    join mercado m on m.id = o.mercado_id
    cross join hoje
    where p.item_base_id = p_item and p.quantidade > 0 and o.preco > 0
      and o.valido_de > hoje.d - least(greatest(coalesce(p_dias, 90), 1), 366)
      and o.valido_de <= hoje.d
  ),
  medida as (select unidade from precos group by unidade order by count(*) desc limit 1)
  select dia, mercado, round(min(preco_un), 2), precos.unidade
  from precos join medida using (unidade)
  group by dia, mercado, precos.unidade
  order by dia, mercado;
$$;

revoke all on function evolucao_item_base(bigint, int) from public;
grant execute on function evolucao_item_base(bigint, int) to authenticated;
