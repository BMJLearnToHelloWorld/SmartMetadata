# Event subscription delete uses pin's wire shape, and the list refreshes the limit before reloading

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai (2026-11-18: A-group batch; official 1:1 parity required, no documented deviations)
- **Guard:** `smartmetadata-ui/src/api/r6Writes.test.ts` (DELETE URL strictly equals the pin wire); `smartmetadata-ui/src/views/observability/AlertsListView.test.ts` (delete block: limit refresh before first-page reload, no reload on limit failure)
- **Related:** upstream pin `a3012259ca` (`rest/miscAPI.ts` `deleteEntity`, `utils/DeleteWidget/DeleteWidgetUtils.ts` `hardDeleteEntity`, `pages/NotificationListPage/NotificationListPage.tsx`, `pages/ObservabilityAlertsPage/hooks/useObservabilityAlerts.ts`)

## Context

An earlier evidence report claimed the product's parameter-less DELETE left
event subscriptions soft-deleted by default. That premise is wrong: the
server's `EventSubscriptionResource.deleteEventSubscription` declares no
query parameters and hardcodes `delete(..., recursive=true, hardDelete=true)`,
and the base `EntityResource.delete` never reads the query string, so the
delete was already unconditionally hard. What did diverge from pin was the
UI wire shape, the confirmation wording, and the list behavior after a
successful delete: pin's live chain is `hardDeleteEntity` → `deleteEntity`
(`rest/alertsAPI.ts` `deleteAlert` is dead code with zero callers), and both
pin list pages await a forced limit refresh before reloading the first page,
in the same `try`, so a limit failure leaves the list untouched.

## Decision

- `deleteEventSubscription` sends pin's wire verbatim:
  `DELETE /v1/events/subscriptions/{id}?hardDelete=true&recursive=false`,
  with `hardDelete` first. The parameters are sent although the server
  ignores them, so the wire matches pin exactly.
- After a successful list delete, the order is fixed: success toast, then
  a bare `await getLimitByResource('eventsubscription')`, then the cursor
  resets to the first page, then `await load()`. If the limit refresh
  throws, the error surfaces and neither the cursor reset nor the reload
  happens.
- The detail page keeps its existing behavior (delete, toast, navigate
  back) with no limit refresh, matching pin's detail page.

## Consequences

This conclusion applies only to EventSubscription. Other resources'
delete endpoints commonly do declare `hardDelete`/`recursive` parameters
with real semantics, so nothing here licenses sending or dropping
parameters elsewhere. The delete wire test locks the exact URL, including
key order, so a future "helpful" parameter change fails loudly. Do not
reorder the list sequence (reload first, limit later) or swallow a limit
failure: pin's ordering is the specified behavior, not a defect to fix.
