<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Dropdown, Input, Layout, Menu, Select, Space, message } from 'ant-design-vue';
import { filtersFromQuery, searchRouteQuery } from '@/catalog/searchQuery';
import { setAppLocale } from '@/i18n';
import { isSupportedLocale } from '@/i18n/localePreference';
import { isNavSectionKey, NAV_ENTRIES, sectionKeyForRoute, selectedNavKey } from '@/layouts/nav';
import { navIcon } from '@/layouts/navIcons';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t, locale } = useI18n();

const collapsed = ref(false);
const openKeys = ref<string[]>([]);

const selectedKeys = computed(() => [selectedNavKey(route.name)]);

const displayName = computed(() => auth.displayName || t('chrome.signedIn'));
const profileUserId = computed(() => auth.user?.id || '');

onMounted(() => {
  if (auth.isAuthenticated) {
    void auth.refreshUser().catch(() => undefined);
  }
});

watch(
  () => route.name,
  (name) => {
    const section = sectionKeyForRoute(name);
    if (section && !openKeys.value.includes(section)) {
      openKeys.value = [...openKeys.value, section];
    }
  },
  { immediate: true },
);

function onMenuClick({ key }: { key: string | number }): void {
  const name = String(key);
  if (isNavSectionKey(name)) {
    return;
  }
  void router.push({ name });
}

function onSearch(value: string): void {
  const nextQuery = value.trim();
  if (route.name === 'search') {
    void router.push({
      name: 'search',
      query: searchRouteQuery(nextQuery, filtersFromQuery(route.query), 0),
    });
    return;
  }
  void router.push({ name: 'search', query: searchRouteQuery(nextQuery, {}, 0) });
}

function onLocaleChange(value: unknown): void {
  if (isSupportedLocale(value)) {
    setAppLocale(value, locale);
  }
}

function popupParent(node: HTMLElement): HTMLElement {
  return node.parentElement ?? document.body;
}

function onUserMenu({ key }: { key: string | number }): void {
  const action = String(key);
  if (action === 'profile' && profileUserId.value) {
    void router.push({ name: 'admin-user', params: { id: profileUserId.value } });
    return;
  }
  if (action === 'settings') {
    void router.push({ name: 'admin-settings' });
    return;
  }
  if (action === 'logout') {
    void onLogout();
  }
}

async function onLogout(): Promise<void> {
  try {
    await auth.logout();
  } catch (error) {
    message.warning(error instanceof Error ? error.message : t('chrome.logoutFailed'));
    auth.forgetLocalSession();
  }
  await router.push({ name: 'login' });
}
</script>

<template>
  <Layout class="shell">
    <Layout.Sider
      v-model:collapsed="collapsed"
      class="shell__sider"
      breakpoint="lg"
      collapsible
      :collapsed-width="64"
      :width="220"
      theme="dark"
    >
      <div class="shell__brand" :class="{ 'shell__brand--collapsed': collapsed }">
        <span class="shell__brand-name">{{ collapsed ? 'SM' : t('product.name') }}</span>
        <span v-if="!collapsed" class="shell__brand-sub">{{ t('product.subtitle') }}</span>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        :inline-collapsed="collapsed"
        :selected-keys="selectedKeys"
        v-model:openKeys="openKeys"
        @click="onMenuClick"
      >
        <template v-for="entry in NAV_ENTRIES" :key="entry.key">
          <Menu.Item v-if="entry.kind === 'item'" :key="entry.key">
            <template #icon>
              <component :is="navIcon(entry.key)" />
            </template>
            {{ t(entry.titleKey) }}
          </Menu.Item>
          <Menu.SubMenu v-else :key="entry.key" :data-testid="entry.testId">
            <template #icon>
              <component :is="navIcon(entry.key)" />
            </template>
            <template #title>{{ t(entry.titleKey) }}</template>
            <Menu.Item v-for="item in entry.items" :key="item.key" :data-testid="item.testId">
              {{ t(item.titleKey) }}
            </Menu.Item>
          </Menu.SubMenu>
        </template>
      </Menu>
    </Layout.Sider>
    <Layout>
      <Layout.Header class="shell__header">
        <Input.Search
          data-testid="global-search"
          class="shell__search"
          :placeholder="t('chrome.searchPlaceholder')"
          allow-clear
          size="small"
          :default-value="typeof route.query.q === 'string' ? route.query.q : ''"
          @search="onSearch"
        />
        <Space size="small" class="shell__toolbar">
          <Select
            data-testid="locale-switcher"
            size="small"
            class="shell__locale"
            :value="locale"
            :aria-label="t('chrome.locale')"
            @change="onLocaleChange"
          >
            <Select.Option value="en-US">{{ t('chrome.localeEn') }}</Select.Option>
            <Select.Option value="zh-CN">{{ t('chrome.localeZh') }}</Select.Option>
          </Select>
          <Dropdown
            :trigger="['click']"
            :get-popup-container="popupParent"
          >
            <Button data-testid="user-menu-trigger" size="small" :aria-label="t('chrome.userMenu')">
              {{ displayName }}
            </Button>
            <template #overlay>
              <Menu data-testid="user-menu" @click="onUserMenu">
                <Menu.Item v-if="profileUserId" key="profile" data-testid="user-profile-item">
                  {{ t('chrome.viewProfile') }}
                </Menu.Item>
                <Menu.Item key="settings" data-testid="user-settings-item">
                  {{ t('chrome.settings') }}
                </Menu.Item>
                <Menu.Item key="logout" data-testid="logout-button">
                  {{ t('chrome.logout') }}
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
        </Space>
      </Layout.Header>
      <Layout.Content class="shell__content">
        <router-view />
      </Layout.Content>
    </Layout>
  </Layout>
</template>

<style scoped>
.shell {
  min-height: 100%;
}
.shell__sider {
  min-height: 100vh;
}
.shell__sider :deep(.ant-layout-sider-trigger) {
  height: 36px;
  line-height: 36px;
}
.shell__sider :deep(.ant-menu-item),
.shell__sider :deep(.ant-menu-submenu-title) {
  height: 36px;
  line-height: 36px;
  margin-inline: 8px;
  width: calc(100% - 16px);
}
.shell__brand {
  display: flex;
  flex-direction: column;
  gap: 0;
  color: #fff;
  padding: 12px 16px 8px;
  min-height: 52px;
}
.shell__brand--collapsed {
  align-items: center;
  padding: 12px 8px 8px;
}
.shell__brand-name {
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1.2;
  font-size: 15px;
}
.shell__brand-sub {
  color: rgba(255, 255, 255, 0.65);
  font-size: 11px;
  line-height: 1.3;
  margin-top: 2px;
}
.shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 48px;
  line-height: 48px;
  background: #fff;
  padding-inline: 16px;
  border-bottom: 1px solid #e5e7eb;
}
.shell__search {
  max-width: 520px;
  flex: 1;
}
.shell__toolbar {
  flex-shrink: 0;
}
.shell__locale {
  min-width: 104px;
}
.shell__content {
  margin: 16px;
}
</style>
