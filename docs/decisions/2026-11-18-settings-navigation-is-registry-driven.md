# Settings navigation is driven by one registry; breadcrumb call-site exceptions outrank the constructor

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `settings/registry.test.ts`, `settings/breadcrumbs.test.ts`,
  `settings/breadcrumbExceptions.test.ts`, and `settings/permissionRules.test.ts`
- **Related:** Settings shell design §1.2, §3, §5.2, §9, §11; ADR:2026-11-18-guard-declarations-are-route-meta-with-allof

## Context

Pin paths below are relative to `openmetadata-ui/src/main/resources/ui/src/`,
verified against `origin/main` 392b3efd. Pin's settings menu is one data tree
of `SettingMenuItem` records (`utils/GlobalSettingsUtils.tsx:24-35`) carrying
key, icon, description, category/label, `isBeta`, `isProtected`, and children.
The Hub filters that tree in two stages: children are first reduced to the
`isProtected` ones (`utils/GlobalSettingsUtils.tsx:37-44`), then a top-level
item with a defined rule takes its rule's value, and a rule-less item shows
only while it still has items
(`pages/GlobalSettingPage/GlobalSettingPage.tsx:47-68`). An empty Hub renders
the permission placeholder with the Settings entity
(`pages/GlobalSettingPage/GlobalSettingPage.tsx:82-90`).

The product's `settings/hub.ts` split the same surface into live routes and
residual text, a second catalog with its own semantics. Breadcrumbs have the
same shape of problem: pin has one constructor
(`utils/GlobalSettingsUtils.tsx:76-115`) and many pages that build their own
arrays instead, and the two outputs differ in text, links, and levels.

## Decision

- The registry data in `smartmetadata-ui/src/settings/registry.ts` is the
  single source of truth for settings navigation: the 11 categories in pin
  order, entries and nested entries, title and description keys, permission
  rules, `isBeta`, icon colors, and sort flags. The Hub, the category pages,
  the shared card, the breadcrumbs, and the guards all derive from it or from
  tables derived from it. No second catalog may be kept anywhere. The old
  `hub.ts` catalog, including its live/residual split, is deleted.
- Registry items hold no route names and no `segment` field: URL segments are
  derived from the dotted key, and route names live in the router's tables.
  Navigation dispatch splits the dotted key and derives the target from its
  segments; an unknown key resolves to nothing, with no fallback. The one
  described exception is the teams entry, whose pin target is the
  Organization teams URL (see the related FQN record).
- Permission rules are data, not booleans: `admin`, `always`, `view(resource)`,
  `auditOrAdmin`, and `loginConfig`. Evaluation reproduces pin's two-stage
  filter exactly: a defined rule decides, a rule-less item shows only when
  visible children remain, and a rule-less leaf never shows. `view` means
  `ViewAll || ViewBasic` (`smartmetadata-ui/src/api/permissions.ts`,
  `permissionFlags`). An admin identity is not treated as a view grant by the
  evaluator; pin evaluates from permission data.
- Evaluation has one live definition. Rule data stays in `registry.ts`; live
  evaluation, the resource-key mapping, and the login gate are defined only
  in `smartmetadata-ui/src/settings/permissionRules.ts` (coordinator ruling,
  2026-11-18). The synchronous duplicates formerly in `registry.ts`
  (`evaluateSettingsPermissionRule`, `filterSettingsRegistry`,
  `isLoginConfigurationApplicable`, `isLoginConfigurationVisible`,
  `LOGIN_CONFIGURATION_PROVIDERS`) were deleted by the integration
  stream; no caller may add a dependency on a second evaluator. The
  registry module itself performs no fetching.
- The default breadcrumb constructor reproduces pin's
  `getSettingPageEntityBreadCrumb`: a linked Settings root, a category crumb
  (linked when an entity name is present, active otherwise), an optional
  sub-category crumb with the same rule, and an unlinked active entity crumb.
  Category and sub-category names come from the 13-entry name table
  (`utils/GlobalSettingsClassBase.ts:94-147`: 11 categories plus the
  `search-settings` and `workflow-definitions` sub-categories), keyed
  separately from card titles even when the values coincide. The constructor
  never emits a hardcoded label.
