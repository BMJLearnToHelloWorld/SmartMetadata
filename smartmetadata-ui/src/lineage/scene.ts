/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Platform lineage scene model + pure helpers, ported from the official
 * LineageMap surface (openmetadata-ui, pin a3012259ca):
 * - `components/Lineage/LineageMap/LineageMap.utils.ts` (request/search,
 *   lens/band labels, breadcrumbs, rail, drill, semantic zoom, landing
 *   viewport)
 * - `components/Lineage/LineageMap/LineageSceneCache.utils.ts` (bounded
 *   scene cache)
 * - `components/Lineage/LineageMap/LineageMapEdit.utils.ts` (field
 *   endpoints, editable-node/edge gates)
 * - `generated/api/lineage/lineageScene.ts` (scene model)
 *
 * Adaptations, all structural (behavior unchanged):
 * - No `qs` dependency in the product: search parsing uses URLSearchParams.
 * - No `lru-cache` dependency in the product: the cache is a bounded Map
 *   with the same cap (50) and the same load/dedup/evict semantics.
 * - Node layout reuses the product's ELK `layoutLineageGraph` (see
 *   `mapSceneToGraphModel`); the official ELK layout is L2's decision
 *   (D-LAYOUT-1), ported by the ELK lane.
 * - Translation is a `(key, params?) => string` function instead of
 *   i18next's TFunction, so the helpers stay framework-free.
 */
import type { LineageGraphEdge, LineageGraphModel, LineageGraphNode } from './graphModel';
import { lineagePathLabel, lineageServiceName, truncateLineageFqn } from './nodeChrome';

export type LineageLens = 'service' | 'domain' | 'dataProduct';
export type LineageBand = 'ASSET' | 'FIELD' | 'LAYER';

export type LineageLevelKind =
  | 'apiEndpoint'
  | 'asset'
  | 'chart'
  | 'column'
  | 'container'
  | 'dashboard'
  | 'dashboardDataModel'
  | 'dataProduct'
  | 'database'
  | 'directory'
  | 'domain'
  | 'feature'
  | 'field'
  | 'file'
  | 'metric'
  | 'model'
  | 'pipeline'
  | 'schema'
  | 'searchIndex'
  | 'service'
  | 'spreadsheet'
  | 'storedProcedure'
  | 'table'
  | 'task'
  | 'topic'
  | 'worksheet';

export interface LineageSceneField {
  dataType?: string;
  fullyQualifiedName?: string;
  id: string;
  name: string;
}

export interface LineageSceneNode {
  band: LineageBand;
  certification?: string;
  childrenCount?: number;
  counts?: Record<string, number>;
  displayName?: string;
  entityType?: string;
  fields?: LineageSceneField[];
  fullyQualifiedName?: string;
  hiddenChildrenCount?: number;
  id: string;
  isExpandable?: boolean;
  isFocus?: boolean;
  isGhost?: boolean;
  isOrigin?: boolean;
  label: string;
  levelKind: LineageLevelKind;
  parentFqn?: string;
  parentId?: string;
  serviceType?: string;
  sourceEntity?: Record<string, unknown>;
}

export interface LineageSceneEdge {
  band: LineageBand;
  description?: string;
  from: string;
  id: string;
  isRollup?: boolean;
  label?: string;
  pipeline?: {
    deleted?: boolean;
    description?: string;
    displayName?: string;
    fullyQualifiedName?: string;
    href?: string;
    id: string;
    inherited?: boolean;
    name?: string;
    type: string;
  };
  source?: string;
  sqlQuery?: string;
  to: string;
  transform?: string;
  underlyingEdgeIds?: string[];
  weight?: number;
}

export interface LineageSceneBreadcrumb {
  band: LineageBand;
  entityType?: string;
  fullyQualifiedName?: string;
  id: string;
  label: string;
  levelKind: LineageLevelKind;
}

export interface LineageScene {
  band: LineageBand;
  breadcrumb: LineageSceneBreadcrumb[];
  edges: LineageSceneEdge[];
  focusEntityType?: string;
  focusFqn?: string;
  hiddenNodeCount?: number;
  lens: LineageLens;
  nodes: LineageSceneNode[];
  originEntityType?: string;
  originFqn?: string;
  sampled?: boolean;
}

export type SceneTranslator = (key: string, params?: Record<string, string | number>) => string;

/** Scene focus: both FQN and entity type, or neither (platform root). */
export type LineageSceneFocus =
  | { focusFqn: string; entityType: string }
  | { focusFqn?: never; entityType?: never };

export type LineageSceneRequest = LineageSceneFocus & {
  lens: LineageLens;
  band: LineageBand;
};

export interface LineageSceneFetchOptions {
  upstreamDepth?: number;
  downstreamDepth?: number;
  /** Official scene default is 200 (not the canvas 50). */
  nodesPerLayer?: number;
  queryFilter?: string;
  pipelineViewMode?: 'Node' | 'Edge';
}

