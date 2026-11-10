# The limit banner has no link to a billing/plans page

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Wave 3 G-stages review (G-11 stage D, APPROVE + 14 conditions)
- **Guard:** `src/components/shared/LimitBanner.test.ts` + `src/stores/limitBanner.test.ts`
- **Related:** `docs/decisions/2026-11-10-my-data-customize-page-drag.md`

## Context

The official limit banner is a global header that a `LimitWrapper` drives: when a resource's fetched limit status is at or over its soft or hard threshold, the wrapper sets the banner details (header, `current/hard (plan, threshold%)` subheader, warning/danger), and the banner renders a "learn more about Plans and pricing" link to `/settings/billing/plans`. The product has no billing route, no plans page, and no `/settings/billing/plans` target — that path does not exist in the product's router.

## Decision

Stage D ports the banner otherwise exactly — the `limitBanner` store (`maybeShowLimitBanner`, soft/hard exceed, `limitReached`, plan default `FREE`), the `LimitWrapper` evaluation on fetch (fail-open on fetch failure, banner cleared on unmount), the hidden `dataAssets` driver mounted on the home page, and the `LimitBanner` mounted in `App.vue` — but the banner has NO link. Dropping the link is the recorded deviation: linking to a route that does not exist would be a dead control, and inventing a billing page to link to would be a product invention outside official parity.

## Consequences

- The banner renders the header + subheader + dismiss (which clears the store details). No other behaviour differs from pin.
- If a billing/plans route ever lands in the product, the link can be added back in that batch's scope — record it in a new revision of this record.
- Live verification owed: a data-assets limit at/over the soft limit (banner shows, warning) and at the hard limit (danger), plus dismiss clearing it.
