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
  CloudOutlined,
  ClusterOutlined,
  CommentOutlined,
  CompassOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  FileOutlined,
  FileTextOutlined,
  GlobalOutlined,
  HistoryOutlined,
  HomeOutlined,
  InboxOutlined,
  InsertRowRightOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  PartitionOutlined,
  PieChartOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReadOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  ShareAltOutlined,
  ShoppingOutlined,
  TableOutlined,
  TagsOutlined,
  WarningOutlined,
  ApartmentOutlined,
  DatabaseOutlined,
  BranchesOutlined,
  LayoutOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';

const ICONS: Record<string, Component> = {
  home: HomeOutlined,
  search: CompassOutlined,
  'lineage-home': ClusterOutlined,
  observability: SearchOutlined,
  'quality-test-cases': TableOutlined,
  'observability-incidents': WarningOutlined,
  'observability-alerts': BellOutlined,
  'quality-test-definitions': BookOutlined,
  insights: BulbOutlined,
  marketplace: ShoppingOutlined,
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
  'context-center': ReadOutlined,
  'context-center-overview': AppstoreOutlined,
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
  // General UI actions (R-19 convergence): every view icon resolves through
  // this map via SmIcon, so no view imports Ant icons directly anymore.
  help: QuestionCircleOutlined,
  'notification-bell': BellOutlined,
  'action-search': SearchOutlined,
  'action-globe': GlobalOutlined,
  'action-menu-fold': MenuFoldOutlined,
  'action-menu-unfold': MenuUnfoldOutlined,
  'action-chevron-down': DownOutlined,
  'action-chevron-right': RightOutlined,
  'action-copy': CopyOutlined,
  'action-plus': PlusOutlined,
  'action-table': TableOutlined,
  'action-book': BookOutlined,
  // Service-type glyphs for the home service buckets (same bridge status).
  'service-dashboard': PieChartOutlined,
  'service-pipeline': ApartmentOutlined,
  'service-storage': CloudOutlined,
  'service-messaging': CommentOutlined,
  'service-database': DatabaseOutlined,
  'service-default': AppstoreOutlined,
};

export function navIcon(key: string): Component | undefined {
  return ICONS[key];
}
