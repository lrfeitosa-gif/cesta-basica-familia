-- 0026: cesta salva na conta (abre igual no celular e no computador) e aviso do Security Advisor. Pode rodar mais de uma vez.

-- 1. Cesta da família: itens marcados e quantidades (sel), itens adicionados (extras) e marcas escolhidas (marcas).
--    Uma linha por família; o app grava a cada mudança e, ao abrir, fica com a versão mais recente.
create table if not exists cesta_salva (
  familia_id uuid primary key references familia(id) on delete cascade,
  sel jsonb not null default '{}',
  extras jsonb not null default '[]',
  marcas jsonb not null default '{}',
  atualizado_em timestamptz not null default now(),
  check (pg_column_size(sel) + pg_column_size(extras) + pg_column_size(marcas) < 200000)
);
alter table cesta_salva enable row level security;
drop policy if exists dono on cesta_salva;
create policy dono on cesta_salva for all to authenticated
  using (familia_id = (select auth.uid())) with check (familia_id = (select auth.uid()));
revoke all on cesta_salva from anon;

-- 2. Security Advisor ("Extension in Public"): pg_trgm sai do schema public. O índice produto_nome_trgm continua
--    valendo (aponta para a classe de operadores, não para o nome do schema); nenhuma função do app chama similarity().
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
