-- 0031: loja física do Tenda em Indaiatuba (Polo Shopping), para as distâncias, o tempo de carro e o roteiro.
-- Pedido da Luciane em 16/11/2026. Endereço e coordenadas conferidos no Google Maps (place "Tenda Atacado - Indaiatuba").
-- Pode rodar de novo sem duplicar.
insert into mercado_loja (mercado_id, nome, endereco, lat, lng)
select m.id, 'Tenda Polo Shopping', 'Alameda Filtros Mann, 670 (Polo Shopping), Jardim Tropical', -23.11542, -47.21995
from mercado m where m.rede = 'Tenda'
on conflict (mercado_id, nome) do nothing;
