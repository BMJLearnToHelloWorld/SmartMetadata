<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Dropdown, Menu } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * User menu extracted from AppShell: profile (only when a user id
 * exists), settings, logout. The actions themselves stay with the
 * caller via events; this component owns no session logic.
 */
withDefaults(
  defineProps<{ displayName: string; profileUserId?: string; testId?: string }>(),
  { profileUserId: '', testId: 'user-menu' },
);
const emit = defineEmits<{ profile: []; settings: []; logout: [] }>();
const { t } = useI18n();

function popupParent(node: HTMLElement): HTMLElement {
  return node.parentElement ?? document.body;
}

function onClick({ key }: { key: string | number }): void {
  const action = String(key);
  if (action === 'profile') emit('profile');
  else if (action === 'settings') emit('settings');
  else if (action === 'logout') emit('logout');
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
        <Menu.Item key="logout" data-testid="logout-button">{{ t('chrome.logout') }}</Menu.Item>
      </Menu>
    </template>
  </Dropdown>
</template>
