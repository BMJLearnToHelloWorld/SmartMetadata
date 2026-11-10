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
 *
 * Mask-click / Escape close are Ant defaults (both true) and stay
 * that way for existing callers: the new `maskClosable` / `keyboard`
 * props only let a caller opt out, as the metric create drawer does
 * (official closeOnEscape/closeOnBackdrop = false).
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    okText?: string;
    cancelText?: string;
    confirmLoading?: boolean;
    okDisabled?: boolean;
    showOk?: boolean;
    widthKey?: DrawerWidthKey;
    testId?: string;
    maskClosable?: boolean;
    keyboard?: boolean;
  }>(),
  {
    okText: undefined,
    cancelText: undefined,
    confirmLoading: false,
    okDisabled: false,
    showOk: true,
    widthKey: 'form',
    testId: 'sm-drawer',
    maskClosable: true,
    keyboard: true,
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
    :mask-closable="maskClosable"
    :keyboard="keyboard"
    :destroy-on-close="true"
    @close="close"
  >
    <slot />
    <template #footer>
      <Space style="display: flex; justify-content: flex-end; width: 100%">
        <Button :data-testid="`${testId}-cancel`" @click="close">{{ cancelText ?? t('crud.cancel') }}</Button>
        <Button
          v-if="showOk"
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
