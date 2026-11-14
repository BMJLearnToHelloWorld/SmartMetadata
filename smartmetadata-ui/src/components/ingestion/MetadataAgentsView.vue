<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import type { OperationPermissions } from '@/api/permissions';
import type { AgentAction } from '@/ingestion/agentsUtils';
import type { Agent, IngestionPipeline, PipelineType } from '@/types/ingestion';
import AddAgentButton from './AddAgentButton.vue';
import AgentGroup from './AgentGroup.vue';

const props = defineProps<{
  agents: readonly Agent[];
  pipelinesByFqn: ReadonlyMap<string, IngestionPipeline>;
  /** Per-pipeline entity permissions keyed by pipeline id; a missing entry denies (fail-closed). */
  permissionsById: ReadonlyMap<string, OperationPermissions>;
  isAdminUser: boolean;
  /** P-24: the orchestrator probe says the pipeline service is down or disabled. */
  orchestratorUnavailable: boolean;
  /** The orchestrator status fetch is still pending: card actions render as skeletons. */
  isPending: boolean;
  /** First load for this service: skeleton cards. Refetches must not blank the list. */
  isLoading: boolean;
  /** A refetch is in flight: the refresh button spins. */
  isRefreshing: boolean;
  /** The ingestionPipeline resource Create bit: the inert fallback Add button. */
  canCreateAgent: boolean;
  /** The orchestrator status fetch is pending: the add-agent area renders as a skeleton. */
  actionStatusPending: boolean;
  /** Show the Add Agent button: resource Create plus a non-disabled platform. */
  showAddAgent: boolean;
  /** Addable kinds, already filtered by getIngestionTypes (one-Usage rule applied). */
  supportedTypes: readonly PipelineType[];
  /** A dataInsight pipeline already exists: its menu item is disabled. */
  isDataInsightExists: boolean;
  /** Route params of the owning service, for the add-ingestion navigation. */
  serviceKind: string;
  serviceId: string;
}>();

const emit = defineEmits<{
  refresh: [];
  action: [action: AgentAction, pipeline: IngestionPipeline];
  logs: [pipeline: IngestionPipeline];
  runDetails: [agent: Agent, runId?: string];
  viewHistory: [agent: Agent];
}>();

/**
 * Port of official MetadataAgentsView (openmetadata-ui, pin
 * a3012259ca): the single metadata agent group with the Add Agent
 * slot. The delete confirmation, log viewer, and run-history
 * surfaces stay the service view's existing modals and detail page
 * — this view only forwards the card events upward. The Collate AI
 * sub-tab switch is not ported (ADR:2026-11-14-autopilot-agents-ui-parity):
 * it renders only when a Collate widget exists, which the OSS build
 * never ships.
 */
</script>

<template>
  <div data-testid="metadata-agents-view">
    <AgentGroup
      :agents="agents"
      :pipelines-by-fqn="pipelinesByFqn"
      :permissions-by-id="permissionsById"
      :is-admin-user="isAdminUser"
      :orchestrator-unavailable="orchestratorUnavailable"
      :is-pending="isPending"
      :is-loading="isLoading"
      :is-refreshing="isRefreshing"
      :can-create-agent="canCreateAgent"
      :action-status-pending="actionStatusPending"
      @refresh="emit('refresh')"
      @action="(action, pipeline) => emit('action', action, pipeline)"
      @logs="(pipeline) => emit('logs', pipeline)"
      @run-details="(agent, runId) => emit('runDetails', agent, runId)"
      @view-history="(agent) => emit('viewHistory', agent)"
    >
      <template v-if="showAddAgent" #add-agent>
        <AddAgentButton
          :types="supportedTypes"
          :is-data-insight-exists="isDataInsightExists"
          :disabled="orchestratorUnavailable"
          :service-kind="serviceKind"
          :service-id="serviceId"
        />
      </template>
    </AgentGroup>
  </div>
</template>
