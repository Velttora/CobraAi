---
phase: 07-d-as-festivos-colombia
plan: "02"
subsystem: compliance
tags: [compliance, holidays, timezone, vitest]

# Dependency graph
requires:
  - 07-01 (prisma.holiday model + holidays table)
provides:
  - "holiday" reason added to ContactCheckReason
  - ComplianceService.isHoliday(at) — America/Bogota civil-date lookup against holidays table
  - ComplianceService.nextNonHolidaySendTime(at, hours, tz) — next in-window, non-holiday instant
  - Holiday gate in checkContact (sibling of outside_hours) AND isChannelEligible (transactional)
affects:
  - service-notifications / service-workflows (any caller of ComplianceService now respects CO holidays)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Holiday gate reuses existing timezone helpers (getZonedParts / addLocalDays / zonedTimeToUtc)
    - Bounded (30-iteration) forward scan to skip consecutive holidays when computing next_allowed_at
key-files:
  created: []
  modified:
    - packages/compliance/src/types.ts
    - packages/compliance/src/compliance.service.ts
    - packages/compliance/src/compliance.service.spec.ts

key-decisions:
  - "Holiday gate placed AFTER outside_hours so out-of-window still reports outside_hours; holiday only when within hours"
  - "Gate scoped to country === 'CO' — Colombian holidays never block MX/BR debtors"
  - "isChannelEligible gained an optional at?: Date param (defaults to now) so transactional sends also block on holidays"

patterns-established:
  - "isHoliday query key = new Date(Date.UTC(y, m-1, d)) from America/Bogota parts, matching the seed's UTC-midnight storage"

requirements-completed: []

# Verification
verification:
  - "pnpm --filter @cobrai/compliance typecheck + lint clean"
  - "pnpm --filter @cobrai/compliance test → 18/18 passing (14 existing + 4 new)"
  - "New tests: checkContact holiday block, outside_hours precedence, isChannelEligible holiday block, MX exclusion"

# Metrics
completed: 2026-07-14
---

## What shipped

The compliance engine now blocks every send on a Colombian national holiday. Added the `holiday` reason, an `isHoliday` lookup keyed on the America/Bogota civil date, and `nextNonHolidaySendTime` for `next_allowed_at`. The gate runs in both `checkContact` (proactive, after the `outside_hours` check) and `isChannelEligible` (transactional), scoped to CO debtors. 4 new unit tests, full suite green.
