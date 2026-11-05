-- Teste fechado com convites + painel de administração.
-- Depois de rodar, torne-se administradora (troque o e-mail se precisar):
--   insert into administrador (user_id) select id from auth.users where email = 'lrfeitosa@gmail.com';

-- 1. Convites: o cadastro só passa com um código válido e com vagas.
create table convite (
  codigo text primary key,
  descricao text,                       -- para quem é o convite (ex.: "grupo da escola")
  usos_max int not null default 1,
  usos int not null default 0,
  valido_ate date,
  criado_em timestamptz not null default now()
);
alter table convite enable row level security;   -- sem políticas: ninguém lê pela API, só o gatilho e o admin

-- Limite geral do piloto (contas no total). Mude aqui se quiser abrir mais vagas.
create table config_piloto (id int primary key default 1 check (id = 1), max_contas int not null default 30);
insert into config_piloto default values;
alter table config_piloto enable row level security;

create or replace function validar_convite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c text := upper(trim(coalesce(new.raw_user_meta_data->>'convite', '')));
  ok int;
begin
  if (select count(*) from auth.users) >= (select max_contas from config_piloto) then
    raise exception 'PILOTO_LOTADO';
  end if;
  update convite set usos = usos + 1
   where codigo = c and usos < usos_max and (valido_ate is null or valido_ate >= current_date);
  get diagnostics ok = row_count;
  if ok = 0 then raise exception 'CONVITE_INVALIDO'; end if;
  return new;
end $$;
create trigger convite_no_cadastro before insert on auth.users
  for each row execute function validar_convite();

-- A tela de cadastro confere o código antes de enviar (sem revelar a lista de convites).
create or replace function convite_valido(p_codigo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from convite where codigo = upper(trim(p_codigo)) and usos < usos_max
                 and (valido_ate is null or valido_ate >= current_date))
     and (select count(*) from auth.users) < (select max_contas from config_piloto);
$$;
grant execute on function convite_valido(text) to anon, authenticated;

-- Contas que já existem antes dos convites continuam valendo (o gatilho só olha cadastros novos).

-- 2. Administradores.
create table administrador (user_id uuid primary key references auth.users(id) on delete cascade);
alter table administrador enable row level security;
create policy propria on administrador for select using (user_id = auth.uid());
create or replace function eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from administrador where user_id = auth.uid());
$$;

-- 3. Eventos de uso (para o painel): entradas, erros de login, desistências no cadastro, erros de tela.
-- Guardamos o e-mail só como domínio (gmail.com) nas tentativas sem conta.
create table evento (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('login_ok','login_erro','cadastro_inicio','cadastro_erro','cadastro_ok','tela','erro_app')),
  detalhe text check (length(detalhe) <= 300),
  criado_em timestamptz not null default now()
);
create index evento_data on evento (criado_em desc);
alter table evento enable row level security;
create policy registrar on evento for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy admin_le on evento for select using (eh_admin());

-- 4. Funções do painel (só para administradores).
create or replace function admin_usuarios()
returns table (id uuid, email text, criado_em timestamptz, confirmado_em timestamptz, ultimo_login timestamptz,
               convite text, notas int, itens_nota int, alertas int, enderecos int, bytes bigint)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not eh_admin() then raise exception 'sem permissão'; end if;
  return query
  select u.id, u.email::text, u.created_at, u.email_confirmed_at, u.last_sign_in_at, u.raw_user_meta_data->>'convite',
    (select count(*)::int from compra c where c.familia_id = u.id),
    (select count(*)::int from item_comprado i join compra c on c.id = i.compra_id where c.familia_id = u.id),
    (select count(*)::int from item_interesse a where a.familia_id = u.id),
    (select count(*)::int from regiao_interesse r where r.familia_id = u.id),
    coalesce((select sum(pg_column_size(c.*)) from compra c where c.familia_id = u.id), 0)
    + coalesce((select sum(pg_column_size(i.*)) from item_comprado i join compra c on c.id = i.compra_id where c.familia_id = u.id), 0)
    + coalesce((select sum(pg_column_size(a.*)) from item_interesse a where a.familia_id = u.id), 0)
    + coalesce((select sum(pg_column_size(r.*)) from regiao_interesse r where r.familia_id = u.id), 0)
    + coalesce((select sum(pg_column_size(e.*)) from evento e where e.user_id = u.id), 0)
  from auth.users u order by u.created_at;
end $$;

create or replace function admin_resumo() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'sem permissão'; end if;
  return json_build_object(
    'banco_bytes', pg_database_size(current_database()),
    'ofertas', (select count(*) from oferta),
    'ofertas_bytes', pg_total_relation_size('oferta'),
    'produtos', (select count(*) from produto),
    'max_contas', (select max_contas from config_piloto),
    'convites', (select coalesce(json_agg(c order by c.criado_em), '[]') from convite c)
  );
end $$;

create or replace function admin_criar_convite(p_codigo text, p_descricao text, p_usos int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'sem permissão'; end if;
  insert into convite (codigo, descricao, usos_max) values (upper(trim(p_codigo)), p_descricao, greatest(p_usos, 1));
end $$;

revoke all on function admin_usuarios(), admin_resumo(), admin_criar_convite(text, text, int) from public;
grant execute on function eh_admin(), admin_usuarios(), admin_resumo(), admin_criar_convite(text, text, int) to authenticated;

-- Primeiro convite para o grupo de teste (20 pessoas). Troque o código se quiser.
insert into convite (codigo, descricao, usos_max) values ('INDAIA20', 'Grupo de teste (20 pessoas)', 20);
