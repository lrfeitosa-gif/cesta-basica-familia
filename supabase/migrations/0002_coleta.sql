-- Ajustes para gravar o que os coletores entregam.

-- Produto: chave natural para upsert (EAN quando houver; senão nome+marca+embalagem normalizados)
alter table produto add column chave text;
update produto set chave = coalesce(ean, lower(nome || '|' || coalesce(marca, '') || '|' || quantidade || unidade));
alter table produto alter column chave set not null;
alter table produto add constraint produto_chave_unica unique (chave);

-- Mercado: coordenadas e CNPJ podem ser preenchidos depois
alter table mercado alter column lat drop not null;
alter table mercado alter column lng drop not null;
alter table mercado add constraint mercado_rede_loja_unica unique (rede, loja);

-- Oferta: detalhes que vêm dos encartes e do e-commerce
alter table oferta add column preco_de numeric(10,2);
alter table oferta add column condicao text;          -- "a partir de 3 un", "no Clube Sumerbol"...
alter table oferta add column url text;
alter table oferta add column descricao_original text; -- nome como veio da fonte, para auditar a normalização
-- uma oferta por produto, loja, dia e fonte: rodar a coleta duas vezes no dia não duplica
alter table oferta add constraint oferta_unica unique (produto_id, mercado_id, valido_de, fonte);

insert into mercado (rede, loja, lat, lng) values
  ('Atacadão',    'Atacadão Indaiatuba',   -23.11923, -47.21796),
  ('Assaí',       'Assaí Indaiatuba',      null, null),
  ('Covabra',     'Covabra Indaiatuba',    null, null),
  ('Pague Menos', 'Pague Menos Indaiatuba', null, null),
  ('Savegnago',   'Savegnago Indaiatuba',  null, null),
  ('Sumerbol',    'Sumerbol Indaiatuba',   null, null),
  ('Roldão',      'Roldão Indaiatuba',     null, null),
  ('Pão de Açúcar', 'Pão de Açúcar Indaiatuba', null, null)
on conflict (rede, loja) do nothing;
