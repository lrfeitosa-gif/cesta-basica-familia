'use client';
import { TelaAcesso, CampoPilula, Seta } from '@/app/tela-acesso';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, mensagemErro } from '@/lib/supabase';
import BotaoGoogle, { googleAtivo } from '@/app/botao-google';
import { dominio, registrar } from '@/lib/eventos';

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const voltar = params.get('voltar') || '/ofertas';
  const motivo = params.get('motivo');
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
    if (error) { registrar('login_erro', `${dominio(email)}: ${error.message}`); return setErro(mensagemErro(error.message)); }
    registrar('login_ok');
    router.replace(voltar);
  };

  // links de nova senha enviados antes de 13/11 apontam para esta tela: leva para a troca de senha
  useEffect(() => {
    if (/type=recovery/.test(location.hash) || /type=recovery/.test(location.search)) location.replace(`/nova-senha${location.search}${location.hash}`);
  }, []);

  const esqueci = async () => {
    if (!email) return setErro('Digite seu e-mail acima para receber o link de nova senha.');
    setErro('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/nova-senha` });
    if (error) return setErro(mensagemErro(error.message));
    setAviso(`Enviamos um link para ${email}. Abra o e-mail (confira também Spam e Promoções) e toque no link para criar uma nova senha.`);
  };

  return (
    <TelaAcesso titulo="Compre no preço" destaque="de oportunidade" sub="Entre para continuar"
      rodape={<>Não tem conta? <Link href="/cadastro">Criar conta</Link></>}>
      {motivo === 'inatividade' && !erro && !aviso && (
        <div className="alert alert-ok" role="status">
          Por segurança, encerramos sua sessão depois de um tempo sem uso. Entre de novo para continuar de onde parou.
        </div>
      )}
      {motivo === 'expirou' && !erro && !aviso && (
        <div className="alert alert-ok" role="status">Sua sessão expirou. Entre de novo para continuar de onde parou.</div>
      )}
      <form className="au-form" onSubmit={entrar} noValidate>
        <CampoPilula icone="email" rotulo="E-mail" id="email" type="email" autoComplete="email" inputMode="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <CampoPilula icone="senha" rotulo="Senha" id="senha" type="password" autoComplete="current-password" required
          value={senha} onChange={(e) => setSenha(e.target.value)} />
        <button type="button" className="au-link" onClick={esqueci}>Esqueci a senha</button>
        {erro && <div className="alert alert-error" role="alert">{erro}</div>}
        {aviso && <div className="alert alert-ok" role="status">{aviso}</div>}
        <button className="ob-pill au-entrar" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}<Seta /></button>
      </form>
      {googleAtivo && <>
        <div className="au-ou">ou</div>
        <div className="au-google"><BotaoGoogle voltar={voltar} /></div>
      </>}
    </TelaAcesso>
  );
}

export default function Entrar() {
  return <Suspense><Formulario /></Suspense>;
}
