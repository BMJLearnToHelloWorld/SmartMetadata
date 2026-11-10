<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Empty, Typography } from 'ant-design-vue';
import { listKnowledgePages } from '@/api/contextCenter';
import { listTags } from '@/api/tags';
import { getUserFollows } from '@/api/users';
import { listRecentlyViewed, type RecentlyViewedPage } from '@/stores/contextCenterRecent';
import { useAuthStore } from '@/stores/auth';
import type { EntityRef } from '@/types/api';
import type { KnowledgePage, KnowledgePageType } from '@/types/contextCenter';

/**
 * Official KnowledgePageListRightPanel (pin `a3012259ca`), three groups:
 * bookmarks (BookMarkWidget) / recently viewed / tag-grouped quick
 * links. Whole-card empty state when the KnowledgeCenter classification
 * carries no tags at all — official replaces the entire panel then,
 * including bookmarks and recent.
 *
 * ADR:2026-11-08-context-center-bookmarks-follows
 */
const props = defineProps<{
  refreshSignal: number;
  canCreate: boolean;
}>();

const emit = defineEmits<{
  'open-page': [page: { fullyQualifiedName?: string; pageType?: KnowledgePageType; pageUrl?: string }];
  'add-quick-link': [];
}>();

const { t } = useI18n();
const auth = useAuthStore();

const bookmarks = ref<EntityRef[]>([]);
const recent = ref<RecentlyViewedPage[]>([]);
const tagGroups = ref<Array<{ tagFqn: string; title: string; pages: KnowledgePage[] }>>([]);
const loading = ref(false);

let generation = 0;

/** Official title: startCase of the tag name (the second FQN segment). */
function tagGroupTitle(fqn: string): string {
  const segment = fqn.split('.')[1] ?? fqn;
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

async function load(): Promise<void> {
  const request = ++generation;
  loading.value = true;
  try {
    const userId = auth.user?.id;
    try {
      bookmarks.value = userId ? await getUserFollows(userId) : [];
    } catch {
      bookmarks.value = [];
    }
    recent.value = listRecentlyViewed(auth.user?.name);
    try {
      const tagPage = await listTags({ parent: 'KnowledgeCenter', limit: 25 });
      const groups = await Promise.all(
        tagPage.data.map(async (tag) => {
          const tagFqn = tag.fullyQualifiedName ?? '';
          let pages: KnowledgePage[] = [];
          try {
            pages = (
              await listKnowledgePages({ fields: 'owners,tags', tagFQN: tagFqn })
            ).data;
          } catch {
            pages = [];
          }
          return { tagFqn, title: tagGroupTitle(tagFqn), pages };
        }),
      );
      if (request !== generation) {
        return;
      }
      tagGroups.value = groups;
    } catch {
      if (request === generation) {
        tagGroups.value = [];
      }
    }
  } finally {
    if (request === generation) {
      loading.value = false;
    }
  }
}

const nonEmptyGroups = computed(() =>
  tagGroups.value.filter((group) => group.pages.length > 0),
);
const isEmptyState = computed(() => !loading.value && tagGroups.value.length === 0);

watch(
  () => props.refreshSignal,
  () => {
    void load();
  },
);
watch(
  () => auth.user?.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="articles-right-panel">
    <Typography.Text v-if="loading" type="secondary" data-testid="articles-right-panel-loading">
      {{ t('shared.loading') }}
    </Typography.Text>
    <Card v-else-if="isEmptyState" data-testid="articles-right-panel-empty">
      <Empty :description="t('contextCenter.quickLinks')">
        <Button
          v-if="canCreate"
          type="primary"
          data-testid="articles-right-panel-create-quick-link"
          @click="emit('add-quick-link')"
        >
          {{ t('contextCenter.createQuickLink') }}
        </Button>
      </Empty>
    </Card>
    <div v-else style="display: flex; flex-direction: column; gap: 16px">
      <Card :title="t('contextCenter.bookmarks')" data-testid="articles-right-panel-bookmarks">
        <Typography.Text v-if="bookmarks.length === 0" type="secondary">
          {{ t('contextCenter.noBookmarks') }}
        </Typography.Text>
        <div v-else style="display: flex; flex-direction: column; gap: 4px">
          <Button
            v-for="bookmark in bookmarks"
            :key="bookmark.id ?? bookmark.fullyQualifiedName"
            type="link"
            :data-testid="`articles-bookmark-${bookmark.id ?? ''}`"
            style="padding: 0; height: auto; text-align: left"
            @click="emit('open-page', { fullyQualifiedName: bookmark.fullyQualifiedName })"
          >
            {{ bookmark.displayName || bookmark.name }}
          </Button>
        </div>
      </Card>
      <Card :title="t('contextCenter.recentlyViewed')" data-testid="articles-right-panel-recent">
        <Typography.Text v-if="recent.length === 0" type="secondary">
          {{ t('contextCenter.emptyRecentlyViewed') }}
        </Typography.Text>
        <div v-else style="display: flex; flex-direction: column; gap: 4px">
          <Button
            v-for="entry in recent"
            :key="entry.id"
            type="link"
            :data-testid="`articles-recent-${entry.id}`"
            style="padding: 0; height: auto; text-align: left"
            @click="
              emit('open-page', {
                fullyQualifiedName: entry.fullyQualifiedName,
                pageType: entry.pageType,
                pageUrl: entry.pageUrl,
              })
            "
          >
            {{ entry.title }}
          </Button>
        </div>
      </Card>
      <Card
        v-for="group in nonEmptyGroups"
        :key="group.tagFqn"
        :title="group.title"
        :data-testid="`articles-tag-group-${group.tagFqn}`"
      >
        <div style="display: flex; flex-direction: column; gap: 4px">
          <Button
            v-for="page in group.pages"
            :key="page.id"
            type="link"
            :data-testid="`articles-quick-link-${page.id}`"
            style="padding: 0; height: auto; text-align: left"
            @click="
              emit('open-page', {
                fullyQualifiedName: page.fullyQualifiedName,
                pageType: page.pageType,
                pageUrl: page.pageUrl,
              })
            "
          >
            {{ page.displayName || page.name }}
          </Button>
        </div>
      </Card>
    </div>
  </div>
</template>
