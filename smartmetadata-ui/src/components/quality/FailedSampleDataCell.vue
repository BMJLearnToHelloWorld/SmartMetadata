<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official RowData (OSS SampleDataTable).
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Modal, Typography } from 'ant-design-vue';
import type { FailedSampleCellValue } from '@/quality/failedTestCaseSampleData.utils';

const props = defineProps<{
  value: FailedSampleCellValue;
}>();

const NO_DATA = '--';
const fullOpen = ref(false);

const isObject = computed(
  () => props.value !== null && props.value !== undefined && typeof props.value === 'object',
);
const isEmpty = computed(() => props.value === null || props.value === undefined || props.value === '');
const displayText = computed(() => (isObject.value ? JSON.stringify(props.value) : String(props.value ?? '')));
</script>

<template>
  <Typography.Text v-if="isEmpty" data-testid="empty-data">{{ NO_DATA }}</Typography.Text>
  <Typography.Paragraph
    v-else-if="isObject"
    class="failed-sample-data-cell__json"
    data-testid="json-object"
    :ellipsis="{ rows: 4, expandable: false }"
    @click="fullOpen = true"
  >
    {{ displayText }}
  </Typography.Paragraph>
  <Typography.Text v-else data-testid="string-data">{{ displayText }}</Typography.Text>
  <Modal
    v-if="isObject"
    :open="fullOpen"
    :footer="null"
    width="640"
    @cancel="fullOpen = false"
  >
    <pre class="failed-sample-data-cell__full">{{ displayText }}</pre>
  </Modal>
</template>

<style scoped>
.failed-sample-data-cell__json {
  margin: 0;
  max-width: 13rem;
  cursor: pointer;
}
.failed-sample-data-cell__full {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>