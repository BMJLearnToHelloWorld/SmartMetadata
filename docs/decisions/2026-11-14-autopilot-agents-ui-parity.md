# AutoPilot trigger and Agents tab: UI parity with official

- **Status:** Accepted
- **Revisions:** v1 2026-11-14 (initial); v2 2026-11-14 (review: card-action gating adaptations and global-modal scope recorded)
- **Deciders:** Bai (ruling: align with official, UI included, one batch, one PR)
- **Guard:** `smartmetadata-ui/src/ingestion/supportedPipelines.test.ts`, `smartmetadata-ui/src/ingestion/agentsDataMapper.test.ts`, `smartmetadata-ui/src/ingestion/agentsProgress.test.ts`, `smartmetadata-ui/src/ingestion/agentsUtils.test.ts`, `smartmetadata-ui/src/ingestion/deploymentSummary.test.ts`, `smartmetadata-ui/src/ingestion/autoPilot.test.ts`, `smartmetadata-ui/src/ingestion/useMetadataAgents.test.ts`, `smartmetadata-ui/src/ingestion/useServiceProgressStream.test.ts`, `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts`, `smartmetadata-ui/src/views/ingestion/AddServiceView.test.ts`, `smartmetadata-ui/src/views/ingestion/PipelinesListView.test.ts`
- **Related:** upstream pin `a3012259ca` (`openmetadata-ui/.../AddServicePage.component.tsx` trigger flow, `ServiceDetailsPage.tsx` Agents tab + trigger button, `IngestionConfigUtils.ts` `getSupportedPipelineTypes`, `useMetadataAgents.ts`, `useServiceProgressStream.ts` + `SseStreamUtils.ts`, `agentsDataMapper.ts`, `AgentsProgressPureUtils.ts`, `agents.utils.ts`, `DeploymentSummaryCard.component.tsx`, `AirflowMessageBanner`, `MetadataAgentsView`, `AgentCard`, `AgentGroup`, `AddIngestionButton`); `openmetadata-service/.../AutoPilotApp.java`, `AutoPilotWorkflow.json`, `CreateIngestionPipelineImpl.java` (server machinery, byte-identical in the fork — no server change); `openmetadata-spec/.../agentType.json`, `serviceProgressEvent.json`, `progressUpdate.json`

## Context

The fork's server AutoPilot machinery is byte-identical to the pin
(`AutoPilotApp`, `AutoPilotWorkflow.json`,
`CreateIngestionPipelineImpl`), and the trigger endpoint, the
`agentType` list filter, and the service progress SSE endpoint are
all present — but the UI never triggered AutoPilot: the wizard
created the service and stopped, the service page had a `Pipelines`
table plus a dead `Agents` residual tab, and the add menu came from
a static per-service-type table that offered TestSuite (which
official never offers from a service page) and lacked dataInsight
and elasticSearchReindex. Official generates up to five agents
(metadata, lineage, usage, profiler, autoClassification) through
the AutoPilot application, triggered by the UI wizard after a
successful service create, and offers further agents from a menu
driven by the connection's `supports*` flags.

## Decision

- **The wizard triggers AutoPilot, exactly as official's.** After a
  successful create, every service type except security triggers
  `AutoPilotApplication` with `{ entityLink: <#E::<type>::<fqn>> }`,
  then shows the `auto-pilot-triggered-message` toast and navigates.
  The trigger failure is caught inside the trigger helper and
  toasted, so the success toast still fires — the pin's own quirk,
  ported exactly. Security services get no trigger and no toast.
  The fork keeps its create-failure behavior (stay and show the
  error) rather than the pin's finally-navigate, which is tied to
  the pin's inline-alert mechanism the fork does not have.
