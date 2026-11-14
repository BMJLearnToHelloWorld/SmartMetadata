<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Skeleton, Tag, Tooltip } from 'ant-design-vue';
import { CodeOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import type { OperationPermissions } from '@/api/permissions';
import type { AgentAction } from '@/ingestion/agentsUtils';
import SmState from '@/components/shared/SmState.vue';
import type { Agent, IngestionPipeline } from '@/types/ingestion';
import AgentCard from './AgentCard.vue';

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
}>();

const emit = defineEmits<{
  refresh: [];
  action: [action: AgentAction, pipeline: IngestionPipeline];
  logs: [pipeline: IngestionPipeline];
  runDetails: [agent: Agent, runId?: string];
  viewHistory: [agent: Agent];
}>();

const { t } = useI18n();
const slots = useSlots();

/**
 * Port of official AgentGroup (openmetadata-ui, pin a3012259ca) for
 * the single metadata group: header with the running count, refresh,
 * and the add-agent slot (or its skeleton, or the inert fallback Add
 * button when no slot is provided); skeleton cards while loading;
 * the empty placeholder when no agents exist; else the card grid.
 */
const runningCount = computed(
  () => props.agents.filter((agent) => agent.status === 'running').length,
);
const hasAddAgentSlot = computed(() => Boolean(slots['add-agent']));
const cards = computed(() =>
  props.agents.flatMap((agent) => {
    const pipeline = props.pipelinesByFqn.get(agent.fqn);
    return pipeline ? [{ agent, pipeline }] : [];
  }),
);
</script>

<template>
  <div data-testid="metadata-agent-group">
    <div class="agent-group__header">
      <CodeOutlined class="agent-group__icon" />
      <div class="agent-group__titles">
        <div>
          <strong>{{ t('ingestion.agents.metadataAgentPlural') }}</strong>
        </div>
        <div class="agent-group__description">
          {{ t('ingestion.agents.metadataAgentsDescription') }}
        </div>
      </div>
      <Tag v-if="runningCount > 0" data-testid="agent-group-running-count">
        {{ t('ingestion.agents.countRunning', { count: runningCount }) }}
      </Tag>
      <Tooltip :title="t('ingestion.agents.refreshEntity', { entity: t('ingestion.services.agentsTab') })">
        <Button
          data-testid="agent-group-refresh"
          :loading="isRefreshing"
          @click="emit('refresh')"
        >
          <ReloadOutlined />
        </Button>
      </Tooltip>
      <div v-if="actionStatusPending" data-testid="add-agent-skeleton">
        <Skeleton.Button active size="small" />
      </div>
      <slot v-else-if="hasAddAgentSlot" name="add-agent" />
      <Button v-else-if="canCreateAgent">
        {{ t('ingestion.agents.addEntity', { entity: t('ingestion.agents.agent') }) }}
      </Button>
    </div>

    <div v-if="isLoading" data-testid="agent-group-skeleton" class="agent-group__grid">
      <Card v-for="index in 3" :key="index">
        <Skeleton active />
      </Card>
    </div>
    <SmState
      v-else-if="agents.length === 0"
      state="empty"
      :empty-text="t('ingestion.agents.noAgentsYet')"
      test-id="agent-group-empty-placeholder"
    />
    <div v-else class="agent-group__grid">
      <AgentCard
        v-for="card in cards"
        :key="card.agent.fqn"
        :agent="card.agent"
        :pipeline="card.pipeline"
        :ops="permissionsById.get(card.pipeline.id)"
        :is-admin-user="isAdminUser"
        :orchestrator-unavailable="orchestratorUnavailable"
        :is-pending="isPending"
        @action="(action, pipeline) => emit('action', action, pipeline)"
        @logs="(pipeline) => emit('logs', pipeline)"
        @run-details="(agent, runId) => emit('runDetails', agent, runId)"
        @view-history="(agent) => emit('viewHistory', agent)"
      />
    </div>
  </div>
</template>

<style scoped>
.agent-group__header {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.agent-group__icon {
  font-size: 20px;
}

.agent-group__titles {
  flex: 1;
}

.agent-group__description {
  color: var(--sm-text-secondary);
  font-size: 12px;
}

.agent-group__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
</style>
