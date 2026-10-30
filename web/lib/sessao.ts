'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Páginas que exigem login: sem sessão, manda para /entrar e volta depois.
export function useSessao(obrigatoria = true) {
  const router = useRouter();
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (obrigatoria && sessao === null) {
      router.replace(`/entrar?voltar=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [obrigatoria, sessao, router]);

  return sessao;
}
