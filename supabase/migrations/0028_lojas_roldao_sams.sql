-- 0028: lojas físicas do Roldão e do Sam's Club em Indaiatuba (endereços informados pela Luciane em 13/11/2026),
-- para o percurso do roteiro e as distâncias. Já aplicada à mão em 13/11; pode rodar de novo sem duplicar.
-- Coordenadas do OpenStreetMap: Sam's Club pelo número da loja; Roldão aproximada pelo trecho da rua (sem o número no mapa).
insert into mercado_loja (mercado_id, nome, endereco, lat, lng)
select m.id, v.nome, v.endereco, v.lat, v.lng from (values
  ('Roldão',      'Roldão Cidade Nova',       'Rua Almirante Tamandaré, 1345, Cidade Nova II',     -23.08214, -47.19915),
  ('Sam''s Club', 'Sam''s Club Jardim Kyoto', 'Rua Ely Lopes de Souza, 705, Jardim Nova Indaiá',   -23.11295, -47.21734)
) v(rede, nome, endereco, lat, lng)
join mercado m on m.rede = v.rede
on conflict (mercado_id, nome) do nothing;
