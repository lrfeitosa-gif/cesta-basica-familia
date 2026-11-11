-- 0018: correções apontadas pelo Security Advisor do Supabase (aplicada em 2026-11-11)

-- Views de preço passam a respeitar o RLS de quem consulta
-- (oferta, produto e mercado já têm policy de leitura pública, então nada muda para o app)
alter view public.preco_diario set (security_invoker = on);
alter view public.preco_diario_mercado set (security_invoker = on);
alter view public.preco_referencia set (security_invoker = on);

-- Funções SECURITY DEFINER que só fazem sentido com usuário logado: tira a execução do papel anon.
-- convite_valido continua liberada para anon (a tela de cadastro usa antes do login).
revoke execute on function
  public.admin_usuarios(), public.admin_resumo(), public.admin_criar_convite(text, text, int),
  public.admin_ligar(bigint[], bigint, text), public.admin_item_salvar(bigint, text, text, text[], boolean),
  public.admin_catalogo_resumo(), public.admin_produtos_buscar(text),
  public.admin_importar_encarte(text, date, date, jsonb),
  public.excluir_conta()
from anon;

-- Estas três herdavam execução do papel PUBLIC
revoke execute on function public.eh_admin(), public.garantir_familia(), public.validar_convite() from public, anon;
grant execute on function public.eh_admin(), public.garantir_familia(), public.validar_convite() to authenticated;
