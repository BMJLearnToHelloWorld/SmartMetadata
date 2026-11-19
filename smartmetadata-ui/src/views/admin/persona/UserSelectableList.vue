<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin UserSelectableList.component.tsx + SelectableList.
  component.tsx. Search (page 1, 25 rows, isBot=false filter) and
  cursor-paged list fetch (25 rows, isBot=false) both fail to empty
  data with no error note. The search filter reuses the product's
  existing term-query builder (buildOnlineUserSearchQueryFilter),
  the JSON.stringify({query:{bool:{must:[term]}}}) form pin's
  getTermQuery produces. Selected-first ordering applies only when
  there is no search text; search responses and appended pages keep
  their order, and stale responses are dropped by search-id and
  generation guards. The list is a plain scrollable region (250px):
  pin's rc-virtual-list virtualization is not ported.
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Avatar, Button, Checkbox, Input, Popover, Spin, Tooltip } from 'ant-design-vue';
import type { TooltipPlacement } from 'ant-design-vue/es/tooltip';
import { CloseCircleOutlined } from '@ant-design/icons-vue';
import botIconUrl from '@/assets/svg/bot.svg';
import editIconUrl from '@/assets/svg/edit-new.svg';
import { buildOnlineUserSearchQueryFilter, listUsers, searchUsers } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import type { AdminUser } from '@/types/admin';
import type { EntityRef } from '@/types/api';

const PAGE_SIZE_MEDIUM = 25;
const LIST_HEIGHT = 250;
const SCROLL_BOTTOM_THRESHOLD = 8;
const SEARCH_TYPING_INTERVAL_MS = 500;

export interface UserSelectableListPopoverProps {
  open?: boolean;
  placement?: TooltipPlacement;
  onOpenChange?: (open: boolean) => void;
}

const props = withDefaults(
  defineProps<{
    hasPermission: boolean;
    selectedUsers?: EntityRef[];
    onUpdate: (users: EntityRef[] | EntityRef) => Promise<void>;
    multiSelect?: boolean;
    filterCurrentUser?: boolean;
    includeBot?: boolean;
    onClose?: () => void;
    popoverProps?: UserSelectableListPopoverProps;
  }>(),
  {
    selectedUsers: () => [],
    multiSelect: true,
    filterCurrentUser: false,
    includeBot: false,
    onClose: undefined,
    popoverProps: undefined,
  },
);

const { t } = useI18n();
const authStore = useAuthStore();

function getEntityName(entity?: { name?: string; displayName?: string }): string {
  return entity?.displayName || entity?.name || '';
}

function toUserRef(user: AdminUser): EntityRef {
  return {
    id: user.id,
    type: 'user',
    name: user.name,
    displayName: user.displayName,
    fullyQualifiedName: user.fullyQualifiedName,
  };
}

const popupVisible = ref(false);
const isOpen = computed(() => props.popoverProps?.open ?? popupVisible.value);

function handleOpenChange(open: boolean): void {
  popupVisible.value = open;
  props.popoverProps?.onOpenChange?.(open);
}

const botUserIds = new Set<string>();

function seedBotsFromSelected(): void {
  (props.selectedUsers as Array<EntityRef & { isBot?: boolean }>).forEach((user) => {
    if (user.isBot && user.id) {
      botUserIds.add(user.id);
    }
  });
}

function trackBots(users: AdminUser[]): void {
  users.forEach((user) => {
    if (user.isBot && user.id) {
      botUserIds.add(user.id);
    }
  });
}

function removeCurrentUserFromList(list: EntityRef[]): EntityRef[] {
  if (!props.filterCurrentUser) {
    return list;
  }
  const currentId = authStore.user?.id;
  const index = list.findIndex((item) => item.id === currentId);
  if (index >= 0) {
    list.splice(index, 1);
  }
  return list;
}

interface FetchResult {
  data: EntityRef[];
  paging: { after?: string; total: number };
}

