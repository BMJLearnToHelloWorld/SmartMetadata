/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Lineage canvas configuration tables, mapped from the official
 * LineageConfigModal / LineageConfigPage / LineageLayers / LineageTimeFilter.
 * Every option is a data row, never an if-else enumeration: adding an
 * option means adding a row. Rows carry a `supported` flag so that
 * options without a product API surface stay visible-but-disabled
 * instead of silently vanishing or pretending to work.
 */
import { clampLineageDepth, LINEAGE_DEPTH_DEFAULT } from './depth';

export type LineageLayer = 'EntityLineage' | 'ColumnLevelLineage' | 'DataObservability';
export type LineagePipelineMode = 'Node' | 'Edge';
export type LineageTimePreset = 'allTime' | 'last7Days' | 'last14Days' | 'last28Days' | 'customRange' | 'pointInTime';
export type LineagePlatformLens = 'service' | 'domain' | 'dataProduct';

export interface LineageConfigField {
  key: 'upstreamDepth' | 'downstreamDepth' | 'nodesPerLayer';
  labelKey: string;
  min: number;
  /** Official modal minima; the product fetch clamp (depth 0-3) still applies at fetch time. */
  defaultValue: number;
}

/** Official LINEAGE_CONFIG_FIELDS, in modal order. */
export const LINEAGE_CONFIG_FIELDS: LineageConfigField[] = [
  { key: 'upstreamDepth', labelKey: 'lineage.upstreamDepth', min: 0, defaultValue: LINEAGE_DEPTH_DEFAULT },
  { key: 'downstreamDepth', labelKey: 'lineage.downstreamDepth', min: 0, defaultValue: LINEAGE_DEPTH_DEFAULT },
  { key: 'nodesPerLayer', labelKey: 'lineage.nodesPerLayer', min: 5, defaultValue: 50 },
];

export interface LineageLayerOption {
  value: LineageLayer;
  labelKey: string;
  /** DataObservability has no overlay data on the product graph. */
  supported: boolean;
}

export const LINEAGE_LAYERS: LineageLayerOption[] = [
  { value: 'EntityLineage', labelKey: 'settings.lineage.entityLineage', supported: true },
  { value: 'ColumnLevelLineage', labelKey: 'settings.lineage.columnLineage', supported: true },
  { value: 'DataObservability', labelKey: 'settings.lineage.dataObservability', supported: false },
];

export interface LineagePipelineModeOption {
  value: LineagePipelineMode;
  labelKey: string;
}

export const LINEAGE_PIPELINE_MODES: LineagePipelineModeOption[] = [
  { value: 'Node', labelKey: 'settings.lineage.node' },
  { value: 'Edge', labelKey: 'settings.lineage.edge' },
];

export interface LineageTimePresetOption {
  value: LineageTimePreset;
  labelKey: string;
  days?: number;
  supported: boolean;
}

export const LINEAGE_TIME_PRESETS: LineageTimePresetOption[] = [
  { value: 'allTime', labelKey: 'lineage.timeAllTime', supported: true },
  { value: 'last7Days', labelKey: 'lineage.timeLast7Days', days: 7, supported: true },
  { value: 'last14Days', labelKey: 'lineage.timeLast14Days', days: 14, supported: true },
  { value: 'last28Days', labelKey: 'lineage.timeLast28Days', days: 28, supported: true },
  { value: 'customRange', labelKey: 'lineage.timeCustomRange', supported: true },
  { value: 'pointInTime', labelKey: 'lineage.timePointInTime', supported: true },
];

export interface LineageTimeRange {
  startTime?: number;
  endTime?: number;
}

/**
 * Pure preset resolution, mirroring the official time filter: all-time is
 * undefined/undefined, last-N-days ends at `now`, point-in-time is
 * end-only. The canvas sends this range to the search-backed
 * GET /v1/lineage/getLineage (the traversal GET accepts no time params).
 */
export function timeRangeForPreset(preset: LineageTimePreset, now = Date.now()): LineageTimeRange {
  const option = LINEAGE_TIME_PRESETS.find((item) => item.value === preset);
  if (!option || !option.days) {
    return {};
  }
  return { startTime: now - option.days * 24 * 60 * 60 * 1000, endTime: now };
}

/**
 * Date-input helpers, mirroring the official LineageTimeFilter date
 * semantics (openmetadata-ui components/Entity/EntityLineage/
 * LineageTimeFilter.component.tsx + utils/date-time/calendarDate.utils.ts):
 * a picked day resolves to local midnight, and a range/point end resolves
 * to the last millisecond of the picked day (next local midnight minus 1),
 * so the end day itself is included instead of cut off at 00:00.
 */
