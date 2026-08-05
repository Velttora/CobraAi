# Payment Gateway Distribution — Measured Data

**Measured:** 2026-08-05T00:31Z
**Connection target:** `postgresql://cobrai:cobrai_dev@localhost:5433/cobrai_dev` (local development database, `cobrai_dev`, schema `public`)
**Tool:** `psql` (`prisma db execute --stdin` ran successfully but did not surface result rows for SELECT, per plan's documented fallback)

## Queries and Results

### `payment_links`

```sql
SELECT gateway, count(*) FROM payment_links GROUP BY gateway;
```

```
   gateway   | count
-------------+-------
 mercadopago |     1
(1 row)
```

Total rows in `payment_links`: 1.

### `payments`

```sql
SELECT gateway, count(*) FROM payments GROUP BY gateway;
```

```
 gateway | count
---------+-------
(0 rows)
```

Total rows in `payments`: 0 (empty table).

## Interpretation

The real dataset is nearly empty: `payment_links` has exactly one row, with `gateway = 'mercadopago'`; `payments` has zero rows. This is a valid measurement — the backfill mapping below is written to handle the full legacy enum defensively (per RESEARCH.md Pitfall 4 and the plan's acceptance criteria), even though only one of the eight legacy values is actually present in local data. Production may carry additional history under other legacy values, so the mapping below is not narrowed to what was observed locally.

## Backfill Mapping (implemented by the migration)

| Legacy `gateway` | New `provider` | New `method` | Rationale |
|---|---|---|---|
| `mercadopago` | `mercadopago` | `null` | Direct provider carry-over; mercadopago is both a legacy gateway value and a new provider option. |
| `conekta` | `transfer` | `null` | D-15 deprecates conekta outright (Mexico, no Colombian equivalent); the row keeps its history in the retained legacy `gateway` column. |
| `transfer` | `transfer` | `bank_transfer` | Legacy `transfer` was always a bank transfer method with no processing gateway. |
| `pse` | `transfer` | `pse` | Method-only legacy value; never had a processing provider. |
| `card` | `transfer` | `card` | Method-only legacy value; never had a processing provider. |
| `cash` | `transfer` | `cash` | Method-only legacy value; never had a processing provider. |
| `pix` | `transfer` | `pix` | Method-only legacy value; never had a processing provider. |
| `spei` | `transfer` | `spei` | Method-only legacy value; never had a processing provider. |

**Rationale (one sentence):** The method-only legacy values (`pse`, `card`, `cash`, `pix`, `spei`, `transfer`) never had a provider because the platform never processed them through a gateway, and `transfer` is the one new-provider option requiring no credentials, so old links keep resolving instead of throwing.

A defensive catch-all (`provider = 'transfer' WHERE provider IS NULL`) covers any row whose `gateway` value falls outside the eight known legacy values, guaranteeing the post-migration `NOT NULL` assertion can always succeed.
