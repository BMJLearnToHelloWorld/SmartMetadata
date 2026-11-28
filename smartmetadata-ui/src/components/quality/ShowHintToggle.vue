<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ShowHintToggle (common/atoms/drawer/ShowHintToggle.tsx).
  Vue3 + ant-design-vue. No CCL React/CSS copy.
-->
<script setup lang="ts">
import { Switch, Typography } from 'ant-design-vue';
import { BulbOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="show-hint-toggle">
    <BulbOutlined aria-hidden="true" />
    <Typography.Text type="secondary">{{ t('label.show-hint') }}</Typography.Text>
    <Switch
      size="small"
      :checked="modelValue"
      :aria-label="t('label.show-hint')"
      data-testid="show-hint-toggle"
      @change="(checked) => emit('update:modelValue', Boolean(checked))"
    />
  </div>
</template>

<style scoped>
.show-hint-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  white-space: nowrap;
}
</style>
