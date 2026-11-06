/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h, ref, type Component } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import {
  useWorkflowBuilder,
  type UseWorkflowBuilderReturn,
} from '@/composables/useWorkflowBuilder';
import type { WorkflowDefinitionFull } from '@/types/governance';

/**
 * Shared mount harness for the S2 canvas-component tests: a memory router,
 * the test i18n, antd, a stubbed definition fetch, and a parent component
 * that owns the builder (provide/inject) and renders the component under
 * test as its child.
 */

export function approvalFixture(): WorkflowDefinitionFull {
  return {
    name: 'approve-glossary-term',
    displayName: 'Approve Glossary Term',
    description: 'Approve a glossary term change',
    type: 'eventBasedEntity',
    trigger: {
      type: 'eventBasedEntity',
      config: {
        entityTypes: ['glossaryTerm'],
        events: ['Created', 'Updated'],
      },
    },
    nodes: [
      { type: 'startEvent', subType: 'startEvent', name: 'start', displayName: 'start' },
      {
        type: 'userTask',
        subType: 'userApprovalTask',
        name: 'userApprovalTask_1',
        displayName: 'Approve',
        config: {
          approvalThreshold: 1,
          rejectionThreshold: 1,
          assignees: { addReviewers: true, addOwners: false, candidates: [] },
        },
      },
      {
        type: 'automatedTask',
        subType: 'setEntityAttributeTask',
        name: 'setEntityAttributeTask_1',
        displayName: 'Set tags',
        input: ['relatedEntity', 'updatedBy'],
        inputNamespaceMap: {
          relatedEntity: 'global',
          updatedBy: 'userApprovalTask_1',
        },
        config: { fieldName: 'tags', fieldValue: '["PII.Sensitive"]' },
      },
      { type: 'endEvent', subType: 'endEvent', name: 'endEvent_1', displayName: 'End' },
    ],
    edges: [
      { from: 'start', to: 'userApprovalTask_1' },
      { from: 'userApprovalTask_1', to: 'setEntityAttributeTask_1', condition: 'approve' },
      { from: 'userApprovalTask_1', to: 'endEvent_1', condition: 'reject' },
      { from: 'setEntityAttributeTask_1', to: 'endEvent_1' },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function stubDefinitionFetch(
  definition: WorkflowDefinitionFull | null,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/governance/workflowDefinitions/name/')) {
        return jsonResponse(definition);
      }
      return jsonResponse({ data: [], paging: { total: 0 } });
    }),
  );
}

export async function mountWithBuilder(
  component: Component,
  options: {
    path?: string;
    definition?: WorkflowDefinitionFull | null;
    fqn?: string;
  } = {},
): Promise<{
  wrapper: ReturnType<typeof mount>;
  router: ReturnType<typeof createRouter>;
  builder: UseWorkflowBuilderReturn;
}> {
  const definition =
    options.definition === undefined ? approvalFixture() : options.definition;
  stubDefinitionFetch(definition);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/workflows/:fqn/:tab',
        component: { template: '<div />' },
      },
    ],
  });
  await router.push(
    options.path ??
      '/workflows/approve-glossary-term/workflow?mode=view',
  );
  await router.isReady();

  let builder!: UseWorkflowBuilderReturn;
  const Harness = defineComponent({
    setup() {
      const fqn = ref(options.fqn ?? 'approve-glossary-term');
      builder = useWorkflowBuilder(fqn);
      return () => h(component);
    },
  });
  const wrapper = mount(Harness, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router, builder };
}
