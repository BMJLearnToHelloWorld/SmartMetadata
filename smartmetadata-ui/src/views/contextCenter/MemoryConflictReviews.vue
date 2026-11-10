<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Empty, Typography, message } from 'ant-design-vue';
import { getContextMemoryById } from '@/api/contextCenter';
import { listMyAssignedTasks, listTasks } from '@/api/tasks';
import { MEMORY_FIELDS, REVIEW_PAGE_SIZE } from '@/catalog/contextCenterMemories';
import { usePermissionStore } from '@/stores/permissions';
import type { CollaborationTask } from '@/types/collaboration';

const props = defineProps<{ refreshSignal?: number }>();

const emit = defineEmits<{
  'open-review': [task: CollaborationTask];
  count: [total: number];
}>();

const { t } = useI18n();
const permissionStore = usePermissionStore();

const REVIEW_FIELDS = 'about,createdBy,payload';

const reviews = ref<CollaborationTask[]>([]);
const titles = ref(new Map<string, string>());
const total = ref(0);
const after = ref<string | undefined>();
const loading = ref(false);
const loadingMore = ref(false);
const errorMessage = ref('');

function listReviews(query: {
  type: string;
  status: string;
  limit: number;
  after?: string;
  fields?: string;
}): Promise<{ data: CollaborationTask[]; total?: number; after?: string }> {
  // Official useMemoryConflictReviews: every open review for an admin,
  // otherwise the ones assigned to the user or their teams.
  return permissionStore.isAdminUser
    ? listTasks(query)
    : listMyAssignedTasks(query);
}

async function loadTitles(tasks: CollaborationTask[]): Promise<void> {
  const missing = tasks.filter(
    (task) => task.about?.id && !titles.value.has(task.id),
  );
  await Promise.all(
    missing.map(async (task) => {
      const aboutId = task.about?.id;
      if (!aboutId) {
        return;
      }
      try {
        const memory = await getContextMemoryById(aboutId, MEMORY_FIELDS);
        titles.value.set(
          task.id,
          memory?.title || task.about?.displayName || task.about?.name || aboutId,
        );
      } catch {
        titles.value.set(task.id, task.about?.displayName || task.about?.name || aboutId);
      }
    }),
  );
}

async function loadCount(): Promise<void> {
  try {
    const page = await listReviews({ type: 'MemoryConflictReview', status: 'Open', limit: 1 });
    total.value = page.total ?? 0;
    emit('count', total.value);
  } catch {
    // The count is best-effort; the list load below reports failures.
  }
}

async function loadFirst(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listReviews({
      type: 'MemoryConflictReview',
      status: 'Open',
      limit: REVIEW_PAGE_SIZE,
      fields: REVIEW_FIELDS,
    });
    reviews.value = page.data;
    after.value = page.after;
    await loadTitles(page.data);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    reviews.value = [];
    after.value = undefined;
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (!after.value || loadingMore.value) {
    return;
  }
  loadingMore.value = true;
  try {
    const page = await listReviews({
      type: 'MemoryConflictReview',
      status: 'Open',
      limit: REVIEW_PAGE_SIZE,
      after: after.value,
      fields: REVIEW_FIELDS,
    });
    reviews.value = [...reviews.value, ...page.data];
    after.value = page.after;
    await loadTitles(page.data);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    loadingMore.value = false;
  }
}

function reload(): void {
  void loadCount();
  void loadFirst();
}

watch(
  () => props.refreshSignal,
  () => {
    reload();
  },
);

onMounted(() => {
  reload();
});
</script>

<template>
  <div data-testid="memory-reviews">
    <div v-if="loading">
      <Typography.Text type="secondary">{{ t('shared.loading') }}</Typography.Text>
    </div>
    <div v-else-if="errorMessage">
      <Typography.Text type="danger">{{ errorMessage }}</Typography.Text>
      <Button data-testid="memory-reviews-retry" @click="reload">
        {{ t('shared.retry') }}
      </Button>
    </div>
    <Empty
      v-else-if="reviews.length === 0"
      :description="t('contextCenter.reviewEmpty')"
      data-testid="memory-reviews-empty"
    />
    <div v-else>
      <div
        v-for="review in reviews"
        :key="review.id"
        style="border-bottom: 1px solid #f0f0f0; padding: 12px 0"
      >
        <Button
          type="link"
          :data-testid="`memory-review-${review.id}`"
          style="padding: 0; height: auto; text-align: left"
          @click="emit('open-review', review)"
        >
          {{ titles.get(review.id) || review.about?.displayName || review.about?.name || review.id }}
        </Button>
        <Typography.Paragraph type="secondary" style="margin: 4px 0 0">
          {{ review.createdBy?.displayName || review.createdBy?.name || '' }}
        </Typography.Paragraph>
      </div>
      <Button
        v-if="after"
        data-testid="memory-reviews-load-more"
        :loading="loadingMore"
        style="margin-top: 12px"
        @click="loadMore"
      >
        {{ t('crud.loadMore') }}
      </Button>
    </div>
  </div>
</template>
