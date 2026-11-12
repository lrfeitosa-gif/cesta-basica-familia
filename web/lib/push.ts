'use client';
import { supabase } from './supabase';

// Chave pública VAPID (pode ficar no código). A privada fica só no GitHub (segredo VAPID_PRIVATE_KEY), onde o
// worker envia os avisos depois da coleta das 7h.
export const VAPID_PUBLICA = 'BE0BLEMmF_ni4PVEMA3HlgTzCalJHLmk9G98O_HeGEaX8Mg_Vqc_G9gHHyEoonk3hWD-s4XBcyUSH3O0Jis2OPU';

export type EstadoPush = 'sem-suporte' | 'instalar' | 'bloqueado' | 'ligado' | 'desligado';

const ehIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

const paraBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function estadoPush(): Promise<EstadoPush> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // no iPhone, o aviso só existe com o app na tela de início (iOS 16.4 ou mais novo)
    return ehIos() && !instalado() ? 'instalar' : 'sem-suporte';
  }
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? 'ligado' : 'desligado';
}

// Pede a autorização do aparelho e grava a inscrição da família. Devolve o novo estado.
export async function ligarPush(familiaId: string): Promise<EstadoPush> {
  if (await Notification.requestPermission() !== 'granted') return 'bloqueado';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraBytes(VAPID_PUBLICA) });
  const j = sub.toJSON();
  await supabase.rpc('garantir_familia');
  const { error } = await supabase.from('push_subscription')
    .upsert({ familia_id: familiaId, endpoint: j.endpoint, keys: j.keys }, { onConflict: 'endpoint' });
  if (error) { await sub.unsubscribe(); throw error; }
  return 'ligado';
}

export async function desligarPush(): Promise<EstadoPush> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscription').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return 'desligado';
}
