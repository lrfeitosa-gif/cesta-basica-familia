'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';
import { horaBr } from '@/lib/ofertas';
import Link from 'next/link';

type Usuario = {
  id: string; email: string; criado_em: string; confirmado_em: string | null; ultimo_login: string | null; convite: string | null;
  notas: number; itens_nota: number; alertas: number; enderecos: number; cesta: number; opinioes: number; bytes: number;
};
type Convite = { codigo: string; descricao: string | null; usos_max: number; usos: number; valido_ate: string | null };
type Resumo = { banco_bytes: number; ofertas: number; ofertas_bytes: number; produtos: number; max_contas: number; convites: Convite[] };
type Evento = { id: number; user_id: string | null; tipo: string; detalhe: string | null; criado_em: string };
type Opiniao = { id: number; user_id: string; texto: string; tela: string | null; criado_em: string };

const kb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const dia = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const diasAtras = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);
const ROTULO: Record<string, string> = {
  login_ok: 'Entrou', login_erro: 'Erro ao entrar', cadastro_inicio: 'Começou o cadastro', cadastro_erro: 'Erro no cadastro',
  cadastro_ok: 'Cadastro enviado', tela: 'Abriu tela', erro_app: 'Erro na tela',
  cesta_montada: 'Montou a cesta', primeiros_passos: 'Primeiros passos',
};
// Ação de valor (spec do piloto): alerta, endereço de interesse ou compra montada na Cesta. Nota fiscal também conta.
const usou = (u: Usuario) => u.alertas > 0 || u.enderecos > 0 || u.cesta > 0 || u.notas > 0;
const DIAS_AJUDA = 3;

