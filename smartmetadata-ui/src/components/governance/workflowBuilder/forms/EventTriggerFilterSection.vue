<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Card } from 'ant-design-vue';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import WorkflowFormField from './WorkflowFormField.vue';
import QueryBuilderSection from './QueryBuilderSection.vue';

/**
 * Official EventTriggerFilterSection (pin a3012259ca): the event-based
 * exclude filter — an add button until a filter exists, then a card with
 * the QueryBuilderSection and a clear button. Clearing sends '' so the
 * saved config overwrites (not keeps) the stale filter.
 */
const props = withDefaults(
  defineProps<{
    triggerFilter?: string;
    onTriggerFilterChange?: (filter: string) => void;
    entityType?: string;
    lockFields?: boolean;
  }>(),
  {
    triggerFilter: '',
    onTriggerFilterChange: undefined,
    entityType: 'all',
    lockFields: false,
  },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;
const controlsDisabled = computed(() => isFormDisabled.value || props.lockFields);

const hasFilter = computed(
  () => Boolean(props.triggerFilter && props.triggerFilter.trim() !== ''),
);
const showFilter = ref(hasFilter.value);
watch(hasFilter, (next) => {
  if (next) {
    showFilter.value = true;
  }
});

const showAddButton = computed(() => !showFilter.value && !hasFilter.value);

function handleClearFilter(): void {
  props.onTriggerFilterChange?.('');
  showFilter.value = false;
}
</script>

<template>
  <div style="margin-top: 24px">
    <WorkflowFormField
      :label="t('workflows.builder.excludeFilter')"
      :description="t('workflows.builder.entitiesMatchingFilterWillNotTrigger')"
    >
      <Button
        v-if="showAddButton"
        block
        data-testid="add-event-filter-button"
        :disabled="controlsDisabled"
        @click="showFilter = true"
      >
        <PlusOutlined /> {{ t('workflows.builder.addExcludeFilter') }}
      </Button>
      <Card v-else style="padding: 16px">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 12px">
          <Button
            type="text"
            size="small"
            :disabled="controlsDisabled"
            :aria-label="t('workflows.builder.remove')"
            @click="handleClearFilter"
          >
            <CloseOutlined />
          </Button>
        </div>
        <QueryBuilderSection
          :label="t('workflows.builder.excludeFilter')"
          :force-read-only="lockFields"
          :value="triggerFilter"
          :on-change="(value: string) => onTriggerFilterChange?.(value || '')"
        />
      </Card>
    </WorkflowFormField>
  </div>
</template>
