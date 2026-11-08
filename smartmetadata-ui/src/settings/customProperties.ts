/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { Component } from 'vue';
import {
  ApartmentOutlined,
  ApiOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  BranchesOutlined,
  CodeOutlined,
  ContainerOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileExcelOutlined,
  FileOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FolderOutlined,
  GatewayOutlined,
  GlobalOutlined,
  LayoutOutlined,
  LineChartOutlined,
  MessageOutlined,
  OrderedListOutlined,
  ReadOutlined,
  RobotOutlined,
  TableOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';

/**
 * The 26 entity types the official framework exposes as Custom Properties
 * cards (GlobalSettingsClassBase.ts:748-986, pin a3012259ca), in rendered
 * label order (`localeCompare`, as official sorts at :986). This module is
 * the single definition of the list: the Settings Hub and the custom
 * property types list both import it, so the two surfaces cannot drift
 * apart. ADR:2026-11-07-custom-properties-s12-hub-allowlist-delete-patch.
 *
 * Icons are mapped onto the product's existing ant-design icon set; no
 * official icon asset is introduced. Description copy follows official:
 * 25 items share "Define the custom properties for your {entity} …" with
 * the singular entity label, Columns uses its own column-level message
 * (dashboardDataModel keeps official's plural entity, per the pin).
 */
export interface CustomPropertyTypeEntry {
  /** Metadata type name, also the detail route's `entityType` param (G-D2 (a)). */
  type: string;
  /** Plural label key, e.g. settings.customProperties.types.table.label. */
  titleKey: string;
  /** Singular entity label key for the shared description; absent for Columns. */
  entityKey?: string;
  icon: Component;
}

function entry(
  type: string,
  icon: Component,
  hasEntityDescription = true,
): CustomPropertyTypeEntry {
  return {
    type,
    titleKey: `settings.customProperties.types.${type}.label`,
    entityKey: hasEntityDescription
      ? `settings.customProperties.types.${type}.entity`
      : undefined,
    icon,
  };
}

export const CUSTOM_PROPERTY_TYPE_ENTRIES: readonly CustomPropertyTypeEntry[] = [
  entry('apiCollection', ApiOutlined),
  entry('apiEndpoint', GatewayOutlined),
  entry('page', ReadOutlined),
  entry('chart', LineChartOutlined),
  entry('tableColumn', OrderedListOutlined, false),
  entry('container', ContainerOutlined),
  entry('dashboardDataModel', DashboardOutlined),
  entry('dashboard', LayoutOutlined),
  entry('dataProduct', AppstoreOutlined),
  entry('databaseSchema', ApartmentOutlined),
  entry('database', DatabaseOutlined),
  entry('directory', FolderOutlined),
  entry('domain', GlobalOutlined),
  entry('file', FileOutlined),
  entry('glossaryTerm', BookOutlined),
  entry('metric', BarChartOutlined),
  entry('mlmodel', RobotOutlined),
  entry('pipeline', BranchesOutlined),
  entry('searchIndex', FileSearchOutlined),
  entry('spreadsheet', FileExcelOutlined),
  entry('storedProcedure', CodeOutlined),
  entry('table', TableOutlined),
  entry('team', TeamOutlined),
  entry('topic', MessageOutlined),
  entry('user', UserOutlined),
  entry('worksheet', FileTextOutlined),
];

/** G-D1 (a): the types list is pinned to the official 26; nothing else shows. */
export const CUSTOM_PROPERTY_ENTITY_TYPES: readonly string[] =
  CUSTOM_PROPERTY_TYPE_ENTRIES.map((item) => item.type);

export const CUSTOM_PROPERTY_ENTITY_TYPE_SET: ReadonlySet<string> = new Set(
  CUSTOM_PROPERTY_ENTITY_TYPES,
);