async function fetchUsersBySearch(searchText: string): Promise<FetchResult> {
  try {
    const page = await searchUsers(
      searchText,
      0,
      PAGE_SIZE_MEDIUM,
      props.includeBot ? undefined : buildOnlineUserSearchQueryFilter(),
    );
    if (props.includeBot) {
      trackBots(page.data);
    }
    return {
      data: removeCurrentUserFromList(page.data.map(toUserRef)),
      paging: { total: page.total ?? 0 },
    };
  } catch {
    return { data: [], paging: { total: 0 } };
  }
}

async function fetchUsersList(after?: string): Promise<FetchResult> {
  try {
    const page = await listUsers({
      limit: PAGE_SIZE_MEDIUM,
      after,
      ...(props.includeBot ? {} : { isBot: false }),
    });
    if (props.includeBot) {
      trackBots(page.data);
    }
    return {
      data: removeCurrentUserFromList(page.data.map(toUserRef)),
      paging: { after: page.after, total: page.total ?? 0 },
    };
  } catch {
    return { data: [], paging: { total: 0 } };
  }
}

async function fetchOptions(searchText: string, after?: string): Promise<FetchResult> {
  if (!after) {
    botUserIds.clear();
    if (props.includeBot) {
      seedBotsFromSelected();
    }
  }
  if (searchText) {
    return fetchUsersBySearch(searchText);
  }
  return fetchUsersList(after);
}

const listOptions = ref<EntityRef[]>([]);
const uniqueOptions = ref<EntityRef[]>([]);
const searchText = ref('');
const searchInput = ref('');
const pagingInfo = ref<{ after?: string; total: number }>({ total: 0 });
const fetching = ref(false);
const updating = ref(false);
const selectedItemsInternal = ref(new Map<string, EntityRef>());
const isFetchingNextPage = ref(false);
const requestGeneration = ref(0);
const latestSearch = ref(0);
const activeIndex = ref(0);
const listContainer = ref<HTMLElement | null>(null);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function seedSelected(): void {
  const map = new Map<string, EntityRef>();
  props.selectedUsers.forEach((item) => {
    if (item.id) {
      map.set(item.id, item);
    }
  });
  selectedItemsInternal.value = map;
}

function checkActiveSelectedItem(item: EntityRef): boolean {
  return (
    (item.id !== undefined && selectedItemsInternal.value.has(item.id)) ||
    selectedItemsInternal.value.has(item.name ?? '')
  );
}

function sortUniqueListFromSelectedList(
  items: Map<string, EntityRef>,
  options: EntityRef[],
): EntityRef[] {
  if (!items.size) {
    return options;
  }
  return [
    ...items.values(),
    ...options.filter((option) => !checkActiveSelectedItem(option)),
  ];
}

async function fetchListOptions(): Promise<void> {
  fetching.value = true;
  try {
    const { data, paging } = await fetchOptions('');
    listOptions.value = data;
    pagingInfo.value = paging;
    uniqueOptions.value = sortUniqueListFromSelectedList(selectedItemsInternal.value, data);
  } finally {
    fetching.value = false;
  }
}

async function handleSearch(search: string): Promise<void> {
  const searchId = ++latestSearch.value;
  const { data, paging } = await fetchOptions(search);
  if (searchId !== latestSearch.value) {
    return;
  }
  requestGeneration.value += 1;
  uniqueOptions.value = search
    ? data
    : sortUniqueListFromSelectedList(selectedItemsInternal.value, data);
  pagingInfo.value = paging;
  searchText.value = search;
}

function onSearchInput(value: string): void {
  searchInput.value = value;
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void handleSearch(value);
  }, SEARCH_TYPING_INTERVAL_MS);
}

