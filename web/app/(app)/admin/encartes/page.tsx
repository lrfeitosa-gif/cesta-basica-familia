'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';

type Oferta = {
  chave: string; produto: string; marca: string | null; quantidade: number; unidade: string;
  categoria: string; preco: number; preco_de: number | null; condicao: string | null; incluir: boolean;
};

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function EncartesAdmin() {
  const sessao = useSessao();
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [mercado, setMercado] = useState('Assaí');
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(ate);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [ocupado, setOcupado] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState(false);
  const selecionadas = useMemo(() => ofertas.filter((o) => o.incluir), [ofertas]);

  useEffect(() => {
    if (!sessao) return;
    supabase.rpc('eh_admin').then(({ data, error }) => setPermitido(!error && !!data));
  }, [sessao]);

  const extrair = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMensagem('');
    setErro(false);
    const form = e.currentTarget;
    const arquivos = form.querySelector<HTMLInputElement>('input[type="file"]')?.files;
    if (!arquivos?.length) { setErro(true); return setMensagem('Escolha as imagens do encarte.'); }
    if (arquivos.length > 5) { setErro(true); return setMensagem('Envie até 5 páginas por lote.'); }
    if (Array.from(arquivos).reduce((n, f) => n + f.size, 0) > 4_000_000) {
      setErro(true);
      return setMensagem('As imagens somam mais de 4 MB. Divida em lotes menores.');
    }

    const dados = new FormData();
    Array.from(arquivos).forEach((arquivo) => dados.append('arquivos', arquivo));
    setOcupado('Lendo as páginas do encarte…');
    try {
      const resposta = await fetch('/api/admin/encartes/extrair', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessao?.access_token ?? ''}` },
        body: dados,
      });
      const corpo = await resposta.json().catch(() => ({
        erro: resposta.status === 504 ? 'A leitura demorou demais. Envie uma ou duas páginas por vez.' : 'Não foi possível ler o encarte.',
      })) as { erro?: string; aviso?: string | null; ofertas?: Omit<Oferta, 'incluir'>[] };
      if (!resposta.ok) throw new Error(corpo.erro || 'Não foi possível ler o encarte.');
      setOfertas((corpo.ofertas ?? []).map((o) => ({ ...o, incluir: true })));
      setOcupado('');
      setErro(Boolean(corpo.aviso));
      setMensagem(`${corpo.ofertas?.length ?? 0} ofertas extraídas. Revise e marque o que deseja gravar.${corpo.aviso ? ` ${corpo.aviso}` : ''}`);
    } catch (erro) {
      setOcupado('');
      setErro(true);
      setMensagem((erro as Error).message);
    }
  };

  const importar = async () => {
    setMensagem('');
    setErro(false);
    if (!selecionadas.length) { setErro(true); return setMensagem('Marque ao menos uma oferta.'); }
    setOcupado('Gravando ofertas…');
    try {
      const resposta = await fetch('/api/admin/encartes/importar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessao?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mercado, inicio, fim, ofertas: selecionadas }),
      });
      const corpo = await resposta.json() as { erro?: string; ofertas?: number };
      if (!resposta.ok) throw new Error(corpo.erro || 'Não foi possível gravar o encarte.');
      setOfertas([]);
      setOcupado('');
      setMensagem(`Carga concluída: ${corpo.ofertas ?? 0} ofertas diárias gravadas para ${mercado}. Os produtos novos podem ser classificados em Administração → Cadastro base → Aplicar regras agora.`);
    } catch (erro) {
      setOcupado('');
      setErro(true);
      setMensagem((erro as Error).message);
    }
  };

  if (!sessao || permitido === null) return <><h1>Carga de encartes</h1><div className="empty">Carregando…</div></>;
  if (!permitido) return <><h1>Carga de encartes</h1><div className="empty">Área só para administradores.</div></>;

  return (
    <>
      <div>
        <p><Link href="/admin">← Administração</Link></p>
        <h1>Carga de encartes</h1>
        <p className="lead">Envie páginas do Assaí, Sonda, Revolução ou Cato, revise os preços extraídos e carregue as ofertas de Indaiatuba. Use um mercado e uma validade por lote.</p>
      </div>

      <form className="card stack" onSubmit={extrair}>
        <div className="field">
          <label htmlFor="encarte-arquivos">Páginas do encarte</label>
          <input id="encarte-arquivos" className="input" type="file" accept="image/jpeg,image/png,image/webp,.jfif,.jpg,.jpeg,.png,.webp" multiple />
          <span className="muted">JPG/JFIF, PNG ou WEBP; até 5 imagens e 4 MB por lote. Para mais páginas, envie outro lote do mesmo mercado.</span>
        </div>
        <div className="row">
          <div className="field" style={{ flex: '1 1 150px' }}>
            <label htmlFor="encarte-mercado">Mercado</label>
            <select id="encarte-mercado" className="input" value={mercado} onChange={(e) => setMercado(e.target.value)}>
              <option>Assaí</option>
              <option>Sonda</option>
              <option>Revolução</option>
              <option>Cato</option>
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 150px' }}>
            <label htmlFor="encarte-inicio">Válido de</label>
            <input id="encarte-inicio" className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '1 1 150px' }}>
            <label htmlFor="encarte-fim">Válido até</label>
            <input id="encarte-fim" className="input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={!!ocupado}>{ocupado || 'Ler encarte'}</button>
      </form>

      {mensagem && <div className={`alert ${erro ? 'alert-error' : 'alert-ok'}`} role={erro ? 'alert' : 'status'}>{mensagem}</div>}

      {!!ofertas.length && (
        <section className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><h2>Revisar ofertas ({ofertas.length})</h2><p className="muted">Confira os valores extraídos antes de gravar.</p></div>
            <label className="row"><input type="checkbox" checked={selecionadas.length === ofertas.length}
              onChange={(e) => setOfertas(ofertas.map((o) => ({ ...o, incluir: e.target.checked })))} /> Selecionar todas</label>
          </div>
          <div className="cat-itens">
            {ofertas.map((o, i) => (
              <div className="cat-item" key={`${o.chave}-${i}`}>
                <div className="cat-cab" style={{ alignItems: 'flex-start' }}>
                  <label className="row" style={{ alignItems: 'flex-start', flex: 1 }}>
                    <input type="checkbox" checked={o.incluir}
                      onChange={(e) => setOfertas(ofertas.map((x, n) => n === i ? { ...x, incluir: e.target.checked } : x))} />
                    <span><b>{o.produto}</b>{o.marca && <> · {o.marca}</>}<br />
                      <span className="muted">{o.quantidade} {o.unidade} · {o.categoria}{o.condicao ? ` · ${o.condicao}` : ''}</span></span>
                  </label>
                  <b>R$ {o.preco.toFixed(2).replace('.', ',')}{o.preco_de ? <small className="muted"> · de R$ {o.preco_de.toFixed(2).replace('.', ',')}</small> : null}</b>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-primary" disabled={!!ocupado || !selecionadas.length} onClick={importar}>
            {ocupado || `Gravar ${selecionadas.length} ofertas para ${mercado}`}
          </button>
        </section>
      )}
    </>
  );
}
