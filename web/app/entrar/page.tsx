'use client';
import Logo from '@/app/logo';
import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, mensagemErro } from '@/lib/supabase';
import BotaoGoogle, { googleAtivo } from '@/app/botao-google';

function Formulario() {
  const router = useRouter();
  const voltar = useSearchParams().get('voltar') || '/ofertas';
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !senha) return setErro('Preencha o e-mail e a senha.');
    setErro(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) return setErro(mensagemErro(error.message));
    router.replace(voltar);
  };

  const esqueci = async () => {
    if (!email) return setErro('Digite seu e-mail acima para receber o link de nova senha.');
    setErro('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/entrar` });
    if (error) return setErro(mensagemErro(error.message));
    setAviso(`Enviamos um link para ${email}. Abra o e-mail para criar uma nova senha.`);
  };

  return (
    <>
      <Link href="/" className="logo-link" aria-label="Início"><Logo /></Link>
      <div>
        <h1>Entrar</h1>
        <p className="lead">Use o e-mail da sua conta.</p>
      </div>
      {googleAtivo && <>
        <BotaoGoogle voltar={voltar} />
        <div className="divider">ou com e-mail</div>
      </>}
      <form className="stack" onSubmit={entrar} noValidate>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" autoComplete="email" inputMode="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input id="senha" className="input" type="password" autoComplete="current-password" required
            value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        {erro && <div className="alert alert-error" role="alert">{erro}</div>}
        {aviso && <div className="alert alert-ok" role="status">{aviso}</div>}
        <button className="btn btn-primary btn-block" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" className="btn btn-link" onClick={esqueci}>Esqueci a senha</button>
      </form>
      <p className="muted" style={{ marginTop: 'auto' }}>
        Ainda não tem conta? <Link href="/cadastro">Criar conta</Link>
      </p>
    </>
  );
}

export default function Entrar() {
  return <Suspense><Formulario /></Suspense>;
}
