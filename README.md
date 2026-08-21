# Wholesale Distributor ERP

A focused walk-in wholesale counter ERP for one administrator/counter operator.

The system manages business settings, products and units, customers, suppliers, inventory, customer/supplier ledgers, cash and bank payments, purchases, counter sales, returns, expenses, reports, dashboard data, imports/exports, and production operations.

## Project scope

Version 1 is intentionally limited to:

- One admin/counter operator
- Walk-in and registered credit customers
- Manual selling price per sale item
- Cash and bank-transfer payments only
- Product units and conversions
- Weighted-average inventory costing
- Customer and supplier ledgers
- Physical stock counts and reason-based adjustments
- Purchases, counter sales and returns
- Expenses
- Reports and dashboard
- Opening-data import and operational exports
- Production health/readiness/version endpoints

Version 1 does **not** include:

- Delivery, dispatch, drivers, vehicles or routes
- Customer portal, online ordering or mobile app
- CRM, HR, payroll or attendance
- Roles or permissions
- Cheque payments
- Advanced general ledger
- Redis, BullMQ or WebSockets
- Microservices

## Repository structure

This is one Git repository with two applications. It is not a package-workspace monorepo and it is not a microservice system.

```text
wholesale-erp/
├── api/                         Fastify API
│   ├── drizzle/                 Reviewed Drizzle migration files
│   ├── src/
│   │   ├── app.ts               Creates Fastify and registers plugins/modules
│   │   ├── server.ts            Starts/stops the HTTP server
│   │   ├── env.ts               Environment validation
│   │   ├── commands/            Small operational commands
│   │   ├── database/
│   │   │   ├── client.ts        PostgreSQL + Drizzle client
│   │   │   └── schema/          Drizzle table schemas
│   │   ├── modules/             Business/technical modules
│   │   ├── plugins/             Database/auth/CORS/error/Swagger plugins
│   │   ├── shared/              Small shared errors, HTTP helpers and utilities
│   │   └── types/               Fastify type augmentation
│   ├── test/
│   ├── drizzle.config.ts
│   ├── package.json
│   └── tsconfig.json
├── web-admin/                   React admin application
│   ├── src/
│   │   ├── app/
│   │   ├── components/ui/
│   │   ├── features/
│   │   ├── lib/
│   │   ├── styles/
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── deployment/                  Backup/restore operational scripts and notes
├── docker-compose.yml           Development services
├── docker-compose.test.yml      Integration-test PostgreSQL
├── docker-compose.production.yml
├── .env.example
└── README.md
```

## Required technology

### API

- Node.js 22+
- TypeScript
- Fastify
- PostgreSQL
- Drizzle ORM
- Zod
- Secure JWT-based cookie authentication with rotated refresh sessions
- Swagger/OpenAPI
- Pino/Fastify structured logging

### Admin application

- React
- Vite
- TypeScript
- Tailwind CSS
- React Hook Form
- Zod
- TanStack Query
- TanStack Router

## Backend architecture

Normal request flow:

```text
React page
→ feature API function
→ Fastify route
→ service
→ repository
→ PostgreSQL
```

Every backend business module keeps the approved five-file structure:

```text
{module}.routes.ts       HTTP routes only
{module}.service.ts      Business workflow and transaction coordination
{module}.repository.ts   Drizzle/PostgreSQL queries
{module}.schema.ts       Zod request/query validation
index.ts                 Module registration/public exports
```

Do not add controllers, DTO folders, use-case folders, repository interfaces, event files or generic CRUD layers unless a future approved requirement genuinely needs them.

## Implemented modules

The 15 required ERP modules are implemented:

1. Business Settings
2. Admin Authentication
3. Product Management
4. Customer Management
5. Supplier Management
6. Inventory Management
7. Customer and Supplier Ledgers
8. Payments, Cash and Bank
9. Purchase Management
10. Counter Sales
11. Sales and Purchase Returns
12. Expense Management
13. Reports
14. Dashboard
15. Backup, Import and Export

