# Backend Architecture

The API follows Screaming Architecture: top-level modules are named after
business capabilities, not technical layers.

Each domain module should use the same internal MVC shape:

- `controllers`: HTTP routes and webhook entry points.
- `services`: application use cases and orchestration.
- `models`: DTOs, view models, and persistence-facing types.
- `ports`: interfaces for external systems.
- `adapters`: implementations for providers such as Twilio, OpenAI, S3/R2, and Resend.

Controllers must stay thin. Business decisions belong in services, and external
providers must be reached through ports to keep dependency inversion explicit.

## Domain Modules

- `organizations`: Clerk organization mapping, tenant context, roles, and invitations.
- `users`: Clerk user projection, role mapping, seller assignment, and login audit.
- `sellers`: seller metadata, active state, commission/recovery metrics, and client assignment.
- `cartera`: Excel import, row validation, normalization, and source audit.
- `clients`: debtor records, search, assignment visibility, and editable profile fields.
- `invoices`: receivables, due dates, status transitions, and financial metrics.
- `conversations`: WhatsApp messages, inbound webhooks, delivery status, media, and timeline.
- `voice`: AI voice calls, call event webhooks, transcripts, outcomes, and escalation.
- `campaigns`: bulk outreach orchestration, channel selection, progress, and retries.
- `payments`: payment promises and payment links captured from conversations.
- `erp-sync`: `CarteraSource` adapter contract and sync logs; Fase 1 ships `ExcelSource`.

## Fase 1 Overrides

The source diagram references JWT auth, Redis, and BullMQ. For this MVP:

- Auth is Clerk sessions and organizations, not a custom JWT session system.
- No Redis or dedicated cache layer is used.
- BullMQ is replaced by a Postgres-backed queue (`pg-boss` preferred).
- ERP adapters remain behind the `CarteraSource` interface; only Excel ingestion is implemented in Fase 1.
