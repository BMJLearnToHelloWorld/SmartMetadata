# Search `query_filter` travels as a JSON string, never an object

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Wave 1 W1-3
- **Guard:** `search.test.ts` (the emitted `query_filter` query value parses back to the expected filter object); `contextCenter.test.ts` (G-20 folder term filter sent as a string)
- **Related:** W1-3 review condition 1; `RULING-context-center.md` §2.4; upstream pin `a3012259ca` (`rest/searchAPI.ts`, `SearchResource.java`)

## Context

The server's `GET /v1/search/query` takes `query_filter` as a `String`
(`SearchResource.java`), and official callers always send
`query_filter: JSON.stringify(queryFilter)`. The product's `apiRequest`
only carries `string | number | boolean` query values and stringifies
each with `String(value)`, so an object filter would arrive on the wire
as the literal string `"[object Object]"` and fail server-side parsing
(or silently match nothing).

## Decision

- `SearchAssetsOptions` gains `query_filter?: string` — a string type,
  not an object. Callers serialize the filter object with `JSON.stringify`
  before passing it in.
- G-20's folder term filter keeps the official shape verbatim, attached
  only when a folder is selected:
  `{ query: { bool: { filter: { term: { 'folder.id': selectedFolderId } } } } }`.
  With no folder selected, no term is sent.
- `nlqSearch` does not gain the parameter: its comment previously claimed
  the NLQ surface sent `query_filter`, which was false; the comment is
  corrected instead of widening the call.
