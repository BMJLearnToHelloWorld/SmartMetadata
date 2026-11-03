<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { BellOutlined, DownOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons-vue';
import { Dropdown, Input, Layout, Menu, message } from 'ant-design-vue';
import monogramUrl from '@/assets/iqvia-monogram.svg';
import logoUrl from '@/assets/iqvia-logo.svg';
import { searchRouteFromLocation, searchRouteQuery } from '@/catalog/searchQuery';
import { setAppLocale } from '@/i18n';
import { isSupportedLocale } from '@/i18n/localePreference';
import {
  defaultOpenNavKeys,
  isNavActionKey,
  isNavSectionKey,
  NAV_ENTRIES,
  sectionKeyForRoute,
  sectionLanding,
  selectedNavKey,
} from '@/layouts/nav';
import { handleGlobalShortcut, isMacPlatform } from '@/features/shortcuts';
import { navIcon } from '@/layouts/navIcons';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t, locale } = useI18n();

const collapsed = ref(false);
const openKeys = ref<string[]>(defaultOpenNavKeys());

const selectedKeys = computed(() => [selectedNavKey(route.name)]);
const flushContent = computed(() => route.meta.flush === true);
const hideHeaderSearch = computed(() => route.name === 'home');

const displayName = computed(() => auth.displayName || t('chrome.signedIn'));
const profileUserId = computed(() => auth.user?.id || '');
const avatarLetter = computed(() => (displayName.value || 'A').slice(0, 1).toUpperCase());
const localeMark = computed(() => (locale.value.startsWith('zh') ? 'ZH' : 'EN'));

