<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Entity-type glyph for the Search settings header and cards and the
  Explore vertical tab list. The official glyphs are per-entity colored SVGs, which have no product
  equivalent; these antd glyphs are visual-direction approximations
  with the same slot and sizing contract (55px header, 40px card).
  The mapping is data, keyed by entity type; unknown types fall back
  to the generic file glyph.
-->
<script setup lang="ts">
import {
  ApiOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BookOutlined,
  BranchesOutlined,
  CloudOutlined,
  ClusterOutlined,
  CodeOutlined,
  ColumnHeightOutlined,
  DatabaseOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOutlined,
  FundOutlined,
  GatewayOutlined,
  GlobalOutlined,
  LineChartOutlined,
  PartitionOutlined,
  ProfileOutlined,
  SearchOutlined,
  TableOutlined,
  TagsOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';

const props = withDefaults(
  defineProps<{ entityType: string; size?: number }>(),
  { size: 55 },
);

const ICONS: Record<string, Component> = {
  table: TableOutlined,
  dashboard: BarChartOutlined,
  pipeline: BranchesOutlined,
  topic: GatewayOutlined,
  glossaryTerm: BookOutlined,
  apiEndpoint: ApiOutlined,
  apiCollection: ApiOutlined,
  dashboardDataModel: PartitionOutlined,
  storedProcedure: CodeOutlined,
  container: CloudOutlined,
  mlmodel: FundOutlined,
  dataProduct: AppstoreOutlined,
  query: SearchOutlined,
  tag: TagsOutlined,
  database: DatabaseOutlined,
  databaseSchema: ClusterOutlined,
  domain: GlobalOutlined,
  metric: AuditOutlined,
  searchIndex: FileTextOutlined,
  directory: FolderOutlined,
  file: FileOutlined,
  spreadsheet: TableOutlined,
  worksheet: ProfileOutlined,
  tableColumn: ColumnHeightOutlined,
  chart: LineChartOutlined,
};

const icon = ICONS[props.entityType] ?? FileOutlined;
</script>

<template>
  <component
    :is="icon"
    :data-testid="`search-entity-icon-${entityType}`"
    :style="{ fontSize: `${size}px`, flexShrink: 0 }"
  />
</template>
