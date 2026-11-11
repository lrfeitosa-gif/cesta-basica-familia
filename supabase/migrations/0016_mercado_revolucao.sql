-- Supermercados Revolução: só folheto semanal (sem loja online). Uma loja em Indaiatuba.
-- Coordenada aproximada (cerca de 300 m), suficiente para a distância em linha reta.
insert into mercado (rede, loja, cidade, lat, lng)
values ('Revolução', 'Revolução Indaiatuba', 'Indaiatuba', -23.11350, -47.22150)
on conflict (rede, loja) do nothing;

insert into mercado_loja (mercado_id, nome, endereco, lat, lng)
select m.id, 'Revolução Jardim Kioto', 'Avenida Francisco de Paula Leite, 2223, Jardim Kioto I', -23.11350, -47.22150
from mercado m where m.rede = 'Revolução' and m.loja = 'Revolução Indaiatuba'
on conflict (mercado_id, nome) do nothing;

-- Oferta de dia certo dentro do encarte ("Só 09/11; ...", "Só 09 e 10/11"): vale só nesses dias.
create or replace function oferta_vale_no_dia(p_condicao text, p_dia date) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  v_txt text;
  v_d text[];
  v_m text[];
  v_mes text := '';
begin
  v_txt := substring(coalesce(p_condicao, '') from '^\s*[Ss][óÓoO]\s+([^;]+)');
  if v_txt is null then return true; end if;
  select array_agg(r[1] order by n), array_agg(coalesce(r[2], '') order by n) into v_d, v_m
  from regexp_matches(v_txt, '(\d{1,2})(?:/(\d{1,2}))?', 'g') with ordinality as t(r, n);
  if v_m is null or not exists (select 1 from unnest(v_m) x where x <> '') then return true; end if;
  for i in reverse array_length(v_d, 1)..1 loop   -- "09 e 10/11": o mês vem no último
    if v_m[i] <> '' then v_mes := v_m[i]; end if;
    if lpad(v_d[i], 2, '0') = to_char(p_dia, 'DD') and lpad(v_mes, 2, '0') = to_char(p_dia, 'MM') then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- Grava os produtos revisados do encarte e suas ofertas em todos os dias da validade
-- (oferta "Só dd/mm" só nos dias dela). Aceita também o Revolução.
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
  if p_mercado not in ('Assaí', 'Sonda', 'Revolução') then raise exception 'mercado inválido'; end if;
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
      where oferta_vale_no_dia(v_condicao, d::date)
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

grant execute on function oferta_vale_no_dia(text, date) to authenticated, anon;
