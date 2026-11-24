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
  ApiOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  BarsOutlined,
  ClusterOutlined,
  CodeOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileExcelOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOutlined,
  FunctionOutlined,
  GlobalOutlined,
  LineChartOutlined,
  LinkOutlined,
  MessageOutlined,
  ReadOutlined,
  SearchOutlined,
  ShareAltOutlined,
  TableOutlined,
  TagsOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';

/**
 * Entity-type icon for Explore result cards (B2-E6, D22). Pin
 * `ExploreSearchCard.tsx` renders `searchClassBase.getEntityIcon(...)`
 * before the entity name and shows no type Tag chip; the product card
 * previously did the opposite. The glyphs reuse the ant-design icons
 * already used for the same types in `TotalDataAssetsWidget` (which
 * also falls back to `DatabaseOutlined`) and `layouts/navIcons.ts`.
 */
const ENTITY_ICON: Record<string, Component> = {
  table: TableOutlined,
  tableColumn: BarsOutlined,
  topic: MessageOutlined,
  dashboard: DashboardOutlined,
  pipeline: ShareAltOutlined,
  mlmodel: ExperimentOutlined,
  container: FolderOutlined,
  searchIndex: SearchOutlined,
  storedProcedure: FunctionOutlined,
  chart: BarChartOutlined,
  metric: LineChartOutlined,
  dashboardDataModel: ClusterOutlined,
  database: DatabaseOutlined,
  databaseSchema: ApartmentOutlined,
  apiCollection: ApiOutlined,
  apiEndpoint: LinkOutlined,
  glossaryTerm: ReadOutlined,
  glossary: ReadOutlined,
  tag: TagsOutlined,
  classification: TagsOutlined,
  dataProduct: AppstoreOutlined,
  domain: GlobalOutlined,
  directory: FolderOutlined,
  file: FileOutlined,
  spreadsheet: FileExcelOutlined,
  worksheet: FileTextOutlined,
  page: FileTextOutlined,
  query: CodeOutlined,
};

export function entityIconFor(entityType: string): Component {
  return ENTITY_ICON[entityType] ?? DatabaseOutlined;
}
