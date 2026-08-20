# DocFlow (grok-documental)

SaaS multi-tenant para **gestão de documentos** e **conciliação bancária** (Portugal).

Upload, QR Code AT, email IMAP, scanner/MFP, classificação contabilística, contas a pagar, SEPA, matching bancário, TOConline.

## Stack

- Frontend: Next.js 15 + TypeScript + Tailwind + PWA
- Backend: NestJS + Prisma + PostgreSQL
- Jobs-ready: Redis

## Setup local

```bash
docker compose up -d
pnpm install
cp .env.example apps/api/.env
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:api   # :3001
pnpm dev:web   # :3000
```

Demo: tenant `demo` · email `admin@demo.pt` · password `Admin123!`

Swagger: http://localhost:3001/api/docs

## Estrutura

```
apps/api      NestJS
apps/web      Next.js
packages/shared
scripts/scan-folder-watcher.js
samples/extrato-exemplo.csv
```

## Fluxo

1. Inbox (upload / email / scanner / QR AT)
2. Extração + revisão
3. Classificação (débito/crédito) + contas a pagar
4. SEPA ou MB → marcar pago
5. Import CSV banco → conciliação

Repo: https://github.com/RuiMedalha/grok-documental
