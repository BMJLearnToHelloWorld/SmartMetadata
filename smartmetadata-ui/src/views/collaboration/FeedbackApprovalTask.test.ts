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
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { CollaborationTask } from '@/types/collaboration';
import FeedbackApprovalTask from './FeedbackApprovalTask.vue';

function feedbackTask(
  overrides: Partial<CollaborationTask> & { id: string },
): CollaborationTask {
  return {
    assignees: [],
    comments: [],
    status: 'Open',
    type: 'RecognizerFeedbackApproval',
    feedbackPayload: {
      feedback: {
        entityLink: '<#E::table::db.schema.orders::columns::email>',
        feedbackType: 'FALSE_POSITIVE',
        userComments: 'This is **not** a sensitive field',
        createdBy: { id: 'u1', type: 'user', name: 'admin', displayName: 'Admin User' },
        createdAt: 1701686127533,
      },
      recognizerName: 'PII Recognizer',
    },
    ...overrides,
  };
}

async function mountComponent(task: CollaborationTask) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
      },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(FeedbackApprovalTask, {
    props: { task },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  return wrapper;
}

describe('FeedbackApprovalTask', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders exactly the six pin rows for a full feedback payload', async () => {
    const wrapper = await mountComponent(feedbackTask({ id: 't1' }));
    expect(wrapper.find('[data-testid="feedback-approval-task"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="feedback-recognizer"]').text()).toBe('PII Recognizer');
    expect(wrapper.find('[data-testid="feedback-type"]').text()).toBe('False Positive');
    expect(wrapper.find('[data-testid="feedback-comments"]').text()).toContain(
      'This is not a sensitive field',
    );
    expect(wrapper.find('[data-testid="feedback-submitted-by"]').text()).toBe('Admin User');
    expect(wrapper.find('[data-testid="feedback-submitted-on"]').text()).not.toBe('');
    const link = wrapper.find('[data-testid="feedback-entity-link"]');
    expect(link.text()).toBe('db.schema.orders.email');
    expect(link.attributes('href')).toContain('/assets/table/');
    const text = wrapper.text();
    expect(text).toContain('Recognizer');
    expect(text).toContain('Feedback Type');
    expect(text).toContain('Comments');
    expect(text).toContain('Submitted By');
    expect(text).toContain('Submitted On');
    expect(text).toContain('Entity Link');
  });

  it('renders markdown comments in full: the pin maxLength prop is dead', async () => {
    const longComment = `word `.repeat(40).trim();
    const wrapper = await mountComponent(
      feedbackTask({
        id: 't1',
        feedbackPayload: {
          feedback: { feedbackType: 'OVERLY_BROAD', userComments: longComment },
        },
      }),
    );
    expect(wrapper.find('[data-testid="feedback-comments"]').text()).toContain(longComment);
  });

  it('omits the recognizer row when the sibling recognizer name is absent', async () => {
    const wrapper = await mountComponent(
      feedbackTask({
        id: 't1',
        feedbackPayload: { feedback: { feedbackType: 'FALSE_POSITIVE' } },
      }),
    );
    expect(wrapper.find('[data-testid="feedback-recognizer"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="feedback-type"]').exists()).toBe(true);
  });

  it('omits the conditional rows when their values are absent', async () => {
    const wrapper = await mountComponent(
      feedbackTask({
        id: 't1',
        feedbackPayload: { feedback: { feedbackType: 'CONTEXT_SPECIFIC' } },
      }),
    );
    expect(wrapper.find('[data-testid="feedback-type"]').text()).toBe('Context Specific');
    expect(wrapper.find('[data-testid="feedback-comments"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="feedback-submitted-by"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="feedback-submitted-on"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="feedback-entity-link"]').exists()).toBe(false);
  });

  it('shows the raw value for an unmapped feedback type and an empty badge without one', async () => {
    const raw = await mountComponent(
      feedbackTask({
        id: 't1',
        feedbackPayload: { feedback: { feedbackType: 'SOMETHING_ELSE' } },
      }),
    );
    expect(raw.find('[data-testid="feedback-type"]').text()).toBe('SOMETHING_ELSE');
    const empty = await mountComponent(
      feedbackTask({ id: 't1', feedbackPayload: { feedback: {} } }),
    );
    expect(empty.find('[data-testid="feedback-type"]').exists()).toBe(true);
    expect(empty.find('[data-testid="feedback-type"]').text()).toBe('');
  });

  it('links to the entity FQN without a column suffix when the link names no column', async () => {
    const wrapper = await mountComponent(
      feedbackTask({
        id: 't1',
        feedbackPayload: {
          feedback: {
            entityLink: '<#E::table::db.schema.orders>',
            feedbackType: 'FALSE_POSITIVE',
          },
        },
      }),
    );
    expect(wrapper.find('[data-testid="feedback-entity-link"]').text()).toBe('db.schema.orders');
  });

  it('omits the entity-link row when the link does not parse', async () => {
    const wrapper = await mountComponent(
      feedbackTask({
        id: 't1',
        feedbackPayload: {
          feedback: { entityLink: 'not-a-link', feedbackType: 'FALSE_POSITIVE' },
        },
      }),
    );
    expect(wrapper.find('[data-testid="feedback-entity-link"]').exists()).toBe(false);
  });

  it('renders nothing without a feedback payload', async () => {
    const wrapper = await mountComponent(
      feedbackTask({ id: 't1', feedbackPayload: undefined }),
    );
    expect(wrapper.find('[data-testid="feedback-approval-task"]').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });
});
