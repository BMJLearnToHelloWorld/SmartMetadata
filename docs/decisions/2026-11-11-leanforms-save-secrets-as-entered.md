# Typed secrets are saved as entered (official alignment)

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai
- **Guard:** `connections.test.ts` (MySQL typed-password regression test) + full vitest
- **Related:** ADR:2026-11-08-leanforms-tier2-store-secrets-checkbox (superseded),
  Wave 2 W2-5, `~/workspace/work/leanforms-save-secrets/RULING.md`

## Context

On 2026-11-11 Bai reported MySQL 1045 on icrm_monorepo although he had
filled in the password. Reproduction (same flow as the UI: GET service,
create the test-connection workflow with the returned connection, trigger,
poll) failed CheckAccess with `(1045, "Access denied for user
'icrm_monorepo'@'...' (using password: NO)")`. The stored entity has no
`password` key and no `authType` key: the password was never saved. The
server round-trips MySQL `authType.password` fine (verified with a temporary
service, deleted afterwards), so the server is not the cause.

The cause is the product's lean-forms "secret discipline": typed secret
literals were persisted only when the form carried
`storeConnectionSecrets: true`, via a persist-secrets checkbox that is
unchecked by default. When it is off, the builder silently drops the typed
password and the save still shows success — the user has no signal that the
password was discarded.

Official at the pin has no persist-secrets checkbox at all (zero hits for
`storeSecrets` / `storeConnectionSecrets` in the pin UI): official forms
send secrets as entered. The checkbox was a product-side invention, and it
broke the most basic flow — creating a service and testing its connection.

## Decision

- Typed secret literals are saved as entered, exactly like official. The
  `storeConnectionSecrets` flag no longer gates anything and is removed
  from the form type, the builder, the field registry (the checkbox is
  gone from every connection form), and the generated CLI workflow YAML
  (official's workflow YAML has no such key; nothing reads it).
- What stays, because it is edit-save correctness rather than a deviation:
  - A blank secret field on edit preserves a masked previously stored
    value — without this, every edit-save would wipe the stored secret.
  - A typed masked value (`********`, `hidden`) is never sent as a
    literal.
  - Secrets are never prefilled into forms (`displaySecret` returns '').
  - `${ENV}` placeholders still pass through (now subsumed by "typed
    literals persist").

## Consequences

A user who types a password gets it saved, as in official. The silent-drop
trap is gone. The deliberate opt-in is also gone: anyone who can edit a
service connection can now persist a typed secret to the service entity,
which is what official does — the server encrypts stored secrets the same
way. The `connection.secretHint` and `connection.apiKeyHint` texts no
longer mention the checkbox. The superseded checkbox record stays in
place with its Status pointing here.