async function onScroll(event: Event): Promise<void> {
  const target = event.currentTarget as HTMLElement;
  const nearBottom =
    target.scrollHeight - target.scrollTop - target.clientHeight <= SCROLL_BOTTOM_THRESHOLD;
  if (
    !nearBottom ||
    !pagingInfo.value.after ||
    uniqueOptions.value.length >= pagingInfo.value.total ||
    isFetchingNextPage.value
  ) {
    return;
  }
  isFetchingNextPage.value = true;
  const generation = requestGeneration.value;
  try {
    const { data, paging } = await fetchOptions(searchText.value, pagingInfo.value.after);
    if (generation !== requestGeneration.value) {
      return;
    }
    uniqueOptions.value = [...uniqueOptions.value, ...data];
    pagingInfo.value = paging;
  } finally {
    isFetchingNextPage.value = false;
  }
}

async function handleUpdate(updateItems: EntityRef[]): Promise<void> {
  updating.value = true;
  try {
    if (props.multiSelect) {
      await props.onUpdate(updateItems);
    } else {
      await props.onUpdate(updateItems[0]);
    }
  } finally {
    updating.value = false;
  }
  // Pin closes only its internal visibility here, not via the
  // controlled onOpenChange path.
  popupVisible.value = false;
}

function selectionHandler(item: EntityRef): void {
  if (props.multiSelect) {
    const next = new Map(selectedItemsInternal.value);
    const id = item.id ?? '';
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.set(id, item);
    }
    selectedItemsInternal.value = next;
  } else {
    void handleUpdate(checkActiveSelectedItem(item) ? [] : [item]);
  }
}

function handleUpdateClick(): void {
  void handleUpdate([...selectedItemsInternal.value.values()]);
}

function handleRemoveClick(): void {
  void handleUpdate([]);
}

function handleClearAllClick(): void {
  selectedItemsInternal.value = new Map();
}

function handleCancel(): void {
  handleOpenChange(false);
  props.onClose?.();
}

function resetAndFetch(): void {
  seedSelected();
  searchText.value = '';
  searchInput.value = '';
  listOptions.value = [];
  uniqueOptions.value = [];
  pagingInfo.value = { total: 0 };
  activeIndex.value = 0;
  if (props.includeBot) {
    seedBotsFromSelected();
  }
  void fetchListOptions();
}

watch(isOpen, (open) => {
  if (open) {
    resetAndFetch();
  }
});

watch(
  () => props.selectedUsers,
  () => {
    seedSelected();
  },
);

function onListKeydown(event: KeyboardEvent): void {
  const count = uniqueOptions.value.length;
  if (count === 0) {
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value =
      event.key === 'ArrowDown'
        ? Math.min(activeIndex.value + 1, count - 1)
        : Math.max(activeIndex.value - 1, 0);
    void nextTick(() => {
      listContainer.value
        ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex.value}"]`)
        ?.focus();
    });
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    activeIndex.value = event.key === 'Home' ? 0 : count - 1;
    void nextTick(() => {
      listContainer.value
        ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex.value}"]`)
        ?.focus();
    });
  } else if (event.key === 'Enter' || event.key === ' ') {
    const target = event.target as HTMLElement;
    const index = Number(target.dataset.optionIndex);
    if (!Number.isNaN(index) && uniqueOptions.value[index]) {
      event.preventDefault();
      selectionHandler(uniqueOptions.value[index]);
    }
  }
}
</script>