The production technical module is also implemented:

16. Production Operations

Production additions implemented in the existing modules include:

- Auth active-session listing
- Targeted session revocation
- Logout-all
- Inventory valuation report
- Customer aging report
- Supplier aging report
- Daily cash summary
- Liveness, readiness and build/version endpoints

No duplicate summary/balance tables were added for these reports; they read the existing operational records.

## Production endpoints added after Modules 1-15

```text
GET    /health/live
GET    /health/ready
GET    /operations/version

GET    /auth/sessions
DELETE /auth/sessions/:id
POST   /auth/logout-all

GET    /reports/inventory-valuation
GET    /reports/customers/aging
GET    /reports/suppliers/aging

GET    /payments/daily-cash-summary
```

The health/version endpoints expose no business data or secrets. The reporting and payment-summary routes are authenticated and read-only.

## Core data-integrity rules

- UUID primary keys and direct UUID foreign keys are used for direct relationships.
- Entered/accounting money uses `numeric(14,2)`, internal inventory unit-cost snapshots use `numeric(30,14)`, and quantity uses `numeric(14,3)`.
- Decimal values are returned by the API as strings.
- Currency is PKR.
- Reporting/business timezone is Asia/Karachi; stored timestamps are UTC.
- Stock is stored in base units.
- Inventory uses weighted-average cost.
- Current stock is never edited directly; every stock change creates a movement.
- Negative sellable stock is blocked.
- Damaged and expired stock remain separate from sellable stock.
- Customer/supplier balances are calculated from immutable ledger entries.
- Confirmed documents, payments, returns, stock movements, ledger entries and reconciliations are immutable.
- Corrections use linked returns/reversals instead of editing confirmed records.
- Financial mutations use idempotency protection.
- Critical stock, sequence, allocation and financial workflows run in PostgreSQL transactions with appropriate locking.
- Cookie-authenticated mutations use CSRF protection.

## Environment setup

Copy the example file:

```bash
cp .env.example .env
```

Configure the values documented in `.env.example`. Important values include PostgreSQL connection details, authentication secret, API/web origins, runtime environment and first-admin/business initialization values.

Use a strong random authentication signing secret and never commit the real `.env` file.

For local development outside Docker, the PostgreSQL hostname normally needs to be `localhost` rather than the Docker service name.

## Local development

Start PostgreSQL:

```bash
docker compose up -d database
```

Run the API:

```bash
cd api
corepack enable
pnpm install
pnpm db:migrate
pnpm initialize:system
pnpm dev
```

Default API address:

```text
http://localhost:3000
```

Run the admin application in another terminal:

```bash
cd web-admin
corepack enable
pnpm install
pnpm dev
```

Default admin address:

```text
http://localhost:5173
```

## Initial system setup

The normal initialization command is:

```bash
cd api
pnpm initialize:system
```

For production after compilation:

```bash
pnpm initialize:system:production
```

Initialization is designed to create required singleton/system data only when missing, including the administrator, business settings/document sequences and protected Walk-in Customer according to the implemented setup command.

A separate admin-only bootstrap command is also available when needed:

```bash
pnpm bootstrap:admin
```

Never put a plain administrator password in source code or a migration.

## Health and support endpoints

Process liveness:

```text
GET /health/live
```

Database/application readiness:

```text
GET /health/ready
```

Safe deployed build information:

```text
GET /operations/version
```

Readiness must return an unavailable response when PostgreSQL cannot be reached. Version information must never expose database URLs, signing secrets, cookies, credentials, file-system secrets or stack traces.

## API checks

From `api/`:

```bash
pnpm typecheck
pnpm test
pnpm db:check
pnpm build
pnpm check
```

### PostgreSQL integration tests

The integration suite uses the disposable test database configured by `TEST_DATABASE_URL` and the test Compose file.

```bash
cd api
pnpm test:integration:up
pnpm test:integration
pnpm test:integration:down
```

The reset command must only be used against a test database.

## Admin application checks

From `web-admin/`:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

