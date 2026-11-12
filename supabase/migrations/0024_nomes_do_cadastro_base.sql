-- 0024: grafia dos itens do cadastro base (revisão de UX de 12/11). O " - " parecia o sinal de menos da busca.
update item_base set nome = 'Café em cápsula' where nome = 'Café - capsula';
update item_base set nome = 'Café em grãos'   where nome = 'Cafe - graõs';
update item_base set nome = 'Café solúvel'    where nome = 'Café - soluvel';
update item_base set nome = 'Brócolis'        where nome = 'Brocolis';
