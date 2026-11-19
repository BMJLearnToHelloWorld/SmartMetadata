<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Input, Switch, Tooltip, message } from 'ant-design-vue';
import { DeleteOutlined, RobotOutlined, UndoOutlined } from '@ant-design/icons-vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import DeleteEntityModal from '@/features/crud/DeleteEntityModal.vue';
import FormModal from '@/components/shared/FormModal.vue';
import LimitWrapper from '@/components/shared/LimitWrapper.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import ReferenceListCell from '@/components/shared/ReferenceListCell.vue';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import SmTable from '@/components/shared/SmTable.vue';
import UserPopOverCard from '@/components/shared/UserPopOverCard.vue';
import { useCursorPagedList } from '@/composables/useCursorPagedList';
import type { DeleteType } from '@/ingestion/serviceDelete';
import {
  buildSettingsBreadcrumbCatalog,
  getSettingPageBreadcrumbs,
  toSmBreadcrumbItems,
} from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  type SettingsTranslator,
} from '@/settings/registry';
import type { Paging } from '@/utils/pagination';
import { splitTransElement } from '@/utils/emptyPlaceholder';
import {
  getRoleWithFqnPath,
  getSettingPath,
  getTeamsWithFqnPath,
  getUserPath,
} from '@/utils/fqnPaths';
import {
  buildUserSearchQueryFilter,
  deactivateUser,
  listUsers,
  restoreUser,
  searchUsers,
} from '@/api/users';
import { usePermissionStore } from '@/stores/permissions';
import { useAuthStore } from '@/stores/auth';
import type { AdminUser } from '@/types/admin';
import { userListColumns } from './membersColumns';

/**
 * Users / Admins list (pin UserListPageV1, 623 lines). One component,
 * two states: isAdminPage comes from the route (current dual routes
 * admin-users/admin-admins; the future settings paths keep the same
 * route names per §1, so the name check survives the migration).
 *
 * P4 deletions: no Bots checkbox, no email/isAdmin/isBot columns, no
 * three-state filter. The list and the search always carry isBot:false
 * explicitly. The top Tabs control is deleted (A08); the deleted
 * filter is a two-state Toggle that resets to page 1 and KEEPS the
 * search value (the pin's "Clear search value" comment is stale).
 *
 * No shell mechanism provides a breadcrumb (AppShell renders none), so
 * this view builds its own from the §9 catalog helpers and renders it
 * via <SmBreadcrumb> below, following the RolesListView pattern. The
 * tab-segment validation (illegal tab -> NOT_FOUND) belongs to the future
 * segment route and is a route-shape concern for the integration line.
 */

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const isAdminUser = computed(() => usePermissionStore().isAdminUser);
const isAdminPage = computed(
  () => route.name === 'admin-admins' || route.params.tab === 'admins',
);
const isDeleted = ref(false);
const searchInput = ref('');
const searchValue = ref('');
const searchPage = ref(1);
const searchResults = ref<AdminUser[]>([]);
const searchTotal = ref(0);
const searchLoading = ref(false);
const limitKey = ref(0);

const searching = computed(() => searchValue.value.trim().length > 0);

const header = computed(() =>
  isAdminPage.value
    ? { title: t('label.admin-plural'), sub: t('message.page-sub-header-for-admins') }
    : { title: t('label.user-plural'), sub: t('message.page-sub-header-for-users') },
);
const columns = computed(() =>
  userListColumns(
    {
      username: t('label.username'),
      name: t('label.name'),
      teams: t('label.team-plural'),
      roles: t('label.role-plural'),
      actions: t('label.action-plural'),
    },
    isAdminPage.value,
  ),
);

/**
 * Cursor-paged list mode. T-5 persistence is opt-in on the hook: the
 * initial size is read from storage and size changes write back
 * (gated to 15/25/50 by the helper). While searching, the fetch
 * function short-circuits without a network call — the search path
 * below owns the table then — and the resetKey restart refetches the
 * list when the search clears.
 */
