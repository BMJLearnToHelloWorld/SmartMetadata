<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Tooltip } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  entityKey: string;
}>();

const { t } = useI18n();
</script>

<template>
  <Tooltip :title="t('label.inherited-entity', { entity: t(entityKey) })">
    <span class="inherit-icon" role="img" :aria-label="t('label.inherited-entity', { entity: t(entityKey) })">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 2.5v6.5m0 0 3.5-3.5M8 9 4.5 5.5M4 12.5h8"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
  </Tooltip>
</template>

<style scoped>
.inherit-icon {
  display: inline-flex;
  color: var(--sm-text-tertiary);
  cursor: pointer;
  vertical-align: middle;
}
</style>
