# Kafka consumerConfig / schemaRegistryConfig parse as arbitrary JSON objects, not string maps

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `connections.test.ts` (Kafka consumer/schemaRegistry config values)
- **Related:** Wave 2 W2-5, `wave2/REVIEW-W2-LEANFORMS-T2.md` conditions 3 and 12, `RULING-lean-forms.md` §4.8

## Context

`kafkaConnection.json` and `redpandaConnection.json` declare
`consumerConfig` and `schemaRegistryConfig` as `type: object` with
`additionalProperties: true` — values may be strings, numbers, booleans, or
nested objects. The existing `parseJsonMap` (used by `connectionOptions` /
`connectionArguments`, which the specs constrain to string maps) throws on
any non-string value. Reusing it would reject legal consumer configs at
save time, after the user filled the whole form.

## Decision

- A new `parseJsonObject` parses the two fields: invalid JSON throws,
  a non-object throws, values of any JSON type are kept. It shares the
  error wording of `parseJsonMap` for the invalid/non-object cases.
- `ServiceConnectionConfig` gains explicit `consumerConfig?:
  Record<string, unknown>` and `schemaRegistryConfig?: Record<string,
  unknown>` fields (the index signature could carry them, but tier 1
  mode requires explicit fields).
- Round-trip reuses the existing `stringifyJsonMap` (`JSON.stringify`
  preserves every JSON value type).
- S3's `connectionOptions` / `connectionArguments` stay on `parseJsonMap`:
  their spec (`connectionBasicType.json`) constrains them to string maps.

## Consequences

A consumer config such as `{"retries": 3, "enable.auto.commit": false,
"headers": {"a": 1}}` saves as-is. A future JSON-object field with
`additionalProperties: true` (for example tier 3A Mcp `servers`) reuses
`parseJsonObject`, never `parseJsonMap`.
