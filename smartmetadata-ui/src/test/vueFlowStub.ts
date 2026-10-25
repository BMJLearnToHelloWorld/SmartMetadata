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
      emits: ['node-click'],
      setup(props, { emit, slots }) {
        return () =>
          h('div', { 'data-testid': 'vue-flow-stub' }, [
            ...(
              props.nodes as {
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
              }[]
            ).map((node) =>
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
            slots.default?.(),
          ]);
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
