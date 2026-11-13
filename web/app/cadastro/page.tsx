'use client';
import Logo from '@/app/logo';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, mensagemErro } from '@/lib/supabase';
import BotaoGoogle, { googleAtivo } from '@/app/botao-google';
import { dominio, registrar } from '@/lib/eventos';
import { TelaAcesso, CampoPilula, Seta } from '@/app/tela-acesso';

export default function Cadastro() {
  const router = useRouter();
  const [convite, setConvite] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const senhaCurta = senha.length > 0 && senha.length < 8;
  // link de convite (/cadastro?convite=CODIGO) já traz o código preenchido
  useEffect(() => {
    const c = new URLSearchParams(location.search).get('convite');
    if (c) setConvite(c.trim().toUpperCase().slice(0, 40));
  }, []);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    if (!convite.trim()) return setErro('Digite o código de convite que você recebeu.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Digite um e-mail válido, como nome@gmail.com.');
    if (senha.length < 8) return setErro('Crie uma senha com pelo menos 8 caracteres.');
    if (!aceite) return setErro('Para criar a conta, aceite os termos de uso e a política de privacidade.');
    setErro(''); setEnviando(true);
    registrar('cadastro_inicio', dominio(email));
    // teste fechado: o código é conferido aqui e de novo no banco, no momento do cadastro
    const { data: ok } = await supabase.rpc('convite_valido', { p_codigo: convite });
    if (ok === false) {
      setEnviando(false);
      registrar('cadastro_erro', `convite ${convite.trim().toUpperCase()}`);
      return setErro('Código de convite inválido, esgotado ou o teste está lotado. Confira com quem te convidou.');
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password: senha,
      options: { emailRedirectTo: `${location.origin}/ofertas`, data: { convite: convite.trim().toUpperCase() } },
    });
    setEnviando(false);
    if (error) { registrar('cadastro_erro', `${dominio(email)}: ${error.message}`); return setErro(mensagemErro(error.message)); }
    registrar('cadastro_ok', dominio(email));
    if (data.session) router.replace('/ofertas');   // confirmação de e-mail desligada no Supabase
    else setConfirmar(true);                          // ligada: espera o clique no link
  };

  if (confirmar) {
    return (
      <>
        <Logo />
        <div className="stack">
          <h1>Confirme seu e-mail</h1>
          <p className="lead">Enviamos um link para <b>{email}</b>. Abra o e-mail e toque no link para continuar o cadastro.</p>
          <p className="muted">Não chegou? Confira a caixa de spam ou promoções.</p>
        </div>
      </>
    );
  }

  return (
    <TelaAcesso titulo="Crie sua conta" destaque="e economize" sub="Só pedimos e-mail. Nada de CPF ou endereço."
      rodape={<>Já tem conta? <Link href="/entrar">Entrar</Link></>}>
      <form className="au-form" onSubmit={criar} noValidate>
        <CampoPilula icone="convite" rotulo="Código de convite" id="convite" autoComplete="off" autoCapitalize="characters" required
          aria-describedby="convite-ajuda" value={convite} onChange={(e) => setConvite(e.target.value)} />
        <span id="convite-ajuda" className="au-ajuda">Teste fechado: peça o código a quem te convidou.</span>
        <CampoPilula icone="email" rotulo="E-mail" id="email" type="email" autoComplete="email" inputMode="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <CampoPilula icone="senha" rotulo="Senha (mínimo de 8 caracteres)" id="senha" type="password" autoComplete="new-password"
          required minLength={8} aria-invalid={senhaCurta} value={senha} onChange={(e) => setSenha(e.target.value)} />
        <label className="au-aceite">
          <input type="checkbox" id="aceite" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
          <span>Li e aceito os <Link href="/termos">termos de uso</Link> e a <Link href="/privacidade">política de privacidade</Link>.</span>
        </label>
        {erro && <div className="alert alert-error" role="alert">{erro}</div>}
        <button className="ob-pill au-entrar" disabled={enviando}>{enviando ? 'Criando conta…' : 'Criar conta'}<Seta /></button>
      </form>
      {googleAtivo && <>
        <div className="au-ou">ou</div>
        <div className="au-google"><BotaoGoogle voltar="/ofertas" /></div>
      </>}
    </TelaAcesso>
  );
}
