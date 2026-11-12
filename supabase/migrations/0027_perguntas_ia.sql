-- 0027: perguntas à IA na tela de Ofertas, com limite por família. Pode rodar mais de uma vez.

-- Evento novo: cada pergunta conta (o texto não é guardado aqui, só o tamanho)
alter table evento drop constraint if exists evento_tipo_check;
alter table evento add constraint evento_tipo_check check (tipo in (
  'login_ok','login_erro','cadastro_inicio','cadastro_erro','cadastro_ok','tela','erro_app',
  'cesta_montada','primeiros_passos','pergunta_ia'));

-- Confere e registra numa só chamada: até p_limite perguntas por família por dia (horário de Brasília).
-- Devolve quantas ainda restam hoje depois desta, ou -1 se o limite já foi atingido (nada é registrado).
create or replace function registrar_pergunta_ia(p_limite int default 30) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := timezone('America/Sao_Paulo', now())::date;
  v_feitas int;
begin
  if auth.uid() is null then raise exception 'entre na sua conta'; end if;
  select count(*) into v_feitas from evento
   where user_id = auth.uid() and tipo = 'pergunta_ia'
     and timezone('America/Sao_Paulo', criado_em)::date = v_hoje;
  if v_feitas >= p_limite then return -1; end if;
  insert into evento (user_id, tipo) values (auth.uid(), 'pergunta_ia');
  return p_limite - v_feitas - 1;
end $$;
revoke all on function registrar_pergunta_ia(int) from public, anon;
grant execute on function registrar_pergunta_ia(int) to authenticated;
