<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Layout, Select, Space, Tag, Tooltip, message } from 'ant-design-vue';
import { searchRouteFromLocation, searchRouteQuery } from '@/catalog/searchQuery';
import { setAppLocale } from '@/i18n';
import { isSupportedLocale } from '@/i18n/localePreference';
import {
  defaultOpenNavKeys,
  isNavActionKey,
  isNavSectionKey,
  sectionKeyForRoute,
  selectedNavKey,
} from '@/layouts/nav';
import { handleGlobalShortcut, isMacPlatform } from '@/features/shortcuts';
import { useAuthStore } from '@/stores/auth';
import { useShellConfigStore } from '@/stores/shellConfig';
import { useShellPreferencesStore } from '@/stores/shellPreferences';
import DomainSelect from '@/components/shared/DomainSelect.vue';
import GlobalSearchBar from '@/components/shared/GlobalSearchBar.vue';
import HelpMenu from '@/components/shared/HelpMenu.vue';
import NotificationBox from '@/components/shared/NotificationBox.vue';
import SidebarNav from '@/components/shared/SidebarNav.vue';
import UserMenu from '@/components/shared/UserMenu.vue';
import VersionTag from '@/components/shared/VersionTag.vue';

/**
 * Application shell, mirroring the official currently-running shell
 * (LeftSidebar + NavBar) as a Vue bridge — not the un-enabled new
 * Sidebar, which stays out of this tree.
 *
 * Sider width follows the official LeftSidebar classes: 228px expanded,
 * 72px collapsed (the product's previous 64px collapsed width was a
 * deviation, fixed here). The header carries, in order: the global
 * search bar (hidden on home), Help, notifications, domain scope,
 * server version, an AppMode residual marker, locale, and the user
 * menu. Header height 56px is kept as an Ant bridge value: the
 * official layout-header-height / navbar-height relationship was not
 * verified in this snapshot, so it is flagged residual, not changed
 * blindly. Startup fetches server version + lineage settings through
 * the shell config store; the limit configuration has no product
 * endpoint, so no LimitBanner is rendered (absence recorded, not
 * papered over).
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const shellConfig = useShellConfigStore();
const shellPreferences = useShellPreferencesStore();
const { t, locale } = useI18n();

const openKeys = ref<string[]>(defaultOpenNavKeys());

const collapsed = computed({
  get: () => shellPreferences.sidebarCollapsed,
  set: (value: boolean) => shellPreferences.setSidebarCollapsed(value),
});
const selectedKeys = computed(() => [selectedNavKey(route.name)]);
const flushContent = computed(() => route.meta.flush === true);
const hideHeaderSearch = computed(() => route.name === 'home');

const displayName = computed(() => auth.displayName || t('chrome.signedIn'));
const profileUserId = computed(() => auth.user?.id || '');

/**
 * Stage 9 global shortcut: mod+K focuses the header search input, or
 * navigates to /search when the header search is hidden (home page).
 * Installed here — the only place the search bar lives — and removed
 * on unmount. Typing inside an input/textarea is never hijacked.
 */
function onGlobalKeyDown(event: KeyboardEvent): void {
  const handled = handleGlobalShortcut(
    event,
    isMacPlatform(window.navigator?.platform),
    () => {
      const input = document.querySelector('[data-testid="global-search"] input') as HTMLInputElement | null;
      if (input) {
        input.focus();
        return true;
      }
      return false;
    },
    () => {
      void router.push({ name: 'search' });
    },
  );
  if (handled) {
    event.preventDefault();
  }
}

onMounted(() => {
  shellPreferences.hydrate();
  window.addEventListener('keydown', onGlobalKeyDown);
  if (auth.isAuthenticated) {
    void auth.refreshUser().catch(() => undefined);
  }
  // Shell config errors are recorded on the store; a failed version or
  // lineage fetch must not break shell startup.
  void shellConfig.loadShellConfig().catch(() => undefined);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeyDown);
});

watch(
  () => route.name,
  (name) => {
    if (collapsed.value) {
      return;
    }
    const section = sectionKeyForRoute(name);
    if (section && !openKeys.value.includes(section)) {
      openKeys.value = [...openKeys.value, section];
    }
  },
  { immediate: true },
);

watch(collapsed, (isCollapsed) => {
  if (isCollapsed) {
    openKeys.value = [];
    return;
  }
  const section = sectionKeyForRoute(route.name);
  const next = defaultOpenNavKeys();
  openKeys.value = section && !next.includes(section) ? [...next, section] : next;
});

function onSidebarClick(key: string): void {
  if (isNavSectionKey(key)) {
    return;
  }
  if (isNavActionKey(key)) {
    if (key === 'logout') {
      void onLogout();
    }
    return;
  }
  void router.push({ name: key });
}

