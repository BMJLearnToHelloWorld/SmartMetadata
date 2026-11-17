# The service page fetches the first AutoPilot run's states, although no widget reads them

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity batch (D-10 closure) under Bai's standing official-alignment rules; Bai directed fetch-level 1:1 on 2026-11-17
- **Guard:** `smartmetadata-ui/src/api/workflows.test.ts` (states query and mapping); `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts` (states fetch, threading, fail-open)
- **Related:** upstream pin `a3012259ca` (`ServiceDetailsPage.fetchWorkflowInstanceStates`, `rest/workflowAPI.getWorkflowInstanceStateById`, `ServiceInsightsTab.interface`)

## Context

The pin's service page fetches the first AutoPilotWorkflow instance in a
7-day window and then that run's states
(`getWorkflowInstanceStateById` with the same window), holds both as
`workflowStatesData`, and threads the whole object to the Insights tab.
No widget reads `subInstanceStates` — a repo-wide grep at the pin finds
only the interface field, the setter, and tests. The batch originally
left the states fetch residual (D-10) as dead data.

## Decision

Fetch the states exactly as the pin does: same window, first instance's
id only, no states fetch when the instances list is empty. The page
holds `{ mainInstanceState, subInstanceStates }` and passes the whole
object to the Insights tab alongside the existing `liveAutoPilotStatus`
prop, which keeps feeding the widget. The trigger button still reads the
first instance's status. Any fetch failure toasts and sets nothing, so
the button fails open — the pin's all-or-nothing shape, locked by test.

## Consequences

One extra request per service-page load whenever an AutoPilot instance
exists in the window. The step-level states are in place for any future
widget that needs them, without another fetch change. A states-endpoint
failure now also clears the running state rather than leaving the button
disabled on list data alone; that is the pin's shape, not a product
invention.
