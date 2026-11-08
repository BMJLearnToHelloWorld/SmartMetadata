# Bulk document download uses a raw authed fetch and rejects non-zip bodies

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Wave 1 W1-3
- **Guard:** `contextCenter.test.ts` (bulk download returns the blob on a zip response; a JSON error body throws instead of being saved; bulk delete/move send the official shapes and report successful ids)
- **Related:** W1-3 review condition 8; `RULING-context-center.md` §3.1; upstream pin `a3012259ca` (`rest/assetAPI.ts` `downloadDriveFiles`, `ContextCenterDocumentsPage.tsx` `handleBulkDownload`/`handleConfirmBulkDelete`/`handleBulkMove`)

## Context

`apiRequest` only carries JSON/text responses — there is no blob mode —
so `POST /v1/contextCenter/drive/files/bulk/download` cannot go
through it. The upload path (`uploadDriveFile`) already solves the same
problem with a raw `fetch` carrying the auth header. The download
endpoint returns `application/zip` on success but a JSON error body on
failure (503 when no object storage is configured, 404 when a file has
no content, 400 with a `BulkOperationResult` for bad input), so a naive
"save whatever came back" would store an error JSON as `.zip`.

## Decision

- `downloadDriveFiles` uses a raw `fetch` with the auth header, mirroring
  `uploadDriveFile`, instead of adding a blob branch to `apiRequest`
  (the narrower change; only this one call needs a blob).
- A non-OK response throws `ApiError` with the server's message. An OK
  response whose `Content-Type` is JSON also throws — an error JSON is
  never saved as `context-center-documents.zip`. Only a zip body is
  returned as a `Blob`.
- The three bulk calls keep the official signatures and partial-success
  semantics: `bulkDeleteDriveFiles(ids, hardDelete=false)` →
  `POST …/bulk/delete` `{ ids, hardDelete }`; `bulkMoveFilesToFolder(ids,
  folderId)` → `PUT …/bulk/move` `{ ids, folder: { id, type: 'folder' } }`;
  `downloadDriveFiles(ids)` → `POST …/bulk/download` `{ ids }`.
  Successful ids come from `successRequest[].request` (string set); bulk
  delete/move clear only the succeeded ids from the selection and keep
  the failed ones selected with an error shown; a partially-failed bulk
  delete leaves its confirmation open; a successful download clears the
  whole selection; a successful move updates the moved rows' `folder`
  in place and refreshes the folder list and counts.
- Bulk delete and single-file delete are both soft deletes
  (`hardDelete=false`).
- The bulk-move folder menu lists folders only: official's bulk bar has
  no "move to root" entry (root move exists only as the single-file
  `moveFileToRoot` call, which is out of this batch's scope), even
  though the server accepts an omitted `folder`.
- Bulk-bar gates follow official's `ListHeader`: download is ungated,
  move needs `EditAll`, delete needs `Delete` (see ADR
  `2026-11-07-context-center-permission-gates`).
