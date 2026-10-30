'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';

// A câmera só existe no navegador: o leitor não é renderizado no servidor.
const Scanner = dynamic(() => import('@yudiel/react-qr-scanner').then((m) => m.Scanner), { ssr: false });

type Compra = { id: number; data: string; total: number | null; mercado: { rede: string } | null; itens: { count: number }[] };
const META = 3;
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

function Notas() {
  const sessao = useSessao();
  const onboarding = useSearchParams().get('onboarding') === '1';
  const [modo, setModo] = useState<'camera' | 'link'>('camera');
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<{ tipo: 'ok' | 'erro' | 'lendo'; texto: string } | null>(null);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [ultimaUrl, setUltimaUrl] = useState('');

  const carregar = async () => {
    const { data } = await supabase.from('compra')
      .select('id,data,total,mercado(rede),itens:item_comprado(count)')
      .eq('origem', 'nota').order('data', { ascending: false }).limit(20);
    setCompras((data as unknown as Compra[]) ?? []);
  };
  useEffect(() => { if (sessao) carregar(); }, [sessao]);

  const enviar = async (url: string) => {
    if (!sessao || url === ultimaUrl || status?.tipo === 'lendo') return;
    setUltimaUrl(url);
    if (!/p=\d{44}/.test(url)) return setStatus({ tipo: 'erro', texto: 'Esse QR Code não é de nota fiscal. Procure o código no rodapé da nota (NFC-e).' });
    setStatus({ tipo: 'lendo', texto: 'Lendo a nota na Sefaz…' });
    const r = await fetch('/api/nota', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.access_token}` },
      body: JSON.stringify({ url }),
    });
    const j = await r.json();
    if (!r.ok) return setStatus({ tipo: 'erro', texto: j.erro });
    setStatus({ tipo: 'ok', texto: `${j.loja || 'Nota'} de ${dataBr(j.data)}: ${j.itens} itens, ${brl(j.total)}.` });
    setLink('');
    carregar();
  };

  const colar = (e: FormEvent) => { e.preventDefault(); enviar(link.trim()); };

  if (!sessao) return null;
  const faltam = Math.max(0, META - compras.length);

  return (
    <>
      {onboarding && <div className="progress" aria-label="Passo 2 de 2"><span data-on="true" /><span data-on="true" /></div>}
      <div>
        <h1>{onboarding ? 'Suas últimas notas' : 'Notas fiscais'}</h1>
        <p className="lead">
          Leia o QR Code das últimas notas de supermercado. Com elas o app aprende o que sua família compra e quanto paga.
        </p>
      </div>

      {onboarding && (
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <span><b>{compras.length}</b> de {META} notas</span>
          <span className="muted">{faltam ? `faltam ${faltam}` : 'pronto para continuar'}</span>
        </div>
      )}

      <div className="choice" style={{ gridTemplateColumns: '1fr 1fr' }} role="radiogroup" aria-label="Como enviar">
        <label><input type="radio" name="modo" checked={modo === 'camera'} onChange={() => setModo('camera')} /><span>Câmera</span></label>
        <label><input type="radio" name="modo" checked={modo === 'link'} onChange={() => setModo('link')} /><span>Colar link</span></label>
      </div>

      {modo === 'camera' ? (
        <div className="stack">
          <div className="scanner">
            <Scanner onScan={(r) => r[0] && enviar(r[0].rawValue)} formats={['qr_code']} components={{ finder: true }}
              onError={() => setStatus({ tipo: 'erro', texto: 'Sem acesso à câmera. Permita o uso no navegador ou use "Colar link".' })} />
          </div>
          <p className="muted">Aponte para o QR Code no rodapé da nota. A leitura é automática.</p>
        </div>
      ) : (
        <form className="stack" onSubmit={colar}>
          <div className="field">
            <label htmlFor="link">Link da nota</label>
            <input id="link" className="input" inputMode="url" placeholder="https://www.nfce.fazenda.sp.gov.br/…?p=…"
              value={link} onChange={(e) => setLink(e.target.value)} />
            <span className="help">Leia o QR Code com o app da câmera do celular, copie o link e cole aqui.</span>
          </div>
          <button className="btn btn-primary btn-block" disabled={!link.trim() || status?.tipo === 'lendo'}>Enviar nota</button>
        </form>
      )}

      {status && (
        <div className={`alert ${status.tipo === 'erro' ? 'alert-error' : status.tipo === 'ok' ? 'alert-ok' : ''}`} role="status" aria-live="polite">
          {status.texto}
        </div>
      )}

      {compras.length > 0 && (
        <section className="stack">
          <h2>Notas registradas</h2>
          <div className="nota-lista">
            {compras.map((c) => (
              <div key={c.id}>
                <b>{c.mercado?.rede ?? 'Supermercado'}</b>
                {c.total != null && <span className="etiqueta">{brl(c.total)}</span>}
                <span className="muted" style={{ gridColumn: '1 / -1' }}>{dataBr(c.data)} · {c.itens[0]?.count ?? 0} itens</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="muted">Da nota guardamos só itens, quantidades, preços, loja e data. CPF e dados pessoais nunca são gravados.</p>

      {onboarding && (
        <div className="stack" style={{ marginTop: 'auto' }}>
          <Link href="/lista" className={`btn btn-block ${faltam ? 'btn-secondary' : 'btn-primary'}`}>
            {faltam ? 'Pular por enquanto' : 'Continuar'}
          </Link>
        </div>
      )}
    </>
  );
}

export default function Pagina() {
  return <Suspense><Notas /></Suspense>;
}