// Breadcrumb (RolesListView pattern): no shell mechanism renders one,
// so the view builds its own from the §9 catalog helpers (adapted from
// the pre-rebase breadcrumb construction) and renders it via
// <SmBreadcrumb> below.
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const usersRegistryEntry = findSettingsRegistryItem('members.users');
if (!usersRegistryEntry) {
  throw new Error('Missing settings registry entry: members.users');
}
const adminsRegistryEntry = findSettingsRegistryItem('members.admins');
if (!adminsRegistryEntry) {
  throw new Error('Missing settings registry entry: members.admins');
}
const breadcrumbs = computed(() =>
  getSettingPageBreadcrumbs(
    buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
    resolveSettingsLocation,
    'members',
    registryTitle(settingsTranslator, isAdminPage.value ? adminsRegistryEntry : usersRegistryEntry),
  ),
);
const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => toSmBreadcrumbItems(breadcrumbs.value));

const list = useCursorPagedList<AdminUser>(
  async (params) => {
    if (searching.value) {
      return { data: [], paging: { total: 0 } as Paging };
    }
    const page = await listUsers({
      limit: params.limit,
      after: params.after,
      before: params.before,
      isAdmin: isAdminPage.value,
      isBot: false,
      include: isDeleted.value ? 'deleted' : 'non-deleted',
      fields: 'profile,teams,roles',
    });
    return {
      data: page.data,
      paging: { after: page.after, before: page.before, total: page.total ?? 0 },
    };
  },
  {
    persistence: { storage: localStorage, userName: () => useAuthStore().user?.name },
    resetKey: () => [isAdminPage.value, isDeleted.value, searching.value],
    onError: (error) => message.error(error instanceof Error ? error.message : t('crud.loadFailed')),
  },
);

// --- Search (pin: typingInterval 350, *text* wrap, freshness guard) ---
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSeq = 0;

watch(searchInput, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchValue.value = value.trim();
    searchPage.value = 1;
  }, 350);
});

