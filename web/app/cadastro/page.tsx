'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, mensagemErro } from '@/lib/supabase';
import BotaoGoogle, { googleAtivo } from '@/app/botao-google';

export default function Cadastro() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const senhaCurta = senha.length > 0 && senha.length < 8;

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Digite um e-mail válido, como nome@gmail.com.');
    if (senha.length < 8) return setErro('Crie uma senha com pelo menos 8 caracteres.');
    if (!aceite) return setErro('Para criar a conta, aceite os termos de uso e a política de privacidade.');
    setErro(''); setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password: senha, options: { emailRedirectTo: `${location.origin}/onboarding` },
    });
    setEnviando(false);
    if (error) return setErro(mensagemErro(error.message));
    if (data.session) router.replace('/onboarding');   // confirmação de e-mail desligada no Supabase
    else setConfirmar(true);                          // ligada: espera o clique no link
  };

  if (confirmar) {
    return (
      <>
        <div className="brand">Cesta <span>Indaiatuba</span></div>
        <div className="stack">
          <h1>Confirme seu e-mail</h1>
          <p className="lead">Enviamos um link para <b>{email}</b>. Abra o e-mail e toque no link para continuar o cadastro.</p>
          <p className="muted">Não chegou? Confira a caixa de spam ou promoções.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>Cesta <span>Indaiatuba</span></Link>
      <div>
        <h1>Criar conta</h1>
        <p className="lead">Só pedimos e-mail. Nada de CPF, nome completo ou endereço.</p>
      </div>
      {googleAtivo && <>
        <BotaoGoogle voltar="/onboarding" />
        <div className="divider">ou com e-mail</div>
      </>}
      <form className="stack" onSubmit={criar} noValidate>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" autoComplete="email" inputMode="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input id="senha" className="input" type="password" autoComplete="new-password" required minLength={8}
            aria-invalid={senhaCurta} aria-describedby="senha-ajuda"
            value={senha} onChange={(e) => setSenha(e.target.value)} />
          <span id="senha-ajuda" className="help">Mínimo de 8 caracteres.</span>
        </div>
        <label className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
          <input type="checkbox" id="aceite" checked={aceite} onChange={(e) => setAceite(e.target.checked)}
            style={{ width: 22, height: 22, accentColor: 'var(--accent)', marginTop: 1 }} />
          <span className="muted" style={{ flex: 1 }}>
            Li e aceito os <Link href="/termos">termos de uso</Link> e a <Link href="/privacidade">política de privacidade</Link>.
          </span>
        </label>
        {erro && <div className="alert alert-error" role="alert">{erro}</div>}
        <button className="btn btn-primary btn-block" disabled={enviando}>
          {enviando ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 'auto' }}>
        Já tem conta? <Link href="/entrar">Entrar</Link>
      </p>
    </>
  );
}
