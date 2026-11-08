# Metrics list permission gates and limit fail-open

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Wave 1 W1-4
- **Guard:** `views/governance/MetricsListView.test.ts` (no-view renders no-permission and sends no list request; permission failure fails closed with retry; bulk edit hidden without `EditAll`), `components/shared/LimitWrapper.test.ts` (disabled config / `currentCount -1` / fetch failure all render children; reached shows the `current/hardLimit` tooltip)
- **Related:** A-D3 (a); W1-4 review conditions 6 and 11; RULING-metrics.md §1.2; upstream pin `a3012259ca` (`MetricListPage.tsx:313-324,1332`, `hoc/LimitWrapper.tsx`, `rest/limitsAPI.ts`, `utils/PermissionDerivation.ts`)

## Context

The metrics list previously had no permission gate at all: any logged-in
user saw the list and could open bulk edit. Official gates the page on
the `metric` resource permission (`Entity.java:189` fixes the resource
name to `"metric"`) and wraps the create button in a limit component.
The two mechanisms have opposite failure semantics, and confusing them
would either lock users out on a quota-service blip or let an
unauthorized user through on a permission-service blip.

## Decision

- Resource permission is fetched once per page load via the resource
  line, `getResourcePermission('metric')` (the list has no FQN, so
  the entity line does not apply). View access is `ViewBasic ||
  ViewAll` (official `hasViewAccess`); admin (`isAdminUser`) grants
  every flag, matching the official dual line.
- Permission fetch failure is **fail-closed**: the page renders an
  error state with retry and sends no list request. No view access
  renders the no-permission state and likewise sends no list request;
  permission loading renders only a skeleton.
- Per-entry gates (hidden, not disabled, when ungated — the official
  form):
  - Bulk edit (this batch's only write entry): `canEditAll`
    (`EditAll`).
  - Not built in this batch — gates fixed here for Wave 2 to reuse
    without re-deciding: create `permission.Create`, wrapped in
    `<LimitWrapper resource="metric">`; import/export `canEditAll`;
    bulk delete `permission.Delete`.
- Limit failures are **fail-open**, the opposite of permission
  failures: `LimitWrapper` renders its children when the limit config
  is disabled (`config.enable` false), when the resource reports
  `currentCount === -1`, or when the limit fetch fails. While loading
  it renders a skeleton; when the limit is reached it disables the
  entry with a tooltip showing `currentCount/hardLimit`. The shell
  store loads `GET /v1/limits/config` at startup in parallel with
  version and lineage settings (`loadShellConfig`, called from
  `App.vue`); a failed config fetch leaves `limit` null, which the
  wrapper treats as ungated, never as a startup failure.
- The stale `shellConfig.ts` comments claiming no product limit
  endpoint exists are corrected: `LimitsResource` serves `/v1/limits`
  (`GET /config`, `GET /features/{name}`), and the product now has
  the thin client (`api/limits.ts`) and wrapper to match.

## Consequences

- The list is invisible to users without view access, and its write
  entry is invisible without `EditAll`; neither state depends on a
  permission fetch succeeding.
- A limit-service outage can never block metric creation; a
  permission-service outage can never expose the list. Wave 2 wires
  the create/import/export/bulk-delete entries to the gates recorded
  above.
