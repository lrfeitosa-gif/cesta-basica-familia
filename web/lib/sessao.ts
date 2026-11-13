'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Tempo sem abrir o app até encerrar a sessão. Como nos apps de compras: quem usa fica conectado;
// a Administração, que mexe nos dados de todos, tem sessão curta (OWASP ASVS / NIST 800-63B).
export const DIAS_SEM_USO = 30;
export const MINUTOS_SEM_USO_ADMIN = 60;
const CHAVE_USO = 'ultimo-uso';
// Por que a sessão terminou: 'sair' (botão Sair, sem aviso), 'inatividade' ou vazio (expirou sozinha).
let motivoSaida: '' | 'sair' | 'inatividade' = '';
export const marcarSaida = () => { motivoSaida = 'sair'; };

// Sair deste aparelho. O signOut padrão ('global') depende da internet e, quando o servidor recusa
// (token vencido, rede ruim), devolve erro sem apagar a sessão do aparelho: a pessoa tocava em Sair e
// continuava dentro do app. Com 'local' a sessão sai sempre; depois vai para a tela de destino com recarga completa.
export async function sairDoApp(destino = '/entrar') {
  marcarSaida();
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* segue mesmo assim */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token')).forEach((k) => localStorage.removeItem(k)); } catch {}
  window.location.replace(destino);
}

// Páginas que exigem login: sem sessão, manda para /entrar e volta depois.
// Se a sessão existia e sumiu (expirou), avisa na tela de entrada.
export function useSessao(obrigatoria = true) {
  const router = useRouter();
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const tinha = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessao) { tinha.current = true; motivoSaida = ''; }
    if (obrigatoria && sessao === null) {
      // endereço limpo: /entrar sozinho quando a volta é para as ofertas (o padrão da tela de entrar)
      const params = new URLSearchParams();
      if (window.location.pathname !== '/ofertas') params.set('voltar', window.location.pathname);
      if (tinha.current && motivoSaida !== 'sair') params.set('motivo', motivoSaida || 'expirou');
      const q = params.toString();
      router.replace(`/entrar${q ? `?${q}` : ''}`);
    }
  }, [obrigatoria, sessao, router]);

  return sessao;
}

const lerUso = () => { try { return Number(localStorage.getItem(CHAVE_USO)) || 0; } catch { return 0; } };
const gravarUso = () => { try { localStorage.setItem(CHAVE_USO, String(Date.now())); } catch { /* sem armazenamento */ } };

// Encerra a sessão depois do tempo sem toque, tecla ou rolagem (vale entre abas e ao voltar ao app).
// admin = null enquanto ainda não se sabe: espera, para não contar a volta como uso antes de aplicar a regra certa.
export function useEncerrarSemUso(sessao: Session | null | undefined, admin: boolean | null) {
  useEffect(() => {
    if (!sessao || admin === null) return;
    const limite = admin ? MINUTOS_SEM_USO_ADMIN * 60_000 : DIAS_SEM_USO * 86_400_000;
    // login novo (senha ou Google) conta como uso
    const entrada = Date.parse(sessao.user.last_sign_in_at ?? '') || 0;
    if (entrada > lerUso()) gravarUso();

    const verificar = async () => {
      if (Date.now() - lerUso() < limite) return;
      motivoSaida = 'inatividade';
      await supabase.auth.signOut();   // useSessao leva para /entrar com o aviso
    };
    let ultimaGravacao = 0;
    const usou = () => {
      if (Date.now() - ultimaGravacao < 30_000) return;   // grava no máximo a cada 30 s
      ultimaGravacao = Date.now();
      gravarUso();
    };
    // ao voltar ao app, confere antes de contar a volta como uso
    const visivel = () => { if (document.visibilityState === 'visible') verificar().then(() => { if (motivoSaida !== 'inatividade') usou(); }); };

    verificar().then(() => { if (motivoSaida !== 'inatividade') usou(); });
    const eventos = ['pointerdown', 'keydown', 'scroll'] as const;
    eventos.forEach((e) => window.addEventListener(e, usou, { passive: true }));
    document.addEventListener('visibilitychange', visivel);
    const timer = setInterval(verificar, 60_000);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, usou));
      document.removeEventListener('visibilitychange', visivel);
      clearInterval(timer);
    };
  }, [sessao?.user.id, admin]);   // eslint-disable-line react-hooks/exhaustive-deps
}
