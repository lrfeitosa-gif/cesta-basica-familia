'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { supabase, mensagemErro } from '@/lib/supabase';
import { TelaAcesso, CampoPilula, Seta } from '@/app/tela-acesso';

// Destino do link "Esqueci a senha". O Supabase abre esta página já com uma sessão de recuperação
// (lida do endereço pelo próprio cliente); aqui a pessoa escolhe a nova senha. Antes o link levava
// para /entrar, que não tinha onde trocar a senha.
export default function NovaSenha() {
  const [pronto, setPronto] = useState<'esperando' | 'ok' | 'sem-link'>('esperando');
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY' || s) setPronto('ok');
    });
    supabase.auth.getSession().then(({ data: d }) => { if (d.session) setPronto('ok'); });
    // o link traz o erro no endereço quando venceu ou já foi usado
    const t = setTimeout(() => setPronto((p) => (p === 'esperando' ? 'sem-link' : p)), 4000);
    if (/error_code=|error=/.test(location.hash + location.search)) setPronto('sem-link');
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== repetir) return setErro('As duas senhas não são iguais.');
    setEnviando(true); setErro('');
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) return setErro(/same.*password|different from the old/i.test(error.message) ? 'A nova senha precisa ser diferente da anterior.' : mensagemErro(error.message));
    setFeito(true);
  };

  return (
    <TelaAcesso titulo="Crie uma" destaque="nova senha" sub="Use pelo menos 8 caracteres, misturando letras, números e um símbolo."
      rodape={<>Lembrou a senha? <Link href="/entrar">Entrar</Link></>}>
      {feito ? (
        <div className="stack">
          <div className="alert alert-ok" role="status">Senha trocada. Você já está conectado.</div>
          <Link href="/ofertas" className="ob-pill au-entrar ob-link">Ir para as ofertas<Seta /></Link>
        </div>
      ) : pronto === 'sem-link' ? (
        <div className="alert alert-error" role="alert">
          Este link de nova senha venceu ou já foi usado. Volte em <Link href="/entrar">Entrar</Link>, digite seu e-mail e toque em &quot;Esqueci a senha&quot; para receber outro.
        </div>
      ) : (
        <form className="au-form" onSubmit={salvar} noValidate>
          <CampoPilula icone="senha" rotulo="Nova senha" id="senha" type="password" autoComplete="new-password" required
            value={senha} onChange={(e) => setSenha(e.target.value)} />
          <CampoPilula icone="senha" rotulo="Repita a nova senha" id="repetir" type="password" autoComplete="new-password" required
            value={repetir} onChange={(e) => setRepetir(e.target.value)} />
          {erro && <div className="alert alert-error" role="alert">{erro}</div>}
          <button className="ob-pill au-entrar" disabled={enviando || pronto !== 'ok'}>
            {pronto !== 'ok' ? 'Abrindo o link…' : enviando ? 'Salvando…' : 'Salvar nova senha'}<Seta />
          </button>
        </form>
      )}
    </TelaAcesso>
  );
}
