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
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { Conversation } from '@/types/collaboration';
import AssetActivityPanel from './AssetActivityPanel.vue';

const conversation: Conversation = {
  id: 'c1',
  about: '<#E::table::svc.db.orders>',
  message: 'please review',
  replyCount: 1,
  createdBy: { id: 'u1', name: 'amy', displayName: 'Amy' },
  replies: [{ id: 'r1', conversationId: 'c1', message: 'done', reactions: [] }],
  reactions: [],
};

vi.mock('@/api/conversations', () => ({
  addConversationReaction: vi.fn(async () => ({
    ...conversation,
    reactions: [{ reactionType: 'thumbsUp', user: { id: 'u9', name: 'tester' } }],
  })),
  addConversationReplyReaction: vi.fn(async () => ({
    ...conversation.replies[0],
    reactions: [{ reactionType: 'heart', user: { id: 'u9', name: 'tester' } }],
  })),
  createConversationReply: vi.fn(async (_id: string, body: { message: string }) => ({
    id: 'r2',
    conversationId: 'c1',
    message: body.message,
    reactions: [],
  })),
  listConversationReplies: vi.fn(async () => ({ data: conversation.replies, paging: { total: 1 } })),
  removeConversationReaction: vi.fn(),
  removeConversationReplyReaction: vi.fn(),
}));

import {
  addConversationReaction,
  addConversationReplyReaction,
  createConversationReply,
} from '@/api/conversations';

function mountPanel() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(AssetActivityPanel, {
    props: {
      activity: [],
      conversations: [conversation],
      collaborationError: '',
      entityType: 'table',
      fqn: 'svc.db.orders',
    },
    global: { plugins: [pinia, Antd, createTestI18n()] },
  });
}

describe('AssetActivityPanel conversations', () => {
  it('toggles a conversation reaction and echoes the updated reactions', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('[data-testid="conversation-reaction-c1-thumbsUp"]').trigger('click');
    await flushPromises();
    expect(addConversationReaction).toHaveBeenCalledWith('c1', 'thumbsUp');
    expect(wrapper.get('[data-testid="conversation-reaction-c1-thumbsUp"]').text()).toContain('1');
    wrapper.unmount();
  });

  it('shows replies and posts a new reply to the thread', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('[data-testid="conversation-replies-toggle-c1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="conversation-reply-r1"]').exists()).toBe(true);
    await wrapper.get('[data-testid="conversation-reply-input-c1"]').setValue('agreed');
    await wrapper.get('[data-testid="conversation-reply-send-c1"]').trigger('click');
    await flushPromises();
    expect(createConversationReply).toHaveBeenCalledWith('c1', { message: 'agreed' });
    expect(wrapper.text()).toContain('agreed');
    wrapper.unmount();
  });

  it('toggles a reply reaction', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('[data-testid="conversation-replies-toggle-c1"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="conversation-reply-reaction-r1-heart"]').trigger('click');
    await flushPromises();
    expect(addConversationReplyReaction).toHaveBeenCalledWith('c1', 'r1', 'heart');
    wrapper.unmount();
  });
});
