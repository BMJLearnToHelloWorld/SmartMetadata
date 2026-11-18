# Services tab segments validate against the 11 pin categories; LLM and MCP keep product evaluation

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `router/serviceTabSegments.test.ts` (segment validation table,
  detail-route freedom, permission evaluation by resource key)
- **Related:** Settings shell design D-18, §3; C-2 ruling (Bai, 2026-11-18:
  A-1 + B-1 + limited C-3); ADR:2026-11-18-settings-navigation-is-registry-driven

## Context

Pin paths below are relative to `openmetadata-ui/src/main/resources/ui/src/`,
verified against `origin/main` 392b3efd. Pin's services page validates its
`:tab` segment against exactly 11 categories: `isValidServiceTab` accepts
`dataObservability`, a key of the service-type mapping, or a value of the
service-category enum (`pages/ServicesPage/ServicesPage.tsx:42-48`), where
the mapping has 11 keys including `security` and `drives`
(`constants/ServiceType.constant.ts:54-66`) and the enum has 11 values
(`enums/service.enum.ts:27-38`). An invalid tab enters `not-found`
(`pages/ServicesPage/ServicesPage.tsx:169-171`). The page's breadcrumb is
`capitalize(tab)` with a `dataObservability` special case
(`pages/ServicesPage/ServicesPage.tsx:105-110`), and its inner view renders
the Services list plus an admin-only Pipelines tab
(`pages/ServicesPage/ServicesPage.tsx:136-166`).

LLM and MCP services do not exist in pin's services surface: `llm` and `mcp`
have no hit in the mapping, the enum, or the services page. The `llmService`
and `mcpService` identities do exist elsewhere in pin: the `EntityType` enum
carries `LLM_SERVICE = 'llmService'` and `MCP_SERVICE = 'mcpService'`
(`enums/entity.enum.ts:35-36`), and the server's entity registry carries the
same keys (`openmetadata-service/src/main/java/org/openmetadata/service/Entity.java:180-181`).
They are NOT members of pin's `ResourceEntity` permission enum
(`enums/permissions.enum.ts`, read in full: no `LLM_SERVICE`/`MCP_SERVICE`
member), which is why pin's category-to-resource map has no llm/mcp entries
and pin's permission lookup for an unmapped category falls back to
`DATABASE_SERVICE` (`utils/ServicePureUtils.ts:171-174`). What pin lacks is
the services-surface wiring — the category mapping, the enum value, the
registry card, and segment validation — and the permission-enum membership,
not the entity identity. Any claim that pin's `ResourceEntity` enum carries
the two keys is wrong; the accurate statement is the one in this paragraph.

The product's ingestion tab catalog has 13 kinds, adding `llm` and `mcp`
(`smartmetadata-ui/src/catalog/ingestionTabs.ts:124-139`). Pin's permission
lookup for a service category falls back to `DATABASE_SERVICE` when the
category is unmapped (`utils/ServicePureUtils.ts:171-174`), so a pin-style
lookup for an llm/mcp segment would evaluate DATABASE_SERVICE permissions.
The product must not silently inherit that fallback.

## Decision

- The services `:tab` segment validates against the 11 pin categories only.
  An invalid segment enters `not-found`, matching pin's page rule. There is
  no llm/mcp list tab and no other invented segment.
- C-2 deletes llm/mcp list-tab entry and create deep links: the segment
  validator rejects llm/mcp segments, and no navigation in this batch
  constructs a create URL carrying an llm/mcp kind. The wizard route
  itself is retained (D-17): the category page's Add Service action
  navigates by route name to `ingestion-service-add` with no parameters,
  and the wizard view reads no kind from the route. That is not pin's
  form — pin's button navigates through `getAddServicePath('all')`
  (`utils/RouterUtils.ts:85-90`), producing `/:serviceCategory/add-service`
  with the `all` sentinel — and the official path form belongs to the
  sections batch (D-17). The generic detail direct-visit route is
  retained: the detail pattern `/service/:serviceCategory/:fqn/:tab`
  (`constants/constants.ts:186`) carries `:serviceCategory` as a free
  string with no segment validation, and that freedom is pin behavior, not
  a gap to close.
- Permissions for llm and mcp segments are evaluated by their own resource
  keys, `llmService` and `mcpService`, through the single evaluator in
  `settings/permissionRules.ts`. They are never evaluated as
  `DATABASE_SERVICE`. The difference from pin's fallback is recorded here
  deliberately: pin would fall back to `DATABASE_SERVICE` for an unmapped
  category, and the product's choice to evaluate the real keys is a
  documented product decision, not a claim of pin equivalence.
- The services page's inner structure follows pin: the Services list, the
  admin-only Pipelines tab, and the `capitalize(tab)` breadcrumb with the
  `dataObservability` special case. The category page's Add Service button
  and the `canCreateAnyServiceCategory` rule follow pin's form
  (`pages/GlobalSettingPage/GlobalSettingCategory/GlobalSettingCategoryPage.tsx:196-227`;
  `utils/ServicePureUtils.ts:180-186`).

## Consequences

A URL with an llm or mcp services tab segment enters `not-found`, while a
detail URL for an llm or mcp service still resolves and evaluates its own
resource keys. The 13-kind ingestion catalog keeps its llm/mcp kinds for the
surfaces that use them; the catalog is not the segment validator, and the
two tables must not be merged. Any future pin category addition requires
pin evidence before the validator table grows.

## Open items

- GAP-HUB-1, the in-page view-permission gate on the services page, is an
  undecided open item. Pin computes a view permission from the tab's
  resource entity and renders `PermissionPlaceholder` when the user lacks
  view access (`pages/ServicesPage/ServicesPage.tsx:91-99,172,200-211`).
  The shell design does not specify this gate, it is not implemented, and
  it needs a tab-to-resource mapping ruling before any work starts. Nothing
  about it is decided here.
- Whether llm/mcp ever gain pin-style services-surface wiring (mapping,
  enum, card, segment) is undecided and out of scope for this record.
