<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Pin TaskListV1.component.tsx: entity-scoped task list, empty state,
 * auto-select first row when selection is missing.
 */
import { useI18n } from 'vue-i18n';
import { Spin, Typography } from 'ant-design-vue';
import { watch } from 'vue';
import SmState from '@/components/shared/SmState.vue';
import type { CollaborationTask } from '@/types/collaboration';
import EntityTaskListCard from './EntityTaskListCard.vue';

const props = defineProps<{
  taskList: CollaborationTask[];
  isLoading: boolean;
  activeFeedId?: string;
  selectedTask?: CollaborationTask | null;
}>();

const emit = defineEmits<{
  taskClick: [task: CollaborationTask];
}>();

const { t } = useI18n();

watch(
  () => [props.taskList, props.selectedTask?.id] as const,
  () => {
    if (props.isLoading || props.taskList.length === 0) {
      return;
    }
    const current = props.taskList.find((row) => row.id === props.selectedTask?.id);
    if (!current) {
      emit('taskClick', props.taskList[0]);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="isLoading && taskList.length === 0" class="entity-task-list-v1" data-testid="task-list-loading">
    <Spin />
  </div>
  <SmState
    v-else-if="taskList.length === 0"
    state="empty"
    test-id="no-data-placeholder"
    :empty-text="t('label.no-entity', { entity: t('label.task-plural') })"
    class="entity-task-list-v1 entity-task-list-v1--empty"
  />
  <div v-else class="entity-task-list-v1" id="taskData">
    <EntityTaskListCard
      v-for="task in taskList"
      :key="task.id"
      :task="task"
      :active="activeFeedId === task.id"
      @click="emit('taskClick', $event)"
    />
    <Spin v-if="isLoading" class="entity-task-list-v1__loader" />
  </div>
  <Typography.Text v-if="taskList.length > 0" type="secondary" class="entity-task-list-v1__observer-hint" />
</template>

<style scoped>
.entity-task-list-v1 {
  padding: 8px 16px 16px;
}

.entity-task-list-v1--empty {
  min-height: 240px;
}

.entity-task-list-v1__loader {
  display: flex;
  justify-content: center;
  padding: 8px;
}
</style>