'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

// R7: caixa de opiniões. Texto livre; o app guarda junto a tela em que a pessoa estava e a data.
// Não pede nome nem dado pessoal: a opinião fica ligada só à conta (RLS: cada família lê as suas, a administradora lê todas).
export default function CaixaOpiniao({ tela, aberta, fechar }: { tela: string; aberta: boolean; fechar: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<'' | 'enviando' | 'ok' | 'erro'>('');

  useEffect(() => {
    const d = dlg.current; if (!d) return;
    if (aberta && !d.open) { setEstado(''); d.showModal(); }
    if (!aberta && d.open) d.close();
  }, [aberta]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (texto.trim().length < 3) return;
    setEstado('enviando');
    const { error } = await supabase.from('opiniao').insert({ texto: texto.trim().slice(0, 1000), tela: tela.slice(0, 100) });
    if (error) return setEstado('erro');
    setTexto(''); setEstado('ok');
  };

  return (
    <dialog ref={dlg} className="opiniao" aria-labelledby="op-titulo" onClose={fechar}
      onClick={(e) => { if (e.target === dlg.current) fechar(); }}>
      {estado === 'ok' ? (
        <div className="stack">
          <h2 id="op-titulo">Obrigada pela opinião!</h2>
          <p>Ela chegou e vai ajudar a melhorar o app. Pode mandar outra sempre que algo ajudar, confundir ou faltar.</p>
          <button type="button" className="btn btn-primary" onClick={fechar}>Fechar</button>
        </div>
      ) : (
        <form className="stack" onSubmit={enviar}>
          <h2 id="op-titulo">Dar opinião</h2>
          <div className="field">
            <label htmlFor="op-texto">O que ajudou, o que confundiu ou o que faltou?</label>
            <textarea id="op-texto" className="input" rows={5} maxLength={1000} required minLength={3}
              value={texto} onChange={(e) => { setTexto(e.target.value); if (estado === 'erro') setEstado(''); }} />
            <span className="help">Junto com o texto vai só a tela em que você está agora. Não precisa se identificar.</span>
          </div>
          {estado === 'erro' && <div className="alert alert-error" role="alert">Não foi possível enviar agora. Tente de novo em instantes.</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={fechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={estado === 'enviando' || texto.trim().length < 3}>
              {estado === 'enviando' ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
