<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Tabs } from 'ant-design-vue';

/**
 * Shared detail tab bar. Tab definitions are data (key + label +
 * optional disabled); the tab bar itself carries no entity knowledge,
 * and page content below it is rendered by the calling page.
 */
export interface DetailTab {
  key: string;
  label: string;
  disabled?: boolean;
}

withDefaults(
  defineProps<{ tabs: DetailTab[]; activeKey: string; testId?: string }>(),
  { testId: 'detail-tabs' },
);
const emit = defineEmits<{ change: [key: string] }>();
</script>

<template>
  <Tabs
    :data-testid="testId"
    :active-key="activeKey"
    @change="(key) => emit('change', String(key))"
  >
    <Tabs.TabPane
      v-for="tab in tabs"
      :key="tab.key"
      :tab="tab.label"
      :disabled="tab.disabled"
    />
  </Tabs>
</template>
