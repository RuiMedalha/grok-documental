# DocFlow (grok-documental)

SaaS multi-tenant para **gestão de documentos** e **conciliação bancária**, orientado ao mercado português.

Upload de faturas/recibos, classificação, pastas automáticas, importação de CSV bancário, matching de conciliação, exportação Excel e integração com **TOConline**.

**Repositório:** [github.com/RuiMedalha/grok-documental](https://github.com/RuiMedalha/grok-documental)

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind + PWA |
| Backend | NestJS 11 + REST + OpenAPI/Swagger |
| Base de dados | PostgreSQL + Prisma |
| Ficheiros | Storage local (MVP) · preparado para S3/R2/MinIO |
| Jobs | Estrutura para Redis + BullMQ |
| Auth | Email + password (bcrypt) + JWT + refresh tokens |
| Multi-tenant | `tenant_id` em todas as tabelas + scoping no backend |

---

## Estrutura do monorepo

```
grok-documental/
├── apps/
│   ├── api/                 # NestJS backend
│   │   ├── prisma/          # schema + seed
│   │   └── src/
│   │       ├── auth/
│   │       ├── documents/
│   │       ├── bank/        # CSV wizard + movimentos
│   │       ├── reconciliation/
│   │       ├── folder-rules/
│   │       ├── integrations/  # TOConline, WooCommerce, Ifthenpay, Moloni
│   │       └── common/
│   └── web/                 # Next.js frontend
│       └── src/app/
│           ├── (auth)/      # login, register
│           └── (dashboard)/ # inbox, documents, bank, reconciliation, settings
├── packages/
│   └── shared/              # tipos e enums partilhados
├── samples/
│   └── extrato-exemplo.csv
├── docker-compose.yml       # postgres + redis + minio
└── package.json
```

---

## Funcionalidades

### Auth e organizações
- Registo de tenant + admin
- Login com email + **tenant slug**
- JWT access + refresh tokens
- Convite de utilizadores (Admin)
- Papéis: `ADMIN`, `ACCOUNTING`, `OPERATOR`, `APPROVER`
- Auditoria de ações (login, upload, import, conciliação, etc.)

### Documentos
- Upload PDF / JPG / PNG / DOCX → **Inbox**
- Metadata: tipo, estado, fornecedor, cliente, NIF, datas, total, IVA, pasta, tags
- Detecção de duplicados por **hash SHA-256**
- Download autenticado
- **Exportar Excel** (CSV UTF-8 com `;`, abre no Excel PT)

### Pastas
- Campo **Pasta** editável por documento
- Regras automáticas em **Definições** com tokens `{Ano}/{Mes}/{Tipo}/{Entidade}`

### Banco / CSV
- Wizard de mapeamento de colunas (Data, Descrição, Valor ou Débito+Crédito, Saldo, Ref.)
- Formatos de data e decimais PT
- Templates de mapeamento por tenant
- Prevenção de importação duplicada (hash do ficheiro)
- Listagem de movimentos + **export Excel**

### Conciliação
- Motor de matching: **strong** (referência) / **medium** (nº no texto) / **weak** (valor + datas + descrição)
- UI de sugestões com Aceitar / Rejeitar

### Integrações
| Provider | Estado |
|----------|--------|
| **TOConline** | Credenciais OAuth + push de documento de compra |
| WooCommerce | Stub (credenciais + sync mock) |
| Ifthenpay | Webhook de callback |
| Moloni | Stub |

### TOConline — como usar
1. No TOConline: **Empresa → Configurações → Dados API** (client_id, secret, API URL, OAuth URL)
2. Em DocFlow **Definições** → secção TOConline → Guardar
3. **Autorizar OAuth**
4. No detalhe do documento → botão **TOConline**

Sem token, a API devolve *dry_run* com o payload preparado.

---

## Setup local

### Pré-requisitos
- Node.js ≥ 20
- [pnpm](https://pnpm.io/) (`npm i -g pnpm`)
- Docker

### Instalação

```bash
git clone https://github.com/RuiMedalha/grok-documental.git
cd grok-documental

pnpm install

cp .env.example .env
cp .env apps/api/.env
echo 'NEXT_PUBLIC_API_URL=http://localhost:3001/api' > apps/web/.env.local

docker compose up -d

pnpm db:generate
pnpm db:migrate
pnpm db:seed

pnpm dev:api   # http://localhost:3001  · Swagger: /api/docs
pnpm dev:web   # http://localhost:3000
```

### Credenciais seed
| Campo | Valor |
|-------|--------|
| Tenant slug | `demo` |
| Email | `admin@demo.pt` |
| Password | `Admin123!` |

---

## Scripts

| Script | Descrição |
|--------|-----------|
| `pnpm dev` / `dev:api` / `dev:web` | Desenvolvimento |
| `pnpm db:generate` | Prisma client |
| `pnpm db:migrate` | Migrações |
| `pnpm db:seed` | Tenant + admin demo |
| `pnpm test` | Testes unitários |
| `pnpm lint` / `format` | Qualidade de código |

---

## API (Swagger)

Com a API a correr: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

Principais grupos:
- `auth` — register, login, refresh, invite, me
- `documents` — upload, inbox, CRUD, download, **export**
- `bank` — CSV headers/preview/import, templates, transactions, **export**
- `reconciliation` — run matching, suggestions accept/reject
- `folder-rules` — CRUD
- `integrations` — TOConline, WooCommerce, Ifthenpay, Moloni

---

## Variáveis de ambiente

Ver [`.env.example`](./.env.example):

- `DATABASE_URL` — PostgreSQL
- `REDIS_URL` — Redis (jobs futuros)
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `S3_*` — storage (opcional; MVP usa disco local em `apps/api/uploads`)
- `API_PORT` (default `3001`)
- `WEB_URL` / `API_URL` — CORS e links

---

## Segurança multi-tenant

- Todas as queries Prisma filtradas por `tenantId` do JWT
- Guards JWT + roles
- ValidationPipe global (whitelist)
- Rate limiting (Throttler)
- CORS configurado

---

## Testes

```bash
cd apps/api && pnpm test
```

Inclui:
- `matching.util.spec.ts` — strong / medium / weak
- `folder-pattern.util.spec.ts`
- `csv-parser.util.spec.ts` — datas e valores PT

---

## Sample

Ficheiro de exemplo para o wizard bancário: [`samples/extrato-exemplo.csv`](./samples/extrato-exemplo.csv)

---

## Roadmap (pós-MVP)

- [ ] Jobs BullMQ (OCR, classificação, matching em background)
- [ ] S3 / Cloudflare R2 presigned URLs
- [ ] TOConline: mapeamento de séries, impostos e anexos PDF
- [ ] Exportação `.xlsx` nativa
- [ ] PWA service worker + captura de câmara
- [ ] RLS PostgreSQL opcional

---

## Licença

UNLICENSED — uso interno / demo.


### Entidades, contabilidade e pagamentos
- **Entidades** (`/parties`): fornecedores e clientes (NIF, IBAN, prazos, contas por omissão)
- **Plano de contas** PT (seed): 21, 221, 31, 62, 2432, 12, 71, 72…
- **Classificação** no documento: débito a conta / crédito a conta + linhas de diário
- **Contas a pagar** (`/payables`): a partir de faturas recebidas
- **SEPA**: export CSV (homebanking) e XML pain.001
- **Extração**: `POST /extraction/documents/:id` + auto no upload (heurísticas; OCR real plugável)
- **CRM**: import HubSpot/Pipedrive (estrutura + mock)

### Credenciais demo
| Campo | Valor |
|-------|-------|
| Tenant slug | `demo` |
| Email | `admin@demo.pt` |
| Password | `Admin123!` |


### Scanner de mesa / Multifunções
1. **Definições → Scanner / Multifunções** — copie a `dropUrl` e o token
2. **Scan to Network Folder**: pasta partilhada +  
   `SCAN_FOLDER=/caminho/scans SCAN_URL=<dropUrl> node scripts/scan-folder-watcher.js`
3. **Scan to Email**: encaminhar anexos para `POST /api/inbound/email` (SendGrid Inbound Parse / Mailgun routes)
4. **Teste**: `curl -X POST "<dropUrl>" -F "file=@fatura.pdf"`

Os ficheiros entram na **Inbox** com origem `scanner` e seguem extração / QR AT.


### Email automático (Moloni / TOConline / fornecedores)
1. **Definições → Email de faturas** — IMAP (host, user, app password)
2. **Sincronizar agora** ou cron:
   ```bash
   curl -X POST https://API/api/inbound/mail/sync-all -H "x-cron-secret: $CRON_SECRET"
   ```
3. Cada email **não lido**: anexos PDF/JPG + links de download → **Inbox**
4. Sem colar URLs manualmente

Sugestão: caixa dedicada `faturas@empresa.pt` com reencaminhamento a partir do email principal.
