/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import {
  FIELD_SEPARATOR,
  getBoxNearestPoint,
  getBreadcrumbSceneRequest,
  getDeleteKeyAction,
  getDrillBand,
  getDrilledRootBreadcrumb,
  getEndpointHandle,
  getEndpointNodeId,
  getLensLabelKey,
  getLensRootLabelKey,
  getLineageEditColumnPair,
  getLineageMapEmptyState,
  getParentSceneRequest,
  getPrefetchBands,
  getRailDrillFallbackNode,
  getRailStop,
  getRailStopLabelKey,
  getRealEntityRef,
  getSceneCacheKey,
  getSceneLandingViewport,
  getSceneLevelLabelKey,
  getSceneNodeCount,
  getSceneNodeTypeSubtitle,
  getSceneRequestFromSearch,
  getSceneSearch,
  getScreenFill,
  getSemanticZoomDirection,
  hasSeenLineageMapOnboarding,
  isContainerSceneNode,
  isEditableSceneEdge,
  isEditableSceneNode,
  isSceneNodeDrillable,
  isSceneNodeDrillableWithChildren,
  LINEAGE_MAP_ONBOARDING_COOKIE,
  LINEAGE_MAP_RAIL_STOPS,
  LineageSceneCache,
  mapSceneToGraphModel,
  markLineageMapOnboardingSeen,
  prefetchSceneBands,
  ZOOM_IN_SCREEN_FILL,
  ZOOM_OUT_SCREEN_FILL,
  type LineageScene,
  type LineageSceneNode,
  type SceneTranslator,
} from './scene';

const LABELS: Record<string, string> = {
  'lineage.mapKindService': 'Service',
  'lineage.mapKindServicePlural': 'Services',
  'lineage.mapKindTable': 'Table',
  'lineage.mapKindTablePlural': 'Tables',
  'lineage.mapKindTopic': 'Topic',
  'lineage.mapKindTopicPlural': 'Topics',
  'lineage.mapKindAsset': 'Asset',
  'lineage.mapKindAssetPlural': 'Assets',
  'lineage.mapNodeTypeSubtitle': '{type} · {kind}',
};

