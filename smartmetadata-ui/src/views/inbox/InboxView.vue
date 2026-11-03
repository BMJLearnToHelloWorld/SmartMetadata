<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { DatePicker, Spin, Tabs } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { listActivityEvents } from '@/api/activity';
import { filterEventsByRange, getInboxCounts, markInboxSeenNow } from '@/api/inbox';
import { listTasks } from '@/api/tasks';
import type { ActivityEvent } from '@/types/collaboration';
import type { CollaborationTask } from '@/types/collaboration';

/**
 * Official InboxPage, classic surface: Activity / Tasks tabs, a date
 * range on activity, and unread + open-task counts. No AI-mode
 * gradient header and no websocket push: the official page evidence
 * is query-based counts, and the product has no push channel. The
 * range filters activity only — product tasks carry no date field.
 */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const activeTab = ref(route.query.tab === 'tasks' ? 'tasks' : 'activity');
const loading = ref(false);
const errorMessage = ref('');
const events = ref<ActivityEvent[]>([]);
const tasks = ref<CollaborationTask[]>([]);
const openTaskCount = ref(0);
const unreadActivityCount = ref(0);
const range = ref<{ from: number; to: number } | null>(null);

const activityColumns = computed(() => [
  { title: t('inbox.actor'), dataIndex: 'actor', key: 'actor' },
  { title: t('inbox.event'), dataIndex: 'event', key: 'event' },
  { title: t('inbox.entity'), dataIndex: 'entity', key: 'entity' },
  { title: t('inbox.time'), dataIndex: 'time', key: 'time' },
]);
const taskColumns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('inbox.type'), dataIndex: 'type', key: 'type' },
  { title: t('inbox.status'), dataIndex: 'status', key: 'status' },
  { title: t('inbox.assignees'), dataIndex: 'assignees', key: 'assignees' },
]);

const visibleEvents = computed(() =>
  range.value ? filterEventsByRange(events.value, range.value.from, range.value.to) : events.value,
);
const activityTabLabel = computed(() =>
  unreadActivityCount.value > 0 ? `${t('inbox.activity')} (${unreadActivityCount.value})` : t('inbox.activity'),
);
const tasksTabLabel = computed(() =>
  openTaskCount.value > 0 ? `${t('inbox.tasks')} (${openTaskCount.value})` : t('inbox.tasks'),
);

function refName(ref: { displayName?: string; name?: string } | undefined): string {
  return ref?.displayName || ref?.name || '—';
}

function eventTime(event: ActivityEvent): string {
  return event.timestamp ? new Date(event.timestamp).toLocaleString() : '—';
}

function taskAssignees(task: CollaborationTask): string {
  return task.assignees.map((ref) => refName(ref)).join(', ') || '—';
}

async function loadActivity(): Promise<void> {
  const days = range.value
    ? Math.min(365, Math.max(1, Math.ceil((Date.now() - range.value.from) / 86400000)))
    : 30;
  const page = await listActivityEvents({ days, limit: 100 });
  events.value = page.data;
}

async function loadTasks(): Promise<void> {
  const page = await listTasks({ statusGroup: 'Open', limit: 50 });
  tasks.value = page.data;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const counts = await getInboxCounts();
    openTaskCount.value = counts.openTaskCount;
    unreadActivityCount.value = counts.unreadActivityCount;
    await Promise.all([loadActivity(), loadTasks()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('inbox.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onRangeChange(values: { valueOf(): number }[] | null): void {
  if (!values || values.length < 2) {
    range.value = null;
    return;
  }
  range.value = { from: values[0].valueOf(), to: values[1].valueOf() };
  void loadActivity().catch(() => undefined);
}

function openTask(task: CollaborationTask): void {
  if (task.id) {
    void router.push({ name: 'task', params: { id: task.id } });
  }
}

watch(activeTab, (tab) => {
  if (tab === 'activity') {
    markInboxSeenNow();
  }
});

onMounted(() => {
  if (activeTab.value === 'activity') {
    markInboxSeenNow();
  }
  void load();
});
</script>

<template>
  <PageLayout test-id="inbox-layout">
    <PageHeader :header="t('inbox.title')" :sub-header="t('inbox.lead')" />
    <Spin :spinning="loading">
      <SmState
        v-if="errorMessage"
        state="error"
        test-id="inbox-state"
        :error-text="errorMessage"
        show-retry
        @retry="load"
      />
      <Tabs v-else v-model:active-key="activeTab">
        <Tabs.TabPane key="activity" :tab="activityTabLabel">
          <div class="inbox__controls">
            <DatePicker.RangePicker data-testid="inbox-range" @change="onRangeChange" />
          </div>
          <SmState
            v-if="!loading && visibleEvents.length === 0"
            state="empty"
            test-id="inbox-activity-empty"
            :empty-text="t('inbox.emptyActivity')"
          />
          <SmTable
            v-else
            test-id="inbox-activity-table"
            :columns="activityColumns"
            :data-source="visibleEvents"
            :pagination="false"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'actor'">{{ refName((record as ActivityEvent).actor) }}</template>
              <template v-else-if="column.key === 'event'">{{ (record as ActivityEvent).summary || (record as ActivityEvent).eventType }}</template>
              <template v-else-if="column.key === 'entity'">{{ refName((record as ActivityEvent).entity) }}</template>
              <template v-else-if="column.key === 'time'">{{ eventTime(record as ActivityEvent) }}</template>
            </template>
          </SmTable>
        </Tabs.TabPane>
        <Tabs.TabPane key="tasks" :tab="tasksTabLabel">
          <SmState
            v-if="!loading && tasks.length === 0"
            state="empty"
            test-id="inbox-tasks-empty"
            :empty-text="t('inbox.emptyTasks')"
          />
          <SmTable
            v-else
            test-id="inbox-tasks-table"
            :columns="taskColumns"
            :data-source="tasks"
            :pagination="false"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <a href="#" @click.prevent="openTask(record as CollaborationTask)">
                  {{ (record as CollaborationTask).displayName || (record as CollaborationTask).name || (record as CollaborationTask).id }}
                </a>
              </template>
              <template v-else-if="column.key === 'type'">{{ (record as CollaborationTask).type ?? '—' }}</template>
              <template v-else-if="column.key === 'status'">{{ (record as CollaborationTask).status ?? '—' }}</template>
              <template v-else-if="column.key === 'assignees'">{{ taskAssignees(record as CollaborationTask) }}</template>
            </template>
          </SmTable>
        </Tabs.TabPane>
      </Tabs>
    </Spin>
  </PageLayout>
</template>

<style scoped>
.inbox__controls {
  display: flex;
  gap: 12px;
  margin-block: 12px;
}
</style>