async function runSearch(): Promise<void> {
  const id = ++searchSeq;
  const term = searchValue.value;
  if (!term) {
    searchResults.value = [];
    searchTotal.value = 0;
    return;
  }
  searchLoading.value = true;
  try {
    const page = await searchUsers(
      `*${term}*`,
      (searchPage.value - 1) * list.pageSize.value,
      list.pageSize.value,
      buildUserSearchQueryFilter(isAdminPage.value),
      { includeDeleted: isDeleted.value },
    );
    if (id !== searchSeq) {
      return;
    }
    searchResults.value = page.data;
    searchTotal.value = page.total ?? 0;
  } catch (error) {
    if (id === searchSeq) {
      searchResults.value = [];
      searchTotal.value = 0;
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  } finally {
    if (id === searchSeq) {
      searchLoading.value = false;
    }
  }
}

watch(
  [searchValue, searchPage, () => list.pageSize.value, isDeleted, isAdminPage],
  () => {
    if (searching.value) {
      void runSearch();
    }
  },
);

const rows = computed(() => (searching.value ? searchResults.value : list.items.value));
const loading = computed(() => (searching.value ? searchLoading.value : list.isLoading.value));

function onDeletedToggle(value: boolean): void {
  isDeleted.value = value;
  // Page 1, search value kept (pin setFilters merge semantics).
  searchPage.value = 1;
  void list.onPageChange(1);
}

function onAddUser(): void {
  // Pin navigates to /create-user with route state {isAdminPage}; the
  // state form is preserved (never a query param).
  void router.push({ path: '/create-user', state: { isAdminPage: isAdminPage.value } });
}

function refreshLimit(): void {
  // No force-refresh function exists in api/limits.ts; remounting the
  // LimitWrapper refetches the resource limit (the pin's
  // getResourceLimit('user', true, true) equivalent available here).
  limitKey.value += 1;
}

// --- Row actions (admin-only, disabled + tooltip) ---
const selectedUser = ref<AdminUser | undefined>();
const showRestoreModal = ref(false);
const showDeleteModal = ref(false);
const actionLoading = ref(false);

function openRestore(user: AdminUser): void {
  selectedUser.value = user;
  showRestoreModal.value = true;
}

function openDelete(user: AdminUser): void {
  selectedUser.value = user;
  showDeleteModal.value = true;
}

function clearSearch(): void {
  searchInput.value = '';
  searchValue.value = '';
  searchPage.value = 1;
}

async function handleRestore(): Promise<void> {
  const user = selectedUser.value;
  if (!user) {
    return;
  }
  actionLoading.value = true;
  try {
    await restoreUser(user.id);
    // Pin handleReactiveUser: clear the search, toast, refetch.
    clearSearch();
    message.success(t('message.entity-restored-success', { entity: t('label.user') }));
    showRestoreModal.value = false;
    selectedUser.value = undefined;
    await list.onPageChange(1);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    actionLoading.value = false;
  }
}

async function handleDelete(deleteType: DeleteType): Promise<void> {
  const user = selectedUser.value;
  if (!user) {
    return;
  }
  actionLoading.value = true;
  try {
    await deactivateUser(user.id, {
      hardDelete: deleteType === 'hard-delete',
      recursive: false,
    });
    // Pin DeleteEntityModal afterDeleteAction: clear the search and
    // refresh the limit.
    clearSearch();
    refreshLimit();
    showDeleteModal.value = false;
    selectedUser.value = undefined;
    await list.onPageChange(1);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  } finally {
    actionLoading.value = false;
  }
}

// --- Empty states ---
const showCreatePlaceholder = computed(
  () => rows.value.length === 0 && !isDeleted.value && !loading.value && !searching.value,
);
const showSearchPlaceholder = computed(
  () => rows.value.length === 0 && !loading.value && !showCreatePlaceholder.value,
);
const crossLinkMessage = computed(() => {
  const key = searching.value
    ? isAdminPage.value
      ? 'message.no-admin-available-with-name'
      : 'message.no-user-available-with-name'
    : isAdminPage.value
      ? 'message.no-admin-available-with-filters'
      : 'message.no-user-available-with-filters';
  return t(key, { searchText: searchValue.value });
});
const crossLinkParts = computed(() => splitTransElement(crossLinkMessage.value));
const crossLinkTo = computed(() =>
  getSettingPath('members', isAdminPage.value ? 'users' : 'admins'),
);

function userDetailPath(user: AdminUser): string {
  return getUserPath(user.fullyQualifiedName ?? user.name);
}
</script>

<template>
  <div class="users-list-view">
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader
      :header="header.title"
      :sub-header="header.sub"
      learning-page-id="USERS"
      test-id="users-page-header"
    />
    <div class="users-list-view__controls">
      <Input
        v-model:value="searchInput"
        allow-clear
        :placeholder="`${t('label.search-for-type', { type: t('label.user') })}...`"
        data-testid="users-search"
        class="users-list-view__search"
      />
      <span class="users-list-view__deleted-toggle">
        <Switch
          :checked="isDeleted"
          data-testid="show-deleted-toggle"
          @change="onDeletedToggle(Boolean($event))"
        />
        <span>{{ t('label.deleted') }}</span>
      </span>
      <LimitWrapper v-if="isAdminUser" :key="limitKey" resource="user">
        <Button type="primary" data-testid="add-user" @click="onAddUser">
          {{
            t('label.add-entity', {
              entity: isAdminPage ? t('label.admin') : t('label.user'),
            })
          }}
        </Button>
      </LimitWrapper>
    </div>

    <CreatePlaceholder
      v-if="showCreatePlaceholder"
      :permission="isAdminUser"
      :heading="t('label.user')"
      :permission-value="t('label.create-entity', { entity: t('label.user') })"
      :on-create="onAddUser"
      :test-id="`create-error-placeholder-${t('label.user')}`"
    />
    <NoSearchResultsPlaceholder
      v-else-if="showSearchPlaceholder"
      test-id="search-error-placeholder"
    >
      <template #description>
        <template v-if="crossLinkParts"
          >{{ crossLinkParts.before
          }}<RouterLink :to="crossLinkTo">{{ crossLinkParts.inner }}</RouterLink
          >{{ crossLinkParts.after }}</template
        >
        <template v-else>{{ crossLinkMessage }}</template>
      </template>
    </NoSearchResultsPlaceholder>
    <SmTable
      v-else
      :columns="columns"
      :data-source="rows"
      row-key="id"
      size="small"
      :loading="loading"
      :pagination="false"
      test-id="admin-users-table"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'username'">
          <span class="users-list-view__username">
            <Tooltip v-if="(record as AdminUser).isBot" :title="t('label.bot')">
              <RobotOutlined data-testid="bot-icon" :style="{ fontSize: '16px' }" />
            </Tooltip>
            <UserPopOverCard
              v-if="(record as AdminUser).name"
              :user-name="(record as AdminUser).name"
              :display-name="(record as AdminUser).displayName"
              show-user-name
              :profile-width="16"
              :to="userDetailPath(record as AdminUser)"
            />
            <template v-else>{{ getEntityName(record as AdminUser) }}</template>
          </span>
        </template>
        <template v-else-if="column.key === 'name'">
          {{ getEntityName(record as AdminUser) }}
        </template>
        <template v-else-if="column.key === 'teams'">
          <template v-if="!(record as AdminUser).teams?.length">
            {{ t('label.no-entity', { entity: t('label.team') }) }}
          </template>
          <ReferenceListCell
            v-else
            :references="(record as AdminUser).teams"
            :has-view-permission="true"
            :path-for="(ref) => getTeamsWithFqnPath(ref.fullyQualifiedName ?? ref.name ?? '')"
          />
          <!-- Pin Users.util renders these links without a permission
               branch on this surface; hasViewPermission=true preserves
               that (the cell's degraded branch serves other callers). -->
        </template>
        <template v-else-if="column.key === 'roles'">
          <template v-if="!(record as AdminUser).roles?.length">
            {{ t('label.no-entity', { entity: t('label.role') }) }}
          </template>
          <ReferenceListCell
            v-else
            :references="(record as AdminUser).roles"
            :has-view-permission="true"
            :path-for="(ref) => getRoleWithFqnPath(ref.fullyQualifiedName ?? ref.name ?? '')"
          />
        </template>
        <template v-else-if="column.key === 'actions'">
          <span class="users-list-view__actions">
            <Tooltip
              v-if="isDeleted"
              :title="
                isAdminUser
                  ? t('label.restore-entity', { entity: t('label.user') })
                  : t('message.admin-only-action')
              "
            >
              <Button
                type="text"
                size="small"
                :disabled="!isAdminUser"
                :data-testid="`restore-user-btn-${(record as AdminUser).name}`"
                @click="openRestore(record as AdminUser)"
              >
                <UndoOutlined />
              </Button>
            </Tooltip>
            <Tooltip
              :title="
                isAdminUser
                  ? t('label.delete-entity', { entity: t('label.user') })
                  : t('message.admin-only-action')
              "
            >
              <Button
                type="text"
                size="small"
                danger
                :disabled="!isAdminUser"
                :data-testid="`delete-user-btn-${(record as AdminUser).name}`"
                @click="openDelete(record as AdminUser)"
              >
                <DeleteOutlined />
              </Button>
            </Tooltip>
          </span>
        </template>
      </template>
    </SmTable>

    <NextPrevious
      v-if="!searching"
      :paging="list.paging.value"
      :paging-handler="({ currentPage }) => list.onPageChange(currentPage)"
      :page-size="list.pageSize.value"
      :current-page="list.page.value"
      :is-loading="list.isLoading.value"
      :on-show-size-change="list.onPageSizeChange"
    />
    <NextPrevious
      v-else
      :paging="{ total: searchTotal }"
      :paging-handler="({ currentPage }) => { searchPage = currentPage; }"
      :page-size="list.pageSize.value"
      :current-page="searchPage"
      :is-number-based="true"
      :is-loading="searchLoading"
      :on-show-size-change="list.onPageSizeChange"
    />

    <FormModal
      :open="showRestoreModal"
      :title="t('label.restore-entity', { entity: t('label.user') })"
      :ok-text="t('label.restore')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="actionLoading"
      test-id="restore-user-modal"
      @ok="handleRestore"
      @cancel="showRestoreModal = false; selectedUser = undefined"
    >
      <p>
        {{
          t('message.are-you-want-to-restore', {
            entity: selectedUser ? getEntityName(selectedUser) : '',
          })
        }}
      </p>
    </FormModal>
    <DeleteEntityModal
      :open="showDeleteModal"
      :entity-name="selectedUser ? getEntityName(selectedUser) : ''"
      :entity-type-label="t('label.user')"
      :allow-soft-delete="!isDeleted"
      :loading="actionLoading"
      @cancel="showDeleteModal = false; selectedUser = undefined"
      @confirm="handleDelete"
    />
  </div>
</template>

<style scoped>
.users-list-view__controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
}
.users-list-view__search {
  width: 320px;
}
.users-list-view__deleted-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.users-list-view__username {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.users-list-view__actions {
  display: inline-flex;
  gap: 4px;
}
</style>
