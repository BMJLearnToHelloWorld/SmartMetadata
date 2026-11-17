<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Collapse, Skeleton } from 'ant-design-vue';
import SmState from '@/components/shared/SmState.vue';
import { PIPELINE_TYPE_TO_AGENT_TYPE } from '@/ingestion/agentsDataMapper';
import { getAgentTypeIcon } from '@/ingestion/agentsUtils';
import type { WorkflowInstance } from '@/api/workflows';

/**
 * Agents status widget, ported from official
 * components/ServiceInsights/AgentsStatusWidget/AgentsStatusWidget.tsx
 * + utils/AgentsStatusWidgetUtils.tsx (getAgentRunningStatusMessage,
 * getIconFromStatus) + utils/AgentsStatusWidgetPureUtils.ts
 * (getAgentStatusSummary) (pin a3012259ca). The accordion starts
 * collapsed; the expand area carries the per-status summary counts
 * plus "View more". `AgentsInfo` carries no icon node (unlike pin's
 * ReactNode): the icon is resolved in the widget from `agentType`
 * through the product's pipeline-type → agent-type map.
 */
export type AgentStatusLabel = 'Successful' | 'Failed' | 'Running' | 'Pending';

export interface AgentsInfo {
  label: string;
  status: AgentStatusLabel;
  isCollateAgent: boolean;
  agentType: string;
}

const props = defineProps<{
  agentsInfo: AgentsInfo[];
  isLoading: boolean;
  liveAutoPilotStatusData?: WorkflowInstance;
}>();

const { t } = useI18n();

const STATUS_ORDER: AgentStatusLabel[] = ['Successful', 'Running', 'Failed', 'Pending'];

const STATUS_ICON: Record<AgentStatusLabel, Component> = {
  Successful: CheckCircleFilled,
  Failed: CloseCircleFilled,
  Running: LoadingOutlined,
  Pending: ClockCircleOutlined,
};

const STATUS_COLOR_VAR: Record<AgentStatusLabel, string> = {
  Successful: '--sm-color-success',
  Failed: '--sm-color-error',
  Running: '--sm-brand',
  Pending: '--sm-text-quaternary',
};

const summary = computed(() => {
  const grouped = new Map<AgentStatusLabel, number>();
  for (const agent of props.agentsInfo) {
    grouped.set(agent.status, (grouped.get(agent.status) ?? 0) + 1);
  }
  return STATUS_ORDER.filter((status) => grouped.has(status)).map((status) => ({
    status,
    count: grouped.get(status) ?? 0,
  }));
});

const runningMessage = computed(() => {
  const status = props.liveAutoPilotStatusData?.status ?? '';
  switch (status) {
    case 'RUNNING':
      return { text: t('serviceDetail.insights.runningMessage'), iconStatus: 'Running' as const };
    case 'FAILURE':
      return { text: t('serviceDetail.insights.failedMessage'), iconStatus: 'Failed' as const };
    case 'FINISHED':
      return { text: t('serviceDetail.insights.finishedMessage'), iconStatus: 'Successful' as const };
    case 'EXCEPTION':
      return { text: t('serviceDetail.insights.exceptionMessage'), iconStatus: 'Failed' as const };
    default:
      break;
  }
  if (!props.isLoading && props.agentsInfo.length === 0 && !status) {
    return { text: t('serviceDetail.insights.noAgentsMessage'), iconStatus: undefined };
  }
  return { text: '', iconStatus: undefined };
});

function agentIcon(agentType: string): Component {
  return getAgentTypeIcon(PIPELINE_TYPE_TO_AGENT_TYPE[agentType] ?? 'Metadata');
}
</script>

<template>
  <div data-testid="agent-status-widget">
    <Collapse expand-icon-position="end">
      <template #expandIcon>
        <div class="agents-status-widget__expand" data-testid="agent-status-widget-expand-icon">
          <Skeleton v-if="isLoading" :paragraph="false" :title="{ width: 120 }" active />
          <div v-else class="agents-status-widget__summary">
            <div
              v-for="item in summary"
              :key="item.status"
              class="agents-status-widget__summary-item"
              :data-testid="`agent-status-summary-item-${item.status}`"
            >
              <component
                :is="STATUS_ICON[item.status]"
                :style="{ color: `var(${STATUS_COLOR_VAR[item.status]})` }"
              />
              <span data-testid="pipeline-count">{{ item.count }}</span>
              <span>{{ item.status }}</span>
            </div>
          </div>
          <span data-testid="agent-status-widget-view-more">
            {{ t('serviceDetail.insights.viewMore') }}
          </span>
        </div>
      </template>
      <Collapse.Panel key="1">
        <template #header>
          <div class="agents-status-widget__header">
            <div class="agents-status-widget__title">
              {{ t('serviceDetail.insights.agentsStatusTitle') }}
            </div>
            <div class="agents-status-widget__message">
              <Skeleton v-if="isLoading" :paragraph="false" active />
              <template v-else>
                <component
                  :is="STATUS_ICON[runningMessage.iconStatus]"
                  v-if="runningMessage.iconStatus"
                  :style="{ color: `var(${STATUS_COLOR_VAR[runningMessage.iconStatus]})` }"
                />
                <span data-testid="agents-status-message">{{ runningMessage.text }}</span>
              </template>
            </div>
          </div>
        </template>
        <div v-if="!isLoading && agentsInfo.length === 0" class="agents-status-widget__empty">
          <div data-testid="no-data-placeholder">
            <SmState state="empty" test-id="agents-status-empty" />
          </div>
        </div>
        <div class="agents-status-widget__grid">
          <template v-if="isLoading">
            <div
              v-for="index in 8"
              :key="`agent-skeleton-${index - 1}`"
              class="agents-status-widget__card agents-status-widget__skeleton-card"
            >
              <Skeleton :paragraph="false" :title="{ width: 160 }" active />
            </div>
          </template>
          <template v-else>
            <div
              v-for="agent in agentsInfo"
              :key="agent.label"
              class="agents-status-widget__card"
              :class="{ 'agents-status-widget__card--collate': agent.isCollateAgent }"
              :data-testid="`agent-status-card-${agent.label}`"
            >
              <span class="agents-status-widget__card-label">
                <component :is="agentIcon(agent.agentType)" />
                {{ agent.label }}
              </span>
              <component
                :is="STATUS_ICON[agent.status]"
                :style="{ color: `var(${STATUS_COLOR_VAR[agent.status]})` }"
              />
            </div>
          </template>
        </div>
      </Collapse.Panel>
    </Collapse>
  </div>
</template>

<style scoped>
.agents-status-widget__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agents-status-widget__title {
  font-size: 18px;
  font-weight: 500;
}

.agents-status-widget__message {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--sm-text-secondary);
}

.agents-status-widget__expand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--sm-text-primary);
}

.agents-status-widget__summary {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agents-status-widget__summary-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.agents-status-widget__empty {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.agents-status-widget__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.agents-status-widget__card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 12px;
  background: var(--sm-bg-primary);
}

.agents-status-widget__card--collate {
  border-color: var(--sm-brand);
}

.agents-status-widget__card-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.agents-status-widget__skeleton-card {
  justify-content: flex-start;
}
</style>
