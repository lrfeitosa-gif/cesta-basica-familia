-- 0030: "forma de sempre" na busca (14/11). Quem busca "café" quer café em pó: cápsula, solúvel e grãos só entram
-- se a pessoa escrever a palavra. Usa a mesma tabela das exclusões (0029): uma regra com opcao = true também tira
-- os produtos da busca, mas a tela mostra a palavra como botão "Também tem: cápsula · R$ 1,49/un", para trocar com
-- um toque. Regras com opcao = false continuam sendo exclusões puras (heineken sem sol). Pode rodar mais de uma vez.
alter table exclusao_busca add column if not exists opcao boolean not null default false;

-- quem administra também pode mudar uma regra entre exclusão e forma
drop policy if exists admin_altera on exclusao_busca;
create policy admin_altera on exclusao_busca for update to authenticated using (eh_admin()) with check (eh_admin());
grant update on exclusao_busca to authenticated;

insert into exclusao_busca (termo, excluir, opcao) values
  ('cafe', 'capsula', true), ('cafe', 'soluvel', true), ('cafe', 'grao', true),
  ('leite', 'po', true), ('leite', 'condensado', true), ('leite', 'lactose', true),
  ('arroz', 'integral', true), ('arroz', 'parboilizado', true), ('arroz', 'arboreo', true),
  ('feijao', 'preto', true), ('feijao', 'branco', true), ('feijao', 'fradinho', true),
  ('oleo', 'girassol', true), ('oleo', 'milho', true), ('oleo', 'canola', true),
  ('acucar', 'cristal', true), ('acucar', 'mascavo', true), ('acucar', 'demerara', true)
on conflict do nothing;
