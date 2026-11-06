-- 1) Nome da loja lido na nota, quando o CNPJ não bate com nenhum mercado cadastrado.
alter table compra add column if not exists loja_nota text;

-- 2) Sam's Club (preço de sócio no site; exige assinatura do clube). Coordenada aproximada de Indaiatuba.
insert into mercado (rede, loja, lat, lng) values ('Sam''s Club', 'Sam''s Club Indaiatuba', -23.09, -47.21)
on conflict (rede, loja) do nothing;