export const LINEAGE_SCENE_NODES_PER_LAYER_DEFAULT = 200;
/** Official MAX_SCENE_DEPTH: scene depths are clamped to 3, like the canvas. */
export const LINEAGE_SCENE_DEPTH_MAX = 3;

const ASSET_LEVEL_KINDS = new Set<LineageLevelKind>([
  'table',
  'topic',
  'dashboard',
  'dashboardDataModel',
  'model',
  'pipeline',
  'storedProcedure',
  'container',
  'searchIndex',
  'apiEndpoint',
  'metric',
  'directory',
  'file',
  'spreadsheet',
  'worksheet',
  'asset',
]);

const LENS_CONTAINER_LEVEL_KINDS = new Set<LineageLevelKind>(['service', 'domain', 'dataProduct']);

const CONTAINER_LEVEL_KINDS = new Set<LineageLevelKind>([
  'service',
  'database',
  'schema',
  'domain',
  'dataProduct',
]);

/** Count-kind priority for the container count pill, official order. */
const COUNT_KIND_PRIORITY: LineageLevelKind[] = [
  'table',
  'topic',
  'dashboard',
  'dashboardDataModel',
  'model',
  'pipeline',
  'storedProcedure',
  'container',
  'searchIndex',
  'apiEndpoint',
  'metric',
  'directory',
  'file',
  'spreadsheet',
  'worksheet',
  'asset',
];

const LEVEL_LABEL_KEYS: Partial<Record<LineageLevelKind, string>> = {
  service: 'lineage.mapLevelService',
  database: 'lineage.mapLevelDatabase',
  schema: 'lineage.mapLevelSchema',
  table: 'lineage.mapLevelTable',
  topic: 'lineage.mapLevelTopic',
  dashboard: 'lineage.mapLevelDashboard',
  model: 'lineage.mapLevelModel',
  pipeline: 'lineage.mapLevelPipeline',
  container: 'lineage.mapLevelContainer',
  searchIndex: 'lineage.mapLevelSearchIndex',
  apiEndpoint: 'lineage.mapLevelApiEndpoint',
  metric: 'lineage.mapLevelMetric',
  directory: 'lineage.mapLevelDirectory',
  file: 'lineage.mapLevelFile',
  spreadsheet: 'lineage.mapLevelSpreadsheet',
  worksheet: 'lineage.mapLevelWorksheet',
  column: 'lineage.mapLevelField',
  field: 'lineage.mapLevelField',
  domain: 'lineage.mapLevelDomain',
  dataProduct: 'lineage.mapLevelDataProduct',
};

const LEVEL_ENTITY_LABEL_KEYS: Record<LineageLevelKind, { singular: string; plural: string }> = {
  service: { singular: 'lineage.mapKindService', plural: 'lineage.mapKindServicePlural' },
  database: { singular: 'lineage.mapKindDatabase', plural: 'lineage.mapKindDatabasePlural' },
  schema: { singular: 'lineage.mapKindSchema', plural: 'lineage.mapKindSchemaPlural' },
  table: { singular: 'lineage.mapKindTable', plural: 'lineage.mapKindTablePlural' },
  topic: { singular: 'lineage.mapKindTopic', plural: 'lineage.mapKindTopicPlural' },
  dashboard: { singular: 'lineage.mapKindDashboard', plural: 'lineage.mapKindDashboardPlural' },
  dashboardDataModel: {
    singular: 'lineage.mapKindDashboardDataModel',
    plural: 'lineage.mapKindDashboardDataModelPlural',
  },
  model: { singular: 'lineage.mapKindModel', plural: 'lineage.mapKindModelPlural' },
  pipeline: { singular: 'lineage.mapKindPipeline', plural: 'lineage.mapKindPipelinePlural' },
  storedProcedure: {
    singular: 'lineage.mapKindStoredProcedure',
    plural: 'lineage.mapKindStoredProcedurePlural',
  },
  container: { singular: 'lineage.mapKindContainer', plural: 'lineage.mapKindContainerPlural' },
  searchIndex: { singular: 'lineage.mapKindSearchIndex', plural: 'lineage.mapKindSearchIndexPlural' },
  apiEndpoint: { singular: 'lineage.mapKindApiEndpoint', plural: 'lineage.mapKindApiEndpointPlural' },
  metric: { singular: 'lineage.mapKindMetric', plural: 'lineage.mapKindMetricPlural' },
  directory: { singular: 'lineage.mapKindDirectory', plural: 'lineage.mapKindDirectoryPlural' },
  file: { singular: 'lineage.mapKindFile', plural: 'lineage.mapKindFilePlural' },
  spreadsheet: { singular: 'lineage.mapKindSpreadsheet', plural: 'lineage.mapKindSpreadsheetPlural' },
  worksheet: { singular: 'lineage.mapKindWorksheet', plural: 'lineage.mapKindWorksheetPlural' },
  domain: { singular: 'lineage.mapKindDomain', plural: 'lineage.mapKindDomainPlural' },
  dataProduct: { singular: 'lineage.mapKindDataProduct', plural: 'lineage.mapKindDataProductPlural' },
  asset: { singular: 'lineage.mapKindAsset', plural: 'lineage.mapKindAssetPlural' },
  column: { singular: 'lineage.mapKindColumn', plural: 'lineage.mapKindColumnPlural' },
  field: { singular: 'lineage.mapKindField', plural: 'lineage.mapKindFieldPlural' },
  chart: { singular: 'lineage.mapKindChart', plural: 'lineage.mapKindChartPlural' },
  feature: { singular: 'lineage.mapKindFeature', plural: 'lineage.mapKindFeaturePlural' },
  task: { singular: 'lineage.mapKindTask', plural: 'lineage.mapKindTaskPlural' },
};

