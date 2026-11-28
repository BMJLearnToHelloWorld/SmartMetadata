<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { BookOutlined, CodeOutlined } from '@ant-design/icons-vue';
import { DataContractMode } from '@/catalog/dataContractConstants';

defineProps<{
  mode: DataContractMode;
}>();

const emit = defineEmits<{
  (e: 'change', mode: DataContractMode): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="contract-view-switch" data-testid="contract-view-switch" role="group">
    <button
      type="button"
      class="contract-view-switch__item"
      :class="{ 'is-active': mode === DataContractMode.UI }"
      :aria-label="t('label.editor')"
      data-testid="contract-view-switch-tab-ui"
      @click="emit('change', DataContractMode.UI)"
    >
      <BookOutlined />
    </button>
    <button
      type="button"
      class="contract-view-switch__item"
      :class="{ 'is-active': mode === DataContractMode.YAML }"
      :aria-label="t('label.code')"
      data-testid="contract-view-switch-tab-yaml"
      @click="emit('change', DataContractMode.YAML)"
    >
      <CodeOutlined />
    </button>
  </div>
</template>

<style scoped>
.contract-view-switch {
  display: inline-flex;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-border-radius, 6px);
  overflow: hidden;
}
.contract-view-switch__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: 0;
  background: var(--sm-bg-container);
  color: var(--sm-text-secondary);
  cursor: pointer;
}
.contract-view-switch__item + .contract-view-switch__item {
  border-left: 1px solid var(--sm-border-color);
}
.contract-view-switch__item.is-active {
  background: var(--sm-color-primary-bg);
  color: var(--sm-brand);
}
</style>
