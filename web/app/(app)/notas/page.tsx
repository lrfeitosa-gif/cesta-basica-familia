'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';
import EnviarNota from '../enviar-nota';

// "PAO DE ACUCAR LTDA" → "Pão De Açúcar": nome da loja como vem na nota, só sem a caixa alta
const ACENTOS: Record<string, string> = { pao: 'Pão', acucar: 'Açúcar', sao: 'São', joao: 'João', jose: 'José', comercio: 'Comércio', alimentacao: 'Alimentação' };
const nomeLoja = (n: string) => n.toLowerCase().replace(/\b(ltda|eireli|me|epp|s\/?a)\b\.?/g, '').trim()
  .split(/\s+/).map((w) => ACENTOS[w] ?? (['de', 'da', 'do', 'das', 'dos', 'e'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

type Compra = { id: number; data: string; total: number | null; origem?: string; loja_nota?: string | null; mercado: { rede: string } | null; itens: { count: number }[] };
const META = 3;
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

function Notas() {
  const sessao = useSessao();
  const onboarding = useSearchParams().get('onboarding') === '1';
  const [compras, setCompras] = useState<Compra[]>([]);
  const [listaCarregada, setListaCarregada] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);   // nota com os itens abertos
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
    let { data, error } = await busca('id,data,total,origem,loja_nota,mercado(rede),itens:item_comprado(count)');
    if (error) ({ data, error } = await busca('id,data,total,mercado(rede),itens:item_comprado(count)'));  // antes da migração 0009
    setCompras((data as unknown as Compra[]) ?? []);
    setListaCarregada(true);
  };
  useEffect(() => { if (sessao) carregar(); }, [sessao]);

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
        <h1>{onboarding ? 'Suas últimas notas' : 'Notas enviadas'}</h1>
        <p className="lead">
          Envie suas notas para facilitar a composição da cesta, a comparação de preços e a criação de notificações.
        </p>
      </div>

      {onboarding && (
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <span><b>{compras.length}</b> de {META} notas</span>
          <span className="muted">{faltam ? `faltam ${faltam}` : 'pronto para continuar'}</span>
        </div>
      )}

      <EnviarNota aoLer={() => carregar()} acoes={(id) => (
        <>
          <Link className="btn btn-primary" href={`/compra?nota=${id}`}>Usar na cesta →</Link>
          <button type="button" className="btn btn-secondary" onClick={() => document.getElementById('notas-registradas')?.scrollIntoView({ behavior: 'smooth' })}>Ver as notas</button>
        </>
      )} />

      {!listaCarregada ? (
        <div className="nota-cards" aria-label="Carregando as notas">
          {[0, 1].map((i) => <div key={i} className="nota-card esqueleto"><span className="esq" style={{ width: '55%' }} /><span className="esq" style={{ width: '35%' }} /></div>)}
        </div>
      ) : compras.length > 0 && (
        <section className="stack" id="notas-registradas">
          <h2 className="section-title">Notas registradas</h2>
          <div className="nota-cards">
            {compras.map((c) => {
              const nome = c.mercado?.rede ?? (c.loja_nota ? nomeLoja(c.loja_nota) : 'Mercado não identificado');
              const itens = itensNota[c.id];
              return (
                <article key={c.id} className="nota-card">
                  <div className="nota-cab">
                    <span className="nota-ico" aria-hidden="true">{nome.charAt(0).toUpperCase()}</span>
                    <span className="nota-titulo"><b>{nome}</b><small>{dataBr(c.data)} · {c.itens[0]?.count ?? 0} itens</small></span>
                    {c.total != null && <span className="nota-total">{brl(c.total)}</span>}
                  </div>
                  <div className="nota-meta">
                    <span className="selo-ok">✓ Lida</span>
                    <span className="selo-origem">{c.origem === 'foto' ? 'Foto' : 'QR Code'}</span>
                  </div>
                  <div className="nota-acoes">
                    <button type="button" className="nota-ver" aria-expanded={aberta === c.id}
                      onClick={() => { const abrir = aberta !== c.id; setAberta(abrir ? c.id : null); if (abrir) verItens(c.id); }}>
                      {aberta === c.id ? 'Esconder itens ▴' : 'Ver itens ▾'}
                    </button>
                    <Link href={`/compra?nota=${c.id}`} className="nota-usar">Usar na cesta →</Link>
                  </div>
                  {aberta === c.id && (itens ? (
                    itens.length ? (
                      <ul className="nota-itens">
                        {itens.map((i, k) => <li key={k}>{String(i.quantidade).replace('.', ',')}× {i.descricao_nota} · {brl(i.preco_unitario)}</li>)}
                      </ul>
                    ) : <span className="muted">Nenhum item nesta nota.</span>
                  ) : (
                    <div className="nota-itens-esq" aria-label="Carregando os itens"><span className="esq" /><span className="esq" /><span className="esq" /></div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>
      )}


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

