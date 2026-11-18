<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button, Modal } from 'ant-design-vue';

/**
 * CustomizablePageHeader equivalent (official
 * components/MyData/CustomizableComponents/CustomizablePageHeader):
 * title + subtitle, Add Widget (only for the pages that offer it),
 * Reset (confirm modal with the official reset texts), Save (disabled
 * while clean, spinner while saving), Close. The close button emits
 * `close`; the entry flow navigates away, which trips the route leave
 * guard when the editor is dirty.
 *
 * Title/subtitle are data-derived (page label + persona name) until
 * the customize-entity message keys are registered (see notes).
 */
defineProps<{
  pageLabel: string;
  personaName: string;
  disableSave: boolean;
  saving: boolean;
  showAddWidget?: boolean;
}>();

const emit = defineEmits<{
  save: [];
  reset: [];
  addWidget: [];
  close: [];
}>();

const { t } = useI18n();

function requestReset(): void {
  Modal.confirm({
    title: t('home.resetDefaultLayout'),
    content: t('home.resetLayoutConfirmation'),
    okText: t('home.reset'),
    cancelText: t('crud.cancel'),
    onOk: () => emit('reset'),
  });
}
</script>

<template>
  <div class="customize-page-header" data-testid="customize-page-header">
    <div class="customize-page-header__heading">
      <h1 class="customize-page-header__title" data-testid="customize-page-title">
        {{ t('home.customize') }} {{ pageLabel }}
      </h1>
      <p class="customize-page-header__subtitle">{{ personaName }}</p>
    </div>
    <div class="customize-page-header__actions">
      <Button
        v-if="showAddWidget"
        type="primary"
        data-testid="add-widget-button"
        @click="emit('addWidget')"
      >
        {{ t('home.addWidget') }}
      </Button>
      <Button data-testid="reset-button" :disabled="saving" @click="requestReset">
        {{ t('home.reset') }}
      </Button>
      <Button
        type="primary"
        data-testid="save-button"
        :disabled="disableSave"
        :loading="saving"
        @click="emit('save')"
      >
        {{ t('crud.save') }}
      </Button>
      <Button data-testid="cancel-button" :disabled="saving" @click="emit('close')">
        {{ t('crud.cancel') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.customize-page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.customize-page-header__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.customize-page-header__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
.customize-page-header__actions {
  display: flex;
  gap: 8px;
}
</style>
