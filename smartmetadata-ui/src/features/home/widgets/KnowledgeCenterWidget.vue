<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import ArticleFormModal from '@/views/contextCenter/ArticleFormModal.vue';
import { createKnowledgePage, listKnowledgePages } from '@/api/contextCenter';
import { getLimitByResource } from '@/api/limits';
import { permissionFlags } from '@/api/permissions';
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';
import { useWidgetLoad } from '@/features/home/widgetLoad';
import { getRelativeTime } from '@/utils/relativeTime';
import { usePermissionStore } from '@/stores/permissions';
import type { KnowledgePage } from '@/types/contextCenter';

const props = defineProps<{
  widgetKey: string;
  /**
   * Stage D: the home view and the editor pass the card chrome through
   * these props, and the widget forwards them to its HomeWidgetCard
   * explicitly. They cannot fall through: this widget renders a
   * fragment root (the card plus the article modal beside it), so
   * fallthrough attrs are dropped with a Vue warning instead.
   */
  editView?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  (event: 'remove'): void;
  (event: 'toggle-collapse'): void;
}>();

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();

const RECENT_WINDOW_DAYS = 7;
const CONTEXT_CENTER_FETCH_LIMIT = 10;
const MAX_VISIBLE_ROWS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

// ADR:2026-11-08-my-data-knowledge-center-widget
const loaded = useWidgetLoad(
  'context-center',
  async () => {
    const page = await listKnowledgePages({ limit: CONTEXT_CENTER_FETCH_LIMIT, sortBy: 'updatedAt', sortOrder: 'desc' });
    return { pages: page.data ?? [], total: page.total ?? page.data?.length ?? 0 };
  },
  { ttlMs: 5 * 60 * 1000 },
);
const isLoading = loaded.isLoading;
const isError = loaded.isError;
const refetch = loaded.refetch;

const pages = computed(() => loaded.data.value?.pages ?? []);
const total = computed(() => loaded.data.value?.total ?? 0);
const visiblePages = computed(() => pages.value.slice(0, MAX_VISIBLE_ROWS));

const recent = computed(() => {
  const since = Date.now() - RECENT_WINDOW_DAYS * DAY_MS;
  return pages.value.filter((page) => (page.updatedAt ?? 0) >= since).length;
});
const isRecentFloor = computed(
  () => recent.value === pages.value.length && total.value > pages.value.length,
);
const recentLabel = computed(() =>
  isRecentFloor.value
    ? t('home.pagesUpdatedThisWeekPlus', { count: recent.value })
    : t('home.pagesUpdatedThisWeek', { count: recent.value }),
);

const status = computed(() =>
  recent.value === 0 && !isError.value
    ? { label: t('home.caughtUp'), tone: 'success' as const }
    : undefined,
);

const canCreate = ref(false);
const showCreateModal = ref(false);

const emptyState = computed(() =>
  pages.value.length === 0
    ? {
        title: t('home.noArticlesYet'),
        description: t('home.contextCenterEmptyDescription'),
        actionLabel: canCreate.value ? t('home.newArticle') : undefined,
      }
    : undefined,
);

async function loadCreateGate(): Promise<void> {
  try {
    const flags = permissionFlags(await permissionStore.getResourcePermission('page'));
    canCreate.value = flags.canCreate;
  } catch {
    canCreate.value = false;
  }
}

void loadCreateGate();

function pageTypeLabel(page: KnowledgePage): string {
  return page.pageType === 'QuickLink' ? t('home.quickLink') : t('home.article');
}

function quickLinkUrl(page: KnowledgePage): string | undefined {
  return page.pageType === 'QuickLink' ? getSafeHttpUrl(page.pageUrl) : undefined;
}

function openPage(page: KnowledgePage): void {
  void router.push({
    name: 'context-center-article',
    params: { fqn: page.fullyQualifiedName },
  });
}

function openContextCenter(): void {
  void router.push({ name: 'context-center-articles' });
}

async function onCreate(value: {
  name: string;
  displayName?: string;
  description?: string;
  pageType: 'Article' | 'QuickLink';
  pageUrl?: string;
}): Promise<void> {
  await createKnowledgePage(value);
  showCreateModal.value = false;
  message.success(t('contextCenter.created'));
  await refetch();
  // Official passes getResourceLimit('knowledgeCenter', ...) as the
  // create flow's post-success callback: the limit is refreshed after a
  // create, never consulted to gate the button. Fail-open — a failed
  // refresh must not surface an error for a create that succeeded.
  await getLimitByResource('knowledgeCenter').catch(() => undefined);
}
</script>

<template>
  <HomeWidgetCard
    :title="t('home.contextCenter')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="status"
    :summary="recentLabel"
    :empty-state="emptyState"
    :edit-view="props.editView"
    :collapsible="props.collapsible"
    :collapsed="props.collapsed"
    @retry="refetch"
    @empty-action="showCreateModal = true"
    @remove="emit('remove')"
    @toggle-collapse="emit('toggle-collapse')"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="openContextCenter">
        {{ t('home.openContextCenter') }}
      </button>
    </template>
    <ul class="context-center__rows" data-testid="context-center-rows">
      <li
        v-for="page in visiblePages"
        :key="page.id"
        class="context-center__row"
        :data-testid="`context-page-${page.id}`"
      >
        <div class="context-center__main">
          <span class="context-center__name">{{ page.displayName ?? page.name }}</span>
          <span class="context-center__meta">
            {{
              t('home.pageTypeUpdatedTime', {
                pageType: pageTypeLabel(page),
                time: page.updatedAt ? getRelativeTime(page.updatedAt) : '',
              })
            }}
          </span>
        </div>
        <a
          v-if="quickLinkUrl(page)"
          class="home-widget-card__link"
          :data-testid="`context-page-open-${page.id}`"
          :href="quickLinkUrl(page)"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('home.read') }}
        </a>
        <button
          v-else
          type="button"
          class="home-widget-card__link"
          :data-testid="`context-page-open-${page.id}`"
          @click="openPage(page)"
        >
          {{ t('home.read') }}
        </button>
      </li>
    </ul>
  </HomeWidgetCard>
  <!-- Outside the card: the default slot is not rendered in the empty
    state (HomeWidgetCard renders `<slot v-else />`), so a modal mounted
    inside it could never open from the empty-state create action. -->
  <ArticleFormModal
    :open="showCreateModal"
    @ok="onCreate"
    @cancel="showCreateModal = false"
    @update:open="showCreateModal = $event"
  />
</template>

<style scoped>
.context-center__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.context-center__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--sm-border-secondary);
}

.context-center__row:last-child {
  border-bottom: 0;
}

.context-center__main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.context-center__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.context-center__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
</style>
