# My-data aggregate field options use the POST operation, not the GET one

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `api/search.test.ts` (aggregate request shape)
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 2, official `rest/miscAPI.ts` (`postAggregateFieldOptions`, `postExactAggregateFieldOptions`), server `SearchResource.aggregateSearchRequest`

## Context

The server exposes two aggregate operations: `GET /v1/search/aggregate`
(`getAggregateFields`, a different operation with its own parameters) and
`POST /v1/search/aggregate` (`aggregateSearchRequest`, taking an
`AggregationRequest` body with `fieldName` required and
`additionalProperties: false`). Official `postAggregateFieldOptions`
wraps the caller's `fieldValue` in `.*<escaped>.*` (default `'.*'`);
`postExactAggregateFieldOptions` sends the body as given.

## Decision

- The product clients are the POST operation: `postAggregateFieldOptions`
  and `postExactAggregateFieldOptions` in `api/search.ts`, with the same
  wrapping and the same `escapeESReservedCharacters` map (23 characters,
  each backslash-escaped; `#` is in the regex class but has no map entry
  and passes through unchanged — mirrored, not "fixed").
- `mapAggregateBuckets` strips the `sterms#` prefix and returns
  `{ key, docCount }` pairs.

## Consequences

- CuratedAssets' health aggregation and any other field-option call go
  through the POST body contract the server validates; the GET operation
  is never used for these calls.
- A wrong `fieldValue` is a server 400, not a silent empty result.