function onSearch(value: string): void {
  const nextQuery = value.trim();
  if (route.name === 'search') {
    void router.push({
      name: 'search',
      query: searchRouteFromLocation(nextQuery, route.query, 0),
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

function onUserProfile(): void {
  if (profileUserId.value) {
    void router.push({ name: 'admin-user', params: { id: profileUserId.value } });
  }
}

function onUserSettings(): void {
  void router.push({ name: 'admin-settings' });
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
      :collapsed-width="72"
      :width="228"
      :theme="shellPreferences.isDark ? 'dark' : 'light'"
    >
      <div class="shell__brand" :class="{ 'shell__brand--collapsed': collapsed }">
        <span class="shell__brand-name">{{ collapsed ? t('product.monogram') : t('product.name') }}</span>
        <span v-if="!collapsed" class="shell__brand-sub">{{ t('product.subtitle') }}</span>
      </div>
      <SidebarNav
        :selected-key="selectedKeys[0]"
        :open-keys="openKeys"
        :collapsed="collapsed"
        @click="onSidebarClick"
        @update:open-keys="(keys) => (openKeys = keys)"
      />
    </Layout.Sider>
    <Layout>
      <Layout.Header class="shell__header">
        <GlobalSearchBar
          v-if="!hideHeaderSearch"
          :initial-query="typeof route.query.q === 'string' ? route.query.q : ''"
          @search="onSearch"
        />
        <div v-else class="shell__search-spacer" />
        <Space size="middle" class="shell__toolbar">
          <HelpMenu :version="shellConfig.displayVersion" />
          <NotificationBox />
          <DomainSelect />
          <VersionTag :version="shellConfig.displayVersion" />
          <Tooltip :title="t('chrome.appModeResidual')">
            <Tag data-testid="app-mode-residual">{{ t('chrome.appMode') }}</Tag>
          </Tooltip>
          <Select
            data-testid="locale-switcher"
            class="shell__locale"
            :value="locale"
            :aria-label="t('chrome.locale')"
            @change="onLocaleChange"
          >
            <Select.Option value="en-US">{{ t('chrome.localeEn') }}</Select.Option>
            <Select.Option value="zh-CN">{{ t('chrome.localeZh') }}</Select.Option>
          </Select>
          <UserMenu
            :display-name="displayName"
            :profile-user-id="profileUserId"
            :theme-mode="shellPreferences.themeMode"
            @profile="onUserProfile"
            @settings="onUserSettings"
            @theme="(mode) => shellPreferences.setThemeMode(mode)"
            @logout="onLogout"
          />
        </Space>
      </Layout.Header>
      <Layout.Content class="shell__content" :class="{ 'shell__content--flush': flushContent }">
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
  background: var(--sm-sider-bg);
  border-right: 1px solid var(--sm-border-secondary);
}
.shell__sider :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--sm-sider-bg);
}
.shell__sider :deep(.ant-layout-sider-trigger) {
  height: 40px;
  line-height: 40px;
  background: var(--sm-trigger-bg);
  color: var(--sm-text-secondary);
  border-top: 1px solid var(--sm-border-secondary);
}
.shell__sider :deep(.ant-layout-sider-trigger:hover) {
  background: var(--sm-trigger-hover-bg);
  color: var(--sm-color-primary);
}
.shell__sider :deep(.ant-menu) {
  background: transparent;
  border-inline-end: none;
}
.shell__sider :deep(.ant-menu-item),
.shell__sider :deep(.ant-menu-submenu-title) {
  height: 36px;
  line-height: 36px;
  margin-inline: 8px;
  width: calc(100% - 16px);
  border-radius: var(--sm-border-radius);
}
.shell__brand {
  display: flex;
  flex-direction: column;
  gap: 0;
  color: var(--sm-text-primary);
  padding: 16px 16px 12px;
  min-height: 56px;
}
.shell__brand--collapsed {
  align-items: center;
  padding: 16px 8px 12px;
}
.shell__brand-name {
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1.2;
  font-size: 16px;
  color: var(--sm-color-primary);
}
.shell__brand-sub {
  color: var(--sm-text-tertiary);
  font-size: 12px;
  line-height: 1.3;
  margin-top: 2px;
}
.shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 56px;
  line-height: 56px;
  background: var(--sm-layout-bg);
  padding-inline: 20px;
  border-bottom: 1px solid var(--sm-border-secondary);
}
.shell__toolbar {
  flex-shrink: 0;
}
.shell__locale {
  min-width: 104px;
}
.shell__search-spacer {
  flex: 1;
}
.shell__content {
  margin: 16px;
}
.shell__content--flush {
  margin: 0;
}
</style>