const LINEAGE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isLineageDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !LINEAGE_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function lineageDateToStartMillis(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

export function lineageDateToEndMillis(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + 1).getTime() - 1;
}

/**
 * Full range resolution for a canvas config: day presets via
 * timeRangeForPreset, customRange from its two picked dates, pointInTime
 * from its single picked date (end-only, like the official filter).
 * A custom range without two valid, ordered dates, or a point-in-time
 * without a valid date, resolves to {} — the canvas still queries the
 * search endpoint with no time params, and the filter UI keeps Apply
 * disabled until the dates are valid, so an invalid pick can never be
 * sent as a half-formed range.
 */
export function resolveLineageTimeRange(
  config: Pick<LineageCanvasConfig, 'timePreset' | 'customStartDate' | 'customEndDate' | 'pointDate'>,
  now = Date.now(),
): LineageTimeRange {
  if (config.timePreset === 'customRange') {
    if (
      isLineageDateString(config.customStartDate) &&
      isLineageDateString(config.customEndDate) &&
      config.customStartDate <= config.customEndDate
    ) {
      return {
        startTime: lineageDateToStartMillis(config.customStartDate),
        endTime: lineageDateToEndMillis(config.customEndDate),
      };
    }
    return {};
  }
  if (config.timePreset === 'pointInTime') {
    if (isLineageDateString(config.pointDate)) {
      return { endTime: lineageDateToEndMillis(config.pointDate) };
    }
    return {};
  }
  return timeRangeForPreset(config.timePreset, now);
}

export interface LineagePlatformLensOption {
  value: LineagePlatformLens;
  labelKey: string;
  /** No scene endpoint exists on the product lineage API. */
  supported: boolean;
}

export const LINEAGE_PLATFORM_LENSES: LineagePlatformLensOption[] = [
  { value: 'service', labelKey: 'lineage.lensService', supported: false },
  { value: 'domain', labelKey: 'lineage.lensDomain', supported: false },
  { value: 'dataProduct', labelKey: 'lineage.lensDataProduct', supported: false },
];

export const LINEAGE_NODES_PER_LAYER_MIN = 5;
export const LINEAGE_NODES_PER_LAYER_DEFAULT = 50;

export function clampNodesPerLayer(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return LINEAGE_NODES_PER_LAYER_DEFAULT;
  }
  return Math.max(LINEAGE_NODES_PER_LAYER_MIN, Math.trunc(numeric));
}

export interface LineageCanvasConfig {
  upstreamDepth: number;
  downstreamDepth: number;
  nodesPerLayer: number;
  layer: LineageLayer;
  pipelineViewMode: LineagePipelineMode;
  timePreset: LineageTimePreset;
  /** Picked dates for customRange (both) and pointInTime (pointDate only). */
  customStartDate?: string;
  customEndDate?: string;
  pointDate?: string;
}

export const DEFAULT_LINEAGE_CANVAS_CONFIG: LineageCanvasConfig = {
  upstreamDepth: LINEAGE_DEPTH_DEFAULT,
  downstreamDepth: LINEAGE_DEPTH_DEFAULT,
  nodesPerLayer: LINEAGE_NODES_PER_LAYER_DEFAULT,
  layer: 'EntityLineage',
  pipelineViewMode: 'Node',
  timePreset: 'allTime',
};

export function normalizeLineageCanvasConfig(value: unknown): LineageCanvasConfig {
  const rec = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const layer = LINEAGE_LAYERS.find((item) => item.value === rec.layer && item.supported);
  const mode = LINEAGE_PIPELINE_MODES.find((item) => item.value === rec.pipelineViewMode);
  const preset = LINEAGE_TIME_PRESETS.find((item) => item.value === rec.timePreset);
  return {
    upstreamDepth: clampLineageDepth(rec.upstreamDepth),
    downstreamDepth: clampLineageDepth(rec.downstreamDepth),
    nodesPerLayer: clampNodesPerLayer(rec.nodesPerLayer),
    layer: layer ? layer.value : DEFAULT_LINEAGE_CANVAS_CONFIG.layer,
    pipelineViewMode: mode ? mode.value : DEFAULT_LINEAGE_CANVAS_CONFIG.pipelineViewMode,
    timePreset: preset ? preset.value : DEFAULT_LINEAGE_CANVAS_CONFIG.timePreset,
    ...(isLineageDateString(rec.customStartDate) ? { customStartDate: rec.customStartDate } : {}),
    ...(isLineageDateString(rec.customEndDate) ? { customEndDate: rec.customEndDate } : {}),
    ...(isLineageDateString(rec.pointDate) ? { pointDate: rec.pointDate } : {}),
  };
}
