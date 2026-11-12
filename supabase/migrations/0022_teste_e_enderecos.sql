-- 0022: código TESTE fora das vagas do piloto e endereços sem duplicar. Pode rodar mais de uma vez.

-- 1. Código TESTE: as contas de teste não contam no limite do piloto (45 famílias + a administradora = 46).
--    O código continua com limite próprio de usos.
insert into convite (codigo, descricao, usos_max) values ('TESTE', 'Contas de teste da administradora (fora das vagas)', 5)
on conflict (codigo) do nothing;

create or replace function validar_convite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c text := upper(trim(coalesce(new.raw_user_meta_data->>'convite', '')));
  ok int;
begin
  if c <> 'TESTE' and (
    select count(*) from auth.users u where upper(trim(coalesce(u.raw_user_meta_data->>'convite', ''))) <> 'TESTE'
  ) >= (select max_contas from config_piloto) then
    raise exception 'PILOTO_LOTADO';
  end if;
  update convite set usos = usos + 1
   where codigo = c and usos < usos_max and (valido_ate is null or valido_ate >= current_date);
  get diagnostics ok = row_count;
  if ok = 0 then raise exception 'CONVITE_INVALIDO'; end if;
  return new;
end $$;
revoke execute on function validar_convite() from public, anon;

-- 2. Endereços: um nome por família ("casa" e "Casa" são o mesmo). Junta os repetidos, fica o mais antigo.
delete from regiao_interesse r
 using regiao_interesse antigo
 where antigo.familia_id = r.familia_id
   and lower(trim(antigo.rotulo)) = lower(trim(r.rotulo))
   and antigo.id < r.id;
-- se o endereço principal foi apagado, o mais antigo que sobrou vira o principal
update regiao_interesse r set principal = true
 where not exists (select 1 from regiao_interesse x where x.familia_id = r.familia_id and x.principal)
   and r.id = (select min(id) from regiao_interesse y where y.familia_id = r.familia_id);
create unique index if not exists regiao_interesse_nome_unico on regiao_interesse (familia_id, lower(trim(rotulo)));