const t: SceneTranslator = (key, params) => {
  let text = LABELS[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
};

function sceneNode(partial: Partial<LineageSceneNode> & { id: string }): LineageSceneNode {
  return {
    band: 'ASSET',
    label: partial.id,
    levelKind: 'table',
    ...partial,
  };
}

function scene(partial: Partial<LineageScene> = {}): LineageScene {
  return {
    band: 'LAYER',
    breadcrumb: [],
    edges: [],
    lens: 'service',
    nodes: [],
    ...partial,
  };
}

describe('scene request / search round-trip', () => {
  it('defaults a platform root to the Service lens and Layer band', () => {
    expect(getSceneRequestFromSearch('', {}, true)).toEqual({ lens: 'service', band: 'LAYER' });
    expect(getSceneRequestFromSearch('', {}, false)).toEqual({ lens: 'service', band: 'ASSET' });
  });

  it('parses lens, band and focus, and keeps unknown params on write', () => {
    const request = getSceneRequestFromSearch(
      '?lineageLens=domain&lineageBand=FIELD&lineageFocus=svc.db.t&lineageEntityType=table',
      {},
      true,
    );
    expect(request).toEqual({
      lens: 'domain',
      band: 'FIELD',
      focusFqn: 'svc.db.t',
      entityType: 'table',
    });
    const written = getSceneSearch('?tab=lineage', request);
    expect(written).toContain('tab=lineage');
    expect(getSceneRequestFromSearch(written, {}, true)).toEqual(request);
  });

  it('falls back to the route focus for a non-Layer band and drops it for Layer on the platform page', () => {
    expect(
      getSceneRequestFromSearch('?lineageBand=ASSET', { focusFqn: 'svc.db.t', entityType: 'table' }, true),
    ).toMatchObject({ focusFqn: 'svc.db.t', entityType: 'table' });
    expect(
      getSceneRequestFromSearch('?lineageBand=LAYER', { focusFqn: 'svc.db.t', entityType: 'table' }, true),
    ).toEqual({ lens: 'service', band: 'LAYER' });
  });

  it('rejects unknown lens/band values back to the defaults', () => {
    expect(getSceneRequestFromSearch('?lineageLens=bogus&lineageBand=bogus', {}, true)).toEqual({
      lens: 'service',
      band: 'LAYER',
    });
  });
});

describe('scene labels', () => {
  it('names the lens root and lens per lens', () => {
    expect(getLensRootLabelKey('service')).toBe('lineage.mapAllServices');
    expect(getLensRootLabelKey('domain')).toBe('lineage.mapAllDomains');
    expect(getLensRootLabelKey('dataProduct')).toBe('lineage.mapAllDataProducts');
    expect(getLensLabelKey('domain')).toBe('lineage.mapDomain');
    expect(getLensLabelKey('dataProduct')).toBe('lineage.mapDataProduct');
    expect(getLensLabelKey('service')).toBe('lineage.mapService');
  });

  it('returns the drilled root crumb only once the scene is drilled', () => {
    const root = {
      band: 'LAYER' as const,
      id: 'root',
      label: 'All services',
      levelKind: 'service' as const,
    };
    expect(getDrilledRootBreadcrumb(scene({ band: 'LAYER', breadcrumb: [root] }))).toBeUndefined();
    expect(
      getDrilledRootBreadcrumb(
        scene({ band: 'ASSET', focusFqn: 'svc', breadcrumb: [root] }),
      ),
    ).toEqual(root);
  });

  it('labels a single-kind scene by that kind and a mixed scene by its band', () => {
    expect(
      getSceneLevelLabelKey(scene({ band: 'ASSET', nodes: [sceneNode({ id: 'a', levelKind: 'table' })] })),
    ).toBe('lineage.mapLevelTable');
    expect(
      getSceneLevelLabelKey(
        scene({
          band: 'ASSET',
          nodes: [
            sceneNode({ id: 'a', levelKind: 'table' }),
            sceneNode({ id: 'b', levelKind: 'topic' }),
          ],
        }),
      ),
    ).toBe('lineage.mapAssetLevel');
    expect(
      getSceneLevelLabelKey(scene({ band: 'FIELD', nodes: [sceneNode({ id: 'a' })] })),
    ).toBe('lineage.mapLevelField');
  });

  it('subtitles container nodes with kind and service type, and counts their assets', () => {
    const service = sceneNode({
      id: 'svc',
      levelKind: 'service',
      serviceType: 'Postgres',
      counts: { table: 2, topic: 1 },
    });
    expect(isContainerSceneNode(service)).toBe(true);
    expect(isContainerSceneNode(sceneNode({ id: 'a' }))).toBe(false);
    expect(getSceneNodeTypeSubtitle(service, t)).toBe('Postgres · service');
    expect(getSceneNodeCount(service, t)).toEqual({ count: 3, entity: 'assets' });
    expect(
      getSceneNodeCount(sceneNode({ id: 'a', levelKind: 'service', counts: { table: 1 } }), t),
    ).toEqual({ count: 1, entity: 'table' });
    expect(getSceneNodeCount(sceneNode({ id: 'a', levelKind: 'service' }), t)).toBeUndefined();
  });
});

describe('scene rail and drill', () => {
  it('has Layer/Asset/Field stops and resolves the active stop from the scene', () => {
    expect(LINEAGE_MAP_RAIL_STOPS).toEqual(['LAYER', 'ASSET', 'FIELD']);
    expect(getRailStop(scene({ band: 'FIELD', nodes: [] }))).toBe('FIELD');
    expect(
      getRailStop(
        scene({
          band: 'LAYER',
          nodes: [sceneNode({ id: 'a', levelKind: 'service' })],
        }),
      ),
    ).toBe('LAYER');
    expect(
      getRailStop(
        scene({
          band: 'LAYER',
          nodes: [
            sceneNode({ id: 'a', levelKind: 'service' }),
            sceneNode({ id: 'b', levelKind: 'table' }),
          ],
        }),
      ),
    ).toBe('ASSET');
    expect(getRailStopLabelKey('LAYER', 'domain')).toBe('lineage.mapDomain');
    expect(getRailStopLabelKey('ASSET', 'service')).toBe('lineage.mapAssetLevel');
    expect(getRailStopLabelKey('FIELD', 'service')).toBe('lineage.mapFieldLevel');
  });

  it('picks the empty state from scene / loading / error, in that order', () => {
    expect(getLineageMapEmptyState({ scene: scene(), loading: true, hasError: true })).toBe('empty');
    expect(getLineageMapEmptyState({ loading: true, hasError: false })).toBe('loading');
    expect(getLineageMapEmptyState({ loading: false, hasError: true })).toBe('error');
    expect(getLineageMapEmptyState({ loading: false, hasError: false })).toBe('empty');
  });

  it('drills only expandable nodes with an FQN and type, preferring nodes with children', () => {
    const drillable = sceneNode({
      id: 'a',
      isExpandable: true,
      fullyQualifiedName: 'svc',
      entityType: 'databaseService',
      childrenCount: 2,
    });
    const empty = sceneNode({
      id: 'b',
      isExpandable: true,
      fullyQualifiedName: 'svc2',
      entityType: 'databaseService',
      childrenCount: 0,
    });
    expect(isSceneNodeDrillable(drillable)).toBe(true);
    expect(isSceneNodeDrillable(sceneNode({ id: 'c', isExpandable: true }))).toBe(false);
    expect(isSceneNodeDrillableWithChildren(empty)).toBe(false);
    expect(getRailDrillFallbackNode([empty, drillable])).toBe(drillable);
    expect(getRailDrillFallbackNode([empty])).toBe(empty);
    expect(getDrillBand(sceneNode({ id: 'a', band: 'LAYER' }))).toBe('ASSET');
    expect(getDrillBand(sceneNode({ id: 'a', band: 'ASSET', levelKind: 'table' }))).toBe('FIELD');
    expect(getDrillBand(sceneNode({ id: 'a', band: 'ASSET', levelKind: 'service' }))).toBe('ASSET');
  });

  it('resolves breadcrumb requests, rooting on the lens container', () => {
    const base = scene({
      lens: 'domain',
      breadcrumb: [
        { band: 'LAYER', id: 'root', label: 'All domains', levelKind: 'domain' },
        { band: 'ASSET', id: 'd1', label: 'Sales', levelKind: 'domain', fullyQualifiedName: 'sales', entityType: 'domain' },
      ],
    });
    expect(getBreadcrumbSceneRequest(base, base.breadcrumb[0])).toEqual({
      lens: 'domain',
      band: 'LAYER',
    });
    expect(getBreadcrumbSceneRequest(base, base.breadcrumb[1])).toEqual({
      lens: 'domain',
      band: 'ASSET',
      focusFqn: 'sales',
      entityType: 'domain',
    });
  });

  it('resolves the parent request from the field band, the trail, and the root', () => {
    expect(
      getParentSceneRequest(scene({ band: 'FIELD', focusFqn: 'svc.db.t', focusEntityType: 'table' })),
    ).toEqual({ lens: 'service', band: 'ASSET', focusFqn: 'svc.db.t', entityType: 'table' });
    expect(getParentSceneRequest(scene({ band: 'LAYER' }))).toBeUndefined();
    expect(getParentSceneRequest(scene({ band: 'ASSET' }))).toEqual({ lens: 'service', band: 'LAYER' });
    const trailed = scene({
      band: 'ASSET',
      focusFqn: 'svc.db',
      breadcrumb: [
        { band: 'LAYER', id: 'root', label: 'All services', levelKind: 'service' },
        { band: 'ASSET', id: 's', label: 'svc', levelKind: 'service', fullyQualifiedName: 'svc', entityType: 'databaseService' },
        { band: 'ASSET', id: 'd', label: 'db', levelKind: 'database', fullyQualifiedName: 'svc.db', entityType: 'database' },
      ],
    });
    expect(getParentSceneRequest(trailed)).toEqual({
      lens: 'service',
      band: 'ASSET',
      focusFqn: 'svc',
      entityType: 'databaseService',
    });
  });
});

describe('semantic zoom and landing viewport', () => {
  it('exposes the official screen-fill thresholds', () => {
    expect(ZOOM_IN_SCREEN_FILL).toBe(0.35);
    expect(ZOOM_OUT_SCREEN_FILL).toBeCloseTo(1 / 3);
  });

  it('drills in when a card fills the screen and out when the graph shrinks below a third', () => {
    const base = {
      previousZoom: 1,
      graph: { width: 800, height: 400 },
      card: { width: 260, height: 78 },
      screen: { width: 1400, height: 900 },
      minZoom: 0.1,
      maxZoom: 2.5,
    };
    expect(getSemanticZoomDirection({ ...base, zoom: 1.9 })).toBe('in');
    expect(getSemanticZoomDirection({ ...base, zoom: 1.05 })).toBeUndefined();
    expect(getSemanticZoomDirection({ ...base, previousZoom: 0.5, zoom: 0.3 })).toBe('out');
    expect(
      getSemanticZoomDirection({
        ...base,
        previousZoom: 0.5,
        zoom: 0.45,
        graph: { width: 1200, height: 600 },
      }),
    ).toBeUndefined();
    expect(getSemanticZoomDirection({ ...base, previousZoom: 1, zoom: 2.5 })).toBe('in');
    expect(getSemanticZoomDirection({ ...base, previousZoom: 0.5, zoom: 0.1 })).toBe('out');
  });

  it('finds the nearest box centre and measures screen fill', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 500, y: 0, width: 100, height: 100 },
    ];
    expect(getBoxNearestPoint(boxes, { x: 520, y: 40 })).toBe(boxes[1]);
    expect(getBoxNearestPoint([], { x: 0, y: 0 })).toBeUndefined();
    expect(getScreenFill({ width: 700, height: 100 }, 1, { width: 1400, height: 900 })).toBe(0.5);
  });

  it('returns no landing viewport when the scene fits, and centres the focus node otherwise', () => {
    const boxes = [
      { x: 0, y: 0, width: 260, height: 78, isFocus: true },
      { x: 400, y: 0, width: 260, height: 78 },
    ];
    expect(getSceneLandingViewport(boxes, { width: 1400, height: 900 }, 0.1, 0.2)).toBeUndefined();
    expect(getSceneLandingViewport([], { width: 1400, height: 900 }, 0.1, 0.2)).toBeUndefined();
    const wide = [
      { x: 0, y: 0, width: 260, height: 78, isFocus: true },
      { x: 20000, y: 0, width: 260, height: 78 },
    ];
    const landing = getSceneLandingViewport(wide, { width: 1400, height: 900 }, 0.55, 0.2);
    expect(landing?.zoom).toBe(0.55);
    expect(landing?.x).toBeCloseTo(700 - 130 * 0.55);
    expect(landing?.y).toBeCloseTo(450 - 39 * 0.55);
  });
});

