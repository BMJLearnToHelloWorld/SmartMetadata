# Application detail moves to `:fqn` (A5 follow-up, A12 miss)

- **Status:** Accepted
- **Revisions:** v1 2026-11-20 (initial)
- **Deciders:** Bai (2026-11-19: B-9 → (a1) complete `:fqn`, implementation on the new main;
  2026-11-20 18:57: align to official without weighing destructiveness, no compatibility track)
- **Guard:** `smartmetadata-ui/src/router/routes.test.ts` (admin-app resolve);
  `smartmetadata-ui/src/views/admin/AppDetailView.test.ts` (detail mounts by `fqn` prop);
  `smartmetadata-ui/src/views/admin/AppsListView.test.ts` (list navigation asserts `params.fqn`)
- **Related:** A12 record `2026-11-20-routes-fqn-apd3-meta` (branch `m2-routes-fqn-apd3`,
  user detail `:fqn`, same break class — not yet merged, so cited by filename, not as `ADR:`);
  A5 C-P6j (policy/role detail `:fqn`, same root cause); upstream pin `a3012259ca`
  (`SettingsRouter.tsx:631-648` AppDetails on `getSettingPathRelative(APPLICATIONS, undefined, true)`;
  `RouterPaths.ts:36-64` `withFqn` selects `SETTINGS_WITH_CATEGORY_FQN`;
  `constants.ts:182` `SETTINGS_WITH_CATEGORY_FQN: '/settings/:settingCategory/:fqn'`;
  `ApplicationPage.tsx:116-118` `viewAppDetails` navigates by `fullyQualifiedName`;
  `AppDetails.component.tsx:124,159` `useFqn()` + `getApplicationByName(fqn)`;
  `AppResource.java:828-860` `GET /name/{name}` pure by-name lookup, no UUID fallback)

## Context

A5 found this defect while fixing the policy/role detail routes, and passed it to A12 as
additional scope; A12's branch never touched it. On main `e07bbd8f` the `admin-app` record declared
`settings/apps/:id` (`router/index.ts:422`) while the only navigation point,
`AppsListView.vue:69`, pushed `{ name: 'admin-app', params: { fqn: app.fullyQualifiedName ?? '' } }`.
Vue-router drops the undeclared `fqn` param and warns `Missing required param "id"`, so the detail
view never received its value; `AppDetailView.vue` computed `props.fqn ?? props.id ?? ''` → `''` and
called `getApplicationByName('')` → 404. The view's own fetch was already by-name (matching pin);
only the route segment name was wrong. `routes.test.ts:537` recorded the contradiction in one line:
comment `// 08 admin-app :fqn.` above an assertion of `{ id: 'a1' }`.

## Decision

- `admin-app` moves from `settings/apps/:id` to `settings/apps/:fqn`. The guard declaration
  (`{ resource: 'APPLICATION', operation: 'view' }`) is unchanged.
- `AppDetailView` takes only the `fqn` prop now; the `id` prop and the `?? props.id` fallback are
  deleted (same shape as A12's `UserDetailView`, and as `PolicyDetailView`, which never had an
  `id` prop). The fetch (`getApplicationByName`, `GET /v1/apps/name/{encodedFqn}`) is unchanged.
- `AppsListView` navigation code is unchanged (it already pushed `{ fqn }`); only its header comment
  is corrected. The shared string builder `getApplicationDetailsPath` (`utils/fqnPaths.ts:192`)
  already produced `/settings/apps/<encoded>` and is unchanged.
- No other `:id` entry point exists: the audit log has no `application` typed-link resolver
  (plain-text fallback), the breadcrumb exception only carries the list location, and the
  marketplace detail view uses its own route. The `apps` category segment is kept — pin uses
  `applications`, but the defect is the parameter name only, and the segment is pre-existing
  product naming (same as A5 keeping the product segments on the policy routes).

## Consequences

- **One-time break, no dual track.** A stored `/settings/apps/<UUID>` deep link now calls
  `getApplicationByName(<UUID>)`, which finds no such name → the view's error state. This is the
  same class of break as the A12 `/admin/users/<UUID>` cut, and the same ruling applies: align
  with official, no compatibility track (official has no UUID fallback anywhere on the app/detail
  path, server or UI).
- **Deliberately unchanged.** The role/policy/team detail routes stay `:id` (A5's scope, separate
  branch); the audit-log `application` typed link stays unwired — `auditLogFeed.ts:440-443` still
  says applications “have no FQN detail route today”, which is now stale; wiring the resolver
  (via the existing `getFqnPath('application', fqn)`) is a follow-up, not part of this rename.
