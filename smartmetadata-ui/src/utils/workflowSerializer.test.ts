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
import type {
  WorkflowBackendEdge,
  WorkflowBackendNode,
  WorkflowDefinitionFull,
} from '@/types/governance';
import { buildWorkflowForSave } from '@/services/workflowValidation';
import { deserializeWorkflow } from './workflowSerializer';
import { liveWorkflowDefinitions } from './workflowLiveDefinitions';

/**
 * Official WorkflowSerializer.deserializeWorkflow, exercised on a definition
 * shaped like a real governance workflow (approve → set → end), plus the
 * seed_workflow edge: a definition with no trigger must deserialize without
 * crashing, falling back to the default event-based trigger.
 */
function approvalFixture(): WorkflowDefinitionFull {
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

describe('deserializeWorkflow', () => {
  it('converts backend nodes to flow nodes with BFS positions', () => {
    const { nodes, metadata } = deserializeWorkflow(approvalFixture());

    expect(nodes).toHaveLength(4);
    expect(metadata.name).toBe('approve-glossary-term');
    expect(metadata.displayName).toBe('Approve Glossary Term');
    expect(metadata.trigger.type).toBe('eventBasedEntity');

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const start = byId.get('start');
    expect(start?.type).toBe('startEvent');
    expect(start?.position).toEqual({ x: 0, y: 0 });
    expect(start?.data.label).toBe('start');

    const approval = byId.get('userApprovalTask_1');
    expect(approval?.type).toBe('userTask');
    expect(approval?.position.x).toBe(350);
    expect(approval?.data.subType).toBe('userApprovalTask');
    expect(approval?.data.action).toBe('Approve');

    const setNode = byId.get('setEntityAttributeTask_1');
    expect(setNode?.type).toBe('automatedTask');
    expect(setNode?.position.x).toBe(700);
    expect(setNode?.data.config).toEqual({
      fieldName: 'tags',
      fieldValue: '["PII.Sensitive"]',
    });

    const end = byId.get('endEvent_1');
    expect(end?.type).toBe('endEvent');
    expect(end?.position.x).toBe(700);
  });

  it('maps edge conditions to labels with themed label backgrounds', () => {
    const { edges } = deserializeWorkflow(approvalFixture());

    expect(edges).toHaveLength(4);
    const approveEdge = edges.find(
      (e) => e.source === 'userApprovalTask_1' && e.target === 'setEntityAttributeTask_1',
    );
    expect(approveEdge?.label).toBe('approve');
    expect(approveEdge?.type).toBe('straight');
    expect(approveEdge?.data?.condition).toBe('approve');
    expect(approveEdge?.data?.conditions).toEqual([
      { field: 'result', operator: 'equals', value: 'approve' },
    ]);
    expect(approveEdge?.style?.strokeWidth).toBe(2);
    expect(approveEdge?.labelBgStyle).toMatchObject({ fillOpacity: 1 });

    const rejectEdge = edges.find(
      (e) => e.source === 'userApprovalTask_1' && e.target === 'endEvent_1',
    );
    expect(rejectEdge?.label).toBe('reject');

    const plainEdge = edges.find(
      (e) => e.source === 'start' && e.target === 'userApprovalTask_1',
    );
    expect(plainEdge?.label).toBe('');
    expect(plainEdge?.data).toBeUndefined();
  });

  it('keeps a valid predecessor updatedBy reference as-is', () => {
    const { nodes } = deserializeWorkflow(approvalFixture());
    const setNode = nodes.find((n) => n.id === 'setEntityAttributeTask_1');
    expect(setNode?.data.inputNamespaceMap?.updatedBy).toBe(
      'userApprovalTask_1',
    );
  });

  it('migrates a global updatedBy to the predecessor user task', () => {
    const definition = approvalFixture();
    const setNode = definition.nodes?.find(
      (n) => n.subType === 'setEntityAttributeTask',
    );
    if (setNode) {
      setNode.inputNamespaceMap = {
        relatedEntity: 'global',
        updatedBy: 'global',
      };
    }
    const { nodes } = deserializeWorkflow(definition);
    const migrated = nodes.find((n) => n.id === 'setEntityAttributeTask_1');
    expect(migrated?.data.inputNamespaceMap?.updatedBy).toBe(
      'userApprovalTask_1',
    );
  });

  it('migrates updatedBy to global when no predecessor user task exists', () => {
    const definition = approvalFixture();
    definition.nodes = definition.nodes?.filter(
      (n) => n.subType !== 'userApprovalTask',
    );
    definition.edges = definition.edges?.filter(
      (e) => e.from !== 'userApprovalTask_1' && e.to !== 'userApprovalTask_1',
    );
    const setNode = definition.nodes?.find(
      (n) => n.subType === 'setEntityAttributeTask',
    );
    if (setNode) {
      setNode.inputNamespaceMap = {
        relatedEntity: 'global',
        updatedBy: 'ApproveGlossaryTerm',
      };
    }
    const { nodes } = deserializeWorkflow(definition);
    const migrated = nodes.find((n) => n.id === 'setEntityAttributeTask_1');
    expect(migrated?.data.inputNamespaceMap?.updatedBy).toBe('global');
  });

  it('deserializes a definition with no trigger using the default trigger', () => {
    const definition: WorkflowDefinitionFull = {
      name: 'seed_workflow',
      description: 'Historical seed workflow without a trigger',
      nodes: [
        { type: 'startEvent', subType: 'startEvent', name: 'start', displayName: 'start' },
      ],
      edges: [],
    };
    const { nodes, edges, metadata } = deserializeWorkflow(definition);
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
    expect(metadata.trigger).toEqual({
      type: 'eventBasedEntity',
      config: {
        entityTypes: [],
        events: ['Created', 'Updated'],
        filter: {},
      },
    });
  });

  it('positions unvisited nodes after the BFS levels', () => {
    const definition = approvalFixture();
    definition.nodes = [
      ...(definition.nodes ?? []),
      {
        type: 'automatedTask',
        subType: 'rollbackEntityTask',
        name: 'rollbackEntityTask_1',
        displayName: 'Revert',
      },
    ];
    const { nodes } = deserializeWorkflow(definition);
    const orphan = nodes.find((n) => n.id === 'rollbackEntityTask_1');
    // BFS levels: start(0), approval(1), set+end(2). The set→end edge
    // re-queues end for level 3 (already visited, so it is not re-positioned,
    // but currentLevel still advances to 4) — unvisited nodes land after it.
    expect(orphan?.position.x).toBe(4 * 350);
  });
});

/**
 * Serializer round-trip on the 21 live governance definitions
 * (workflowLiveDefinitions.ts): definition → flow → definition.
 *
 * The save path normalizes, it does not preserve byte-for-byte — every
 * normalization below is official behaviour (pin a3012259ca), cited per
 * assertion, never a silent loss the test papers over:
 * - start node renamed to 'start' (WorkflowValidationService.ts:523);
 * - edge conditions lowercased, except data-completeness quality bands
 *   (WorkflowValidationService.ts:586);
 * - check-task outputs, automated input/output defaults and user-task IO
 *   rebuilt per the subtype (WorkflowNodeConfigUtils.ts:
 *   AUTOMATED_TASK_SINGLE_INPUT_SUBTYPES, AUTOMATED_TASK_OUTPUT_MAP,
 *   configureUserTaskIO);
 * - every user task collapses to userApprovalTask on save
 *   (WorkflowValidationService.ts:508);
 * - partial decisions stripped unless approvalMode is Enforce, and
 *   storeStageStatus derived as (type === eventBasedEntity)
 *   (WorkflowValidationService.ts buildWorkflowForSave);
 * - trigger output reset to ['relatedEntity', 'updatedBy']
 *   (WorkflowValidationService.ts:59 of the save builder);
 * - node configs are rebuilt by the subtype handlers: only the seven
 *   handled subtypes (and userApprovalTask) carry config forward, so an
 *   unhandled subtype such as createAndRunIngestionPipelineTask or
 *   runAppTask loses its config on save — official drops it too
 *   (NODE_SPECIFIC_CONFIG_HANDLERS has no entry for either), and the test
 *   asserts the drop explicitly.
 * Anything outside this list must survive: the test fails on any other
 * missing node, edge, config key, trigger entity type, or namespace-map
 * entry.
 */

const LIVE_DEFINITION_NAMES = [
  'AIAssetApprovalWorkflow',
  'AutoPilotWorkflow',
  'CustomTaskWorkflow',
  'DataQualityReviewTaskWorkflow',
  'DescriptionUpdateTaskWorkflow',
  'DomainUpdateTaskWorkflow',
  'GenericIncidentTaskWorkflow',
  'GenericReviewTaskWorkflow',
  'GlossaryTermApprovalWorkflow',
  'IncidentLifecycleWorkflow',
  'IncidentResolutionTaskWorkflow',
  'MetricApprovalWorkflow',
  'OwnershipUpdateTaskWorkflow',
  'PipelineReviewTaskWorkflow',
  'RecognizerFeedbackReviewWorkflow',
  'RequestApprovalTaskWorkflow',
  'SuggestionTaskWorkflow',
  'TagUpdateTaskWorkflow',
  'TestCaseResolutionTaskWorkflow',
  'TierUpdateTaskWorkflow',
  'seed_workflow',
];

function triggerShape(definition: WorkflowDefinitionFull): {
  type?: string;
  config?: Record<string, unknown>;
  output?: unknown;
} {
  const trigger = definition.trigger as
    | {
        type?: string;
        config?: Record<string, unknown>;
        output?: unknown;
      }
    | null
    | undefined;
  return trigger ?? {};
}

function edgeKey(from: string, to: string, condition?: string): string {
  return `${from}->${to}:${condition ?? ''}`;
}

const SINGLE_INPUT_SUBTYPES = [
  'checkEntityAttributesTask',
  'checkChangeDescriptionTask',
  'dataCompletenessTask',
  'collectMetadataTask',
];

/**
 * Official NODE_SPECIFIC_CONFIG_HANDLERS (WorkflowNodeConfigUtils.ts) plus
 * userApprovalTask (applyUserApprovalConfig): the only subtypes whose config
 * the save path carries forward. Every other subtype's config is rebuilt
 * from scratch and dropped — official drops it too, so the test asserts
 * the drop instead of the keys.
 */
const CONFIG_PRESERVING_SUBTYPES = new Set([
  'setEntityAttributeTask',
  'checkEntityAttributesTask',
  'dataCompletenessTask',
  'checkChangeDescriptionTask',
  'rollbackEntityTask',
  'sinkTask',
  'collectMetadataTask',
  'userApprovalTask',
]);

describe('serializeWorkflow round-trip on the live 21 definitions', () => {
  it('covers exactly the 21 live definitions, seed_workflow included', () => {
    const definitions = liveWorkflowDefinitions();
    expect(definitions.map((d) => d.name).sort()).toEqual(
      [...LIVE_DEFINITION_NAMES].sort(),
    );
    // Premises the per-definition assertions rely on: no live definition
    // uses Enforce approval mode (so partial decisions are always stripped),
    // and only seed_workflow has no trigger at all.
    for (const definition of definitions) {
      const approvalMode = triggerShape(definition).config?.approvalMode;
      expect(approvalMode).not.toBe('Enforce');
    }
    expect(
      definitions.filter((d) => !d.trigger).map((d) => d.name),
    ).toEqual(['seed_workflow']);
  });

  it('deserializes seed_workflow but refuses to save it: no trigger, no data assets', async () => {
    const definition = liveWorkflowDefinitions().find(
      (d) => d.name === 'seed_workflow',
    );
    expect(definition).toBeDefined();
    const { nodes, edges, metadata } = deserializeWorkflow(definition!);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
    expect(metadata.trigger.type).toBe('eventBasedEntity');
    await expect(
      buildWorkflowForSave(nodes, edges, definition!),
    ).rejects.toThrow('workflows.builder.triggerRequiresDataAssets');
  });

  for (const name of LIVE_DEFINITION_NAMES.filter((n) => n !== 'seed_workflow')) {
    it(`round-trips ${name} without data loss`, async () => {
      const definition = liveWorkflowDefinitions().find((d) => d.name === name);
      expect(definition).toBeDefined();
      const original = definition!;
      const originalNodes = (original.nodes ?? []) as WorkflowBackendNode[];
      const originalEdges = (original.edges ?? []) as WorkflowBackendEdge[];
      const originalTrigger = triggerShape(original);
      const originalStart = originalNodes.find((n) => n.type === 'startEvent');
      expect(originalStart).toBeDefined();

      const flow = deserializeWorkflow(original);
      expect(flow.nodes).toHaveLength(originalNodes.length);
      expect(flow.edges).toHaveLength(originalEdges.length);
      for (const node of flow.nodes) {
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
      }

      const saved = await buildWorkflowForSave(
        flow.nodes,
        flow.edges,
        original,
      );
      const savedTrigger = triggerShape(saved);
      const savedNodes = (saved.nodes ?? []) as WorkflowBackendNode[];
      const savedEdges = (saved.edges ?? []) as WorkflowBackendEdge[];

      // Identity and trigger.
      expect(saved.name).toBe(original.name);
      expect(saved.displayName).toBe(original.displayName);
      expect(saved.description).toBe(original.description);
      expect(saved.type).toBe(originalTrigger.type);
      expect(savedTrigger.type).toBe(originalTrigger.type);
      expect(savedTrigger.output).toEqual(['relatedEntity', 'updatedBy']);
      expect(
        (saved.config as Record<string, unknown> | undefined)
          ?.storeStageStatus,
      ).toBe(originalTrigger.type === 'eventBasedEntity');
      if (originalTrigger.type === 'eventBasedEntity') {
        expect(savedTrigger.config?.entityTypes).toEqual(
          originalTrigger.config?.entityTypes,
        );
      }
      // The trigger config itself survives untouched (the save rebuilds
      // only the trigger type, output and storeStageStatus around it).
      expect(savedTrigger.config ?? {}).toEqual(
        originalTrigger.config ?? {},
      );

      // Nodes: same count; the start node is renamed to 'start' (official);
      // every other node survives by name, user tasks collapse to
      // userApprovalTask (official), all other subtypes are preserved.
      expect(savedNodes).toHaveLength(originalNodes.length);
      const savedByName = new Map(savedNodes.map((n) => [n.name, n]));
      const savedStart = savedByName.get('start');
      expect(savedStart?.type).toBe('startEvent');
      expect(savedStart?.subType).toBe('startEvent');
      expect(savedByName.has(originalStart!.name)).toBe(
        originalStart!.name === 'start',
      );
      for (const originalNode of originalNodes) {
        if (originalNode.type === 'startEvent') {
          continue;
        }
        const savedNode = savedByName.get(originalNode.name);
        expect(savedNode).toBeDefined();
        if (originalNode.type === 'endEvent') {
          expect(savedNode?.displayName).toBe('End');
          continue;
        }
        expect(savedNode?.subType).toBe(
          originalNode.type === 'userTask'
            ? 'userApprovalTask'
            : originalNode.subType,
        );
      }

      // Edges: same multiset after the start rename and the official
      // condition lowercasing (data-completeness bands keep their case).
      const rename = (nodeName: string): string =>
        nodeName === originalStart!.name ? 'start' : nodeName;
      const originalEdgeKeys = originalEdges
        .map((edge) => {
          const source = originalNodes.find((n) => n.name === edge.from);
          const condition =
            source?.subType === 'dataCompletenessTask'
              ? edge.condition
              : edge.condition?.toLowerCase();
          return edgeKey(rename(edge.from), rename(edge.to), condition);
        })
        .sort();
      const savedEdgeKeys = savedEdges
        .map((edge) => edgeKey(edge.from, edge.to, edge.condition))
        .sort();
      expect(savedEdgeKeys).toEqual(originalEdgeKeys);

      // Configs: no data loss outside the documented normalizations.
      // Partial decisions are stripped (approvalMode is never Enforce in
      // the live set); subtypes without a config handler drop their config
      // (official); user-approval configs gain the official assignee
      // defaults.
      for (const originalNode of originalNodes) {
        if (
          originalNode.type === 'startEvent' ||
          originalNode.type === 'endEvent'
        ) {
          continue;
        }
        const savedNode = savedByName.get(originalNode.name);
        expect(savedNode).toBeDefined();
        const savedConfig = (savedNode!.config ?? {}) as Record<
          string,
          unknown
        >;
        expect(savedConfig.allowPartialDecisions).toBeUndefined();
        if (!CONFIG_PRESERVING_SUBTYPES.has(savedNode!.subType)) {
          for (const key of Object.keys(originalNode.config ?? {})) {
            expect(savedConfig[key]).toBeUndefined();
          }
          continue;
        }
        const expected: Record<string, unknown> = {
          ...(originalNode.config ?? {}),
        };
        delete expected.allowPartialDecisions;
        if (
          originalNode.type === 'userTask' ||
          originalNode.subType === 'userApprovalTask'
        ) {
          const assignees = (expected.assignees ?? {}) as Record<
            string,
            unknown
          >;
          expected.assignees = {
            ...assignees,
            addReviewers: assignees.addReviewers ?? true,
            addOwners: assignees.addOwners ?? false,
            emptyAssigneeStrategy: assignees.emptyAssigneeStrategy ?? 'none',
            candidates: assignees.candidates ?? [],
          };
          expected.approvalThreshold = expected.approvalThreshold ?? 1;
          expected.rejectionThreshold = expected.rejectionThreshold ?? 1;
        }
        for (const [key, value] of Object.entries(expected)) {
          expect(savedConfig[key]).toEqual(value);
        }
      }

      // Input/output follow the official per-subtype contract, and every
      // namespace-map entry except updatedBy survives with the same value;
      // every map value resolves to 'global' or a node in the definition.
      const savedNames = new Set(savedNodes.map((n) => n.name));
      for (const originalNode of originalNodes) {
        if (
          originalNode.type === 'startEvent' ||
          originalNode.type === 'endEvent'
        ) {
          continue;
        }
        const savedNode = savedByName.get(originalNode.name)!;
        if (savedNode.subType === 'userApprovalTask') {
          expect(savedNode.input).toEqual(['relatedEntity']);
          expect(savedNode.output).toEqual(['updatedBy']);
        } else if (SINGLE_INPUT_SUBTYPES.includes(savedNode.subType)) {
          expect(savedNode.input).toEqual(['relatedEntity']);
        } else {
          expect(savedNode.input).toEqual(['relatedEntity', 'updatedBy']);
        }
        if (savedNode.subType === 'checkEntityAttributesTask') {
          expect(savedNode.output).toEqual(['result']);
        } else if (savedNode.subType === 'checkChangeDescriptionTask') {
          expect(savedNode.output).toEqual(['result']);
        } else if (savedNode.subType === 'dataCompletenessTask') {
          expect(savedNode.output).toEqual([
            'completenessScore',
            'qualityBand',
            'filledFieldsCount',
            'totalFieldsCount',
            'missingFields',
            'filledFields',
            'result',
          ]);
        }
        const originalMap = originalNode.inputNamespaceMap ?? {};
        const savedMap = savedNode.inputNamespaceMap ?? {};
        for (const [key, value] of Object.entries(originalMap)) {
          if (key === 'updatedBy') {
            continue;
          }
          expect(savedMap[key]).toBe(value);
        }
        for (const value of Object.values(savedMap)) {
          expect(value === 'global' || savedNames.has(value)).toBe(true);
        }
      }
    });
  }
});
