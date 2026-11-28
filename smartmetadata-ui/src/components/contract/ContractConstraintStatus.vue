<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Tag } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { getContractStatusType, type ContractStatusKind } from '@/utils/dataContract';

const props = defineProps<{
  status: string;
  testId?: string;
}>();

const { t } = useI18n();
const kind = computed<ContractStatusKind>(() => getContractStatusType(props.status));
const label = computed(() => (props.status.startsWith('label.') ? t(props.status) : props.status));
const color = computed(() => {
  if (kind.value === 'success') return 'success';
  if (kind.value === 'failure') return 'error';
  if (kind.value === 'warning') return 'warning';
  return 'default';
});
</script>

<template>
  <Tag :color="color" :data-testid="testId">{{ label }}</Tag>
</template>
