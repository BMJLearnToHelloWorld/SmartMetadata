<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { Button, Drawer, Space } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { DRAWER_WIDTHS, type DrawerWidthKey } from './presentation';

/**
 * Shared slideout panel, modelled on the official SlideoutMenu panels
 * (ActivityFeedDrawer: dismissable, feed width, close on navigation;
 * AddCustomProperty form panel: width 700). The panel body is the
 * caller's slot; the footer is save/cancel, mirroring FormModal copy.
 * ok only emits — the caller closes on success and leaves the panel
 * open on failure (official FormDrawerUtils.submitAndClose semantics).
 * Mask-click close semantics are NOT confirmed in the snapshot and
 * are therefore left at the Ant default, not invented here.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    okText?: string;
    cancelText?: string;
    confirmLoading?: boolean;
    okDisabled?: boolean;
    widthKey?: DrawerWidthKey;
    testId?: string;
  }>(),
  {
    okText: undefined,
    cancelText: undefined,
    confirmLoading: false,
    okDisabled: false,
    widthKey: 'form',
    testId: 'sm-drawer',
  },
);
const emit = defineEmits<{ ok: []; cancel: []; 'update:open': [open: boolean] }>();
const { t } = useI18n();
const route = useRoute();

function close(): void {
  emit('cancel');
  emit('update:open', false);
}

// Official useCloseOnNavigation: navigating away closes the panel.
// Guarded on open so navigation while closed emits nothing.
watch(
  () => route.path,
  () => {
    if (props.open) {
      close();
    }
  },
);
</script>

<template>
  <Drawer
    :data-testid="testId"
    :open="open"
    :title="title"
    placement="right"
    :width="DRAWER_WIDTHS[widthKey]"
    :destroy-on-close="true"
    @close="close"
  >
    <slot />
    <template #footer>
      <Space style="display: flex; justify-content: flex-end; width: 100%">
        <Button :data-testid="`${testId}-cancel`" @click="close">{{ cancelText ?? t('crud.cancel') }}</Button>
        <Button
          type="primary"
          :data-testid="`${testId}-save`"
          :loading="confirmLoading"
          :disabled="okDisabled"
          @click="emit('ok')"
        >
          {{ okText ?? t('crud.save') }}
        </Button>
      </Space>
    </template>
  </Drawer>
</template>
