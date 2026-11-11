-- 0019: histórico de preços por período, para o banco caber no plano gratuito do Supabase.
--
-- Antes: uma linha em `oferta` por produto, mercado e dia (cerca de 30 mil por dia, 88% iguais ao dia anterior).
-- Agora:
--   * `oferta` continua recebendo a coleta do dia como sempre (as telas do dia não mudam), mas guarda só
--     os últimos dias (limpar_ofertas_antigas).
--   * `oferta_periodo` guarda o histórico: uma linha por período de preço. Se o produto, no mesmo mercado,
--     tem o mesmo preço do dia anterior, nada é gravado: o período só é esticado (ate = dia).
--   * `oferta_por_dia` junta os dois para quem precisa de um preço por dia (curva de preço, evolução).
--
-- Rotina diária (worker/historico.py, depois da coleta):
--   select consolidar_ofertas();          -- leva para o histórico todos os dias até ontem
--   select limpar_ofertas_antigas(7);     -- apaga de `oferta` o que já está no histórico e tem mais de 7 dias
-- Na primeira vez, consolidar_ofertas() processa todo o histórico desde 29/10/2026.

-- 1. Histórico por período -------------------------------------------------------------------------------
create table if not exists oferta_periodo (
  id bigint generated always as identity primary key,
  produto_id bigint not null references produto(id) on delete cascade,
  mercado_id bigint not null references mercado(id),
  fonte text not null,
  preco numeric(10,2) not null,
  preco_de numeric(10,2),
  condicao text,
  de date not null,
  ate date not null,
  check (ate >= de),
  unique (produto_id, mercado_id, fonte, de)
);
create index if not exists oferta_periodo_produto_ate on oferta_periodo (produto_id, ate);
create index if not exists oferta_periodo_mercado_ate on oferta_periodo (mercado_id, ate);

alter table oferta_periodo enable row level security;
drop policy if exists leitura on oferta_periodo;
create policy leitura on oferta_periodo for select using (true);   -- igual a `oferta`: preços são públicos
grant select on oferta_periodo to anon, authenticated;

-- Até que dia o histórico já foi consolidado (uma linha só)
create table if not exists historico_controle (
  id int primary key default 1 check (id = 1),
  ultimo_dia date
);
insert into historico_controle default values on conflict do nothing;
alter table historico_controle enable row level security;
drop policy if exists leitura on historico_controle;
create policy leitura on historico_controle for select using (true);
grant select on historico_controle to anon, authenticated;

-- 2. Consolidação de um dia ------------------------------------------------------------------------------
-- Mesmo preço, preço "de" e condição do dia anterior: estica o período. Caso contrário: período novo.
-- Rodar dias em ordem crescente. Rodar o mesmo dia de novo não muda nada.
create or replace function consolidar_dia(p_dia date) returns int
language plpgsql set search_path = public as $$
declare
  n_esticados int;
  n_novos int;
begin
  update oferta_periodo p
     set ate = p_dia
    from oferta o
   where o.valido_de = p_dia
     and p.produto_id = o.produto_id and p.mercado_id = o.mercado_id and p.fonte = o.fonte
     and p.ate = p_dia - 1
     and p.preco = o.preco
     and p.preco_de is not distinct from o.preco_de
     and p.condicao is not distinct from o.condicao;
  get diagnostics n_esticados = row_count;

  insert into oferta_periodo (produto_id, mercado_id, fonte, preco, preco_de, condicao, de, ate)
  select o.produto_id, o.mercado_id, o.fonte, o.preco, o.preco_de, o.condicao, p_dia, p_dia
    from oferta o
   where o.valido_de = p_dia
     and not exists (select 1 from oferta_periodo p
                      where p.produto_id = o.produto_id and p.mercado_id = o.mercado_id and p.fonte = o.fonte
                        and p_dia between p.de and p.ate)
  on conflict (produto_id, mercado_id, fonte, de) do nothing;
  get diagnostics n_novos = row_count;

  return n_esticados + n_novos;
end;
$$;

-- 3. Consolida todos os dias pendentes até p_ate (padrão: ontem; hoje ainda pode ter a coleta das 13h) --
create or replace function consolidar_ofertas(p_ate date default null) returns int
language plpgsql set search_path = public as $$
declare
  limite date := coalesce(p_ate, timezone('America/Sao_Paulo', now())::date - 1);
  dia date;
  total int := 0;
begin
  perform 1 from historico_controle where id = 1 for update;   -- nunca duas consolidações ao mesmo tempo
  for dia in
    select distinct o.valido_de from oferta o
     where o.valido_de <= limite
       and o.valido_de > coalesce((select ultimo_dia from historico_controle where id = 1), '-infinity'::date)
     order by 1
  loop
    total := total + consolidar_dia(dia);
    update historico_controle set ultimo_dia = dia where id = 1;
  end loop;
  return total;
