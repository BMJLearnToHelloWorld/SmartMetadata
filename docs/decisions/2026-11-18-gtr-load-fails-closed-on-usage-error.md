# Glossary-term relation loading fails closed when the usage fetch fails

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai (2026-11-18: settings-page fixes align 1:1 with official; A-group batch, GTR-D7)
- **Guard:** `smartmetadata-ui/src/views/admin/GlossaryTermRelationSettingsView.test.ts` (usage 500 with list 200 renders empty with an error and no delete buttons)
- **Related:** upstream pin `a3012259ca` (`GlossaryTermRelationSettings.tsx` `fetchRelationshipTypes`; `RelationshipTypeTable.tsx` usage gating)

## Context

The page gates deletion on usage: a type is deletable only when its usage count is 0. The loader swallowed usage failures with a per-item `.catch(() => ({}))`, so every type read as unused and every non-system type became deletable — one failing usage endpoint could delete a relationship type that was in use, with no error shown. Official loads the list and the usage counts in one `Promise.all` with no per-item catch, so either failure leaves both states at their initial empty values and no row renders.

## Decision

- Loading the list and the usage counts is atomic: if either fails, the list is empty and an error is shown. A row is never rendered deletable while usage is unknown.
- `usageCounts[name] ?? 0` is valid only on the premise that loading succeeded; it must never turn "unknown" into 0.

## Consequences

No per-item `.catch` default may be added to this page's load chain. The friendlier alternative — keep the list but disable deletion while usage is unknown — would need a new decision record and Bai's approval, and must not be introduced quietly.