- Call-site exceptions outrank the constructor and the registry titles. Each
  is expressed as data, verified against its pin call site, and tested row by
  row:
  - Persona details build their own array, usually two segments, with a
    category segment appended only when the active category hits the
    category table, and no injected Settings root
    (`pages/Persona/PersonaDetailsPage/PersonaDetailsPage.tsx:107-133`).
  - Application details render no breadcrumb and keep the Browse Apps return
    button (`components/Settings/Applications/AppDetails/AppDetails.component.tsx:700-717`;
    no breadcrumb component in the file).
  - Search-settings entity pages and custom-properties type pages pass a
    `startCase`-derived name to the constructor, never a registry title
    (`components/SearchSettings/EntitySeachSettings/EntitySearchSettings.tsx:162-169`;
    `pages/CustomPropertiesPageV1/CustomPropertiesPageV1.tsx:71-76`).
  - The Learning page builds its own three-item array ending in the singular
    `label.learning-resource` with an empty URL, never the plural registry
    title (`pages/LearningResourcesPage/LearningResourcesPage.tsx:146-156`).
  - The OM URL page ends in the template-generated
    `{{brandName}} URL Configuration`, never the card's short title
    (`pages/Configuration/UrlConfiguration/UrlConfigurationPage.tsx:65-74`).
  - The Lineage page renders a breadcrumb plus a plain `h5` title and no
    `PageHeader` (`pages/LineageConfigPage/LineageConfigPage.tsx:212-223`;
    no `PageHeader` in the file).
  - The Data Asset Rules page builds its own three-item array whose last
    item carries a URL, unlike the constructor's unlinked last item
    (`pages/Configuration/DataAssetRules/DataAssetRulesPage.tsx:46-67`).
  - Bot details and user/non-Organization team details follow their own
    top-level and parent-chain forms as specified by the sections batch, not
    the settings constructor.
- The menu/route asymmetry is pin behavior and is preserved, never
  "corrected": roles/policies, online users, and SSO are admin-only in the
  menu while their routes admit view-authorized or merely logged-in users
  (SSO routes carry no guard wrapper at all:
  `components/AppRouter/SettingsRouter.tsx:401,1074-1076`, while the SSO menu
  item is admin-only: `utils/GlobalSettingsClassBase.ts:1002-1008`). Guard
  rules are never derived backwards from menu rules.

## Consequences

Adding a settings surface means adding registry data; a title, description,
or rule changes in exactly one place. Any breadcrumb change needs call-site
evidence: the uniform constructor must not overwrite an exception page, and
registry copy must not replace an exception page's output. The `isBeta` flag
appears only on the Data Asset Rules card, the sole `isBeta: true` in pin's
registry (`utils/GlobalSettingsClassBase.ts:712`); no other card may gain one
without pin evidence.

## Open items

The following breadcrumb rows are undecided open items. Implementation of
each row is stopped pending a design revision or a ruling by Bai; nothing
about them is decided here, and no implementation for them has landed:

- CONFLICT-1, policy rule add/edit: pin builds four-item arrays with no
  Access Control level, and the edit page ends in the rule name rather than
  an Edit Rule label (`pages/PoliciesPage/PoliciesDetailPage/AddRulePage.tsx:57-80`;
  `pages/PoliciesPage/PoliciesDetailPage/EditRulePage.tsx:57-78,169-170`).
- CONFLICT-2, workflow list/details: in Classic mode pin renders no
  breadcrumb on the list (the breadcrumb exists only in the AI-mode branch)
  and a single-item breadcrumb on the details page
  (`pages/WorkflowDefinitions/WorkflowsPage/WorkflowsPage.tsx:396-402`;
  `pages/WorkflowDefinitions/WorkflowBuilder/WorkflowBuilder.tsx:552-561`).
- CONFLICT-3, role/policy details: pin builds two-item arrays with no
  Settings root and no Access Control level, and the constructor cannot
  produce the uniform four-level form because neither key is in the name
  table (`pages/PoliciesPage/PoliciesDetailPage/PoliciesDetailPage.tsx:114-126`;
  `pages/RolesPage/RolesDetailPage/RolesDetailPage.tsx:105-117`).
- CONFLICT-4, Task Forms: pin calls the constructor with the `task-forms`
  sub-category (`pages/TaskFormSettingsPage/TaskFormSettingsPage.tsx:541-546`),
  but `task-forms` is absent from pin's 13-entry name table, so pin's literal
  output carries an empty-name crumb. Whether to reproduce the literal output
  or approve the designed three-level form as a decided deviation is
  undecided.

## Deferred

- Type unification: `SettingsPermissionRule`'s `view` resource uses the
  narrow hand-written `SettingsPermissionResource` union
  (`settings/registry.ts`), while `PermissionRule` uses the wide
  `ResourceEntityName` (`settings/permissionRules.ts`). Unifying the two
  would widen the rule set the registry can express, so the unification
  needs a design ruling; it is deferred here, not decided.
