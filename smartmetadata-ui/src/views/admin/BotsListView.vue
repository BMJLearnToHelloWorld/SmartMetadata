<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of the official Bots list (392b3efd object tree):
  `pages/BotsPageV1/BotsPageV1.component.tsx` (page shell, Show Deleted
  state, page title) and
  `components/Settings/Bot/BotListV1/BotListV1.component.tsx` (table,
  search, paging, delete).

  The shared EntityListShell cannot express this page (cursor paging
  with a size selector, the create/no-search empty variants, and
  toast-only errors), so the page composes SmBreadcrumb + PageHeader +
  SmTable + the Wave 1 placeholders directly.
-->
<script setup lang="ts">
import { computed, onUnmounted, ref, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { Button, Input, Switch, Tooltip, message } from 'ant-design-vue';
import type { TableProps } from 'ant-design-vue';
import { DeleteOutlined } from '@ant-design/icons-vue';
import {
  BOT_SEARCH_PAGE_SIZE,
  MAX_BOT_SEARCH_LENGTH,
  deleteBot,
  indexBotsByLowerName,
  listBots,
  searchBots,
} from '@/api/bots';
import { getLimitByResource } from '@/api/limits';
import type { AdminBot } from '@/types/admin';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import HighlightedText from '@/components/ingestion/HighlightedText.vue';
import LimitWrapper from '@/components/shared/LimitWrapper.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import SmTable from '@/components/shared/SmTable.vue';
import DeleteEntityModal from '@/features/crud/DeleteEntityModal.vue';
import type { DeleteType } from '@/ingestion/serviceDelete';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { useAuthStore } from '@/stores/auth';
import { useLimitBannerStore } from '@/stores/limitBanner';
import { startCase } from '@/utils/text';
import { usePermissionStore } from '@/stores/permissions';
import { useShellConfigStore } from '@/stores/shellConfig';
import { getBotPath } from '@/utils/fqnPaths';
import {
  CursorType,
  INITIAL_PAGING,
  PAGE_SIZE_BASE,
  type Paging,
  type PagingHandlerParams,
} from '@/utils/pagination';
import {
  descriptionColumnDef,
  entityNameColumnDef,
  resolveTooltipTitle,
} from '@/utils/columns';
import { isDescriptionContentEmpty } from '@/utils/richTextUtils';
import { readGlobalPageSize, writeGlobalPageSize } from '@/utils/userPageSizePreference';

/**
 * Official create-bot route (`getCreateUserPath(true)`, RouterUtils).
 * The route itself is created by the integration line (B32); this
 * page navigates to the literal path.
 */
const CREATE_BOT_PATH = '/create-user/bot';

/** Search debounce interval (`typingInterval={500}`, BotListV1:519-528). */
const SEARCH_DEBOUNCE_MS = 500;

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const banner = useLimitBannerStore();
const shellConfig = useShellConfigStore();

const isAdminUser = computed(() => permissionStore.isAdminUser);

function queryNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function queryCursorType(value: unknown): CursorType | null {
  return value === CursorType.BEFORE || value === CursorType.AFTER ? value : null;
}

const currentPage = ref(queryNumber(route.query.currentPage) ?? 1);
const pageSize = ref(
  queryNumber(route.query.pageSize) ??
    readGlobalPageSize(window.localStorage, authStore.user?.name),
);
const pagingCursor = ref<{ cursorType: CursorType | null; cursorValue?: string }>({
  cursorType: queryCursorType(route.query.cursorType),
  cursorValue: typeof route.query.cursorValue === 'string' ? route.query.cursorValue : undefined,
});

const loading = ref(false);
const showDeleted = ref(false);
const botUsers = ref<AdminBot[]>([]);
const searchedData = ref<AdminBot[]>([]);
const paging = ref<Paging>({ ...INITIAL_PAGING });
const searchTerm = ref('');
const searchInput = ref('');
const selectedBot = ref<AdminBot | undefined>();
const deleting = ref(false);
/**
 * Official `handleErrorPlaceholder` (BotListV1:250-277): set only by a
 * successful fetch, never cleared by a failed one.
 */
const handleErrorPlaceholder = ref(false);
const latestSearchRequest = ref(0);
const botMap = ref(new Map<string, AdminBot>());

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('label.setting-plural'), routeName: 'admin-settings' },
  { label: t('label.bot-plural') },
]);