// Painel de administração: contas, uso, volume, convites, eventos e previsão de novos usuários.
// Os dados vêm de funções do banco que só respondem para quem está na tabela "administrador".
export default function Admin() {
  const sessao = useSessao();
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [opinioes, setOpinioes] = useState<Opiniao[]>([]);
  const [filtro, setFiltro] = useState('');
  const [novo, setNovo] = useState({ codigo: '', descricao: '', usos: '10' });
  const [msg, setMsg] = useState('');

  const carregar = async () => {
    const [u, r, e, o] = await Promise.all([
      supabase.rpc('admin_usuarios'),
      supabase.rpc('admin_resumo'),
      supabase.from('evento').select('id,user_id,tipo,detalhe,criado_em').order('criado_em', { ascending: false }).limit(500),
      supabase.from('opiniao').select('id,user_id,texto,tela,criado_em').order('criado_em', { ascending: false }).limit(300),
    ]);
    if (u.error) return setPermitido(false);
    setPermitido(true);
    setUsuarios((u.data ?? []) as Usuario[]);
    setResumo(r.data as Resumo);
    setEventos((e.data ?? []) as Evento[]);
    setOpinioes((o.data ?? []) as Opiniao[]);
  };
  useEffect(() => { if (sessao) carregar(); }, [sessao]);   // eslint-disable-line react-hooks/exhaustive-deps

  const emailDe = useMemo(() => new Map(usuarios.map((u) => [u.id, u.email])), [usuarios]);

  // R1: resultado de cada código de convite (grupo de origem)
  const porConvite = useMemo(() => (resumo?.convites ?? []).map((c) => {
    const contas = usuarios.filter((u) => u.convite === c.codigo.toUpperCase());
    return { ...c, contas: contas.length, ativas: contas.filter(usou).length, entraram7: contas.filter((u) => diasAtras(u.ultimo_login) <= 7).length };
  }), [usuarios, resumo]);

  // Novas contas por dia e projeção: média diária das últimas 2 semanas, limitada pelas vagas do piloto.
  const previsao = useMemo(() => {
    if (!usuarios.length || !resumo) return null;
    const porDia = new Map<string, number>();
    for (const u of usuarios) porDia.set(dia(u.criado_em), (porDia.get(dia(u.criado_em)) ?? 0) + 1);
    const ultimas2sem = usuarios.filter((u) => diasAtras(u.criado_em) <= 14).length;
    const ritmo = ultimas2sem / 14;
    const vagasConvite = resumo.convites.reduce((t, c) => t + Math.max(0, c.usos_max - c.usos), 0);
    const teto = Math.min(resumo.max_contas, usuarios.length + vagasConvite);
    const em = (d: number) => Math.min(teto, Math.round(usuarios.length + ritmo * d));
    const diasAteTeto = ritmo > 0 ? Math.ceil((teto - usuarios.length) / ritmo) : null;
    return { porDia: [...porDia.entries()].sort(), ritmo, teto, em7: em(7), em30: em(30), diasAteTeto, vagasConvite };
  }, [usuarios, resumo]);

  const criarConvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!novo.codigo.trim()) return setMsg('Digite um código.');
    const { error } = await supabase.rpc('admin_criar_convite', { p_codigo: novo.codigo, p_descricao: novo.descricao, p_usos: Number(novo.usos) || 1 });
    setMsg(error ? (/duplicate/i.test(error.message) ? 'Esse código já existe.' : 'Não foi possível criar.') : `Convite ${novo.codigo.trim().toUpperCase()} criado.`);
    if (!error) { setNovo({ codigo: '', descricao: '', usos: '10' }); carregar(); }
  };

  if (!sessao || permitido === null) return <h1>Administração</h1>;
  if (!permitido) return <><h1>Administração</h1><div className="empty">Esta área é só para administradores.</div></>;

  const confirmados = usuarios.filter((u) => u.confirmado_em).length;
  const ativos7 = usuarios.filter((u) => diasAtras(u.ultimo_login) <= 7).length;
  const naoConfirmaram = usuarios.filter((u) => !u.confirmado_em);
  // R3: 3 dias ou mais de cadastro e nenhuma ação de valor (sai da lista assim que faz qualquer uma)
  const precisaAjuda = usuarios.filter((u) => diasAtras(u.criado_em) >= DIAS_AJUDA && !usou(u))
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const ativas = usuarios.filter(usou).length;
  const errosLogin = eventos.filter((e) => e.tipo === 'login_erro');
  // desistência no cadastro: começou e não terminou (mesmo domínio de e-mail, sem "cadastro_ok" depois)
  const desistencias = eventos.filter((e) => e.tipo === 'cadastro_inicio'
    && !eventos.some((x) => x.tipo === 'cadastro_ok' && x.detalhe === e.detalhe && x.criado_em >= e.criado_em)).length;
  const lista = filtro ? eventos.filter((e) => e.tipo === filtro) : eventos;

  return (
    <>
      <div>
        <h1>Administração</h1>
        <p><Link href="/admin/catalogo" className="btn btn-secondary">Cadastro base de produtos →</Link></p>
        <p><Link href="/admin/encartes" className="btn btn-secondary">Carregar encartes do Assaí ou Sonda →</Link></p>
        <p className="lead">Contas, uso e volume do piloto.</p>
      </div>

      <section className="adm-numeros">
        <div><b>{usuarios.length}</b><span>contas (máx. {resumo?.max_contas})</span></div>
        <div><b>{confirmados}</b><span>confirmaram o e-mail</span></div>
        <div><b>{ativos7}</b><span>entraram nos últimos 7 dias</span></div>
        <div><b>{ativas}</b><span>fizeram ao menos 1 ação de valor</span></div>
        <div><b>{precisaAjuda.length}</b><span>precisam de ajuda</span></div>
        <div><b>{opinioes.length}</b><span>opiniões recebidas</span></div>
        <div><b>{naoConfirmaram.length}</b><span>não confirmaram</span></div>
        <div><b>{desistencias}</b><span>começaram o cadastro e desistiram</span></div>
        <div><b>{errosLogin.length}</b><span>erros ao entrar</span></div>
      </section>

      {previsao && (
        <section className="card stack">
          <h2>Previsão de novos usuários</h2>
          <p>
            Ritmo das últimas 2 semanas: <b>{previsao.ritmo.toFixed(1).replace('.', ',')} contas por dia</b>.
            Em 7 dias: <b>≈ {previsao.em7}</b> contas; em 30 dias: <b>≈ {previsao.em30}</b>.
          </p>
          <p className="muted">
            Teto atual: {previsao.teto} contas ({previsao.vagasConvite} vagas nos convites, limite do piloto {resumo?.max_contas}).
            {previsao.diasAteTeto !== null && previsao.diasAteTeto > 0 && ` Nesse ritmo, o teto chega em cerca de ${previsao.diasAteTeto} dias.`}
            {' '}Com poucas contas, a previsão é só uma referência: ela melhora conforme o grupo de teste entra.
          </p>
          <div className="adm-barras" aria-label="Novas contas por dia">
            {previsao.porDia.slice(-30).map(([d, n]) => (
              <div key={d} title={`${d.split('-').reverse().join('/')}: ${n}`}>
                <span style={{ height: `${Math.min(100, n * 20)}%` }} />
                <small>{d.slice(8)}/{d.slice(5, 7)}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>Convites</h2>
        <p className="muted">Resultado por grupo de origem. Ativas: fizeram ao menos uma ação de valor (alerta, endereço, cesta montada ou nota).</p>
        <div className="adm-tabela" role="table">
          <div role="row" className="cab adm-conv"><span>Código</span><span>Grupo</span><span>Vagas usadas</span><span>Ativas</span><span>Entraram em 7 dias</span></div>
          {porConvite.map((c) => (
            <div role="row" className="adm-conv" key={c.codigo}>
              <span><b>{c.codigo}</b></span>
              <span>{c.descricao || '—'}</span>
              <span>{c.usos} de {c.usos_max}</span>
              <span>{c.ativas} de {c.contas}{c.contas ? ` (${Math.round((c.ativas / c.contas) * 100)}%)` : ''}</span>
              <span>{c.entraram7}</span>
            </div>
          ))}
        </div>
        <form className="row" onSubmit={criarConvite} style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 110px' }}><label htmlFor="cv-cod">Código</label>
            <input id="cv-cod" className="input" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} /></div>
          <div className="field" style={{ flex: '2 1 150px' }}><label htmlFor="cv-desc">Para quem</label>
            <input id="cv-desc" className="input" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} /></div>
          <div className="field" style={{ flex: '0 1 80px' }}><label htmlFor="cv-usos">Vagas</label>
            <input id="cv-usos" className="input" inputMode="numeric" value={novo.usos} onChange={(e) => setNovo({ ...novo, usos: e.target.value })} /></div>
          <button className="btn btn-primary">Criar</button>
        </form>
        {msg && <div className="alert alert-ok" role="status">{msg}</div>}
      </section>

      <section className="card stack">
        <h2>Precisa de ajuda</h2>
        <p className="muted">Contas com {DIAS_AJUDA} dias ou mais de cadastro e nenhuma ação de valor (zero alertas, endereços, cesta montada e notas).</p>
        {precisaAjuda.length ? (
          <ul className="adm-ajuda dados-lista">
            {precisaAjuda.map((u) => (
              <li key={u.id}>
                <b>{u.email}</b> · há {Math.floor(diasAtras(u.criado_em))} dias{u.convite ? ` · convite ${u.convite}` : ''}
                {' '}· último acesso: {u.ultimo_login ? horaBr(u.ultimo_login) : 'nunca'}
              </li>
            ))}
          </ul>
        ) : <p>Ninguém por enquanto.</p>}
      </section>

      <section className="stack">
        <h2>Pessoas</h2>
        <div className="adm-tabela" role="table">
          <div role="row" className="cab"><span>E-mail</span><span>Criada</span><span>Último acesso</span><span>Notas · alertas · end. · cesta</span><span>Volume</span></div>
          {usuarios.map((u) => (
            <div role="row" key={u.id}>
              <span>{u.email}{!u.confirmado_em && <em className="cond"> não confirmou</em>}</span>
              <span>{horaBr(u.criado_em)}</span>
              <span>{u.ultimo_login ? horaBr(u.ultimo_login) : '—'}</span>
              <span>{u.notas} ({u.itens_nota} itens) · {u.alertas} · {u.enderecos} · {u.cesta ? 'sim' : 'não'}</span>
              <span>{kb(u.bytes)}</span>
            </div>
          ))}
        </div>
        {resumo && (
          <p className="muted">
            Banco inteiro: {kb(resumo.banco_bytes)} (limite do plano grátis: 500 MB). Preços coletados: {resumo.ofertas.toLocaleString('pt-BR')} linhas,
            {' '}{kb(resumo.ofertas_bytes)}; produtos: {resumo.produtos.toLocaleString('pt-BR')}.
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>Opiniões</h2>
        {opinioes.length ? (
          <ul className="adm-opinioes dados-lista">
            {opinioes.map((o) => (
              <li key={o.id}>
                <span className="muted">{horaBr(o.criado_em)} · {emailDe.get(o.user_id) ?? 'conta excluída'}{o.tela ? ` · tela ${o.tela}` : ''}</span>
                <p>{o.texto}</p>
              </li>
            ))}
          </ul>
        ) : <p>Nenhuma opinião ainda.</p>}
      </section>

      <section className="stack">
        <h2>Eventos recentes</h2>
        <select className="marca-sel" aria-label="Filtrar eventos" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos ({eventos.length})</option>
          {Object.entries(ROTULO).map(([k, r]) => <option key={k} value={k}>{r} ({eventos.filter((e) => e.tipo === k).length})</option>)}
        </select>
        <ul className="adm-eventos">
          {lista.slice(0, 150).map((e) => (
            <li key={e.id} className={e.tipo.includes('erro') ? 'erro' : ''}>
              <span className="muted">{horaBr(e.criado_em)}</span> <b>{ROTULO[e.tipo] ?? e.tipo}</b>
              {e.user_id && <> · {emailDe.get(e.user_id) ?? 'conta excluída'}</>}
              {e.detalhe && <> · <span className="muted">{e.detalhe}</span></>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