- **The header Trigger AutoPilot button follows the pin's gating.**
  It shows for the pin's eleven service entity types except
  security, gated on the APPLICATION resource Trigger bit merged
  onto the service permission (not the service's own operation,
  not admin-only), and disables while an AutoPilotWorkflow instance
  for the service is RUNNING in the last seven days. The fork's
  `llmService` and `mcpService` kinds are outside the pin list and
  get no button. No confirm, no success toast; errors toast, and a
  successful trigger refetches the instance states.
- **One working Agents tab replaces the Pipelines table and the dead
  Agents entry.** The tab shows for the service owner, a member of
  an owner team, or an admin; security services get no Agents tab
  at all, as in official. The count badge is the `agentType=metadata`
  list total plus the stream-discovered count. The list is the
  metadata card group (DeploymentSummaryCard + AgentCard grid)
  fed by `listIngestionPipelines` with `agentType=metadata`, with
  live progress from the service SSE stream; the existing
  row-action machinery, log modal, run details modal, and pipeline
  detail page are reused, not duplicated.
- **The add menu is flag-driven, from a single source.**
  `getSupportedPipelineTypes` ports official's connection-flag
  mapping (Spark offers nothing; an undefined config offers
  metadata only; storage/messaging + profiler yields
  autoClassification alone), `getIngestionTypes` applies the
  one-Usage rule, and the dataInsight item disables once one
  exists. The static `AGENT_KINDS_BY_SERVICE` table is removed,
  not kept as a fallback. TestSuite is removed from the service
  menu — its entry lives on the TestSuite page — and application,
  policyAgent, and reverseMetadata are never offered. The global
  pipelines-list create modal and the add-ingestion wizard use the
  same function. The one-Usage removal and one-DataInsight disable
  apply to the service-page Add Agent menu only: the global create
  modal offers all flag-supported types without those rules (the pin
  calls `getIngestionTypes` only from the service-page Add Agent
  button and has no global create modal).
- **Collate AI is excluded.** No sub-tab switch, no Collate widget,
  no `/ai/automations` fetching: the widget rendering and the AI
  Automation entity schema are Collate-edition surfaces that the
  OSS build never ships, so there is nothing to align to and no
  residual to record. The Insights tab stays residual.
- **P-12 stands, reconciled for the wizard path only.** The wizard
  still makes no direct `createIngestionPipeline` call; official
  parity overrides P-12's rationale only through the AutoPilot
  trigger, and AutoPilot — not the wizard — decides which agents
  to generate from the connection flags. The P-12 comment is
  amended to record this, not deleted, and the filter-scope
  carrying is unaffected.
- **No server changes.** The trigger endpoint, the `agentType`
  filter, and the progress stream endpoint were all verified
  present in the fork server before implementation; had any been
  missing, the batch would have stopped rather than expand scope.

## Consequences

- A fresh service created through the wizard triggers AutoPilot and
  its agents appear on the Agents tab with live progress, matching
  official's behavior end to end; re-triggering from the header
  button creates no duplicates (the server dedupes by pipeline type
  and display name).
- The add menu matches what the connection actually supports, and
  the TestSuite flow is reachable only from the TestSuite page, as
  in official.
- The Agents tab is hidden from users who are neither owner, owner
  team, nor admin, and the trigger button is hidden from users
  without the APPLICATION Trigger bit.
- The SSE transport is the fork's established fetch + reader
  pattern, not the pin's `@microsoft/fetch-event-source` library,
  which the fork does not depend on; the pin's stream structure
  (shared connection, replay, backoff, 503-fatal, one-refresh 401
  policy) is preserved on that transport.
- Card-action gating follows the fork's existing machinery, not the
  pin's menu filtering: unauthorized overflow items render disabled
  (the fork's convention) rather than being filtered out, the pause
  toggle uses the fork's `canTogglePipelineStatus` gate, and
  edit/delete stay enabled while the orchestrator is down because
  they are catalog operations; run history and Diagnose route to
  the existing run-details modal / pipeline detail page rather than
  a drawer, and the deploy item keeps the fork's deployed-dependent
  label.
