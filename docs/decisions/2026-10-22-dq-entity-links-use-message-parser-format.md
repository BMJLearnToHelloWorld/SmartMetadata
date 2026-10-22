# Data-quality entity links use the MessageParser `<#E::type::fqn>` format

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 5)
- **Guard:** `smartmetadata-ui` test-case writes send `entityLink` values from
  `toEntityLink()`; reviewers reject `<E#/...>` swagger-example links and CCL UI reuse
- **Related:** `docs/rebuild/PHASE5.md`; ADR:2026-10-22-clean-room-vue-spa

## Context

`CreateTestCase` requires `entityLink`. OpenAPI examples still show
`<E#/{entityType}/{entityFQN}>`. The server parser
(`MessageParser.EntityLink`) only accepts markdown links of the form
`<#E::{entityType}::{entityFQN}>` and, for a column test,
`<#E::{entityType}::{entityFQN}::columns::{column}>`. A create that follows
the swagger example is rejected.

## Decision

- The clean-room UI builds entity links with `toEntityLink(type, fqn, column?)`.
- Table-level tests use `<#E::table::{fqn}>`. Column-level tests append
  `::columns::{column}`. Topic tests use `<#E::topic::{fqn}>`.
- Asset-detail test listing filters with `entityFQN` + `includeAllTests=true`,
  not a reconstructed link, because that list API documents an FQN query.

## Consequences

Creates stay compatible with the live parser even if swagger examples lag.
Changing the on-the-wire format is a new decision after the server contract
changes. Inventing a second link syntax in the SPA is forbidden.