const showCreatePlaceholder = computed(() => handleErrorPlaceholder.value && !showDeleted.value);
const showTable = computed(() => loading.value || searchedData.value.length > 0);
const showPagination = computed(
  () =>
    Boolean(paging.value.before || paging.value.after) ||
    paging.value.total > pageSize.value ||
    pageSize.value !== PAGE_SIZE_BASE,
);
const searchPlaceholder = computed(
  () =>
    `${t('label.search-for-type', { type: t('label.bot-plural') })}${String(locale.value).startsWith('zh') ? '…' : '...'}`,
);
const columns = computed<TableProps['columns']>(() => [
  ...entityNameColumnDef(t('label.name'), { dataIndex: 'displayName', key: 'displayName' }),
  ...descriptionColumnDef(t('label.description')),
  { title: t('label.action-plural'), dataIndex: 'id', key: 'id', width: 90 },
]);

/**
 * Delete tooltip, first-match-wins via the shared predicate-table
 * helper (SHARED-CONTRACTS.md §15.4 Bot exception): system provider
 * first, then the non-admin line, then the plain Delete label for
 * admins (BotListV1:324-330).
 */
function deleteTooltipTitle(bot: AdminBot): string {
  return resolveTooltipTitle(
    [
      { matches: bot.provider === 'system', title: t('message.ingestion-bot-cant-be-deleted') },
      { matches: !isAdminUser.value, title: t('message.admin-only-action') },
    ],
    t('label.delete'),
  );
}

function botFqn(bot: AdminBot): string {
  return bot.fullyQualifiedName || bot.name || '';
}

function errorMessageText(error: unknown, fallback?: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback ?? t('server.unexpected-error');
}

watchEffect(() => {
  document.title = t('label.entity-detail-plural', { entity: t('label.bot') });
});

function syncPagingUrl(): void {
  const nextQuery = {
    ...route.query,
    currentPage: String(currentPage.value),
    pageSize: String(pageSize.value),
    cursorType: pagingCursor.value.cursorType ?? undefined,
    cursorValue: pagingCursor.value.cursorValue,
  };
  const current = route.query;
  const unchanged =
    String(current.currentPage ?? '') === nextQuery.currentPage &&
    String(current.pageSize ?? '') === nextQuery.pageSize &&
    (current.cursorType ?? undefined) === (nextQuery.cursorType ?? undefined) &&
    (current.cursorValue ?? undefined) === (nextQuery.cursorValue ?? undefined);
  if (!unchanged) {
    void router.replace({ query: nextQuery });
  }
}

function handlePageChange(
  page: number,
  cursorData: { cursorType: CursorType | null; cursorValue?: string },
): void {
  currentPage.value = page;
  pagingCursor.value = { cursorType: cursorData.cursorType, cursorValue: cursorData.cursorValue };
  syncPagingUrl();
}

async function loadBotMap(): Promise<void> {
  const page = await listBots({
    limit: BOT_SEARCH_PAGE_SIZE,
    include: showDeleted.value ? 'deleted' : 'non-deleted',
  });
  botMap.value = indexBotsByLowerName(page.data);
}

let botMapPromise: Promise<void> | null = null;

/**
 * Official `ensureBotMapLoaded` (BotListV1:128-146): a failed load
 * resets the promise and toasts, but resolves so the search join
 * still runs against an empty map.
 */
function ensureBotMapLoaded(): Promise<void> {
  if (!botMapPromise) {
    botMapPromise = loadBotMap().catch((error: unknown) => {
      botMapPromise = null;
      message.error(errorMessageText(error));
    });
  }
  return botMapPromise;
}

