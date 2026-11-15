/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import TaskDetailView from './TaskDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastMatchingFetch(predicate: (url: string, init?: RequestInit) => boolean) {
  const mock = vi.mocked(fetch);
  const match = [...mock.mock.calls].reverse().find((call) => predicate(String(call[0]), call[1]));
  if (!match) {
    throw new Error('no matching fetch');
  }
  return { url: String(match[0]), init: match[1] };
}

async function mountView(sessionUser?: { id: string; name: string }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  if (sessionUser) {
    useAuthStore().user = sessionUser;
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tasks/:id', name: 'task', component: TaskDetailView, props: true },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push('/tasks/t1');
  await router.isReady();
  const wrapper = mount(TaskDetailView, {
    props: { id: 't1' },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper };
}

describe('TaskDetailView data access request', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tasks/t1')) {
          return jsonResponse({
            id: 't1',
            name: 'dar-orders',
            type: 'DataAccessRequest',
            status: 'Approved',
            assignees: [{ id: 'u1', type: 'user', name: 'amy' }],
            comments: [],
            payload: {
              accessType: 'Masked',
              requestedAccess: 'Read',
              reason: 'audit',
              ticketId: 'AUD-7',
              manualGrantReason: 'partial automatic grant',
            },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the DAR payload and the awaiting-grant note instead of the terminal note', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="task-dar-payload-title"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Masked');
    expect(wrapper.text()).toContain('audit');
    expect(wrapper.text()).toContain('AUD-7');
    expect(wrapper.text()).toContain('partial automatic grant');
    expect(wrapper.find('[data-testid="task-dar-approved-note"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="task-terminal-note"]').exists()).toBe(false);
  });
});

