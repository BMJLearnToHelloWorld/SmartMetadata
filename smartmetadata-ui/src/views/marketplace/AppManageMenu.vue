<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { DownOutlined } from '@ant-design/icons-vue';
import { Button, Dropdown, Menu } from 'ant-design-vue';
import type { Component } from 'vue';

export interface AppManageMenuItem {
  key: string;
  /** DOM id / testid of the item label, per pin ManageButtonItemLabel. */
  id: string;
  name: string;
  description: string;
  icon?: Component;
  onClick: () => void;
}

const props = withDefaults(
  defineProps<{
    items: AppManageMenuItem[];
    label: string;
    open?: boolean;
  }>(),
  { open: undefined },
);

defineEmits<{
  'open-change': [open: boolean];
}>();

/**
 * Official ManageMenu (components/common/EntityPageInfos/ManageButton/
 * ManageMenu, pin a3012259ca) as consumed by AppDetails: a trigger
 * button carrying the Manage label and a dropdown whose items each
 * show an icon, a name, and a description. The open state is parent
 * controlled when `open` is bound; otherwise the dropdown manages
 * itself. Item clicks run the item handler; the parent closes the
 * menu and opens its confirmation prompt.
 */
</script>

<template>
  <Dropdown :open="props.open" trigger="click" @open-change="$emit('open-change', $event)">
    <Button>
      {{ props.label }}
      <DownOutlined />
    </Button>
    <template #overlay>
      <Menu>
        <Menu.Item
          v-for="item in props.items"
          :key="item.key"
          @click="item.onClick"
        >
          <div :data-testid="item.id" style="display: flex; gap: 8px; align-items: flex-start">
            <component :is="item.icon" v-if="item.icon" style="margin-top: 2px" />
            <div>
              <div>{{ item.name }}</div>
              <div style="font-size: 12px; color: #8c8c8c; white-space: normal">
                {{ item.description }}
              </div>
            </div>
          </div>
        </Menu.Item>
      </Menu>
    </template>
  </Dropdown>
</template>
