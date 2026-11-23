/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h } from 'vue';

export const vueFlowStubs = {
  '@vue-flow/core': () => ({
    VueFlow: defineComponent({
      name: 'VueFlow',
      props: {
        nodes: { type: Array, default: () => [] },
        edges: { type: Array, default: () => [] },
      },
      emits: ['node-click', 'connect', 'edge-click'],
      setup(props, { emit, slots, expose }) {
        // Flow API subset LineageGraph/LineageMap use (fitView/getViewport/
        // setViewport); exposed so export flows can be exercised in tests.
        expose({
          getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
          setViewport: () => undefined,
          fitView: async () => true,
        });
        // Read props inside the render function, not once in setup: the
        // parent replaces the nodes/edges arrays when the scene changes,
        // and a setup-time capture would keep rendering the first array.
        return () => {
          const nodes = props.nodes as {
            id: string;
            data: {
              name: string;
              entityType?: string;
              fullyQualifiedName?: string;
              displayName?: string;
              pathLabel?: string;
              truncatedFqn?: string;
              columns?: { fqn: string; name: string }[];
              expanded?: boolean;
              testId?: string;
            };
          }[];
          return h('div', { 'data-testid': 'vue-flow-stub' }, [
            ...nodes.map((node) =>
              h(
                'button',
                {
                  'data-testid': node.data.testId || `lineage-node-${node.id}`,
                  'data-entity-type': node.data.entityType,
                  'data-path-label': node.data.pathLabel || '',
                  onClick: () => emit('node-click', { node }),
                },
                [
                  node.data.displayName || node.data.name,
                  node.data.expanded
                    ? (node.data.columns ?? []).map((column) =>
                        h('span', { 'data-testid': `lineage-column-${column.fqn}` }, column.name),
                      )
                    : [],
                ],
              ),
            ),
            nodes.length >= 2
              ? h(
                  'button',
                  {
                    'data-testid': 'vue-flow-connect-stub',
                    type: 'button',
                    onClick: () =>
                      emit('connect', {
                        source: nodes[0].id,
                        target: nodes[1].id,
                        sourceHandle: null,
                        targetHandle: null,
                      }),
                  },
                  'connect',
                )
              : null,
            (props.edges as { id: string }[]).length >= 1
              ? h(
                  'button',
                  {
                    'data-testid': 'vue-flow-edge-stub',
                    type: 'button',
                    onClick: () => emit('edge-click', { edge: (props.edges as { id: string }[])[0] }),
                  },
                  'edge',
                )
              : null,
            slots.default?.(),
          ]);
        };
      },
    }),
    Handle: defineComponent({ name: 'Handle', setup: () => () => h('div') }),
    MarkerType: { ArrowClosed: 'arrowclosed' },
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  }),
  '@vue-flow/background': () => ({
    Background: defineComponent({ name: 'Background', setup: () => () => h('div') }),
  }),
  '@vue-flow/controls': () => ({
    Controls: defineComponent({
      name: 'Controls',
      setup: () => () => h('div', { 'data-testid': 'lineage-controls' }),
    }),
  }),
  '@vue-flow/minimap': () => ({
    MiniMap: defineComponent({
      name: 'MiniMap',
      setup: () => () => h('div', { 'data-testid': 'lineage-minimap' }),
    }),
  }),
};
