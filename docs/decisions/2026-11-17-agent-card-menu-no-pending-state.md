# The agent card overflow menu has no pending state; all items disable together only while an action is pending

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-17 (Decision corrected: run is not a menu item; Context/Consequences enriched with the pin's loader and close-blocking)
- **Deciders:** service-detail parity design (DESIGN.md §8, ADR-14, D13) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/components/ingestion/AgentCard.test.ts` (menu hidden without permission, trigger disabled when orchestrator is down); `smartmetadata-ui/src/views/ingestion/PipelineRowActions.test.ts` (hide semantics, admin without permission, re-deploy disabled)
- **Related:** upstream pin `a3012259ca` (`AgentOverflowMenu.component.tsx`, `useAgentPermissions.ts`); V11

## Context

The pin's agent overflow menu disables every item while an action is pending,
shows a loader on the pending item, and blocks closing the menu until the
action resolves (`AgentOverflowMenu.component.tsx`); it hides items the user
lacks permission for, using a permission triad with no admin input:
`{ trigger: can(Trigger), edit: canEditAll, delete: canDelete }`. The menu
itself holds pause/resume, kill, re-deploy, edit, and delete — run is a
separate card button, not a menu item, even though the pin's permission map
carries a `run` entry. The product card has no pending state to observe —
actions resolve through the parent's row-action handlers, and no in-flight
signal reaches the menu.

## Decision

The card-variant menu implements the pin triad exactly (pause/resume/kill/
redeploy/edit → edit, delete → delete; empty menu renders nothing; the
trigger button disables when the orchestrator is down), but has no pending
state: there is no `isPending` input and no all-items-disabled pending
rendering. Non-permission conditions stay as `:disabled` (toggle requires
deployed, kill/deploy require orchestrator availability, deploy requires
enabled). The row variant is untouched, and the Run button keeps the
existing P1 admin line — only the overflow menu uses the pin triad.

## Consequences

Double-clicks during a slow action are not guarded at the menu; the parent
must tolerate re-entrant action calls. Adding a pending state later means
plumbing an in-flight signal from the parent into the card, and the pin's
pending behavior must be implemented whole — disable-all-items plus the
pending-item loader plus close-blocking — not approximated with per-item
spinners alone.

## Amendment

v2 corrects the v1 Decision, which listed "run → trigger" as part of the
menu triad: the pin's `run` permission entry backs the separate card Run
button, not a menu item. The Context and Consequences are enriched with the
pin's pending-item loader and close-blocking, which v1 omitted; the
disable-all claim itself was correct and stands.
