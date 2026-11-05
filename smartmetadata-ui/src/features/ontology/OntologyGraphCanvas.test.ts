/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import OntologyGraphCanvas from './OntologyGraphCanvas.vue';

const g6State = vi.hoisted(() => ({
  instances: [] as Array<{
    options: Record<string, unknown>;
    handlers: Record<string, (event: { target?: { id?: string } }) => void>;
    data: unknown;
  }>,
}));

vi.mock('@antv/g6', () => ({
  Graph: class {
    options: Record<string, unknown>;
    handlers: Record<string, (event: { target?: { id?: string } }) => void> = {};
    data: unknown;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.data = options.data;
      g6State.instances.push(this);
    }
    on(event: string, handler: (event: { target?: { id?: string } }) => void): void {
      this.handlers[event] = handler;
    }
    setData(data: unknown): void {
      this.data = data;
    }
    async render(): Promise<void> {
      return undefined;
    }
    destroy(): void {
      return undefined;
    }
  },
}));

const graph = {
  nodes: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  edges: [],
};

describe('OntologyGraphCanvas', () => {
  it('builds a G6 graph with drag behaviours and confirms a relation via clicks', async () => {
    g6State.instances.length = 0;
    const wrapper = mount(OntologyGraphCanvas, {
      props: { graph, canEdit: true },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(g6State.instances).toHaveLength(1);
    const instance = g6State.instances[0]!;
    expect(instance.options.behaviors).toEqual(['drag-canvas', 'zoom-canvas', 'drag-element']);
    instance.handlers['node:click']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-armed"]').exists()).toBe(true);
    instance.handlers['node:click']?.({ target: { id: 'b' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-pending"]').exists()).toBe(true);
    await wrapper.find('[data-testid="ontology-graph-confirm"]').trigger('click');
    expect(wrapper.emitted('create-relation')).toEqual([
      [{ fromId: 'a', toId: 'b', relationType: 'subClassOf' }],
    ]);
  });

  it('does not arm nodes when read-only', async () => {
    g6State.instances.length = 0;
    const wrapper = mount(OntologyGraphCanvas, {
      props: { graph, canEdit: false },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    g6State.instances[0]!.handlers['node:click']?.({ target: { id: 'a' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ontology-graph-armed"]').exists()).toBe(false);
    expect(wrapper.emitted('create-relation')).toBeUndefined();
  });
});
