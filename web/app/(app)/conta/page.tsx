'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { sairDoApp, useSessao } from '@/lib/sessao';

// Meus dados: o que o app guarda sobre a pessoa, com exportação e exclusão da conta.
export default function Conta() {
  const sessao = useSessao();
  const router = useRouter();
  const [baixando, setBaixando] = useState(false);
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [senha, setSenha] = useState('');

  const exportar = async () => {
    setBaixando(true);
    const [compras, alertas, enderecos, cesta] = await Promise.all([
      supabase.from('compra').select('data,total,origem,mercado(rede),itens:item_comprado(descricao_nota,quantidade,preco_unitario)').order('data'),
      supabase.from('item_interesse').select('termo,marca,preco_alvo,criado_em').order('criado_em'),
      supabase.from('regiao_interesse').select('rotulo,lat,lng').order('id'),
      supabase.from('cesta_salva').select('sel,extras,marcas,atualizado_em').maybeSingle(),
    ]);
    const conteudo = {
      exportado_em: new Date().toISOString(),
      conta: { email: sessao?.user.email, criada_em: sessao?.user.created_at },
      notas_fiscais: compras.data ?? [],
      alertas: alertas.data ?? [],
      enderecos_de_referencia: enderecos.data ?? [],
      cesta: cesta.data ?? null,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `mercato-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBaixando(false);
  };

  // Ação sem volta: confirma que é a própria pessoa. Com senha, pede a senha; quem entra pelo Google
  // precisa ter entrado há pouco (senão, entra de novo e volta para cá).
  const temSenha = !!sessao?.user.identities?.some((i) => i.provider === 'email') || sessao?.user.app_metadata.provider === 'email';
  const entrouHaPouco = Date.now() - (Date.parse(sessao?.user.last_sign_in_at ?? '') || 0) < 10 * 60_000;
  const entrarDeNovo = () => sairDoApp('/entrar?voltar=/conta');

  const excluir = async () => {
    setErro('');
    if (temSenha) {
      if (!senha) return setErro('Digite sua senha para confirmar.');
      const { error: errSenha } = await supabase.auth.signInWithPassword({ email: sessao!.user.email!, password: senha });
      if (errSenha) return setErro('Senha incorreta. Confira e tente de novo.');
    } else if (!entrouHaPouco) {
      return setErro('reentrar');
    }
    const { error } = await supabase.rpc('excluir_conta');
    if (error) return setErro('Não foi possível excluir agora. Tente de novo em instantes.');
    try { localStorage.clear(); } catch {}
    await sairDoApp('/');
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
          <li><b>Endereços de referência:</b> o nome e a região aproximada (~1 km). Sem CEP nem rua.</li>
          <li><b>Na sua conta:</b> a sua cesta, com itens, quantidades e marcas escolhidas.</li>
        </ul>
        <button type="button" className="btn btn-secondary" onClick={exportar} disabled={baixando}>
          {baixando ? 'Preparando…' : 'Baixar meus dados (arquivo .json)'}
        </button>
      </section>

      <section className="card stack">
        <h2>Excluir conta</h2>
        <p className="muted">
          Apaga sua conta, notas e alertas. Não dá para desfazer. Para confirmar, digite EXCLUIR{temSenha ? ' e sua senha' : ''}.
        </p>
        {/* O Chrome preenchia o e-mail no campo EXCLUIR (revisão de 12/11): o campo de usuário escondido abaixo recebe
            o e-mail, e o campo de confirmação não aceita preenchimento automático. */}
        <input type="email" autoComplete="username" value={sessao?.user.email ?? ''} readOnly hidden aria-hidden="true" tabIndex={-1} />
        <div className="field">
          <label htmlFor="exc-confirma">Digite EXCLUIR</label>
          <input id="exc-confirma" name="confirmar-exclusao" className="input" autoComplete="off" autoCapitalize="characters" spellCheck={false}
            value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        </div>
        {temSenha && (
          <div className="field">
            <label htmlFor="exc-senha">Sua senha</label>
            <input id="exc-senha" className="input" type="password" autoComplete="current-password"
              value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
        )}
        {erro === 'reentrar' ? (
          <div className="alert alert-error" role="alert">
            Por segurança, entre de novo com o Google antes de excluir a conta.{' '}
            <button type="button" className="btn btn-link" onClick={entrarDeNovo}>Entrar de novo</button>
          </div>
        ) : erro && <div className="alert alert-error" role="alert">{erro}</div>}
        <button type="button" className="btn btn-perigo" disabled={confirma.trim().toUpperCase() !== 'EXCLUIR' || (temSenha && !senha)} onClick={excluir}>
          Excluir minha conta
        </button>
      </section>

      <Link href="/privacidade" className="btn btn-link">Política de privacidade</Link>
    </>
  );
}
