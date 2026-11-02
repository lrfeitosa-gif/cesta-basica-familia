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
  const [modo, setModo] = useState<'foto' | 'camera' | 'link'>('foto');
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

  // Foto do cupom: reduz no próprio celular (lado maior 1600 px, JPEG) e envia para leitura pelo Claude.
  const enviarFoto = async (arquivo: File | undefined) => {
    if (!sessao || !arquivo || status?.tipo === 'lendo') return;
    setStatus({ tipo: 'lendo', texto: 'Lendo a foto da nota… leva uns 20 segundos.' });
    try {
      const imagem = await reduzir(arquivo);
      const r = await fetch('/api/nota-foto', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.access_token}` },
        body: JSON.stringify({ imagem, tipo: 'image/jpeg' }),
      });
      const j = await r.json().catch(() => ({ erro: 'Não conseguimos ler a foto agora. Tente de novo.' }));
      if (!r.ok) return setStatus({ tipo: 'erro', texto: j.erro });
      setStatus({ tipo: 'ok', texto: `${j.loja} de ${dataBr(j.data)}: ${j.itens} itens, ${brl(j.total)}.` });
      carregar();
    } catch {
      setStatus({ tipo: 'erro', texto: 'Não conseguimos abrir a foto. Tente outra imagem.' });
    }
  };

  if (!sessao) return null;
  const faltam = Math.max(0, META - compras.length);

  return (
    <>
      {onboarding && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="progress" aria-label="Passo 2 de 2" style={{ flex: 1 }}><span data-on="true" /><span data-on="true" /></div>
          <Link href="/ofertas" className="btn btn-link">Fazer depois</Link>
        </div>
      )}
      <div>
        <h1>{onboarding ? 'Suas últimas notas' : 'Notas fiscais'}</h1>
        <p className="lead">
          Envie as últimas notas de supermercado por foto ou QR Code. Com elas o app aprende o que sua família compra e quanto paga.
        </p>
      </div>

      {onboarding && (
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <span><b>{compras.length}</b> de {META} notas</span>
          <span className="muted">{faltam ? `faltam ${faltam}` : 'pronto para continuar'}</span>
        </div>
      )}

      <div className="choice" role="radiogroup" aria-label="Como enviar">
        <label><input type="radio" name="modo" checked={modo === 'foto'} onChange={() => setModo('foto')} /><span>Foto da nota</span></label>
        <label><input type="radio" name="modo" checked={modo === 'camera'} onChange={() => setModo('camera')} /><span>QR Code</span></label>
        <label><input type="radio" name="modo" checked={modo === 'link'} onChange={() => setModo('link')} /><span>Colar link</span></label>
      </div>

      {modo === 'foto' ? (
        <div className="stack">
          <label className="btn btn-primary btn-block" htmlFor="foto-nota" aria-disabled={status?.tipo === 'lendo'}>
            {status?.tipo === 'lendo' ? 'Lendo…' : 'Fotografar ou escolher a nota'}
          </label>
          <input id="foto-nota" type="file" accept="image/*" capture="environment" className="visually-hidden"
            disabled={status?.tipo === 'lendo'}
            onChange={(e) => { enviarFoto(e.target.files?.[0]); e.target.value = ''; }} />
          <p className="muted">
            Fotografe o cupom inteiro, reto e bem iluminado. Nota comprida: fotografe a parte dos itens.
            A foto não é guardada; só itens, preços, loja e data.
          </p>
        </div>
      ) : modo === 'camera' ? (
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
          <Link href="/ofertas" className={`btn btn-block ${faltam ? 'btn-secondary' : 'btn-primary'}`}>
            {faltam ? 'Fazer depois e ver os preços' : 'Continuar para os preços'}
          </Link>
        </div>
      )}
      {!onboarding && compras.length > 0 && <Link href="/lista" className="btn btn-secondary btn-block">Ver itens das minhas notas</Link>}
    </>
  );
}

export default function Pagina() {
  return <Suspense><Notas /></Suspense>;
}

// Reduz a foto para o lado maior ter no máximo 1600 px e devolve o JPEG em base64 (sem o prefixo data:).
function reduzir(arquivo: File, lado = 1600): Promise<string> {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('imagem')); };
    img.src = url;
  });
}
