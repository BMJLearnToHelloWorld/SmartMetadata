# Connection password fields render a fixed mask and the real value never enters the DOM

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity design (DESIGN.md §8, ADR-6, option b, B5) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/components/ingestion/ServiceConnectionDetails.test.ts` (mask assertions, recursive masking, sslConfig triplet)
- **Related:** upstream pin `a3012259ca` (schema `format: password`); ADR:2026-11-17-connection-schema-registry-metadata

## Context

The pin marks secret fields in the connection JSON Schema (`format:
password`) and the details view masks them. The product has no bundled
schema, so the password signal comes from the hand-written field registry
(`control === 'password'` or `schemaFormat === 'password'`). A value that
reaches the DOM — even inside a masked input's `value` attribute — is
exposed to inspection and to any DOM-scraping code.

## Decision

Strict masking (option b): when the registry signals a password field, the
details view renders a fixed mask placeholder and the real value never enters
the DOM, recursively, with the signal propagating into nested objects. The
`sslConfig` triplet (`caCertificate`/`sslCertificate`/`sslKey`) is masked
because the pin schema marks all three `format: password`, even though the
registry knows them only under form keys. Masking never depends on
`redactConnectionForDisplay`.

## Consequences

A field missing from the registry renders as plain text; adding a connector
whose schema marks new password fields requires the registry entry first.
Copy, reveal, and show/hide affordances are out of scope for this view — the
mask is total, not a toggle.
