# App Cesta Básica Família — MVP

```
supabase/migrations/0001_schema.sql   modelo de dados + RLS (sem CPF/endereço exato)
worker/motor/regras.py                motor de regras: cruzamento, gatilho, melhor mercado, estoque, recompra
worker/motor/nfce.py                  leitura da NFC-e SP pela URL do QR Code
worker/tests/                         testes do motor (pytest)
web/                                  PWA Next.js: onboarding, leitura de notas, push
```

## Pré-requisitos (Windows)
- Python 3.12: `winget install Python.Python.3.12`
- Node 20: `winget install OpenJS.NodeJS.LTS`
- Projeto no Supabase (plano gratuito) — rodar o SQL da migração no SQL Editor.

## Rodar
```
cd worker; pip install -r requirements.txt; python -m pytest -q tests
cd web; npm install; npm run dev
```
`web/.env.local`: `NEXT_PUBLIC_SUPABASE_URL=...` e `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`

## Próximos passos
1. Plugar a automação de tabloides existente para gravar em `produto`/`oferta`.
2. Job diário: para cada `item_interesse`, `casa()` + `gatilho()` → `alerta` → push (pywebpush, chaves VAPID).
3. Edge Function `registrar-nota` (chama `nfce.ler_nota`, grava `compra`/`item_comprado`, normaliza produtos).
4. Telas `/lista`, `/alertas`, `/compra` (usando `melhor_compra` e `aviso_recompra`).
5. Validar o seletor HTML da NFC-e com notas reais de Indaiatuba.
