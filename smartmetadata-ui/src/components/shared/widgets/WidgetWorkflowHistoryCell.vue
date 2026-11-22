/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
import { message } from 'ant-design-vue';
import type { WorkflowInstanceState } from '@/api/workflows';
import {
  getLatestWorkflowRun,
  glossaryTermEntityLink,
  workflowHistoryTimeRange,
} from '@/catalog/workflowHistoryRun';
import { getShortRelativeTime } from '@/utils/relativeTime';
import EmptyPlaceholder from '@/components/shared/EmptyPlaceholder.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Official WorkflowHistory
 * (openmetadata-ui/.../GlossaryTerms/tabs/WorkFlowTab/WorkflowHistory.component.tsx):
 * the newest run of a workflow that sets the term's stage, over the last
 * 180 days, as a collapsible timeline. The header shows the workflow
 * name and finished/total progress. A failed load toasts once and
 * leaves the history empty. No write, no permission.
 *
 * Two forms in one component: the widget form wraps in a card and
 * starts collapsed when the term is Approved; the popover form
 * (is-widget=false, used by the TermsTable status cell) renders bare
 * and never starts collapsed. The popover form is mounted on the
 * status badge in GlossaryTermsWidget (D-2 batch 5c rebase, pin
 * GlossaryTermStatusCell).
 */
const props = withDefaults(
  defineProps<{
    glossaryTermFqn?: string;
    entityStatus?: string;
    isWidget?: boolean;
  }>(),
  { isWidget: true },
);

const { t } = useI18n();
const states = ref<WorkflowInstanceState[]>([]);
const workflowName = ref('');
const loading = ref(true);

const initialCollapsed = computed(
  () => (props.entityStatus ?? 'Approved') === 'Approved' && props.isWidget,
);
const collapsed = ref(initialCollapsed.value);

watch(initialCollapsed, (value) => {
  collapsed.value = value;
});

const completedSteps = computed(
  () => states.value.filter((state) => state.status === 'Finished').length,
);
const totalSteps = computed(() => states.value.length);

async function load(): Promise<void> {
  if (!props.glossaryTermFqn) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const latestRun = await getLatestWorkflowRun(
      glossaryTermEntityLink(props.glossaryTermFqn),
      workflowHistoryTimeRange(),
    );
    workflowName.value = latestRun?.definition.displayName || latestRun?.definition.name || '';
    states.value = latestRun?.states ?? [];
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    workflowName.value = '';
    states.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <component
    :is="isWidget ? 'a-card' : 'div'"
    class="workflow-history-cell"
    data-testid="workflow-history-widget"
  >
    <a-spin v-if="loading" data-testid="workflow-history-loading" />
    <div
      v-else-if="states.length === 0"
      class="workflow-history-cell__empty"
      data-testid="workflow-history-empty"
    >
      <EmptyPlaceholder
        :title="t('label.no-entity-available', { entity: t('label.workflow-history') })"
        width="100%"
      />
    </div>
    <div v-else>
      <button
        type="button"
        class="workflow-history-cell__header"
        :aria-expanded="!collapsed"
        :aria-label="t('label.workflow-history')"
        data-testid="workflow-history-header"
        @click="collapsed = !collapsed"
      >
        <span class="workflow-history-cell__header-text">
          <span class="workflow-history-cell__title">{{ t('label.workflow-history') }}</span>
          <span v-if="workflowName" class="workflow-history-cell__name">{{ workflowName }}</span>
        </span>
        <span class="workflow-history-cell__progress">{{ completedSteps }}/{{ totalSteps }}</span>
      </button>
      <div class="workflow-history-cell__steps" aria-hidden="true">
        <span
          v-for="index in totalSteps"
          :key="index"
          class="workflow-history-cell__step"
          :class="index <= completedSteps ? 'workflow-history-cell__step--completed' : ''"
        />
      </div>
      <a-timeline v-if="!collapsed" data-testid="workflow-history-timeline">
        <a-timeline-item
          v-for="state in states"
          :key="state.id ?? `${state.stage?.name}-${state.timestamp}`"
          :color="state.status === 'Finished' ? 'green' : 'gray'"
          data-testid="workflow-history-item"
        >
          <div class="workflow-history-cell__stage">
            {{ state.stage?.displayName ?? state.stage?.name }}
          </div>
          <div class="workflow-history-cell__time">{{ getShortRelativeTime(state.timestamp) }}</div>
        </a-timeline-item>
      </a-timeline>
    </div>
  </component>
</template>

<style scoped>
.workflow-history-cell__empty {
  position: relative;
  min-height: 96px;
}

.workflow-history-cell__header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.workflow-history-cell__header-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.workflow-history-cell__title {
  font-weight: 600;
}

.workflow-history-cell__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sm-text-secondary);
  font-size: 12px;
}

.workflow-history-cell__progress {
  flex-shrink: 0;
  color: var(--sm-text-secondary);
  font-size: 14px;
}

.workflow-history-cell__steps {
  display: flex;
  gap: 2px;
  margin: 8px 0;
}

.workflow-history-cell__step {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--sm-border-secondary);
}

.workflow-history-cell__step--completed {
  background: var(--sm-color-success);
}

.workflow-history-cell__stage {
  font-weight: 500;
}

.workflow-history-cell__time {
  color: var(--sm-text-secondary);
  font-size: 12px;
}
</style>
