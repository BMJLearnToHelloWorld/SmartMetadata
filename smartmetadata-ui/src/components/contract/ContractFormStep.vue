<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractFormStep (title, description, extra, prev/next).
  Vue3 + ant-design-vue, product tokens, no CCL CSS copy.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    nextLabel?: string;
    prevLabel?: string;
    isNextVisible?: boolean;
    showPrev?: boolean;
  }>(),
  { isNextVisible: true, showPrev: false },
);

const emit = defineEmits<{ next: []; prev: [] }>();
const { t } = useI18n();
</script>

<template>
  <div class="contract-form-step" data-testid="contract-form-step">
    <div class="contract-form-step__header">
      <div>
        <h3 class="contract-form-step__title">{{ title }}</h3>
        <p class="contract-form-step__description">{{ description }}</p>
      </div>
      <div class="contract-form-step__extra">
        <slot name="extra" />
      </div>
    </div>
    <div class="contract-form-step__body">
      <slot />
    </div>
    <div v-if="isNextVisible || showPrev" class="contract-form-step__nav">
      <Button v-if="showPrev" data-testid="contract-form-prev" @click="emit('prev')">
        {{ prevLabel || t('label.previous') }}
      </Button>
      <span style="flex: 1" />
      <Button v-if="isNextVisible" type="primary" data-testid="contract-form-next" @click="emit('next')">
        {{ nextLabel || t('label.next') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.contract-form-step__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.contract-form-step__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-text-primary);
}
.contract-form-step__description {
  margin: 4px 0 0;
  color: var(--sm-text-secondary);
  font-size: 13px;
}
.contract-form-step__nav {
  display: flex;
  align-items: center;
  margin-top: 16px;
}
</style>
