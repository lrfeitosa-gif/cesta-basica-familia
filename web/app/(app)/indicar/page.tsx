'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';

type Sugestao = { id: number; nome: string; bairro_ou_cidade: string | null; criado_em: string };

// Indicar um mercado novo para o app acompanhar. As indicações são avaliadas à mão (site aberto, encarte etc.).
export default function Indicar() {
  const sessao = useSessao();
  const [nome, setNome] = useState('');
  const [onde, setOnde] = useState('');
  const [link, setLink] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [minhas, setMinhas] = useState<Sugestao[]>([]);

  const carregar = async () => {
    const { data } = await supabase.from('sugestao_mercado').select('id,nome,bairro_ou_cidade,criado_em').order('criado_em', { ascending: false });
    setMinhas((data as Sugestao[]) ?? []);
  };
  useEffect(() => { if (sessao) carregar(); }, [sessao]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro('Informe o nome do mercado.');
    setErro(''); setOk(''); setEnviando(true);
    const { error } = await supabase.from('sugestao_mercado').insert({
      nome: nome.trim(), bairro_ou_cidade: onde.trim() || null, link: link.trim() || null,
    });
    setEnviando(false);
    if (error) {
      return setErro(/relation|does not exist/i.test(error.message)
        ? 'As indicações ainda não foram ativadas no banco de dados (falta o ajuste 0006 no Supabase).'
        : 'Não foi possível enviar agora. Tente de novo.');
    }
    setOk(`Obrigado! Vamos ver se dá para acompanhar o ${nome.trim()}.`);
    setNome(''); setOnde(''); setLink('');
    carregar();
  };

  if (!sessao) return null;
  return (
    <>
      <div>
        <h1>Indicar um mercado</h1>
        <p className="lead">Conhece um mercado de Indaiatuba que deveria estar no app? Conte para a gente.</p>
      </div>
      <form className="card stack" onSubmit={enviar} noValidate>
        <div className="field">
          <label htmlFor="nome">Nome do mercado</label>
          <input id="nome" className="input" placeholder="Ex.: Supermercado Bom Preço" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="onde">Bairro ou cidade (opcional)</label>
          <input id="onde" className="input" placeholder="Ex.: Jardim Morada do Sol" value={onde} onChange={(e) => setOnde(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="link">Site, Instagram ou link do encarte (opcional)</label>
          <input id="link" className="input" inputMode="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
          <span className="help">Ajuda muito: mercados com site ou encarte publicado podem entrar na coleta automática.</span>
        </div>
        {erro && <div className="alert alert-error" role="alert">{erro}</div>}
        {ok && <div className="alert alert-ok" role="status">{ok}</div>}
        <button className="btn btn-primary" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar indicação'}</button>
      </form>
      {minhas.length > 0 && (
        <section className="stack">
          <h2>Suas indicações</h2>
          <div className="nota-lista">
            {minhas.map((m) => (
              <div key={m.id}>
                <b>{m.nome}</b>
                <span className="muted">{new Date(m.criado_em).toLocaleDateString('pt-BR')}</span>
                {m.bairro_ou_cidade && <span className="muted" style={{ gridColumn: '1 / -1' }}>{m.bairro_ou_cidade}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
