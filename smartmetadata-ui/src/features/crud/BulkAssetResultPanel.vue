<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Typography } from 'ant-design-vue';
import type { BulkAssetResult } from '@/api/bulkAssets';
import { entityLabel } from '@/features/crud/paging';

const props = defineProps<{ result: BulkAssetResult }>();

const { t } = useI18n();

const failedLines = computed(() =>
  props.result.failedRequests.map((row) => {
    const name = row.request ? entityLabel(row.request) : t('governance.assets.unknownAsset');
    return row.message ? `${name}: ${row.message}` : name;
  }),
);

const alertType = computed(() => {
  if (props.result.failedRequests.length > 0) {
    return props.result.success.length > 0 ? 'warning' : 'error';
  }
  return 'success';
});
</script>

<template>
  <div data-testid="bulk-assets-result">
    <Alert
      :type="alertType"
      show-icon
      :message="
        t('governance.assets.bulkSummary', {
          passed: result.passed ?? result.success.length,
          failed: result.failed ?? result.failedRequests.length,
          pending: result.pendingApproval ?? 0,
        })
      "
      :description="result.abortReason"
    />
    <ul v-if="failedLines.length" data-testid="bulk-assets-failures">
      <li v-for="line in failedLines" :key="line">
        <Typography.Text>{{ line }}</Typography.Text>
      </li>
    </ul>
    <Typography.Paragraph v-if="(result.pendingApproval ?? 0) > 0" type="secondary">
      {{ t('governance.assets.pendingApprovalNote') }}
    </Typography.Paragraph>
  </div>
</template>