export const getBandLabelKey = (band: LineageBand): string => {
  switch (band) {
    case 'LAYER':
      return 'lineage.mapLayerView';
    case 'FIELD':
      return 'lineage.mapFieldLevel';
    default:
      return 'lineage.mapAssetLevel';
  }
};

export const getSceneFocus = (focusFqn?: string, entityType?: string): LineageSceneFocus =>
  focusFqn && entityType ? { focusFqn, entityType } : {};

export const getSceneOriginFocus = (
  scene: LineageScene | undefined,
  routeFocus: LineageSceneFocus,
): LineageSceneFocus =>
  routeFocus.focusFqn ? routeFocus : getSceneFocus(scene?.originFqn, scene?.originEntityType);

const LENS_VALUES: LineageLens[] = ['service', 'domain', 'dataProduct'];
const BAND_VALUES: LineageBand[] = ['ASSET', 'FIELD', 'LAYER'];

/**
 * Official `getSceneRequestFromSearch`: lens/band/focus round-trip through
 * `lineageLens` / `lineageBand` / `lineageFocus` / `lineageEntityType`.
 * Platform root defaults to the Layer band; a focused scene to Asset.
 * An asset page's Layer band stays focused on that asset; only the main
 * Lineage page shows the whole hierarchy.
 */
export const getSceneRequestFromSearch = (
  search: string,
  defaultFocus: LineageSceneFocus,
  isPlatformLineage = false,
): LineageSceneRequest => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const lensParam = params.get('lineageLens');
  const lens: LineageLens =
    (LENS_VALUES.find((value) => value === lensParam) as LineageLens | undefined) ?? 'service';
  const defaultBand: LineageBand =
    isPlatformLineage && !defaultFocus.focusFqn ? 'LAYER' : 'ASSET';
  const bandParam = params.get('lineageBand');
  const band: LineageBand =
    (BAND_VALUES.find((value) => value === bandParam) as LineageBand | undefined) ?? defaultBand;
  // An asset page's Layer band (its Service / Domain / Data Product view) stays
  // focused on that asset; only the main Lineage page shows the whole hierarchy.
  const fallbackFocus: LineageSceneFocus =
    band === 'LAYER' && isPlatformLineage ? {} : defaultFocus;
  return {
    lens,
    band,
    ...getSceneFocus(
      params.get('lineageFocus') ?? fallbackFocus.focusFqn,
      params.get('lineageEntityType') ?? fallbackFocus.entityType,
    ),
  };
};

export const getSceneSearch = (search: string, request: LineageSceneRequest): string => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.set('lineageLens', request.lens);
  params.set('lineageBand', request.band);
  if (request.focusFqn) {
    params.set('lineageFocus', request.focusFqn);
  } else {
    params.delete('lineageFocus');
  }
  if (request.entityType) {
    params.set('lineageEntityType', request.entityType);
  } else {
    params.delete('lineageEntityType');
  }
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const getLensRootLabelKey = (lens: LineageLens): string => {
  switch (lens) {
    case 'domain':
      return 'lineage.mapAllDomains';
    case 'dataProduct':
      return 'lineage.mapAllDataProducts';
    default:
      return 'lineage.mapAllServices';
  }
};

export const getLensLabelKey = (lens: LineageLens): string => {
  switch (lens) {
    case 'domain':
      return 'lineage.mapDomain';
    case 'dataProduct':
      return 'lineage.mapDataProduct';
    default:
      return 'lineage.mapService';
  }
};

/**
 * The root breadcrumb of a scene that has been drilled into, i.e. the way
 * back to "All services" (or domains / data products). Undefined at the
 * root itself.
 */
