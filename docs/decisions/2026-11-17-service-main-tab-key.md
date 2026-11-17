# The service main tab key is a stable English slug, and only its display name is localized

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-17 (Decision corrected: spaceless slugs are product normalization, not pin quirks)
- **Deciders:** service-detail parity design (DESIGN.md §5/§8, ADR-1) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/catalog/serviceCountLabel.test.ts` (slug/labelKey pairs per kind); `smartmetadata-ui/src/catalog/serviceDetailTabs.test.ts` (registry order and main-tab key)
- **Related:** upstream pin `a3012259ca` (`utils/ServicePureUtils.ts` `getCountLabel`); ADR:2026-11-17-service-detail-tab-query

## Context

The pin's `getCountLabel` returns a localized plural label (`databases`, `topics`,
…) used both as the main tab's identity and its display text. The product's tab
registry is URL-driven (`?tab=`), and a localized key would make the URL
locale-dependent and break tab matching across locales. The key must be stable;
the display name must still follow the pin's per-kind label.

## Decision

`getCountLabel` (`catalog/serviceCountLabel.ts`) returns `{ key, labelKey }`:
`key` is a stable English slug (`databases`, `topics`, `dashboards`,
`pipelines`, `mlmodels`, `containers`, `searchindexes`, `collections`,
`directories`); `labelKey` is always `serviceDetail.countLabels.*` and is the
only localized part. The slug follows the pin's branch structure, but the
spaceless forms are product normalization, not pin quirks: the pin's
localized labels carry spaces (`label.ml-model-plural` is "ML Models",
`label.search-index-plural` is "Search Indexes"). The API kind uses
`collections` because the pin renders `label.collection-plural` there. Kinds
with no child table (metadata, security, LLM, MCP) fall through to the pin's
default database branch.

## Consequences

Tab keys, `?tab=` values, and registry lookups never depend on locale. Any new
service kind must add its slug and both locale entries together; a slug change
breaks bookmarked URLs and must be treated as a breaking change.

## Amendment

v2 corrects the v1 Decision, which called the spaceless `mlmodels` /
`searchindexes` slugs pin quirks. The pin's labels have spaces; dropping
them is the product's URL-key normalization. The slugs themselves are
unchanged.
