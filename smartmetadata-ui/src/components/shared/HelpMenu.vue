<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Dropdown, Menu, Tooltip } from 'ant-design-vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { helpItems } from './helpItems';

/**
 * Official Help dropdown bridge: tour / docs / API / Slack / version
 * items, data-driven from helpItems.ts. Tour and API are disabled
 * residual items (no tour or swagger route exists in this console);
 * docs, Slack and version are external links with the official URLs.
 */
withDefaults(defineProps<{ version?: string; testId?: string }>(), {
  version: undefined,
  testId: 'help-menu',
});
const { t } = useI18n();

function popupParent(node: HTMLElement): HTMLElement {
  return node.parentElement ?? document.body;
}
</script>

<template>
  <Dropdown :trigger="['click']" :get-popup-container="popupParent">
    <Button :data-testid="`${testId}-trigger`" :aria-label="t('chrome.help')">
      <QuestionCircleOutlined /> {{ t('chrome.help') }}
    </Button>
    <template #overlay>
      <Menu :data-testid="testId">
        <template v-for="item in helpItems(version)" :key="item.key">
          <Menu.Item v-if="item.href" :key="item.key" :data-testid="`help-item-${item.key}`">
            <a :href="item.href" target="_blank" rel="noreferrer">
              {{ item.key === 'version' ? t(item.labelKey, { version: version ?? t('chrome.helpVersionUnknown') }) : t(item.labelKey) }}
            </a>
          </Menu.Item>
          <Tooltip v-else :title="item.residualKey ? t(item.residualKey) : ''" placement="left">
            <Menu.Item :key="item.key" disabled :data-testid="`help-item-${item.key}`">
              {{ t(item.labelKey) }}
            </Menu.Item>
          </Tooltip>
        </template>
        <Menu.Divider />
        <Menu.Item key="app-mode" disabled :data-testid="'help-item-app-mode'">
          <Tooltip :title="t('chrome.appModeResidual')">{{ t('chrome.appMode') }}</Tooltip>
        </Menu.Item>
      </Menu>
    </template>
  </Dropdown>
</template>
