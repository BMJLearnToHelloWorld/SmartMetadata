# The policy rule form preserves a rule's fullyQualifiedName on round-trip

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai (2026-11-18: settings-page fixes align 1:1 with official; A-group batch, P6j)
- **Guard:** `smartmetadata-ui/src/views/admin/PolicyRuleFormView.test.ts` (add keeps the stored FQN on untouched rules and omits it on the new rule; edit carries the original FQN back)
- **Related:** upstream pin `a3012259ca` (`AddRulePage.tsx`, `EditRulePage.tsx` — official never synthesizes a rule FQN and its server never recomputes one)

## Context

The rule form saves with a `replace /rules` patch whose value is built from mapped rules, and the mapper dropped `fullyQualifiedName`. The server never recomputes a rule-level FQN anywhere in the PATCH chain, so one rule save wiped the FQN of every rule on the policy. The loss is silent and bounded: seed rules carry no FQN, official's add-rule path carries none either, and no consumer reads a rule FQN, so permission evaluation is unaffected — but a value once written explicitly was destroyed by an unrelated edit.

## Decision

- The rule form round-trips `fullyQualifiedName` at its original value: an edit carries the stored value back, a new rule omits it.
- The value is never synthesized in the UI and never recomputed on the server.
- The `replace /rules` shape is retained: with preservation in place, the end state matches official's differential patch (rules match by `name` for change records, and the stored JSON is the full updated policy either way).

## Consequences

Values already lost cannot be recovered by this fix — the server has no recomputation step, and whether to recover them from version history is a separate decision. Any future rule write path must carry the field the same way, and must never invent an FQN for a rule that has none.