export const getDrilledRootBreadcrumb = (
  scene?: Pick<LineageScene, 'breadcrumb' | 'band' | 'focusFqn'>,
): LineageSceneBreadcrumb | undefined => {
  // An empty drilled scene comes back with only the root crumb, so whether it
  // is drilled is read from its focus and band, not from the trail's length.
  const isDrilled = Boolean(scene?.focusFqn) || (scene !== undefined && scene.band !== 'LAYER');
  return isDrilled
    ? scene?.breadcrumb.find((breadcrumb) => !breadcrumb.fullyQualifiedName)
    : undefined;
};

const getLowercaseLabel = (
  t: SceneTranslator,
  levelKind: LineageLevelKind,
  count = 1,
): string => {
  const labelKeys = LEVEL_ENTITY_LABEL_KEYS[levelKind];
  return t(count === 1 ? labelKeys.singular : labelKeys.plural).toLocaleLowerCase();
};

export const isContainerSceneNode = (node: LineageSceneNode): boolean =>
  CONTAINER_LEVEL_KINDS.has(node.levelKind);

// Container nodes (service, database, schema, domain, data product) say what
// they are under the name and how many assets they hold in a count pill.
export const getSceneNodeTypeSubtitle = (
  node: LineageSceneNode,
  t: SceneTranslator,
): string | undefined => {
  if (!isContainerSceneNode(node)) {
    return undefined;
  }
  const kind = getLowercaseLabel(t, node.levelKind);
  return node.serviceType
    ? t('lineage.mapNodeTypeSubtitle', { type: node.serviceType, kind })
    : kind;
};

export const getSceneNodeCount = (
  node: LineageSceneNode,
  t: SceneTranslator,
): { count: number; entity: string } | undefined => {
  if (!isContainerSceneNode(node)) {
    return undefined;
  }
  const countEntries = COUNT_KIND_PRIORITY.map((levelKind) => ({
    levelKind,
    count: node.counts?.[levelKind] ?? 0,
  })).filter(({ count }) => count > 0);
  if (countEntries.length === 0) {
    return undefined;
  }
  const count = countEntries.reduce((sum, entry) => sum + entry.count, 0);
  const countedLevelKind = countEntries.length === 1 ? countEntries[0].levelKind : 'asset';
  return { count, entity: getLowercaseLabel(t, countedLevelKind, count) };
};

export const getSceneLevelLabelKey = (scene: LineageScene): string => {
  if (scene.band === 'FIELD') {
    return 'lineage.mapLevelField';
  }
  const visibleLevels = new Set(scene.nodes.map((node) => node.levelKind));
  const concreteLevels = new Set(
    [...visibleLevels].filter((levelKind) => !LENS_CONTAINER_LEVEL_KINDS.has(levelKind)),
  );
  const labelLevels = concreteLevels.size > 0 ? concreteLevels : visibleLevels;
  if (labelLevels.size === 1) {
    const only = [...labelLevels][0];
    return LEVEL_LABEL_KEYS[only] ?? 'lineage.mapAssetLevel';
  }
  return getBandLabelKey(scene.band);
};

// The level rail has three stops. Everything between the lens containers
// (service / domain / data product) and fields — databases, schemas, tables —
// reads as "Data Assets", whichever band the scene is drawn in.
export const LINEAGE_MAP_RAIL_STOPS: LineageBand[] = ['LAYER', 'ASSET', 'FIELD'];

export type LineageMapEmptyState = 'loading' | 'error' | 'empty';

/** Which placeholder the map shows while it has no nodes to draw. */
export const getLineageMapEmptyState = ({
  scene,
  loading,
  hasError,
}: {
  scene?: LineageScene;
  loading: boolean;
  hasError: boolean;
}): LineageMapEmptyState => {
  if (scene) {
    return 'empty';
  }
  if (loading) {
    return 'loading';
  }
  return hasError ? 'error' : 'empty';
};

export const getRailStop = (scene: LineageScene): LineageBand => {
  if (scene.band === 'FIELD') {
    return 'FIELD';
  }
  const showsOnlyLensContainers = scene.nodes.every((node) =>
    LENS_CONTAINER_LEVEL_KINDS.has(node.levelKind),
  );
  return scene.band === 'LAYER' && showsOnlyLensContainers ? 'LAYER' : 'ASSET';
};

export const getRailStopLabelKey = (stop: LineageBand, lens: LineageLens): string => {
  if (stop === 'FIELD') {
    return 'lineage.mapFieldLevel';
  }
  if (stop === 'ASSET') {
    return 'lineage.mapAssetLevel';
  }
  switch (lens) {
    case 'domain':
      return 'lineage.mapDomain';
    case 'dataProduct':
      return 'lineage.mapDataProduct';
    default:
      return 'lineage.mapServiceLevelView';
  }
};

/**
 * Pin `isDeeperBand` (`LineageMap.component.tsx:418`): a stop is deeper
 * than the active one when it sits further down the rail order
 * (LAYER < ASSET < FIELD). The rail disables a deeper stop when nothing
 * on the scene can be drilled into.
 */
