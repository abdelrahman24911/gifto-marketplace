# Gifto Marketplace — Gap Analysis

**Audit date:** 2026-10-19  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**Confidence level:** High

---

## Gap Matrix

| ID | Feature or Requirement | Expected Behavior | Current Evidence | Status | Priority | Dependencies | Recommended Action |
|----|----------------------|-------------------|------------------|--------|----------|--------------|-------------------|
| G-01 | Guest checkout | Customers can place orders without an account; order lookup by reference + verification | `place_order` requires session (42501 for anon); `orders.user_id` nullable (schema allows future) | MISSING | P3 | None | Implement GM-P5-014, GM-P5-015 |
| G-02 | Vendor subscriptions | Optional or required subscription with entitlement checks; separate from commission revenue | No `subscription_plans` or `vendor_subscriptions` tables; D-07 blocked | MISSING | P1 | GM-P1-005 (D-07 decision) | Implement GM-P3-009 to GM-P3-011 |
| G-03 | Non-free delivery fee | Delivery fees calculated per vendor/zone and shown at checkout | `delivery_fee_minor = 0` hardcoded; free at launch | PARTIAL | P2 | GM-P1-004 (D-06 decision) | Implement GM-P2-006 to GM-P2-008 |
| G-04 | Settlement automation | Scheduled settlement runs, payout export, reconciliation | Manual admin batch via `create_settlement` / `mark_settlement_paid` | PARTIAL | P3 | None | Implement GM-P4-012, GM-P4-013 |
| G-05 | Catalog extras (tags, variants) | Product tags and variant options with independent stock | No tag or variant tables; single-price products | MISSING | P3 | None | Implement GM-P6-016 to GM-P6-018 |
| G-06 | COD never-collected restock | Automatic restock or flag for undelivered COD orders | No automatic path; manual adjustment only | MISSING | P3 | None | Implement GM-P8-023, GM-P8-024 |
| G-07 | Browser E2E tests | End-to-end browser tests for checkout, vendor flows, admin flows | Write paths covered by DB suites only; no browser tests | MISSING | P2 | GM-P0-001 (build) | Implement GM-P7-019 to GM-P7-022 |
| G-08 | Email/SMS notifications | Order confirmations, status updates, vendor alerts | No notification provider integrated | MISSING | P3 | None | Integrate notification provider (post-MVP) |
| G-09 | Code backup to remote | All commits pushed to origin/main | 3 commits ahead of origin (unpushed) | PARTIAL | P0 | None | Execute GM-P0-001 |
| G-10 | Hosted DB migrations | All 9 migrations applied to hosted Gifto project | Migrations 8–9 container-verified but not on hosted project | PARTIAL | P0 | GM-P0-001 | Execute GM-P0-002 |
| G-11 | npm audit advisories | 5 high-severity advisories reviewed | Unreviewed; `npm audit fix --force` would break | PARTIAL | P1 | None | Execute GM-P0-003 |
| G-12 | Vendor-facing commission dashboard | Vendors can view their own commission entries and settlements | Vendor can read commission via RLS but no dedicated dashboard | PARTIAL | P2 | None | Add vendor commission UI page |
| G-13 | Production monitoring | Error logging, uptime monitoring, alerts | None configured | MISSING | P3 | None | Implement GM-P9-025, GM-P9-026 |
| G-14 | Deployment documentation | Deployment checklist, rollback runbook, env var docs | Not documented | MISSING | P3 | None | Implement GM-P9-025 |

---

## Summary by Category

### Product gaps (customer-facing)
| ID | Gap | Priority |
|----|-----|----------|
| G-01 | Guest checkout | P3 |
| G-03 | Non-free delivery fee | P2 |
| G-05 | Catalog extras (tags, variants) | P3 |
| G-06 | COD never-collected restock | P3 |

### Product gaps (vendor-facing)
| ID | Gap | Priority |
|----|-----|----------|
| G-02 | Vendor subscriptions | P1 |
| G-12 | Vendor-facing commission dashboard | P2 |

### Product gaps (admin-facing)
| ID | Gap | Priority |
|----|-----|----------|
| G-04 | Settlement automation | P3 |

### Technical gaps
| ID | Gap | Priority |
|----|-----|----------|
| G-07 | Browser E2E tests | P2 |
| G-08 | Email/SMS notifications | P3 |
| G-13 | Production monitoring | P3 |
| G-14 | Deployment documentation | P3 |

### Process gaps
| ID | Gap | Priority |
|----|-----|----------|
| G-09 | Code backup to remote (unpushed commits) | P0 |
| G-10 | Hosted DB migrations (8–9 not applied) | P0 |
| G-11 | npm audit advisories unreviewed | P1 |

---

## Security-related gaps

| ID | Gap | Severity | Evidence | Recommended action |
|----|-----|----------|----------|-------------------|
| S-G-01 | No browser E2E test coverage for write paths | P2 | README limitation #1 | GM-P7-019 to GM-P7-022 |
| S-G-02 | No local `supabase start` container | P2 | README limitation #3 | Continue raw container workflow |
| S-G-03 | COD never-collected restock not automated | P2 | STATUS_REPORT "Remaining" #3 | GM-P8-023, GM-P8-024 |

---

## Decisions blocking implementation

| Decision ID | Topic | Status | Blocks |
|-------------|-------|--------|--------|
| D-06 | Delivery fee model | Partially decided (free at launch; eventual model TBD) | GM-P2-006 to GM-P2-008 |
| D-07 | Vendor subscription model | `BLOCKED_PENDING_OWNER_APPROVAL` | GM-P3-009 to GM-P3-011 |
| D-08 | Settlement cadence | Cadence still open (manual batch acceptable) | GM-P4-012 to GM-P4-013 |

---

## Cross-references

- `docs/project-audit/AUDIT_REPORT.md` — full audit report with feature status matrix
- `docs/project-audit/IMPLEMENTATION_ROADMAP.md` — ordered phases with effort estimates
- `docs/project-audit/PHASE_TASKS.md` — actionable task backlog (GM-PX-YYY IDs)
- `docs/DECISIONS.md` — business decision log (D-01 through D-08)
- `docs/PHASE_2_PLAN.md` — Phase 2 plan (legacy, superseded by this package)