describe('TaskDetailView', () => {
  let taskGrant: 'deny' | 'grant' = 'deny';

  beforeEach(() => {
    taskGrant = 'deny';
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/task/t1')) {
          if (taskGrant === 'grant') {
            return jsonResponse({
              resource: 'task',
              permissions: [{ operation: 'EditAll', access: 'allow' }],
            });
          }
          return new Response('not found', { status: 404 });
        }
        if (init?.method === 'POST' && url.includes('/resolve')) {
          return jsonResponse({ id: 't1', name: 'review-orders', status: 'Completed', comments: [] });
        }
        if (init?.method === 'POST' && url.includes('/close')) {
          return jsonResponse({ id: 't1', name: 'review-orders', status: 'Closed', comments: [] });
        }
        if (init?.method === 'POST' && url.includes('/comments')) {
          return jsonResponse({
            id: 't1',
            name: 'review-orders',
            status: 'Open',
            comments: [{ id: 'cm1', message: 'noted' }],
          });
        }
        if (init?.method === 'PATCH' && url.includes('/api/v1/tasks/t1')) {
          const ops = JSON.parse(String(init.body ?? '[]')) as Array<Record<string, unknown>>;
          const descriptionOp = ops.find((op) => op.path === '/description');
          const assigneesOp = ops.find((op) => op.path === '/assignees');
          return jsonResponse({
            id: 't1',
            name: 'review-orders',
            status: 'Open',
            description: descriptionOp ? descriptionOp.value : 'old desc',
            assignees: assigneesOp
              ? (assigneesOp.value as Array<Record<string, unknown>>).map((ref) => ({
                  id: ref.id,
                  type: ref.type,
                  name: 'amy',
                }))
              : [{ id: 'u1', type: 'user', name: 'amy' }],
            comments: [],
          });
        }
        if (url.includes('/api/v1/tasks/t1')) {
          return jsonResponse({
            id: 't1',
            name: 'review-orders',
            status: 'Open',
            type: 'CustomTask',
            description: 'old desc',
            assignees: [{ id: 'u1', type: 'user', name: 'amy' }],
            comments: [],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads a task and can resolve and comment', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('review-orders');
    expect(wrapper.text()).toContain('Open');
    expect(wrapper.find('[data-testid="resolve-task"]').exists()).toBe(true);

    await wrapper.find('[data-testid="resolve-task"]').trigger('click');
    await flushPromises();
    const resolve = lastMatchingFetch((url, init) => url.includes('/resolve') && init?.method === 'POST');
    expect(JSON.parse(String(resolve.init?.body))).toMatchObject({ resolutionType: 'Completed' });
    expect(wrapper.text()).toContain('Completed');

    await wrapper.find('[data-testid="task-comment"]').setValue('noted');
    await wrapper.find('[data-testid="add-task-comment"]').trigger('click');
    await flushPromises();
    const comment = lastMatchingFetch((url, init) => url.includes('/comments') && init?.method === 'POST');
    expect(JSON.parse(String(comment.init?.body))).toEqual({ message: 'noted' });
    expect(wrapper.text()).toContain('noted');
  });

  it('renders the task delete button (R7)', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="delete-task"]').exists()).toBe(true);
  });

  it('disables action buttons for a non-assignee non-admin without a grant (P1)', async () => {
    const { wrapper } = await mountView({ id: 'u9', name: 'bob' });
    expect((wrapper.find('[data-testid="resolve-task"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables action buttons for a non-assignee non-admin with an EditAll grant (P1)', async () => {
    taskGrant = 'grant';
    const { wrapper } = await mountView({ id: 'u9', name: 'bob' });
    expect((wrapper.find('[data-testid="resolve-task"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('closes the task from the action menu and then marks it terminal', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="task-actions-menu"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const closeItem = document.querySelector('[data-testid="task-action-menu-item-close"]');
    expect(closeItem).not.toBeNull();
    (closeItem as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const close = lastMatchingFetch((url, init) => url.includes('/close') && init?.method === 'POST');
    expect(close).toBeDefined();
    expect(wrapper.text()).toContain('Closed');
    expect(wrapper.find('[data-testid="task-terminal-note"]').exists()).toBe(true);
  });

  it('edits the description through PATCH /v1/tasks/{id}', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="task-actions-menu"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const editItem = document.querySelector('[data-testid="task-action-menu-item-edit"]');
    expect(editItem).not.toBeNull();
    (editItem as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const textarea = document.querySelector('[data-testid="task-description-edit"]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    textarea.value = 'new desc';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    const save = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Save',
    ) as HTMLElement;
    expect(save).toBeDefined();
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const patch = lastMatchingFetch((url, init) => url.includes('/api/v1/tasks/t1') && init?.method === 'PATCH');
    expect(JSON.parse(String(patch.init?.body ?? '[]'))).toEqual([
      { op: 'replace', path: '/description', value: 'new desc' },
    ]);
    expect(patch.init?.headers).toMatchObject({ 'Content-Type': 'application/json-patch+json' });
    expect(wrapper.text()).toContain('new desc');
  });

  it('re-assigns through PATCH /v1/tasks/{id} with the prefilled assignees', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="task-actions-menu"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const reassignItem = document.querySelector('[data-testid="task-action-menu-item-re-assign"]');
    expect(reassignItem).not.toBeNull();
    (reassignItem as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(document.querySelector('[data-testid="task-assignees-edit"]')).not.toBeNull();
    const save = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Save',
    ) as HTMLElement;
    expect(save).toBeDefined();
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const patch = lastMatchingFetch((url, init) => url.includes('/api/v1/tasks/t1') && init?.method === 'PATCH');
    expect(JSON.parse(String(patch.init?.body ?? '[]'))).toEqual([
      { op: 'replace', path: '/assignees', value: [{ id: 'u1', type: 'user' }] },
    ]);
  });
});

describe('TaskDetailView suggestion and transitions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/task/t1')) {
          return new Response('not found', { status: 404 });
        }
        if (init?.method === 'POST' && url.includes('/resolve')) {
          return jsonResponse({ id: 't1', name: 'review-orders', status: 'Approved', comments: [] });
        }
        if (url.includes('/api/v1/tasks/t1')) {
          return jsonResponse({
            id: 't1',
            name: 'review-orders',
            status: 'Open',
            type: 'DescriptionUpdate',
            description: 'old desc',
            assignees: [{ id: 'u1', type: 'user', name: 'amy' }],
            comments: [],
            payload: { currentDescription: 'old desc', newDescription: 'new desc' },
            availableTransitions: [
              {
                id: 'approve',
                label: 'Approve',
                resolutionType: 'Approved',
                targetStageId: 'approved',
                targetTaskStatus: 'Approved',
              },
              {
                id: 'request-info',
                label: 'Request info',
                requiresComment: true,
                targetStageId: 'info',
                targetTaskStatus: 'Open',
              },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('accepts the suggestion with Approved plus the normalized newValue', async () => {
    const { wrapper } = await mountView({ id: 'u1', name: 'amy' });
    expect(wrapper.find('[data-testid="task-suggestion-value"]').text()).toContain('new desc');
    await wrapper.find('[data-testid="task-accept-suggestion"]').trigger('click');
    await flushPromises();
    const resolve = lastMatchingFetch((url, init) => url.includes('/resolve') && init?.method === 'POST');
    expect(JSON.parse(String(resolve.init?.body))).toEqual({
      resolutionType: 'Approved',
      newValue: 'new desc',
    });
  });

  it('runs the selected workflow transition with its transitionId and resolutionType', async () => {
    const { wrapper } = await mountView({ id: 'u1', name: 'amy' });
    expect(wrapper.find('[data-testid="task-transition-run"]').text()).toContain('Approve');
    await wrapper.find('[data-testid="task-transition-run"]').trigger('click');
    await flushPromises();
    const resolve = lastMatchingFetch((url, init) => url.includes('/resolve') && init?.method === 'POST');
    expect(JSON.parse(String(resolve.init?.body))).toEqual({
      resolutionType: 'Approved',
      transitionId: 'approve',
    });
  });
});

describe('TaskDetailView recognizer feedback', () => {
  const FEEDBACK_PAYLOAD = {
    field: 'tags',
    fieldPath: 'columns.email.tags',
    currentValue: '[]',
    suggestedValue: '[{"tagFQN":"PII.Sensitive"}]',
    feedback: {
      entityLink: '<#E::table::db.schema.orders::columns::email>',
      tagFQN: 'PII.Sensitive',
      feedbackType: 'FALSE_POSITIVE',
      userComments: 'This is not a sensitive field',
      createdBy: { id: 'u2', type: 'user', name: 'reporter', displayName: 'Rae Porter' },
      createdAt: 1701686127533,
      sampleValues: ['secret@example.com'],
    },
    recognizer: { recognizerId: 'r1', recognizerName: 'PII Recognizer', score: 0.9 },
  };

  let taskFixture: Record<string, unknown> = {};

  beforeEach(() => {
    taskFixture = {
      id: 't1',
      name: 'feedback-orders',
      status: 'Open',
      type: 'RecognizerFeedbackApproval',
      category: 'Review',
      assignees: [{ id: 'u1', type: 'user', name: 'amy' }],
      createdBy: { id: 'u2', type: 'user', name: 'reporter' },
      comments: [],
      payload: FEEDBACK_PAYLOAD,
    };
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/task/t1')) {
          return new Response('not found', { status: 404 });
        }
        if (init?.method === 'POST' && url.includes('/resolve')) {
          return jsonResponse({ id: 't1', name: 'feedback-orders', status: 'Approved', comments: [] });
        }
        if (url.includes('/api/v1/tasks/t1')) {
          return jsonResponse(taskFixture);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  async function mountAs(user?: { id: string; name: string; teams?: Array<{ id: string; name: string; type: string }>; isAdmin?: boolean }) {
    const { wrapper } = await mountView();
    if (user) {
      useAuthStore().user = user;
      await flushPromises();
    }
    return { wrapper };
  }

  it('renders the feedback detail instead of the suggestion section and generic resolve affordances', async () => {
    const { wrapper } = await mountAs({ id: 'u1', name: 'amy' });
    expect(wrapper.find('[data-testid="feedback-approval-task"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('PII Recognizer');
    expect(wrapper.text()).toContain('False Positive');
    expect(wrapper.text()).toContain('This is not a sensitive field');
    expect(wrapper.text()).not.toContain('PII.Sensitive');
    expect(wrapper.text()).not.toContain('secret@example.com');
    expect(wrapper.find('[data-testid="task-suggestion-title"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-suggestion-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="resolve-task"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Resolve this task.');
    expect(wrapper.find('[data-testid="feedback-approve-reject"]').exists()).toBe(true);
  });

  it('approves with the approved sentinel and the raw payload echo on the primary press', async () => {
    const { wrapper } = await mountAs({ id: 'u1', name: 'amy' });
    const [primary] = wrapper.find('[data-testid="feedback-approve-reject"]').findAll('button');
    await primary.trigger('click');
    await flushPromises();
    const resolve = lastMatchingFetch((url, init) => url.includes('/resolve') && init?.method === 'POST');
    const body = JSON.parse(String(resolve.init?.body)) as Record<string, unknown>;
    expect(body.resolutionType).toBe('Approved');
    expect(body.newValue).toBe('approved');
    expect(body.payload).toEqual(FEEDBACK_PAYLOAD);
  });

  it('rejects with the rejected sentinel and no payload from the split-button menu', async () => {
    const { wrapper } = await mountAs({ id: 'u1', name: 'amy' });
    const [, caret] = wrapper.find('[data-testid="feedback-approve-reject"]').findAll('button');
    await caret.trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const rejectItem = document.querySelector('[data-testid="feedback-action-reject"]');
    expect(rejectItem).not.toBeNull();
    (rejectItem as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const resolve = lastMatchingFetch((url, init) => url.includes('/resolve') && init?.method === 'POST');
    expect(JSON.parse(String(resolve.init?.body))).toEqual({
      resolutionType: 'Rejected',
      newValue: 'rejected',
    });
  });

  it('disables the split button for an admin who is not a reviewer', async () => {
    const { wrapper } = await mountAs({ id: 'u9', name: 'bob', isAdmin: true });
    const [primary] = wrapper.find('[data-testid="feedback-approve-reject"]').findAll('button');
    expect((primary.element as HTMLButtonElement).disabled).toBe(true);
    await primary.trigger('click');
    await flushPromises();
    expect(
      [...vi.mocked(fetch).mock.calls].some(
        (call) => String(call[0]).includes('/resolve') && call[1]?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('enables the split button for a team-member non-creator and disables it for a team-member creator', async () => {
    taskFixture = {
      ...taskFixture,
      assignees: [{ id: 'team1', type: 'team', name: 'DataGovernance' }],
    };
    const { wrapper } = await mountAs({
      id: 'u3',
      name: 'team-member',
      teams: [{ id: 'team1', name: 'DataGovernance', type: 'team' }],
    });
    const [primary] = wrapper.find('[data-testid="feedback-approve-reject"]').findAll('button');
    expect((primary.element as HTMLButtonElement).disabled).toBe(false);

    useAuthStore().user = {
      id: 'u2',
      name: 'reporter',
      teams: [{ id: 'team1', name: 'DataGovernance', type: 'team' }],
    };
    await flushPromises();
    const [primaryAfterChange] = wrapper
      .find('[data-testid="feedback-approve-reject"]')
      .findAll('button');
    expect((primaryAfterChange.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('suppresses resolve/close/view menu items for feedback tasks but keeps edit and re-assign', async () => {
    const { wrapper } = await mountAs({ id: 'u1', name: 'amy' });
    await wrapper.find('[data-testid="task-actions-menu"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(document.querySelector('[data-testid="task-action-menu-item-resolve"]')).toBeNull();
    expect(document.querySelector('[data-testid="task-action-menu-item-close"]')).toBeNull();
    expect(document.querySelector('[data-testid="task-action-menu-item-view"]')).toBeNull();
    expect(document.querySelector('[data-testid="task-action-menu-item-edit"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="task-action-menu-item-re-assign"]')).not.toBeNull();
  });

  it('treats a DataQualityReview task with a feedback payload the same way', async () => {
    taskFixture = { ...taskFixture, type: 'DataQualityReview' };
    const { wrapper } = await mountAs({ id: 'u1', name: 'amy' });
    expect(wrapper.find('[data-testid="feedback-approval-task"]').exists()).toBe(true);
    const [primary] = wrapper.find('[data-testid="feedback-approve-reject"]').findAll('button');
    await primary.trigger('click');
    await flushPromises();
    const resolve = lastMatchingFetch((url, init) => url.includes('/resolve') && init?.method === 'POST');
    const body = JSON.parse(String(resolve.init?.body)) as Record<string, unknown>;
    expect(body.newValue).toBe('approved');
    expect(body.payload).toEqual(FEEDBACK_PAYLOAD);
  });

  it('falls through to the generic surface for a recognizer task with no feedback payload', async () => {
    taskFixture = {
      ...taskFixture,
      payload: { currentValue: '[]', suggestedValue: '[{"tagFQN":"PII.Sensitive"}]' },
    };
    const { wrapper } = await mountAs({ id: 'u1', name: 'amy' });
    expect(wrapper.find('[data-testid="feedback-approval-task"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="feedback-approve-reject"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-suggestion-title"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="resolve-task"]').exists()).toBe(true);
  });

  it('shows the transition menu instead of the split button for a workflow-driven feedback task', async () => {
    taskFixture = {
      ...taskFixture,
      availableTransitions: [
        {
          id: 'approve',
          label: 'Approve',
          resolutionType: 'Approved',
          targetStageId: 'approved',
          targetTaskStatus: 'Approved',
        },
      ],
    };
    const { wrapper } = await mountAs({ id: 'u1', name: 'amy' });
    expect(wrapper.find('[data-testid="feedback-approval-task"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="feedback-approve-reject"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-transition-run"]').exists()).toBe(true);
  });

  it('still renders the feedback detail for a closed feedback task, with no split button', async () => {
    taskFixture = { ...taskFixture, status: 'Approved' };
    const { wrapper } = await mountAs({ id: 'u1', name: 'amy' });
    expect(wrapper.find('[data-testid="feedback-approval-task"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="feedback-approve-reject"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-terminal-note"]').exists()).toBe(true);
  });
});
