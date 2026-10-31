-- 1) "Acabou na loja": a pessoa avisa que a oferta está sem estoque.
--    O aviso vale só para aquela oferta do dia; a coleta do dia seguinte cria ofertas novas,
--    então o aviso deixa de valer sozinho.
create table esgotado (
  oferta_id bigint not null references oferta(id) on delete cascade,
  familia_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (oferta_id, familia_id)
);
alter table esgotado enable row level security;
-- todos veem os avisos (é um aviso coletivo), cada um cria e desfaz só os seus
create policy leitura on esgotado for select using (true);
create policy criar on esgotado for insert with check (familia_id = auth.uid());
create policy desfazer on esgotado for delete using (familia_id = auth.uid());

-- 2) Indicação de mercado novo para acompanhar.
create table sugestao_mercado (
  id bigint generated always as identity primary key,
  familia_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (length(nome) between 2 and 80),
  bairro_ou_cidade text check (length(bairro_ou_cidade) <= 80),
  link text check (length(link) <= 300),
  criado_em timestamptz not null default now()
);
alter table sugestao_mercado enable row level security;
create policy criar on sugestao_mercado for insert with check (familia_id = auth.uid());
create policy minhas on sugestao_mercado for select using (familia_id = auth.uid());
