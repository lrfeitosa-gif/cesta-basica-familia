'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { desligarPush, estadoPush, ligarPush, type EstadoPush } from '@/lib/push';
import { horaBr } from '@/lib/ofertas';

type Enviado = { id: number; mensagem: string | null; enviado_em: string; canais: string[] };

const TEXTO_PUSH: Record<EstadoPush, string> = {
  ligado: 'Ligado neste aparelho.',
  desligado: 'Desligado neste aparelho.',
  bloqueado: 'Bloqueado nas configurações do navegador. Libere as notificações deste site para ligar.',
  instalar: 'No iPhone, adicione o app à tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá para ligar.',
  'sem-suporte': 'Este navegador não recebe notificações. Use o e-mail.',
};

// Como a família quer ser avisada (item 10 de 12/11): notificação no celular e/ou e-mail, uma vez por dia,
// depois da coleta das 7h. Embaixo, os últimos avisos enviados.
export default function ComoAvisar({ familiaId }: { familiaId: string }) {
  const [push, setPush] = useState<EstadoPush | null>(null);
  const [email, setEmail] = useState<boolean | null>(null);
  const [enviados, setEnviados] = useState<Enviado[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    estadoPush().then(setPush).catch(() => setPush('sem-suporte'));
    supabase.from('familia').select('aviso_email').eq('id', familiaId).maybeSingle()
      .then(({ data }) => setEmail(!!data?.aviso_email));
    supabase.from('alerta').select('id,mensagem,enviado_em,canais').not('mensagem', 'is', null)
      .order('enviado_em', { ascending: false }).limit(10)
      .then(({ data }) => setEnviados((data as Enviado[]) ?? []));
  }, [familiaId]);

  const trocarPush = async () => {
    setOcupado(true); setErro('');
    try { setPush(push === 'ligado' ? await desligarPush() : await ligarPush(familiaId)); }
    catch { setErro('Não foi possível ligar a notificação agora. Tente de novo.'); }
    setOcupado(false);
  };
  const trocarEmail = async () => {
    setOcupado(true); setErro('');
    await supabase.rpc('garantir_familia');
    const { error } = await supabase.from('familia').update({ aviso_email: !email }).eq('id', familiaId);
    if (error) setErro('Não foi possível mudar o aviso por e-mail. Tente de novo.'); else setEmail(!email);
    setOcupado(false);
  };
  const podeLigar = push === 'ligado' || push === 'desligado';

  return (
    <section className="card stack avisar">
      <div>
        <h2>Como avisar</h2>
        <p className="muted">Uma vez por dia, depois da coleta das 7h, quando algum alerta tiver preço bom.</p>
      </div>
      <label className="avisar-linha">
        <span><b>Notificação no celular</b><small>{push ? TEXTO_PUSH[push] : 'Conferindo…'}</small></span>
        <input type="checkbox" role="switch" className="chave" checked={push === 'ligado'} disabled={!podeLigar || ocupado} onChange={trocarPush} />
      </label>
      <label className="avisar-linha">
        <span><b>E-mail</b><small>{email ? 'Ligado: chega no e-mail da sua conta.' : 'Desligado.'}</small></span>
        <input type="checkbox" role="switch" className="chave" checked={!!email} disabled={email === null || ocupado} onChange={trocarEmail} />
      </label>
      {erro && <div className="alert alert-error" role="alert">{erro}</div>}
      {enviados.length > 0 && (
        <details className="avisar-enviados">
          <summary>Últimos avisos ({enviados.length})</summary>
          <ul>
            {enviados.map((a) => (
              <li key={a.id}>
                {a.mensagem}
                <small className="muted"> {horaBr(a.enviado_em)}{a.canais.length ? `, por ${a.canais.join(' e ').replace('celular', 'notificação')}` : ', só no app'}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