function reloadBotMap(): Promise<void> {
  botMapPromise = null;
  botMap.value = new Map();
  return ensureBotMapLoaded();
}

async function runActiveSearch(term: string): Promise<void> {
  const requestId = ++latestSearchRequest.value;
  await ensureBotMapLoaded();
  try {
    const matched = await searchBots(term, {
      showDeleted: showDeleted.value,
      bots: [...botMap.value.values()],
    });
    if (latestSearchRequest.value === requestId) {
      searchedData.value = matched;
    }
  } catch (error) {
    if (latestSearchRequest.value === requestId) {
      message.error(errorMessageText(error));
      searchedData.value = [];
    }
  }
}

async function fetchBots(): Promise<void> {
  loading.value = true;
  try {
    const page = await listBots({
      after:
        pagingCursor.value.cursorType === CursorType.AFTER
          ? pagingCursor.value.cursorValue || undefined
          : undefined,
      before:
        pagingCursor.value.cursorType === CursorType.BEFORE
          ? pagingCursor.value.cursorValue || undefined
          : undefined,
      limit: pageSize.value,
      include: showDeleted.value ? 'deleted' : 'non-deleted',
    });
    paging.value = { after: page.after ?? '', before: page.before ?? '', total: page.total ?? 0 };
    botUsers.value = page.data;
    const activeSearchTerm = searchTerm.value.trim();
    if (activeSearchTerm) {
      await runActiveSearch(activeSearchTerm);
    } else {
      searchedData.value = page.data;
    }
    handleErrorPlaceholder.value = !showDeleted.value && page.data.length === 0;
  } catch (error) {
    message.error(errorMessageText(error));
  } finally {
    loading.value = false;
  }
}

/**
 * Single-driver fetch (BotListV1:416-426): one effect on
 * [pageSize, showDeleted, pagingCursor]. The official page-change
 * handler also calls fetchBots directly, but the effect re-fetches
 * with the live toggle value; the draft resolves this as a
 * single-driver rule rather than a literal double fetch.
 *
 * The paging state itself stays page-owned `usePaging` semantics
 * (draft §275: URL cursorType/cursorValue/currentPage/pageSize, direct
 * cursor fetch, refetch on every navigation). The shared
 * `useCursorPagedList` composable is deliberately not adopted here:
 * its page cache + walk + no-URL semantics contradict the draft and
 * the official list (stale back-navigation, no deep-linkable paging
 * state); see the final report's idea-review section.
 */
watch([showDeleted, pageSize, pagingCursor], () => {
  botUsers.value = [];
  searchedData.value = [];
  void fetchBots();
});

watch(showDeleted, () => {
  void reloadBotMap();
});

async function handleSearch(text: string): Promise<void> {
  const cappedText = text.slice(0, MAX_BOT_SEARCH_LENGTH);
  searchTerm.value = cappedText;
  const normalizedSearchTerm = cappedText.trim();
  if (!normalizedSearchTerm) {
    latestSearchRequest.value += 1;
    handlePageChange(1, { cursorType: null, cursorValue: undefined });
    searchedData.value = botUsers.value;
    loading.value = false;
    return;
  }
  const currentSearchRequestId = latestSearchRequest.value + 1;
  loading.value = true;
  await runActiveSearch(normalizedSearchTerm);
  if (latestSearchRequest.value === currentSearchRequestId) {
    loading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;

function onSearchInput(value: string): void {
  searchInput.value = value;
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void handleSearch(value);
  }, SEARCH_DEBOUNCE_MS);
}

function onSearchSubmit(value: string): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  void handleSearch(value);
}

