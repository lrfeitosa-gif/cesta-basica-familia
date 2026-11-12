-- 0021: funções do piloto (spec "Divulgação assistida", requisitos R1, R2, R3 e R7).
-- Pode rodar mais de uma vez.

-- 1. Novos eventos de uso
--    cesta_montada: a família pôs o 1º item na Cesta (a Cesta fica só no aparelho; o evento é o que o painel enxerga)
--    primeiros_passos: card de primeiros passos fechado ('fechou') ou com as 3 ações feitas ('completou')
alter table evento drop constraint if exists evento_tipo_check;
alter table evento add constraint evento_tipo_check check (tipo in (
  'login_ok','login_erro','cadastro_inicio','cadastro_erro','cadastro_ok','tela','erro_app',
  'cesta_montada','primeiros_passos'));

-- 2. Caixa de opiniões (R7): texto livre + tela + data. Cada família vê só as suas; a administradora lê todas.
create table if not exists opiniao (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto text not null check (length(trim(texto)) between 3 and 1000),
  tela text check (length(tela) <= 100),
  criado_em timestamptz not null default now()
);
create index if not exists opiniao_data on opiniao (criado_em desc);
alter table opiniao enable row level security;
drop policy if exists envia_a_sua on opiniao;
create policy envia_a_sua on opiniao for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists le_a_sua_ou_admin on opiniao;
create policy le_a_sua_ou_admin on opiniao for select to authenticated
  using (user_id = (select auth.uid()) or eh_admin());
revoke all on opiniao from anon;

-- 3. admin_usuarios ganha "cesta" (montou a Cesta) e "opinioes", para R1 (famílias ativas por convite) e R3 (precisa de ajuda)
drop function if exists admin_usuarios();
create function admin_usuarios()
returns table(id uuid, email text, criado_em timestamptz, confirmado_em timestamptz, ultimo_login timestamptz, convite text,
  notas int, itens_nota int, alertas int, enderecos int, cesta int, opinioes int, bytes bigint)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not eh_admin() then raise exception 'sem permissão'; end if;
  return query
  select u.id, u.email::text, u.created_at, u.email_confirmed_at, u.last_sign_in_at, upper(trim(u.raw_user_meta_data->>'convite')),
    (select count(*)::int from compra c where c.familia_id = u.id),
    (select count(*)::int from item_comprado i join compra c on c.id = i.compra_id where c.familia_id = u.id),
    (select count(*)::int from item_interesse a where a.familia_id = u.id),
    (select count(*)::int from regiao_interesse r where r.familia_id = u.id),
    (select count(*)::int from evento e where e.user_id = u.id and e.tipo = 'cesta_montada'),
    (select count(*)::int from opiniao o where o.user_id = u.id),
    coalesce((select sum(pg_column_size(c.*)) from compra c where c.familia_id = u.id), 0)
    + coalesce((select sum(pg_column_size(i.*)) from item_comprado i join compra c on c.id = i.compra_id where c.familia_id = u.id), 0)
    + coalesce((select sum(pg_column_size(a.*)) from item_interesse a where a.familia_id = u.id), 0)
    + coalesce((select sum(pg_column_size(r.*)) from regiao_interesse r where r.familia_id = u.id), 0)
    + coalesce((select sum(pg_column_size(e.*)) from evento e where e.user_id = u.id), 0)
    + coalesce((select sum(pg_column_size(o.*)) from opiniao o where o.user_id = u.id), 0)
  from auth.users u order by u.created_at;
end $$;
revoke all on function admin_usuarios() from public, anon;
grant execute on function admin_usuarios() to authenticated;
