<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Alert, Button, Card, Form, Input, Select, Space, Tag, Typography, message} from 'ant-design-vue';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { listActivityEvents } from '@/api/activity';
import { ACTIVITY_RANGE_PRESETS } from '@/catalog/collaborationTabs';
import { requiredField } from '@/features/crud/formRules';
import { createConversation } from '@/api/conversations';
import { assetLocation } from '@/catalog/entityRoutes';
import { toEntityLink } from '@/quality/entityLink';
import type { ActivityEvent } from '@/types/collaboration';

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
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  entityType: 'table',
  entityFqn: '',
  message: '',
});

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
  border-left: 3px solid var(--sm-color-primary, #1570ef);
  border-radius: var(--sm-border-radius, 6px);
  padding: 8px 12px;
  background: var(--sm-bg-container, #fff);
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
  background: var(--sm-color-primary, #1570ef);
  flex-shrink: 0;
}
.activity-card__summary {
  margin: 4px 0 2px;
}
</style>
