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
      const motivo = !tinha.current || motivoSaida === 'sair' ? '' : `&motivo=${motivoSaida || 'expirou'}`;
      router.replace(`/entrar?voltar=${encodeURIComponent(window.location.pathname)}${motivo}`);
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
