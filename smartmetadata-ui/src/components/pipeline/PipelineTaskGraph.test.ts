/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import PipelineTaskGraph from './PipelineTaskGraph.vue';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());
vi.mock('@vue-flow/minimap', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/minimap']());

describe('PipelineTaskGraph', () => {
  it('renders the task graph with the shared canvas chrome including MiniMap', () => {
    const wrapper = mount(PipelineTaskGraph, {
      props: {
        model: {
          nodes: [{ id: 'extract', name: 'extract', displayName: 'Extract', downstreamTasks: [] }],
          edges: [],
        },
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="pipeline-task-graph"]').exists()).toBe(true);
    // Stage 7 DAG decision: the task graph keeps its own node model but shares
    // the lineage canvas chrome (Background / Controls / MiniMap).
    expect(wrapper.find('[data-testid="pipeline-task-minimap"]').exists()).toBe(true);
  });
});
