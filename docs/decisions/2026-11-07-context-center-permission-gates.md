# Context Center permission gates: resource names, hide-not-disable, pin on EditAll

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Wave 1 W1-3
- **Guard:** `ContextCenterOverviewView.test.ts`, `ContextCenterArticlesView.test.ts`, `ContextCenterDocumentsView.test.ts`, `ContextCenterMemoriesView.test.ts` (allow-all stub renders entries; failing permission fetch hides them); `EntityListShell.test.ts` (row-level delete predicate)
- **Related:** W1-3 review condition 5; C-D5 (a); C-D6 (a); upstream pin `a3012259ca` (`enums/permissions.enum.ts`, `enums/entity.enum.ts`, `ContextCenterMemoriesPage.tsx`, `DocumentsView.component.tsx`, `MemoriesView.component.tsx`)

## Context

The four context-center views rendered every create/upload/delete entry
unconditionally. Official gates them on resource permissions, and the
server's `Entity.java` fixes the resource names: articles/documents/
overview use `page` (`KNOWLEDGE_PAGE`), memories use `contextMemory`.
Operation names come from the existing `permissionFlags`
(`Create` / `EditAll` / `Delete`).

## Decision

- Resource names are written literally: `'page'` for articles, documents
  and overview; `'contextMemory'` for memories. No other resource name
  is used in this batch.
- Entries without permission are **hidden**, not disabled — the official
  form (conditional render of each entry). No exception in this batch.
- Per-button gates:
  - Overview: create article / upload document / create folder — `page` `Create`.
    Folder creation maps to `page` `Create`, the same gate official
    applies to knowledge-page creation.
  - Articles: create — `page` `Create`; detail edit and custom-properties
    edit — `page` `EditAll`; row and detail delete — `page` `Delete`.
  - Documents: upload / create folder — `page` `Create`; delete folder,
    row delete, preview delete — `page` `Delete`; bulk move — `page`
    `EditAll`; bulk download — ungated, exactly as official's bulk bar
    shows Download with no permission check (download is a read of files
    the user can already list; the server still enforces access).
  - Memories: create — `contextMemory` `Create`; pin/unpin — `contextMemory`
    `EditAll`; row delete — `contextMemory` `Delete` **and**
    owner-or-admin (`canDelete && (owner || isAdmin)`).
- Pin/unpin gate, verified against official: in this pin the official
  `MemoriesView` threads `onTogglePin` through but renders **no pin
  entry at all** (the pin feature is unreleased; its count is stubbed
  with `TODO: Unhide when pin feature releases in post-2.0`), so there
  is no official pin gate to copy. Pin mutates the memory, so it takes
  the edit-class operation, `EditAll` — not `Create`/`Delete`.
- Memory owner check: a memory's `owners[]` matches the current user by
  `name` (official's comparison) or by `id` (the same identity via the
  stable key); `isAdmin` comes from the auth store's `LoginUser`.
- Fail-closed: a permission request that fails (network / 4xx / 5xx)
  leaves every gate `false`, so no entry renders without a grant.
- Two-role live verification (admin + non-admin) is still owed and
  needs a non-admin account from Bai (C-D6 (a)); until then the gates
  are verified by code + unit tests only, never claimed as live-verified.