<template>
  <Popover
    :open="isOpen"
    :placement="popoverProps?.placement ?? 'bottomRight'"
    trigger="click"
    @open-change="handleOpenChange"
  >
    <template #content>
      <div data-testid="selectable-list" style="width: 320px">
        <div style="padding: 8px 12px 4px">
          <Input
            :value="searchInput"
            :placeholder="t('label.search-for-type', { type: t('label.user') })"
            @change="(event) => onSearchInput((event.target as HTMLInputElement).value)"
          />
        </div>
        <div style="position: relative">
          <div
            v-if="fetching || updating"
            style="display: flex; align-items: center; justify-content: center; padding: 16px 0"
          >
            <Spin size="small" />
          </div>
          <div
            v-if="!fetching && uniqueOptions.length === 0"
            style="padding: 16px 12px; font-size: 14px"
          >
            {{ t('message.no-data-available') }}
          </div>
          <ul
            v-if="uniqueOptions.length > 0"
            ref="listContainer"
            style="margin: 0; padding: 0 8px 8px; list-style: none; overflow-y: auto"
            :style="{ maxHeight: `${LIST_HEIGHT}px` }"
            @scroll="onScroll"
            @keydown="onListKeydown"
          >
            <li v-for="(item, index) in uniqueOptions" :key="item.id">
              <button
                type="button"
                data-testid="owner-option"
                :data-option-index="index"
                :tabindex="index === activeIndex ? 0 : -1"
                style="
                  display: flex;
                  width: 100%;
                  align-items: center;
                  justify-content: space-between;
                  padding: 8px;
                  border: 0;
                  border-radius: 6px;
                  cursor: pointer;
                  text-align: left;
                  background: transparent;
                "
                :style="{
                  background: checkActiveSelectedItem(item)
                    ? 'var(--sm-primary-bg, #e6f0f7)'
                    : 'transparent',
                }"
                @click.stop="selectionHandler(item)"
                @focus="activeIndex = index"
              >
                <span
                  style="display: flex; align-items: center; min-width: 0; flex: 1; gap: 8px"
                >
                  <template v-if="includeBot && item.id && botUserIds.has(item.id)">
                    <Tooltip :title="t('label.bot')">
                      <img
                        :src="botIconUrl"
                        :aria-label="t('label.bot')"
                        data-testid="bot-indicator"
                        alt=""
                        width="16"
                        height="16"
                      />
                    </Tooltip>
                  </template>
                  <Avatar size="small">{{ getEntityName(item).charAt(0).toUpperCase() }}</Avatar>
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                    {{ getEntityName(item) }}
                  </span>
                </span>
                <span style="display: flex; align-items: center; flex-shrink: 0; margin-left: 8px">
                  <Checkbox
                    v-if="multiSelect"
                    :checked="checkActiveSelectedItem(item)"
                    :tabindex="-1"
                  />
                  <Tooltip
                    v-else-if="checkActiveSelectedItem(item)"
                    :title="t('label.remove-entity', { entity: t('label.owner-lowercase') })"
                  >
                    <span
                      role="button"
                      tabindex="0"
                      data-testid="remove-owner"
                      style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                      "
                      @click.stop="handleRemoveClick"
                      @keydown.enter.stop="handleRemoveClick"
                      @keydown.space.stop.prevent="handleRemoveClick"
                    >
                      <CloseCircleOutlined />
                    </span>
                  </Tooltip>
                </span>
              </button>
            </li>
          </ul>
        </div>
        <div
          v-if="multiSelect"
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 12px;
            border-top: 1px solid var(--sm-border, #e5e5e5);
          "
        >
          <Button type="link" size="small" data-testid="clear-all-button" @click="handleClearAllClick">
            {{ t('label.clear-entity', { entity: t('label.all-lowercase') }) }}
          </Button>
          <div style="display: flex; align-items: center; gap: 8px">
            <Button size="small" data-testid="cancel-button" @click="handleCancel">
              {{ t('label.cancel') }}
            </Button>
            <Button
              type="primary"
              size="small"
              data-testid="selectable-list-update-btn"
              :loading="updating"
              @click="handleUpdateClick"
            >
              {{ t('label.update') }}
            </Button>
          </div>
        </div>
      </div>
    </template>
    <slot>
      <Tooltip :title="hasPermission ? undefined : t('message.no-permission-for-action')">
        <span style="display: inline-flex">
          <Button
            type="text"
            size="small"
            :disabled="!hasPermission"
            data-testid="add-user"
            :aria-label="t('label.user')"
          >
            <img :src="editIconUrl" alt="" width="16" height="16" />
          </Button>
        </span>
      </Tooltip>
    </slot>
  </Popover>
</template>
