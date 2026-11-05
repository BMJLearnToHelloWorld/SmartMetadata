<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Alert, Button, Card, Form, Input, Select, Space, Tag, Typography, message} from 'ant-design-vue';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import {
  addActivityReaction,
  listActivityEvents,
  listActivityReplies,
  removeActivityReaction,
  replyToActivity,
} from '@/api/activity';
import { ACTIVITY_RANGE_PRESETS } from '@/catalog/collaborationTabs';
import { requiredField } from '@/features/crud/formRules';
import { createConversation } from '@/api/conversations';
import { assetLocation } from '@/catalog/entityRoutes';
import { toEntityLink } from '@/quality/entityLink';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type { OperationPermissions } from '@/api/permissions';
import type { ActivityEvent, ConversationReply } from '@/types/collaboration';

/** Official reaction types (openmetadata-spec type/reaction.json), with display glyphs. */
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

const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const loadingMore = ref(false);
const errorMessage = ref('');
const events = ref<ActivityEvent[]>([]);
const total = ref<number | undefined>();
const after = ref<string | undefined>();
const rangeDays = ref(7);
const typeFilter = ref('all');
const detailEvent = ref<ActivityEvent | null>(null);
const detailReplies = ref<ConversationReply[]>([]);
const repliesLoading = ref(false);
const replyMessage = ref('');
const replying = ref(false);
const reactionLoading = ref(false);

const currentUserId = computed(() => useAuthStore().user?.id || '');

/**
 * Dual line for feed writes (post/react/reply), keyed on the
 * about-entity: isAdminUser (first line) OR a view-or-better grant
 * on that entity via the permission API (second line, same client
 * as the debugger). The feed list itself stays open to any
 * authenticated user — official gates no feed page, it scopes by
 * entity access — so only the writes are gated, and only when an
 * entity link exists. A permission query that fails falls back to
 * allowing the write (the server still enforces conversation and
 * activity writes); an explicit deny hides the action.
 */
const isAdminUser = computed(() => usePermissionStore().isAdminUser);
function hasViewGrant(ops: OperationPermissions | null): boolean {
  return (
    ops?.ViewAll === true || ops?.ViewBasic === true || ops?.EditAll === true
  );
}
const detailEntityOps = ref<OperationPermissions | null>(null);
const detailEntityFailed = ref(false);
const canInteractWithDetail = computed(() => {
  const event = detailEvent.value;
  const fqn = event?.entity?.fullyQualifiedName || event?.entity?.name;
  if (!event?.entity?.type || !fqn) {
    return true;
  }
  if (detailEntityFailed.value) {
    return true;
  }
  return isAdminUser.value || hasViewGrant(detailEntityOps.value);
});

/**
 * Official Reactions grouping (openmetadata-ui/.../Reactions.tsx):
 * reactions grouped by type with their user lists; the current user's own
 * reaction per type decides whether a click adds or removes it.
 */
const reactionGroups = computed(() => {
  const byType = new Map<string, { type: string; count: number; own: boolean }>();
  for (const reaction of detailEvent.value?.reactions ?? []) {
    const entry = byType.get(reaction.reactionType) ?? { type: reaction.reactionType, count: 0, own: false };
    entry.count += 1;
    if (currentUserId.value && reaction.user?.id === currentUserId.value) {
      entry.own = true;
    }
    byType.set(reaction.reactionType, entry);
  }
  return REACTION_TYPES.map(
    (type) => byType.get(type) ?? { type, count: 0, own: false },
  );
});

async function loadReplies(eventId: string): Promise<void> {
  repliesLoading.value = true;
  try {
    const page = await listActivityReplies(eventId);
    detailReplies.value = page.data;
  } catch {
    detailReplies.value = [];
  } finally {
    repliesLoading.value = false;
  }
}

watch(detailEvent, (event) => {
  detailReplies.value = [];
  replyMessage.value = '';
  detailEntityOps.value = null;
  detailEntityFailed.value = false;
  if (event) {
    void loadReplies(event.id);
    const fqn = event.entity?.fullyQualifiedName || event.entity?.name;
    if (event.entity?.type && fqn) {
      void usePermissionStore()
        .getEntityPermissionByFqn(event.entity.type, fqn)
        .then((ops) => {
          detailEntityOps.value = ops;
          detailEntityFailed.value = false;
        })
        .catch(() => {
          detailEntityOps.value = null;
          detailEntityFailed.value = true;
        });
    }
  }
});

