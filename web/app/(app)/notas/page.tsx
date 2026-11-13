'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';

// A câmera só existe no navegador: o leitor não é renderizado no servidor.
const Scanner = dynamic(() => import('@yudiel/react-qr-scanner').then((m) => m.Scanner), { ssr: false });

// "PAO DE ACUCAR LTDA" → "Pão De Açúcar": nome da loja como vem na nota, só sem a caixa alta
const ACENTOS: Record<string, string> = { pao: 'Pão', acucar: 'Açúcar', sao: 'São', joao: 'João', jose: 'José', comercio: 'Comércio', alimentacao: 'Alimentação' };
const nomeLoja = (n: string) => n.toLowerCase().replace(/\b(ltda|eireli|me|epp|s\/?a)\b\.?/g, '').trim()
  .split(/\s+/).map((w) => ACENTOS[w] ?? (['de', 'da', 'do', 'das', 'dos', 'e'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

type Compra = { id: number; data: string; total: number | null; loja_nota?: string | null; mercado: { rede: string } | null; itens: { count: number }[] };
const META = 3;
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

function Notas() {
  const sessao = useSessao();
  const onboarding = useSearchParams().get('onboarding') === '1';
  const [modo, setModo] = useState<'foto' | 'camera' | 'link'>('foto');
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<{ tipo: 'ok' | 'erro' | 'lendo'; texto: string; abrir?: string; id?: number } | null>(null);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [ultimaUrl, setUltimaUrl] = useState('');
  // itens de cada nota, carregados quando a pessoa abre "Ver itens"
  const [itensNota, setItensNota] = useState<Record<number, { descricao_nota: string; quantidade: number; preco_unitario: number }[]>>({});
  const verItens = async (id: number) => {
    if (itensNota[id]) return;
    const { data } = await supabase.from('item_comprado').select('descricao_nota,quantidade,preco_unitario').eq('compra_id', id).order('id');
    setItensNota((m) => ({ ...m, [id]: data ?? [] }));
  };

  const carregar = async () => {
    const busca = (campos: string) => supabase.from('compra').select(campos)
      .in('origem', ['nota', 'foto']).order('data', { ascending: false }).limit(20);   // notas pelo QR Code e pela foto
    let { data, error } = await busca('id,data,total,loja_nota,mercado(rede),itens:item_comprado(count)');
    if (error) ({ data, error } = await busca('id,data,total,mercado(rede),itens:item_comprado(count)'));  // antes da migração 0009
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
    // A Sefaz costuma recusar consultas vindas de servidores, mas abre no navegador do celular:
    // aí a pessoa abre a nota, tira um print e envia em "Foto da nota".
    if (r.status === 502) return setStatus({ tipo: 'erro', abrir: url,
      texto: 'A Sefaz não respondeu ao app. Abra a nota no navegador, tire um print da página com os itens e envie em "Foto da nota".' });
    if (!r.ok) return setStatus({ tipo: 'erro', texto: j.erro });
    setStatus({ tipo: 'ok', texto: `${j.loja || 'Nota'} de ${dataBr(j.data)}: ${j.itens} itens, ${brl(j.total)}.`, id: j.id });
    setLink('');
    carregar();
  };

  const colar = (e: FormEvent) => { e.preventDefault(); enviar(link.trim()); };

  // Foto do cupom: reduz no próprio celular (lado maior 1600 px, JPEG) e envia para leitura pelo modelo de visão.
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
      setStatus({ tipo: 'ok', texto: `${j.loja} de ${dataBr(j.data)}: ${j.itens} itens, ${brl(j.total)}.`, id: j.id });
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
            {status?.tipo === 'lendo' ? 'Lendo…' : 'Fotografar a nota'}
          </label>
          <input id="foto-nota" type="file" accept="image/*" capture="environment" className="visually-hidden"
            disabled={status?.tipo === 'lendo'}
            onChange={(e) => { enviarFoto(e.target.files?.[0]); e.target.value = ''; }} />
          {/* sem "capture": abre a galeria, para enviar o print da página da nota na Sefaz */}
          <label className="btn btn-secondary btn-block" htmlFor="print-nota" aria-disabled={status?.tipo === 'lendo'}>
            Escolher foto ou print da galeria
          </label>
          <input id="print-nota" type="file" accept="image/*" className="visually-hidden"
            disabled={status?.tipo === 'lendo'}
            onChange={(e) => { enviarFoto(e.target.files?.[0]); e.target.value = ''; }} />
          <p className="muted">
            Fotografe a nota inteira, reto e bem iluminado. Nota comprida: fotografe a parte dos itens. Também vale o print da página da nota que abre pelo QR Code no celular.
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
          {status.tipo === 'ok' && (
            <div className="row" style={{ marginTop: 8 }}>
              {status.id && <Link className="btn btn-primary" href={`/compra?nota=${status.id}`}>Usar na cesta →</Link>}
              <button type="button" className="btn btn-secondary" onClick={() => document.getElementById('notas-registradas')?.scrollIntoView({ behavior: 'smooth' })}>Ver as notas</button>
            </div>
          )}
          {status.abrir && (
            <div className="row" style={{ marginTop: 8 }}>
              <a className="btn btn-secondary" href={status.abrir} target="_blank" rel="noopener noreferrer">Abrir a nota</a>
              <button type="button" className="btn btn-primary" onClick={() => { setModo('foto'); setStatus(null); }}>Enviar o print</button>
            </div>
          )}
        </div>
      )}

      {compras.length > 0 && (
        <section className="stack" id="notas-registradas">
          <h2>Notas registradas</h2>
          <div className="nota-lista">
            {compras.map((c) => (
              <div key={c.id}>
                <b>{c.mercado?.rede ?? (c.loja_nota ? nomeLoja(c.loja_nota) : 'Mercado não identificado')}</b>
                {c.total != null && <span className="etiqueta">{brl(c.total)}</span>}
                <span className="muted" style={{ gridColumn: '1 / -1' }}>{dataBr(c.data)} · {c.itens[0]?.count ?? 0} itens</span>
                <details style={{ gridColumn: '1 / -1' }} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) verItens(c.id); }}>
                  <summary className="btn-link">Ver itens</summary>
                  {itensNota[c.id] ? (
                    <ul className="nota-itens">
                      {itensNota[c.id].map((i, k) => (
                        <li key={k}>{String(i.quantidade).replace('.', ',')}× {i.descricao_nota} · {brl(i.preco_unitario)}</li>
                      ))}
                    </ul>
                  ) : <span className="muted">Carregando…</span>}
                </details>
                <Link href={`/compra?nota=${c.id}`} className="btn btn-link" style={{ gridColumn: '1 / -1', justifySelf: 'start', padding: 0 }}>
                  Usar na cesta →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="aviso-nota">A foto não é guardada. Da nota ficam só itens, quantidades, preços, loja e data; CPF e dados pessoais nunca são gravados.</p>

      {onboarding && (
        <div className="stack" style={{ marginTop: 'auto' }}>
          <Link href="/ofertas" className={`btn btn-block ${faltam ? 'btn-secondary' : 'btn-primary'}`}>
            {faltam ? 'Fazer depois e ver os preços' : 'Continuar para os preços'}
          </Link>
        </div>
      )}
      {!onboarding && compras.length > 0 && <Link href="/lista" className="btn btn-secondary btn-block">Ver todos os itens comprados</Link>}
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
