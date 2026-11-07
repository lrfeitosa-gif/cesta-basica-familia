-- Ofertas do dia lentas (erro "statement timeout"): a tabela oferta acumula o histórico de todos os dias e
-- as consultas por dia liam a tabela inteira. Estes índices deixam a busca do dia direta.
create index if not exists oferta_dia_id on oferta (valido_de, id);
create index if not exists oferta_fonte_dia on oferta (fonte, valido_de desc);
create index if not exists esgotado_oferta on esgotado (oferta_id);
analyze oferta;
