'use client';
import { useState, type FormEvent } from 'react';
import { MAX_REFERENCIAS, type Referencia } from '@/lib/locais';

// Até 3 endereços de referência (casa, trabalho, escola) informados por CEP. Guardamos só rótulo e região (~1 km).
export default function Enderecos({ refs, adicionar, remover }: {
  refs: Referencia[];
  adicionar: (rotulo: string, cep: string) => Promise<string | null>;
  remover: (id: number) => Promise<void>;
}) {
  const [rotulo, setRotulo] = useState('');
  const [cep, setCep] = useState('');
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (cep.replace(/\D/g, '').length !== 8) return setMsg({ erro: true, texto: 'CEP inválido. Use 8 números, como 13330-000.' });
    setSalvando(true); setMsg(null);
    const r = await adicionar(rotulo, cep);
    setSalvando(false);
    if (r && !r.startsWith('Salvo')) return setMsg({ erro: true, texto: r });
    setMsg(r ? { erro: false, texto: r } : null);
    setRotulo(''); setCep('');
  };

  return (
    <details className="card enderecos" open={refs.length === 0}>
      <summary>
        <b>Seus endereços</b>
        <span className="muted">{refs.length ? refs.map((r) => r.rotulo).join(', ') : 'Informe um CEP para ver a distância até cada mercado'}</span>
        <span className="mkt enderecos-acao">{refs.length ? 'Alterar' : 'Adicionar'}</span>
      </summary>
      <div className="stack" style={{ marginTop: 12 }}>
        {refs.map((r) => (
          <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span>📍 {r.rotulo}</span>
            <button type="button" className="btn-remover" onClick={() => remover(r.id)}>remover</button>
          </div>
        ))}
        {refs.length < MAX_REFERENCIAS && (
          <form className="row" onSubmit={salvar} style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 120px' }}>
              <label htmlFor="ref-rotulo">Nome</label>
              <input id="ref-rotulo" className="input" placeholder="Casa, Trabalho…" value={rotulo} onChange={(e) => setRotulo(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 120px' }}>
              <label htmlFor="ref-cep">CEP</label>
              <input id="ref-cep" className="input" inputMode="numeric" placeholder="13330-000" value={cep} onChange={(e) => setCep(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={salvando}>{salvando ? 'Buscando…' : 'Adicionar'}</button>
          </form>
        )}
        {msg && <div className={`alert ${msg.erro ? 'alert-error' : 'alert-ok'}`} role="status">{msg.texto}</div>}
        <span className="muted">
          Até {MAX_REFERENCIAS} endereços. Guardamos só o nome e a região aproximada (cerca de 1 km), nunca o CEP ou a rua.
          As distâncias são em linha reta.
        </span>
      </div>
    </details>
  );
}