describe('scene cache', () => {
  it('builds a stable key from lens, band, focus, depths and filter', () => {
    const key = getSceneCacheKey(
      { lens: 'service', band: 'ASSET', focusFqn: 'svc', entityType: 'databaseService' },
      { upstreamDepth: 1, downstreamDepth: 2, nodesPerLayer: 200, pipelineViewMode: 'Node' },
      '{"a":1}',
    );
    expect(key).toBe('service|ASSET|svc|databaseService|1|2|200|Node|{"a":1}');
    expect(
      getSceneCacheKey({ lens: 'service', band: 'LAYER' }, {}),
    ).toBe('service|LAYER|||1|1|200|Node|');
  });

  it('shares one in-flight fetch per key and returns the resolved value', async () => {
    const cache = new LineageSceneCache();
    let calls = 0;
    const fetchScene = async () => {
      calls += 1;
      return scene({ band: 'ASSET' });
    };
    const first = cache.load('k', fetchScene);
    const second = cache.load('k', fetchScene);
    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({ band: 'ASSET' });
    expect(calls).toBe(1);
    expect(cache.get('k')).toMatchObject({ band: 'ASSET' });
    await expect(cache.load('k', fetchScene)).resolves.toMatchObject({ band: 'ASSET' });
    expect(calls).toBe(1);
  });

  it('evicts a failed load so the next load retries', async () => {
    const cache = new LineageSceneCache();
    await expect(cache.load('k', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(cache.get('k')).toBeUndefined();
    await expect(cache.load('k', async () => scene())).resolves.toBeDefined();
  });

  it('caps at 50 entries, dropping the least recently used', async () => {
    const cache = new LineageSceneCache();
    for (let index = 0; index < 51; index += 1) {
      await cache.load(`k${index}`, async () => scene());
    }
    expect(cache.get('k0')).toBeUndefined();
    expect(cache.get('k50')).toBeDefined();
    cache.clear();
    expect(cache.get('k50')).toBeUndefined();
  });

  it('prefetches the neighbouring bands from Asset, and Asset from the others', async () => {
    expect(getPrefetchBands('ASSET')).toEqual(['LAYER', 'FIELD']);
    expect(getPrefetchBands('LAYER')).toEqual(['ASSET']);
    expect(getPrefetchBands('FIELD')).toEqual(['ASSET']);
    const cache = new LineageSceneCache();
    const fetched: string[] = [];
    const fetchScene = async (request: { band: string }) => {
      fetched.push(request.band);
      return scene({ band: request.band as 'LAYER' | 'ASSET' | 'FIELD' });
    };
    prefetchSceneBands(
      cache,
      scene({ band: 'ASSET' }),
      { lens: 'service', band: 'ASSET' },
      {},
      fetchScene,
    );
    await vi.waitFor(() => expect(fetched).toEqual(['LAYER', 'FIELD']));
    expect(cache.get('service|LAYER|||1|1|200|Node|')).toBeDefined();
    expect(cache.get('service|FIELD|||1|1|200|Node|')).toBeDefined();
  });
});

describe('onboarding cookie', () => {
  it('is unseen until marked, then remembered', () => {
    document.cookie = `${LINEAGE_MAP_ONBOARDING_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    expect(hasSeenLineageMapOnboarding()).toBe(false);
    markLineageMapOnboardingSeen();
    expect(hasSeenLineageMapOnboarding()).toBe(true);
    document.cookie = `${LINEAGE_MAP_ONBOARDING_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
});

describe('scene edit gates', () => {
  it('splits field endpoints on the separator', () => {
    expect(FIELD_SEPARATOR).toBe('::field::');
    expect(getEndpointNodeId('node1::field::col1')).toBe('node1');
    expect(getEndpointHandle('node1::field::col1')).toBe('col1');
    expect(getEndpointNodeId('node1')).toBe('node1');
    expect(getEndpointHandle('node1')).toBeUndefined();
  });

  it('resolves the real entity ref from the source payload, falling back to the node', () => {
    expect(getRealEntityRef(undefined)).toBeUndefined();
    expect(
      getRealEntityRef(
        sceneNode({
          id: 'a',
          entityType: 'table',
          fullyQualifiedName: 'svc.db.t',
          sourceEntity: { id: 'id-1', type: 'table' },
        }),
      ),
    ).toEqual({ id: 'id-1', type: 'table', fullyQualifiedName: 'svc.db.t' });
    expect(
      getRealEntityRef(sceneNode({ id: 'a', fullyQualifiedName: 'svc.db.t' })),
    ).toBeUndefined();
  });

  it('allows editing only real, non-synthetic asset nodes — never Layer nodes', () => {
    const editable = sceneNode({
      id: 'a',
      band: 'ASSET',
      levelKind: 'table',
      sourceEntity: { id: 'id-1', type: 'table' },
    });
    expect(isEditableSceneNode(editable)).toBe(true);
    expect(isEditableSceneNode({ ...editable, band: 'LAYER' })).toBe(false);
    expect(isEditableSceneNode({ ...editable, levelKind: 'service' })).toBe(false);
    expect(
      isEditableSceneNode({ ...editable, sourceEntity: { id: 'id-1', type: 'table', lineageSceneSyntheticCount: true } }),
    ).toBe(false);
    const nodeById = new Map([['a', editable]]);
    const other = sceneNode({
      id: 'b',
      band: 'ASSET',
      levelKind: 'table',
      sourceEntity: { id: 'id-2', type: 'table' },
    });
    nodeById.set('b', other);
    expect(
      isEditableSceneEdge(
        { band: 'ASSET', from: 'a', to: 'b', id: 'e1' },
        nodeById,
      ),
    ).toBe(true);
    expect(
      isEditableSceneEdge(
        { band: 'ASSET', from: 'a', to: 'b', id: 'e2', isRollup: true, weight: 3 },
        nodeById,
      ),
    ).toBe(false);
    expect(
      isEditableSceneEdge(
        { band: 'ASSET', from: 'a::field::c1', to: 'b', id: 'e3' },
        nodeById,
      ),
    ).toBe(false);
  });

  it('never deletes from the platform map: canEdit is always false there', () => {
    const event = new KeyboardEvent('keydown', { key: 'Delete' });
    expect(
      getDeleteKeyAction(event, { canEdit: false, hasSelectedNode: true, hasSelectedEdge: false }),
    ).toBeUndefined();
    expect(
      getDeleteKeyAction(event, { canEdit: true, hasSelectedNode: true, hasSelectedEdge: false }),
    ).toBe('node');
    expect(
      getDeleteKeyAction(new KeyboardEvent('keydown', { key: 'Backspace' }), {
        canEdit: true,
        hasSelectedNode: false,
        hasSelectedEdge: true,
      }),
    ).toBe('edge');
    expect(
      getDeleteKeyAction(new KeyboardEvent('keydown', { key: 'a' }), {
        canEdit: true,
        hasSelectedNode: true,
        hasSelectedEdge: false,
      }),
    ).toBeUndefined();
  });

  it('pairs edit columns upstream/downstream without nesting', () => {
    expect(getLineageEditColumnPair(true, 'to.col', 'from.col')).toEqual({
      fromColumn: 'from.col',
      toColumn: 'to.col',
    });
    expect(getLineageEditColumnPair(false, 'to.col', 'from.col')).toEqual({
      fromColumn: 'to.col',
      toColumn: 'from.col',
    });
    expect(getLineageEditColumnPair(true, undefined, 'from.col')).toBeUndefined();
  });
});

describe('mapSceneToGraphModel', () => {
  it('maps scene nodes and edges, keeps field handles, and drops dangling edges', () => {
    const model = mapSceneToGraphModel(
      scene({
        band: 'FIELD',
        focusFqn: 'svc.db.b',
        nodes: [
          sceneNode({
            id: 'a',
            label: 'A',
            displayName: 'Table A',
            fullyQualifiedName: 'svc.db.a',
            fields: [{ id: 'a.id', name: 'id', fullyQualifiedName: 'svc.db.a.id' }],
          }),
          sceneNode({
            id: 'b',
            label: 'B',
            fullyQualifiedName: 'svc.db.b',
            isFocus: true,
            fields: [{ id: 'b.id', name: 'id', fullyQualifiedName: 'svc.db.b.id' }],
          }),
        ],
        edges: [
          {
            band: 'FIELD',
            from: 'a::field::svc.db.a.id',
            to: 'b::field::svc.db.b.id',
            id: 'e1',
            pipeline: { id: 'p1', type: 'pipeline', name: 'pipe', displayName: 'Pipe' },
          },
          { band: 'FIELD', from: 'a', to: 'ghost', id: 'e2' },
        ],
      }),
    );
    expect(model.centerId).toBe('b');
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes[0].columns).toEqual([{ fqn: 'svc.db.a.id', name: 'id' }]);
    expect(model.nodes[1].isCenter).toBe(true);
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({
      source: 'a',
      target: 'b',
      sourceHandle: 'svc.db.a.id',
      targetHandle: 'svc.db.b.id',
      isColumnEdge: true,
      pipelineName: 'Pipe',
    });
    expect(model.hasColumnLineage).toBe(true);
  });

  it('maps a layer scene to container nodes with the first node as centre', () => {
    const model = mapSceneToGraphModel(
      scene({
        band: 'LAYER',
        nodes: [
          sceneNode({ id: 's1', label: 'svc', levelKind: 'service', fullyQualifiedName: 'svc' }),
        ],
        edges: [],
      }),
    );
    expect(model.centerId).toBe('s1');
    expect(model.nodes[0].entityType).toBe('service');
    expect(model.hasColumnLineage).toBe(false);
  });
});
