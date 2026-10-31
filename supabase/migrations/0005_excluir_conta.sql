-- Exclusão da conta pela própria pessoa (LGPD). Apaga o usuário; família, notas, itens e alertas
-- saem junto pelas chaves "on delete cascade". Os preços regionais não guardam quem enviou.
create or replace function excluir_conta() returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function excluir_conta() from public;
grant execute on function excluir_conta() to authenticated;
