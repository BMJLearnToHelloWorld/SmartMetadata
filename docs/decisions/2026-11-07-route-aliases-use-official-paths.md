# The ten pure-route aliases use the official framework's real route paths, not the visual-comparison plan's labels

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Bai
- **Guard:** `routes.test.ts` (official-path aliases), `guards.test.ts`
- **Related:** Visual comparison REPORT.md (G-01…G-10), `~/workspace/work/m2-route-aliases/RULING.md`

## Context

The visual comparison labelled the ten pure-route gaps G-01…G-10 with the
plan's route names (`/data-products`, `/domains`, `/data-products/products`,
`/data-quality/test-suites` → `/quality/test-suites/:id`). Before
implementing the aliases Bai approved, a deep check of the official pin's
`constants.ts` ROUTES and `AuthenticatedAppRouter.tsx` mountings showed
four of those labels do not match the official framework's real routes:

- G-03 conflates two official routes: the data-quality tab
  (`DATA_QUALITY_WITH_TAB '/data-quality/:tab'`, tab `test-suites`) and
  the top-level test-suite detail (`TEST_SUITES_WITH_FQN
  '/test-suites/:fqn'`, mounted as a sibling of the data-quality routes,
  not a child). Aliasing only `/data-quality/test-suites/:id` onto the
  detail route would leave the bare tab URL `/data-quality/test-suites`
  unmatched (it requires an `:id` segment) and would add a URL official
  does not have.
- G-04 `/data-products` is not an official top-level route at all. The
  data-marketplace overview is `DATA_MARKETPLACE '/data-marketplace'`
  (the product route already carries that alias) and the app marketplace
  is `MARKETPLACE '/marketplace'` (the product path itself). The live
  official environment 404s on `/data-products`, confirming it.
- G-05 `/domains` (plural) does not exist officially; the domain list is
  `DOMAIN '/domain'` (singular, `DomainRouter` at `/domain/*`).
- G-06 `/data-products/products` does not exist officially; the
  data-product list is `DATA_PRODUCT '/dataProduct'` (camelCase,
  `DataProductListPage`).

## Decision

The ten aliases are the official paths, one per official route:

- `explore` → `search` (G-01, `EXPLORE`)
- `data-quality` → `quality/test-cases` (G-02, `DATA_QUALITY`)
- `data-quality/test-suites` → `quality/test-suites` (G-03 tab,
  `DATA_QUALITY_WITH_TAB`)
- `test-suites/:id` → `quality/test-suites/:id` (G-03 detail,
  `TEST_SUITES_WITH_FQN`)
- `domain` → `governance/domains` (G-05, `DOMAIN`)
- `dataProduct` → `governance/data-products` (G-06, `DATA_PRODUCT`)
- `glossary` → `governance/glossaries` (G-07, `GLOSSARY`)
- `tags` → `governance/classifications` (G-08, `TAGS`)
- `settings` → `admin/settings` (G-09, `SETTINGS`)
- `data-insights/data-assets` → `insights/data-assets` (G-10,
  `DATA_INSIGHT_WITH_TAB`, tab `data-assets`)

G-04 needs no alias: it is already covered by the existing
`data-marketplace` alias on the marketplace overview. No alias is added
for a path the official framework does not have.

## Consequences

- The product keeps its own route structure (`/governance/`, `/quality/`,
  `/insights/`); the official paths are `alias` entries only, so the
  canonical product URLs, route names and navigation are unchanged.
- The `/settings` alias is admin-gated: `ADMIN_ROUTE_PREFIXES` gains
  `'/settings'`, because the guard judges admin-ness from the URL path
  while official's `AdminProtectedRoute` wraps the route component.
  Without the entry, a non-admin opening `/settings` would bypass the
  admin entry check (the settings hub view performs no admin check of
  its own). The same entry also covers the three pre-existing
  `/settings/governance/*` aliases, which had the same gap.
- `routes.test.ts` asserts each alias resolves to its product route and
  that the three plan-invented paths (`/data-products`, `/domains`,
  `/data-products/products`) stay unmapped.
