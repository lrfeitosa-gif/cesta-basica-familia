-- Lojas físicas em Indaiatuba (uma rede pode ter várias) para mostrar a distância até a família.
-- Coordenadas do OpenStreetMap (consultado em 02/11/2026). Roldão: endereço ainda não localizado.
create table mercado_loja (
  id bigint generated always as identity primary key,
  mercado_id bigint not null references mercado(id) on delete cascade,
  nome text not null,
  endereco text,
  lat numeric(8,5) not null,
  lng numeric(8,5) not null,
  unique (mercado_id, nome)
);
alter table mercado_loja enable row level security;
create policy leitura on mercado_loja for select using (true);

insert into mercado_loja (mercado_id, nome, endereco, lat, lng)
select m.id, v.nome, v.endereco, v.lat, v.lng
from (values
  ('Assaí',       'Assaí Jardim Kyoto',          'Rua Reverendo Ataídes Costa, Jardim Kyoto',          -23.10896, -47.22084),
  ('Atacadão',    'Atacadão Recreio Campestre',  'Alameda Capovilla, Recreio Campestre Jóia',           -23.11985, -47.21745),
  ('Covabra',     'Covabra Jardim Juliana',      'Rua Suíça, Jardim Juliana',                           -23.09637, -47.18777),
  ('Covabra',     'Covabra Presidente Vargas',   'Avenida Presidente Vargas, 375, Jardim Esplendor',    -23.08754, -47.20776),
  ('Goodbom',     'Goodbom Jardim Hubert',       'Rua João Giaquinto, 386, Jardim Hubert',              -23.11239, -47.23380),
  ('Pague Menos', 'Pague Menos Jardim Monte Verde', 'Avenida Manoel Ruz Peres, Jardim Monte Verde',     -23.10563, -47.24588),
  ('Savegnago',   'Savegnago Jardim Pedroso',    'Avenida Francisco de Paula Leite, 926, Jardim Pedroso', -23.09894, -47.21646),
  ('São Vicente', 'São Vicente Morada do Sol',   'Rua João Martini, 1791, Jardim Morada do Sol',        -23.11525, -47.24119),
  ('Sumerbol',    'Sumerbol Morada do Sol',      'Rua José da Silva Maciel, 81, Jardim Morada do Sol',  -23.12059, -47.22563)
) as v(rede, nome, endereco, lat, lng)
join mercado m on m.rede = v.rede
on conflict (mercado_id, nome) do nothing;

-- Endereços de referência da família (até 3): só rótulo e coordenada arredondada (~1 km), nunca o CEP ou a rua.
alter table regiao_interesse add column criado_em timestamptz not null default now();
drop index if exists regiao_uma_principal;
