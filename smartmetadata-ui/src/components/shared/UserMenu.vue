<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Dropdown, Menu } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * User menu extracted from AppShell: profile (only when a user id
 * exists), settings, logout, plus the Stage 9 theme submenu (light /
 * dark / system, driven by the THEME_MODES data table). The actions
 * themselves stay with the caller via events; this component owns no
 * session or preference logic.
 */
import { THEME_MODES, type ThemeMode } from '@/theme/themePreference';

withDefaults(
  defineProps<{ displayName: string; profileUserId?: string; testId?: string; themeMode?: ThemeMode }>(),
  { profileUserId: '', testId: 'user-menu', themeMode: 'light' },
);
const emit = defineEmits<{
  profile: [];
  settings: [];
  logout: [];
  theme: [mode: ThemeMode];
}>();
const { t } = useI18n();

function popupParent(node: HTMLElement): HTMLElement {
  return node.parentElement ?? document.body;
}

function onClick({ key }: { key: string | number }): void {
  const action = String(key);
  if (action === 'profile') emit('profile');
  else if (action === 'settings') emit('settings');
  else if (action === 'logout') emit('logout');
  else if (action.startsWith('theme:')) emit('theme', action.slice('theme:'.length) as ThemeMode);
}
</script>

<template>
  <Dropdown :trigger="['click']" :get-popup-container="popupParent">
    <Button :data-testid="`${testId}-trigger`" :aria-label="t('chrome.userMenu')">{{ displayName }}</Button>
    <template #overlay>
      <Menu :data-testid="testId" @click="onClick">
        <Menu.Item v-if="profileUserId" key="profile" data-testid="user-profile-item">
          {{ t('chrome.viewProfile') }}
        </Menu.Item>
        <Menu.Item key="settings" data-testid="user-settings-item">{{ t('chrome.settings') }}</Menu.Item>
        <Menu.SubMenu key="theme" :title="t('theme.title')">
          <Menu.Item
            v-for="mode in THEME_MODES"
            :key="`theme:${mode.id}`"
            :data-testid="`user-theme-${mode.id}`"
          >
            {{ t(mode.labelKey) }}{{ themeMode === mode.id ? ' ✓' : '' }}
          </Menu.Item>
        </Menu.SubMenu>
        <Menu.Item key="logout" data-testid="logout-button">{{ t('chrome.logout') }}</Menu.Item>
      </Menu>
    </template>
  </Dropdown>
</template>
