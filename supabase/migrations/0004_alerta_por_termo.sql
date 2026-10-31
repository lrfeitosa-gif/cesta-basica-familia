-- Alerta cadastrado à mão: o usuário descreve o produto em palavras ("café pilão 500g", "heineken -long neck"),
-- com marca e preço-alvo opcionais, antes de existir o catálogo normalizado.
alter table item_interesse add column termo text;
alter table item_interesse add column criado_em timestamptz not null default now();
alter table item_interesse drop constraint if exists item_interesse_check;
alter table item_interesse add constraint item_interesse_alvo
  check (produto_id is not null or categoria is not null or termo is not null);

-- item_interesse exige a família cadastrada; garante a linha para quem pulou a etapa da família.
create or replace function garantir_familia() returns void
language sql security definer set search_path = public as $$
  insert into familia (id, membros, frequencia) values (auth.uid(), 1, 'semanal')
  on conflict (id) do nothing;
$$;
grant execute on function garantir_familia() to authenticated;
