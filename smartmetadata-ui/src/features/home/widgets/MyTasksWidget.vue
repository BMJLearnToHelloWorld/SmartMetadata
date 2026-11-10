<template>
  <HomeWidgetCard
    :title="t('home.myTasks')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="status"
    :summary="summary"
    :meta="isPartialPage ? t('home.loadedOfTotalTasks', { loaded: tasks.length, total }) : undefined"
    :empty-state="emptyState"
    @retry="refetch"
    @empty-action="openTasks"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="openTasks">
        {{ t('home.openTasks') }}
      </button>
    </template>
    <div class="my-tasks__chips" role="group" :aria-label="t('home.myTasks')">
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="my-tasks__chip"
        :class="{ 'my-tasks__chip--active': bucket === chip.id }"
        :aria-pressed="bucket === chip.id"
        :data-testid="`my-tasks-chip-${chip.id}`"
        @click="selectBucket(chip.id)"
      >
        {{ chip.label }} ({{ chip.count }})
      </button>
    </div>
    <ul class="my-tasks__list" data-testid="my-tasks-list">
      <li
        v-for="task in filteredTasks"
        :key="task.id"
        class="my-tasks__row"
        :data-testid="`my-tasks-row-${task.id}`"
      >
        <input
          type="checkbox"
          :checked="selected.has(task.id)"
          :aria-label="getTaskTitle(task)"
          data-testid="my-tasks-row-select"
          @change="toggleSelect(task, ($event.target as HTMLInputElement).checked)"
        />
        <a-avatar size="small" :data-testid="`my-tasks-row-requester-${task.id}`">
          {{ requesterInitial(task) }}
        </a-avatar>
        <button
          type="button"
          class="my-tasks__title"
          :data-testid="`my-tasks-row-title-${task.id}`"
          @click="openTask(task)"
        >
          {{ getTaskTitle(task) }}
        </button>
        <span v-if="kindLabel(task)" class="my-tasks__kind" :data-testid="`my-tasks-row-kind-${task.id}`">
          {{ kindLabel(task) }}
        </span>
        <span v-if="task.about" class="my-tasks__about" :data-testid="`my-tasks-row-about-${task.id}`">
          {{ task.about.displayName ?? task.about.name }}
        </span>
        <span
          v-if="task.comments.length > 0"
          class="my-tasks__comments"
          :data-testid="`my-tasks-row-comments-${task.id}`"
        >
          {{ task.comments.length }}
        </span>
      </li>
    </ul>
    <div v-if="selected.size > 0" class="my-tasks__selection" data-testid="my-tasks-selection-bar">
      <span>{{ t('home.selectedCount', { count: selected.size }) }}</span>
      <template v-if="bulkAction.kind === 'resolve'">
        <button
          type="button"
          :disabled="isResolving"
          data-testid="my-tasks-bulk-approve"
          @click="resolveSelected('approve')"
        >
          {{ bulkAction.isAllAccess ? t('home.grant') : t('home.approve') }}
        </button>
        <button
          type="button"
          :disabled="isResolving"
          data-testid="my-tasks-bulk-reject"
          @click="resolveSelected('reject')"
        >
          {{ bulkAction.isAllAccess ? t('home.deny') : t('home.reject') }}
        </button>
      </template>
      <button v-else type="button" data-testid="my-tasks-bulk-open" @click="openTasks">
        {{ t('home.openTasks') }}
      </button>
    </div>
  </HomeWidgetCard>
</template>

