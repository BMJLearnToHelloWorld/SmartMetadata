# The settings route space is `/settings/*` alone; old URLs break, named staging units excepted

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `router/routes.test.ts` (route-pattern manifest, record deletion,
  retained patterns) and `router/guardMatrix.test.ts` (settled-state matrices)
- **Related:** Settings shell design §2 D-1/D-2/D-10, §4; ADR:2026-11-18-detail-routes-keep-id-until-fqn-batch;
  ADR:2026-11-18-system-settings-page-deletion-direction-unapproved

## Context

Pin paths below are relative to `openmetadata-ui/src/main/resources/ui/src/`,
verified against `origin/main` 392b3efd. Pin has exactly one settings route
space: `SettingsRouter` mounts at `/settings/*`
(`components/AppRouter/AuthenticatedAppRouter.tsx:803`), the canonical patterns
are `SETTINGS` and the four `SETTINGS_WITH_*` forms
(`constants/constants.ts:155,174-178`), and the only catch-all is the settings
router's own `*` route to `NOT_FOUND`
(`components/AppRouter/SettingsRouter.tsx:1136`). Pin keeps no legacy path
aliases and no compatibility redirects for settings URLs.

The product scattered settings across `/admin/*`, `/ingestion/*`,
`/observability/*`, `/insights/*`, `/announcements`, `/inbox`, and `/govern/*`,
with a `/settings` alias on the Hub. Unifying the space means every old URL
stops resolving. That breakage is a product compatibility policy, not something
pin's silence proves safe: "pin has no such old URL" is not evidence that no
bookmark or deep link exists.

## Decision

- `/settings/*` is the only canonical settings space. Every route in the shell
  migration table moves to its pin path in one switch; old paths and existing
  aliases are deleted, and no compatibility alias or redirect route is built.
- The hard cut is an explicit product compatibility policy. It must never be
  described as required by pin, and no zero-impact claim may be made for it.
  Verification runs against a route-pattern manifest: deleted patterns leave
  no record, retained patterns still resolve, and in-site navigation is
  checked target by target. A source-wide zero hit for an old path substring
  is not an acceptance gate, because retained patterns legitimately contain
  old path strings.
- Unknown segments follow pin's per-segment rules, never a single blanket
  rule:
  - An unknown `:category` renders the empty category page: the breadcrumb
    constructor yields an empty-name crumb for the unknown category
    (`utils/GlobalSettingsUtils.tsx:76-115`, `categoryObject?.name ?? ''`),
    the category data is `undefined`, and the page renders an empty header
    and an empty grid without entering `not-found`
    (`pages/GlobalSettingPage/GlobalSettingCategory/GlobalSettingCategoryPage.tsx:101,181-235`).
    An unknown category is a matched route, not an unmatched URL.
  - An invalid services `:tab` enters `not-found`, which is that page's own
    rule (`pages/ServicesPage/ServicesPage.tsx:169-171`).
  - An unknown custom-properties `:tab` or search-settings segment renders
    the page's in-page error state through its fetch-failure path and never
    redirects: the custom-properties page looks the segment up in
    `ENTITY_PATH`, fetches, and renders its `isError` branch
    (`pages/CustomPropertiesPageV1/CustomPropertiesPageV1.tsx:67,220-225,279-285`,
    no `NOT_FOUND` reference in the file), and the search-settings entity
    page resolves its configuration from `ENTITY_PATH` the same way
    (`components/SearchSettings/EntitySeachSettings/EntitySearchSettings.tsx:124-128`,
    no `NOT_FOUND` reference in the file).
- Route names do not change, except for the DESIGN D-2 exception: the new
  category list takes the new name `settings-services`, because
  `ingestion-services` stays with the staged aggregate list unit. Only
  `path` values move otherwise. Names are internal
  keys, and renaming would touch every navigation call site for no user-visible
  gain. A name that no longer matches its path is a documented historical
  trace in a route-table comment, not a reason to rename.
- Named staging units are the only exception to the hard cut. Each keeps its
  original URL, name, and behavior until its own ruling or atomic switch, and
  no new record may preempt a staging unit's name:
  - the System settings route at its original URL (deletion on hold; see the
    related record);
  - the aggregate services list unit (`/ingestion/services`, its route name,
    and its current behavior including the `all`/kind tabs and the `?health=`
    buckets); the new category list takes an independent, non-conflicting
    route name and must not seize the staging unit's name;
  - the old user and bot detail URLs, retained until the sections batch
    atomically switches them (see the related FQN record).
  Deletion assertions distinguish record deletion from literal-URL matching:
  only an old literal URL matched by no current canonical or staging record
  is asserted to land in the catch-all; an old static URL covered by a
  retained detail pattern (for example `/admin/users/admins` matching the
  retained `admin/users/:id` pattern) is accepted per that detail pattern's
  parameters, current guard, and unknown-id semantics. No UUID restriction,
  reserved-word exclusion, or new rejection route may be added to force old
  absolute-404 assertions.

## Consequences

Old settings bookmarks break outside the staging units, and the release notes
must say so per the matrices that govern each route. The `domains.ts` prefix
table migrates with the routes: a `settings` group is added, the `/forbidden`
and `/announcements` prefixes leave with their routes, and the `admin` group
is not emptied early while staging routes still live on original URLs.
`domainForPath` returning `null` means only that a path falls in no group; it
never proves a route 404s. Historical references to old paths in
`docs/rebuild/` and in decision records are history and are not rewritten.

## Open items

- Whether an unknown `:category` should be tightened to `not-found` (design
  item C-3) is undecided and arises only if Bai leans toward tightening; the
  default recorded here is pin behavior, and this record does not prejudge it.
- Each staging unit's own exit (the System deletion ruling, execution of the
  aggregate-list and health deletions, the sections-batch atomic switch for
  old user/bot details) remains open; none is approved by this record.
