'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { IconeCelular, IconeLuz, IconeNota, IconeReta } from './icones';
import dynamic from 'next/dynamic';
import { useSessao } from '@/lib/sessao';

// A câmera só existe no navegador: o leitor não é renderizado no servidor.
const Scanner = dynamic(() => import('@yudiel/react-qr-scanner').then((m) => m.Scanner), { ssr: false });
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

// Envio de nota fiscal (foto, QR Code ou link). Usado no topo da Cesta (14/11: a nota monta a cesta) e na tela
// Notas enviadas. `aoLer(id)` roda quando a nota foi lida; `acoes(id)` desenha os botões depois da leitura.
export default function EnviarNota({ aoLer, acoes, textoBotao = 'Fotografar ou escolher a nota' }: {
  aoLer?: (id: number) => void; acoes?: (id: number) => ReactNode; textoBotao?: string;
}) {
  const sessao = useSessao();
  const [modo, setModo] = useState<'foto' | 'camera' | 'link'>('foto');
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<{ tipo: 'ok' | 'erro' | 'lendo'; texto: string; abrir?: string; id?: number } | null>(null);
  const [dicas, setDicas] = useState(false);
  const [ultimaUrl, setUltimaUrl] = useState('');
  const lida = (texto: string, id: number) => { setStatus({ tipo: 'ok', texto, id }); aoLer?.(id); };
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
    lida(`${j.loja || 'Nota'} de ${dataBr(j.data)}: ${j.itens} itens, ${brl(j.total)}.`, j.id);
    setLink('');
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
      lida(`${j.loja} de ${dataBr(j.data)}: ${j.itens} itens, ${brl(j.total)}.`, j.id);
    } catch {
      setStatus({ tipo: 'erro', texto: 'Não conseguimos abrir a foto. Tente outra imagem.' });
    }
  };

  if (!sessao) return null;
  return (
    <div className="enviar-nota stack">
      <div className="segmentado" role="tablist" aria-label="Como enviar">
        {([['foto', 'Foto'], ['camera', 'QR Code'], ['link', 'Link']] as const).map(([m, r]) => (
          <button key={m} type="button" role="tab" aria-selected={modo === m} className={modo === m ? 'ativo' : ''} onClick={() => setModo(m)}>{r}</button>
        ))}
      </div>

      {modo === 'foto' ? (
        <div className="stack">
          {/* sem "capture": o celular oferece tirar foto ou escolher da galeria (print da página da nota na Sefaz) */}
          <label className="btn btn-primary btn-block btn-icone" htmlFor="foto-nota" aria-disabled={status?.tipo === 'lendo'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            {status?.tipo === 'lendo' ? 'Lendo a nota…' : textoBotao}
          </label>
          <input id="foto-nota" type="file" accept="image/*" className="visually-hidden"
            disabled={status?.tipo === 'lendo'}
            onChange={(e) => { enviarFoto(e.target.files?.[0]); e.target.value = ''; }} />
          <ul className="dicas-foto" aria-label="Dicas para a foto">
            <li><IconeNota />Nota inteira</li>
            <li><IconeLuz />Boa luz</li>
            <li><IconeReta />Reta</li>
            <li><IconeCelular />Print vale</li>
          </ul>
          <button type="button" className="link-dicas" aria-expanded={dicas} onClick={() => setDicas(!dicas)}>
            Dicas para uma leitura perfeita {dicas ? '▴' : '▾'}
          </button>
          {dicas && (
            <p className="muted dicas-texto">
              Fotografe a nota inteira, reta e bem iluminada. Nota comprida: fotografe a parte dos itens. Também vale o print da página da nota que abre pelo QR Code no celular.
            </p>
          )}
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
          {status.tipo === 'ok' && status.id && acoes && <div className="row" style={{ marginTop: 8 }}>{acoes(status.id)}</div>}
          {status.abrir && (
            <div className="row" style={{ marginTop: 8 }}>
              <a className="btn btn-secondary" href={status.abrir} target="_blank" rel="noopener noreferrer">Abrir a nota</a>
              <button type="button" className="btn btn-primary" onClick={() => { setModo('foto'); setStatus(null); }}>Enviar o print</button>
            </div>
          )}
        </div>
      )}

      <p className="aviso-privacidade">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
        A foto não é guardada. Ficam só itens, preços, loja e data; CPF e dados pessoais nunca.
      </p>
    </div>
  );
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