export const isDeeperBand = (currentBand: LineageBand, nextBand: LineageBand): boolean =>
  LINEAGE_MAP_RAIL_STOPS.indexOf(nextBand) > LINEAGE_MAP_RAIL_STOPS.indexOf(currentBand);

export const isSceneNodeDrillable = (
  node?: LineageSceneNode,
): node is LineageSceneNode & { fullyQualifiedName: string; entityType: string } =>
  Boolean(node?.isExpandable && node.fullyQualifiedName && node.entityType);

// The scene API marks every container expandable, even a service with no
// assets left, so a drill that the user did not aim at a node lands only on a
// node with children. The childrenCount check can go once the API stops
// marking empty containers.
export const isSceneNodeDrillableWithChildren = (node?: LineageSceneNode): boolean =>
  isSceneNodeDrillable(node) && (node.childrenCount ?? 0) > 0;

export const getRailDrillFallbackNode = (nodes: LineageSceneNode[]): LineageSceneNode | undefined =>
  nodes.find(isSceneNodeDrillableWithChildren) ?? nodes.find(isSceneNodeDrillable);

export const getDrillBand = (node: LineageSceneNode): LineageBand => {
  if (node.band === 'LAYER') {
    return 'ASSET';
  }
  return ASSET_LEVEL_KINDS.has(node.levelKind) ? 'FIELD' : 'ASSET';
};

export const getBreadcrumbSceneRequest = (
  scene: LineageScene,
  breadcrumb: LineageSceneBreadcrumb,
): LineageSceneRequest => {
  if (!breadcrumb.fullyQualifiedName || !breadcrumb.entityType) {
    return {
      lens: scene.lens,
      band: 'LAYER',
    };
  }
  const isLensRoot =
    breadcrumb.levelKind === 'service' ||
    breadcrumb.levelKind === 'domain' ||
    breadcrumb.levelKind === 'dataProduct';
  return {
    lens: scene.lens,
    band: isLensRoot ? 'ASSET' : breadcrumb.band,
    focusFqn: breadcrumb.fullyQualifiedName,
    entityType: breadcrumb.entityType,
  };
};

export interface DeleteKeyActionContext {
  canEdit: boolean;
  hasSelectedNode: boolean;
  hasSelectedEdge: boolean;
}

export type DeleteKeyAction = 'node' | 'edge';

/**
 * Official delete-key rule. The platform map always passes canEdit:false
 * (view and export only), so it always returns undefined — Delete /
 * Backspace never deletes from the map.
 */
export const getDeleteKeyAction = (
  event: KeyboardEvent,
  { canEdit, hasSelectedNode, hasSelectedEdge }: DeleteKeyActionContext,
): DeleteKeyAction | undefined => {
  if (!canEdit || (event.key !== 'Delete' && event.key !== 'Backspace')) {
    return undefined;
  }
  // Only act while focus is on the page or the canvas: never while typing,
  // and never from a drawer, modal or menu stacked over the canvas.
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.closest('input, textarea, [contenteditable="true"]') ||
      (target !== document.body && !target.closest('.vue-flow')))
  ) {
    return undefined;
  }
  if (hasSelectedNode) {
    return 'node';
  }
  return hasSelectedEdge ? 'edge' : undefined;
};

export const getParentSceneRequest = (
  scene: LineageScene,
): LineageSceneRequest | undefined => {
  if (scene.band === 'FIELD' && scene.focusFqn && scene.focusEntityType) {
    return {
      lens: scene.lens,
      band: 'ASSET',
      focusFqn: scene.focusFqn,
      entityType: scene.focusEntityType,
    };
  }
  if (!scene.focusFqn) {
    return scene.band === 'LAYER'
      ? undefined
      : {
          lens: scene.lens,
          band: 'LAYER',
        };
  }
  let currentIndex = -1;
  for (let index = scene.breadcrumb.length - 1; index >= 0; index--) {
    if (scene.breadcrumb[index].fullyQualifiedName === scene.focusFqn) {
      currentIndex = index;
      break;
    }
  }
  if (currentIndex > 1) {
    return getBreadcrumbSceneRequest(scene, scene.breadcrumb[currentIndex - 1]);
  }
  if (currentIndex === 1) {
    return {
      lens: scene.lens,
      band: 'LAYER',
    };
  }
  return undefined;
};

/**
 * Kept out of the map component so the upstream/downstream branch does
 * not nest inside the "both FQNs present" branch.
 */
export const getLineageEditColumnPair = (
  isUpstream: boolean,
  requestColumnFqn?: string,
  pickedColumnFqn?: string,
): { fromColumn: string; toColumn: string } | undefined => {
  if (!requestColumnFqn || !pickedColumnFqn) {
    return undefined;
  }
  return isUpstream
    ? { fromColumn: pickedColumnFqn, toColumn: requestColumnFqn }
    : { fromColumn: requestColumnFqn, toColumn: pickedColumnFqn };
};

