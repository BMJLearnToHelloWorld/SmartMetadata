# Connection field metadata comes from a hand-written registry, not a bundled JSON Schema

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-17 (Context corrected: pin labels are raw keys; the schema supplies description and password format only)
- **Deciders:** service-detail parity design (DESIGN.md §8, ADR-9, F-c) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/components/ingestion/ServiceConnectionDetails.test.ts` (label/description/password resolution, nested recursion, oneOf degradation); `smartmetadata-ui/src/ingestion/connectionFields.test.ts` (registry shape)
- **Related:** upstream pin `a3012259ca` (`utils/ServiceConnectionDetailsUtils.tsx` `getKeyValues`, `getNestedConfigValue`); ADR:2026-11-17-connection-password-strict-mask

## Context

The pin resolves connection-field metadata (description, password format)
by descending the bundled connection JSON Schema, including special oneOf
branches (Airflow connection, JWT security config, GitHub credentials,
database `configSource`). Labels, however, are raw keys: `getKeyValues`
renders `key || title`, and the key is always present, so the schema title
never surfaces as a label. The product ships no bundled connection schema,
so there is nothing to descend.

## Decision

Field metadata comes from the hand-written registry
(`ingestion/connectionFields.ts`): an exact `(group, key)` match first, then
a global key fallback. Registry `groupSchema` fragments carry no
`properties`, so the design's schema drill-down is unimplementable as
written; nested leaves resolve through the flat registry instead (finding
F-c), and leaves with no registry entry render with the key as label and
text type — the pin's schema-missing semantics. The pin's special oneOf
branches degrade to plain recursion: values still render, without
branch-resolved metadata. `DEF_UI_SCHEMA` skip keys are verbatim (14 keys),
and `FILTER_PATTERN_BY_SERVICE_TYPE` entries match the pin table.

## Consequences

Registry coverage is the ceiling for label/description/password fidelity:
unregistered fields render bare. Adding a connector means adding its registry
entries; a future bundled-schema port must re-verify every registry entry
against the schema rather than assuming equivalence. The flat resolution must
not be "fixed" by inventing `properties` the registry does not carry.

## Amendment

v2 corrects the v1 Context, which implied the pin takes field labels from
the schema. The pin's labels are the raw keys (`key || title`, key always
present); the schema supplies description and password format. The registry
decision is unchanged.
