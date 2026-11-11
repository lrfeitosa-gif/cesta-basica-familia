-- Loja de encartes do Sonda válidos para Indaiatuba.
insert into mercado (rede, loja, cidade, lat, lng)
values ('Sonda', 'Sonda (encarte Indaiatuba)', 'Indaiatuba', null, null)
on conflict (rede, loja) do nothing;

-- Normalização simples, sem acentos, para a busca do catálogo administrativo.
create or replace function admin_busca_normalizar(p_texto text) returns text
language sql immutable set search_path = public as $$
  select translate(lower(coalesce(p_texto, '')),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc');
$$;

create or replace function admin_produtos_buscar(p_termo text)
returns table (id bigint, nome text, marca text, item_base_id bigint, item_base_nome text, item_base_origem text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'sem permissão'; end if;
  if length(trim(coalesce(p_termo, ''))) < 2 then raise exception 'digite pelo menos 2 caracteres'; end if;
  return query
    select p.id, p.nome, p.marca, p.item_base_id, i.nome, p.item_base_origem
    from produto p
    left join item_base i on i.id = p.item_base_id
    where admin_busca_normalizar(p.nome || ' ' || coalesce(p.marca, ''))
      like '%' || admin_busca_normalizar(trim(p_termo)) || '%'
    order by p.nome, p.id
    limit 2000;
end $$;

-- Grava os produtos revisados do encarte e suas ofertas em todos os dias da validade.
create or replace function admin_importar_encarte(
  p_mercado text, p_inicio date, p_fim date, p_ofertas jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_mercado_id bigint;
  v_oferta jsonb;
  v_produto_id bigint;
  v_dia date;
  v_chave text;
  v_nome text;
  v_marca text;
  v_quantidade numeric;
  v_unidade text;
  v_categoria text;
  v_preco numeric;
  v_preco_de numeric;
  v_condicao text;
  v_inseridas int := 0;
  v_hoje date := timezone('America/Sao_Paulo', now())::date;
begin
  if not eh_admin() then raise exception 'sem permissão'; end if;
  if p_mercado not in ('Assaí', 'Sonda') then raise exception 'mercado inválido'; end if;
  if p_inicio is null or p_fim is null or p_inicio < v_hoje or p_fim < p_inicio
     or p_fim > v_hoje + 14 then
    raise exception 'validade inválida; informe datas entre hoje e os próximos 14 dias';
  end if;
  if p_ofertas is null or jsonb_typeof(p_ofertas) <> 'array' or jsonb_array_length(p_ofertas) < 1
     or jsonb_array_length(p_ofertas) > 500 then
    raise exception 'a carga deve conter de 1 a 500 ofertas';
  end if;

  select id into v_mercado_id from mercado where rede = p_mercado and cidade = 'Indaiatuba' order by id limit 1;
  if v_mercado_id is null then raise exception 'mercado não cadastrado para Indaiatuba'; end if;

  for v_oferta in select value from jsonb_array_elements(p_ofertas)
  loop
    v_chave := nullif(trim(v_oferta->>'chave'), '');
    v_nome := nullif(trim(v_oferta->>'produto'), '');
    v_marca := nullif(trim(v_oferta->>'marca'), '');
    v_quantidade := nullif(v_oferta->>'quantidade', '')::numeric;
    v_unidade := v_oferta->>'unidade';
    v_categoria := coalesce(nullif(trim(v_oferta->>'categoria'), ''), 'outros');
    v_preco := nullif(v_oferta->>'preco', '')::numeric;
    v_preco_de := nullif(v_oferta->>'preco_de', '')::numeric;
    v_condicao := nullif(trim(v_oferta->>'condicao'), '');

    if v_chave is null or v_nome is null or v_quantidade is null or v_quantidade <= 0
       or v_unidade is null or v_unidade not in ('g', 'kg', 'ml', 'l', 'un')
       or v_preco is null or v_preco <= 0 or (v_preco_de is not null and v_preco_de <= 0) then
      raise exception 'uma oferta contém nome, embalagem ou preço inválido';
    end if;

    insert into produto (chave, nome, marca, quantidade, unidade, categoria)
    values (v_chave, v_nome, v_marca, v_quantidade, v_unidade, v_categoria)
    on conflict (chave) do update set
      nome = excluded.nome, marca = excluded.marca, quantidade = excluded.quantidade,
      unidade = excluded.unidade, categoria = excluded.categoria
    returning id into v_produto_id;

    for v_dia in select d::date from generate_series(p_inicio, p_fim, interval '1 day') d
    loop
      insert into oferta (produto_id, mercado_id, preco, preco_de, condicao, valido_de, valido_ate, fonte, coletado_em)
      values (v_produto_id, v_mercado_id, v_preco, v_preco_de, v_condicao, v_dia, p_fim, 'tabloide', now())
      on conflict (produto_id, mercado_id, valido_de, fonte) do update set
        preco = excluded.preco, preco_de = excluded.preco_de, condicao = excluded.condicao,
        valido_ate = excluded.valido_ate, coletado_em = excluded.coletado_em;
      v_inseridas := v_inseridas + 1;
    end loop;
  end loop;
  return v_inseridas;
end $$;

revoke all on function admin_busca_normalizar(text), admin_produtos_buscar(text),
  admin_importar_encarte(text, date, date, jsonb) from public;
grant execute on function admin_busca_normalizar(text), admin_produtos_buscar(text),
  admin_importar_encarte(text, date, date, jsonb) to authenticated;
