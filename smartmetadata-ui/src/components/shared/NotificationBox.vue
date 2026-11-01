<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Badge, Button, Dropdown, Tabs } from 'ant-design-vue';
import { BellOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import SmState from './SmState.vue';

/**
 * Official NotificationBox bridge, reduced to what is honestly wired.
 * The official box has Task / Conversation tabs, a Dot, a read timer,
 * a websocket feed and browser-notification permission handling. None
 * of that feed exists in this console, so the box renders both tabs as
 * honest empty states with the residual note — and, crucially, no Dot
 * and no invented unread count.
 */
withDefaults(defineProps<{ testId?: string }>(), { testId: 'notification-box' });
const { t } = useI18n();

function popupParent(node: HTMLElement): HTMLElement {
  return node.parentElement ?? document.body;
}
</script>

<template>
  <Dropdown :trigger="['click']" :get-popup-container="popupParent">
    <Badge :data-testid="`${testId}-badge`">
      <Button :data-testid="`${testId}-button`" :aria-label="t('chrome.notifications')">
        <BellOutlined />
      </Button>
    </Badge>
    <template #overlay>
      <div class="sm-notification-box" :data-testid="testId">
        <Tabs :items="[
          { key: 'tasks', label: t('chrome.notificationsTasks') },
          { key: 'conversations', label: t('chrome.notificationsConversations') },
        ]" />
        <SmState state="empty" :empty-text="t('chrome.notificationsEmpty')" />
        <p class="sm-notification-box__residual">{{ t('chrome.notificationsResidual') }}</p>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.sm-notification-box {
  min-width: 320px;
  padding: 12px 16px;
  background: var(--sm-bg-container);
  border-radius: var(--sm-radius-card);
  box-shadow: var(--sm-shadow-overlay);
}
.sm-notification-box__residual {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
</style>
