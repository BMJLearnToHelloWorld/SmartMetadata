/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  isPipelineTaskGraphEmpty,
  layoutPipelineTaskGraph,
  mapPipelineTaskGraph,
} from './taskGraph';

describe('mapPipelineTaskGraph', () => {
  it('returns an empty model when the pipeline has no tasks', () => {
    expect(mapPipelineTaskGraph(undefined)).toEqual({ nodes: [], edges: [] });
    expect(isPipelineTaskGraphEmpty(mapPipelineTaskGraph([]))).toBe(true);
  });

  it('keeps only named tasks and edges whose downstream names exist', () => {
    const model = mapPipelineTaskGraph([
      { name: 'extract', displayName: 'Extract', taskType: 'Python', downstreamTasks: ['load', 'missing'] },
      { name: 'load', downstreamTasks: [] },
      { name: '', downstreamTasks: ['load'] },
    ]);
    expect(model.nodes.map((node) => node.id)).toEqual(['extract', 'load']);
    expect(model.edges).toEqual([{ id: 'extract->load', source: 'extract', target: 'load' }]);
    expect(model.nodes[0]?.displayName).toBe('Extract');
  });

  it('attaches latest taskStatus without inventing extra nodes', () => {
    const model = mapPipelineTaskGraph(
      [{ name: 'extract', downstreamTasks: [] }],
      {
        timestamp: 1,
        executionStatus: 'Failed',
        taskStatus: [
          { name: 'extract', executionStatus: 'Failed' },
          { name: 'ghost', executionStatus: 'Successful' },
        ],
      },
    );
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]?.executionStatus).toBe('Failed');
  });
});

describe('layoutPipelineTaskGraph', () => {
  it('leaves an empty model empty', () => {
    expect(layoutPipelineTaskGraph({ nodes: [], edges: [] }).nodes).toEqual([]);
  });

  it('assigns finite positions for returned tasks', () => {
    const laid = layoutPipelineTaskGraph(
      mapPipelineTaskGraph([
        { name: 'extract', downstreamTasks: ['load'] },
        { name: 'load', downstreamTasks: [] },
      ]),
    );
    expect(laid.nodes).toHaveLength(2);
    expect(laid.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(
      true,
    );
  });
});