<script setup lang="ts">
import { computed, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import HomeWidgetCard from '@/features/home/HomeWidgetCard.vue';
import { useMyTasks } from '@/features/home/widgets/useMyTasks';
import { useBulkResolveTasks, type BulkDecision } from '@/features/home/widgets/useBulkResolveTasks';
import { getTaskTitle } from '@/catalog/taskTitle';
import {
  getMyTaskBucket,
  MyTaskBucket,
  filterMyTasks,
  getBulkTaskAction,
} from '@/catalog/myTaskBuckets';
import type { CollaborationTask } from '@/types/collaboration';

const props = defineProps<{ widgetKey: string }>();

const { t } = useI18n();
const router = useRouter();

const { tasks, total, counts, isLoading, isError, refetch } = useMyTasks();
const { isResolving, resolveAll } = useBulkResolveTasks();

const bucket: Ref<MyTaskBucket> = ref(MyTaskBucket.ALL);
const selected: Ref<Set<string>> = ref(new Set());

const chips = computed(() => [
  { id: MyTaskBucket.ALL, label: t('home.all'), count: counts.value[MyTaskBucket.ALL] },
  { id: MyTaskBucket.INCIDENTS, label: t('home.incidents'), count: counts.value[MyTaskBucket.INCIDENTS] },
  { id: MyTaskBucket.ACCESS, label: t('home.access'), count: counts.value[MyTaskBucket.ACCESS] },
  { id: MyTaskBucket.APPROVALS, label: t('home.approvals'), count: counts.value[MyTaskBucket.APPROVALS] },
]);

const filteredTasks = computed(() => filterMyTasks(tasks.value, bucket.value));
const isPartialPage = computed(() => tasks.value.length < total.value);

const summary = computed(() => {
  const open = t('home.myTasksOpen', { count: total.value });
  const incidents = counts.value[MyTaskBucket.INCIDENTS];
  return incidents > 0
    ? `${open} ${t('home.myTasksIncidentsNeedResolution', { count: incidents })}`
    : open;
});

const status = computed(() => {
  const incidents = counts.value[MyTaskBucket.INCIDENTS];
  return incidents > 0
    ? { label: t('home.myTasksIncidents', { count: incidents }), tone: 'error' as const }
    : undefined;
});

const emptyState = computed(() =>
  total.value === 0
    ? {
        title: t('home.myTasksAllCaughtUp'),
        description: t('home.myTasksNoOpenTasks'),
        actionLabel: t('home.openTasks'),
      }
    : undefined,
);

const selectedTasks = computed(() => tasks.value.filter((task) => selected.value.has(task.id)));
const bulkAction = computed(() => getBulkTaskAction(selectedTasks.value));

/**
 * Official clears the selection set on a bucket switch (MyTasksWidget
 * resets the selected tasks when the tab changes): a selection from
 * another bucket must not linger invisibly into the bulk action.
 */
function selectBucket(next: MyTaskBucket): void {
  bucket.value = next;
  selected.value = new Set();
}

function toggleSelect(task: CollaborationTask, checked: boolean): void {
  const next = new Set(selected.value);
  if (checked) {
    next.add(task.id);
  } else {
    next.delete(task.id);
  }
  selected.value = next;
}

function openTask(task: CollaborationTask): void {
  void router.push({ name: 'task', params: { id: task.id } });
}

function openTasks(): void {
  void router.push({ name: 'tasks' });
}

async function resolveSelected(decision: BulkDecision): Promise<void> {
  const labels = { approve: t('home.approve'), reject: t('home.reject') };
  const result = await resolveAll(selectedTasks.value, decision, labels);
  if (result.resolved > 0) {
    message.success(
      decision === 'approve'
        ? t('home.myTasksApproved', { count: result.resolved })
        : t('home.myTasksRejected', { count: result.resolved }),
    );
  }
  if (result.unresolved > 0) {
    message.error(t('home.myTasksUnresolved', { count: result.unresolved }));
  }
  selected.value = new Set(result.unresolvedIds);
  if (result.resolved > 0) {
    await refetch();
  }
}

function requesterInitial(task: CollaborationTask): string {
  const name = task.createdBy?.displayName ?? task.createdBy?.name ?? '';
  return name.trim().charAt(0).toUpperCase() || '?';
}

function kindLabel(task: CollaborationTask): string {
  return getMyTaskBucket(task) ?? task.category ?? task.type ?? '';
}
</script>

<style scoped>
.my-tasks__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.my-tasks__chip {
  border: 1px solid var(--sm-border-color);
  border-radius: 999px;
  background: transparent;
  padding: 2px 10px;
  cursor: pointer;
  font-size: 12px;
}

.my-tasks__chip--active {
  border-color: var(--sm-color-primary);
  color: var(--sm-color-primary);
  font-weight: 600;
}

.my-tasks__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.my-tasks__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.my-tasks__title {
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  color: inherit;
}

.my-tasks__kind,
.my-tasks__about,
.my-tasks__comments {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.my-tasks__selection {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--sm-border-secondary);
  font-size: 12px;
}
</style>
