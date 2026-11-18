# Detail routes keep `:id` until the FQN batch; teams stays on the list route until FQN lands

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `router/routes.test.ts` (patterns stay `:id`, no `:fqn` pattern in
  this batch) and reviewer verification against the pin patterns below
- **Related:** Settings shell design D-11, §3.6, §4; ADR:2026-11-18-settings-route-space-is-the-only-canonical-space

## Context

Pin paths below are relative to `openmetadata-ui/src/main/resources/ui/src/`,
verified against `origin/main` 392b3efd. Pin's detail routes are FQN-keyed:
`SETTINGS_WITH_CATEGORY_AND_FQN` is `/settings/:category/:fqn`
(`constants/constants.ts:174-178`), and the teams landing route takes a
default FQN — `/settings/members/teams/Organization`
(`pages/TeamsPage/TeamsPage.tsx:555`, with the same path in the settings
router's test at `components/AppRouter/SettingsRouter.test.tsx:305`).

The product's detail routes are `:id`-keyed and the sections batch owns the
FQN conversion, which needs the per-entity fetch and navigation work. Moving
the shell to FQN parameters now would leave detail pages fetching by the
wrong key.

## Decision

- Detail routes keep `:id` in this batch. The shell migration renames paths
  but does not convert detail parameters; no `:fqn` detail pattern is
  introduced by the shell batch.
- The FQN conversion is deferred to the third batch (the sections batch),
  which converts detail routes, fetch calls, and navigation targets together
  in one atomic switch per entity. Until that switch, old detail URLs and
  their parameters stay working as staging units.
- The teams target in this batch is the teams list. The teams registry
  entry navigates to `/settings/members/teams` (DESIGN §3.6): its
  target descriptor records pin's Organization target as a D-11 todo,
  and the navigators route by key segments to the list route. Pin
  navigates to the Organization team
  (`pages/GlobalSettingPage/GlobalSettingCategory/GlobalSettingCategoryPage.tsx:130-138`,
  `getTeamsWithFqnPath(TeamType.Organization)`); aligning to the pin
  target lands with the FQN batch (D-11). This is the only documented
  exception to registry-driven navigation dispatch; it is an
  entry-level target descriptor, not a second dispatch rule.

## Consequences

Detail pages in this batch must not assume FQN parameters exist; any code
that reads a detail parameter reads `:id` and treats the value as an opaque
identifier. The sections batch owns the conversion checklist (patterns,
fetch calls, navigation targets, tests) and must not land a partial
conversion that leaves a page fetching by one key and routing by another.

## Open items

- The FQN batch's exact switch order per entity is the sections batch's
  design, not this record's.
- Whether the teams default stays Organization after the FQN batch is a
  sections-batch question; pin's default is Organization, and this record
  does not change it.
