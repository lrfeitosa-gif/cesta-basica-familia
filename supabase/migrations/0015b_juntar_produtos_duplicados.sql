-- Conclusão da 0015. A 0015 foi aplicada em parte (a restrição única do código de barras saiu e boa parte dos
-- produtos já está no formato "código|embalagem"), mas o coletor antigo continuou gravando com a chave antiga
-- (só o código): sem a restrição, criou um produto repetido para cada código (ex.: arroz 7891737018641 com as
-- chaves "7891737018641" e "7891737018641|1kg"). Aqui o repetido é juntado ao produto no formato novo, com
-- ofertas, alertas, avisos de esgotado, itens de interesse e itens comprados; depois sai. Tudo ou nada.
begin;

-- produto antigo (chave = código) -> produto novo (chave = código|embalagem)
create temp table mapa on commit drop as
select a.id as antigo, b.id as novo
from produto a
join produto b on b.chave = a.ean || '|' || trim_scale(a.quantidade)::text || a.unidade
where a.ean is not null and a.chave = a.ean;

-- ofertas do antigo que já existem no novo (mesmo mercado, dia e fonte)
create temp table par_oferta on commit drop as
select oa.id as oferta_antiga, ob.id as oferta_nova
from oferta oa
join mapa m on m.antigo = oa.produto_id
join oferta ob on ob.produto_id = m.novo and ob.mercado_id = oa.mercado_id
  and ob.valido_de = oa.valido_de and ob.fonte = oa.fonte;

-- fica o preço da coleta mais recente
update oferta ob
set preco = oa.preco, preco_de = oa.preco_de, condicao = oa.condicao, valido_ate = oa.valido_ate,
    coletado_em = oa.coletado_em, url = coalesce(oa.url, ob.url)
from par_oferta p
join oferta oa on oa.id = p.oferta_antiga
where ob.id = p.oferta_nova and oa.coletado_em > ob.coletado_em;

-- alertas e avisos de esgotado passam para a oferta que fica
update alerta a set oferta_id = p.oferta_nova
from par_oferta p where a.oferta_id = p.oferta_antiga;

update esgotado e set oferta_id = p.oferta_nova
from par_oferta p
where e.oferta_id = p.oferta_antiga
  and not exists (select 1 from esgotado x where x.oferta_id = p.oferta_nova and x.familia_id = e.familia_id);

delete from oferta where id in (select oferta_antiga from par_oferta);   -- esgotado restante sai em cascata

-- o resto das ofertas e as demais ligações passam para o produto novo
update oferta o set produto_id = m.novo from mapa m where o.produto_id = m.antigo;
update item_interesse i set produto_id = m.novo from mapa m where i.produto_id = m.antigo;
update item_comprado i set produto_id = m.novo from mapa m where i.produto_id = m.antigo;
update alerta a set produto_id = m.novo from mapa m where a.produto_id = m.antigo;

delete from produto where id in (select antigo from mapa);

-- última etapa da 0015: produtos com a chave antiga que não tinham par passam para o formato novo
update produto
set chave = ean || '|' || trim_scale(quantidade)::text || unidade
where ean is not null and chave = ean;

commit;
