# The SSO candidate secret-mapping decision is superseded: its file is deleted and its guard is removed

- **Status:** Accepted
- **Revisions:** v1 2026-11-20 (initial)
- **Deciders:** Bai (2026-11-20 03:44, Q1(a): official has no guard, remove the N-1 secret save guard)
- **Guard:** `smartmetadata-ui/src/composables/useSsoConfiguration.test.ts` (the diff-based save path; it carries no secret guard, and no secret predicate, by construction) — plus reviewer: any reintroduction of a secret save guard or of the deleted predicates contradicts this record
- **Related:** ADR:2026-11-18-sso-candidate-secret-mapping (the superseded record — its `Status` now points here); ADR:2026-11-18-sso-candidate-preserves-full-security-document (the record that required the secret-mapping re-ruling; itself untouched by this record); PR #240 (`a73a4b78f733`); upstream pin `a3012259ca`

## Context

ADR:2026-11-18-sso-candidate-secret-mapping decided, for the A-group
flat-form SSO page, that the typed secret maps to
`oidcConfiguration.secret` in the candidate, that the save op
(`/authenticationConfiguration/oidcConfiguration/secret`) fires only when
six conditions hold, and that a save guard (d) refuses the save visibly
when the stored document cannot accept the op. Its implementation lived
in `smartmetadata-ui/src/admin/ssoConfiguration.ts`
(`carriesOidcSecret`, `storedAcceptsOidcSecret`, the candidate builder,
the guard), and its Guard named that file's test plus
`SsoSettingsView.test.ts`.

That architecture is gone. The sections batch rewrote SSO as a
schema-driven form with a whole-document diff save, PR #234 restored the
Q1(a) secret semantics into the diff path, and Bai then ruled on
2026-11-20 03:44 (Q1(a)) that official has no guard, so the N-1 guard
goes. PR #240 carried that ruling out: commit `a73a4b78f733`
(`Q1(a): remove N-1 secret save guard to align with official (no
guard)`, 7 files, +4/−677) deleted
`smartmetadata-ui/src/admin/ssoConfiguration.ts` (229 lines) and
`smartmetadata-ui/src/admin/ssoConfiguration.test.ts` (230 lines), and
removed the `secretSaveBlocked` locale key in both locales.

## Decision

- ADR:2026-11-18-sso-candidate-secret-mapping is **Superseded** by this
  record. Its `Status` now reads
  `Superseded by ADR:2026-11-20-sso-candidate-secret-mapping-superseded`
  and its `Revisions` carries the v2 entry. The old record stays where
  it is, unrewritten, as append-only history.
- None of the old decision's operative content describes live code any
  more, at main `e07bbd8f`:
  - The predicates are gone: the tree holds zero definitions of
    `carriesOidcSecret` / `storedAcceptsOidcSecret`. The only remaining
    mention is a comment in `smartmetadata-ui/src/admin/ssoTestLogin.ts:44-45`
    recording that `carriesOidcSecret` was removed with its file and no
    second copy remains to keep in sync.
  - The six-condition secret op is gone: the live save is the
    schema-driven diff in `smartmetadata-ui/src/composables/useSsoConfiguration.ts`
    (939 lines) — `fast-json-patch` `compare` over the whole document,
    sent via `patchSecurityConfiguration(allPatches)` (`:633`). That
    file contains zero mentions of `secret`.
  - The save guard (d) is gone by explicit ruling, not by accident: the
    `secretSaveBlocked` locale key no longer exists in either locale,
    and the guard tests were removed from
    `src/composables/useSsoConfiguration.test.ts` (196 lines in PR #240;
    the file itself survives at 1187 lines, testing the diff-based save).
  - The old Guard is therefore dead in both halves: one file deleted,
    the other (`SsoSettingsView.test.ts`) still present but testing the
    new save path, no longer the old decision.
- The old decision's *rationale* — a typed secret must never be
  silently dropped or mis-stored — is not re-decided here; it is carried
  by the new architecture (the secret travels as an ordinary field diff
  of the stored document, not as a hand-built leaf op into a possibly
  missing block). If a future change reintroduces a hand-built secret op
  or a save guard, that change needs its own record; it cannot revive
  the superseded one by editing it.

## Consequences

- The superseded record must not be cited as the authority for any
  current SSO secret behaviour. Citations to it in the tree are
  historical: ADR:2026-11-18-sso-candidate-preserves-full-security-document
  cites it as the re-ruling it once required, which is a true statement
  about the past and is left alone.
- The sibling record's Guard still names the deleted
  `src/admin/ssoConfiguration.test.ts` alongside
  `SsoSettingsView.test.ts`. That staleness is the same kind as the one
  closed here, but it belongs to the sibling's own decision and is not
  amended by this record; it is flagged for the next round that touches
  SSO records.
- Nothing in this record changes the live save behaviour: the code at
  `e07bbd8f` already is the superseding state. The record exists so the
  next reader does not resurrect the guard or the predicates from a
  record that still says Accepted.
