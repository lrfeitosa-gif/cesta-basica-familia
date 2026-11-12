-- 0020: histórico de preços em lotes, para caber no limite de 8 s das chamadas da API (statement_timeout).
--
-- Em 12/11/2026 a coleta chamou consolidar_ofertas() pela API e estourou o limite: só a atualização dos
-- ~27 mil períodos de um dia levou 4,3 s, mais a inserção e a limpeza. Agora:
--   * o worker consolida e limpa mercado por mercado (13 chamadas de ~1 s em vez de uma de > 8 s);
--   * a tabela deixa espaço livre nas páginas (fillfactor 70) e o índice não inclui `ate`: esticar um período
--     vira uma atualização "HOT", sem reescrever índices.
-- consolidar_ofertas() continua existindo para rodar de uma vez pelo SQL Editor (lá não há limite de 8 s).

-- 1. Atualização barata ---------------------------------------------------------------------------------------
alter table oferta_periodo set (fillfactor = 70);
drop index if exists oferta_periodo_produto_ate;
drop index if exists oferta_periodo_mercado_ate;
create index if not exists oferta_periodo_produto on oferta_periodo (produto_id);
-- (depois desta migração: `vacuum full oferta_periodo;` reescreve as páginas com o espaço livre)

-- 2. Consolidação por mercado ----------------------------------------------------------------------------------
drop function if exists consolidar_ofertas(date);
drop function if exists consolidar_dia(date);

create or replace function consolidar_dia(p_dia date, p_mercado bigint default null) returns int
language plpgsql set search_path = public as $$
declare
  n_esticados int;
  n_novos int;
begin
  update oferta_periodo p
     set ate = p_dia
    from oferta o
   where o.valido_de = p_dia
     and (p_mercado is null or o.mercado_id = p_mercado)
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
     and (p_mercado is null or o.mercado_id = p_mercado)
     and not exists (select 1 from oferta_periodo p
                      where p.produto_id = o.produto_id and p.mercado_id = o.mercado_id and p.fonte = o.fonte
                        and p_dia between p.de and p.ate)
  on conflict (produto_id, mercado_id, fonte, de) do nothing;
  get diagnostics n_novos = row_count;

  return n_esticados + n_novos;
end;
$$;

-- Dias que ainda faltam levar para o histórico, em ordem (padrão: até ontem)
create or replace function dias_para_consolidar(p_ate date default null) returns setof date
language sql stable set search_path = public as $$
  select distinct o.valido_de
    from oferta o
   where o.valido_de <= coalesce(p_ate, timezone('America/Sao_Paulo', now())::date - 1)
     and o.valido_de > coalesce((select ultimo_dia from historico_controle where id = 1), '-infinity'::date)
   order by 1;
$$;

-- Marca o dia como consolidado depois que todos os mercados dele passaram
create or replace function marcar_consolidado(p_dia date) returns void
language sql set search_path = public as $$
  update historico_controle set ultimo_dia = greatest(coalesce(ultimo_dia, p_dia), p_dia) where id = 1;
$$;

-- De uma vez (SQL Editor): mesmo resultado de antes
create or replace function consolidar_ofertas(p_ate date default null) returns int
language plpgsql set search_path = public as $$
declare
  dia date;
  total int := 0;
begin
  perform 1 from historico_controle where id = 1 for update;
  for dia in select * from dias_para_consolidar(p_ate) loop
    total := total + consolidar_dia(dia);
    perform marcar_consolidado(dia);
  end loop;
  return total;
end;
$$;

-- 3. Limpeza por mercado -----------------------------------------------------------------------------------
drop function if exists limpar_ofertas_antigas(int);

create or replace function limpar_ofertas_antigas(p_manter_dias int default 7, p_mercado bigint default null) returns int
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
     and (p_mercado is null or o.mercado_id = p_mercado)
     and not exists (select 1 from alerta a where a.oferta_id = o.id);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Só a coleta (chave de serviço) roda estas funções
revoke all on function consolidar_dia(date, bigint), dias_para_consolidar(date), marcar_consolidado(date),
  consolidar_ofertas(date), limpar_ofertas_antigas(int, bigint) from public, anon, authenticated;
grant execute on function consolidar_dia(date, bigint), dias_para_consolidar(date), marcar_consolidado(date),
  consolidar_ofertas(date), limpar_ofertas_antigas(int, bigint) to service_role;