end;
$$;

-- 4. Limpeza de `oferta` -----------------------------------------------------------------------------------
-- Apaga só o que já está no histórico, tem mais de p_manter_dias e não é citado por um alerta enviado.
-- Avisos de esgotado dessas ofertas antigas saem junto (já não valiam: eram do dia).
create or replace function limpar_ofertas_antigas(p_manter_dias int default 7) returns int
language plpgsql set search_path = public as $$
declare
  hoje date := timezone('America/Sao_Paulo', now())::date;
  consolidado date := (select ultimo_dia from historico_controle where id = 1);
  n int;
begin
  if consolidado is null then
    return 0;
  end if;
  delete from oferta o
   where o.valido_de < hoje - greatest(p_manter_dias, 3)
     and o.valido_de <= consolidado
     and not exists (select 1 from alerta a where a.oferta_id = o.id);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Só a coleta (chave de serviço) roda estas funções
revoke all on function consolidar_dia(date), consolidar_ofertas(date), limpar_ofertas_antigas(int) from public, anon, authenticated;
grant execute on function consolidar_dia(date), consolidar_ofertas(date), limpar_ofertas_antigas(int) to service_role;

-- 5. Um preço por dia, juntando histórico e dias ainda não consolidados ---------------------------------
create or replace view oferta_por_dia with (security_invoker = on) as
select p.produto_id, p.mercado_id, p.fonte, d::date as dia, p.preco, p.preco_de, p.condicao
  from oferta_periodo p
 cross join lateral generate_series(p.de, p.ate, interval '1 day') d
union all
select o.produto_id, o.mercado_id, o.fonte, o.valido_de, o.preco, o.preco_de, o.condicao
  from oferta o
 where o.valido_de > coalesce((select ultimo_dia from historico_controle where id = 1), '-infinity'::date);
grant select on oferta_por_dia to anon, authenticated;

-- 6. Curva de preço passa a ler o histórico (mesmas colunas de antes) -----------------------------------
create or replace view preco_diario with (security_invoker = on) as
select o.produto_id,
       o.dia,
       count(distinct o.mercado_id) as mercados,
       min(o.preco)                 as menor,
       round(avg(o.preco), 2)       as media,
       max(o.preco)                 as maior
from oferta_por_dia o
group by o.produto_id, o.dia;

create or replace view preco_diario_mercado with (security_invoker = on) as
select o.produto_id, o.dia, m.rede as mercado, min(o.preco) as preco
from oferta_por_dia o join mercado m on m.id = o.mercado_id
group by o.produto_id, o.dia, m.rede;

-- 7. Evolução pelo item do cadastro base passa a ler o histórico ----------------------------------------
create or replace function evolucao_item_base(p_item bigint, p_dias int)
returns table (dia date, mercado text, preco_un numeric, unidade text)
language sql stable set search_path = public as $$
  with hoje as (select timezone('America/Sao_Paulo', now())::date as d),
  janela as (select hoje.d - least(greatest(coalesce(p_dias, 90), 1), 366) as desde, hoje.d as ate from hoje),
  consolidado as (select coalesce(ultimo_dia, '-infinity'::date) as d from historico_controle where id = 1),
  dias as (
    -- histórico: só os períodos que tocam a janela, abertos em dias dentro dela
    select d::date as dia, p.produto_id, p.mercado_id, p.preco
      from oferta_periodo p
      join produto pr on pr.id = p.produto_id and pr.item_base_id = p_item
      cross join janela
      cross join lateral generate_series(greatest(p.de, janela.desde + 1), least(p.ate, janela.ate), interval '1 day') d
     where p.ate > janela.desde and p.de <= janela.ate
    union all
    -- dias ainda não consolidados
    select o.valido_de, o.produto_id, o.mercado_id, o.preco
      from oferta o
      join produto pr on pr.id = o.produto_id and pr.item_base_id = p_item
      cross join janela cross join consolidado
     where o.valido_de > consolidado.d and o.valido_de > janela.desde and o.valido_de <= janela.ate
  ),
  precos as (
    select x.dia, m.rede as mercado,
      x.preco / case when p.unidade in ('g', 'ml') then p.quantidade / 1000 else p.quantidade end as preco_un,
      case p.unidade when 'g' then 'kg' when 'ml' then 'l' else p.unidade end as unidade
    from dias x
    join produto p on p.id = x.produto_id
    join mercado m on m.id = x.mercado_id
    where p.quantidade > 0 and x.preco > 0
  ),
  medida as (select unidade from precos group by unidade order by count(*) desc limit 1)
  select dia, mercado, round(min(preco_un), 2), precos.unidade
  from precos join medida using (unidade)
  group by dia, mercado, precos.unidade
  order by dia, mercado;
$$;

revoke all on function evolucao_item_base(bigint, int) from public, anon;
grant execute on function evolucao_item_base(bigint, int) to authenticated;