// Semantic zoom switches level by how much of the screen the graph or a card
// fills, not by a zoom value, so it behaves the same for 5 nodes or 500.
export const ZOOM_OUT_SCREEN_FILL = 1 / 3;
// A 340px container on a ~1400px canvas drills at zoom ~1.43, well short of
// the 2.5 maximum. ADR:2026-10-27-lineage-semantic-zoom-drills-at-35-percent-after-settling
export const ZOOM_IN_SCREEN_FILL = 0.35;

export interface SceneSize {
  width: number;
  height: number;
}

export interface ScenePoint {
  x: number;
  y: number;
}

/** The box whose centre is closest to `point`, or undefined when there is none. */
export const getBoxNearestPoint = <T extends ScenePoint & SceneSize>(
  boxes: T[],
  point: ScenePoint,
): T | undefined =>
  boxes.reduce<{ box?: T; distance: number }>(
    (nearest, box) => {
      const distance = Math.hypot(
        box.x + box.width / 2 - point.x,
        box.y + box.height / 2 - point.y,
      );
      return distance < nearest.distance ? { box, distance } : nearest;
    },
    { distance: Number.POSITIVE_INFINITY },
  ).box;

/** Largest share of the screen's width or height that `size` covers at `zoom`. */
export const getScreenFill = (size: SceneSize, zoom: number, screen: SceneSize): number =>
  Math.max((size.width * zoom) / screen.width, (size.height * zoom) / screen.height);

/**
 * Zooming out goes up a level once the whole graph fits and fills less than a
 * third of the screen, or once it reaches the minimum zoom (a graph too large
 * to shrink that far); zooming in goes down a level once a card fills most of
 * the screen, or once it reaches the maximum zoom (a card too narrow to fill
 * a wide screen). Anything else is a plain zoom.
 */
export const getSemanticZoomDirection = ({
  previousZoom,
  zoom,
  graph,
  card,
  screen,
  minZoom,
  maxZoom,
}: {
  previousZoom: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  graph: SceneSize;
  card: SceneSize;
  screen: SceneSize;
}): 'in' | 'out' | undefined => {
  if (
    zoom > previousZoom &&
    (getScreenFill(card, zoom, screen) >= ZOOM_IN_SCREEN_FILL || zoom >= maxZoom)
  ) {
    return 'in';
  }
  if (
    zoom < previousZoom &&
    (getScreenFill(graph, zoom, screen) < ZOOM_OUT_SCREEN_FILL || zoom <= minZoom)
  ) {
    return 'out';
  }
  return undefined;
};

export interface SceneLayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
  isFocus?: boolean;
  isOrigin?: boolean;
  isGhost?: boolean;
}

