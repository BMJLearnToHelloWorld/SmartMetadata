<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Menu } from 'ant-design-vue';
import { NAV_ENTRIES, NAV_FOOTER_ENTRIES } from '@/layouts/nav';
import SmIcon from './SmIcon.vue';

/**
 * Sidebar navigation extracted from AppShell. Entries, sections and
 * footer actions are data from layouts/nav.ts; this component renders
 * them and reports clicks, owning no routing itself. Section keys and
 * the logout action are reported as clicks too, and the caller decides
 * (sections do not navigate; logout runs the logout flow).
 */
withDefaults(
  defineProps<{
    selectedKey: string;
    openKeys: string[];
    collapsed: boolean;
    testId?: string;
  }>(),
  { testId: 'sidebar-nav' },
);
const emit = defineEmits<{ click: [key: string]; 'update:openKeys': [keys: string[]] }>();

function onClick({ key }: { key: string | number }): void {
  emit('click', String(key));
}
function onOpenChange(keys: (string | number)[]): void {
  emit('update:openKeys', keys.map((key) => String(key)));
}
</script>

<template>
  <div class="sm-sidebar-nav" :data-testid="testId">
    <Menu
      class="sm-sidebar-nav__main"
      theme="light"
      mode="inline"
      :inline-collapsed="collapsed"
      :selected-keys="[selectedKey]"
      :open-keys="openKeys"
      @click="onClick"
      @openChange="onOpenChange"
    >
      <template v-for="entry in NAV_ENTRIES" :key="entry.key">
        <Menu.Item v-if="entry.kind === 'item'" :key="entry.key">
          <template #icon><SmIcon :icon-key="entry.key" /></template>
          {{ $t(entry.titleKey) }}
        </Menu.Item>
        <Menu.SubMenu v-else-if="entry.kind === 'section'" :key="entry.key" :data-testid="entry.testId">
          <template #icon><SmIcon :icon-key="entry.key" /></template>
          <template #title>{{ $t(entry.titleKey) }}</template>
          <Menu.Item v-for="item in entry.items" :key="item.key" :data-testid="item.testId">
            <template #icon><SmIcon :icon-key="item.key" /></template>
            {{ $t(item.titleKey) }}
          </Menu.Item>
        </Menu.SubMenu>
      </template>
    </Menu>
    <Menu
      class="sm-sidebar-nav__footer"
      data-testid="nav-footer"
      theme="light"
      mode="inline"
      :inline-collapsed="collapsed"
      :selected-keys="[selectedKey]"
      @click="onClick"
    >
      <Menu.Item v-for="entry in NAV_FOOTER_ENTRIES" :key="entry.key" :data-testid="entry.testId">
        <template #icon><SmIcon :icon-key="entry.key" /></template>
        {{ $t(entry.titleKey) }}
      </Menu.Item>
    </Menu>
  </div>
</template>

<style scoped>
.sm-sidebar-nav {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.sm-sidebar-nav__main {
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
}
.sm-sidebar-nav__footer {
  flex-shrink: 0;
  border-top: 1px solid var(--sm-border-secondary);
}
</style>
