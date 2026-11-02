<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Empty, Table, Typography } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AssetDetail } from '@/types/api';

defineProps<{ asset: AssetDetail }>();

const { t } = useI18n();

// Same ref columns as AssetOverviewFields / AssetDetailView: name, type, FQN.
const refColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.type'), dataIndex: 'type', key: 'type', width: 160 },
  { title: t('asset.columns.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);
</script>

<template>
  <Typography.Title :level="5">{{ t('asset.relatedTitle') }}</Typography.Title>
  <Empty
    v-if="!asset.children?.length"
    data-testid="asset-related-empty"
    :description="t('asset.relatedEmpty')"
  />
  <Table
    v-else
    row-key="name"
    data-testid="asset-related-table"
    :columns="refColumns"
    :data-source="asset.children"
    :pagination="false"
    size="small"
  />
</template>
