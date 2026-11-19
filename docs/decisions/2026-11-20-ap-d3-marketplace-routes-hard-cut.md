# Marketplace routes are hard-cut to the official paths: /marketplace is the app catalog, /data-marketplace is the data marketplace

- **Status:** Accepted
- **Revisions:** v1 2026-11-20 (initial)
- **Deciders:** Bai (2026-11-19 10:01: AP-D3 hard cut approved; rebuild then clear redundancy; Q5 closed the same day — official sidebar has no marketplace entry, the three app pages have no sidebar highlight, no new app group)
- **Guard:** `smartmetadata-ui/src/router/routes.test.ts` (marketplace routes, AP-D3 hard cut); `smartmetadata-ui/src/views/admin/personaPage.test.ts` (landing-page option); `smartmetadata-ui/src/views/shell/PersonaLandingRedirect.test.ts` (entry redirect)
- **Related:** ADR:2026-11-07-route-aliases-use-official-paths (history only — that record is not amended by this cut); t364 Q1 (cut wording A), Q2 (stored-value wording S-A), Q8 (release-note items); migration list `~/workspace/work/settings-sections-batch/preconditions/04-ap-d3-migration-list.md` (items D3, D4, D5, S1, S2, Q5, R2, R8); upstream pin `a3012259ca` (`constants.ts:229` `MARKETPLACE: '/marketplace'`, `:234` `DATA_MARKETPLACE: '/data-marketplace'`; `AuthenticatedAppRouter.tsx:479-503`)

## Context

The product route table carried the two marketplace roots with their
meanings flipped relative to official: `marketplace-overview` lived at
`marketplace` with `alias: 'data-marketplace'`, and the app catalog
(`marketplace-app-catalog`) was squeezed into `marketplace/apps`. The
persona landing-page option for the data marketplace likewise pointed
at `/marketplace`. Official has four records and no alias:
`/marketplace` is the app catalog (`MarketPlacePage`),
`/marketplace/apps/:fqn` the app detail,
`/marketplace/apps/:fqn/install` the install page, and
`/data-marketplace` the data marketplace (`DataMarketplacePage`).

The detail and install paths already matched official word for word,
so only the two roots move. The three app views keep their inline
`isAdmin` guards exactly as they are: at this baseline the three app
routes carry no meta guard, so removing the inline checks would open a
no-guard window. Turning the guards into route meta is separate work
(DEL-22 HOLD) and is not part of this cut.

## Decision

- `marketplace-overview` moves to `path: 'data-marketplace'` and loses
  its `alias: 'data-marketplace'`; `marketplace-app-catalog` moves to
  `path: 'marketplace'`. Route names, the detail/install records, the
  sidebar structure, and the other eleven landing-page options do not
  change.
- **Wording A (t364 Q1): hard cut, semantic break, no redirect, no
  split.** An old `/marketplace` bookmark reaches the app catalog (an
  admin) or the permission placeholder (a non-admin), no longer the
  data marketplace. The old `/marketplace/apps` catalog address breaks
  (falls into the catch-all `not-found`). A `?redirect=` value captured
  inside the cut window is resolved under its new meaning (a
  momentary semantic swap; covered by the redirect tests and the
  route-snapshot test).
- **Wording S-A (t364 Q2): a stored `'/marketplace'` landing-page value
  is left in place; no storage migration is done.** Once the option
  table moves to `/data-marketplace`, the old value no longer hits
  `isLandingPageOption`, so reads fall back to Home (`/my-data`) —
  visible and explainable. S-B (a one-off rewrite of stored values) was
  not adopted and needs its own case; S-C (silently re-interpreting the
  stored value in code) is explicitly not adopted.
- The persona landing-page option becomes
  `{ path: '/data-marketplace', labelKey: 'persona.landingMarketplace' }`
  (`labelKey` unchanged). The read/write/fallback chain is unchanged
  and already matches official: only option-table values are honoured,
  anything else falls back to Home, and a landing page equal to the
  default is never persisted.
- The four stale comments that described the flipped/aliased semantics
  are rewritten with the cut (`router/index.ts`, `router/domains.ts`,
  `api/marketplaceApps.ts`). The `/v1/apps/marketplace` server API path
  is unrelated to the UI routes and does not change. No backend change
  is needed: the server does not validate, interpret, or route on
  `defaultLandingPage` (free string in `personaPreferences.json`).

## Release notes (t364 Q8, recorded here in full; delivered through the existing change-note channel, not issued by this round)

1. `/marketplace` is the app catalog (admin-only) from this release on; the data marketplace is at `/data-marketplace` (that address already worked before the cut).
2. The old catalog address `/marketplace/apps` no longer works; the catalog's new address is `/marketplace`.
3. App detail and install deep links are unchanged.
4. Persona users who had set their landing page to the data marketplace will fall back to Home (under S-A) and must re-select it.

## Consequences

- The route table matches official record for record (see the
  post-cut comparison in the AP-D3 benchmark memo
  `~/workspace/work/apd3-hardcut/BENCHMARK.md` §3.5). Navigation by
  route name, the back/browse/cancel/success chains, and the tour
  steps follow the table automatically and need no code change.
- Old bookmarks and in-flight history entries for `/marketplace` and
  `/marketplace/apps` break once, as wording A states; the release
  notes above carry that break.
- Stored persona landing values of `'/marketplace'` are not migrated;
  affected users see Home until they re-select. If a later round adopts
  S-B, it writes its own record and amends this one; it must not
  silently re-interpret the value (S-C stays rejected).
- The 2026-11-07 route-aliases record stays untouched as history: its
  G-04 note ("already covered by the existing `data-marketplace` alias
  on the marketplace overview") described the pre-cut table and is now
  stale as a description of the live table, but the record itself is
  append-only history and is not rewritten.
