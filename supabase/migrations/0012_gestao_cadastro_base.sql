-- Gestão do cadastro base no painel de administração.
-- "fora" = produto que não é da cesta (salgadinho, esmalte...): sai da fila de revisão.
alter table produto drop constraint if exists produto_item_base_origem_check;
alter table produto add constraint produto_item_base_origem_check check (item_base_origem in ('regra','admin','sem','fora'));

-- Liga produtos a um item (p_item null = sem item). p_origem 'admin' e 'fora' são decisões manuais e valem
-- sempre; 'regra' e 'sem' (aplicar regras) nunca mexem no que foi decidido no admin.
create or replace function admin_ligar(p_ids bigint[], p_item bigint, p_origem text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not eh_admin() then raise exception 'sem permissão'; end if;
  if p_origem not in ('regra','admin','sem','fora') then raise exception 'origem inválida'; end if;
  update produto set item_base_id = case when p_origem = 'fora' then null else p_item end, item_base_origem = p_origem
  where id = any(p_ids) and (p_origem in ('admin','fora') or coalesce(item_base_origem, '') not in ('admin','fora'));
  get diagnostics n = row_count;
  return n;
end $$;

-- Cria ou altera um item base.
create or replace function admin_item_salvar(p_id bigint, p_termo text, p_nome text, p_exclusoes text[], p_ativo boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not eh_admin() then raise exception 'sem permissão'; end if;
  if p_id is null then
    insert into item_base (termo, nome, exclusoes, ativo) values (lower(trim(p_termo)), trim(p_nome), coalesce(p_exclusoes, '{}'), coalesce(p_ativo, true))
    returning id into v;
  else
    update item_base set nome = trim(p_nome), exclusoes = coalesce(p_exclusoes, '{}'), ativo = coalesce(p_ativo, true)
    where id = p_id returning id into v;
  end if;
  return v;
end $$;

-- Quantos produtos em cada item e em cada situação.
create or replace function admin_catalogo_resumo() returns json
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'sem permissão'; end if;
  return json_build_object(
    'origens', (select coalesce(json_object_agg(coalesce(item_base_origem, 'pendente'), n), '{}') from
                 (select item_base_origem, count(*) n from produto group by 1) x),
    'itens', (select coalesce(json_object_agg(item_base_id, n), '{}') from
                 (select item_base_id, count(*) n from produto where item_base_id is not null group by 1) y));
end $$;

revoke all on function admin_ligar(bigint[], bigint, text), admin_item_salvar(bigint, text, text, text[], boolean), admin_catalogo_resumo() from public;
grant execute on function admin_ligar(bigint[], bigint, text), admin_item_salvar(bigint, text, text, text[], boolean), admin_catalogo_resumo() to authenticated;
