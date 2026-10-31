'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';

// Meus dados: o que o app guarda sobre a pessoa, com exportação e exclusão da conta.
export default function Conta() {
  const sessao = useSessao();
  const router = useRouter();
  const [baixando, setBaixando] = useState(false);
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');

  const exportar = async () => {
    setBaixando(true);
    const [compras, alertas] = await Promise.all([
      supabase.from('compra').select('data,total,origem,mercado(rede),itens:item_comprado(descricao_nota,quantidade,preco_unitario)').order('data'),
      supabase.from('item_interesse').select('termo,marca,preco_alvo,criado_em').order('criado_em'),
    ]);
    const conteudo = {
      exportado_em: new Date().toISOString(),
      conta: { email: sessao?.user.email, criada_em: sessao?.user.created_at },
      notas_fiscais: compras.data ?? [],
      alertas: alertas.data ?? [],
      observacao: 'Itens da compra "Minha compra" ficam só neste aparelho e não são enviados ao servidor.',
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `fast-promotions-mk-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBaixando(false);
  };

  const excluir = async () => {
    setErro('');
    const { error } = await supabase.rpc('excluir_conta');
    if (error) return setErro('Não foi possível excluir agora. Tente de novo em instantes.');
    await supabase.auth.signOut();
    try { localStorage.clear(); } catch {}
    router.replace('/');
  };

  if (!sessao) return null;
  return (
    <>
      <div>
        <h1>Meus dados</h1>
        <p className="lead">Tudo o que o app guarda sobre você.</p>
      </div>

      <section className="card stack">
        <h2>O que guardamos</h2>
        <ul className="dados-lista">
          <li><b>Conta:</b> seu e-mail ({sessao.user.email}).</li>
          <li><b>Notas fiscais enviadas:</b> loja, data, total e os itens com quantidade e preço. CPF e dados de pagamento da nota nunca são gravados.</li>
          <li><b>Alertas:</b> os produtos, marcas e preços-alvo que você cadastrou.</li>
          <li><b>Neste aparelho apenas:</b> os itens da Minha compra e as marcas escolhidas.</li>
        </ul>
        <button type="button" className="btn btn-secondary" onClick={exportar} disabled={baixando}>
          {baixando ? 'Preparando…' : 'Baixar meus dados (arquivo .json)'}
        </button>
      </section>

      <section className="card stack">
        <h2>Excluir conta</h2>
        <p className="muted">Apaga sua conta, notas e alertas. Não dá para desfazer. Para confirmar, digite EXCLUIR.</p>
        <input className="input" aria-label="Digite EXCLUIR para confirmar" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        {erro && <div className="alert alert-error" role="alert">{erro}</div>}
        <button type="button" className="btn btn-perigo" disabled={confirma.trim().toUpperCase() !== 'EXCLUIR'} onClick={excluir}>
          Excluir minha conta
        </button>
      </section>

      <Link href="/privacidade" className="btn btn-link">Política de privacidade</Link>
    </>
  );
}