/**
 * Re-applied on the dev_ui shell (Fix6/Fix1/Stage 9 mechanisms that the
 * redesign dropped): section-title navigation, nav-failure surfacing,
 * and the mod+K shortcut. The dev_ui layout itself is untouched.
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
  window.addEventListener('keydown', onGlobalKeyDown);
  if (auth.isAuthenticated) {
    void auth.refreshUser().catch(() => undefined);
  }
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

function onSectionTitle(key: string): void {
  // Fix6, re-applied: a section title click is a navigation to the
  // section's first working page. The click still bubbles to the submenu
  // row, so expand/collapse behaviour is unchanged.
  const landing = sectionLanding(key);
  if (landing) {
    try {
      router.push({ name: landing }).catch(() => {
        message.error(t('chrome.navFailed'));
      });
    } catch {
      message.error(t('chrome.navFailed'));
    }
  }
}

function onMenuClick({ key }: { key: string | number }): void {
  const name = String(key);
  if (isNavSectionKey(name)) {
    return;
  }
  if (isNavActionKey(name)) {
    if (name === 'logout') {
      void onLogout();
    }
    return;
  }
  // Fix1, re-applied: a failed navigation must surface, never vanish
  // silently. vue-router throws synchronously for an unresolvable name,
  // so .catch alone is not enough.
  try {
    router.push({ name }).catch(() => {
      message.error(t('chrome.navFailed'));
    });
  } catch {
    message.error(t('chrome.navFailed'));
  }
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

function toggleLocale(): void {
  const next = locale.value.startsWith('zh') ? 'en-US' : 'zh-CN';
  if (isSupportedLocale(next)) {
    setAppLocale(next, locale);
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
      :trigger="null"
      :collapsed-width="88"
      :width="272"
      theme="light"
    >
      <div class="shell__brand" :class="{ 'shell__brand--collapsed': collapsed }">
        <img class="shell__logo" :src="collapsed ? monogramUrl : logoUrl" alt="IQVIA" />
      </div>
      <div class="shell__nav">
        <Menu
          class="shell__nav-main"
          theme="light"
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
            <Menu.SubMenu
              v-else-if="entry.kind === 'section'"
              :key="entry.key"
              :data-testid="entry.testId"
              popup-class-name="shell__nav-popup"
            >
              <template #icon>
                <component :is="navIcon(entry.key)" />
              </template>
              <template #title>
                <span :data-testid="`section-title-${entry.key}`" @click="onSectionTitle(entry.key)">
                  {{ t(entry.titleKey) }}
                </span>
              </template>
              <Menu.Item v-for="item in entry.items" :key="item.key" :data-testid="item.testId">
                <template #icon>
                  <component :is="navIcon(item.key)" />
                </template>
                {{ t(item.titleKey) }}
              </Menu.Item>
            </Menu.SubMenu>
          </template>
        </Menu>
        <p v-if="!collapsed" class="shell__legal">{{ t('chrome.copyright') }}</p>
      </div>
    </Layout.Sider>
    <Layout>
      <Layout.Header class="shell__header">
        <button type="button" class="shell__sider-toggle" :aria-label="t('chrome.collapse')" @click="collapsed = !collapsed">
          <MenuUnfoldOutlined v-if="collapsed" />
          <MenuFoldOutlined v-else />
        </button>
        <Input.Search
          v-if="!hideHeaderSearch"
          data-testid="global-search"
          class="shell__search"
          :placeholder="t('chrome.searchPlaceholder')"
          allow-clear
          :default-value="typeof route.query.q === 'string' ? route.query.q : ''"
          @search="onSearch"
        />
        <div v-else class="shell__search-spacer" />
        <div class="shell__toolbar">
          <button
            type="button"
            data-testid="locale-switcher"
            class="shell__lang"
            :aria-label="t('chrome.locale')"
            @click="toggleLocale"
          >
            {{ localeMark }}
            <DownOutlined class="shell__lang-caret" />
          </button>
          <BellOutlined class="shell__bell" />
          <Dropdown
            :trigger="['click']"
            :get-popup-container="popupParent"
          >
            <button type="button" data-testid="user-menu-trigger" class="shell__user" :aria-label="t('chrome.userMenu')">
              <span class="shell__avatar">{{ avatarLetter }}</span>
              <span class="shell__user-copy">
                <span class="shell__user-name">{{ displayName }}</span>
                <span class="shell__user-role">{{ t('chrome.defaultPersona') }}</span>
              </span>
            </button>
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
        </div>
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
  background: var(--sm-home-canvas);
}
.shell__sider {
  position: sticky;
  top: 0;
  align-self: flex-start;
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  background: var(--sm-home-canvas);
  border-right: 0;
  transition: flex 0.2s ease, max-width 0.2s ease, min-width 0.2s ease, width 0.2s ease !important;
}
.shell__sider :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--sm-home-canvas);
}
.shell__nav {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.shell__nav-main {
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}
.shell__nav-main::-webkit-scrollbar {
  display: none;
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
.shell__sider :deep(.ant-menu),
.shell__sider :deep(.ant-menu-item),
.shell__sider :deep(.ant-menu-submenu),
.shell__sider :deep(.ant-menu-submenu-title),
.shell__sider :deep(.ant-menu-sub),
.shell__sider :deep(.ant-motion-collapse) {
  transition: none !important;
  animation: none !important;
}
.shell__sider :deep(.ant-menu) {
  background: transparent;
  border-inline-end: none;
}
.shell__sider :deep(.ant-menu-item),
.shell__sider :deep(.ant-menu-submenu-title) {
  display: flex;
  align-items: center;
  height: 52px;
  margin: 4px 16px !important;
  width: calc(100% - 32px) !important;
  padding-inline: 16px !important;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 500;
  line-height: 22px;
  color: var(--sm-text-secondary);
}
.shell__sider :deep(.ant-menu-item::after) {
  display: none;
}
.shell__sider :deep(.anticon) {
  font-size: 22px;
  width: 22px;
  height: 22px;
  min-width: 22px;
  line-height: 22px;
}
.shell__sider :deep(.ant-menu-title-content) {
  margin-inline-start: 14px !important;
}
.shell__sider :deep(.ant-menu-item:not(.ant-menu-item-selected):hover),
.shell__sider :deep(.ant-menu-submenu:not(.ant-menu-submenu-open) > .ant-menu-submenu-title:hover) {
  background: var(--sm-bg-base) !important;
  color: var(--sm-text-primary) !important;
  box-shadow: var(--sm-shadow-widget);
}
.shell__sider :deep(.ant-menu-item-selected) {
  background: var(--sm-bg-base) !important;
  color: var(--sm-color-primary) !important;
  font-weight: 600;
  box-shadow: var(--sm-shadow-card);
}
.shell__sider :deep(.ant-menu-item-selected .anticon),
.shell__sider :deep(.ant-menu-item-selected .ant-menu-title-content) {
  color: var(--sm-color-primary) !important;
}
.shell__sider :deep(.ant-menu-submenu-open) {
  margin: 4px 16px 10px;
  padding: 0 0 8px;
  background: var(--sm-bg-base) !important;
  border-radius: 18px;
  box-shadow: var(--sm-shadow-card);
}
.shell__sider :deep(.ant-menu-submenu-open > .ant-menu-submenu-title) {
  width: 100% !important;
  height: 52px;
  margin: 0 !important;
  padding-inline: 16px !important;
  background: transparent !important;
  color: var(--sm-color-primary) !important;
  font-weight: 600;
  box-shadow: none;
}
.shell__sider :deep(.ant-menu-submenu-open > .ant-menu-submenu-title .anticon),
.shell__sider :deep(.ant-menu-submenu-open > .ant-menu-submenu-title .ant-menu-title-content),
.shell__sider :deep(.ant-menu-submenu-open > .ant-menu-submenu-title .ant-menu-submenu-arrow) {
  color: var(--sm-color-primary) !important;
}
.shell__sider :deep(.ant-menu-submenu-open > .ant-menu) {
  width: 100% !important;
  margin: 0 !important;
  padding: 0 2px 2px;
  background: transparent;
  border: 0 !important;
  border-radius: 0;
  box-shadow: none;
}
.shell__sider :deep(.ant-menu-sub .ant-menu-item) {
  height: 44px;
  width: 100% !important;
  margin: 0 !important;
  padding-inline: 16px !important;
  border-radius: 12px;
  background: transparent !important;
  box-shadow: none;
  color: var(--sm-text-tertiary) !important;
  font-weight: 500;
}
.shell__sider :deep(.ant-menu-sub .anticon) {
  font-size: 18px;
  width: 18px;
  height: 18px;
  min-width: 18px;
}
.shell__sider :deep(.ant-menu-sub .ant-menu-item:hover) {
  background: var(--sm-color-primary-bg) !important;
  color: var(--sm-color-primary) !important;
  box-shadow: none;
}
.shell__sider :deep(.ant-menu-sub .ant-menu-item .anticon),
.shell__sider :deep(.ant-menu-sub .ant-menu-item .ant-menu-title-content) {
  color: inherit !important;
}
.shell__sider :deep(.ant-menu-sub .ant-menu-item-selected) {
  background: var(--sm-color-primary-bg) !important;
  color: var(--sm-color-primary) !important;
  box-shadow: none;
}
.shell__sider.ant-layout-sider-collapsed :deep(.ant-menu) {
  padding: 0 !important;
}
.shell__sider.ant-layout-sider-collapsed :deep(.ant-menu-submenu-open) {
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.shell__sider.ant-layout-sider-collapsed :deep(.ant-menu-submenu-open > .ant-menu-submenu-title) {
  width: 52px !important;
  margin: 4px 18px !important;
  background: var(--sm-bg-base) !important;
  color: var(--sm-color-primary) !important;
  box-shadow: var(--sm-shadow-card);
}
.shell__sider.ant-layout-sider-collapsed :deep(.ant-menu-item),
.shell__sider.ant-layout-sider-collapsed :deep(.ant-menu-submenu-title) {
  justify-content: center;
  width: 52px !important;
  height: 52px;
  margin: 4px 18px !important;
  padding: 0 !important;
  padding-inline: 0 !important;
}
.shell__sider.ant-layout-sider-collapsed :deep(.ant-menu-title-content),
.shell__sider.ant-layout-sider-collapsed :deep(.ant-menu-submenu-arrow) {
  display: none !important;
}
.shell__sider.ant-layout-sider-collapsed :deep(.ant-menu-item-icon),
.shell__sider.ant-layout-sider-collapsed :deep(.anticon) {
  position: static !important;
  inset: auto !important;
  transform: none !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 !important;
  font-size: 22px;
  line-height: 1;
  width: 22px;
  height: 22px;
  min-width: 22px;
}
.shell__sider.ant-layout-sider-collapsed :deep(.ant-menu-item-selected) {
  box-shadow: var(--sm-shadow-card);
}
.shell__brand {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  margin: 22px 16px 14px;
  padding: 0;
}
.shell__brand--collapsed {
  justify-content: flex-start;
  margin: 22px 0 14px 26px;
}
.shell__logo {
  height: 36px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}
.shell__brand--collapsed .shell__logo {
  width: 36px;
  height: 36px;
}
.shell__sider-toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  width: 36px;
  height: 36px;
  margin-top: 22px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--sm-text-secondary);
  cursor: pointer;
  line-height: 0;
}
.shell__sider-toggle :deep(.anticon) {
  font-size: 18px;
  width: 18px;
  height: 18px;
  min-width: 18px;
  line-height: 1;
}
.shell__sider-toggle:hover {
  color: var(--sm-color-primary);
  background: var(--sm-bg-base);
  box-shadow: var(--sm-shadow-widget);
}
.shell__legal {
  margin: auto 20px 16px;
  color: var(--sm-text-quaternary);
  font-size: 12px;
}
.shell__header {
  /*
   * Fix8, re-applied on the dev_ui header (height 64 stays dev_ui's):
   * the header sticks to the viewport top while the page scrolls.
   * z-index uses the existing sticky token, re-added to theme.css
   * because the dev_ui theme dropped the whole z-token block.
   */
  position: sticky;
  top: 0;
  z-index: var(--sm-z-sticky);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 64px;
  line-height: 1.2;
  background: var(--sm-home-canvas);
  padding-inline: 12px 20px;
  border-bottom: 0;
}
.shell__toolbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  line-height: 1.2;
}
.shell__lang {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--sm-text-secondary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  cursor: pointer;
}
.shell__lang:hover {
  color: var(--sm-color-primary);
  background: var(--sm-bg-base);
}
.shell__lang-caret {
  font-size: 10px;
}
.shell__bell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--sm-text-secondary);
  font-size: 18px;
}
.shell__user {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 10px;
  height: 40px;
  margin-left: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  line-height: 1.2;
  cursor: pointer;
  text-align: left;
}
.shell__avatar {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--sm-color-primary);
  color: var(--sm-text-on-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
}
.shell__user-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  min-width: max-content;
  line-height: 1.2;
}
.shell__user-name,
.shell__user-role {
  display: block;
  white-space: nowrap;
  line-height: 1.2;
}
.shell__user-name {
  color: var(--sm-text-primary);
  font-size: 14px;
  font-weight: 600;
}
.shell__user-role {
  color: var(--sm-text-tertiary);
  font-size: 12px;
  font-weight: 400;
}
.shell__search {
  max-width: 520px;
  flex: 1;
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

<style>
.shell__nav-popup.ant-menu-submenu-popup {
  padding: 6px;
  border-radius: 16px;
  background: var(--sm-bg-base) !important;
  box-shadow: var(--sm-shadow-raised);
}
.shell__nav-popup.ant-menu-submenu-popup .ant-menu {
  background: transparent;
  border: 0;
  box-shadow: none;
}
.shell__nav-popup.ant-menu-submenu-popup .ant-menu-item {
  display: flex;
  align-items: center;
  height: 40px;
  margin: 2px 0;
  padding-inline: 12px !important;
  border-radius: 10px;
  color: var(--sm-text-secondary);
  line-height: 40px;
}
.shell__nav-popup.ant-menu-submenu-popup .ant-menu-item .anticon {
  font-size: 16px;
  color: inherit;
}
.shell__nav-popup.ant-menu-submenu-popup .ant-menu-item:hover,
.shell__nav-popup.ant-menu-submenu-popup .ant-menu-item-selected {
  background: var(--sm-color-primary-bg) !important;
  color: var(--sm-color-primary) !important;
}
</style>
