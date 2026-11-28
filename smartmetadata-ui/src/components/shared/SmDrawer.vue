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
    okTestId?: string;
    /** Secondary data-testid on a display:contents wrapper (legacy product ids). */
    okTestIdLegacy?: string;
    cancelTestId?: string;
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
    okTestId: undefined,
    okTestIdLegacy: undefined,
    cancelTestId: undefined,
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
    placement="right"
    :width="DRAWER_WIDTHS[widthKey]"
    :mask-closable="maskClosable"
    :keyboard="keyboard"
    :destroy-on-close="true"
    @close="close"
  >
    <template #title>
      <div class="sm-drawer__title">
        <span class="sm-drawer__title-text">{{ title }}</span>
        <slot name="headerActions" />
      </div>
    </template>
    <slot />
    <template #footer>
      <Space style="display: flex; justify-content: flex-end; width: 100%">
        <Button :data-testid="cancelTestId ?? `${testId}-cancel`" @click="close">{{ cancelText ?? t('crud.cancel') }}</Button>
        <span
          v-if="showOk && okTestIdLegacy"
          :data-testid="okTestIdLegacy"
          class="sm-drawer__ok-legacy"
        >
          <Button
            type="primary"
            :data-testid="okTestId ?? `${testId}-save`"
            :loading="confirmLoading"
            :disabled="okDisabled"
            @click="emit('ok')"
          >
            {{ okText ?? t('crud.save') }}
          </Button>
        </span>
        <Button
          v-else-if="showOk"
          type="primary"
          :data-testid="okTestId ?? `${testId}-save`"
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

<style scoped>
.sm-drawer__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding-right: 40px;
}
.sm-drawer__title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-drawer__ok-legacy {
  display: contents;
}
</style>
