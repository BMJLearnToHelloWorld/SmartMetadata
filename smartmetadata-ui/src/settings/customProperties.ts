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
 * cards (GlobalSettingsClassBase.ts:748-986, pin a3012259ca). This module is
 * the single definition of the list: the Settings Hub and the custom
 * property types list both import it, so the two surfaces cannot drift
 * apart. ADR:2026-11-07-custom-properties-s12-hub-allowlist-delete-patch.
 *
 * The authored order is the en-US label order, but it is NOT the display
 * order: the Hub sorts by rendered label at render time (official sorts at
 * :986; see sortSettingsItemsByRenderedTitle). Icons are mapped onto the
 * product's existing ant-design icon set; no official icon asset is
 * introduced. Description copy follows official: 17 items interpolate the
 * plural entity label and 8 the singular, Columns uses its own
 * column-level message. ADR:2026-11-08-custom-properties-s3-config-write-side.
 *
 * The settings-shell registry (`./registry`) does NOT reuse the
 * `titleKey`/`entityKey` values above for its cards: those keys carry
 * the old pluralized labels, while the registry's card titles follow
 * pin's singular/plural table exactly (DESIGN §3.3, B1) through new
 * `settings.registry.*` keys. This module remains the home of the 26
 * types and the §3.5 segment ↔ type mapping.
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

/**
 * URL segment ↔ metadata type, both directions (§3.5). Pin's URL
 * segments are `GlobalSettingOptions` values
 * (`constants/GlobalSettings.constants.ts:29-114`); the metadata types
 * are the product's `type` names above. Values cross-checked against pin
 * `ENTITY_PATH` (`constants/constants.ts:382-419`) and pin
 * `SETTING_OPTION_BY_ENTITY_TYPE`
 * (`utils/GlobalSettingsUtils.tsx:46-72`). The segment vocabulary
 * differs from the search-settings one (registry
 * `SEARCH_SETTINGS_SEGMENT_ENTITIES`): the two tables must not be
 * merged. Unknown segments resolve to `undefined` — the detail page
 * renders its in-page error state (D-10); there is no fallback to
 * `tables` (pin's `?? TABLES` is a utility default, not route
 * semantics).
 */
export interface CustomPropertySegmentMapping {
  /** Pin URL segment, e.g. `apiCollections`. */
  segment: string;
  /** Metadata type name, e.g. `apiCollection`. */
  type: string;
}

export const CUSTOM_PROPERTY_SEGMENT_MAPPINGS: readonly CustomPropertySegmentMapping[] = [
  { segment: 'apiCollections', type: 'apiCollection' },
  { segment: 'apiEndpoints', type: 'apiEndpoint' },
  { segment: 'dataProducts', type: 'dataProduct' },
  { segment: 'dashboardDataModels', type: 'dashboardDataModel' },
  { segment: 'databases', type: 'database' },
  { segment: 'databaseSchemas', type: 'databaseSchema' },
  { segment: 'metrics', type: 'metric' },
  { segment: 'tables', type: 'table' },
  { segment: 'storedProcedures', type: 'storedProcedure' },
  { segment: 'dashboards', type: 'dashboard' },
  { segment: 'pipelines', type: 'pipeline' },
  { segment: 'topics', type: 'topic' },
  { segment: 'containers', type: 'container' },
  { segment: 'mlmodels', type: 'mlmodel' },
  { segment: 'searchIndexes', type: 'searchIndex' },
  { segment: 'column', type: 'tableColumn' },
  { segment: 'glossaryTerm', type: 'glossaryTerm' },
  { segment: 'domains', type: 'domain' },
  { segment: 'charts', type: 'chart' },
  { segment: 'directories', type: 'directory' },
  { segment: 'files', type: 'file' },
  { segment: 'spreadsheets', type: 'spreadsheet' },
  { segment: 'worksheets', type: 'worksheet' },
  { segment: 'articles', type: 'page' },
  { segment: 'teams', type: 'team' },
  { segment: 'users', type: 'user' },
];

const CUSTOM_PROPERTY_TYPE_BY_SEGMENT: Readonly<Record<string, string>> =
  Object.fromEntries(
    CUSTOM_PROPERTY_SEGMENT_MAPPINGS.map(({ segment, type }) => [segment, type]),
  );

const CUSTOM_PROPERTY_SEGMENT_BY_TYPE: Readonly<Record<string, string>> =
  Object.fromEntries(
    CUSTOM_PROPERTY_SEGMENT_MAPPINGS.map(({ segment, type }) => [type, segment]),
  );

/** Metadata type for a custom-properties URL segment; `undefined` when unknown. */
export function customPropertyTypeForSegment(segment: string): string | undefined {
  return CUSTOM_PROPERTY_TYPE_BY_SEGMENT[segment];
}

/** URL segment for a metadata type; `undefined` when unknown. */
export function customPropertySegmentForType(type: string): string | undefined {
  return CUSTOM_PROPERTY_SEGMENT_BY_TYPE[type];
}
