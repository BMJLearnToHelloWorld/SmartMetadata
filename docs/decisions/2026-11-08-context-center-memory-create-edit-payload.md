# Context Center memory create/edit payloads: slug name, diff-only patch, split delete

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 W2-1 (G-21)
- **Guard:** `contextCenterMemories.test.ts` (slug, create payload, update patch); `contextCenter.test.ts` (create body, JSON Patch update); `ContextCenterMemoriesView.test.ts` (create posts slug name; modal delete is soft)
- **Related:** W2-1 review conditions 2, 3, 10; upstream pin `a3012259ca` (`CreateMemoryModal.utils.ts` `submitMemoryCreate`/`submitMemoryUpdate`/`resolveMemoryType`, `CreateMemoryModal.component.tsx`, `ContextCenterMemoriesPage.tsx` `handleDeleteMemory`)

## Context

Official creates a memory with `question = answer =` the memory text, a
slug `name`, and `shareConfig` always present; editing diffs the form
against the stored memory with `fast-json-patch` and sends only the
changed operations. The product previously had no create/edit contract
at all (create took `{question, answer?}` and edit did not exist), and
the list row deleted hard while the official edit modal deletes soft.

## Decision

- Create: `name = slug(title or text)` — lowercase, non-alphanumerics
  become `-`, truncated to 64 characters, never a UUID. `question` and
  `answer` are both the memory text. `title`, `memoryType`, `tags`,
  `primaryEntity`, `relatedEntities` are sent only when valued;
  `shareConfig: {visibility}` is always sent (default `Private`).
- Edit: the update is a diff-only RFC 6902 patch. `summary` is always
  cleared to `''`. `shareConfig` is sent only when the stored memory
  already has one or the new visibility is not `Private`. `memoryType`
  goes through `resolveMemoryType`. Both sides normalize linked entities
  to the five patch fields (`id`, `type`, `name`, `displayName`,
  `fullyQualifiedName`) so server-added fields such as `href` emit no
  spurious `replace`. Official collapses `question = answer` on edit;
  a stored memory whose question differs from its answer loses the
  distinct question on first edit — that is official behavior, followed.
- No new dependencies: the diff (`diffJsonPatch` in `src/admin/jsonPatch.ts`)
  and the LCS word diff for the compare view are implemented in-product.
  They are wire-equivalent to `fast-json-patch` and `diff` for the flat
  memory-edit shape; a deeper shape must re-evaluate the dependency.
- Delete is split by surface and must not be confused: the list row
  deletes hard (`hardDelete=true`, product behavior kept); the edit
  modal deletes soft (no `hardDelete`, official `deleteContextMemory(id)`).
- Edit opens only for `(isOwner || isAdminUser) && canEditAll`, matching
  the official edit gate.
