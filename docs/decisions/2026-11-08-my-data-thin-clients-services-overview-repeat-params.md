# My-data services overview sends health as repeated parameters, lowercase values

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `api/services.test.ts` (query string shape)
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 4, official `rest/serviceAPI.ts`, server `ServicesOverviewResource.java:80`

## Context

`GET /v1/services/overview` binds `health` to a `Set<ServiceHealth>`.
The generated `ServiceHealth` wire values are **lowercase** (`failed`,
`partialSuccess`, `success`, `notRun`). The review's condition-4 text
("health=Failed&health=PartialSuccess") has the wrong casing; the
repeat-parameter part is right. The product's `apiRequest` query type
accepts only `string | number | boolean | undefined` — arrays are not
supported, so an array must never be `String()`-ed into the query.

## Decision

- `getServicesOverview` in `api/services.ts` builds the query string by
  hand with `URLSearchParams.append`, so repeated keys are sent as
  `health=failed&health=partialSuccess` — never a comma-joined single
  value, never `String()` of an array.
- Health values sent are the lowercase wire values, matching the server
  enum binding and official's own requests.

## Consequences

- A `health` filter the server cannot bind (wrong casing, joined value)
  would silently return unfiltered data; this shape cannot produce one.
- Any future array-valued query parameter needs the same hand-built
  treatment until `apiRequest` grows array support.
