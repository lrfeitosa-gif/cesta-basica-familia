-- 0023: avisos automáticos (notificação no celular e e-mail) e origem da nota por foto. Pode rodar mais de uma vez.

-- 1. A nota lida pela foto passa a ter origem própria (antes gravava 'nota', igual ao QR Code).
alter table compra drop constraint if exists compra_origem_check;
alter table compra add constraint compra_origem_check check (origem in ('nota', 'foto', 'manual'));

-- 2. Canais de aviso escolhidos pela família. O celular depende também de push_subscription (o aparelho autoriza).
alter table familia add column if not exists aviso_celular boolean not null default true;
alter table familia add column if not exists aviso_email boolean not null default false;

-- 3. Registro de cada aviso enviado: base do antispam (1 aviso por alerta a cada 7 dias, salvo preço ainda menor)
--    e da lista "Últimos avisos" na tela de Alertas.
alter table alerta add column if not exists item_interesse_id bigint references item_interesse(id) on delete cascade;
alter table alerta add column if not exists preco numeric(10,2);
alter table alerta add column if not exists mercado text;
alter table alerta add column if not exists mensagem text;
alter table alerta add column if not exists canais text[] not null default '{}';
alter table alerta alter column oferta_id drop not null;           -- a oferta do dia é apagada depois de 7 dias
alter table alerta drop constraint if exists alerta_oferta_id_fkey;
alter table alerta add constraint alerta_oferta_id_fkey foreign key (oferta_id) references oferta(id) on delete set null;
alter table alerta alter column produto_id drop not null;
create index if not exists alerta_por_interesse on alerta (item_interesse_id, enviado_em desc);
