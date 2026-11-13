-- 0029: exclusões da busca, ajustáveis pela Administração. Ex.: quem busca "heineken" não quer ver
-- "Sol (Grupo Heineken)": termo = heineken, excluir = sol. Vale para Ofertas, Cesta, Comparar, Evolução e Alertas
-- (todas usam o mesmo filtro do app). Quem escreve a palavra excluída na busca ("heineken sol") ainda vê o produto.
-- Pode rodar mais de uma vez.
create table if not exists exclusao_busca (
  id bigint generated always as identity primary key,
  termo text not null check (length(trim(termo)) between 2 and 60),
  excluir text not null check (length(trim(excluir)) between 2 and 60),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
create unique index if not exists exclusao_busca_unica on exclusao_busca (lower(trim(termo)), lower(trim(excluir)));
alter table exclusao_busca enable row level security;

drop policy if exists leitura on exclusao_busca;
create policy leitura on exclusao_busca for select using (true);           -- o app de todas as famílias aplica as regras
drop policy if exists admin_grava on exclusao_busca;
create policy admin_grava on exclusao_busca for insert to authenticated with check (eh_admin());
drop policy if exists admin_apaga on exclusao_busca;
create policy admin_apaga on exclusao_busca for delete to authenticated using (eh_admin());
grant select on exclusao_busca to anon, authenticated;
grant insert, delete on exclusao_busca to authenticated;

insert into exclusao_busca (termo, excluir) values ('heineken', 'sol') on conflict do nothing;
