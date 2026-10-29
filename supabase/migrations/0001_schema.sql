-- App Cesta Básica Família — modelo de dados do MVP
-- Privacidade: nenhuma coluna guarda CPF, nome completo, endereço exato ou pagamento.

create extension if not exists pg_trgm;

-- Família (1:1 com auth.users) ------------------------------------------------
create table familia (
  id uuid primary key references auth.users(id) on delete cascade,
  membros smallint not null check (membros between 1 and 20),
  frequencia text not null check (frequencia in ('semanal','mensal','sob_demanda')),
  notif_frequencia text not null default 'resumo_diario'
    check (notif_frequencia in ('imediata','resumo_diario','semanal')),
  custo_km numeric(6,2) not null default 1.20,
  criado_em timestamptz not null default now()
);

-- Região de interesse: só coordenada arredondada (~1 km, 2 casas decimais)
create table regiao_interesse (
  id bigint generated always as identity primary key,
  familia_id uuid not null references familia(id) on delete cascade,
  rotulo text not null,                       -- "casa", "escola", livre
  lat numeric(5,2) not null,
  lng numeric(5,2) not null,
  principal boolean not null default false
);
create unique index regiao_uma_principal on regiao_interesse(familia_id) where principal;

-- Mercados -------------------------------------------------------------------
create table mercado (
  id bigint generated always as identity primary key,
  rede text not null,                         -- Atacadão, Sumerbol, Covabra...
  loja text not null,
  cidade text not null default 'Indaiatuba',
  lat numeric(8,5) not null,
  lng numeric(8,5) not null,
  cnpj text unique                            -- casa a NFC-e com a loja
);

create table familia_mercado (
  familia_id uuid references familia(id) on delete cascade,
  mercado_id bigint references mercado(id) on delete cascade,
  primary key (familia_id, mercado_id)
);

-- Catálogo normalizado -------------------------------------------------------
create table produto (
  id bigint generated always as identity primary key,
  categoria text not null,                    -- "cafe_po", "arroz_branco"
  nome text not null,                         -- "Café torrado e moído"
  marca text,
  quantidade numeric(10,3) not null,          -- 500
  unidade text not null check (unidade in ('g','kg','ml','l','un')),
  ean text unique,
  perecivel boolean not null default false
);
create index produto_nome_trgm on produto using gin (nome gin_trgm_ops);
create index produto_categoria on produto(categoria);

-- Ofertas coletadas (tabloides, e-commerce, notas agregadas) -----------------
create table oferta (
  id bigint generated always as identity primary key,
  produto_id bigint not null references produto(id),
  mercado_id bigint not null references mercado(id),
  preco numeric(10,2) not null check (preco > 0),
  valido_de date not null default current_date,
  valido_ate date,
  fonte text not null check (fonte in ('tabloide','ecommerce','nota_agregada','manual')),
  coletado_em timestamptz not null default now()
);
create index oferta_produto_data on oferta(produto_id, valido_de);
create index oferta_mercado_data on oferta(mercado_id, valido_de);

-- Lista de interesse ----------------------------------------------------------
create table item_interesse (
  id bigint generated always as identity primary key,
  familia_id uuid not null references familia(id) on delete cascade,
  produto_id bigint references produto(id),   -- interesse "produto + marca"
  categoria text,                             -- interesse "só produto"
  marca text,
  preco_alvo numeric(10,2),
  origem text not null default 'manual' check (origem in ('manual','nota')),
  check (produto_id is not null or categoria is not null)
);

-- Compras (de NFC-e ou manual) -----------------------------------------------
create table compra (
  id bigint generated always as identity primary key,
  familia_id uuid not null references familia(id) on delete cascade,
  mercado_id bigint references mercado(id),
  data date not null,
  total numeric(10,2),
  origem text not null check (origem in ('nota','manual')),
  chave_nfce text,                            -- 44 dígitos; não identifica o consumidor
  unique (familia_id, chave_nfce)
);

create table item_comprado (
  id bigint generated always as identity primary key,
  compra_id bigint not null references compra(id) on delete cascade,
  produto_id bigint references produto(id),   -- null até normalizar
  descricao_nota text not null,
  quantidade numeric(10,3) not null,
  preco_unitario numeric(10,2) not null
);

-- Alertas ---------------------------------------------------------------------
create table alerta (
  id bigint generated always as identity primary key,
  familia_id uuid not null references familia(id) on delete cascade,
  oferta_id bigint not null references oferta(id),
  produto_id bigint not null references produto(id),
  motivo text not null,                       -- preco_alvo | abaixo_media | minimo_90d
  desconto_pct numeric(5,2),
  enviado_em timestamptz not null default now(),
  acao text check (acao in ('adicionado','ignorado'))
);
create index alerta_antispam on alerta(familia_id, produto_id, enviado_em desc);

create table push_subscription (
  id bigint generated always as identity primary key,
  familia_id uuid not null references familia(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null
);

-- Média regional de 60 dias (base do gatilho) --------------------------------
create view preco_referencia as
select produto_id,
       avg(preco)  filter (where valido_de >= current_date - 60) as media_60d,
       min(preco)  filter (where valido_de >= current_date - 90) as minimo_90d
from oferta
group by produto_id;

-- RLS: cada família só enxerga o que é dela ----------------------------------
alter table familia            enable row level security;
alter table regiao_interesse   enable row level security;
alter table familia_mercado    enable row level security;
alter table item_interesse     enable row level security;
alter table compra             enable row level security;
alter table item_comprado      enable row level security;
alter table alerta             enable row level security;
alter table push_subscription  enable row level security;

create policy dono on familia           using (id = auth.uid()) with check (id = auth.uid());
create policy dono on regiao_interesse  using (familia_id = auth.uid()) with check (familia_id = auth.uid());
create policy dono on familia_mercado   using (familia_id = auth.uid()) with check (familia_id = auth.uid());
create policy dono on item_interesse    using (familia_id = auth.uid()) with check (familia_id = auth.uid());
create policy dono on compra            using (familia_id = auth.uid()) with check (familia_id = auth.uid());
create policy dono on alerta            using (familia_id = auth.uid()) with check (familia_id = auth.uid());
create policy dono on push_subscription using (familia_id = auth.uid()) with check (familia_id = auth.uid());
create policy dono on item_comprado
  using (exists (select 1 from compra c where c.id = compra_id and c.familia_id = auth.uid()))
  with check (exists (select 1 from compra c where c.id = compra_id and c.familia_id = auth.uid()));

-- Catálogo, mercados e ofertas são públicos para leitura; escrita só pelo worker (service role)
alter table produto enable row level security;
alter table mercado enable row level security;
alter table oferta  enable row level security;
create policy leitura on produto for select using (true);
create policy leitura on mercado for select using (true);
create policy leitura on oferta  for select using (true);