async function onToggleReaction(reactionType: string): Promise<void> {
  const event = detailEvent.value;
  if (!event || reactionLoading.value || !canInteractWithDetail.value) {
    return;
  }
  const own = reactionGroups.value.find((group) => group.type === reactionType)?.own ?? false;
  reactionLoading.value = true;
  try {
    const updated = own
      ? await removeActivityReaction(event.id, reactionType)
      : await addActivityReaction(event.id, reactionType);
    detailEvent.value = updated;
    const index = events.value.findIndex((item) => item.id === updated.id);
    if (index >= 0) {
      events.value[index] = updated;
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.activity.reactionFailed'));
  } finally {
    reactionLoading.value = false;
  }
}

async function onReply(): Promise<void> {
  const event = detailEvent.value;
  if (!event || !replyMessage.value.trim() || !canInteractWithDetail.value) {
    return;
  }
  replying.value = true;
  try {
    const reply = await replyToActivity(event.id, { message: replyMessage.value.trim() });
    detailReplies.value = [...detailReplies.value, reply];
    replyMessage.value = '';
    message.success(t('collaboration.activity.replyAdded'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.activity.replyFailed'));
  } finally {
    replying.value = false;
  }
}
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  entityType: 'table',
  entityFqn: '',
  message: '',
});

/** Create-post dual line: resolved when the drawer is open and an
 * entity FQN is entered; see the dual-line comment above. */
const createEntityOps = ref<OperationPermissions | null>(null);
const createEntityFailed = ref(false);
const createEntityLoading = ref(false);
const canPost = computed(() => {
  if (!form.entityFqn.trim()) {
    return true;
  }
  if (createEntityFailed.value) {
    return true;
  }
  if (createEntityLoading.value) {
    return false;
  }
  return isAdminUser.value || hasViewGrant(createEntityOps.value);
});
watch(
  [createOpen, () => form.entityType, () => form.entityFqn],
  async ([open, type, fqn]) => {
    if (!open || !fqn.trim()) {
      createEntityOps.value = null;
      createEntityFailed.value = false;
      createEntityLoading.value = false;
      return;
    }
    createEntityLoading.value = true;
    try {
      createEntityOps.value = await usePermissionStore().getEntityPermissionByFqn(
        type,
        fqn.trim(),
      );
      createEntityFailed.value = false;
    } catch {
      createEntityOps.value = null;
      createEntityFailed.value = true;
    } finally {
      createEntityLoading.value = false;
    }
  },
);

/**
 * Official merged-feed sort (ActivityFeedListV1New): timestamp descending,
 * id as tiebreak, missing timestamp sorts last (treated as 0).
 */
const sortedEvents = computed(() =>
  [...events.value].sort(
    (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0) || a.id.localeCompare(b.id),
  ),
);

/**
 * Type filter options come only from event types actually present on the
 * loaded page: /v1/activity has no eventType parameter, so this is a
 * client-side filter over the loaded page, never a claimed server filter.
 */
const typeOptions = computed(() => {
  const seen = new Set<string>();
  for (const event of events.value) {
    seen.add(event.eventType);
  }
  return [...seen].sort();
});

const visibleEvents = computed(() =>
  typeFilter.value === 'all'
    ? sortedEvents.value
    : sortedEvents.value.filter((event) => event.eventType === typeFilter.value),
);

function formatTime(value?: number): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

async function load(append = false): Promise<void> {
  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }
  errorMessage.value = '';
  try {
    const page = await listActivityEvents({
      days: rangeDays.value,
      limit: 50,
      ...(append && after.value ? { after: after.value } : {}),
    });
    events.value = append ? [...events.value, ...page.data] : page.data;
    total.value = page.total;
    after.value = page.after;
  } catch (error) {
    if (!append) {
      events.value = [];
    }
    errorMessage.value = error instanceof Error ? error.message : t('collaboration.activity.loadFailed');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function onRangeChange(): void {
  typeFilter.value = 'all';
  after.value = undefined;
  void load();
}

async function onCreate(): Promise<void> {
  if (!canPost.value) {
    return;
  }
  creating.value = true;
  try {
    await createConversation({
      message: form.message.trim(),
      about: toEntityLink(form.entityType, form.entityFqn),
    });
    createOpen.value = false;
    form.message = '';
    message.success(t('collaboration.activity.posted'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.activity.createFailed'));
  } finally {
    creating.value = false;
  }
}

function openAsset(event: ActivityEvent): void {
  const type = event.entity?.type;
  const fqn = event.entity?.fullyQualifiedName || event.entity?.name;
  if (!type || !fqn) {
    return;
  }
  void router.push(assetLocation(type, fqn));
}

function entityLabel(event: ActivityEvent): string {
  return event.entity?.fullyQualifiedName || event.entity?.name || '—';
}

function hasEntityLink(event: ActivityEvent): boolean {
  return Boolean(event.entity?.type && (event.entity?.fullyQualifiedName || event.entity?.name));
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="collab-head">
        <PageHeader :header="t('collaboration.activity.title')" :sub-header="t('collaboration.activity.lead')" />
        <Button type="primary" data-testid="create-conversation" @click="createOpen = true">
          {{ t('collaboration.activity.post') }}
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Space wrap>
        <Select v-model:value="rangeDays" data-testid="activity-range" style="width: 160px" @change="onRangeChange">
          <Select.Option v-for="preset in ACTIVITY_RANGE_PRESETS" :key="preset.key" :value="preset.days">
            {{ t(preset.labelKey) }}
          </Select.Option>
        </Select>
        <Select
          v-model:value="typeFilter"
          data-testid="activity-type-filter"
          style="width: 200px"
          :aria-label="t('collaboration.activity.typeFilter')"
        >
          <Select.Option value="all">{{ t('collaboration.activity.typeAll') }}</Select.Option>
          <Select.Option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</Select.Option>
        </Select>
      </Space>
      <div v-if="!loading && !visibleEvents.length && !errorMessage" data-testid="activity-empty">
        <Typography.Title :level="5">{{ t('collaboration.activity.emptyTitle') }}</Typography.Title>
        <Typography.Paragraph type="secondary">{{ t('collaboration.activity.emptyHint') }}</Typography.Paragraph>
      </div>
      <div v-else data-testid="activity-timeline" class="activity-timeline">
        <article
          v-for="event in visibleEvents"
          :key="event.id"
          class="activity-card"
          :data-testid="`activity-card-${event.id}`"
          @click="detailEvent = event"
        >
          <div class="activity-card__head">
            <span class="activity-card__dot" />
            <Typography.Text strong>
              {{ event.actor?.displayName || event.actor?.name || '—' }}
            </Typography.Text>
            <Tag>{{ event.eventType }}</Tag>
            <Typography.Text type="secondary">{{ formatTime(event.timestamp) }}</Typography.Text>
          </div>
          <Typography.Paragraph class="activity-card__summary">
            {{ event.summary || event.fieldName || '—' }}
          </Typography.Paragraph>
          <Typography.Text v-if="hasEntityLink(event)" type="secondary">
            <a href="#" @click.prevent.stop="openAsset(event)">{{ entityLabel(event) }}</a>
          </Typography.Text>
        </article>
      </div>
      <Typography.Text type="secondary">
        {{
          total !== undefined
            ? t('crud.shownOf', { shown: events.length, total })
            : t('crud.shown', { shown: events.length })
        }}
      </Typography.Text>
      <Button
        v-if="after && !loading"
        data-testid="activity-load-more"
        :loading="loadingMore"
        @click="load(true)"
      >
        {{ t('collaboration.activity.loadMore') }}
      </Button>
    </Space>
    <SmDrawer
      :open="createOpen"
      :title="t('collaboration.activity.createTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="creating"
      :ok-disabled="!canPost"
      @ok="onCreate"
    @cancel="createOpen = false"
    >
      <Form layout="vertical">
        <Form.Item :label="t('collaboration.activity.entityType')" :rules="requiredField(t, t('collaboration.activity.entityType'))">
          <Select v-model:value="form.entityType">
            <Select.Option value="table">table</Select.Option>
            <Select.Option value="topic">topic</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('collaboration.activity.fqn')" :rules="requiredField(t, t('collaboration.activity.fqn'))">
          <Input v-model:value="form.entityFqn" data-testid="conversation-fqn" />
        </Form.Item>
        <Form.Item :label="t('collaboration.activity.message')" :rules="requiredField(t, t('collaboration.activity.message'))">
          <Input.TextArea v-model:value="form.message" data-testid="conversation-message" :rows="3" />
        </Form.Item>
      </Form>
    </SmDrawer>
    <SmDrawer
      :open="detailEvent !== null"
      :title="t('collaboration.activity.detailTitle')"
      width-key="feed"
      test-id="activity-detail-drawer"
      :show-ok="false"
      :cancel-text="t('collaboration.activity.closeDetail')"
      @cancel="detailEvent = null"
    >
      <Space v-if="detailEvent" direction="vertical" size="middle" style="width: 100%">
        <Typography.Text strong>
          {{ detailEvent.actor?.displayName || detailEvent.actor?.name || '—' }}
        </Typography.Text>
        <Tag>{{ detailEvent.eventType }}</Tag>
        <Typography.Paragraph>{{ detailEvent.summary || detailEvent.fieldName || '—' }}</Typography.Paragraph>
        <Typography.Text v-if="hasEntityLink(detailEvent)" type="secondary">
          <a href="#" @click.prevent="openAsset(detailEvent)">{{ entityLabel(detailEvent) }}</a>
        </Typography.Text>
        <Typography.Text type="secondary">{{ formatTime(detailEvent.timestamp) }}</Typography.Text>
        <Typography.Paragraph v-if="detailEvent.oldValue !== undefined">
          {{ t('collaboration.activity.oldValue') }}: {{ detailEvent.oldValue }}
        </Typography.Paragraph>
        <Typography.Paragraph v-if="detailEvent.newValue !== undefined">
          {{ t('collaboration.activity.newValue') }}: {{ detailEvent.newValue }}
        </Typography.Paragraph>
        <Typography.Title :level="5">{{ t('collaboration.activity.reactions') }}</Typography.Title>
        <Space wrap>
          <Button
            v-for="group in reactionGroups"
            :key="group.type"
            size="small"
            :type="group.own ? 'primary' : 'default'"
            :loading="reactionLoading"
            :disabled="!canInteractWithDetail"
            :data-testid="`activity-reaction-${group.type}`"
            @click="onToggleReaction(group.type)"
          >
            {{ REACTION_GLYPHS[group.type] ?? group.type }} {{ group.count }}
          </Button>
        </Space>
        <Typography.Title :level="5">{{ t('collaboration.activity.replies') }}</Typography.Title>
        <div v-if="repliesLoading" data-testid="activity-replies-loading">
          <Typography.Text type="secondary">{{ t('collaboration.activity.repliesLoading') }}</Typography.Text>
        </div>
        <div v-else-if="!detailReplies.length" data-testid="activity-replies-empty">
          <Typography.Text type="secondary">{{ t('collaboration.activity.repliesEmpty') }}</Typography.Text>
        </div>
        <div v-else data-testid="activity-replies-list">
          <Typography.Paragraph v-for="reply in detailReplies" :key="reply.id">
            <Typography.Text strong>{{ reply.author?.displayName || reply.author?.name || '—' }}: </Typography.Text>
            {{ reply.message }}
          </Typography.Paragraph>
        </div>
        <Form layout="vertical">
          <Form.Item :label="t('collaboration.activity.reply')">
            <Input.TextArea v-model:value="replyMessage" data-testid="activity-reply" :rows="2" />
          </Form.Item>
          <Button
            type="primary"
            :loading="replying"
            :disabled="!replyMessage.trim() || !canInteractWithDetail"
            data-testid="activity-reply-submit"
            @click="onReply"
          >
            {{ t('collaboration.activity.replySubmit') }}
          </Button>
        </Form>
      </Space>
    </SmDrawer>
  </Card>
</template>

<style scoped>
.collab-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.activity-timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.activity-card {
  border: 1px solid var(--sm-border-secondary);
  border-left: 3px solid var(--sm-color-primary);
  border-radius: var(--sm-border-radius, 6px);
  padding: 8px 12px;
  background: var(--sm-bg-container);
  cursor: pointer;
}
.activity-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.activity-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sm-color-primary);
  flex-shrink: 0;
}
.activity-card__summary {
  margin: 4px 0 2px;
}
</style>
