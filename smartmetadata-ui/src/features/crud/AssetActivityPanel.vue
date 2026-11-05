<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Input, Table, Typography, message } from 'ant-design-vue';
import {
  addConversationReaction,
  addConversationReplyReaction,
  createConversationReply,
  listConversationReplies,
  removeConversationReaction,
  removeConversationReplyReaction,
} from '@/api/conversations';
import { useAuthStore } from '@/stores/auth';
import type { ActivityEvent, ActivityReaction, Conversation, ConversationReply } from '@/types/collaboration';

const props = defineProps<{
  activity: ActivityEvent[];
  conversations: Conversation[];
  collaborationError: string;
  entityType: string;
  fqn: string;
}>();

const { t } = useI18n();

const activityColumns = computed(() => [
  { title: t('asset.columns.eventType'), dataIndex: 'eventType', key: 'eventType', width: 180 },
  { title: t('asset.columns.summary'), key: 'summary' },
]);

/**
 * Official reaction types (openmetadata-spec type/reaction.json), the
 * same eight the activity-event detail uses. A click toggles: the
 * current user's own reaction per type decides add vs remove, and the
 * response echoes back into local state (official conversationsAPI
 * PUT/DELETE both return the updated conversation / reply).
 */
const REACTION_TYPES = ['thumbsUp', 'thumbsDown', 'hooray', 'laugh', 'confused', 'heart', 'rocket', 'eyes'] as const;
const REACTION_GLYPHS: Record<string, string> = {
  thumbsUp: '👍',
  thumbsDown: '👎',
  hooray: '🎉',
  laugh: '😄',
  confused: '😕',
  heart: '❤️',
  rocket: '🚀',
  eyes: '👀',
};

const localConversations = ref<Conversation[]>([]);
const expanded = ref<Record<string, boolean>>({});
const replyDrafts = ref<Record<string, string>>({});
const repliesLoading = ref<Record<string, boolean>>({});
const reacting = ref(false);

watch(
  () => props.conversations,
  (next) => {
    localConversations.value = next.map((item) => ({
      ...item,
      replies: [...(item.replies ?? [])],
      reactions: [...(item.reactions ?? [])],
    }));
  },
  { immediate: true },
);

const currentUserId = computed(() => useAuthStore().user?.id || '');

function reactionGroups(reactions: ActivityReaction[] | undefined): { type: string; count: number; own: boolean }[] {
  const byType = new Map<string, { type: string; count: number; own: boolean }>();
  for (const reaction of reactions ?? []) {
    const entry = byType.get(reaction.reactionType) ?? { type: reaction.reactionType, count: 0, own: false };
    entry.count += 1;
    if (currentUserId.value && reaction.user?.id === currentUserId.value) {
      entry.own = true;
    }
    byType.set(reaction.reactionType, entry);
  }
  return [...byType.values()];
}

function replaceConversation(next: Conversation): void {
  localConversations.value = localConversations.value.map((item) =>
    item.id === next.id
      ? { ...next, replies: [...(next.replies ?? [])], reactions: [...(next.reactions ?? [])] }
      : item,
  );
}

function replaceReply(conversationId: string, next: ConversationReply): void {
  localConversations.value = localConversations.value.map((item) =>
    item.id === conversationId
      ? {
          ...item,
          replies: (item.replies ?? []).map((reply) =>
            reply.id === next.id ? { ...next, reactions: [...(next.reactions ?? [])] } : reply,
          ),
        }
      : item,
  );
}

async function onToggleConversationReaction(conversation: Conversation, reactionType: string): Promise<void> {
  if (reacting.value) {
    return;
  }
  reacting.value = true;
  try {
    const own = reactionGroups(conversation.reactions).find((group) => group.type === reactionType)?.own ?? false;
    const next = own
      ? await removeConversationReaction(conversation.id, reactionType)
      : await addConversationReaction(conversation.id, reactionType);
    replaceConversation(next);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.conversations.reactionFailed'));
  } finally {
    reacting.value = false;
  }
}

async function onToggleReply(
  conversationId: string,
  replyId: string,
  reactionType: string,
): Promise<void> {
  if (reacting.value) {
    return;
  }
  reacting.value = true;
  try {
    const conversation = localConversations.value.find((item) => item.id === conversationId);
    const reply = conversation?.replies?.find((item) => item.id === replyId);
    const own = reactionGroups(reply?.reactions).find((group) => group.type === reactionType)?.own ?? false;
    const next = own
      ? await removeConversationReplyReaction(conversationId, replyId, reactionType)
      : await addConversationReplyReaction(conversationId, replyId, reactionType);
    replaceReply(conversationId, next);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.conversations.reactionFailed'));
  } finally {
    reacting.value = false;
  }
}

