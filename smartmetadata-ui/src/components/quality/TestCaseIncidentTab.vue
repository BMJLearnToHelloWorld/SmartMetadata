<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Pin TestCaseIncidentTab.component.tsx: open/closed task filters,
 * TaskListV1 + TaskTabNew panel for test-case issues tab (tasks, not
 * incident history table).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckOutlined, UnorderedListOutlined } from '@ant-design/icons-vue';
import { Spin, Typography } from 'ant-design-vue';
import { getTaskCounts, listTasks } from '@/api/tasks';
import TaskDetailView from '@/views/collaboration/TaskDetailView.vue';
import type { EntityRef } from '@/types/api';
import type { CollaborationTask } from '@/types/collaboration';
import type { TestCase } from '@/types/quality';
import EntityTaskListV1 from './EntityTaskListV1.vue';

type TaskFilter = 'open' | 'close';

const TASK_PAGE_SIZE = 20;

const props = defineProps<{
  testCaseFqn: string;
  owners?: EntityRef[];
}>();

const emit = defineEmits<{
  countsUpdated: [payload: { open: number; closed: number }];
}>();

const { t } = useI18n();

const taskFilter = ref<TaskFilter>('open');
const openTasksCount = ref(0);
const closedTasksCount = ref(0);
const tasks = ref<CollaborationTask[]>([]);
const selectedTask = ref<CollaborationTask | null>(null);
const loading = ref(false);
const pagingAfter = ref<string | undefined>();
const hasMore = ref(false);
const observerTarget = ref<HTMLElement | null>(null);
let listRequestSeq = 0;

const statusGroup = computed(() => (taskFilter.value === 'open' ? 'open' : 'closed'));

async function fetchCounts(): Promise<void> {
  if (!props.testCaseFqn) {
    return;
  }
  try {
    const counts = await getTaskCounts({ aboutEntity: props.testCaseFqn });
    openTasksCount.value = counts.open ?? 0;
    closedTasksCount.value = counts.completed ?? 0;
    emit('countsUpdated', { open: openTasksCount.value, closed: closedTasksCount.value });
  } catch {
    // Badge counts are a UI affordance; don't block on failure.
  }
}

async function fetchTaskPage(after?: string): Promise<void> {
  if (!props.testCaseFqn) {
    return;
  }
  const requestId = ++listRequestSeq;
  loading.value = true;
  if (!after) {
    tasks.value = [];
    pagingAfter.value = undefined;
    hasMore.value = false;
    selectedTask.value = null;
  }
  try {
    const page = await listTasks({
      aboutEntity: props.testCaseFqn,
      statusGroup: statusGroup.value,
      limit: TASK_PAGE_SIZE,
      after,
    });
    if (requestId !== listRequestSeq) {
      return;
    }
    const sorted = [...page.data].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    tasks.value = after ? [...tasks.value, ...sorted] : sorted;
    pagingAfter.value = page.paging?.after;
    hasMore.value = Boolean(page.paging?.after);
  } catch {
    if (requestId !== listRequestSeq) {
      return;
    }
    if (!after) {
      tasks.value = [];
    }
  } finally {
    if (requestId === listRequestSeq) {
      loading.value = false;
    }
  }
}

function handleTaskClick(task: CollaborationTask): void {
  if (selectedTask.value?.id !== task.id) {
    selectedTask.value = task;
  }
}

function handleOpenCloseTaskClick(target: TaskFilter): void {
  if (target === taskFilter.value) {
    return;
  }
  taskFilter.value = target;
  selectedTask.value = null;
  void fetchTaskPage();
}

async function handleAfterTaskClose(): Promise<void> {
  await fetchCounts();
  taskFilter.value = 'close';
  selectedTask.value = null;
  await fetchTaskPage();
}

let observer: IntersectionObserver | undefined;

function bindObserver(): void {
  observer?.disconnect();
  if (typeof IntersectionObserver === 'undefined' || !observerTarget.value) {
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore.value && !loading.value && pagingAfter.value) {
        void fetchTaskPage(pagingAfter.value);
      }
    },
    { rootMargin: '0px 0px 2px 0px' },
  );
  observer.observe(observerTarget.value);
}

watch(
  () => props.testCaseFqn,
  () => {
    taskFilter.value = 'open';
    void fetchTaskPage();
    void fetchCounts();
  },
);

onMounted(() => {
  void fetchTaskPage();
  void fetchCounts();
  bindObserver();
});

onUnmounted(() => {
  observer?.disconnect();
});

watch(observerTarget, () => {
  bindObserver();
});
</script>

<template>
  <div class="test-case-incident-tab" data-testid="issue-tab-container">
    <div class="test-case-incident-tab__left" data-testid="left-container" id="left-container">
      <div class="test-case-incident-tab__filters">
        <Typography.Text
          class="test-case-incident-tab__filter"
          :class="{ 'test-case-incident-tab__filter--active': taskFilter === 'open' }"
          data-testid="open-task"
          @click="handleOpenCloseTaskClick('open')"
        >
          <UnorderedListOutlined aria-hidden="true" />
          {{ openTasksCount }} {{ t('label.open') }}
        </Typography.Text>
        <Typography.Text
          class="test-case-incident-tab__filter"
          :class="{ 'test-case-incident-tab__filter--active': taskFilter === 'close' }"
          data-testid="closed-task"
          @click="handleOpenCloseTaskClick('close')"
        >
          <CheckOutlined aria-hidden="true" />
          {{ closedTasksCount }} {{ t('label.closed') }}
        </Typography.Text>
      </div>
      <EntityTaskListV1
        :task-list="tasks"
        :is-loading="loading"
        :active-feed-id="selectedTask?.id"
        :selected-task="selectedTask"
        @task-click="handleTaskClick"
      />
      <div
        ref="observerTarget"
        class="test-case-incident-tab__observer"
        data-testid="observer-element"
        id="observer-element"
      />
    </div>
    <div class="test-case-incident-tab__right" data-testid="right-container">
      <Spin v-if="loading && !selectedTask" />
      <div v-if="selectedTask && !loading" id="task-panel" data-testid="task-panel">
        <TaskDetailView
          :id="selectedTask.id"
          embedded
          @after-close="handleAfterTaskClose"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.test-case-incident-tab {
  display: flex;
  min-height: 420px;
  border-top: 1px solid var(--sm-border-secondary);
}

.test-case-incident-tab__left {
  flex: 0 0 50%;
  max-height: 560px;
  overflow-y: auto;
}

.test-case-incident-tab__right {
  flex: 0 0 50%;
  border-left: 1px solid var(--sm-border-secondary);
  max-height: 560px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 12px;
}

.test-case-incident-tab__filters {
  display: flex;
  gap: 16px;
  padding: 12px 16px 4px;
}

.test-case-incident-tab__filter {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.test-case-incident-tab__filter--active {
  font-weight: 600;
}

.test-case-incident-tab__observer {
  width: 100%;
  height: 2px;
}
</style>