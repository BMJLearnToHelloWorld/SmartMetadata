<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input, Select, Tooltip, message } from 'ant-design-vue';
import { RobotOutlined } from '@ant-design/icons-vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import ReferenceListCell from '@/components/shared/ReferenceListCell.vue';
import SmTable from '@/components/shared/SmTable.vue';
import UserPopOverCard from '@/components/shared/UserPopOverCard.vue';
import {
  ONLINE_USERS_TIME_WINDOWS,
  ONLINE_USER_ACTIVITY_COLORS,
  onlineUsersWindowFromKey,
} from '@/catalog/insightsTabs';
import {
  buildOnlineUserSearchQueryFilter,
  listOnlineUsers,
  searchUsers,
} from '@/api/users';
import { usePermissionStore } from '@/stores/permissions';
import type { AdminUser } from '@/types/admin';
import { PAGE_SIZE_BASE } from '@/utils/pagination';
import { getRoleWithFqnPath, getTeamsWithFqnPath, getUserPath } from '@/utils/fqnPaths';
import { onlineUsersColumns } from '../admin/membersColumns';
import {
  filterOnlineUsersByWindow,
  formatAbsoluteDateTime,
  getOnlineActivityCell,
} from '../admin/userLogic';

/**
 * Online Users (pin OnlineUsersPage, 355 lines). Page-level isAdminUser
 * check renders the shared PermissionPlaceholder with NO permissionValue
 * (R-M3: the pin call site passes none and uses the default). No pager
 * ever (pin comment "Add pagination component here if needed"); one
 * page of PAGE_SIZE_BASE (15, R-M4). The breadcrumb (Settings > Members
 * > Online Users) comes from the shell §9 constructor; the route move
 * into the settings space is an integration request (this file still
 * mounts at /insights/online-users).
 */

const { t } = useI18n();
const isAdminUser = computed(() => usePermissionStore().isAdminUser);

const loading = ref(false);
const users = ref<AdminUser[]>([]);
const windowKey = ref(onlineUsersWindowFromKey(undefined).key);
const searchInput = ref('');
const searchValue = ref('');

const timeWindow = computed(() => onlineUsersWindowFromKey(windowKey.value).minutes);
const windowOptions = computed(() =>
  ONLINE_USERS_TIME_WINDOWS.map((window) => ({ value: window.key, label: t(window.labelKey) })),
);
const columns = computed(() =>
  onlineUsersColumns({
    username: t('label.username'),
    name: t('label.name'),
    lastActivity: t('label.last-activity'),
    teams: t('label.team-plural'),
    roles: t('label.role-plural'),
  }),
);
const searching = computed(() => searchValue.value.trim().length > 0);
const emptyDescription = computed(() =>
  searching.value
    ? t('message.no-entity-found-for-name', {
        entity: t('label.user-lowercase'),
        name: searchValue.value,
      })
    : t('message.no-online-users-found'),
);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSeq = 0;

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const page = await listOnlineUsers({
      timeWindow: timeWindow.value,
      fields: 'profile,teams,roles,lastLoginTime,lastActivityTime',
      limit: PAGE_SIZE_BASE,
    });
    users.value = page.data;
  } catch (error) {
    users.value = [];
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function runSearch(): Promise<void> {
  const id = ++searchSeq;
  const term = searchValue.value;
  if (!term) {
    void loadList();
    return;
  }
  loading.value = true;
  try {
    // Raw query text (no * wrapping) + explicit isBot:false filter.
    const page = await searchUsers(
      term,
      0,
      PAGE_SIZE_BASE,
      buildOnlineUserSearchQueryFilter(),
    );
    if (id !== searchSeq) {
      return;
    }
    users.value = filterOnlineUsersByWindow(page.data, timeWindow.value);
  } catch (error) {
    if (id === searchSeq) {
      users.value = [];
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  } finally {
    if (id === searchSeq) {
      loading.value = false;
    }
  }
}

watch(searchInput, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchValue.value = value.trim();
    void runSearch();
  }, 400);
});

watch(timeWindow, () => {
  if (!isAdminUser.value) {
    return;
  }
  if (searching.value) {
    void runSearch();
  } else {
    void loadList();
  }
});

onMounted(() => {
  // Pin OnlineUsersPage.tsx:179-185: the list fetch runs only for admins.
  if (isAdminUser.value) {
    void loadList();
  }
});

function activityText(user: AdminUser): { relative: string; absolute?: string; color: string } {
  const cell = getOnlineActivityCell(user);
  const color = ONLINE_USER_ACTIVITY_COLORS[cell.band];
  if (cell.band === 'never') {
    return { relative: t('label.never'), color };
  }
  const relative =
    cell.band === 'now'
      ? t('label.online-now')
      : cell.band === 'recent'
        ? t('label.n-minutes-ago', { count: cell.diffMinutes })
        : cell.band === 'hours'
          ? t('label.n-hours-ago', { count: cell.diffHours })
          : t('label.n-days-ago', { count: cell.diffDays });
  return {
    relative,
    absolute: cell.activityTime ? formatAbsoluteDateTime(cell.activityTime) : undefined,
    color,
  };
}

function userDetailPath(user: AdminUser): string {
  return getUserPath(user.fullyQualifiedName ?? user.name);
}
</script>

<template>
  <div class="online-users-view">
    <PermissionPlaceholder v-if="!isAdminUser" test-id="permission-placeholder" />
    <template v-else>
      <PageHeader
        :header="t('label.online-user-plural')"
        :sub-header="t('message.page-sub-header-for-online-users')"
        test-id="online-users-page-header"
      />
      <div class="online-users-view__controls">
        <Select
          :value="windowKey"
          data-testid="online-users-window"
          style="width: 200px"
          :options="windowOptions"
          @change="(value) => { windowKey = value as string; }"
        />
        <Input
          v-model:value="searchInput"
          allow-clear
          data-testid="online-users-search"
          style="width: 260px"
          :placeholder="`${t('label.search-for-type', { type: t('label.user') })}...`"
        />
      </div>
      <NoSearchResultsPlaceholder
        v-if="!loading && users.length === 0"
        test-id="search-error-placeholder"
        :description="emptyDescription"
      />
      <SmTable
        v-else
        :columns="columns"
        :data-source="users"
        row-key="id"
        size="small"
        :loading="loading"
        :pagination="false"
        test-id="online-users-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'username'">
            <span class="online-users-view__username">
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
          <template v-else-if="column.key === 'lastActivityTime'">
            <div class="online-users-view__activity">
              <span :style="{ color: activityText(record as AdminUser).color }">
                {{ activityText(record as AdminUser).relative }}
              </span>
              <span
                v-if="activityText(record as AdminUser).absolute"
                class="online-users-view__activity-absolute"
              >
                {{ activityText(record as AdminUser).absolute }}
              </span>
            </div>
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
        </template>
      </SmTable>
      <!-- Pagination placeholder only: the pin leaves an empty div here
           ("Add pagination component here if needed"). Never add a pager. -->
      <div />
    </template>
  </div>
</template>

<style scoped>
.online-users-view__controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-block: 12px;
}
.online-users-view__username {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.online-users-view__activity {
  display: flex;
  flex-direction: column;
}
.online-users-view__activity-absolute {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
</style>
