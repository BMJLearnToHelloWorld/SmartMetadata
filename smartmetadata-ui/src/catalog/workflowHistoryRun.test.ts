/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import type { WorkflowDefinitionDetail } from '@/api/workflows';
import {
  getLatestWorkflowRun,
  glossaryTermEntityLink,
  setsEntityStage,
  workflowHistoryTimeRange,
} from './workflowHistoryRun';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function definition(overrides: Partial<WorkflowDefinitionDetail>): WorkflowDefinitionDetail {
  return {
    id: 'wd1',
    name: 'approve-term',
    fullyQualifiedName: 'approve-term',
    ...overrides,
  };
}

describe('workflowHistoryRun', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('builds the glossary-term entity link pin uses to scope instances', () => {
    expect(glossaryTermEntityLink('Business.term')).toBe('<#E::glossaryTerm::Business.term>');
  });

  it('covers the last 180 days', () => {
    const now = 1700000000000;
    const range = workflowHistoryTimeRange(now);
    expect(range.endTs).toBe(now);
    expect(range.startTs).toBe(now - 180 * 24 * 60 * 60 * 1000);
  });

  it('setsEntityStage matches lifecycle configs and stage-setting nodes only', () => {
    expect(setsEntityStage(definition({ config: { lifecycle: true } }))).toBe(true);
    expect(
      setsEntityStage(
        definition({
          nodes: [
            { type: 'automatedTask', subType: 'setGlossaryTermStatusTask', name: 'approve', config: {} },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      setsEntityStage(
        definition({
          nodes: [
            { type: 'automatedTask', subType: 'setEntityAttributeTask', name: 'set', config: { fieldName: 'entityStatus' } },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      setsEntityStage(
        definition({
          nodes: [
            { type: 'automatedTask', subType: 'setEntityAttributeTask', name: 'set', config: { fieldName: 'description' } },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      setsEntityStage(
        definition({
          nodes: [{ type: 'automatedTask', subType: 'runAppTask', name: 'run', config: {} }],
        }),
      ),
    ).toBe(false);
    expect(setsEntityStage(definition({}))).toBe(false);
  });

  it('returns the newest stage-setting run with its states reversed', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/workflowInstances')) {
          return jsonResponse({
            data: [
              { id: 'i-new', status: 'SUCCESS', startedAt: 1699900000000, workflowDefinitionId: 'wd-event' },
              { id: 'i-old', status: 'SUCCESS', startedAt: 1699800000000, workflowDefinitionId: 'wd1' },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/workflowDefinitions/wd-event')) {
          return jsonResponse({
            id: 'wd-event',
            name: 'event-workflow',
            nodes: [{ type: 'automatedTask', subType: 'runAppTask', name: 'run' }],
          });
        }
        if (url.includes('/workflowDefinitions/wd1')) {
          return jsonResponse({
            id: 'wd1',
            name: 'approve-term',
            nodes: [{ type: 'automatedTask', subType: 'setGlossaryTermStatusTask', name: 'approve' }],
          });
        }
        if (url.includes('/workflowInstanceStates/approve-term/i-old')) {
          return jsonResponse({
            data: [
              { id: 's1', status: 'Finished', timestamp: 1699800001000, stage: { name: 'review' } },
              { id: 's2', status: 'Finished', timestamp: 1699800002000, stage: { name: 'approve' } },
            ],
            paging: { total: 2 },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    const run = await getLatestWorkflowRun('<#E::glossaryTerm::Business.term>', {
      startTs: 1000,
      endTs: 2000,
    });
    expect(run?.definition.name).toBe('approve-term');
    expect(run?.states.map((state) => state.id)).toEqual(['s2', 's1']);
    expect(urls[0]).toContain('/api/v1/governance/workflowInstances');
    expect(urls[0]).not.toContain('workflowDefinitionName=');
  });

  it('returns undefined when no stage-setting run exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workflowInstances')) {
          return jsonResponse({
            data: [{ id: 'i1', status: 'SUCCESS', startedAt: 1699900000000, workflowDefinitionId: 'wd-event' }],
            paging: { total: 1 },
          });
        }
        return jsonResponse({
          id: 'wd-event',
          name: 'event-workflow',
          nodes: [{ type: 'automatedTask', subType: 'runAppTask', name: 'run' }],
        });
      }),
    );
    await expect(
      getLatestWorkflowRun('<#E::glossaryTerm::Business.term>', { startTs: 1000, endTs: 2000 }),
    ).resolves.toBeUndefined();
  });

  it('pages until a stage-setting run turns up', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workflowInstances')) {
          calls += 1;
          if (calls === 1) {
            return jsonResponse({
              data: [{ id: 'i1', status: 'SUCCESS', startedAt: 1699900000000, workflowDefinitionId: 'wd-event' }],
              paging: { total: 2, after: 'cursor-1' },
            });
          }
          return jsonResponse({
            data: [{ id: 'i2', status: 'SUCCESS', startedAt: 1699800000000, workflowDefinitionId: 'wd1' }],
            paging: { total: 2 },
          });
        }
        if (url.includes('/workflowDefinitions/wd-event')) {
          return jsonResponse({
            id: 'wd-event',
            name: 'event-workflow',
            nodes: [{ type: 'automatedTask', subType: 'runAppTask', name: 'run' }],
          });
        }
        if (url.includes('/workflowDefinitions/wd1')) {
          return jsonResponse({
            id: 'wd1',
            name: 'approve-term',
            nodes: [{ type: 'automatedTask', subType: 'setGlossaryTermStatusTask', name: 'approve' }],
          });
        }
        return jsonResponse({ data: [], paging: { total: 0 } });
      }),
    );
    const run = await getLatestWorkflowRun('<#E::glossaryTerm::Business.term>', {
      startTs: 1000,
      endTs: 2000,
    });
    expect(calls).toBe(2);
    expect(run?.definition.name).toBe('approve-term');
  });
});
