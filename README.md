# fast-promotions-mk

Avisa quando o preço do que a família consome está bem mais em conta nos mercados de Indaiatuba.

- App: https://cesta-basica-familia.vercel.app
- Documentação completa (arquitetura, requisitos técnicos, chaves, pendências): [docs/PARTE-I-INTEGRACAO.md](docs/PARTE-I-INTEGRACAO.md)

```
worker/                  coleta de preços (Python) e motor de regras
  coleta/                coletores dos sites (VTEX), encartes e extrator Claude
  rodar_coleta.py        roda os coletores e grava no Supabase
supabase/migrations/     estrutura do banco (rodar em ordem no SQL Editor)
web/                     app Next.js publicado na Vercel
.github/workflows/       agenda de coletas (GitHub Actions)
encartes/                prints de encartes e gabarito de precisão do extrator
```

Rodar os testes: `cd worker; .\.venv\Scripts\python.exe -m pytest -q tests`
Rodar o app localmente: `cd web; npm install; npm run dev` (com `web/.env.local`, veja `.env.local.example`)