const getBoxesBounds = (boxes: SceneLayoutBox[]) =>
  boxes.reduce(
    (bounds, box) => ({
      minX: Math.min(bounds.minX, box.x),
      minY: Math.min(bounds.minY, box.y),
      maxX: Math.max(bounds.maxX, box.x + box.width),
      maxY: Math.max(bounds.maxY, box.y + box.height),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );

/**
 * The viewport a scene opens at when it is too big for the canvas at its
 * minimum readable zoom; undefined when it fits and a plain fit applies.
 *
 * Clamping a fit's zoom keeps the centre of the whole scene in view. In the
 * layered layout that centre falls between layers, where only the collapsed
 * context nodes sit, so the scene's own nodes would open off-screen. Instead
 * the scene opens at the minimum zoom on what it was opened for: the focus
 * node, else the origin node, centred; or else the top of the left-most column
 * of real nodes, inset the way a fit would pad it.
 */
export const getSceneLandingViewport = (
  boxes: SceneLayoutBox[],
  canvas: { width: number; height: number },
  minZoom: number,
  padding: number,
): { x: number; y: number; zoom: number } | undefined => {
  if (boxes.length === 0 || canvas.width <= 0 || canvas.height <= 0) {
    return undefined;
  }
  const bounds = getBoxesBounds(boxes);
  const fitZoom = Math.min(
    canvas.width / ((bounds.maxX - bounds.minX) * (1 + padding)),
    canvas.height / ((bounds.maxY - bounds.minY) * (1 + padding)),
  );
  if (fitZoom >= minZoom) {
    return undefined;
  }
  const focusBoxes = boxes.filter((box) => box.isFocus);
  const rootBoxes = focusBoxes.length > 0 ? focusBoxes : boxes.filter((box) => box.isOrigin);
  if (rootBoxes.length > 0) {
    const rootBounds = getBoxesBounds(rootBoxes);
    return {
      x: canvas.width / 2 - ((rootBounds.minX + rootBounds.maxX) / 2) * minZoom,
      y: canvas.height / 2 - ((rootBounds.minY + rootBounds.maxY) / 2) * minZoom,
      zoom: minZoom,
    };
  }
  const realBoxes = boxes.filter((box) => !box.isGhost);
  const candidates = realBoxes.length > 0 ? realBoxes : boxes;
  const firstBox = candidates.reduce(
    (first, box) =>
      box.x < first.x || (box.x === first.x && box.y < first.y) ? box : first,
    candidates[0],
  );
  const inset = padding / (2 * (1 + padding));
  return {
    x: canvas.width * inset - firstBox.x * minZoom,
    y: canvas.height * inset - firstBox.y * minZoom,
    zoom: minZoom,
  };
};

export const getSceneCacheKey = (
  request: LineageSceneRequest,
  fetchOptions: Pick<
    LineageSceneFetchOptions,
    'upstreamDepth' | 'downstreamDepth' | 'nodesPerLayer' | 'pipelineViewMode'
  >,
  queryFilter = '',
): string =>
  [
    request.lens,
    request.band,
    request.focusFqn ?? '',
    request.entityType ?? '',
    fetchOptions.upstreamDepth ?? 1,
    fetchOptions.downstreamDepth ?? 1,
    fetchOptions.nodesPerLayer ?? LINEAGE_SCENE_NODES_PER_LAYER_DEFAULT,
    fetchOptions.pipelineViewMode ?? 'Node',
    queryFilter,
  ].join('|');

const SCENE_CACHE_LIMIT = 50;

interface SceneCacheEntry {
  promise: Promise<LineageScene>;
  value?: LineageScene;
}

/**
 * Bounded scene cache, official semantics: in-flight requests are shared
 * by key, resolved values are kept, and a failed load evicts its entry —
 * but only if the entry is still the current one for the key, so a
 * refresh that already replaced it is never discarded by a stale failure.
 * The cap is 50 entries; the least recently used entry is dropped first.
 */
export class LineageSceneCache {
  private readonly entries = new Map<string, SceneCacheEntry>();

  get(key: string): LineageScene | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    // Refresh recency on read, like an LRU.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  load(
    key: string,
    fetchScene: () => Promise<LineageScene>,
    refresh = false,
  ): Promise<LineageScene> {
    const existing = refresh ? undefined : this.entries.get(key);
    if (existing) {
      return existing.promise;
    }
    // Resolve into the entry, never back into the map: invalidation must also
    // discard responses from requests that were already running.
    const entry: SceneCacheEntry = {
      promise: Promise.resolve()
        .then(fetchScene)
        .then(
          (scene) => {
            entry.value = scene;
            return scene;
          },
          (error: unknown) => {
            if (this.entries.get(key) === entry) {
              this.entries.delete(key);
            }
            throw error;
          },
        ),
    };
    this.entries.set(key, entry);
    while (this.entries.size > SCENE_CACHE_LIMIT) {
      const oldest = this.entries.keys().next();
      if (oldest.done) {
        break;
      }
      this.entries.delete(oldest.value);
    }
    return entry.promise;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Which bands a loaded scene prefetches into the cache: from Asset, the
 * Layer above and the Field below; from any other band, Asset. Failures
 * are swallowed — a prefetch must never surface as a scene error.
 */
export const getPrefetchBands = (band: LineageBand): LineageBand[] =>
  band === 'ASSET' ? ['LAYER', 'FIELD'] : ['ASSET'];

export const prefetchSceneBands = (
  cache: LineageSceneCache,
  scene: LineageScene,
  request: LineageSceneRequest,
  fetchOptions: LineageSceneFetchOptions,
  fetchScene: (request: LineageSceneRequest) => Promise<LineageScene>,
): void => {
  for (const band of getPrefetchBands(scene.band)) {
    const nextRequest = { ...request, band };
    const key = getSceneCacheKey(nextRequest, fetchOptions, fetchOptions.queryFilter ?? '');
    cache.load(key, () => fetchScene(nextRequest)).catch(() => undefined);
  }
};

// Onboarding: shown once per browser on the platform map, then remembered
// for a year. Cookie name matches the official `lineageMapsOnboardingSeen`.
export const LINEAGE_MAP_ONBOARDING_COOKIE = 'lineageMapsOnboardingSeen';

export const getLineageMapOnboardingExpiry = (): Date => {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry;
};

const readCookie = (name: string): string | undefined => {
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
};

export const hasSeenLineageMapOnboarding = (): boolean =>
  readCookie(LINEAGE_MAP_ONBOARDING_COOKIE) === 'true';

export const markLineageMapOnboardingSeen = (): void => {
  document.cookie =
    `${LINEAGE_MAP_ONBOARDING_COOKIE}=true; expires=${getLineageMapOnboardingExpiry().toUTCString()}; path=/`;
};

export const FIELD_SEPARATOR = '::field::';

export const getEndpointNodeId = (endpoint: string): string => {
  const separatorIndex = endpoint.indexOf(FIELD_SEPARATOR);
  return separatorIndex === -1 ? endpoint : endpoint.slice(0, separatorIndex);
};

export const getEndpointHandle = (endpoint: string): string | undefined => {
  const separatorIndex = endpoint.indexOf(FIELD_SEPARATOR);
  return separatorIndex === -1
    ? undefined
    : endpoint.slice(separatorIndex + FIELD_SEPARATOR.length);
};

export interface SceneEntityRef {
  id: string;
  type: string;
  fullyQualifiedName?: string;
}

export const getRealEntityRef = (node?: LineageSceneNode): SceneEntityRef | undefined => {
  if (!node) {
    return undefined;
  }
  const sourceEntity = node.sourceEntity ?? {};
  const id = typeof sourceEntity.id === 'string' ? sourceEntity.id : undefined;
  const rawType = sourceEntity.entityType ?? sourceEntity.type;
  const type = typeof rawType === 'string' ? rawType : node.entityType;
  if (!id || !type) {
    return undefined;
  }
  const rawFqn = sourceEntity.fullyQualifiedName;
  return {
    id,
    type,
    fullyQualifiedName:
      typeof rawFqn === 'string' ? rawFqn : node.fullyQualifiedName,
  };
};

const EDITABLE_ASSET_LEVEL_KINDS = ASSET_LEVEL_KINDS;

export const isEditableSceneNode = (node?: LineageSceneNode): node is LineageSceneNode => {
  if (!node || node.band === 'LAYER' || !EDITABLE_ASSET_LEVEL_KINDS.has(node.levelKind)) {
    return false;
  }
  const sourceEntity = node.sourceEntity ?? {};
  return (
    sourceEntity.lineageSceneSyntheticCount !== true && Boolean(getRealEntityRef(node))
  );
};

export const isEditableSceneEdge = (
  edge: LineageSceneEdge,
  nodeById: Map<string, LineageSceneNode>,
): boolean => {
  const sourceHandle = getEndpointHandle(edge.from);
  const targetHandle = getEndpointHandle(edge.to);
  const hasValidHandlePair =
    (sourceHandle === undefined && targetHandle === undefined) ||
    (sourceHandle !== undefined && targetHandle !== undefined);
  const isSingleEdge = !edge.isRollup && (edge.weight ?? 1) === 1;
  return (
    hasValidHandlePair &&
    isSingleEdge &&
    isEditableSceneNode(nodeById.get(getEndpointNodeId(edge.from))) &&
    isEditableSceneNode(nodeById.get(getEndpointNodeId(edge.to)))
  );
};

/**
 * Adapt a fetched scene to the product graph model so the map reuses the
 * existing ELK layout (`layoutLineageGraph`) and node chrome. Field-band
 * edges keep their `::field::` handles as column edges; all other bands
 * draw plain entity edges. Edges whose endpoints are not in the scene are
 * dropped — ELK would otherwise lay out sizeless implicit nodes.
 */
export function mapSceneToGraphModel(scene: LineageScene): LineageGraphModel {
  const nodeIds = new Set(scene.nodes.map((node) => node.id));
  const nodes: LineageGraphNode[] = scene.nodes.map((node) => {
    const fqn = node.fullyQualifiedName ?? node.label;
    return {
      id: node.id,
      entityType: node.entityType ?? node.levelKind,
      name: node.label,
      displayName: node.displayName ?? node.label,
      fullyQualifiedName: fqn,
      isCenter: node.isFocus ?? false,
      serviceName: lineageServiceName(fqn),
      pathLabel: lineagePathLabel(fqn),
      truncatedFqn: truncateLineageFqn(fqn),
      columns: (node.fields ?? []).map((field) => ({
        fqn: field.fullyQualifiedName ?? field.id,
        name: field.name,
      })),
    };
  });
  const edges: LineageGraphEdge[] = scene.edges.flatMap((edge) => {
    const sourceId = getEndpointNodeId(edge.from);
    const targetId = getEndpointNodeId(edge.to);
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
      return [];
    }
    const sourceHandle = getEndpointHandle(edge.from);
    const targetHandle = getEndpointHandle(edge.to);
    const isColumnEdge = sourceHandle !== undefined && targetHandle !== undefined;
    return [
      {
        id: edge.id,
        source: sourceId,
        target: targetId,
        label:
          edge.label ??
          edge.pipeline?.displayName ??
          edge.pipeline?.name ??
          '',
        description: edge.description,
        pipelineName: edge.pipeline?.displayName ?? edge.pipeline?.name,
        columnMappings: [],
        ...(isColumnEdge
          ? { sourceHandle, targetHandle, isColumnEdge: true as const }
          : {}),
      },
    ];
  });
  const focusNode = scene.nodes.find((node) => node.isFocus);
  return {
    centerId: focusNode?.id ?? scene.nodes[0]?.id ?? '',
    nodes,
    edges,
    columnMappings: [],
    hasColumnLineage: scene.band === 'FIELD' && edges.some((edge) => edge.isColumnEdge),
  };
}