onUnmounted(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

function handleShowDeletedChange(checked: boolean | string | number): void {
  handlePageChange(1, { cursorType: null, cursorValue: undefined });
  // The Switch uses the default true/false values, so only a boolean
  // `true` means "show deleted"; the wider type is antd's change
  // payload for custom checked/unchecked values.
  showDeleted.value = checked === true;
}

function onPagingHandler(params: PagingHandlerParams): void {
  if (!params.cursorType) {
    return;
  }
  handlePageChange(params.currentPage, {
    cursorType: params.cursorType,
    cursorValue: paging.value[params.cursorType],
  });
}

function onPageSizeChange(size: number): void {
  pageSize.value = size;
  writeGlobalPageSize(window.localStorage, authStore.user?.name, size);
  handlePageChange(1, { cursorType: null, cursorValue: undefined });
}

function handleAddBotClick(): void {
  void router.push(CREATE_BOT_PATH);
}

async function refreshBotLimit(): Promise<void> {
  try {
    const limit = await getLimitByResource('bot');
    const status = limit.featureLimitStatuses[0];
    if (status) {
      banner.maybeShowLimitBanner({
        status,
        header: t('server.entityLimitReached', { entity: startCase('bot') }),
        plan: shellConfig.limit?.limits.config.plan || 'FREE',
      });
    }
  } catch {
    // Fail-open (limits ADR): a limit refresh failure must not block
    // the list refresh after a delete.
  }
}

async function handleDeleteAction(): Promise<void> {
  await Promise.all([refreshBotLimit(), reloadBotMap()]);
  handlePageChange(1, { cursorType: null, cursorValue: undefined });
}

async function handleDeleteConfirm(deleteType: DeleteType): Promise<void> {
  const target = selectedBot.value;
  if (!target) {
    return;
  }
  deleting.value = true;
  try {
    await deleteBot(target.id, { hardDelete: deleteType === 'hard-delete', recursive: false });
    message.success(t('server.entity-deleted-successfully', { entity: getEntityName(target) }));
    await handleDeleteAction();
  } catch (error) {
    message.error(
      errorMessageText(error, t('server.delete-entity-error', { entity: getEntityName(target) })),
    );
  } finally {
    deleting.value = false;
    selectedBot.value = undefined;
  }
}

void fetchBots();
void reloadBotMap();
</script>

<template>
  <div class="bots-list">
    <div v-if="showCreatePlaceholder">
      <div class="bots-list__switch-row">
        <label class="bots-list__switch">
          <span>{{ t('label.show-deleted') }}</span>
          <Switch
            :checked="showDeleted"
            size="small"
            data-testid="switch-deleted"
            @change="handleShowDeletedChange"
          />
        </label>
      </div>
      <div class="bots-list__placeholder-host">
        <!-- No `doc`: the docs base URL has no product config yet (U-1);
             the doc-link sub-item stays Held for the integration line. -->
        <CreatePlaceholder
          :heading="t('label.bot')"
          :title="t('label.bot')"
          :permission="isAdminUser"
          :permission-value="t('label.create-entity', { entity: t('label.bot') })"
          :test-id="`create-error-placeholder-${t('label.bot')}`"
          :on-create="handleAddBotClick"
        />
      </div>
    </div>
    <div v-else>
      <SmBreadcrumb :items="breadcrumbItems" />
      <div class="bots-list__head">
        <PageHeader
          :header="t('label.bot-plural')"
          :sub-header="t('message.page-sub-header-for-bots')"
          test-id="bots-page-header"
        />
        <div class="bots-list__head-actions">
          <label class="bots-list__switch">
            <span>{{ t('label.show-deleted') }}</span>
            <Switch
              :checked="showDeleted"
              size="small"
              data-testid="switch-deleted"
              @change="handleShowDeletedChange"
            />
          </label>
          <Tooltip :title="isAdminUser ? undefined : t('message.admin-only-action')">
            <div :class="{ 'bots-list__add-wrap--disabled': !isAdminUser }">
              <LimitWrapper resource="bot">
                <template #default="{ limitReached }">
                  <Button
                    type="primary"
                    size="small"
                    :disabled="!isAdminUser || limitReached"
                    data-testid="add-bot"
                    @click="handleAddBotClick"
                  >
                    {{ t('label.add-entity', { entity: t('label.bot') }) }}
                  </Button>
                </template>
              </LimitWrapper>
            </div>
          </Tooltip>
        </div>
      </div>
      <Input.Search
        :value="searchInput"
        :placeholder="searchPlaceholder"
        allow-clear
        data-testid="search-input"
        @update:value="onSearchInput"
        @search="onSearchSubmit"
      />
      <SmTable
        v-if="showTable"
        :columns="columns"
        :data-source="searchedData"
        row-key="name"
        :loading="loading"
        :pagination="false"
        size="small"
        test-id="admin-bots-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'displayName'">
            <!-- EntityNameLink has no highlight path; the official name
                 cell highlights search matches (BotListV1:290-294), so
                 the link + highlighter stay page-local here. -->
            <RouterLink
              :to="getBotPath(botFqn(record as AdminBot))"
              :data-testid="`bot-link-${getEntityName(record as AdminBot)}`"
            >
              <HighlightedText
                :text="getEntityName(record as AdminBot)"
                :search-text="searchTerm"
              />
            </RouterLink>
          </template>
          <template v-else-if="column.key === 'description'">
            <!-- Highlighting is the caller's (SHARED-CONTRACTS.md §15.4);
                 SmMarkdown escapes raw HTML, so highlight markup would be
                 escaped — while searching, render the plain text through
                 the highlighter instead of the markdown previewer. The
                 shared cell owns the empty branch otherwise. -->
            <HighlightedText
              v-if="searchTerm.trim() && !isDescriptionContentEmpty((record as AdminBot).description)"
              :text="(record as AdminBot).description ?? ''"
              :search-text="searchTerm"
            />
            <DescriptionCell v-else :markdown="(record as AdminBot).description ?? ''" />
          </template>
          <template v-else-if="column.key === 'id'">
            <Tooltip :title="deleteTooltipTitle(record as AdminBot)" placement="topRight">
              <span class="bots-list__delete-wrap">
                <Button
                  type="text"
                  size="small"
                  :disabled="!isAdminUser || (record as AdminBot).provider === 'system'"
                  :data-testid="`bot-delete-${(record as AdminBot).name}`"
                  :aria-label="t('label.delete')"
                  @click="selectedBot = record as AdminBot"
                >
                  <DeleteOutlined />
                </Button>
              </span>
            </Tooltip>
          </template>
        </template>
      </SmTable>
      <!-- SmTable's emptyText is string-only and cannot host the
           NoSearchResultsPlaceholder component as table empty text, so
           the placeholder replaces the table when there is nothing to
           show (covers search-empty and deleted-view-empty alike). -->
      <div v-else class="bots-list__placeholder-host">
        <NoSearchResultsPlaceholder test-id="search-error-placeholder" />
      </div>
      <NextPrevious
        v-if="showPagination && !searchTerm.trim()"
        class-name="bots-list__pagination"
        :paging="paging"
        :paging-handler="onPagingHandler"
        :page-size="pageSize"
        :current-page="currentPage"
        :is-loading="loading"
        :on-show-size-change="onPageSizeChange"
      />
      <DeleteEntityModal
        :open="Boolean(selectedBot)"
        :entity-name="selectedBot ? getEntityName(selectedBot) : ''"
        :entity-type-label="t('label.bot')"
        :allow-soft-delete="!showDeleted"
        :loading="deleting"
        @cancel="selectedBot = undefined"
        @confirm="handleDeleteConfirm"
      />
    </div>
  </div>
</template>

<style scoped>
.bots-list__switch-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.bots-list__switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.bots-list__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.bots-list__head-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.bots-list__add-wrap--disabled {
  cursor: not-allowed;
}

.bots-list__placeholder-host {
  position: relative;
  min-height: 240px;
  width: 100%;
  border-radius: 12px;
  background: var(--sm-bg-container);
}

.bots-list__delete-wrap {
  display: inline-flex;
}

.bots-list__pagination {
  margin-top: 12px;
}
</style>
