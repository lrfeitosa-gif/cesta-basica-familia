'use client';
import { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { supabase } from '@/lib/supabase';

// Lê o QR Code da NFC-e e envia a URL para a Edge Function, que chama o leitor (worker/motor/nfce.py).
export default function Notas() {
  const [lidas, setLidas] = useState<string[]>([]);
  const [status, setStatus] = useState('Aponte para o QR Code da nota (sugestão: 3 a 5 notas).');

  const aoLer = async (url: string) => {
    if (lidas.includes(url)) return;
    if (!/p=\d{44}/.test(url)) return setStatus('Esse QR Code não é de NFC-e.');
    setStatus('Lendo nota...');
    const { error } = await supabase.functions.invoke('registrar-nota', { body: { url } });
    if (error) return setStatus('Não consegui ler essa nota. Tente de novo ou registre manualmente.');
    setLidas((l) => [...l, url]);
    setStatus('Nota registrada!');
  };

  return (
    <main>
      <h1>Notas fiscais</h1>
      <Scanner onScan={(r) => r[0] && aoLer(r[0].rawValue)} />
      <p>{status}</p>
      <p>{lidas.length} nota(s) lida(s)</p>
      {lidas.length >= 3 && <a href="/lista">Ver minha lista de interesse</a>}
    </main>
  );
}
