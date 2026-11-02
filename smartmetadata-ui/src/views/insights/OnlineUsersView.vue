<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, InputSearch, Select, Spin } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { listOnlineUsers, searchUsers } from '@/api/users';
import {
  ONLINE_USERS_TIME_WINDOWS,
  ONLINE_USER_ACTIVITY_COLORS,
  onlineUserActivityBand,
  onlineUsersWindowFromKey,
} from '@/catalog/insightsTabs';
import type { AdminUser } from '@/types/admin';

/**
 * Official OnlineUsersPage, product scope. Activity bands and status colours
 * are the official values (green #52c41a / yellow #faad14 / red #ff4d4f).
 * Admin gating is residual: the product session has no role field, so the
 * page states that plainly instead of faking a permission check. Search
 * results carry no activity timestamp, so their activity cell says so
 * instead of inventing an online state.
 */
const { t } = useI18n();

const loading = ref(false);
const errorMessage = ref('');
const users = ref<AdminUser[]>([]);
const windowKey = ref(onlineUsersWindowFromKey(undefined).key);
const searchQuery = ref('');
const searchMode = ref(false);

const windowOptions = computed(() =>
  ONLINE_USERS_TIME_WINDOWS.map((window) => ({ value: window.key, label: t(window.labelKey) })),
);

const columns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.email'), dataIndex: 'email', key: 'email' },
  { title: t('crud.teams'), key: 'teams' },
  { title: t('crud.roles'), key: 'roles' },
  { title: t('insights.onlineUsers.lastActivity'), key: 'lastActivity' },
]);

function refNames(refs: AdminUser['teams']): string {
  const names = refs.map((ref) => ref.displayName || ref.name).filter(Boolean);
  return names.join(', ') || '—';
}

function userRowKey(row: AdminUser): string {
  return row.id || row.name;
}

function activityMinutes(user: AdminUser): number | undefined {
  const ts = user.lastActivityTime ?? user.lastLoginTime;
  return ts === undefined ? undefined : Math.floor((Date.now() - ts) / 60000);
}

function activityColor(user: AdminUser): string {
  return ONLINE_USER_ACTIVITY_COLORS[onlineUserActivityBand(activityMinutes(user))];
}

function activityText(user: AdminUser): string {
  const ts = user.lastActivityTime ?? user.lastLoginTime;
  if (ts === undefined) {
    return t('insights.onlineUsers.noActivityTime');
  }
  return new Date(ts).toLocaleString();
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  searchMode.value = false;
  try {
    const page = await listOnlineUsers({
      timeWindow: onlineUsersWindowFromKey(windowKey.value).minutes,
    });
    users.value = page.data;
  } catch (error) {
    users.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('insights.onlineUsers.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onSearch(value: string): Promise<void> {
  searchQuery.value = value;
  if (!value.trim()) {
    await load();
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  searchMode.value = true;
  try {
    const page = await searchUsers(value);
    users.value = page.data;
  } catch (error) {
    users.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('insights.onlineUsers.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onWindowChange(value: string): void {
  windowKey.value = value;
  void load();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout test-id="online-users-layout">
    <PageHeader :header="t('insights.onlineUsers.title')" :sub-header="t('insights.onlineUsers.lead')" />
    <Alert type="warning" show-icon :message="t('insights.onlineUsers.adminResidual')" class="online-users__alert" />
    <Spin :spinning="loading">
      <div class="online-users__controls">
        <Select
          :value="windowKey"
          data-testid="online-users-window"
          style="width: 200px"
          :options="windowOptions"
          @change="(value) => onWindowChange(value as string)"
        />
        <InputSearch
          v-model:value="searchQuery"
          data-testid="online-users-search"
          style="width: 260px"
          :placeholder="t('insights.onlineUsers.searchPlaceholder')"
          @search="onSearch"
        />
      </div>
      <SmState
        v-if="errorMessage"
        state="error"
        test-id="online-users-state"
        :error-text="errorMessage"
        show-retry
        @retry="load"
      />
      <SmState
        v-else-if="!loading && users.length === 0"
        state="empty"
        test-id="online-users-state"
        :empty-text="searchMode ? t('insights.onlineUsers.searchEmpty') : t('insights.onlineUsers.empty')"
      />
      <SmTable
        v-else
        test-id="online-users-table"
        :columns="columns"
        :data-source="users"
        :row-key="userRowKey"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">{{ record.displayName || record.name }}</template>
          <template v-else-if="column.key === 'email'">{{ record.email || '—' }}</template>
          <template v-else-if="column.key === 'teams'">{{ refNames(record.teams) }}</template>
          <template v-else-if="column.key === 'roles'">{{ refNames(record.roles) }}</template>
          <template v-else-if="column.key === 'lastActivity'">
            <span :style="{ color: activityColor(record as AdminUser) }">{{ activityText(record as AdminUser) }}</span>
          </template>
        </template>
      </SmTable>
    </Spin>
  </PageLayout>
</template>

<style scoped>
.online-users__alert {
  margin-block: 12px;
}
.online-users__controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-block: 12px;
}
</style>