## Docker development

Start the development services:

```bash
docker compose up
```

Stop them:

```bash
docker compose down
```

Delete the development PostgreSQL volume only when data loss is intentional:

```bash
docker compose down -v
```

## Production deployment

Production uses `docker-compose.production.yml` and compiled/static application builds rather than development servers.

Before deployment:

1. Create the production `.env` from `.env.example` and replace every placeholder.
2. Set `NODE_ENV=production`.
3. Set the exact HTTPS web-admin origin for production CORS.
4. Set the browser-visible HTTPS API URL for the frontend build.
5. If the admin and API use sibling subdomains, set `CSRF_COOKIE_DOMAIN` to their shared parent domain.
6. Use a non-superuser PostgreSQL application account.
7. Keep `.env` and backup encryption credentials outside Git.
8. Put an HTTPS reverse proxy/load balancer in front of the application.
9. Review Drizzle migration files before applying them.
10. Back up PostgreSQL before risky migrations.

Typical production startup:

```bash
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d database
docker compose -f docker-compose.production.yml run --rm api pnpm db:migrate:production
docker compose -f docker-compose.production.yml run --rm api pnpm initialize:system:production
docker compose -f docker-compose.production.yml up -d
```

Do not use schema-push behavior against production.

## Backup and restore

Operational backup/restore scripts and instructions live under:

```text
deployment/
```

Production requirements are:

- encrypted PostgreSQL backup
- off-server copy
- documented retention policy
- regular restore test to a disposable database
- no public database restore API

Use `deployment/README.md` for the implemented backup/restore procedure.

## Production runtime requirements

- HTTPS termination in front of the API/web application
- Secure, HttpOnly, SameSite=Lax production authentication cookies
- CORS restricted to the real web-admin origin
- startup environment validation
- PostgreSQL connectivity validation before accepting traffic
- graceful `SIGTERM`/`SIGINT` shutdown
- explicit PostgreSQL pool limits/timeouts
- structured request/error logging without passwords/tokens/secrets
- reviewed migrations only
- periodic slow-query review with `EXPLAIN ANALYZE` before adding infrastructure

Do not add Redis merely to hide inefficient SQL queries.

## Production acceptance focus

Run the automated clean-database acceptance checks first:

```bash
chmod +x deployment/run-production-acceptance.sh
./deployment/run-production-acceptance.sh
```

The script starts a disposable PostgreSQL test database, validates migration history, runs API type/unit/integration checks, runs the React admin tests/build, and then removes the temporary database service. It does not replace the live HTTPS, database-outage, graceful-restart or real backup/restore checks below.

Before client deployment, verify at minimum:

- `/health/live` returns 200 while the API process is alive.
- `/health/ready` becomes unavailable when PostgreSQL is intentionally unavailable.
- `/operations/version` exposes no secrets.
- Revoked sessions immediately fail protected access.
- Logout-all revokes all active sessions and clears the current cookies.
- Inventory valuation totals equal current inventory quantities multiplied by weighted-average cost.
- Customer aging total reconciles with customer outstanding.
- Supplier aging total reconciles with supplier payable.
- Daily cash summary equals opening + inflows - outflows.
- Confirmed cash reconciliation values agree with the daily cash summary when one exists.
- A clean database migrates from the first reviewed migration through the latest migration.
- A real backup can be restored successfully to a temporary database.
- Graceful restart does not corrupt an in-flight financial transaction.
- Unexpected-error logs contain request identifiers but never passwords, tokens or secrets.

## Development rules

- Keep code simple and readable for a junior developer.
- Keep routes limited to authentication, validation, service calls and HTTP responses.
- Keep business rules and transaction coordination in services.
- Keep Drizzle/PostgreSQL queries in repositories.
- Keep backend modules to the approved five-file structure.
- Reuse existing operational records instead of creating duplicate balance/summary tables.
- Do not modify confirmed financial records directly.
- Do not add unapproved infrastructure or abstractions.
- Complete and test one focused pass before moving to the next.
