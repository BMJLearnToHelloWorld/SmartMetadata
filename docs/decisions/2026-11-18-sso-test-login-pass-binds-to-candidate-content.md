# A Test Login pass binds to the candidate content it proved, not to the attempt

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Settings A-group design (DESIGN.md §9, S26) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/admin/ssoTestLogin.test.ts` (safe paths, prefix rule, fail-closed, browser routing, stage mapping); `smartmetadata-ui/src/views/admin/SsoSettingsView.test.ts` (gate, unlock, re-lock, failed retest, new versus existing wording)
- **Related:** upstream pin `a3012259ca`; design `~/workspace/work/settings-agroup-batch/DESIGN.md` (not in-repo, sole authority for this batch); ADR:2026-11-18-sso-candidate-preserves-full-security-document

## Context

The save gate exists because a configuration that cannot sign anyone in locks the admin
out. A Test Login proves a specific candidate: if the admin edits the form after passing,
the pass no longer describes what would be saved, and unlocking on the stale pass would
defeat the gate. Conversely, a pass must survive the modal closing and a later failed
retest of the same unchanged candidate — the proof is about the content, and the content
did not change.

## Decision

- When a test starts, the candidate's `JSON.stringify` is recorded as the tested payload
  key. When the test result turns `success` with that key set, the key becomes the passed
  key. The gate unlocks only while the passed key equals the current candidate's
  `JSON.stringify`: any re-edit re-locks, and a failed retest leaves the pass untouched.
- Resetting the test or closing the modal never clears the pass record; only a new
  candidate or a fresh page load does.
- The gate applies only when the candidate differs from the saved document on a path
  outside `SAFE_EDIT_PATHS` — the pin's fourteen safe paths, copied verbatim, matching
  exactly or by child prefix. A new configuration (no saved document) is always gated.
  The comparison fails closed: a field nobody classified as safe still requires a test.
- The gate never judges inside `save()`: Save is disabled while gated, and the banner's
  Save-anyway button calls the same save — the bypass is explicit, visible, and leaves no
  flag behind.
- Providers that cannot test (`basic`, or no provider at all) are never gated, and the
  Test Login button is hidden for them.

## Consequences

A pass is proof of exactly the content being saved, and nothing else. Extending the safe
list is a decision that must be benchmarked against the pin — a path is safe only when
changing it cannot change who signs in or whether they can — and any such extension needs
a new record.
