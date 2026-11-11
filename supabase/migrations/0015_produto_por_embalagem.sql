-- Um produto por código de barras E embalagem.
-- Alguns mercados usam o código de barras da lata avulsa também no pack ("Heineken 269ml" a R$ 4,75 no Savegnago e
-- "Heineken 269ml com 8 unidades" a R$ 35,98 no Sam's Club). Com um produto por código, o nome e o tamanho ficavam
-- os do último mercado gravado, e o preço da lata era dividido por 8. A chave passa a ser "código|embalagem",
-- no mesmo formato do coletor (worker/rodar_coleta.py: f"{ean}|{qtd:g}{un}").

alter table produto drop constraint if exists produto_ean_key;
create index if not exists produto_ean on produto (ean);

-- produtos já gravados com a chave antiga (só o código) passam para o novo formato, mantendo o histórico
update produto
set chave = ean || '|' || trim_scale(quantidade)::text || unidade
where ean is not null and chave = ean;
