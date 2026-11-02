/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  AppstoreOutlined,
  BankOutlined,
  BellOutlined,
  BookOutlined,
  BulbOutlined,
  ClusterOutlined,
  CompassOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  HistoryOutlined,
  HomeOutlined,
  InboxOutlined,
  InsertRowRightOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MessageOutlined,
  PartitionOutlined,
  ReadOutlined,
  SettingOutlined,
  ShareAltOutlined,
  ShopOutlined,
  TableOutlined,
  TagsOutlined,
  WarningOutlined,
  DatabaseOutlined,
  BranchesOutlined,
  LayoutOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';

const ICONS: Record<string, Component> = {
  home: HomeOutlined,
  search: CompassOutlined,
  'lineage-home': ShareAltOutlined,
  observability: ClusterOutlined,
  'quality-test-cases': TableOutlined,
  'observability-incidents': WarningOutlined,
  'observability-alerts': BellOutlined,
  'quality-test-definitions': BookOutlined,
  insights: BulbOutlined,
  marketplace: ShopOutlined,
  'marketplace-overview': AppstoreOutlined,
  'governance-domains': GlobalOutlined,
  'governance-data-products': DatabaseOutlined,
  governance: BankOutlined,
  'governance-glossaries': ReadOutlined,
  'ontology-explorer': BranchesOutlined,
  'governance-classifications': TagsOutlined,
  'governance-metrics': LineChartOutlined,
  'column-bulk-ops': InsertRowRightOutlined,
  workflows: PartitionOutlined,
  'context-center': FolderOpenOutlined,
  'context-center-overview': LayoutOutlined,
  'context-center-articles': FileTextOutlined,
  'context-center-documents': FileOutlined,
  'context-center-memories': HistoryOutlined,
  'context-center-archive': InboxOutlined,
  'admin-settings': SettingOutlined,
  logout: LogoutOutlined,
  // Page / row actions (R1 extension). Same Ant bridge status as the
  // nav keys above: transition only, NOT a 1:1 official visual match.
  // Unknown keys still render a missing marker via SmIcon.
  'action-edit': EditOutlined,
  'action-delete': DeleteOutlined,
  'action-view': EyeOutlined,
  'action-lineage': ShareAltOutlined,
  'action-versions': HistoryOutlined,
  'action-conversation': MessageOutlined,
  'action-more': EllipsisOutlined,
  learning: BulbOutlined,
};

export function navIcon(key: string): Component | undefined {
  return ICONS[key];
}