async function onToggleReplies(conversation: Conversation): Promise<void> {
  const next = !expanded.value[conversation.id];
  expanded.value = { ...expanded.value, [conversation.id]: next };
  if (!next || (conversation.replies ?? []).length > 0 || repliesLoading.value[conversation.id]) {
    return;
  }
  repliesLoading.value = { ...repliesLoading.value, [conversation.id]: true };
  try {
    const page = await listConversationReplies(conversation.id);
    localConversations.value = localConversations.value.map((item) =>
      item.id === conversation.id ? { ...item, replies: page.data } : item,
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.conversations.repliesFailed'));
  } finally {
    repliesLoading.value = { ...repliesLoading.value, [conversation.id]: false };
  }
}

async function onReply(conversation: Conversation): Promise<void> {
  const draft = (replyDrafts.value[conversation.id] ?? '').trim();
  if (!draft || reacting.value) {
    return;
  }
  reacting.value = true;
  try {
    const reply = await createConversationReply(conversation.id, { message: draft });
    localConversations.value = localConversations.value.map((item) =>
      item.id === conversation.id
        ? { ...item, replies: [...(item.replies ?? []), reply], replyCount: (item.replyCount ?? 0) + 1 }
        : item,
    );
    replyDrafts.value = { ...replyDrafts.value, [conversation.id]: '' };
    expanded.value = { ...expanded.value, [conversation.id]: true };
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.conversations.replyFailed'));
  } finally {
    reacting.value = false;
  }
}
</script>

<template>
  <div>
    <Typography.Paragraph type="secondary">
      {{ t('asset.activityLead', { type: entityType, fqn }) }}
    </Typography.Paragraph>
    <Alert
      v-if="collaborationError"
      type="warning"
      show-icon
      :message="collaborationError"
      class="detail__alert"
    />
    <Table
      row-key="id"
      data-testid="asset-activity-table"
      :columns="activityColumns"
      :data-source="activity"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'summary'">
          {{ (record as ActivityEvent).summary || (record as ActivityEvent).fieldName || '—' }}
        </template>
      </template>
    </Table>
    <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.conversationsTitle') }}</Typography.Title>
    <Typography.Paragraph type="secondary">
      {{ t('asset.conversationsLead', { type: entityType, fqn }) }}
    </Typography.Paragraph>
    <div v-if="!localConversations.length" data-testid="asset-conversations-empty">
      {{ t('asset.conversationsEmpty') }}
    </div>
    <div
      v-for="conversation in localConversations"
      :key="conversation.id"
      :data-testid="`asset-conversation-${conversation.id}`"
      class="conversation"
    >
      <Typography.Paragraph>
        {{ conversation.message || '—' }}
      </Typography.Paragraph>
      <Typography.Text type="secondary">
        {{ conversation.createdBy?.displayName || conversation.createdBy?.name || '' }}
        · {{ t('asset.columns.replies') }}: {{ conversation.replyCount ?? conversation.replies.length }}
      </Typography.Text>
      <div class="conversation__reactions">
        <Button
          v-for="reactionType in REACTION_TYPES"
          :key="reactionType"
          size="small"
          :type="reactionGroups(conversation.reactions).find((group) => group.type === reactionType)?.own ? 'primary' : 'default'"
          :loading="reacting"
          :data-testid="`conversation-reaction-${conversation.id}-${reactionType}`"
          @click="onToggleConversationReaction(conversation, reactionType)"
        >
          {{ REACTION_GLYPHS[reactionType] }}
          {{ reactionGroups(conversation.reactions).find((group) => group.type === reactionType)?.count ?? 0 }}
        </Button>
        <Button
          size="small"
          :data-testid="`conversation-replies-toggle-${conversation.id}`"
          @click="onToggleReplies(conversation)"
        >
          {{ t('collaboration.conversations.replies') }}
        </Button>
      </div>
      <div v-if="expanded[conversation.id]" class="conversation__replies">
        <div
          v-for="reply in conversation.replies"
          :key="reply.id"
          :data-testid="`conversation-reply-${reply.id}`"
          class="conversation__reply"
        >
          <Typography.Paragraph>{{ reply.message }}</Typography.Paragraph>
          <div class="conversation__reactions">
            <Button
              v-for="reactionType in REACTION_TYPES"
              :key="reactionType"
              size="small"
              :type="reactionGroups(reply.reactions).find((group) => group.type === reactionType)?.own ? 'primary' : 'default'"
              :loading="reacting"
              :data-testid="`conversation-reply-reaction-${reply.id}-${reactionType}`"
              @click="onToggleReply(conversation.id, reply.id, reactionType)"
            >
              {{ REACTION_GLYPHS[reactionType] }}
              {{ reactionGroups(reply.reactions).find((group) => group.type === reactionType)?.count ?? 0 }}
            </Button>
          </div>
        </div>
        <Input.TextArea
          v-model:value="replyDrafts[conversation.id]"
          :rows="2"
          :data-testid="`conversation-reply-input-${conversation.id}`"
        />
        <Button
          type="primary"
          size="small"
          :loading="reacting"
          :data-testid="`conversation-reply-send-${conversation.id}`"
          @click="onReply(conversation)"
        >
          {{ t('collaboration.conversations.reply') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail__alert {
  margin-bottom: 16px;
}
.detail__schema-title {
  margin-top: 24px;
}
.conversation {
  border-top: 1px solid var(--sm-border, #eee);
  padding: 12px 0;
}
.conversation__reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.conversation__replies {
  margin-left: 16px;
}
.conversation__reply {
  margin: 8px 0;
}
</style>
