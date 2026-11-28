<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Pin TaskFeedCardFromTask (task list row in TaskListV1): clickable card,
 * active state, task id + status for the entity-scoped task explorer.
 */
import { computed } from 'vue';
import { CheckCircleOutlined, MessageOutlined } from '@ant-design/icons-vue';
import { Typography } from 'ant-design-vue';
import { getTaskDisplayId } from '@/quality/testCaseLastRunBanner.utils';
import type { CollaborationTask } from '@/types/collaboration';
import { getRelativeTime } from '@/utils/relativeTime';

const props = defineProps<{
  task: CollaborationTask;
  active?: boolean;
}>();

const emit = defineEmits<{
  click: [task: CollaborationTask];
}>();

const title = computed(
  () =>
    props.task.displayName ||
    (props.task.name ? getTaskDisplayId(props.task.name) : '') ||
    props.task.id,
);

const createdBy = computed(
  () => props.task.createdBy?.displayName || props.task.createdBy?.name || '',
);

const commentCount = computed(() => props.task.comments?.length ?? 0);

const updatedLabel = computed(() => {
  const ts = props.task.updatedAt ?? props.task.createdAt;
  return ts ? getRelativeTime(ts) : '';
});

const isOpen = computed(() => {
  const status = props.task.status?.toLowerCase() ?? '';
  return status === 'open' || status === 'inprogress' || status === 'pending';
});

function onClick(): void {
  emit('click', props.task);
}
</script>

<template>
  <button
    type="button"
    class="entity-task-list-card"
    :class="{ 'entity-task-list-card--active': active }"
    data-testid="task-feed-card"
    @click="onClick"
  >
    <div class="entity-task-list-card__head">
      <CheckCircleOutlined
        v-if="!isOpen"
        class="entity-task-list-card__status-icon"
        :data-testid="`task-status-icon-${task.status?.toLowerCase() || 'unknown'}`"
      />
      <Typography.Text strong class="entity-task-list-card__title">{{ title }}</Typography.Text>
    </div>
    <Typography.Text
      v-if="createdBy"
      type="secondary"
      class="entity-task-list-card__meta"
      data-testid="task-created-by"
    >
      {{ createdBy }}
    </Typography.Text>
    <div v-if="updatedLabel || commentCount" class="entity-task-list-card__footer">
      <Typography.Text v-if="updatedLabel" type="secondary" class="entity-task-list-card__meta">
        {{ updatedLabel }}
      </Typography.Text>
      <span v-if="commentCount" class="entity-task-list-card__comments">
        <MessageOutlined aria-hidden="true" />
        {{ commentCount }}
      </span>
    </div>
  </button>
</template>

<style scoped>
.entity-task-list-card {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid var(--sm-color-border-secondary, #e8e8e8);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: var(--sm-color-bg-container, #fff);
  cursor: pointer;
}

.entity-task-list-card--active {
  border-color: var(--sm-color-primary, #1677ff);
  background: var(--sm-color-primary-bg, #e6f4ff);
}

.entity-task-list-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.entity-task-list-card__title {
  flex: 1;
}

.entity-task-list-card__meta {
  display: block;
  font-size: 12px;
  margin-top: 4px;
}

.entity-task-list-card__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
}

.entity-task-list-card__comments {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}
</style>